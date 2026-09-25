const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { getRouter } = require('stremio-addon-sdk');
const addonInterface = require('./addon');
const axios = require('axios');
const AdmZip = require('adm-zip');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');
const { clearSearchCache } = require('./lib/regielive');

// node-unrar-js isi incarca singur fisierul unrar.wasm de pe disc, printr-un mecanism
// intern (Emscripten) care construieste calea dinamic. Pe Render/local, cu tot
// node_modules-ul pe disc, mecanismul implicit functioneaza oricum - dar citim noi insine
// bytes-ii cu un require.resolve() static si-i dam explicit librariei, ca sa nu depindem
// deloc de acel mecanism intern (util si daca addon-ul se muta vreodata pe un mediu care
// impacheteaza altfel node_modules, ex. un build serverless).
let unrarWasmBinary = null;
try {
    const wasmPath = require.resolve('node-unrar-js/dist/js/unrar.wasm');
    const wasmBuffer = fs.readFileSync(wasmPath);
    unrarWasmBinary = wasmBuffer.buffer.slice(wasmBuffer.byteOffset, wasmBuffer.byteOffset + wasmBuffer.byteLength);
} catch (err) {
    console.warn(`[RAR] Nu am putut preincarca unrar.wasm (${err.message}) — folosesc mecanismul implicit al librăriei.`);
}

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

// Detectie + convertor MicroDVD (.sub cu timestamp-uri pe CADRE, nu pe timp:
// "{508}{583}text", "|" in loc de linie noua) -> SRT. Extensia ".sub" e ambigua -
// o poate avea si un .sub obisnuit (stil SubViewer, cu timp), care trece deja
// corect prin srtToVtt(); fara detectie de continut, un MicroDVD ar trece
// nedetectat si ar iesi ca WebVTT gol, fara niciun cue, fara nicio eroare vizibila.
// Fara header de fps in fisier, 23.976fps e standardul de facto pt. rip-urile
// din aceasta comunitate (era confirmata separat, in Mega-Subtitles-Addon).
const MICRODVD_DEFAULT_FPS = 23.976;

function isMicroDvdText(text) {
    const firstLine = String(text).replace(/^﻿/, '').trimStart().split(/\r?\n/, 1)[0] || '';
    return /^\{\d+\}\{\d+\}/.test(firstLine);
}

function microDvdToSrt(microDvdText, fps = MICRODVD_DEFAULT_FPS) {
    const lines = String(microDvdText).replace(/\r\n/g, '\n').split('\n');
    const cues = [];

    const frameToSrtTime = (frame) => {
        let ms = Math.round((frame / fps) * 1000);
        const h = Math.floor(ms / 3600000); ms -= h * 3600000;
        const m = Math.floor(ms / 60000); ms -= m * 60000;
        const s = Math.floor(ms / 1000); ms -= s * 1000;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };

    for (const line of lines) {
        const m = line.match(/^\{(\d+)\}\{(\d+)\}(.*)$/);
        if (!m) continue;
        const [, startFrame, endFrame, rawText] = m;
        // Codurile de stil MicroDVD ("{y:i}" italic, "{c:$FFFFFF}" culoare, etc.) apar
        // ca bloc separat de perechea obligatorie {start}{end} - le eliminam ca sa nu
        // apara ca text vizibil literal.
        const cleanText = rawText.replace(/\{[a-zA-Z]:[^}]*\}/g, '').replace(/\|/g, '\n').trim();
        if (!cleanText) continue;
        cues.push({ start: frameToSrtTime(parseInt(startFrame, 10)), end: frameToSrtTime(parseInt(endFrame, 10)), text: cleanText });
    }

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

