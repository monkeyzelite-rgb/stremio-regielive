const https = require('https');

// Aceeași ordine de fallback ca APP_URL din addon.js - fara asta, un fork deployat pe
// Render ar continua sa faca ping la instanta originala in loc de a lui, ceea ce nu
// previne deloc spin-down-ul propriu si adauga trafic inutil la celalalt server.
const RENDER_URL = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'https://stremio-regielive-rjps.onrender.com') + '/manifest.json';

console.log('[Anti-Sleep] Serviciul de mentinere activa a pornit.');

setInterval(() => {
    https.get(RENDER_URL, (res) => {
        console.log(`[Anti-Sleep] Ping trimis cu succes către ${RENDER_URL}. Status: ${res.statusCode}`);
    }).on('error', (err) => {
        console.error(`[Anti-Sleep] Eroare la ping: ${err.message}`);
    });
}, 840000); // 14 minute în milisecunde