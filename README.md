# doGiorsHadEnough-SkyStream 🇮🇹

Repository di estensioni italiane native per [SkyStream](https://github.com/akashdh11/skystream), interamente convertita e riscritta in TypeScript dal repository CloudStream [doGiorsHadEnough](https://github.com/doGior/doGiorsHadEnough) di [doGior](https://github.com/doGior).

Progettata nativamente per l'architettura **SkyStream Gen 2** con supporto a mirror dinamici (`manifest.baseUrl`), sub-providers, compilazione automatizzata e piena compatibilità con l'ecosistema iOS e Android.

---

## 🚀 Installazione in SkyStream

Per aggiungere questa repository alla tua applicazione SkyStream:

1. Apri **SkyStream**.
2. Vai su **Impostazioni (Settings)** > **Estensioni (Extensions)**.
3. Clicca su **Aggiungi Repository (Add Repository)**.
4. Inserisci il seguente URL:

```text
https://raw.githubusercontent.com/skystreamita/doGiorsHadEnough-SkyStream/main/repo.json
```
*(Sostituisci `USER_NAME` con il tuo username GitHub se hai effettuato un fork)*

5. Installa o aggiorna i plugin desiderati con un click!

---

## 📊 Stato dei Provider Convertiti

Tutti i provider sono stati verificati e testati tramite la CLI ufficiale `skystream test` sulle quattro funzioni fondamentali (`getHome`, `search`, `load`, `loadStreams`):

| Provider | Tipo Contenuto | Qualità / Sorgente | Specifica Gen 2 | Stato Test CLI |
| :--- | :--- | :--- | :--- | :---: |
| **StreamingCommunity** | Film, Serie TV, Documentari | Full HD HLS (VixCloud Extractor nativo) | Mirror domains | ✅ 100% Funzionante |
| **AnimeWorld** | Anime Sub-ITA e Doppiati | DDL Diretto (SweetPixel MP4) & StreamTape | Mirror domains | ✅ 100% Funzionante |
| **AnimeUnity** | Anime Sub-ITA e Doppiati | Full HD HLS (VixCloud Extractor nativo) | Mirror domains | ✅ 100% Funzionante |
| **Arte** | Film, Serie d'autore, Documentari | HLS Master Diretto (Akamaized CDN) | Official API | ✅ 100% Funzionante |
| **CalcioStreaming** | Partite & Eventi Sportivi Live | HLS Master Diretto (Decrittazione Hex/XOR) | Live Streams | ✅ 100% Funzionante |
| **TV** | Canali Televisivi Italiani (Rai, Mediaset, ecc.) | 440+ Stream HLS (Free-TV M3U) | Sub-providers (Sport, News, Kids...) | ✅ 100% Funzionante |
| **Vavoo** | Canali TV & IPTV Internazionali / ITA | HLS Live (Risoluzione MediaHubMX) | Mirror domains | ✅ 100% Funzionante |
| **Il Corsaro Viola / Nero** | Film & Serie Torrent | Magnet Links P2P | Richiede client BitTorrent esterno | ⚠️ P2P / TMDB Dep. |

---

## 🛠️ Caratteristiche Tecniche e Architettura

- **TypeScript Nativo + Bundling Rapido (`esbuild`)**: Nessun residuo JVM/Kotlin o dipendenze native Node. Massima velocità di esecuzione e portabilità su runtime iOS JavaScriptCore e Android V8.
- **Nessun Dominio Hardcodato**: Ogni richiesta HTTP fa riferimento a `manifest.baseUrl`. In caso di cambio dominio o blocco ISP, l'utente può selezionare un mirror funzionante direttamente dalle impostazioni del plugin (`domains`).
- **Sub-Providers per Playlist e Categorie**: I provider multimediali come `TV` sfruttano la direttiva `providers` di SkyStream Gen 2, consentendo di abilitare/disabilitare canali tematici (es. *Italia*, *News*, *Sport*, *Musica*, *Bambini*, *Film*).
- **Estrattori Condivisi**:
  - `src/extractors/vixcloud.ts`: decodifica e risolve token effimeri e playlist FHD di VixCloud usati da StreamingCommunity e AnimeUnity.
  - `src/utils/http.ts`: wrapper unificato per le chiamate HTTP di rete SkyStream.

---

## 💻 Guida allo Sviluppo Locale

### Requisiti
- [Node.js](https://nodejs.org/) (versione 18+)
- [skystream-cli](https://www.npmjs.com/package/skystream-cli) (`npm i -g skystream-cli`)

### Installazione Dipendenze
```bash
git clone https://github.com/skystreamita/doGiorsHadEnough-SkyStream.git
cd doGiorsHadEnough-SkyStream
npm install
```

### Compilazione dei Plugin
Compila tutti i file `plugin.ts` in pacchetti ottimizzati `plugin.js`:
```bash
npm run build
```

### Test Locale con SkyStream CLI
Puoi testare ciascun provider direttamente dal terminale:

```bash
# Test StreamingCommunity
skystream test -p ./StreamingCommunity -f getHome
skystream test -p ./StreamingCommunity -f search -q "Dune"
skystream test -p ./StreamingCommunity -f load -q "https://streamingunity.win/it/titles/828-dune"
skystream test -p ./StreamingCommunity -f loadStreams -q "<URL episodio o film>"

# Test AnimeWorld
skystream test -p ./AnimeWorld -f getHome
skystream test -p ./AnimeWorld -f search -q "Attack on Titan"

# Test CalcioStreaming
skystream test -p ./CalcioStreaming -f getHome
skystream test -p ./CalcioStreaming -f search -q "Milan"

# Test TV
skystream test -p ./TV -f getHome
skystream test -p ./TV -f search -q "Rai 1"

# Test Vavoo
skystream test -p ./Vavoo -f getHome
skystream test -p ./Vavoo -f search -q "RTL"
```

### Deploy e Generazione Bundle `.sky`
Per generare i file distribuiti in `dist/` (`.sky` e `plugins.json`):
```bash
skystream deploy -u https://raw.githubusercontent.com/skystreamita/doGiorsHadEnough-SkyStream/main
```

---

## 🤖 GitHub Actions CI/CD

Il repository include un flusso di lavoro GitHub Actions (`.github/workflows/build.yml`) configurato per:
1. Rilevare ogni push su `main`.
2. Eseguire la compilazione dei sorgenti TypeScript via `esbuild`.
3. Eseguire `skystream deploy` generando i bundle `.sky` e aggiornando `dist/plugins.json`.
4. Effettuare il commit e push automatico degli artefatti nella cartella `dist/`.

---

## ⚖️ Disclaimer

Questo progetto è distribuito a solo scopo educativo e di studio dell'architettura estendibile di SkyStream. Gli autori e i contributori non ospitano alcun file multimediale e non sono affiliati a nessuno dei servizi o siti web menzionati.

Tutti i crediti per i provider originali CloudStream vanno a [doGior](https://github.com/doGior) e alla community italiana.