// Unele arhive de pe RegieLive contin de fapt fisiere din mai multe limbi
// ("...ro...", "...uk-hi...", "...uk..."), fara nicio diferenta de scor intre ele -
// tie-break-ul pe marime alegea silentios varianta straina (adesea mai mare, din
// cauza descrierilor audio pt. hipoacuzici) in locul celei romane de langa ea.
// Verificam token cu token (nu substring, ca sa nu prindem "ro" din interiorul
// altor cuvinte precum numele unui grup de release).
const RO_LANG_TOKENS = new Set(['ro', 'rom', 'ron', 'romana', 'romina', 'rumana']);
const FOREIGN_LANG_TOKENS = new Set([
    'en', 'eng', 'uk', 'gb', 'us', 'usa',
    'fr', 'fra', 'fre', 'de', 'ger', 'deu', 'es', 'spa', 'it', 'ita',
    'nl', 'dut', 'nld', 'pt', 'por', 'bra', 'ru', 'rus', 'hu', 'hun',
    'bg', 'bul', 'gr', 'gre', 'ell', 'tr', 'tur', 'pl', 'pol',
    'cz', 'cze', 'ces', 'sk', 'slo', 'ar', 'ara', 'zh', 'chi', 'zho',
    'ja', 'jpn', 'ko', 'kor'
]);

function detectArchiveEntryLanguage(entryName) {
    const tokens = entryName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (tokens.some(t => RO_LANG_TOKENS.has(t))) return 'ro';
    if (tokens.some(t => FOREIGN_LANG_TOKENS.has(t))) return 'foreign';
    return null;
}

// Recunoaste tipul de arhiva dupa primii bytes (magic number), nu dupa extensie -
// RegieLive nu trimite extensia reala in URL. PK.. = ZIP, Rar! = RAR.
function detectArchiveType(buffer) {
    if (buffer.length < 4) return 'unknown';
    if (buffer[0] === 0x50 && buffer[1] === 0x4B) return 'zip';
    if (buffer[0] === 0x52 && buffer[1] === 0x61 && buffer[2] === 0x72 && buffer[3] === 0x21) return 'rar';
    return 'unknown';
}

// Cate un nivel de recursie e suficient pt. cazul real posibil (pachet "serie completa" =
// o arhiva exterioara ce contine cate o arhiva per sezon) si opreste orice risc de
// arhiva-in-arhiva-in-arhiva construita malitios.
const MAX_NESTED_DEPTH = 1;
// Limita pt. o arhiva imbricata (un pachet de sezon nu ar trebui sa depaseasca asta) -
// verificata atat pe marimea declarata (filtru rapid, inainte de decomprimare) cat si pe
// marimea reala dupa decomprimare (un header falsificat intr-o arhiva construita malitios
// poate declara marime mica si decomprima la ceva mult mai mare - decompression bomb).
const MAX_NESTED_ARCHIVE_SIZE = 20 * 1024 * 1024; // 20MB
// Limita pt. fisierul final de subtitrare - la fel, verificata declarat + real.
const MAX_SUBTITLE_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Un pachet "serie completa" e adesea o arhiva exterioara ce contine cate o arhiva per
// sezon (ex: "Serial.S04.720p.BluRay-Grup.rar"). Daca stim sigur sezonul cerut (din ID-ul
// Stremio) si EXACT una dintre arhivele imbricate il mentioneaza, o putem identifica fara
// ambiguitate - altfel (zero sau mai multe potriviri) nu ghicim.
function findSeasonMatchedNestedArchive(nestedNames, knownSeason) {
    const season = String(knownSeason);
    const pattern = new RegExp(`\\bs0?${season}\\b|\\bseason[\\s._-]*0?${season}\\b|\\bsezonul[\\s._-]*0?${season}\\b`, 'i');
    const matches = nestedNames.filter(name => pattern.test(name));
    return matches.length === 1 ? matches[0] : null;
}

