# Fortnite Jam Tracks Playlist Exporter

A small static web app that turns the current Fortnite Festival Jam Track catalog into playlist-import files for Soundiiz and TuneMyMusic.

It is designed for GitHub Pages: no build step, no API key, no backend, and no account access.

## Features

- Fetches the current Jam Track data client-side from the maintained FNFestival `tracks.json` dataset.
- Exports:
  - Soundiiz CSV: `title,artist,album,isrc,`
  - TuneMyMusic plain text: `Artist - Title`
  - TuneMyMusic CSV: `artist,title,album`
  - Review CSV with filter decisions and aliases
- Sorts by the dataset's Fortnite `createdAt` date, newest/oldest, artist, title, or song release year.
- Uses a human-friendly default filter:
  - includes real-world streaming songs
  - excludes Epic/Fortnite originals
  - excludes Fortnite-specific remixes and rearrangements
  - puts hard-to-match library/stock tracks in review instead of pretending they will import cleanly
- Applies matching aliases for known import misses, including soundtrack titles, Japanese titles, featured-artist formatting, and Fortnite-censored display titles.
- Includes a Soundiiz not-found helper: paste Soundiiz's `isFound=0` CSV and get retry searches.

## Host on GitHub Pages

1. Create a new GitHub repository.
2. Copy `index.html` and the `assets/` folder into the repo root.
3. Commit and push.
4. In GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**.
5. Choose your default branch and `/root`, then save.

Your site will be available at:

```text
https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/
```

## Run locally

Opening `index.html` directly may work, but some browsers restrict `fetch()` from local files. A tiny local server is safer:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Filter presets

### Recommended Spotify playlist

Best default for most users. Keeps the tracks people usually mean by “real songs” and avoids entries that are Fortnite-made or likely to fail in Spotify matching.

### Broad

Still excludes Fortnite/Epic originals and Fortnite-specific edits, but includes hard-to-match licensed/library tracks in the main export.

### Complete

Exports every Jam Track in the dataset. Useful for archival lists, not ideal for Spotify.

## Matching aliases

Aliases are intentionally small and readable. They do not claim to be perfect Spotify metadata. They exist to improve import-tool search queries for known difficult entries, such as:

- `Work Work` → `Work Bitch` by Britney Spears
- `Yoru Ni Kakeru` → `夜に駆ける` by YOASOBI
- `Takaneno Hanakosan` → `高嶺の花子さん` by back number
- `Surround Sound` by `JID ft. 21 Savage & Baby Tate` → `Surround Sound (feat. 21 Savage & Baby Tate)` by JID

## Data notes

The app uses the dataset's `createdAt` field for “added to Fortnite” sorting. For older Jam Tracks imported into the dataset at the same time, several tracks may share the same date. That is the best date available from this data source without adding a second source/scraper.

## Project structure

```text
.
├── index.html
├── assets
│   ├── app.js
│   └── styles.css
└── README.md
```

## Not affiliated

This is a fan-made utility. It is not affiliated with Epic Games, Fortnite, Spotify, Soundiiz, TuneMyMusic, or FNFestival.
