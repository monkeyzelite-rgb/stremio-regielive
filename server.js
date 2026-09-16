const express = require('express');
const cors = require('cors');
const { getRouter } = require('stremio-addon-sdk');
const addonInterface = require('./addon');
const axios = require('axios');
const AdmZip = require('adm-zip');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');
const { clearSearchCache } = require('./lib/regielive');

const app = express();
app.use(cors()); // <--- FIX iOS: fara asta, AVPlayer (playerul nativ folosit de Stremio pe iOS) poate respinge tacit request-ul catre /download
app.use(express.static('public')); // <--- AICI AM ADAUGAT-O!

// Converteste SRT in WebVTT. AVPlayer (iOS) nu incarca fisiere .srt "goale" la fel de
// permisiv cum o fac mpv/exoplayer pe desktop/Android; WebVTT e formatul sigur cross-platform.
function srtToVtt(srtText) {
    let text = String(srtText).replace(/\r+/g, '').trim();
    // elimina codurile ASS reziduale ({\an8}, {\pos(...)}) ramase in unele .srt convertite
    // din ASS chiar de pe site-ul sursa - WebVTT nu le recunoaste, apar ca text literal peste replici
    text = text.replace(/\{\\[^}]*\}/g, '');
    // elimina liniile index (linie formata doar din cifre) de la inceputul fiecarui bloc
    text = text.replace(/^\d+\s*$/gm, '');
    // 00:00:20,000 --> 00:00:24,400  devine  00:00:20.000 --> 00:00:24.400
    text = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    // unele fisiere lipesc linia goala dintre ultimul cue real si urmatorul (des la cue-ul
    // promotional injectat de site) - fara ea WebVTT e malformat si AVPlayer (iOS) il respinge integral
    text = text.replace(/([^\n])\n(\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3})/g, '$1\n\n$2');
    return 'WEBVTT\n\n' + text.trim() + '\n';
}

// Converteste timpul ASS (H:MM:SS.cc, centisecunde) in format SRT (HH:MM:SS,mmm)
function parseAssTime(assTime) {
    const m = String(assTime).trim().match(/^(\d+):(\d{2}):(\d{2})\.(\d{2})$/);
    if (!m) return null;
    const [, h, mi, s, cs] = m;
    return `${h.padStart(2, '0')}:${mi}:${s},${cs}0`;
}

// Converteste un script ASS/SSA in SRT, citind ordinea coloanelor din linia "Format:"
// din sectiunea [Events] in loc sa presupuna o ordine fixa.
function assToSrt(assText) {
    const lines = String(assText).replace(/\r\n/g, '\n').split('\n');
    let inEvents = false;
    let startIdx = -1, endIdx = -1, textIdx = -1;
    const cues = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (/^\[.+\]$/.test(trimmed)) {
            inEvents = /^\[Events\]$/i.test(trimmed);
            continue;
        }
        if (!inEvents) continue;

        if (/^Format:/i.test(trimmed)) {
            const fields = trimmed.slice(trimmed.indexOf(':') + 1).split(',').map(f => f.trim().toLowerCase());
            startIdx = fields.indexOf('start');
            endIdx = fields.indexOf('end');
            textIdx = fields.indexOf('text');
            continue;
        }

        if (/^Dialogue:/i.test(trimmed) && textIdx >= 0) {
            const parts = trimmed.slice(trimmed.indexOf(':') + 1).split(',');
            if (parts.length <= textIdx) continue;
            const start = parseAssTime(parts[startIdx]);
            const end = parseAssTime(parts[endIdx]);
            if (!start || !end) continue;
            // textul e mereu ultimul camp, dar poate contine virgule - il reasamblam din tot ce ramane
            const cleanText = parts.slice(textIdx).join(',')
                .replace(/\\N|\\n/g, '\n')
                .replace(/\\h/g, ' ')
                .trim();
            if (!cleanText) continue;
            cues.push({ start, end, text: cleanText });
        }
    }

    // AVPlayer (iOS) e strict la ordinea cue-urilor; unele .ass au replici interlacate din layere diferite
    cues.sort((a, b) => a.start.localeCompare(b.start));
    return cues.map((c, i) => `${i + 1}\n${c.start} --> ${c.end}\n${c.text}\n`).join('\n');
}

// Recunoaste conventiile uzuale de numerotare episod intr-un nume de fisier din arhiva.
// Deliberat NU accepta un numar simplu fara context (ex: doar "05") - prea ambiguu (rezolutie/an/etc).
function entryMatchesEpisode(entryName, season, episode) {
    return new RegExp(`s0?${season}e0?${episode}(?!\\d)`, 'i').test(entryName) ||
           new RegExp(`\\b0?${season}x0?${episode}(?!\\d)`, 'i').test(entryName) ||
           new RegExp(`\\bep?(?:isod(?:e|ul)?)?[\\s._-]*0?${episode}(?!\\d)`, 'i').test(entryName);
}

