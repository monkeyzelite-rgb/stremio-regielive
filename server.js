const express = require('express');
const { getRouter } = require('stremio-addon-sdk');
const addonInterface = require('./addon');
const axios = require('axios');
const AdmZip = require('adm-zip');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');

const app = express();
app.use(express.static('public'));

const subtitlesCache = new Map();
const activeDownloads = new Map();
let globalDownloadQueue = Promise.resolve();
const API_KEY = 'API-BAZARR-YTZ-SL'; 

app.use(getRouter(addonInterface));

app.get('/download', async (req, res) => {
    const zipUrl = req.query.url;
    const sessionCookie = req.query.cookie || ''; 
    
    if (!zipUrl) return res.status(400).send('URL lipsă');

    // Funcție ajutătoare pentru a trimite corect spre iOS și PC
    const sendSubtitleResponse = (text, responseObj) => {
        responseObj.setHeader('Content-Type', 'text/plain; charset=utf-8');
        responseObj.setHeader('Content-Disposition', 'inline; filename="subtitle.srt"');
        return responseObj.send(text);
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
                'Cookie': sessionCookie,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/octet-stream, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://subtitrari.regielive.ro'
            }
        });

        let zip;
        try {
            zip = new AdmZip(response.data);
        } catch (e) {
            console.error('[X] Fișierul nu e ZIP!');
            throw new Error('NOT_A_ZIP');
        }

        const zipEntries = zip.getEntries();
        let subtitleEntry = null;
        
        // 1. Căutăm cu prioritate maximă fișierul .srt
        for (const entry of zipEntries) {
            const fileName = entry.entryName.toLowerCase();
            const baseName = fileName.split('/').pop();
            if (fileName.includes('__macosx') || baseName.startsWith('.')) continue;

            if (fileName.endsWith('.srt')) {
                subtitleEntry = entry;
                break;
            }
        }

        // 2. Dacă nu e .srt, căutăm alte formate suportate
        if (!subtitleEntry) {
            for (const entry of zipEntries) {
                const fileName = entry.entryName.toLowerCase();
                if (fileName.endsWith('.sub') || fileName.endsWith('.txt')) {
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
