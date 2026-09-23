# Ghid de instalare / Installation Guide

**[English](#english)** | **[Română](#română)**

---

<a name="română"></a>
## 🇷🇴 Română

### De ce propria ta copie, nu link-ul deja existent?

RegieLive limitează numărul de cereri **pe adresă IP**. Instanța mea publică (`stremio-regielive-rjps.onrender.com`) rulează pe un singur IP partajat între mine și câțiva prieteni — dacă mai multă lume s-ar conecta la ea, toată lumea ar începe să primească erori de tip "prea multe cereri". De-asta acest ghid te ajută să-ți faci **propria instanță**, gratuit, cu adresa ta de IP separată. Durează 5-10 minute, nu necesită experiență de programare.

### 🤖 Vrei ca un AI să facă asta pentru tine?

Dacă folosești un asistent AI cu acces la unelte (Claude Code, Cursor, ChatGPT cu acces la browser etc.), copiază și trimite-i acest mesaj:

> Vreau să instalez propria copie a addon-ului de subtitrări **stremio-regielive** (`github.com/monkeyzelite-rgb/stremio-regielive`) pentru Stremio, ca să am propriul IP și să nu depind de instanța publică a autorului. Urmează exact pașii din fișierul `INSTALL.md` din acel repo: ajută-mă să fac fork pe GitHub, ajută-mă să creez (dacă nu am) un cont gratuit pe Render.com, ghidează-mă să conectez fork-ul meu ca Web Service pe Render (repo-ul are deja un `render.yaml`, ar trebui să completeze totul automat), și la final dă-mi link-ul către `manifest.json` ca să-l adaug în Stremio. Explică-mi pe scurt fiecare pas înainte să-l faci.

Restul acestui fișier e scris ca să poată fi urmat 1:1 și de un AI, și de tine manual — pașii sunt expliciți, cu comenzi/setări exacte, fără presupuneri.

### Ce ai nevoie

- Un cont GitHub (gratuit) — [github.com/signup](https://github.com/signup)
- Un cont Render (gratuit, fără card necesar pentru planul free) — [render.com](https://render.com)
- Stremio instalat pe orice dispozitiv (telefon, PC, TV)

### Pas cu pas

**1. Fork pe GitHub**
Pe [pagina repo-ului](https://github.com/monkeyzelite-rgb/stremio-regielive), apasă butonul **Fork** (dreapta-sus). Primești propria copie la `github.com/NUMELE-TĂU/stremio-regielive`.

**2. Cont Render**
Mergi pe [render.com](https://render.com), **Get Started** → conectează-te cu contul de GitHub (recomandat, se leagă automat de fork-ul tău).

**3. Deploy**
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/monkeyzelite-rgb/stremio-regielive)

Apasă butonul de mai sus (sau, din dashboard-ul Render: **New +** → **Blueprint**) și alege fork-ul tău. Repo-ul conține deja un fișier `render.yaml`, deci Render completează automat totul: comanda de build (`npm install`), comanda de pornire, regiunea, planul gratuit, și generează singur o cheie `ADMIN_KEY` sigură. Nu trebuie să completezi nimic manual — doar apasă **Deploy** / **Apply**.

*(Dacă preferi manual, din New + → Web Service: Build Command `npm install`, Start Command `node keep-alive.js & node server.js`, Plan Free.)*

**4. Așteaptă build-ul (1-2 minute)**
Când e gata, Render îți arată un URL de forma `https://numele-serviciului-tau.onrender.com`.

**5. Verifică**
Deschide `https://numele-serviciului-tau.onrender.com/manifest.json` într-un browser — dacă vezi un text JSON (nu o eroare), funcționează.

**6. Adaugă în Stremio**
Deschide Stremio → **Addoni** (iconița puzzle) → în bara de căutare de sus lipește:
```
https://numele-serviciului-tau.onrender.com/manifest.json
```
→ **Instalează**.

**7. Gata**
Caută orice film/serial, deschide-l, și subtitrările în română de pe RegieLive ar trebui să apară în listă.

### Opțional, dar recomandat

- **Dacă vrei să ai instalate simultan și instanța ta, și una a altcuiva** (ex. a mea): schimbă `"id"` din `manifest.json` (linia 2) în ceva unic, de ex. `"com.stremio.regielive.NUMELE_TAU"`, înainte de a face push — altfel Stremio le poate confunda.
- **Cheia de admin** (`ADMIN_KEY`): dacă ai folosit butonul Deploy/Blueprint, Render ți-a generat deja una singur (o vezi în Render → serviciul tău → tab **Environment**). O folosești doar dacă vrei să golești manual cache-ul serverului, la `https://.../admin/clear-cache?key=CHEIA_TA` — nu e nevoie s-o folosești niciodată dacă nu vrei.
- **Free tier Render**: serviciul "adoarme" după ~15 minute de inactivitate și durează câteva secunde să se trezească la prima cerere după o pauză — normal, nu e o eroare. Repo-ul are deja un mecanism de auto-ping (`keep-alive.js`) care reduce cât de des se întâmplă asta.

### Testare locală (opțional, pentru cei cu Node.js instalat)

```bash
git clone https://github.com/NUMELE-TĂU/stremio-regielive.git
cd stremio-regielive
npm install
node server.js
```
Apoi adaugă `http://127.0.0.1:7000/manifest.json` în Stremio — funcționează doar cât timp ai comanda pornită pe calculatorul tău.

---

<a name="english"></a>
## 🇬🇧 English

### Why run your own copy instead of using the existing link?

RegieLive rate-limits requests **per IP address**. My public instance (`stremio-regielive-rjps.onrender.com`) runs on a single IP shared between me and a few friends — if more people connected to it, everyone would start hitting "too many requests" errors. This guide helps you spin up **your own instance**, for free, with your own separate IP. Takes 5-10 minutes, no coding experience required.

### 🤖 Want an AI to do this for you?

If you're using an AI assistant with tool access (Claude Code, Cursor, ChatGPT with browser access, etc.), copy and send it this:

> I want to install my own copy of the **stremio-regielive** subtitle addon (`github.com/monkeyzelite-rgb/stremio-regielive`) for Stremio, so I have my own IP instead of relying on the author's public instance. Follow the steps in that repo's `INSTALL.md` exactly: help me fork it on GitHub, help me create a free Render.com account if I don't have one, guide me through connecting my fork as a Web Service on Render (the repo already has a `render.yaml`, it should auto-fill everything), and finally give me the `manifest.json` link to add to Stremio. Explain each step briefly before doing it.

The rest of this file is written so it can be followed 1:1 by an AI or by you manually — steps are explicit, with exact commands/settings, no guessing required.

### What you need

- A GitHub account (free) — [github.com/signup](https://github.com/signup)
- A Render account (free, no card required for the free plan) — [render.com](https://render.com)
- Stremio installed on any device (phone, PC, TV)

### Step by step

**1. Fork on GitHub**
On the [repo page](https://github.com/monkeyzelite-rgb/stremio-regielive), click **Fork** (top-right). You get your own copy at `github.com/YOUR-NAME/stremio-regielive`.

**2. Render account**
Go to [render.com](https://render.com), **Get Started** → sign in with your GitHub account (recommended, links automatically to your fork).

**3. Deploy**
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/monkeyzelite-rgb/stremio-regielive)

Click the button above (or from the Render dashboard: **New +** → **Blueprint**) and pick your fork. The repo already includes a `render.yaml`, so Render fills everything in automatically: build command (`npm install`), start command, region, free plan, and it generates a secure `ADMIN_KEY` for you. Nothing to fill manually — just click **Deploy** / **Apply**.

*(If you prefer manual setup, from New + → Web Service: Build Command `npm install`, Start Command `node keep-alive.js & node server.js`, Plan Free.)*

**4. Wait for the build (1-2 minutes)**
Once done, Render shows you a URL like `https://your-service-name.onrender.com`.

**5. Verify**
Open `https://your-service-name.onrender.com/manifest.json` in a browser — if you see JSON text (not an error), it's working.

**6. Add to Stremio**
Open Stremio → **Addons** (puzzle icon) → paste into the top search bar:
```
https://your-service-name.onrender.com/manifest.json
```
→ **Install**.

**7. Done**
Search any movie/show, open it, and Romanian subtitles from RegieLive should show up in the list.

### Optional but recommended

- **If you want your instance and someone else's (e.g. mine) installed at the same time**: change `"id"` in `manifest.json` (line 2) to something unique, e.g. `"com.stremio.regielive.YOUR_NAME"`, before pushing — otherwise Stremio may confuse them.
- **Admin key** (`ADMIN_KEY`): if you used the Deploy/Blueprint button, Render already generated one for you (check Render → your service → **Environment** tab). It's only used to manually clear the server cache at `https://.../admin/clear-cache?key=YOUR_KEY` — you never need to use it if you don't want to.
- **Render free tier**: the service "sleeps" after ~15 minutes of inactivity and takes a few seconds to wake up on the first request after a break — that's normal, not an error. The repo already includes an auto-ping mechanism (`keep-alive.js`) that reduces how often this happens.

### Local testing (optional, for those with Node.js installed)

```bash
git clone https://github.com/YOUR-NAME/stremio-regielive.git
cd stremio-regielive
npm install
node server.js
```
Then add `http://127.0.0.1:7000/manifest.json` to Stremio — this only works while the command is running on your machine.

---

Licență / License: [MIT](LICENSE) — liber de fork, modificat și redistribuit. / free to fork, modify, and redistribute.
