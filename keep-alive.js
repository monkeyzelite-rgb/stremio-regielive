const https = require('https');

// URL-ul tău real de pe Render
const RENDER_URL = 'https://stremio-regielive-rjps.onrender.com'; 

console.log('[Anti-Sleep] Serviciul de mentinere activa a pornit.');

setInterval(() => {
    https.get(RENDER_URL, (res) => {
        console.log(`[Anti-Sleep] Ping trimis cu succes către ${RENDER_URL}. Status: ${res.statusCode}`);
    }).on('error', (err) => {
        console.error(`[Anti-Sleep] Eroare la ping: ${err.message}`);
    });
}, 840000); // 14 minute în milisecunde