const subtitlesCache = new Map();
const activeDownloads = new Map();
let globalDownloadQueue = Promise.resolve();
const API_KEY = 'API-BAZARR-YTZ-SL'; 

app.use(getRouter(addonInterface));

// Ruta de debug pentru golirea manuala a cache-urilor, fara redeploy.
// Seteaza variabila de mediu ADMIN_KEY pe Render (Settings -> Environment) cu o valoare a ta,
// altfel foloseste o valoare implicita - SCHIMB-O in Render inainte sa lasi ruta activa!
const ADMIN_KEY = process.env.ADMIN_KEY || 'schimba-cheia-asta';

app.get('/admin/clear-cache', (req, res) => {
    if (req.query.key !== ADMIN_KEY) {
        return res.status(403).send('Cheie invalidă.');
    }
    const downloadsCleared = subtitlesCache.size;
    subtitlesCache.clear();
    activeDownloads.clear();
    const searchesCleared = clearSearchCache();
    console.log(`[ADMIN] Cache golit manual: ${downloadsCleared} subtitrări descărcate, ${searchesCleared} căutări.`);
    res.send(`Cache golit: ${downloadsCleared} subtitrări descărcate + ${searchesCleared} căutări.`);
});

app.get(['/download', '/download.vtt'], async (req, res) => {
    const zipUrl = req.query.url;
    const sessionCookie = req.query.cookie || ''; // Citim Cookie-ul din URL
    const knownSeason = req.query.season || null;
    const knownEpisode = req.query.episode || null;

    if (!zipUrl) return res.status(400).send('URL lipsă');

    // Funcție ajutătoare pentru a trimite corect spre iOS și PC
    const sendSubtitleResponse = (text, responseObj) => {
        const vttText = srtToVtt(text);
        responseObj.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        responseObj.setHeader('Content-Disposition', 'inline; filename="subtitle.vtt"');
        responseObj.setHeader('Access-Control-Allow-Origin', '*');
        return responseObj.send(vttText);
    };

    if (subtitlesCache.has(zipUrl)) {
        return sendSubtitleResponse(subtitlesCache.get(zipUrl), res);
    }

    if (activeDownloads.has(zipUrl)) {
        try {
            const subtitleText = await activeDownloads.get(zipUrl);
            return sendSubtitleResponse(subtitleText, res);
        } catch (error) {
            return res.status(500).send('Eroare');
        }
    }

    const downloadTask = async () => {
        console.log(`\n[DESCARCARE] Extrag de pe RegieLive: ${zipUrl}`);
        const response = await axios({
            method: 'get',
            url: zipUrl,
            responseType: 'arraybuffer',
            headers: {
                'RL-API': API_KEY,
                'Cookie': sessionCookie, // <--- AICI PREZENTĂM SESIUNEA!
                'User-Agent': 'StremioRegieLiveAddon/1.0.0', // User agent cerut de admin
                'Accept': 'application/octet-stream, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://subtitrari.regielive.ro'
            }
        });

        let zip;
        try {
            zip = new AdmZip(response.data);
        } catch (e) {
            // Diagnostic: aflăm EXACT ce am primit înapoi, ca să nu mai ghicim
            const contentType = response.headers['content-type'] || 'necunoscut';
            const fullBody = Buffer.from(response.data).toString('utf8');
            const titleMatch = fullBody.match(/<title>([\s\S]*?)<\/title>/i);
            const pageTitle = titleMatch ? titleMatch[1].trim() : '(fără <title>)';

            const suspectKeywords = ['captcha', 'recaptcha', 'blocat', 'acces interzis', 'access denied',
                'prea multe', 'limita', 'limită', 'login', 'autentificare', 'sign in', 'cloudflare',
                'just a moment', 'checking your browser', 'eroare', 'not found', '404'];
            const foundKeywords = suspectKeywords.filter(k => fullBody.toLowerCase().includes(k));

            console.error('[X] Fișierul nu e ZIP!');
            console.error(`    Status HTTP: ${response.status}`);
            console.error(`    Content-Type primit: ${contentType}`);
            console.error(`    Dimensiune răspuns: ${response.data.length} bytes`);
            console.error(`    <title> pagină: ${pageTitle}`);
            console.error(`    Cuvinte-cheie suspecte găsite: ${foundKeywords.length ? foundKeywords.join(', ') : '(niciunul)'}`);
            console.error(`    Primele 1000 caractere din răspuns:\n${fullBody.slice(0, 1000)}`);
            throw new Error('NOT_A_ZIP');
        }

        const zipEntries = zip.getEntries();
        let subtitleEntry = null;
        let isAss = false;

        // 1. Căutăm fișierele .srt/.sub/.ass/.ssa. Dacă sunt mai multe (ex: film + bonus/
        // documentar/extra, sau pachet de sezon cu mai multe episoade), alegem pe cel care
        // se potrivește sezonului+episodului cerut (când le știm); altfel, cel mai mare ca
        // dimensiune - subtitrarea filmului întreg are mult mai multe rânduri decât un extra.
        const candidates = [];
        for (const entry of zipEntries) {
            const fileName = entry.entryName.toLowerCase();
            const baseName = fileName.split('/').pop();
            if (fileName.includes('__macosx') || baseName.startsWith('.')) continue;

            if (fileName.endsWith('.srt') || fileName.endsWith('.sub') || fileName.endsWith('.ass') || fileName.endsWith('.ssa')) {
                candidates.push(entry);
            }
        }

        if (candidates.length > 0) {
            if (knownSeason && knownEpisode) {
                const matched = candidates.filter(c => entryMatchesEpisode(c.entryName, knownSeason, knownEpisode));
                if (matched.length > 0) {
                    matched.sort((a, b) => (b.header.size || 0) - (a.header.size || 0));
                    subtitleEntry = matched[0];
                } else if (candidates.length > 1) {
                    // Mai multe fisiere, dar niciunul nu poate fi identificat cert ca fiind
                    // episodul cerut - refuzam sa ghicim dupa marime (poate alege gresit episodul).
                    const wanted = `S${String(knownSeason).padStart(2, '0')}E${String(knownEpisode).padStart(2, '0')}`;
                    console.error(`[ARHIVĂ] ${candidates.length} fișiere găsite, dar niciunul nu poate fi identificat cert ca ${wanted} — refuz să aleg după mărime: ${candidates.map(c => c.entryName).join(', ')}`);
                    throw new Error('EPISODE_NOT_IDENTIFIED');
                }
                // un singur candidat si season/episode cunoscute dar fara match explicit in nume ->
                // il folosim oricum mai jos (nicio ambiguitate posibila cu un singur fisier)
            }

            if (!subtitleEntry) {
                candidates.sort((a, b) => (b.header.size || 0) - (a.header.size || 0));
                subtitleEntry = candidates[0];
            }

            if (candidates.length > 1) {
                console.log(`[ARHIVĂ] ${candidates.length} fișiere de subtitrare găsite în ZIP, aleg:`);
                candidates.forEach((c) => {
                    const marker = c === subtitleEntry ? '  <-- ALES' : '';
                    console.log(`    "${c.entryName}" — ${c.header.size} bytes${marker}`);
                });
            }

            isAss = /\.(ass|ssa)$/i.test(subtitleEntry.entryName);
        }

        // 2. Dacă nu e .srt/.ass, căutăm alte formate suportate - dar validăm conținutul,
        // ca să nu luăm orbește un README/Citeste-ma.txt drept subtitrare.
        if (!subtitleEntry) {
            for (const entry of zipEntries) {
                const fileName = entry.entryName.toLowerCase();
                const baseName = fileName.split('/').pop();
                if (fileName.includes('__macosx') || baseName.startsWith('.') || !fileName.endsWith('.txt')) continue;

                const preview = entry.getData().slice(0, 200).toString('utf8');
                if (preview.includes('-->') || /^\d+\s*\r?\n/.test(preview)) {
                    subtitleEntry = entry;
                    break;
                }
            }
        }

        if (!subtitleEntry) throw new Error('NO_SRT');

        const rawData = subtitleEntry.getData();
        if (rawData.length === 0) throw new Error('SUBTITLE_EMPTY');

        const detected = jschardet.detect(rawData);

        let encoding = 'windows-1250';
        if (detected && detected.encoding) {
            const enc = detected.encoding.toLowerCase();
            if (enc.includes('utf') || enc === 'ascii') {
                encoding = enc;
            }
        }

        const decoded = iconv.decode(rawData, encoding);
        return isAss ? assToSrt(decoded) : decoded;
    };

    const queuedTask = new Promise((resolve, reject) => {
        globalDownloadQueue = globalDownloadQueue.then(async () => {
            try {
                // Am setat așteptarea la 1 secundă, conform cerințelor de Rate Limit
                await new Promise(r => setTimeout(r, 1500)); 
                const result = await downloadTask();
                resolve(result);
            } catch (e) {
                reject(e);
            }
        }).catch(() => {});
    });

    activeDownloads.set(zipUrl, queuedTask);

    try {
        const subtitleText = await queuedTask;
        subtitlesCache.set(zipUrl, subtitleText);
        activeDownloads.delete(zipUrl);

        return sendSubtitleResponse(subtitleText, res);

    } catch (error) {
        activeDownloads.delete(zipUrl);
        if (error.response && error.response.status === 429) {
            console.error('[X] BLOCAT DE REGIELIVE: Ai atins limita.');
        }
        res.status(500).send('Eroare internă.');
    }
});

const port = process.env.PORT || 7000;
app.listen(port, () => {
    console.log(`Addon-ul rulează la http://127.0.0.1:${port}/manifest.json`);
    require('./keep-alive');
});
