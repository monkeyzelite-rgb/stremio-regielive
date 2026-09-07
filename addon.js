const { addonBuilder } = require("stremio-addon-sdk");
const manifest = require("./manifest");
const { searchRegieLive } = require("./lib/regielive");

// AICI ESTE LINIA ADĂUGATĂ:
const APP_URL = 'https://stremio-regielive-rjps.onrender.com';

const builder = new addonBuilder(manifest);


builder.defineSubtitlesHandler(async function(args) {
    const videoFilename = (args.extra && args.extra.filename) ? args.extra.filename : "";
    const subs = await searchRegieLive(args.id, args.type, videoFilename);
    const videoFilenameLower = videoFilename.toLowerCase();
    
    if (!subs || subs.length === 0) return { subtitles: [] };

    function calculateScore(subTitle, rating) {
        let score = 0;
        let matchedGroup = null;
        let sourceMatch = null;
        let resMatch = null;
        const breakdown = {};
        const subTitleLower = (subTitle || "").toLowerCase();

        if (videoFilenameLower) {
            // 1. MATCH SUPREM (+100 puncte)
            const groups = ['0mnidvd', '0tv', '1920', '20ripz', '2hd', '2pacaveli', '3ctweb', '3l', '433', '4fr', '4hm', '4kbec', '4khd', '7sins', 'a4o', 'aaf', 'aas', 'abbie', 'abd', 'abez', 'acclaim', 'aced', 'adhd', 'admirals', 'adrenaline', 'adweb', 'ae', 'aegis', 'aek', 'aen', 'aeroholics', 'afo', 'aggr0', 'airforce', 'airline', 'airwaves', 'aisha', 'ajp69', 'aldi', 'alliance', 'amber', 'ambitious', 'amiable', 'amrap', 'amstel', 'anarchy', 'anbc', 'angelic', 'anihls', 'anivcd', 'ao', 'aoc', 'apex', 'apl', 'aqua', 'archivist', 'argon', 'ariestv', 'arigold', 'arisco', 'ariscrapaysites', 'arrow', 'artemix', 'arthouse', 'asap', 'asister', 'atelier', 'aterfallet', 'atotik', 'ats', 'av1svasi', 'avcdvd', 'avchd', 'avs', 'avs720', 'aw', 'awake', 'azninvasion', 'azurray', 'b3yg1r', 'bae', 'bajskorv', 'baked', 'bamhd', 'bass', 'bbq', 'bdisc', 'beesknees', 'ben.the.men', 'bfm', 'bhdstudio', 'bia', 'bigdoc', 'bioma', 'bitor', 'bizkit', 'blaze', 'bloom', 'bluetv', 'bluranium', 'blutonium', 'bmdru', 'bmf', 'bob', 'bone', 'bravery', 'brg', 'bs', 'btbn', 'btm', 'btn', 'btsd', 'btw', 'burcyg', 'byndr', 'c0ke', 'caffeine', 'cakes', 'cansiz', 'casstudio', 'cbfm', 'cdd', 'cddhd', 'cebex', 'cg1989', 'chakra', 'chara', 'chd', 'chdsubs', 'chdweb', 'chortle', 'chotab', 'chronicles', 'cia', 'cinefeel', 'cinefile', 'cinefox', 'cinemaniacs', 'cinematic', 'cinemix', 'cinephiles', 'cit', 'classic', 'cmrg', 'coalition', 'coaster', 'codswallop', 'cojonudo', 'compulsion', 'coo7', 'cookiemonster', 'counterfeit', 'cpt', 'cpy', 'cravers', 'crfw', 'crimson', 'crisc', 'critter2376', 'crow', 'crud', 'ct', 'ctrlhd', 'ctrlsd', 'ctu', 'd-z0n3', 'd3g', 'dariush', 'darksaber', 'dawn', 'db', 'deadbadugly', 'decibel', 'deep', 'deflate', 'deimos', 'dermagic', 'deuterium', 'dh', 'digger', 'dimension', 'dirt', 'dkv', 'don', 'dracula', 'drm1', 'dunghill', 'dust', 'ea', 'ebp', 'eclipse', 'edge2020', 'edhd', 'edith', 'edph', 'egen', 'elite', 'encounters', 'end', 'endeavour', 'epsilon', 'erix', 'ethel', 'ethics', 'evolve', 'exploit', 'eztv', 'factory', 'family', 'fc', 'felix', 'fenix', 'fever', 'fgt', 'flame', 'flhd', 'flights', 'florix', 'flux', 'forbidden', 'fov', 'fqm', 'framestor', 'fts', 'futv', 'fw', 'galaxytv', 'gang', 'gardai', 'geckos', 'geek', 'ggez', 'ghd', 'ghost', 'ghouls', 'glhf', 'gnome', 'gnomission', 'goki', 'gossip', 'gprs', 'grace', 'haggis', 'hallowed', 'hawes', 'hdchina', 'hddt', 'hdex', 'hdmi', 'hdsky', 'hdtime', 'herkz', 'heteam', 'hhweb', 'hidt', 'hifi', 'hightimes', 'hiqve', 'hisd', 'hodl', 'hone', 'hqmux', 'huzzah', 'ift', 'ijp', 'ika', 'ime', 'immerse', 'inchy', 'infinity', 'inflate', 'inspirit', 'it00nz', 'ivy', 'jamtarts', 'jatt', 'jbee', 'jenkins', 'jetix', 'jmess', 'joebee', 'jr', 'kamikaze', 'khn', 'killers', 'kimchi', 'kimji', 'kingturd', 'kings', 'kitsune', 'kogi', 'kontrast', 'kralimarko', 'kratos', 'kyogo', 'lazy', 'lazers', 'legi0n', 'linkle', 'lion', 'littleblueman', 'loki', 'lol', 'lolhd', 'lootera', 'lord', 'lostfilm', 'lunar', 'madsky', 'magicstar', 'mainframe', 'mama', 'mch', 'meech', 'megusta', 'mercator', 'mesc', 'mhysa', 'midweek', 'miu', 'mjolnir', 'mnkyddl', 'monkee', 'mortyrick', 'mrhulk', 'mrn', 'mteam', 'mv', 'mzabi', 'n1h4l', 'nailedit', 'naisu', 'ncmt', 'neonoir', 'newman', 'ngr', 'nhtfs', 'nikt0', 'nima4k', 'ninjacentral', 'nitsua', 'nogroup', 'nogrp', 'noma', 'nortekst', 'nosivid', 'noxxus', 'npms', 'ntb', 'ntg', 'nyh', 'o69', 'oft', 'onlyfaffs', 'orbitron', 'ouija', 'ourbits', 'oxidizer', 'panda', 'pawel2006', 'paxa', 'pexa', 'pfa', 'phocis', 'phoenix', 'pi', 'pieguy', 'pike', 'pitbull', 'playbd', 'playhd', 'playweb', 'plutonium', 'pmhd', 'pmp', 'pof', 'poiasd', 'poppers', 'poppycock', 'pow4hd', 'pragma', 'primefix', 'prodji', 'psa', 'psig', 'pter', 'ptg', 'ptp', 'qash', 'qfg', 'qman', 'qoq', 'quintessence', 'qxr', 'r&h', 'r0cked', 'ralphy', 'rapta', 'rarbg', 'rawr', 'rcsw', 'rcvr', 'regedits', 'regret', 'revils', 'reward', 'river', 'rng', 'roccat', 'rogue', 'rovers', 'rtfm', 'rtn', 'rumour', 's14', 'sa89', 'sadpanda', 'saints', 'sampa', 'saphire', 'sbr', 'sdcc', 'sector7', 'seedpool', 'seriously', 'sexsh0p', 'sfm', 'shieldbearer', 'shieldearer', 'shortbrehd', 'sic', 'sicfoi', 'sighthd', 'sigma', 'silence', 'siluhd', 'sinners', 'siq', 'sitv', 'skizoid', 'skyfire', 'slignome', 'slm', 'sloth', 'smd', 'smurf', 'sow', 'sparks', 'sphd', 'spid3r', 'spirit', 'squalor', 'stc', 'strife', 'strontium', 'successfulcrab', 'sumvision', 'sunspot', 'surfinbird', 'svd', 'swaglander', 'swtyblz', 'sys', 't00ng0d', 't4h', 't6d', 'tabularia', 'taoe', 'tayto', 'tbn', 'tbs', 'tcm', 'tdd', 'telly', 'tepes', 'terra', 'tgx', 'thefarm', 'thelastofus', 'thewretched', 'thx', 'tikos', 'timelords', 'tizu', 'tjupt', 'tl', 'tlf', 'tn', 'tnp', 'toa', 'tommy', 'tovar', 'triton', 'trollhd', 'tsint', 'ttg', 'tva', 'tvr', 'tvsmash', 'twaseries', 'twisted', 'tx', 'ultimatex264', 'umd', 'umf', 'underbelly', 'universum', 'unveil', 'useless', 'utr', 'varyg', 'vcdvault', 'vd0n', 'velvet', 'vialle', 'viethd', 'vietnam', 'vision', 'visum', 'voa', 'w0rm', 'w4f', 'w4nk3r', 'wadu', 'walmart', 'wankaz', 'wdym', 'webdv', 'welp', 'whatelse', 'whiskeyjack', 'whoised', 'wide', 'wiki', 'wildcat', 'wire', 'woke', 'wpi', 'wusiwug', 'xebec', 'xepa', 'xlf', 'xor', 'xtm', 'xxx4u', 'yassmiso', 'yawnix', 'ycdv', 'yello', 'yellowbird', 'yestv', 'yify', 'youforgottorepackthis', 'yts', 'zero00', 'zerotwo', 'zmnt', 'zorosenpai', 'zq', 'zzgtv'];

            for (let g of groups) {
                const regex = new RegExp(`\\b${g}\\b`, 'i');
                if (regex.test(videoFilenameLower) && regex.test(subTitleLower)) {
                    score += 100;
                    matchedGroup = g;
                    break; 
                }
            }

            // 2. MATCH PRINCIPAL: Sursa (+50 puncte exact, +45 aceeași familie)
            // REMUX e sursă de pe Blu-ray/UHD, dar subtitrările de pe RegieLive de obicei
            // zic doar "BluRay", nu "REMUX" - cuvinte diferite, aceeași categorie de sursă.
            // Grupăm pe familii ca să nu pierdem în fața unui WEB-DL/HDTV doar pentru că
            // textul exact nu se potrivește 1:1.
            const sourceFamilies = {
                disc: ['blu-ray', 'bluray', 'remux', 'bdrip', 'brrip', 'hddvd', 'bd', 'uhd'],
                web: ['web-dl', 'webdl', 'webrip', 'web'],
                tv: ['hdtv', 'pdtv', 'dsr', 'tvrip'],
                dvd: ['dvdrip', 'dvdscr', 'screener', 'scr', 'r5', 'hdrip'],
                cam: ['telesync', 'telecine', 'hdcam', 'cam', 'ts', 'tc']
            };

            function detectSourceFamily(text) {
                for (const familyName in sourceFamilies) {
                    for (const kw of sourceFamilies[familyName]) {
                        if (text.includes(kw)) return { family: familyName, keyword: kw };
                    }
                }
                return null;
            }

            const videoSource = detectSourceFamily(videoFilenameLower);
            const subSource = detectSourceFamily(subTitleLower);

            if (videoSource && subSource) {
                if (videoSource.keyword === subSource.keyword) {
                    score += 50;
                    sourceMatch = videoSource.keyword;
                } else if (videoSource.family === subSource.family) {
                    score += 45;
                    sourceMatch = `${subSource.keyword}~${videoSource.keyword}`;
                }
            }

            // 3. MATCH SECUNDAR: Rezoluția (+20 puncte) — break la primul match
            const resolutions = ['2160p', '1080p', '720p', '480p'];
            for (let res of resolutions) {
                if (videoFilenameLower.includes(res) && subTitleLower.includes(res)) {
                    score += 20;
                    resMatch = res;
                    break;
                }
            }

            // 4. SEZON + EPISOD pentru seriale (+80 match complet, +40 doar sezon)
            // Cel mai important criteriu de departajare pentru seriale cu subtitrari multiple.
            const seMatch = videoFilenameLower.match(/s(\d{1,2})e(\d{1,2})/i) ||
                            videoFilenameLower.match(/(\d{1,2})x(\d{1,2})/i);
            if (seMatch) {
                const season = seMatch[1].padStart(2, '0');
                const episode = seMatch[2].padStart(2, '0');
                const subHasFull = subTitleLower.includes(`s${season}e${episode}`) ||
                                   subTitleLower.includes(`${parseInt(season)}x${parseInt(episode)}`);
                const subHasSeason = subTitleLower.includes(`s${season}`) ||
                                     subTitleLower.includes(`season ${parseInt(season)}`);
                if (subHasFull) {
                    score += 80;
                    breakdown.seEpisode = `S${season}E${episode}(+80)`;
                } else if (subHasSeason) {
                    score += 40;
                    breakdown.seEpisode = `S${season}(+40)`;
                }
            }

            // 5. ANUL filmului (+30) — util pentru remake-uri (ex: Dune 1984 vs 2021)
            const yearMatch = videoFilenameLower.match(/\b(19|20)\d{2}\b/);
            if (yearMatch && subTitleLower.includes(yearMatch[0])) {
                score += 30;
                breakdown.year = `${yearMatch[0]}(+30)`;
            }

            // 6. CODEC (+15) — bonus minor cand uploaderii il mentioneaza explicit
            const codecs = ['x265', 'hevc', 'x264', 'h264', 'av1'];
            for (const codec of codecs) {
                if (videoFilenameLower.includes(codec) && subTitleLower.includes(codec)) {
                    score += 15;
                    breakdown.codec = `${codec}(+15)`;
                    break;
                }
            }

            // 7. SOFT TOKEN OVERLAP — fallback cand nu exista match puternic
            // Ex: "Black Sails - S03E01.mkv" fara release group/sursa
            if (score < 50 && videoFilenameLower) {
                const videoTokens = videoFilenameLower
                    .replace(/[^\w\s]/g, ' ')
                    .split(/\s+/)
                    .filter(t => t.length > 2);
                let common = 0;
                for (const token of videoTokens) {
                    if (subTitleLower.includes(token)) common++;
                }
                if (common >= 3) {
                    const softBonus = Math.min(common * 5, 25);
                    score += softBonus;
                    breakdown.softMatch = `${common} tokene comune(+${softBonus})`;
                }
            }
        }

        // 4. NOTA RegieLive ca departajare finală
        const ratingNum = parseFloat(rating);
        if (!isNaN(ratingNum)) {
            score += ratingNum; 
        }

        return { score, breakdown: { matchedGroup, sourceMatch, resMatch, ...breakdown, rating: isNaN(ratingNum) ? null : ratingNum } };
    }

    let subtitles = subs.map(sub => {
        const downloadUrl = sub.url.startsWith('http') ? sub.url : `https://subtitrari.regielive.ro${sub.url}`;
        const { score, breakdown } = calculateScore(sub.title, sub.rating);

        return {
            id: sub.id,
            url: `${APP_URL}/download.vtt?url=${encodeURIComponent(downloadUrl)}&cookie=${encodeURIComponent(sub.cookie || '')}`,
            lang: "ron", 
            title: sub.title || "RegieLive",
            score,
            breakdown
        };
    });

    // Ordonăm lista descrescător. (logica de sortare NESCHIMBATĂ)
    subtitles.sort((a, b) => b.score - a.score);

    // --- LOGGING DE DIAGNOSTIC (nu influențează alegerea/ordinea, doar o afișează) ---
    console.log(`\n[SCOR] Clasament subtitrări pentru "${videoFilename || '(fără nume fișier)'}":`);
    subtitles.forEach((sub, i) => {
        const b = sub.breakdown;
        const parts = [];
        if (b.matchedGroup) parts.push(`grup:${b.matchedGroup}(+100)`);
        if (b.seEpisode) parts.push(`SE:${b.seEpisode}`);
        if (b.sourceMatch) parts.push(`sursă:${b.sourceMatch}`);
        if (b.year) parts.push(`an:${b.year}`);
        if (b.resMatch) parts.push(`rez:${b.resMatch}(+20)`);
        if (b.codec) parts.push(`codec:${b.codec}`);
        if (b.softMatch) parts.push(`soft:${b.softMatch}`);
        if (b.rating !== null) parts.push(`rating RegieLive:${b.rating}`);
        const marker = i === 0 ? '  <-- ALEASĂ AUTOMAT' : '';
        console.log(`  #${i + 1} [scor ${sub.score}] "${sub.title}" — ${parts.join(', ') || 'fără potriviri'}${marker}`);
    });

    // Curățăm câmpurile suplimentare (score, breakdown) - Stremio primește doar ce trebuie
    subtitles = subtitles.map(sub => ({
        id: sub.id,
        url: sub.url,
        lang: sub.lang,
        title: sub.title
    }));

    return { subtitles: subtitles };
});

module.exports = builder.getInterface();
