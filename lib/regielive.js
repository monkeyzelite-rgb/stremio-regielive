const axios = require('axios');

const API_URL = 'https://api.regielive.ro/bazarr/search.php';
const API_KEY = 'API-BAZARR-YTZ-SL';

async function getCinemetaInfo(imdbId, type) {
    try {
        const baseId = imdbId.split(':')[0]; 
        const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${baseId}.json`);
        return res.data.meta;
    } catch (error) {
        console.error("Eroare Cinemeta:", error.message);
        return null;
    }
}

async function searchRegieLive(imdbId, type) {
    console.log(`\n--- [CĂUTARE NOUĂ] ---`);
    console.log(`[1] Caut pentru ${type} cu ID: ${imdbId}`);
    
    const meta = await getCinemetaInfo(imdbId, type);
    if (!meta) {
        console.log(`[X] Nu am putut obține numele filmului de la Cinemeta.`);
        return [];
    }

    const params = {};
    if (type === 'series') {
        const parts = imdbId.split(':');
        params.nume = meta.name;
        params.sezon = parts[1];
        params.episod = parts[2];
    } else {
        params.nume = meta.name;
    }

    if (meta.year) {
        params.an = parseInt(meta.year, 10); 
    }

    try {
        const response = await axios.get(API_URL, {
            params: params,
            headers: { 
                'RL-API': API_KEY,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://subtitrari.regielive.ro',
                'Accept': 'application/json, text/plain, */*'
            }
        });

        // AICI ESTE MAGIA: Extragem Cookie-ul din răspunsul serverului
        let sessionCookie = "";
        if (response.headers['set-cookie']) {
            sessionCookie = response.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        }

        const subtitles = [];
        
        if (response.data && response.data.rezultate) {
            const filme = response.data.rezultate;
            for (const filmKey in filme) {
                const subs = filme[filmKey].subtitrari;
                if (!subs) continue;
                
                for (const subKey in subs) {
                    subtitles.push({
                        id: subKey,
                        lang: 'ron',
                        title: subs[subKey].titlu,
                        url: subs[subKey].url,
                        rating: subs[subKey].rating ? subs[subKey].rating.nota : "N/A",
                        cookie: sessionCookie // Atașăm cookie-ul la fiecare subtitrare
                    });
                }
            }
        }
        
        console.log(`[OK] Trimis la Stremio: ${subtitles.length} subtitrări (Sesiune salvată).`);
        return subtitles;
        
    } catch (error) {
        console.error("[X] Eroare la interogarea RegieLive API:", error.message);
        return [];
    }
}

module.exports = { searchRegieLive };