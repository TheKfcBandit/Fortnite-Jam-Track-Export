const DATA_URL = "https://raw.githubusercontent.com/FNFestival/fnfestival.github.io/refs/heads/main/data/tracks.json";

const state = {
  tracks: [],
  metadata: {},
  decisions: [],
  exportText: "",
  exportFilename: "fortnite-jam-tracks.csv",
  retryText: "",
};

const ORIGINAL_TITLE_IDS = new Set([
  "butterbarnhoedown", "ogfutureremix", "switchup", "showthemwhoweare", "takemehigher",
  "braceforchaos", "runit", "flickeringflame", "winterfestwish", "makeitknown",
  "streetsignite", "bloom", "bestbuds", "lordofthewasteland", "youdontknowme",
  "pealikeme", "returnofthetiger", "findthefury", "youreallmine", "forlatveria",
  "change", "magentaride", "somp", "dreamer", "sunnyssong", "bouncinback",
  "thenightporter", "racetothehorizon", "highstakesclub", "turnup", "beyondtheflame",
  "thehuntingground"
]);

const HARD_TO_MATCH = new Set([
  key("Funny Song", "Slipstream Music"),
  key("Loves Like a Lady", "Anthony Harrison"),
  key("Blue English", "Vittorio Iannucci, Federica Capretti"),
  key("Bruno-San's Theme Song", "Bruno Mars"),
]);

const MATCH_ALIASES = new Map([
  alias("Lapti Nek (Jabba's Palace)", "John Williams & The London Symphony Orchestra", {
    title: "Lapti Nek (Jabba's Palace Band)",
    artist: "John Williams",
    album: "Star Wars: Return of the Jedi (Original Motion Picture Soundtrack)",
    note: "Spotify uses Jabba's Palace Band rather than Fortnite's display subtitle."
  }),
  alias("Star Wars Main Title Theme/March of the Resistance (Fortnite Rearrangement)", "John Williams & The London Symphony Orchestra", {
    title: "Main Title and March of the Resistance",
    artist: "John Williams",
    album: "Star Wars: The Force Awakens",
    reviewOnly: true,
    note: "Fortnite rearrangement is not a normal streaming release; excluded by default."
  }),
  alias("I Won't Say (I'm In Love)", "Hercules Cast", {
    title: "I Won't Say (I'm In Love) - From \"Hercules\" / Soundtrack Version",
    artist: "Susan Egan",
    album: "Hercules (Original Motion Picture Soundtrack)",
    note: "Disney cast credits often match better with the lead performer and soundtrack subtitle."
  }),
  alias("Zero to Hero", "Hercules Cast", {
    title: "Zero To Hero - From \"Hercules\" / Soundtrack Version",
    artist: "Chorus - Hercules",
    album: "Hercules (Original Motion Picture Soundtrack)",
    note: "Spotify credits the soundtrack chorus/performers rather than the generic Fortnite cast name."
  }),
  alias("World Is Mine", "ryo (supercell) ft. Hatsune Miku", {
    title: "World is Mine",
    artist: "Hatsune Miku",
    album: "supercell",
    note: "Vocaloid tracks often match better under Hatsune Miku."
  }),
  alias("Today is Gonna be a Great Day", "Bowling For Soup", {
    title: "Today is Gonna be a Great Day - Theme Song to Phineas and Ferb",
    artist: "Bowling For Soup",
    album: "Phineas and Ferb",
    note: "Spotify includes the Phineas and Ferb subtitle."
  }),
  alias("Takaneno Hanakosan", "back number", {
    title: "高嶺の花子さん",
    artist: "back number",
    album: "ラブストーリー",
    note: "Spotify/import tools may prefer the original Japanese title."
  }),
  alias("Work Work", "Britney Spears", {
    title: "Work Bitch",
    artist: "Britney Spears",
    album: "Britney Jean",
    note: "Fortnite uses a censored display title."
  }),
  alias("Happy", "Pharrell Williams", {
    title: "Happy - From \"Despicable Me 2\"",
    artist: "Pharrell Williams",
    album: "G I R L",
    note: "Avoids generic-title matching failures."
  }),
  alias("The Simpsons Main Title Theme", "Danny Elfman", {
    title: "The Simpsons Main Title Theme",
    artist: "Danny Elfman",
    album: "The Simpsons",
    note: "Adds soundtrack context."
  }),
  alias("Yoru Ni Kakeru", "YOASOBI", {
    title: "夜に駆ける",
    artist: "YOASOBI",
    album: "THE BOOK",
    note: "Original Japanese title can match better than the romanized Fortnite title."
  }),
  alias("Surround Sound", "JID ft. 21 Savage & Baby Tate", {
    title: "Surround Sound (feat. 21 Savage & Baby Tate)",
    artist: "JID",
    album: "The Forever Story",
    note: "Move featured artists into the title."
  }),
  alias("FUTW (Vixi Solo Version)", "LISA", {
    title: "FUTW",
    artist: "LISA",
    album: "Alter Ego",
    note: "Try the base title if the Fortnite version is unavailable."
  }),
  alias("What Is Love", "Haddaway", {
    title: "What Is Love",
    artist: "Haddaway",
    album: "The Album",
    note: "Adds album context for a generic title."
  }),
]);

