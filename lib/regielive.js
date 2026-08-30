const axios = require('axios');

const API_URL = 'https://api.regielive.ro/bazarr/search.php';
const API_KEY = 'API-BAZARR-YTZ-SL';

// Cache în memorie pentru căutări (valabil 10 minute per ID)
const searchCache = new Map();
const inFlightSearches = new Map();

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

async function executeSearch(imdbId, type) {
    console.log(`\n--- [CĂUTARE NOUĂ] ---`);
    console.log(`[1] Caut pentru ${type} cu ID: ${imdbId}`);
    
    const cleanImdbId = imdbId.split(':')[0];
    let response = null;

    // 1. Încercare după IMDb ID
    try {
        const imdbParams = { imdbid: cleanImdbId };
        if (type === 'series') {
            const parts = imdbId.split(':');
            imdbParams.sezon = parts[1];
            imdbParams.episod = parts[2];
        }
        console.log(`[DEBUG API] Încercarea 1 (Strict IMDb ID):`, imdbParams);
        response = await fetchFromRegieLive(imdbParams);
    } catch (err) {
        console.log(`[!] Căutarea după IMDb ID nu a returnat rezultate. Trecem la planul 2...`);
    }

    // 2. Fallback: Nume + An / Doar Nume
    if (!response || !response.data || !response.data.rezultate || Object.keys(response.data.rezultate).length === 0) {
        const meta = await getCinemetaInfo(imdbId, type);
        if (meta) {
            const textParams = {};
            if (type === 'series') {
                const parts = imdbId.split(':');
                textParams.nume = meta.name;
                textParams.sezon = parts[1];
                textParams.episod = parts[2];
            } else {
                textParams.nume = meta.name;
            }

            const rawYear = meta.year || meta.releaseInfo;
            if (rawYear) {
                textParams.an = parseInt(String(rawYear).substring(0, 4), 10);
            }

            console.log(`[DEBUG API] Încercarea 2 (Nume + An de rezervă):`, textParams);
            try {
                response = await fetchFromRegieLive(textParams);
            } catch (err2) {
                if (textParams.an) {
                    delete textParams.an;
                    console.log(`[DEBUG API] Încercarea 3 (Doar Nume curat):`, textParams);
                    try {
                        response = await fetchFromRegieLive(textParams);
                    } catch (err3) {
                        console.log(`[OK] Niciun rezultat găsit pe RegieLive.`);
                    }
                }
            }
        }
    }

    let sessionCookie = "";
    const subtitles = [];

    if (response && response.headers && response.headers['set-cookie']) {
        sessionCookie = response.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
    }

    if (response && response.data && response.data.rezultate) {
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
}

// Funcția exportată previne apelurile paralele duplicate către RegieLive
async function searchRegieLive(imdbId, type) {
    const cacheKey = `${type}_${imdbId}`;

    if (searchCache.has(cacheKey)) {
        return searchCache.get(cacheKey);
    }

    if (inFlightSearches.has(cacheKey)) {
        return await inFlightSearches.get(cacheKey);
    }

    const searchPromise = executeSearch(imdbId, type).finally(() => {
        inFlightSearches.delete(cacheKey);
    });

    inFlightSearches.set(cacheKey, searchPromise);
    const results = await searchPromise;

    if (results && results.length > 0) {
        searchCache.set(cacheKey, results);
        // Curățare cache după 10 minute
        setTimeout(() => searchCache.delete(cacheKey), 10 * 60 * 1000);
    }

    return results;
}

module.exports = { searchRegieLive };