// Alege cea mai buna subtitrare dintr-o lista de candidati {name, size} - comuna pentru
// ZIP si RAR. Exclude fisierele in alta limba (cand ramane o alternativa), alege dupa
// sezon/episod cunoscut cand exista (refuzand sa ghiceasca dupa marime daca e ambiguu),
// altfel cea mai mare ca dimensiune.
function pickBestSubtitleFile(candidates, knownSeason, knownEpisode) {
    if (candidates.length === 0) return null;

    const withLang = candidates.map(c => ({ c, lang: detectArchiveEntryLanguage(c.name) }));
    const nonForeign = withLang.filter(x => x.lang !== 'foreign').map(x => x.c);
    let pool = candidates;
    if (nonForeign.length > 0 && nonForeign.length < candidates.length) {
        const excluded = withLang.filter(x => x.lang === 'foreign').map(x => x.c.name);
        console.log(`[ARHIVĂ] Exclud ${excluded.length} fișier(e) dintr-o altă limbă: ${excluded.join(', ')}`);
        pool = nonForeign;
    }

    let chosen = null;
    if (knownSeason && knownEpisode) {
        const matched = pool.filter(c => entryMatchesEpisode(c.name, knownSeason, knownEpisode));
        if (matched.length > 0) {
            matched.sort((a, b) => (b.size || 0) - (a.size || 0));
            chosen = matched[0];
        } else if (pool.length > 1) {
            // Mai multe fisiere, dar niciunul nu poate fi identificat cert ca fiind episodul
            // cerut - refuzam sa ghicim dupa marime (poate alege gresit episodul).
            const wanted = `S${String(knownSeason).padStart(2, '0')}E${String(knownEpisode).padStart(2, '0')}`;
            console.error(`[ARHIVĂ] ${pool.length} fișiere găsite, dar niciunul nu poate fi identificat cert ca ${wanted} — refuz să aleg după mărime: ${pool.map(c => c.name).join(', ')}`);
            throw new Error('EPISODE_NOT_IDENTIFIED');
        }
        // un singur candidat si season/episode cunoscute dar fara match explicit in nume ->
        // il folosim oricum mai jos (nicio ambiguitate posibila cu un singur fisier)
    }

    if (!chosen) {
        pool.sort((a, b) => (b.size || 0) - (a.size || 0));
        chosen = pool[0];
    }

    if (pool.length > 1) {
        console.log(`[ARHIVĂ] ${pool.length} fișiere de subtitrare găsite, aleg:`);
        pool.forEach((c) => {
            const marker = c === chosen ? '  <-- ALES' : '';
            console.log(`    "${c.name}" — ${c.size} bytes${marker}`);
        });
    }

    return chosen;
}

