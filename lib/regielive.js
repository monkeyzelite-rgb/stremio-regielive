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

async function fetchFromRegieLive(params) {
    return await axios.get(API_URL, {
        params: params,
        headers: { 
            'RL-API': API_KEY,
            'User-Agent': 'StremioRegieLiveAddon/1.0.0',
            'Referer': 'https://subtitrari.regielive.ro',
            'Accept': 'application/json, text/plain, */*'
        }
    });
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

    // Construim căutarea DOAR pe bază de text și an la început
    if (type === 'series') {
        const parts = imdbId.split(':');
        params.nume = meta.name;
        params.sezon = parts[1];
        params.episod = parts[2];
    } else {
        params.nume = meta.name;
    }

    const rawYear = meta.year || meta.releaseInfo;
    if (rawYear) {
        const yearStr = String(rawYear).substring(0, 4);
        params.an = parseInt(yearStr, 10); 
    }

    console.log(`[DEBUG API] Încercarea 1 (Nume + An):`, params);

    try {
        let response;
        try {
            response = await fetchFromRegieLive(params);
        } catch (err) {
            // Dacă Nume + An dă fail, încercăm doar cu Nume
            if (err.response && err.response.status === 404 && params.an) {
                console.log(`[!] Nu am găsit cu anul ${params.an}. Reîncerc doar cu numele...`);
                delete params.an;
                console.log(`[DEBUG API] Încercarea 2 (Doar Nume):`, params);
                
                try {
                    response = await fetchFromRegieLive(params);
                } catch (err2) {
                    // Dacă pică și doar cu Nume, aruncăm ultima carte: ID-ul IMDb
                    if (err2.response && err2.response.status === 404) {
                        console.log(`[!] Nu am găsit nici după nume. Încerc strict după IMDb ID...`);
                        const fallbackParams = { imdbid: imdbId.split(':')[0] };
                        console.log(`[DEBUG API] Încercarea 3 (Doar IMDb ID):`, fallbackParams);
                        response = await fetchFromRegieLive(fallbackParams);
                    } else {
                        throw err2;
                    }
                }
            } else {
                throw err;
            }
        }

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
                        cookie: sessionCookie 
                    });
                }
            }
        }
        
        console.log(`[OK] Trimis la Stremio: ${subtitles.length} subtitrări (Sesiune salvată).`);
        return subtitles;
        
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log("[OK] Nu există nicio subtitrare pe RegieLive pentru acest film.");
            return [];
        }
        console.error("[X] Eroare la interogarea RegieLive API:", error.message);
        return [];
    }
}

module.exports = { searchRegieLive };
