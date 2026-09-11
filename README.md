# Fortnite Jam Tracks → Playlist

A small static web app that turns the current Fortnite Festival Jam Track catalog into
playlist-import files for Soundiiz and TuneMyMusic.

It's a four-step wizard: pick where you're sending the playlist, pick which songs count,
review the decisions, download the file. No build step, no API key, no backend, no account
access — everything runs in your browser.

## The four steps

1. **Destination** — Soundiiz CSV, TuneMyMusic text, TuneMyMusic CSV, or a Review CSV.
2. **Songs** — a preset (Recommended / Broad / Complete / Custom), the track order, and an
   optional **Fine-tune** panel with six switches and a custom exclude filter.
3. **Review** — counts you can click to filter, a search box, and a **Keep** / **Drop**
   button on every row to overrule the filter. Your choices persist when you change presets;
   press the same button again to hand the track back to the automatic rules.
4. **Download** — copy to the clipboard, download the one file, or download all four
   formats at once. The Soundiiz not-found helper lives here too.

Track data loads automatically when the page opens. If the fetch fails you get an
explanation and a small demo dataset so the wizard stays usable.

## Export formats

| Destination | Output |
| --- | --- |
| Soundiiz CSV | `title,artist,album,isrc,` (the trailing comma is required by Soundiiz) |
| TuneMyMusic text | `Artist - Title`, one per line, no header |
| TuneMyMusic CSV | `artist,title,album` |
| Review CSV | `status,title,artist,exportTitle,exportArtist,album,addedToFortnite,releaseYear,note` — every track and why it was kept or dropped |

## Presets

**Recommended** keeps the tracks people mean by "real songs": it excludes Epic/Fortnite
originals and Fortnite-specific remixes and rearrangements, and sends hard-to-match
library/stock tracks to review instead of pretending they will import cleanly.

**Broad** still excludes Epic/Fortnite material but puts the hard-to-match licensed tracks
in the main export.

**Complete** exports every Jam Track in the dataset. Good for archival lists, bad for
Spotify matching.

**Custom** is whatever you set the Fine-tune switches to. Touching any switch by hand
selects it automatically.

### How a track's status is decided

Highest precedence first:

1. Your **Keep** / **Drop** choice from the review table
2. The custom exclude filter
3. "Only tracks with a Spotify preview", when a track has no preview URL
4. Epic/Fortnite original
5. Fortnite-specific remix or rearrangement
6. Hard-to-match library/stock track → **review**
7. Otherwise → **include**

## Custom exclude filter

Under **Fine-tune**, this drops any track matching a pattern, without editing code:

```text
Slipstream Music|Bruno-San
/Fortnite Rearrangement|Epic Games/i
```

Plain text is matched case-insensitively; `/pattern/flags` gives you control of the flags.
The pattern is matched against each track's title, artist, id, release year, added date and
generated filter reasons — so `Epic/Fortnite original` works as a pattern even though those
words appear nowhere in the data. An invalid pattern is ignored and reported inline rather
than filtering anything.

## Matching aliases

Aliases are intentionally small and readable. They don't claim to be perfect streaming
metadata — they exist to improve import-tool search queries for known-difficult entries:

- `Work Work` → `Work Bitch` by Britney Spears (Fortnite censors the display title)
- `Yoru Ni Kakeru` → `夜に駆ける` by YOASOBI
- `Takaneno Hanakosan` → `高嶺の花子さん` by back number
- `Surround Sound` by `JID ft. 21 Savage & Baby Tate` → `Surround Sound (feat. 21 Savage & Baby Tate)` by JID

Turn them off with "Fix known bad titles automatically". A few aliases are marked
review-only: they're shown as a hint but never substituted into an export, because the
Fortnite version isn't a normal streaming release.

## Soundiiz not-found helper

Soundiiz can export the rows it failed to match (`isFound=0`). Paste that CSV into the
helper on step 4 and you get cleaner retry searches, using the same alias rules plus
automatic cleanup of featured credits and Fortnite subtitles.

## Host on GitHub Pages

1. Create a new GitHub repository.
2. Copy `index.html` and the `assets/` folder into the repo root.
3. Commit and push.
4. In GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**.
5. Choose your default branch and `/root`, then save.

Your site will be at `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/`.

Only `index.html` and `assets/` are needed to serve the site. `tests/` and `package.json`
are for development and can be left out of a deployment.

## Run locally

```bash
python3 -m http.server 8080   # or: npm run serve
```

Then open <http://localhost:8080>.

Opening `index.html` directly from disk also works — the scripts are plain classic scripts,
not ES modules, specifically so that `file://` keeps working — but a local server is closer
to how the page is really served.

## Tests

Unit tests need nothing but Node 18+:

```bash
npm test          # 71 unit tests against assets/core.js
```

The browser tests need Playwright:

```bash
npm install
npm run test:e2e  # 29 end-to-end tests driving index.html in Chromium
npm run test:all  # both suites
```

The end-to-end suite intercepts the dataset request and answers it with
`tests/fixtures/tracks.sample.json`, so it never touches the network. It walks all four
steps, exercises every control, checks each export's header and filename, forces tracks in
and out, verifies a real download, and asserts the page raises **no uncaught errors** and
references no missing elements — the failure mode that previously left most of the UI inert.

## Project structure

```text
.
├── index.html                        wizard markup
├── assets
│   ├── core.js                       all rules and formats, no DOM
│   ├── app.js                        wizard controller, all DOM
│   └── styles.css
├── tests
│   ├── unit/core.test.cjs
│   ├── e2e/wizard.test.cjs
│   └── fixtures/tracks.sample.json
├── package.json                      dev scripts and Playwright
├── LICENSE
└── README.md
```

`core.js` holds every rule — filters, presets, aliases, sorting, CSV building — and touches
no DOM, so it's testable in plain Node. `app.js` owns the DOM and nothing else. Every
element lookup in `app.js` goes through a helper that warns and carries on instead of
throwing, and a test asserts those warnings never appear.

## Data notes

The app uses the dataset's `createdAt` field for "added to Fortnite" sorting. Many older
Jam Tracks were imported into the dataset on the same day, so several hundred tracks share
one date. That's the best date this data source offers without a second scraper.

Around 110 of the ~717 tracks have no `previewUrl`. That's noted as a reason on the track
but doesn't exclude it unless you turn on "Only tracks with a Spotify preview".

## Not affiliated

This is a fan-made utility. It is not affiliated with Epic Games, Fortnite, Spotify,
Soundiiz, TuneMyMusic, or FNFestival.