// Extrage subtitrarea dintr-un buffer ZIP. Recurge o data intr-o arhiva imbricata
// (pachet de sezon) daca sezonul cerut identifica fara ambiguitate care dintre ele.
async function extractFromZip(buffer, knownSeason, knownEpisode, depth = 0) {
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();

    const candidates = [];
    for (const entry of zipEntries) {
        const fileName = entry.entryName.toLowerCase();
        const baseName = fileName.split('/').pop();
        if (fileName.includes('__macosx') || baseName.startsWith('.')) continue;
        if ((fileName.endsWith('.srt') || fileName.endsWith('.sub') || fileName.endsWith('.ass') || fileName.endsWith('.ssa')) &&
            (entry.header.size || 0) <= MAX_SUBTITLE_FILE_SIZE) {
            candidates.push({ name: entry.entryName, size: entry.header.size || 0, _entry: entry });
        }
    }

    if (candidates.length === 0) {
        // Nicio subtitrare directa - poate arhiva contine alte arhive (pachet de sezon).
        // Arhiva imbricata are prioritate fata de fallback-ul .txt de mai jos.
        const nestedEntries = zipEntries.filter(e => /\.(rar|zip)$/i.test(e.entryName));
        if (nestedEntries.length > 0) {
            const matchedName = (knownSeason && depth < MAX_NESTED_DEPTH)
                ? findSeasonMatchedNestedArchive(nestedEntries.map(e => e.entryName), knownSeason)
                : null;
            const matched = matchedName ? nestedEntries.find(e => e.entryName === matchedName) : null;

            if (matched && (matched.header.size || 0) <= MAX_NESTED_ARCHIVE_SIZE) {
                const nestedBuffer = matched.getData();
                if (nestedBuffer.length <= MAX_NESTED_ARCHIVE_SIZE) {
                    console.log(`[ZIP] Arhivă cu ${nestedEntries.length} arhive imbricate — recurg în cea a sezonului cunoscut: "${matched.entryName}"`);
                    const nestedType = detectArchiveType(nestedBuffer);
                    if (nestedType === 'zip') return await extractFromZip(nestedBuffer, knownSeason, knownEpisode, depth + 1);
                    if (nestedType === 'rar') return await extractFromRar(nestedBuffer, knownSeason, knownEpisode, depth + 1);
                } else {
                    console.error(`[ZIP] Arhiva imbricată "${matched.entryName}" a decomprimat la ${nestedBuffer.length} bytes — peste limită, o ignor (header posibil incorect).`);
                }
            }

            console.error(`[ZIP] Arhivă cu ${nestedEntries.length} arhive imbricate (probabil pachet multi-sezon), nu pot identifica fără ambiguitate în care e episodul: ${nestedEntries.map(e => e.entryName).join(', ')}`);
            throw new Error('NESTED_ARCHIVE_UNSUPPORTED');
        }

        // Fallback .txt - validam continutul, ca sa nu luam orbeste un README drept subtitrare.
        for (const entry of zipEntries) {
            const fileName = entry.entryName.toLowerCase();
            const baseName = fileName.split('/').pop();
            if (fileName.includes('__macosx') || baseName.startsWith('.') || !fileName.endsWith('.txt')) continue;

            const preview = entry.getData().slice(0, 200).toString('utf8');
            if (preview.includes('-->') || /^\d+\s*\r?\n/.test(preview)) {
                const data = entry.getData();
                if (data.length === 0) throw new Error('SUBTITLE_EMPTY');
                return { data, isAss: false };
            }
        }

        throw new Error('NO_SRT');
    }

    const best = pickBestSubtitleFile(candidates, knownSeason, knownEpisode);
    const rawData = best._entry.getData();
    if (rawData.length === 0) throw new Error('SUBTITLE_EMPTY');
    if (rawData.length > MAX_SUBTITLE_FILE_SIZE) throw new Error('SUBTITLE_TOO_LARGE');
    const isAss = /\.(ass|ssa)$/i.test(best.name);
    const isMicroDvd = !isAss && isMicroDvdText(rawData.toString('latin1', 0, 200));
    return { data: rawData, isAss, isMicroDvd };
}