const SAMPLE_TRACKS = {
  _metadata: { lastUpdated: new Date().toISOString(), sample: true },
  badguy: { id: "badguy", title: "bad guy", artist: "Billie Eilish", releaseYear: 2019, createdAt: "2024-12-26T04:08:19.835Z", lastFeatured: null, previewUrl: "https://p.scdn.co/sample" },
  workwork: { id: "workwork", title: "Work Work", artist: "Britney Spears", releaseYear: 2013, createdAt: "2025-02-14T00:00:00.000Z", previewUrl: null },
  spiesmarshmello: { id: "spiesmarshmello", title: "Spies! (Marshmello Remix)", artist: "Epic Games ft. Marshmello", releaseYear: 2020, createdAt: "2025-04-01T00:00:00.000Z", previewUrl: null },
  funny: { id: "funny", title: "Funny Song", artist: "Slipstream Music", releaseYear: 2024, createdAt: "2025-06-01T00:00:00.000Z", previewUrl: null },
  yoasobi: { id: "yorunikakeru", title: "Yoru Ni Kakeru", artist: "YOASOBI", releaseYear: 2019, createdAt: "2025-07-01T00:00:00.000Z", previewUrl: null },
};

const $ = (id) => document.getElementById(id);

function key(title, artist) {
  return `${clean(title)}:::${clean(artist)}`;
}

function alias(title, artist, data) {
  return [key(title, artist), data];
}

function clean(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[’]/g, "'")
    .trim()
    .toLowerCase();
}

