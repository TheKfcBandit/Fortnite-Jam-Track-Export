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

| Destination | Header |
| --- | --- |
| Soundiiz CSV | `title,artist` |
| TuneMyMusic text | none — `Artist - Title`, one per line |
| TuneMyMusic CSV | `Track name,Artist name` |
| Review CSV | `status,title,artist,exportTitle,exportArtist,album,addedToFortnite,releaseYear,note` — every track and why it was kept or dropped |

Both importers match columns **by name**, not position, so each export declares only the
columns it needs. The dataset carries no ISRCs, so no `isrc` column is emitted.

`Track name` / `Artist name` is the spelling TuneMyMusic recognizes and the spelling its
own CSV exports use. Soundiiz ignores columns it does not recognize, so a lowercase
`title,artist` header is fine there.

### Why there is no album column by default

An album can only *narrow* an import tool's search, never widen it, and the album names
here are hand-written rather than taken from the streaming service. In a real 599-track
Soundiiz import, three of the nine misses were tracks where this app had supplied an album
the service disagreed with. Turn on **Send album names** in Fine-tune if you want it — it
genuinely helps a generic title — but it is off by default because a wrong album turns a
findable track into a miss.

## Presets

**Recommended** keeps the tracks people mean by "real songs": it excludes Epic/Fortnite
originals and Fortnite-specific remixes and rearrangements, and sends hard-to-match
library/stock tracks to review instead of pretending they will import cleanly.

**Broad** still excludes Epic/Fortnite material but puts the hard-to-match licensed tracks
in the main export.

**Complete** exports every Jam Track in the dataset. Good for archival lists, bad for
Spotify matching.

**Custom** is whatever you set the Fine-tune switches to. Touching any switch by hand
selects it automatically — except **Fix known bad titles** and **Send album names**, which
are formatting choices rather than a decision about which songs to include.

### How a track's status is decided

Highest precedence first:

1. Your **Keep** / **Drop** choice from the review table
2. Tracks your import tool reported as not found (see below)
3. The custom exclude filter
4. "Only tracks with a Spotify preview", when a track has no preview URL
5. Epic/Fortnite original
6. Fortnite-specific remix or rearrangement
7. Hard-to-match library/stock track → **review**
8. Otherwise → **include**

"Epic/Fortnite original" is decided by the track's artist, plus a small set of pinned
track **ids** in `core.js` for anything credited to someone else. That set is matched
against ids only — several of its entries (`change`, `dreamer`, `bloom`, `runit`,
`turnup`) are ordinary song titles, so comparing titles against it would silently drop
real licensed songs.

The id pins exist because some Epic-commissioned tracks are credited to fictional in-game
bands rather than "Epic Games" — `Runamok` by "Tasty Bois (ft. Backchat)" is a Battle Pass
/ Item Shop track with nothing in its artist string to give it away, and it can never match
on a streaming service. If you find another, add its id to `ORIGINAL_IDS`, or just drop it
with the custom exclude filter.

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
- `A Bar Song` → `A Bar Song (Tipsy)` by Shaboozey
- `Rocket Man` → `Rocket Man (I Think It's Going To Be A Long Long Time)` by Elton John
- `Locked & Loaded` → `Locked & Loaded (Official Fortnite Anthem)` by d4vd
- `Popular` by `The Weeknd, Madonna & Playboi Carti` → the lead artist alone, `The Weeknd`

Aliases can also make matching *worse*. `World Is Mine` used to be rewritten to
`Hatsune Miku`, and failed — while `Melt`, credited to the same raw
`ryo (supercell) ft. Hatsune Miku` string, matched with no alias at all. That rewrite was
removed. Every alias here is only as good as the last real import that tested it.

Turn them off with "Fix known bad titles automatically". A few aliases are marked
review-only: they're shown as a hint but never substituted into an export, because the
Fortnite version isn't a normal streaming release.

## When songs don't import

No import is perfect. A real 599-track Soundiiz run matched 590 and missed 9 — titles
Fortnite displays in shortened form, a multi-artist credit in the wrong order, and one
Fortnite-exclusive track that simply does not exist on streaming.

Soundiiz hands back a result CSV with an `isFound` column. Paste the **whole file** into
the panel on step 4 — only the `isFound=0` rows are read — and you get two options:

- **Drop these and rebuild my file** marks those tracks as not found and leaves them out,
  so you can download a clean file and import it without hitting the same errors. Rows that
  don't match any Jam Track are reported rather than silently ignored, and **Put them back**
  reverses it. A manual **Keep** on step 3 still overrules a drop.
- **Suggest retries** gives cleaner searches for the misses, using the same alias rules plus
  automatic cleanup of featured credits and Fortnite subtitles.

The pasted CSV holds whatever was exported, which may be an aliased title, so each track is
looked up under both its exported and its original Fortnite form.

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
npm test          # 94 unit tests against assets/core.js
```

The browser tests need Playwright:

```bash
npm install
npm run test:e2e  # 35 end-to-end tests driving index.html in Chromium
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
