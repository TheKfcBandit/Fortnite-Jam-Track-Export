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
| Soundiiz CSV | `title,artist` plus `album` / `isrc` when something fills them |
| TuneMyMusic text | none — `Artist - Title`, one per line |
| TuneMyMusic CSV | `Track name,Artist name` plus `Album` / `ISRC` when filled |
| Review CSV | `status,title,artist,exportTitle,exportArtist,album,isrc,source,addedToFortnite,releaseYear,note` |

Both importers match columns **by name**, not position, and ignore columns they do not
recognise. So the header is exactly the columns that carry data: a column appears only
once at least one row fills it. The original `title,artist,album,isrc,` header declared a
fifth, nameless column and two that nothing ever populated, which is where the `,,,` on
every line came from.

Once a lookup supplies an ISRC, the `isrc` column appears and rows without one carry an
empty field — that is just how a rectangular CSV works, and those columns are now paying
for themselves instead of being empty everywhere.

### Albums are per-alias, not a setting

Two real imports settled this. The first sent album names, the second did not. Of the
thirteen aliased tracks carrying an album, **nine matched either way, three failed either
way, and exactly one matched only when the album was supplied** — `Lapti Nek`. So the album
lives on that one alias and nowhere else. The global "send albums" switch that briefly
existed was the wrong control: it turned a per-track property into a global one, and
defaulting it off is what broke `Lapti Nek`.

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

A small table of corrections for titles Fortnite displays differently from the streaming
services. They are search hints, not authoritative metadata:

- `Work Work` → `Work Bitch` by Britney Spears (Fortnite censors the display title)
- `Yoru Ni Kakeru` → `夜に駆ける` by YOASOBI
- `A Bar Song` → `A Bar Song (Tipsy)` by Shaboozey
- `Rocket Man` → `Rocket Man (I Think It's Going To Be A Long Long Time)` by Elton John
- `Locked & Loaded` → `Locked & Loaded (Official Fortnite Anthem)` by d4vd

Turn them off with "Fix known bad titles automatically". A few are marked review-only:
shown as a hint, never substituted, because the Fortnite version is not a normal release.

**Aliases the imports disproved were deleted, not kept.** `World Is Mine` was rewritten to
`Hatsune Miku` and failed, while `Melt` — credited to the same raw
`ryo (supercell) ft. Hatsune Miku` string — matched with no alias at all. `Popular` failed
both as its full multi-artist credit and as the lead artist alone. `What Is Love` failed
with and without its album. All three are now looked up instead of guessed at.

The table stays deliberately small. A hardcoded alias is a guess that needs a real import
to test; the lookup is the general answer, and a correction from it always beats an alias.

## When songs don't import

No import is perfect, and the dataset is the reason: it carries **no streaming identifier
at all**. `previewUrl` is an audio hash, and 82 of them point at Apple rather than Spotify.
Everything downstream is therefore a fuzzy text search on Fortnite's display strings.

Two real 598-track Soundiiz imports went 590 then 592. Hand-written aliases fixed three
tracks and broke a fourth, which is the problem with guessing: each guess costs a full
import round-trip to test, and nothing converges. So the app asks a real database instead.

### The loop

Soundiiz hands back a result CSV with an `isFound` column. Paste the **whole file** into
the panel on step 4 — only the `isFound=0` rows are read — then pick one of:

- **Look them up** queries a public music database for each miss and shows what it found,
  with a confidence score. Confident matches are applied automatically; a weak match is
  shown with a **Use this anyway** button rather than applied behind your back; nothing
  found and lookup failures are reported as such. **Undo lookups** reverses everything.
- **Drop these instead** leaves the misses out so you can import a clean file. **Put them
  back** reverses it, and a manual **Keep** on step 3 still overrules a drop.
- **Suggest retries** gives cleaner search strings for pasting into a search box by hand.

### The two databases

| | Key needed | ISRC | Speed |
| --- | --- | --- | --- |
| Apple / iTunes Search | no | no | fast |
| MusicBrainz | no | **yes** | ~1 track per second |

An **ISRC** is the prize: import tools match it exactly rather than searching for text, so
a track with an ISRC cannot be mis-matched. That is why MusicBrainz is worth its rate limit
on a handful of tracks. Because only the misses are looked up — six, not six hundred — the
rate limit never bites.

Lookups run in your browser, straight to those public APIs. Still no key, no backend, and
nothing about you is sent anywhere.

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
npm test          # 125 unit tests: assets/core.js and assets/resolve.js
```

The browser tests need Playwright:

```bash
npm install
npm run test:e2e  # 42 end-to-end tests driving index.html in Chromium
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
│   ├── core.js                       filters, presets, exports; no DOM
│   ├── resolve.js                    music database lookup; no DOM, injected fetch
│   ├── app.js                        wizard controller, all DOM
│   └── styles.css
├── tests
│   ├── unit/core.test.cjs
│   ├── unit/resolve.test.cjs
│   ├── e2e/wizard.test.cjs
│   └── fixtures/tracks.sample.json
├── package.json                      dev scripts and Playwright
├── LICENSE
└── README.md
```

`resolve.js` takes its network access as an injected `fetchJson`, so every query builder,
response parser and scoring rule is unit-tested with no network at all, and the end-to-end
tests stub the APIs at the network layer.

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