function display(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return date.toISOString().slice(0, 10);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadText(filename, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

async function fetchTracks() {
  setBusy(true, "Fetching latest FNFestival tracks…");
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    loadData(data, "live");
  } catch (error) {
    setBusy(false, `Could not fetch live data: ${error.message}. Try the demo or run from a local server.`);
  }
}

function loadData(data, mode = "live") {
  state.metadata = data._metadata || {};
  state.tracks = Object.values(data)
    .filter((item) => item && typeof item === "object" && item.title && item.artist)
    .map(normalizeTrack)
    .filter(dedupeBy((track) => key(track.title, track.artist)));

  setBusy(false, `${mode === "sample" ? "Demo" : "Latest"} data loaded. Last updated: ${formatDate(state.metadata.lastUpdated)}.`);
  renderAll();
}

function normalizeTrack(item) {
  return {
    id: display(item.id),
    title: display(item.title),
    artist: display(item.artist),
    releaseYear: item.releaseYear || "",
    createdAt: item.createdAt || "",
    lastFeatured: item.lastFeatured || "",
    previewUrl: item.previewUrl || "",
    cover: item.cover || "",
    duration: item.duration || "",
  };
}

function dedupeBy(getKey) {
  const seen = new Set();
  return (item) => {
    const itemKey = getKey(item);
    if (seen.has(itemKey)) return false;
    seen.add(itemKey);
    return true;
  };
}

function setBusy(isBusy, message) {
  $("fetchButton").disabled = isBusy;
  $("sourceStatus").textContent = message;
}

function getOptions() {
  return {
    preset: $("presetSelect").value,
    includeOriginals: $("includeOriginals").checked,
    includeFortniteEdits: $("includeFortniteEdits").checked,
    includeAmbiguous: $("includeAmbiguous").checked,
    requirePreview: $("requirePreview").checked,
    useAliases: $("useAliases").checked,
    includeReviewInExport: $("includeReviewInExport").checked,
    sort: $("sortSelect").value,
    target: $("targetSelect").value,
  };
}

function applyPreset(preset) {
  const presets = {
    recommended: {
      includeOriginals: false,
      includeFortniteEdits: false,
      includeAmbiguous: false,
      requirePreview: false,
      includeReviewInExport: false,
      help: "Real-world streaming tracks only. Excludes Epic/Fortnite originals, Fortnite remixes/rearrangements, and stock/library tracks that usually fail on Spotify."
    },
    broad: {
      includeOriginals: false,
      includeFortniteEdits: false,
      includeAmbiguous: true,
      requirePreview: false,
      includeReviewInExport: true,
      help: "Includes licensed tracks even if they may need manual matching. Still excludes Epic/Fortnite originals and Fortnite-specific remixes."
    },
    complete: {
      includeOriginals: true,
      includeFortniteEdits: true,
      includeAmbiguous: true,
      requirePreview: false,
      includeReviewInExport: true,
      help: "Exports every Jam Track in the dataset. Useful for archival lists, not ideal for Spotify matching."
    },
    custom: null,
  };
  if (!presets[preset]) {
    $("presetHelp").textContent = "Manual filter switches are active.";
    return;
  }
  const p = presets[preset];
  $("includeOriginals").checked = p.includeOriginals;
  $("includeFortniteEdits").checked = p.includeFortniteEdits;
  $("includeAmbiguous").checked = p.includeAmbiguous;
  $("requirePreview").checked = p.requirePreview;
  $("includeReviewInExport").checked = p.includeReviewInExport;
  $("presetHelp").textContent = p.help;
}

function classifyTrack(track) {
  const reasons = [];
  const review = [];
  const normalizedArtist = clean(track.artist);
  const normalizedTitle = clean(track.title);
  const aliasData = MATCH_ALIASES.get(key(track.title, track.artist));

  const isEpicArtist = normalizedArtist === "epic games";
  const isEpicCollab = normalizedArtist.startsWith("epic games ft.") || normalizedArtist.includes("epic games feat.");
  const isOriginal = isEpicArtist || ORIGINAL_TITLE_IDS.has(track.id) || ORIGINAL_TITLE_IDS.has(normalizedTitle.replace(/[^a-z0-9]/g, ""));
  const isFortniteEdit = isEpicCollab || /fortnite rearrangement/i.test(track.title) || (/\bremix\b/i.test(track.title) && /epic games/i.test(track.artist));
  const isAmbiguous = HARD_TO_MATCH.has(key(track.title, track.artist));

  if (isOriginal) reasons.push("Epic/Fortnite original");
  if (isFortniteEdit) reasons.push("Fortnite-specific remix or rearrangement");
  if (isAmbiguous) review.push("Library/stock or branded track; commonly fails on Spotify");
  if (aliasData?.reviewOnly) review.push(aliasData.note || "Needs manual review");
  if (!track.previewUrl) review.push("No Spotify preview URL in dataset");
  if (aliasData && !aliasData.reviewOnly) review.push(`Alias available: ${aliasData.note}`);

  return { reasons, review, aliasData };
}

function buildDecisions() {
  const options = getOptions();
  const decisions = state.tracks.map((track) => {
    const info = classifyTrack(track);
    let status = "include";
    const reasons = [...info.reasons];
    const review = [...info.review];

    if (!options.includeOriginals && info.reasons.includes("Epic/Fortnite original")) status = "exclude";
    if (!options.includeFortniteEdits && info.reasons.includes("Fortnite-specific remix or rearrangement")) status = "exclude";
    if (options.requirePreview && !track.previewUrl) {
      status = "exclude";
      reasons.push("Missing Spotify preview URL");
    }

    if (status !== "exclude") {
      const hasHardReview = review.some((item) => /Library\/stock|review|No Spotify preview/.test(item));
      if (hasHardReview && !options.includeAmbiguous && HARD_TO_MATCH.has(key(track.title, track.artist))) status = "review";
      if (info.aliasData?.reviewOnly && !options.includeFortniteEdits) status = "exclude";
    }

    return {
      track,
      status,
      reasons: status === "exclude" ? reasons : review,
      aliasData: info.aliasData,
    };
  });

  return sortDecisions(decisions, options.sort);
}

function sortDecisions(decisions, sort) {
  const byTitle = (a, b) => a.track.title.localeCompare(b.track.title) || a.track.artist.localeCompare(b.track.artist);
  const byArtist = (a, b) => a.track.artist.localeCompare(b.track.artist) || a.track.title.localeCompare(b.track.title);
  const byAddedAsc = (a, b) => Date.parse(a.track.createdAt || "9999-12-31") - Date.parse(b.track.createdAt || "9999-12-31") || byArtist(a, b);
  const byAddedDesc = (a, b) => Date.parse(b.track.createdAt || "0000-01-01") - Date.parse(a.track.createdAt || "0000-01-01") || byArtist(a, b);
  const byRelease = (a, b) => Number(a.track.releaseYear || 9999) - Number(b.track.releaseYear || 9999) || byArtist(a, b);

  return [...decisions].sort({
    titleAsc: byTitle,
    artistAsc: byArtist,
    addedAsc: byAddedAsc,
    addedDesc: byAddedDesc,
    releaseYearAsc: byRelease,
  }[sort] || byAddedAsc);
}

function getExportRows(decisions, options) {
  return decisions
    .filter((decision) => decision.status === "include" || (options.includeReviewInExport && decision.status === "review"))
    .map((decision) => {
      const { track, aliasData } = decision;
      const useAlias = options.useAliases && aliasData && !aliasData.reviewOnly;
      return {
        title: useAlias ? aliasData.title : track.title,
        artist: useAlias ? aliasData.artist : track.artist,
        album: useAlias ? (aliasData.album || "") : "",
        isrc: "",
        originalTitle: track.title,
        originalArtist: track.artist,
        addedToFortnite: formatDate(track.createdAt),
        releaseYear: track.releaseYear,
        status: decision.status,
        note: useAlias ? aliasData.note : decision.reasons.join("; "),
      };
    });
}

function makeExport(rows, decisions, options) {
  const stamp = new Date().toISOString().slice(0, 10);
  const target = options.target;

  if (target === "soundiiz") {
    const lines = ["title,artist,album,isrc,"];
    rows.forEach((row) => lines.push([row.title, row.artist, row.album, row.isrc, ""].map(csvEscape).join(",")));
    return { text: lines.join("\n") + "\n", filename: `fortnite-jam-tracks-soundiiz-${stamp}.csv`, label: "Soundiiz CSV preview" };
  }

  if (target === "tunemymusicCsv") {
    const lines = ["artist,title,album"];
    rows.forEach((row) => lines.push([row.artist, row.title, row.album].map(csvEscape).join(",")));
    return { text: lines.join("\n") + "\n", filename: `fortnite-jam-tracks-tunemymusic-${stamp}.csv`, label: "TuneMyMusic CSV preview" };
  }

  if (target === "tunemymusicText") {
    const text = rows.map((row) => `${row.artist} - ${row.title}`).join("\n") + "\n";
    return { text, filename: `fortnite-jam-tracks-tunemymusic-${stamp}.txt`, label: "TuneMyMusic text preview" };
  }

  const lines = ["status,title,artist,exportTitle,exportArtist,album,addedToFortnite,releaseYear,note"];
  decisions.forEach((decision) => {
    const track = decision.track;
    const aliasData = options.useAliases ? decision.aliasData : null;
    const row = [
      decision.status,
      track.title,
      track.artist,
      aliasData?.title || track.title,
      aliasData?.artist || track.artist,
      aliasData?.album || "",
      formatDate(track.createdAt),
      track.releaseYear || "",
      aliasData?.note || decision.reasons.join("; "),
    ];
    lines.push(row.map(csvEscape).join(","));
  });
  return { text: lines.join("\n") + "\n", filename: `fortnite-jam-tracks-review-${stamp}.csv`, label: "Review CSV preview" };
}

function renderAll() {
  const options = getOptions();
  state.decisions = buildDecisions();
  const rows = getExportRows(state.decisions, options);
  const generated = makeExport(rows, state.decisions, options);
  state.exportText = generated.text;
  state.exportFilename = generated.filename;

  $("outputText").value = generated.text;
  $("outputLabel").textContent = generated.label;
  $("includedCount").textContent = state.decisions.filter((d) => d.status === "include").length;
  $("reviewCount").textContent = state.decisions.filter((d) => d.status === "review").length;
  $("excludedCount").textContent = state.decisions.filter((d) => d.status === "exclude").length;
  $("dataBadge").textContent = state.tracks.length ? `${state.tracks.length} tracks • ${formatDate(state.metadata.lastUpdated)}` : "Waiting for data";
  renderTable();
}

function renderTable() {
  const query = clean($("searchInput").value);
  const tbody = $("trackTableBody");
  tbody.innerHTML = "";
  const rows = state.decisions.filter((decision) => {
    const haystack = clean(`${decision.status} ${decision.track.title} ${decision.track.artist} ${formatDate(decision.track.createdAt)} ${decision.reasons.join(" ")}`);
    return !query || haystack.includes(query);
  }).slice(0, 600);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">No matching tracks.</td></tr>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  rows.forEach((decision) => {
    const tr = document.createElement("tr");
    const reasons = decision.reasons.length ? decision.reasons.join("; ") : "Ready for export";
    tr.innerHTML = `
      <td><span class="status ${decision.status}">${decision.status}</span></td>
      <td>${escapeHtml(decision.track.title)}${decision.aliasData ? `<div class="muted">→ ${escapeHtml(decision.aliasData.title || decision.track.title)}</div>` : ""}</td>
      <td>${escapeHtml(decision.track.artist)}${decision.aliasData ? `<div class="muted">→ ${escapeHtml(decision.aliasData.artist || decision.track.artist)}</div>` : ""}</td>
      <td>${formatDate(decision.track.createdAt)}</td>
      <td>${escapeHtml(reasons)}</td>`;
    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') { cell += '"'; i += 1; }
      else if (char === '"') inQuotes = false;
      else cell += char;
    } else {
      if (char === '"') inQuotes = true;
      else if (char === ",") { row.push(cell); cell = ""; }
      else if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (char !== "\r") cell += char;
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((cellValue) => String(cellValue).trim()));
}