// Extrage subtitrarea dintr-un buffer RAR, cu aceeasi logica de selectie candidati si
// recursie in arhive imbricate ca la ZIP.
async function extractFromRar(buffer, knownSeason, knownEpisode, depth = 0) {
    try {
        const { createExtractorFromData } = require('node-unrar-js');
        const extractor = await createExtractorFromData(
            unrarWasmBinary ? { data: buffer, wasmBinary: unrarWasmBinary } : { data: buffer }
        );
        const list = extractor.getFileList();
        const fileHeaders = [...list.fileHeaders];

        const candidates = fileHeaders
            .filter(h => {
                const fn = h.name.toLowerCase();
                return (fn.endsWith('.srt') || fn.endsWith('.sub') || fn.endsWith('.ass') || fn.endsWith('.ssa')) &&
                       (h.unpSize || h.packSize || 0) <= MAX_SUBTITLE_FILE_SIZE;
            })
            .map(h => ({ name: h.name, size: h.unpSize || h.packSize || 0 }));

        if (candidates.length === 0) {
            const nested = fileHeaders.filter(h => /\.(rar|zip)$/i.test(h.name));
            if (nested.length > 0) {
                const matchedName = (knownSeason && depth < MAX_NESTED_DEPTH)
                    ? findSeasonMatchedNestedArchive(nested.map(h => h.name), knownSeason)
                    : null;
                const matchedHeader = matchedName ? nested.find(h => h.name === matchedName) : null;
                const matchedSize = matchedHeader ? (matchedHeader.unpSize || matchedHeader.packSize || 0) : 0;

                if (matchedHeader && matchedSize <= MAX_NESTED_ARCHIVE_SIZE) {
                    const nestedExtracted = extractor.extract({ files: [matchedHeader.name] });
                    const nestedFiles = [...nestedExtracted.files];
                    if (nestedFiles.length > 0 && nestedFiles[0].extraction) {
                        const nestedBuffer = Buffer.from(nestedFiles[0].extraction);
                        if (nestedBuffer.length <= MAX_NESTED_ARCHIVE_SIZE) {
                            console.log(`[RAR] Arhivă cu ${nested.length} arhive imbricate — recurg în cea a sezonului cunoscut: "${matchedHeader.name}"`);
                            const nestedType = detectArchiveType(nestedBuffer);
                            if (nestedType === 'zip') return await extractFromZip(nestedBuffer, knownSeason, knownEpisode, depth + 1);
                            if (nestedType === 'rar') return await extractFromRar(nestedBuffer, knownSeason, knownEpisode, depth + 1);
                        } else {
                            console.error(`[RAR] Arhiva imbricată "${matchedHeader.name}" a decomprimat la ${nestedBuffer.length} bytes — peste limită, o ignor (header posibil incorect).`);
                        }
                    }
                }

                console.error(`[RAR] Arhivă cu ${nested.length} arhive imbricate (probabil pachet multi-sezon), nu pot identifica fără ambiguitate în care e episodul: ${nested.map(h => h.name).join(', ')}`);
                throw new Error('NESTED_ARCHIVE_UNSUPPORTED');
            }
            throw new Error('NO_SRT');
        }

        const best = pickBestSubtitleFile(candidates, knownSeason, knownEpisode);
        const extracted = extractor.extract({ files: [best.name] });
        const files = [...extracted.files];
        if (files.length === 0 || !files[0].extraction) throw new Error('RAR_EXTRACT_FAILED');

        const finalBuffer = Buffer.from(files[0].extraction);
        if (finalBuffer.length === 0) throw new Error('SUBTITLE_EMPTY');
        if (finalBuffer.length > MAX_SUBTITLE_FILE_SIZE) throw new Error('SUBTITLE_TOO_LARGE');
        const isAss = /\.(ass|ssa)$/i.test(best.name);
        const isMicroDvd = !isAss && isMicroDvdText(finalBuffer.toString('latin1', 0, 200));
        return { data: finalBuffer, isAss, isMicroDvd };
    } catch (err) {
        if (err.message === 'EPISODE_NOT_IDENTIFIED' || err.message === 'NESTED_ARCHIVE_UNSUPPORTED' ||
            err.message === 'SUBTITLE_EMPTY' || err.message === 'SUBTITLE_TOO_LARGE' || err.message === 'NO_SRT') {
            throw err;
        }
        console.error('[RAR] Eroare la extracție:', err.message);
        throw new Error('RAR_EXTRACT_FAILED');
    }
}

const subtitlesCache = new Map();
const activeDownloads = new Map();
let globalDownloadQueue = Promise.resolve();
// Cheia implicita e comuna (integrare tip Bazarr) - oricine ruleaza un fork foloseste
// aceeasi, deci concureaza pe acelasi buget de rate-limit la RegieLive. Daca ai o cheie
// personala de la RegieLive, seteaz-o in REGIELIVE_API_KEY (Render -> Environment) ca
// sa devii independent de restul fork-urilor - fara ea, comportamentul e neschimbat.
const API_KEY = process.env.REGIELIVE_API_KEY || 'API-BAZARR-YTZ-SL';

// Reincearca automat o descarcare care a picat cu 429 (rate-limit trecator la RegieLive) -
// confirmat pe productie (Mega-Subtitles-Addon, aceeasi sursa) ca aceste esecuri sunt
// adesea trecatoare (functioneaza la o reincercare manuala, la cateva secunde distanta).
// Doar 429 se reincearca; orice alta eroare (retea, 404 etc.) e aruncata imediat, neschimbata.
const DOWNLOAD_RETRY_DELAYS_MS = [1500, 3000];

