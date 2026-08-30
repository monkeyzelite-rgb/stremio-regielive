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
    
    const cleanImdbId = imdbId.split(':')[0];
    let response = null;

    // --- METODA 1: Încercăm prima dată strict după ID-ul de IMDb (Cea mai precisă metodă) ---
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
        console.log(`[!] Căutarea după IMDb ID nu a returnat rezultate (404 sau eroare). Trecem la planul 2...`);
    }

    // --- METODA 2: Dacă IMDb ID nu a dat rezultate, căutăm după Nume + An (Metoda de rezervă) ---
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
                // Dacă eșuează și cu anul, încercăm o ultimă oară doar pe Nume curat
                if (textParams.an) {
                    delete textParams.an;
                    console.log(`[DEBUG API] Încercarea 3 (Doar Nume curat):`, textParams);
                    try {
                        response = await fetchFromRegieLive(textParams);
                    } catch (err3) {
                        console.log(`[OK] Niciun rezultat găsit pe RegieLive pentru acest titlu.`);
                    }
                }
            }
        }
    }

    // Extragem rezultatele și sesiunea dacă am primit un răspuns valid
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

module.exports = { searchRegieLive };
