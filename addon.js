const { addonBuilder } = require("stremio-addon-sdk");
const manifest = require("./manifest");
const { searchRegieLive } = require("./lib/regielive");

const builder = new addonBuilder(manifest);

// URL dinamic pentru Render sau Local
const APP_URL = process.env.APP_URL || "http://127.0.0.1:7000";

builder.defineSubtitlesHandler(async function(args) {
    const subs = await searchRegieLive(args.id, args.type);
    
    if (!subs || subs.length === 0) return { subtitles: [] };

    const videoFilename = (args.extra && args.extra.filename) ? args.extra.filename.toLowerCase() : "";

    function calculateScore(subTitle, rating) {
        let score = 0;
        const subTitleLower = (subTitle || "").toLowerCase();

        if (videoFilename) {
            // 1. MATCH SUPREM (+100 puncte)
            const groups = ['0mnidvd', '0tv', '1920', '20ripz', '2hd', '2pacaveli', '3ctweb', '3l', '433', '4fr', '4hm', '4kbec', '4khd', '7sins', 'a4o', 'aaf', 'aas', 'abbie', 'abd', 'abez', 'acclaim', 'aced', 'adhd', 'admirals', 'adrenaline', 'adweb', 'ae', 'aegis', 'aek', 'aen', 'aeroholics', 'afo', 'aggr0', 'airforce', 'airline', 'airwaves', 'aisha', 'ajp69', 'aldi', 'alliance', 'amber', 'ambitious', 'amiable', 'amrap', 'amstel', 'anarchy', 'anbc', 'angelic', 'anihls', 'anivcd', 'ao', 'aoc', 'apex', 'apl', 'aqua', 'archivist', 'argon', 'ariestv', 'arigold', 'arisco', 'ariscrapaysites', 'arrow', 'artemix', 'arthouse', 'asap', 'asister', 'atelier', 'aterfallet', 'atotik', 'ats', 'av1svasi', 'avcdvd', 'avchd', 'avs', 'avs720', 'aw', 'awake', 'azninvasion', 'azurray', 'b3yg1r', 'bae', 'bajskorv', 'baked', 'bamhd', 'bass', 'bbq', 'bdisc', 'beesknees', 'ben.the.men', 'bfm', 'bhdstudio', 'bia', 'bigdoc', 'bioma', 'bitor', 'bizkit', 'blaze', 'bloom', 'bluetv', 'bluranium', 'blutonium', 'bmdru', 'bmf', 'bob', 'bravery', 'brg', 'bs', 'btbn', 'btm', 'btn', 'btsd', 'btw', 'burcyg', 'byndr', 'c0ke', 'caffeine', 'cakes', 'cansiz', 'casstudio', 'cbfm', 'cdd', 'cddhd', 'cebex', 'cg1989', 'chakra', 'chara', 'chd', 'chdsubs', 'chdweb', 'chortle', 'chotab', 'chronicles', 'cia', 'cinefeel', 'cinefile', 'cinefox', 'cinemaniacs', 'cinematic', 'cinemix', 'cinephiles', 'cit', 'classic', 'cmrg', 'coalition', 'coaster', 'codswallop', 'cojonudo', 'compulsion', 'coo7', 'cookiemonster', 'counterfeit', 'cpt', 'cpy', 'cravers', 'crfw', 'crimson', 'crisc', 'critter2376', 'crow', 'crud', 'ct', 'ctrlhd', 'ctrlsd', 'ctu', 'd-z0n3', 'd3g', 'dariush', 'darksaber', 'dawn', 'db', 'deadbadugly', 'decibel', 'deep', 'deflate', 'deimos', 'dermagic', 'deuterium', 'dh', 'digger', 'dimension', 'dirt', 'dkv', 'don', 'dracula', 'drm1', 'dunghill', 'dust', 'ea', 'ebp', 'eclipse', 'edge2020', 'edhd', 'edith', 'edph', 'egen', 'elite', 'encounters', 'end', 'endeavour', 'epsilon', 'erix', 'ethel', 'ethics', 'evolve', 'exploit', 'eztv', 'factory', 'family', 'fc', 'felix', 'fenix', 'fever', 'fgt', 'flame', 'flhd', 'flights', 'florix', 'flux', 'forbidden', 'fov', 'fqm', 'framestor', 'fts', 'futv', 'fw', 'galaxytv', 'gang', 'gardai', 'geckos', 'geek', 'ggez', 'ghd', 'ghost', 'ghouls', 'glhf', 'gnome', 'gnomission', 'goki', 'gossip', 'gprs', 'grace', 'haggis', 'hallowed', 'hawes', 'hdchina', 'hddt', 'hdex', 'hdmi', 'hdsky', 'hdtime', 'herkz', 'heteam', 'hhweb', 'hidt', 'hifi', 'hightimes', 'hiqve', 'hisd', 'hodl', 'hone', 'hqmux', 'huzzah', 'ift', 'ijp', 'ika', 'ime', 'immerse', 'inchy', 'infinity', 'inflate', 'inspirit', 'it00nz', 'ivy', 'jamtarts', 'jatt', 'jbee', 'jenkins', 'jetix', 'jmess', 'joebee', 'jr', 'kamikaze', 'khn', 'killers', 'kimchi', 'kimji', 'kingturd', 'kings', 'kitsune', 'kogi', 'kontrast', 'kralimarko', 'kratos', 'kyogo', 'lazy', 'lazers', 'legi0n', 'linkle', 'lion', 'littleblueman', 'loki', 'lol', 'lolhd', 'lootera', 'lord', 'lostfilm', 'lunar', 'madsky', 'magicstar', 'mainframe', 'mama', 'mch', 'meech', 'megusta', 'mercator', 'mesc', 'mhysa', 'midweek', 'miu', 'mjolnir', 'mnkyddl', 'monkee', 'mortyrick', 'mrhulk', 'mrn', 'mteam', 'mv', 'mzabi', 'n1h4l', 'nailedit', 'naisu', 'ncmt', 'neonoir', 'newman', 'ngr', 'nhtfs', 'nikt0', 'nima4k', 'ninjacentral', 'nitsua', 'nogroup', 'nogrp', 'noma', 'nortekst', 'nosivid', 'noxxus', 'npms', 'ntb', 'ntg', 'nyh', 'o69', 'oft', 'onlyfaffs', 'orbitron', 'ouija', 'ourbits', 'oxidizer', 'panda', 'pawel2006', 'paxa', 'pexa', 'pfa', 'phocis', 'phoenix', 'pi', 'pieguy', 'pike', 'pitbull', 'playbd', 'playhd', 'playweb', 'plutonium', 'pmhd', 'pmp', 'pof', 'poiasd', 'poppers', 'poppycock', 'pow4hd', 'pragma', 'primefix', 'prodji', 'psa', 'psig', 'pter', 'ptg', 'ptp', 'qash', 'qfg', 'qman', 'qoq', 'quintessence', 'qxr', 'r&h', 'r0cked', 'ralphy', 'rapta', 'rarbg', 'rawr', 'rcsw', 'rcvr', 'regedits', 'regret', 'revils', 'reward', 'river', 'rng', 'roccat', 'rogue', 'rovers', 'rtfm', 'rtn', 'rumour', 's14', 'sa89', 'sadpanda', 'saints', 'saphire', 'sbr', 'sdcc', 'sector7', 'seedpool', 'seriously', 'sexsh0p', 'sfm', 'shieldbearer', 'shieldearer', 'shortbrehd', 'sic', 'sicfoi', 'sighthd', 'sigma', 'silence', 'siluhd', 'sinners', 'siq', 'sitv', 'skizoid', 'skyfire', 'slignome', 'slm', 'sloth', 'smd', 'smurf', 'sow', 'sparks', 'sphd', 'spid3r', 'spirit', 'squalor', 'stc', 'strife', 'strontium', 'successfulcrab', 'sumvision', 'sunspot', 'surfinbird', 'svd', 'swaglander', 'swtyblz', 'sys', 't00ng0d', 't4h', 't6d', 'tabularia', 'taoe', 'tayto', 'tbn', 'tbs', 'tcm', 'tdd', 'telly', 'tepes', 'terra', 'tgx', 'thefarm', 'thelastofus', 'thewretched', 'thx', 'tikos', 'timelords', 'tizu', 'tjupt', 'tl', 'tlf', 'tn', 'tnp', 'toa', 'tommy', 'tovar', 'triton', 'trollhd', 'tsint', 'ttg', 'tva', 'tvr', 'tvsmash', 'twaseries', 'twisted', 'tx', 'ultimatex264', 'umd', 'umf', 'underbelly', 'universum', 'unveil', 'useless', 'utr', 'varyg', 'vcdvault', 'vd0n', 'velvet', 'vialle', 'viethd', 'vietnam', 'vision', 'visum', 'voa', 'w0rm', 'w4f', 'w4nk3r', 'wadu', 'walmart', 'wankaz', 'wdym', 'webdv', 'welp', 'whatelse', 'whiskeyjack', 'whoised', 'wide', 'wiki', 'wildcat', 'wire', 'woke', 'wpi', 'wusiwug', 'xebec', 'xepa', 'xlf', 'xor', 'xtm', 'xxx4u', 'yassmiso', 'yawnix', 'ycdv', 'yello', 'yellowbird', 'yestv', 'yify', 'youforgottorepackthis', 'yts', 'zero00', 'zerotwo', 'zmnt', 'zorosenpai', 'zq', 'zzgtv'];

            for (let g of groups) {
                const regex = new RegExp(`\\b${g}\\b`, 'i');
                if (regex.test(videoFilename) && regex.test(subTitleLower)) {
                    score += 100;
                    break; 
                }
            }

            // 2. MATCH PRINCIPAL: Sursa (+50 puncte)
            const sources = ['remux', 'bluray', 'bdrip', 'brrip', 'web-dl', 'webrip', 'web', 'hdtv', 'dvdrip', 'dvdscr', 'hdcam', 'cam'];
            for (let s of sources) {
                if (videoFilename.includes(s) && subTitleLower.includes(s)) score += 50;
            }
            
            // 3. MATCH SECUNDAR: Rezoluția (+20 puncte)
            const resolutions = ['2160p', '1080p', '720p', '480p'];
            for (let res of resolutions) {
                if (videoFilename.includes(res) && subTitleLower.includes(res)) score += 20;
            }
        }

        // 4. NOTA RegieLive ca departajare finală
        const ratingNum = parseFloat(rating);
        if (!isNaN(ratingNum)) {
            score += ratingNum; 
        }

        return score;
    }

    let subtitles = subs.map(sub => {
        const downloadUrl = sub.url.startsWith('http') ? sub.url : `https://subtitrari.regielive.ro${sub.url}`;
        
        return {
            id: sub.id,
            url: `${APP_URL}/download?url=${encodeURIComponent(downloadUrl)}&cookie=${encodeURIComponent(sub.cookie || '')}`,
            lang: "ron", 
            title: sub.title || "RegieLive",
            score: calculateScore(sub.title, sub.rating)
        };
    });

    // Ordonăm lista descrescător.
    subtitles.sort((a, b) => b.score - a.score);

    // Curățăm câmpul 'score'
    subtitles = subtitles.map(sub => ({
        id: sub.id,
        url: sub.url,
        lang: sub.lang,
        title: sub.title
    }));

    return { subtitles: subtitles };
});

module.exports = builder.getInterface();