async function fetchWithRetry429(axiosConfig) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await axios(axiosConfig);
        } catch (err) {
            const is429 = err.response && err.response.status === 429;
            if (!is429 || attempt >= DOWNLOAD_RETRY_DELAYS_MS.length) throw err;
            const delay = DOWNLOAD_RETRY_DELAYS_MS[attempt];
            console.warn(`[REGIELIVE] 429 la descărcare, reîncerc peste ${delay}ms (încercarea ${attempt + 2}/${DOWNLOAD_RETRY_DELAYS_MS.length + 1}).`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
}

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

// Ruta descarca orice URL i se da in query (ca sa poata prelua arhive de pe RegieLive),
// deci fara whitelist ar putea fi folosita ca proxy catre orice adresa (SSRF) - inclusiv
// spre resurse interne Render. Acceptam doar domeniul real de pe care vin arhivele.
const ALLOWED_DOWNLOAD_HOSTS = new Set(['subtitrari.regielive.ro']);

function isAllowedDownloadUrl(urlString) {
    try {
        const parsed = new URL(urlString);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
               ALLOWED_DOWNLOAD_HOSTS.has(parsed.hostname);
    } catch {
        return false;
    }
}

app.get(['/download', '/download.vtt'], async (req, res) => {
    const zipUrl = req.query.url;
    const sessionCookie = req.query.cookie || ''; // Citim Cookie-ul din URL
    const knownSeason = req.query.season || null;
    const knownEpisode = req.query.episode || null;

    if (!zipUrl) return res.status(400).send('URL lipsă');

    if (!isAllowedDownloadUrl(zipUrl)) {
        console.warn(`[SECURITATE] Refuz descărcare de pe domeniu neautorizat: ${zipUrl}`);
        return res.status(400).send('Domeniu nepermis');
    }

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
        const response = await fetchWithRetry429({
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

        const archiveType = detectArchiveType(response.data);
        let extracted;

        if (archiveType === 'zip') {
            extracted = await extractFromZip(response.data, knownSeason, knownEpisode);
        } else if (archiveType === 'rar') {
            extracted = await extractFromRar(response.data, knownSeason, knownEpisode);
        } else {
            // Diagnostic: aflăm EXACT ce am primit înapoi, ca să nu mai ghicim
            const contentType = response.headers['content-type'] || 'necunoscut';
            const fullBody = Buffer.from(response.data).toString('utf8');
            const titleMatch = fullBody.match(/<title>([\s\S]*?)<\/title>/i);
            const pageTitle = titleMatch ? titleMatch[1].trim() : '(fără <title>)';

            const suspectKeywords = ['captcha', 'recaptcha', 'blocat', 'acces interzis', 'access denied',
                'prea multe', 'limita', 'limită', 'login', 'autentificare', 'sign in', 'cloudflare',
                'just a moment', 'checking your browser', 'eroare', 'not found', '404'];
            const foundKeywords = suspectKeywords.filter(k => fullBody.toLowerCase().includes(k));

            console.error('[X] Fișierul nu e o arhivă cunoscută (ZIP/RAR)!');
            console.error(`    Status HTTP: ${response.status}`);
            console.error(`    Content-Type primit: ${contentType}`);
            console.error(`    Dimensiune răspuns: ${response.data.length} bytes`);
            console.error(`    <title> pagină: ${pageTitle}`);
            console.error(`    Cuvinte-cheie suspecte găsite: ${foundKeywords.length ? foundKeywords.join(', ') : '(niciunul)'}`);
            console.error(`    Primele 1000 caractere din răspuns:\n${fullBody.slice(0, 1000)}`);
            throw new Error('UNKNOWN_ARCHIVE_FORMAT');
        }

        const { data: rawData, isAss, isMicroDvd } = extracted;

        const detected = jschardet.detect(rawData);

        let encoding = 'windows-1250';
        if (detected && detected.encoding) {
            const enc = detected.encoding.toLowerCase();
            if (enc.includes('utf') || enc === 'ascii') {
                encoding = enc;
            }
        }

        const decoded = iconv.decode(rawData, encoding);
        if (isAss) return assToSrt(decoded);
        if (isMicroDvd) return microDvdToSrt(decoded);
        return decoded;
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