function analyzeNotFound() {
  const input = $("notFoundInput").value.trim();
  if (!input) {
    $("notFoundOutput").value = "Paste Soundiiz's not-found CSV first.";
    return;
  }
  const rows = parseCsv(input);
  const header = rows.shift()?.map(clean) || [];
  const titleIndex = Math.max(0, header.indexOf("title"));
  const artistIndex = Math.max(1, header.indexOf("artist"));
  const suggestions = [];

  for (const row of rows) {
    const title = display(row[titleIndex]);
    const artist = display(row[artistIndex]);
    if (!title) continue;
    const aliasData = MATCH_ALIASES.get(key(title, artist));
    const fallback = fallbackAlias(title, artist);
    const suggestion = aliasData || fallback;
    suggestions.push({
      original: `${artist} - ${title}`,
      retry: `${suggestion.artist} - ${suggestion.title}`,
      note: suggestion.note || "Try simplified artist/title search.",
    });
  }

  state.retryText = suggestions.map((item) => `${item.retry}    # ${item.note}`).join("\n") + "\n";
  $("notFoundOutput").value = state.retryText || "No rows found.";
}

function fallbackAlias(title, artist) {
  let nextTitle = title
    .replace(/\s*\(Fortnite Rearrangement\)/i, "")
    .replace(/\s*\(Jabba's Palace\)/i, "")
    .trim();
  let nextArtist = artist
    .replace(/\s*&\s*The London Symphony Orchestra/i, "")
    .replace(/\s*ft\..*/i, "")
    .replace(/\s*feat\..*/i, "")
    .trim();
  if (!nextArtist) nextArtist = artist;
  return { title: nextTitle, artist: nextArtist, note: "Automatic cleanup: removed subtitles/featured credits where possible." };
}

function downloadAll() {
  const options = getOptions();
  const rows = getExportRows(state.decisions, options);
  const stamp = new Date().toISOString().slice(0, 10);
  const soundiiz = makeExport(rows, state.decisions, { ...options, target: "soundiiz" });
  const tmmText = makeExport(rows, state.decisions, { ...options, target: "tunemymusicText" });
  const tmmCsv = makeExport(rows, state.decisions, { ...options, target: "tunemymusicCsv" });
  const review = makeExport(rows, state.decisions, { ...options, target: "reviewCsv" });
  // Browser-only bulk downloads are intentionally simple: four normal files instead of a zip dependency.
  downloadText(`fortnite-jam-tracks-soundiiz-${stamp}.csv`, soundiiz.text, "text/csv;charset=utf-8");
  downloadText(`fortnite-jam-tracks-tunemymusic-${stamp}.txt`, tmmText.text);
  downloadText(`fortnite-jam-tracks-tunemymusic-${stamp}.csv`, tmmCsv.text, "text/csv;charset=utf-8");
  downloadText(`fortnite-jam-tracks-review-${stamp}.csv`, review.text, "text/csv;charset=utf-8");
}

async function copyText(text, button) {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  const old = button.textContent;
  button.textContent = "Copied";
  window.setTimeout(() => { button.textContent = old; }, 1000);
}

function init() {
  $("fetchButton").addEventListener("click", fetchTracks);
  $("sampleButton").addEventListener("click", () => loadData(SAMPLE_TRACKS, "sample"));
  $("presetSelect").addEventListener("change", () => { applyPreset($("presetSelect").value); renderAll(); });
  ["sortSelect", "targetSelect", "includeOriginals", "includeFortniteEdits", "includeAmbiguous", "requirePreview", "useAliases", "includeReviewInExport"].forEach((id) => {
    $(id).addEventListener("change", () => {
      if (["includeOriginals", "includeFortniteEdits", "includeAmbiguous", "requirePreview", "includeReviewInExport"].includes(id)) {
        $("presetSelect").value = "custom";
        applyPreset("custom");
      }
      renderAll();
    });
  });
  $("searchInput").addEventListener("input", renderTable);
  $("copyButton").addEventListener("click", (event) => copyText(state.exportText, event.currentTarget));
  $("downloadButton").addEventListener("click", () => downloadText(state.exportFilename, state.exportText, state.exportFilename.endsWith(".csv") ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8"));
  $("downloadAllButton").addEventListener("click", downloadAll);
  $("analyzeNotFoundButton").addEventListener("click", analyzeNotFound);
  $("copyRetryButton").addEventListener("click", (event) => copyText(state.retryText || $("notFoundOutput").value, event.currentTarget));
  applyPreset("recommended");
}

init();
