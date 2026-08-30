const express = require('express');
const cors = require('cors');
const { getRouter } = require('stremio-addon-sdk');
const addonInterface = require('./addon');
const axios = require('axios');
const AdmZip = require('adm-zip');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');

const app = express();
app.use(cors()); // <--- FIX iOS: fara asta, AVPlayer (playerul nativ folosit de Stremio pe iOS) poate respinge tacit request-ul catre /download
app.use(express.static('public')); // <--- AICI AM ADAUGAT-O!

// Converteste SRT in WebVTT. AVPlayer (iOS) nu incarca fisiere .srt "goale" la fel de
// permisiv cum o fac mpv/exoplayer pe desktop/Android; WebVTT e formatul sigur cross-platform.
function srtToVtt(srtText) {
    let text = String(srtText).replace(/\r+/g, '').trim();
    // elimina liniile index (linie formata doar din cifre) de la inceputul fiecarui bloc
    text = text.replace(/^\d+\s*$/gm, '');
    // 00:00:20,000 --> 00:00:24,400  devine  00:00:20.000 --> 00:00:24.400
    text = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    return 'WEBVTT\n\n' + text.trim() + '\n';
}

const subtitlesCache = new Map();
const activeDownloads = new Map();
let globalDownloadQueue = Promise.resolve();
const API_KEY = 'API-BAZARR-YTZ-SL'; 

app.use(getRouter(addonInterface));

app.get(['/download', '/download.vtt'], async (req, res) => {
    const zipUrl = req.query.url;
    const sessionCookie = req.query.cookie || ''; // Citim Cookie-ul din URL
    
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
            const bodyPreview = Buffer.from(response.data).toString('utf8').slice(0, 300);
            console.error('[X] Fișierul nu e ZIP!');
            console.error(`    Status HTTP: ${response.status}`);
            console.error(`    Content-Type primit: ${contentType}`);
            console.error(`    Dimensiune răspuns: ${response.data.length} bytes`);
            console.error(`    Primele 300 caractere din răspuns:\n${bodyPreview}`);
            throw new Error('NOT_A_ZIP');
        }

        const zipEntries = zip.getEntries();
        let subtitleEntry = null;
        
        // 1. Căutăm cu prioritate maximă fișierul .srt
        for (const entry of zipEntries) {
            const fileName = entry.entryName.toLowerCase();
            const baseName = fileName.split('/').pop();
            if (fileName.includes('__macosx') || baseName.startsWith('.')) continue;

            if (fileName.endsWith('.srt') || fileName.endsWith('.sub')) {
                subtitleEntry = entry;
                break;
            }
        }

        // 2. Dacă nu e .srt, căutăm alte formate suportate
        if (!subtitleEntry) {
            for (const entry of zipEntries) {
                const fileName = entry.entryName.toLowerCase();
                if (fileName.endsWith('.txt')) {
                    subtitleEntry = entry;
                    break;
                }
            }
        }

        if (!subtitleEntry) throw new Error('NO_SRT');

        const rawData = subtitleEntry.getData();
        const detected = jschardet.detect(rawData);
        
        let encoding = 'windows-1250';
        if (detected && detected.encoding) {
            const enc = detected.encoding.toLowerCase();
            if (enc.includes('utf') || enc === 'ascii') {
                encoding = enc;
            }
        }

        return iconv.decode(rawData, encoding);
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
});
