/*
 * Unit tests for assets/core.js — pure logic, no browser, no dependencies.
 * Run with:  node --test tests/unit/
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const core = require("../../assets/core.js");

const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "fixtures", "tracks.sample.json"), "utf8")
);

const parsed = core.parseTracks(FIXTURE);
const TRACKS = parsed.tracks;

// Options for a named preset, as the UI would assemble them.
function optionsFor(preset, extra) {
  return Object.assign({ preset }, core.presetSwitches(preset), extra || {});
}

function findByTitle(decisions, title) {
  const hit = decisions.find((d) => d.track.title === title);
  assert.ok(hit, `expected a decision for "${title}"`);
  return hit;
}

/* ----------------------------------------------------------------- helpers */

test("clean normalizes whitespace, curly apostrophes and case", () => {
  assert.equal(core.clean("  Work   Work "), "work work");
  assert.equal(core.clean("Don’t Stop"), "don't stop");
  assert.equal(core.clean(null), "");
  assert.equal(core.clean(undefined), "");
});

test("display collapses whitespace but keeps case", () => {
  assert.equal(core.display("  bad   guy  "), "bad guy");
  assert.equal(core.display(null), "");
});

test("formatDate returns an ISO date or an em dash", () => {
  assert.equal(core.formatDate("2024-12-26T04:08:19.834Z"), "2024-12-26");
  assert.equal(core.formatDate(""), "—");
  assert.equal(core.formatDate("not a date"), "—");
});

test("csvEscape quotes only when required, and doubles inner quotes", () => {
  assert.equal(core.csvEscape("plain"), "plain");
  assert.equal(core.csvEscape("a,b"), '"a,b"');
  assert.equal(core.csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(core.csvEscape("line\nbreak"), '"line\nbreak"');
  assert.equal(core.csvEscape(null), "");
});

test("trackKey is case- and whitespace-insensitive", () => {
  assert.equal(core.trackKey("Work Work", "Britney Spears"), core.trackKey("  work   work ", "BRITNEY SPEARS"));
});

/* ------------------------------------------------------------------ parsing */

test("parseTracks returns metadata and skips the _metadata key", () => {
  assert.equal(parsed.metadata.lastUpdated, FIXTURE._metadata.lastUpdated);
  assert.equal(TRACKS.length, Object.keys(FIXTURE).length - 1);
  assert.ok(TRACKS.every((t) => t.title && t.artist));
});

test("parseTracks drops entries without a title or artist", () => {
  const result = core.parseTracks({
    _metadata: {},
    good: { id: "good", title: "A Song", artist: "An Artist" },
    noTitle: { id: "noTitle", artist: "An Artist" },
    noArtist: { id: "noArtist", title: "A Song" },
    notAnObject: "nope",
    nothing: null
  });
  assert.equal(result.tracks.length, 1);
  assert.equal(result.tracks[0].title, "A Song");
});

test("parseTracks de-duplicates the same title+artist pair", () => {
  const result = core.parseTracks({
    a: { id: "a", title: "Twice", artist: "Someone" },
    b: { id: "b", title: "  TWICE ", artist: "someone" }
  });
  assert.equal(result.tracks.length, 1);
});

test("parseTracks rejects non-object input", () => {
  assert.throws(() => core.parseTracks(null), /must be an object/);
  assert.throws(() => core.parseTracks("nope"), /must be an object/);
});

/* -------------------------------------------------------------------- regex */

test("compileRegex accepts a bare pattern, case-insensitively", () => {
  const { regex, error } = core.compileRegex("epic games");
  assert.equal(error, null);
  assert.ok(regex.test("EPIC GAMES"));
});

test("compileRegex accepts /pattern/flags and honours the flags", () => {
  const insensitive = core.compileRegex("/epic/i");
  assert.ok(insensitive.regex.test("EPIC"));

  const sensitive = core.compileRegex("/epic/");
  assert.equal(sensitive.regex.test("EPIC"), false);
  assert.ok(sensitive.regex.test("epic"));
});

test("compileRegex strips the global flag so .test() stays stateless", () => {
  const { regex } = core.compileRegex("/a/g");
  assert.equal(regex.flags.includes("g"), false);
  // With /g retained, the second call would fail because lastIndex advances.
  assert.ok(regex.test("a"));
  assert.ok(regex.test("a"));
});

test("compileRegex reports an invalid pattern instead of throwing", () => {
  const { regex, error } = core.compileRegex("([unclosed");
  assert.equal(regex, null);
  assert.ok(error && error.length > 0);
});

test("compileRegex treats empty input as no filter", () => {
  for (const input of ["", "   ", null, undefined, "//"]) {
    const result = core.compileRegex(input);
    assert.equal(result.regex, null, `expected no regex for ${JSON.stringify(input)}`);
    assert.equal(result.error, null);
  }
});

/* --------------------------------------------------------------- classify */

test("classify flags Epic originals by artist", () => {
  const track = TRACKS.find((t) => t.title === "Butter Barn Hoedown");
  const info = core.classify(track);
  assert.equal(info.flags.isOriginal, true);
  assert.ok(info.notes.includes(core.REASONS.original));
});

test("classify flags Epic collaboration remixes as Fortnite edits", () => {
  const track = TRACKS.find((t) => t.title === "Spies! (Marshmello Remix)");
  const info = core.classify(track);
  assert.equal(info.flags.isFortniteEdit, true);
});

test("classify flags Fortnite rearrangements by real artists", () => {
  // Credited to John Williams, so the artist check cannot catch it.
  const track = TRACKS.find((t) => t.title === "Chrome Dome (Fortnite Rearrangement)");
  assert.equal(core.clean(track.artist), "john williams");
  assert.equal(core.classify(track).flags.isFortniteEdit, true);
});

test("classify flags known hard-to-match library tracks", () => {
  const track = TRACKS.find((t) => t.title === "Funny Song");
  const info = core.classify(track);
  assert.equal(info.flags.isHardToMatch, true);
  assert.ok(info.notes.includes(core.REASONS.hardToMatch));
});

test("classify attaches an alias and notes it", () => {
  const track = TRACKS.find((t) => t.title === "Work Work");
  const info = core.classify(track);
  assert.equal(info.alias.title, "Work Bitch");
  assert.ok(info.notes.some((note) => note.startsWith("Alias available:")));
});

test("classify treats a review-only alias as a Fortnite edit", () => {
  const track = TRACKS.find((t) => t.title.startsWith("Star Wars Main Title Theme"));
  const info = core.classify(track);
  assert.equal(info.alias.reviewOnly, true);
  assert.equal(info.flags.isFortniteEdit, true);
});

test("classify notes a missing preview URL", () => {
  const track = TRACKS.find((t) => !t.previewUrl);
  assert.ok(core.classify(track).notes.includes(core.REASONS.noPreview));
});

test("every curated alias and hard-to-match key is still reachable", () => {
  // Guards against the dataset renaming a track and silently orphaning a rule.
  const keys = new Set(TRACKS.map((t) => core.trackKey(t.title, t.artist)));
  for (const key of core.MATCH_ALIASES.keys()) {
    assert.ok(keys.has(key), `fixture is missing aliased track: ${key}`);
  }
  for (const key of core.HARD_TO_MATCH) {
    assert.ok(keys.has(key), `fixture is missing hard-to-match track: ${key}`);
  }
});

/* ---------------------------------------------------------------- presets */

test("recommended keeps real songs and drops Epic material", () => {
  const decisions = core.decide(TRACKS, optionsFor("recommended"));
  assert.equal(findByTitle(decisions, "Butter Barn Hoedown").status, "exclude");
  assert.equal(findByTitle(decisions, "Spies! (Marshmello Remix)").status, "exclude");
  assert.equal(findByTitle(decisions, "Chrome Dome (Fortnite Rearrangement)").status, "exclude");
  assert.equal(findByTitle(decisions, "Funny Song").status, "review");
  assert.equal(findByTitle(decisions, "Work Work").status, "include");
});

test("broad promotes hard-to-match tracks out of review", () => {
  const decisions = core.decide(TRACKS, optionsFor("broad"));
  assert.equal(findByTitle(decisions, "Funny Song").status, "include");
  assert.equal(findByTitle(decisions, "Butter Barn Hoedown").status, "exclude");
  assert.equal(core.countByStatus(decisions).review, 0);
});

test("complete includes every track", () => {
  const decisions = core.decide(TRACKS, optionsFor("complete"));
  const counts = core.countByStatus(decisions);
  assert.equal(counts.include, TRACKS.length);
  assert.equal(counts.review, 0);
  assert.equal(counts.exclude, 0);
});

test("the three presets are ordered by how much they include", () => {
  const size = (preset) =>
    core.selectRows(core.decide(TRACKS, optionsFor(preset)), optionsFor(preset)).length;
  assert.ok(size("recommended") < size("broad"), "broad should include more than recommended");
  assert.ok(size("broad") < size("complete"), "complete should include more than broad");
});

test("presetSwitches returns null for custom", () => {
  assert.equal(core.presetSwitches("custom"), null);
  assert.equal(core.presetSwitches("nope"), null);
  assert.deepEqual(core.presetSwitches("recommended"), core.PRESETS.recommended.switches);
});

/* ------------------------------------------------------------- precedence */

test("requirePreview excludes tracks with no preview URL", () => {
  const options = optionsFor("complete", { requirePreview: true });
  const decisions = core.decide(TRACKS, options);
  const withoutPreview = decisions.filter((d) => !d.track.previewUrl);
  assert.ok(withoutPreview.length > 0, "fixture should contain preview-less tracks");
  for (const decision of withoutPreview) {
    assert.equal(decision.status, "exclude");
    assert.equal(decision.source, "requirePreview");
    assert.ok(decision.reasons.includes(core.REASONS.missingPreview));
  }
});

test("the custom regex excludes matching tracks and records why", () => {
  const options = optionsFor("recommended", { customRegex: "Slipstream Music" });
  const hit = findByTitle(core.decide(TRACKS, options), "Funny Song");
  assert.equal(hit.status, "exclude");
  assert.equal(hit.source, "regex");
  assert.ok(hit.reasons.includes(core.REASONS.regex));
});

test("the custom regex matches generated reasons, not just visible fields", () => {
  // "Epic/Fortnite original" appears only in the reasons, never in the data.
  const options = optionsFor("complete", { customRegex: "Epic/Fortnite original" });
  const hit = findByTitle(core.decide(TRACKS, options), "Butter Barn Hoedown");
  assert.equal(hit.source, "regex");
});

test("the custom regex can match the id and the release year", () => {
  const byId = core.decide(TRACKS, optionsFor("complete", { customRegex: "butterbarnhoedown" }));
  assert.equal(findByTitle(byId, "Butter Barn Hoedown").source, "regex");

  const track = TRACKS.find((t) => t.releaseYear);
  const byYear = core.decide(TRACKS, optionsFor("complete", { customRegex: String(track.releaseYear) }));
  assert.ok(byYear.some((d) => d.source === "regex"));
});

test("an invalid custom regex filters nothing", () => {
  const good = core.decide(TRACKS, optionsFor("complete"));
  const bad = core.decide(TRACKS, optionsFor("complete", { customRegex: "([unclosed" }));
  assert.deepEqual(core.countByStatus(bad), core.countByStatus(good));
});

test("regex beats requirePreview, which beats the preset rules", () => {
  const options = optionsFor("recommended", {
    requirePreview: true,
    customRegex: "Funny Song"
  });
  const decisions = core.decide(TRACKS, options);
  assert.equal(findByTitle(decisions, "Funny Song").source, "regex");
});

/* --------------------------------------------------------------- overrides */

test("an override forces a track in, beating every other rule", () => {
  const key = core.trackKey("Butter Barn Hoedown", "Epic Games");
  const options = optionsFor("recommended", {
    requirePreview: true,
    customRegex: "Butter Barn",
    overrides: { [key]: "include" }
  });
  const hit = findByTitle(core.decide(TRACKS, options), "Butter Barn Hoedown");
  assert.equal(hit.status, "include");
  assert.equal(hit.source, "override");
  assert.equal(hit.overridden, true);
  assert.ok(hit.reasons.includes(core.REASONS.forcedIn));
});

test("an override forces a track out of an otherwise complete export", () => {
  const key = core.trackKey("Work Work", "Britney Spears");
  const options = optionsFor("complete", { overrides: { [key]: "exclude" } });
  const hit = findByTitle(core.decide(TRACKS, options), "Work Work");
  assert.equal(hit.status, "exclude");
  assert.equal(hit.source, "override");
  assert.ok(hit.reasons.includes(core.REASONS.forcedOut));
});

test("overrides survive a change of preset", () => {
  const key = core.trackKey("Butter Barn Hoedown", "Epic Games");
  const overrides = { [key]: "include" };
  for (const preset of ["recommended", "broad", "complete"]) {
    const decisions = core.decide(TRACKS, optionsFor(preset, { overrides }));
    assert.equal(findByTitle(decisions, "Butter Barn Hoedown").status, "include", `preset ${preset}`);
  }
});

test("an override changes the exported row count by exactly one", () => {
  const base = optionsFor("recommended");
  const before = core.selectRows(core.decide(TRACKS, base), base).length;

  const key = core.trackKey("Butter Barn Hoedown", "Epic Games");
  const after = optionsFor("recommended", { overrides: { [key]: "include" } });
  assert.equal(core.selectRows(core.decide(TRACKS, after), after).length, before + 1);
});

test("tracks with no override are marked as automatic", () => {
  const decisions = core.decide(TRACKS, optionsFor("recommended"));
  assert.ok(decisions.every((d) => d.overridden === false));
});

/* ------------------------------------------------------------------- sorts */

test("every sort returns the same tracks, only reordered", () => {
  const expected = TRACKS.length;
  for (const sort of Object.keys(core.SORTS)) {
    const decisions = core.decide(TRACKS, optionsFor("complete", { sort }));
    assert.equal(decisions.length, expected, `sort ${sort} changed the track count`);
  }
});

test("titleAsc and artistAsc sort alphabetically", () => {
  const byTitle = core.decide(TRACKS, optionsFor("complete", { sort: "titleAsc" }));
  const titles = byTitle.map((d) => d.track.title);
  assert.deepEqual(titles, titles.slice().sort((a, b) => a.localeCompare(b)));

  const byArtist = core.decide(TRACKS, optionsFor("complete", { sort: "artistAsc" }));
  const artists = byArtist.map((d) => d.track.artist);
  assert.deepEqual(artists, artists.slice().sort((a, b) => a.localeCompare(b)));
});

test("addedAsc and addedDesc are mirror images", () => {
  const asc = core.decide(TRACKS, optionsFor("complete", { sort: "addedAsc" }));
  const desc = core.decide(TRACKS, optionsFor("complete", { sort: "addedDesc" }));
  assert.ok(Date.parse(asc[0].track.createdAt) <= Date.parse(asc[asc.length - 1].track.createdAt));
  assert.ok(Date.parse(desc[0].track.createdAt) >= Date.parse(desc[desc.length - 1].track.createdAt));
});

test("releaseYearAsc sorts oldest song first", () => {
  const years = core
    .decide(TRACKS, optionsFor("complete", { sort: "releaseYearAsc" }))
    .map((d) => Number(d.track.releaseYear || 9999));
  for (let i = 1; i < years.length; i += 1) {
    assert.ok(years[i - 1] <= years[i], `year ${years[i - 1]} should precede ${years[i]}`);
  }
});

test("an unknown sort falls back to addedAsc instead of throwing", () => {
  const fallback = core.decide(TRACKS, optionsFor("complete", { sort: "nonsense" }));
  const expected = core.decide(TRACKS, optionsFor("complete", { sort: "addedAsc" }));
  assert.deepEqual(fallback.map((d) => d.key), expected.map((d) => d.key));
});

/* -------------------------------------------------------------- alias rows */

test("selectRows substitutes alias title and artist when aliases are on", () => {
  const options = optionsFor("recommended", { useAliases: true });
  const row = core
    .selectRows(core.decide(TRACKS, options), options)
    .find((r) => r.originalTitle === "Work Work");
  assert.equal(row.title, "Work Bitch");
  assert.equal(row.artist, "Britney Spears");
  assert.equal(row.album, "", "this alias carries no album");
});

test("only the alias a real import proved needs an album carries one", () => {
  // Two imports, one sending albums and one not, showed the album mattering
  // for Lapti Nek alone. The other twelve aliases had theirs removed.
  const options = optionsFor("complete", { useAliases: true });
  const rows = core.selectRows(core.decide(TRACKS, options), options);
  const withAlbum = rows.filter((r) => r.album);
  assert.equal(withAlbum.length, 1, `unexpected albums: ${withAlbum.map((r) => r.title)}`);
  assert.match(withAlbum[0].title, /^Lapti Nek/);
});

test("selectRows keeps the Fortnite title when aliases are off", () => {
  const options = optionsFor("recommended", { useAliases: false });
  const row = core
    .selectRows(core.decide(TRACKS, options), options)
    .find((r) => r.originalTitle === "Work Work");
  assert.equal(row.title, "Work Work");
  assert.equal(row.album, "");
});

test("selectRows never applies a review-only alias", () => {
  const options = optionsFor("complete", { useAliases: true });
  const row = core
    .selectRows(core.decide(TRACKS, options), options)
    .find((r) => r.originalTitle.startsWith("Star Wars Main Title Theme"));
  assert.equal(row.title, row.originalTitle, "review-only aliases are hints, not substitutions");
});

test("includeReviewInExport decides whether review tracks reach the file", () => {
  const off = optionsFor("recommended", { includeReviewInExport: false });
  const on = optionsFor("recommended", { includeReviewInExport: true });
  const decisions = core.decide(TRACKS, off);
  const reviewCount = core.countByStatus(decisions).review;

  assert.ok(reviewCount > 0, "fixture should produce review tracks under recommended");
  assert.equal(
    core.selectRows(decisions, on).length - core.selectRows(decisions, off).length,
    reviewCount
  );
});

/* ----------------------------------------------------------------- exports */

const NOW = new Date("2026-03-04T12:00:00.000Z");

function exportFor(target, preset, extra) {
  const options = optionsFor(preset || "recommended", Object.assign({ target }, extra));
  const decisions = core.decide(TRACKS, options);
  const rows = core.selectRows(decisions, options);
  return core.buildExport(target, rows, decisions, options, NOW);
}

test("the Soundiiz header declares only columns something fills", () => {
  const file = exportFor("soundiiz");
  // Soundiiz matches columns by name and ignores unknown ones. The nameless
  // trailing column and the never-populated isrc are gone. The fixture holds
  // the one aliased track that needs an album, so album is present and isrc
  // is not.
  assert.equal(file.text.split("\n")[0], "title,artist,album");
  assert.equal(file.filename, "fortnite-jam-tracks-soundiiz-2026-03-04.csv");
  assert.equal(file.mime, "text/csv;charset=utf-8");
});

test("every row has the same field count as the header", () => {
  for (const target of ["soundiiz", "tunemymusicCsv"]) {
    const lines = exportFor(target).text.trim().split("\n");
    const width = core.parseCsv(lines[0])[0].length;
    for (const line of lines) {
      assert.equal(core.parseCsv(line)[0].length, width, `${target}: ragged row: ${line}`);
    }
  }
});

test("a column nothing fills is left out entirely", () => {
  // The whole point: an all-empty column is noise, and three of them were
  // what put ",,," on every line of the original export.
  const tracks = core.parseTracks({
    _metadata: {},
    plain: { id: "plain", title: "Plain Song", artist: "Plain Artist", previewUrl: "x" }
  }).tracks;
  const options = optionsFor("complete", { target: "soundiiz" });
  const decisions = core.decide(tracks, options);
  const rows = core.selectRows(decisions, options);

  assert.deepEqual(core.activeColumns(rows), { album: false, isrc: false });
  const text = core.buildExport("soundiiz", rows, decisions, options, NOW).text;
  assert.equal(text.split("\n")[0], "title,artist");
  for (const line of text.trim().split("\n")) {
    assert.ok(!line.endsWith(","), `line ends in a comma: ${line}`);
  }
});

test("activeColumns turns a column on as soon as one row fills it", () => {
  assert.deepEqual(core.activeColumns([{ album: "", isrc: "" }]), { album: false, isrc: false });
  assert.deepEqual(core.activeColumns([{ album: "", isrc: "" }, { album: "X", isrc: "" }]),
    { album: true, isrc: false });
  assert.deepEqual(core.activeColumns([{ album: "", isrc: "A" }]), { album: false, isrc: true });
  assert.deepEqual(core.activeColumns([]), { album: false, isrc: false });
});

test("no export declares a nameless column", () => {
  // "title,artist,album,isrc," used to add a fifth column with an empty name,
  // which Soundiiz discards, plus an empty comma on every single line.
  for (const target of ["soundiiz", "tunemymusicCsv", "reviewCsv"]) {
    const header = core.parseCsv(exportFor(target).text)[0];
    for (const name of header) {
      assert.notEqual(name.trim(), "", `${target} header has an empty column name`);
    }
  }
});

test("no export line ends in a run of empty fields", () => {
  for (const target of ["soundiiz", "tunemymusicCsv"]) {
    for (const line of exportFor(target).text.trim().split("\n")) {
      assert.ok(!/,,$/.test(line), `${target} line has trailing empty columns: ${line}`);
    }
  }
});

test("the TuneMyMusic CSV uses the column names TuneMyMusic recognizes", () => {
  const file = exportFor("tunemymusicCsv");
  assert.equal(file.text.split("\n")[0], "Track name,Artist name,Album");
  assert.equal(file.filename, "fortnite-jam-tracks-tunemymusic-2026-03-04.csv");
});

test("the TuneMyMusic text export is Artist - Title, with no header", () => {
  const file = exportFor("tunemymusicText");
  const lines = file.text.trim().split("\n");
  assert.ok(lines.every((line) => line.includes(" - ")));
  assert.equal(file.filename, "fortnite-jam-tracks-tunemymusic-2026-03-04.txt");
  assert.equal(file.mime, "text/plain;charset=utf-8");
  assert.ok(lines.some((line) => line === "Britney Spears - Work Bitch"));
});

test("the review CSV lists every track, not just the included ones", () => {
  const file = exportFor("reviewCsv", "recommended");
  assert.equal(file.text.split("\n")[0],
    "status,title,artist,exportTitle,exportArtist,album,isrc,source,addedToFortnite,releaseYear,note");
  assert.equal(file.count, TRACKS.length);
  assert.equal(file.text.trim().split("\n").length - 1, TRACKS.length);
});

test("the review CSV records each decision's status", () => {
  const rows = core.parseCsv(exportFor("reviewCsv", "recommended").text).slice(1);
  const statuses = new Set(rows.map((cells) => cells[0]));
  assert.ok(statuses.has("include"));
  assert.ok(statuses.has("exclude"));
  assert.ok(statuses.has("review"));
});

test("an unknown target falls back to Soundiiz", () => {
  const options = optionsFor("recommended", { target: "nonsense" });
  const decisions = core.decide(TRACKS, options);
  const file = core.buildExport("nonsense", core.selectRows(decisions, options), decisions, options, NOW);
  assert.equal(file.target, "soundiiz");
  assert.equal(file.text.split("\n")[0], "title,artist,album");
});

test("the TuneMyMusic CSV puts the track in the Track name column", () => {
  // The header changed from artist-first to title-first, so the row order had
  // to change with it.
  const rows = core.parseCsv(exportFor("tunemymusicCsv").text);
  assert.equal(rows[0][0], "Track name");
  const row = rows.slice(1).find((cells) => cells[0] === "Work Bitch");
  assert.ok(row, "expected the aliased track in the export");
  assert.equal(row[1], "Britney Spears");
  assert.equal(row[2], "", "this alias carries no album");
});

test("commas and quotes in a title survive a CSV round trip", () => {
  const tracks = core.parseTracks({
    tricky: { id: "tricky", title: 'Hello, "World"', artist: "A, B & C", previewUrl: "x" }
  }).tracks;
  const options = optionsFor("complete", { target: "soundiiz" });
  const decisions = core.decide(tracks, options);
  const file = core.buildExport("soundiiz", core.selectRows(decisions, options), decisions, options, NOW);

  const cells = core.parseCsv(file.text)[1];
  assert.equal(cells[0], 'Hello, "World"');
  assert.equal(cells[1], "A, B & C");
});

test("every export ends with exactly one trailing newline", () => {
  for (const target of Object.keys(core.TARGETS)) {
    const text = exportFor(target).text;
    assert.ok(text.endsWith("\n"), `${target} should end with a newline`);
    assert.ok(!text.endsWith("\n\n"), `${target} should not end with a blank line`);
  }
});

test("buildAllExports returns one file per target, with unique names", () => {
  const options = optionsFor("recommended");
  const files = core.buildAllExports(core.decide(TRACKS, options), options, NOW);
  assert.equal(files.length, Object.keys(core.TARGETS).length);
  assert.equal(new Set(files.map((f) => f.filename)).size, files.length);
  assert.ok(files.every((f) => f.text.length > 0));
});

test("export row counts follow the include counts", () => {
  const options = optionsFor("recommended");
  const decisions = core.decide(TRACKS, options);
  const counts = core.countByStatus(decisions);
  assert.equal(exportFor("soundiiz").count, counts.include);
});

test("the review CSV reports the title the export will really contain", () => {
  // A review-only alias is a hint, never a substitution. The review CSV used
  // to print the alias title here while the export kept the Fortnite title.
  const options = optionsFor("complete", { useAliases: true, target: "reviewCsv" });
  const decisions = core.decide(TRACKS, options);
  const rows = core.selectRows(decisions, options);
  const csv = core.parseCsv(core.buildExport("reviewCsv", rows, decisions, options, NOW).text);

  const row = csv.slice(1).find((cells) => cells[1].startsWith("Star Wars Main Title Theme"));
  const exported = rows.find((r) => r.originalTitle.startsWith("Star Wars Main Title Theme"));
  assert.equal(row[3], exported.title, "exportTitle must match the exported row");
  assert.equal(row[4], exported.artist, "exportArtist must match the exported row");
  assert.equal(row[7], "dataset", "a review-only alias is never substituted");
  // The alias note is still surfaced as guidance.
  assert.match(row[10], /Fortnite rearrangement/);
});

test("the review CSV agrees with the export for every aliased track", () => {
  const options = optionsFor("complete", { useAliases: true, sendAlbums: true });
  const decisions = core.decide(TRACKS, options);
  const rows = core.selectRows(decisions, options);
  const csv = core.parseCsv(core.buildExport("reviewCsv", rows, decisions, options, NOW).text);

  for (const cells of csv.slice(1)) {
    const exported = rows.find((r) => r.originalTitle === cells[1] && r.originalArtist === cells[2]);
    if (!exported) continue;
    assert.equal(cells[3], exported.title, `exportTitle disagrees for ${cells[1]}`);
    assert.equal(cells[4], exported.artist, `exportArtist disagrees for ${cells[1]}`);
    assert.equal(cells[5], exported.album, `album disagrees for ${cells[1]}`);
  }
});

test("a real song is not mistaken for an Epic original by its title", () => {
  // ORIGINAL_IDS contains ids like "change", "dreamer" and "bloom" that are
  // also ordinary song titles. Matching a squashed title against that set
  // silently dropped real licensed songs.
  const tracks = core.parseTracks({
    _metadata: {},
    realsong: { id: "realsong", title: "Change", artist: "Christina Aguilera", previewUrl: "x" }
  }).tracks;

  assert.equal(core.classify(tracks[0]).flags.isOriginal, false);
  const options = optionsFor("recommended");
  assert.equal(core.decide(tracks, options)[0].status, "include");
});

test("ORIGINAL_IDS still pins a track by its id", () => {
  // The id set is the intended escape hatch and must keep working.
  const tracks = core.parseTracks({
    _metadata: {},
    dreamer: { id: "dreamer", title: "Renamed Somehow", artist: "Not Epic", previewUrl: "x" }
  }).tracks;

  assert.equal(core.classify(tracks[0]).flags.isOriginal, true);
  assert.equal(core.decide(tracks, optionsFor("recommended"))[0].status, "exclude");
});

/* ------------------------------------- Fortnite originals by fictional band */

test("an Epic Battle Pass track credited to a fictional band is excluded", () => {
  // "Runamok" by "Tasty Bois (ft. Backchat)" is a Battle Pass / Item Shop
  // track, not a streaming release, and Soundiiz could not find it. Nothing
  // about its artist string marks it as Epic's, so it is pinned by id.
  const decisions = core.decide(TRACKS, optionsFor("recommended"));
  const hit = findByTitle(decisions, "Runamok");
  assert.equal(hit.status, "exclude");
  assert.ok(hit.reasons.includes(core.REASONS.original));
});

test("the pinned Fortnite original comes back under Complete", () => {
  const decisions = core.decide(TRACKS, optionsFor("complete"));
  assert.equal(findByTitle(decisions, "Runamok").status, "include");
});

/* ------------------------------------------- aliases from the first import */

test("titles Fortnite shortens are expanded to their streaming form", () => {
  const options = optionsFor("recommended", { useAliases: true });
  const rows = core.selectRows(core.decide(TRACKS, options), options);
  const by = (original) => rows.find((r) => r.originalTitle === original);

  assert.equal(by("Locked & Loaded").title, "Locked & Loaded (Official Fortnite Anthem)");
  assert.equal(by("A Bar Song").title, "A Bar Song (Tipsy)");
  assert.equal(by("Rocket Man").title, "Rocket Man (I Think It's Going To Be A Long Long Time)");
});

test("aliases a real import disproved were removed, not kept as guesses", () => {
  // "Popular" failed both as the full credit and as the lead artist alone;
  // "What Is Love" and "World Is Mine" failed with and without their albums.
  // None of them has an alias any more - resolve.js looks them up instead.
  for (const [title, artist] of [
    ["Popular", "The Weeknd, Madonna & Playboi Carti"],
    ["What Is Love", "Haddaway"],
    ["World Is Mine", "ryo (supercell) ft. Hatsune Miku"]
  ]) {
    assert.equal(core.MATCH_ALIASES.has(core.trackKey(title, artist)), false,
      `${title} should no longer carry a disproven alias`);
  }
});

test("World Is Mine keeps the raw artist string that actually matches", () => {
  // "Melt" by the same artist string imported fine with no alias, while the
  // rewritten "World Is Mine" did not, so the rewrite was removed.
  const options = optionsFor("recommended", { useAliases: true });
  const rows = core.selectRows(core.decide(TRACKS, options), options);
  const world = rows.find((r) => r.originalTitle === "World Is Mine");
  const melt = rows.find((r) => r.originalTitle === "Melt");
  assert.equal(world.artist, "ryo (supercell) ft. Hatsune Miku");
  assert.equal(world.artist, melt.artist, "both should use the same artist string");
});

/* --------------------------------------------------- import failure loop */

const RESULT_CSV = [
  "title,artist,album,isrc,isFound",
  'Mood,"24kGoldn ft. iann dior",,,1',
  '"Work Bitch","Britney Spears",,,1',
  'Runamok,"Tasty Bois (ft. Backchat)",,,0',
  '"He Gets Me So High",beabadoobee,,,0',
  '"Not A Jam Track","Nobody At All",,,0'
].join("\n") + "\n";

test("parseFailureRows keeps only the rows marked not found", () => {
  const rows = core.parseFailureRows(RESULT_CSV);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.title).sort(),
    ["He Gets Me So High", "Not A Jam Track", "Runamok"]);
});

test("parseFailureRows treats a file with no isFound column as all failures", () => {
  const rows = core.parseFailureRows('title,artist\n"Rocket Man","Elton John"\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Rocket Man");
});

test("matchFailures maps failed rows back and reports what it could not place", () => {
  const options = optionsFor("complete");
  const decisions = core.decide(TRACKS, options);
  const result = core.matchFailures(decisions, options, RESULT_CSV);

  assert.equal(result.matched, 2, "Runamok and He Gets Me So High are real tracks");
  assert.equal(result.unmatched.length, 1);
  assert.equal(result.unmatched[0].title, "Not A Jam Track");
});

test("matchFailures recognises a track by its aliased export title", () => {
  // The pasted CSV contains whatever was exported, which may be an alias.
  const options = optionsFor("recommended", { useAliases: true });
  const decisions = core.decide(TRACKS, options);
  const result = core.matchFailures(decisions, options,
    'title,artist,isFound\n"A Bar Song (Tipsy)",Shaboozey,0\n');

  assert.equal(result.matched, 1);
  assert.equal(result.unmatched.length, 0);
  assert.ok(result.failures[core.trackKey("A Bar Song", "Shaboozey")],
    "should resolve to the original Fortnite track");
});

test("dropping failures removes exactly those tracks from the export", () => {
  const options = optionsFor("complete");
  const decisions = core.decide(TRACKS, options);
  const before = core.selectRows(decisions, options).length;
  const result = core.matchFailures(decisions, options, RESULT_CSV);

  const after = optionsFor("complete", { failures: result.failures });
  const rebuilt = core.decide(TRACKS, after);
  assert.equal(core.selectRows(rebuilt, after).length, before - result.matched);

  for (const decision of rebuilt.filter((d) => d.source === "notFound")) {
    assert.equal(decision.status, "exclude");
    assert.ok(decision.reasons.includes(core.REASONS.notFound));
  }
});

test("a manual Keep overrules a not-found drop", () => {
  const key = core.trackKey("He Gets Me So High", "beabadoobee");
  const options = optionsFor("complete", {
    failures: { [key]: true },
    overrides: { [key]: "include" }
  });
  const hit = findByTitle(core.decide(TRACKS, options), "He Gets Me So High");
  assert.equal(hit.status, "include");
  assert.equal(hit.source, "override");
});

test("an empty result CSV changes nothing", () => {
  const options = optionsFor("complete");
  const decisions = core.decide(TRACKS, options);
  const result = core.matchFailures(decisions, options, "");
  assert.deepEqual(result.failures, {});
  assert.equal(result.matched, 0);
});

/* --------------------------------------------------------------- CSV parse */

test("parseCsv handles quotes, escaped quotes, embedded commas and CRLF", () => {
  const rows = core.parseCsv('a,b\r\n"x,1","he said ""hi"""\r\n');
  assert.deepEqual(rows, [["a", "b"], ["x,1", 'he said "hi"']]);
});

test("parseCsv skips blank lines and tolerates a missing final newline", () => {
  assert.deepEqual(core.parseCsv("a,b\n\n\nc,d"), [["a", "b"], ["c", "d"]]);
});

test("parseCsv returns nothing for empty input", () => {
  assert.deepEqual(core.parseCsv(""), []);
  assert.deepEqual(core.parseCsv(null), []);
});

/* -------------------------------------------------------- not-found helper */

test("suggestRetries uses a curated alias when one exists", () => {
  const out = core.suggestRetries('title,artist,album,isrc,isFound\n"A Bar Song",Shaboozey,,,0\n');
  assert.equal(out.length, 1);
  assert.equal(out[0].retry, "Shaboozey - A Bar Song (Tipsy)");
  assert.match(out[0].note, /Tipsy/);
});

test("a credit inside brackets does not leave a dangling bracket", () => {
  // "Tasty Bois (ft. Backchat)" used to become "Tasty Bois (".
  assert.equal(core.fallbackAlias("Runamok", "Tasty Bois (ft. Backchat)").artist, "Tasty Bois");
  assert.equal(core.dropUnclosedBracket("Tasty Bois ("), "Tasty Bois");
  assert.equal(core.dropUnclosedBracket("Someone (Live)"), "Someone (Live)");
  assert.equal(core.dropUnclosedBracket("Plain Name"), "Plain Name");
});

test("suggestRetries strips featured credits and orchestra suffixes otherwise", () => {
  const out = core.suggestRetries(
    'title,artist\n"Some Song (Fortnite Rearrangement)","John Williams & The London Symphony Orchestra"\n' +
    '"Another Song","Someone ft. Guest"\n'
  );
  assert.equal(out[0].retry, "John Williams - Some Song");
  assert.equal(out[1].retry, "Someone - Another Song");
});

test("suggestRetries respects column order from the header", () => {
  const out = core.suggestRetries('artist,title\n"Britney Spears","Work Work"\n');
  assert.equal(out[0].retry, "Britney Spears - Work Bitch");
});

test("suggestRetries falls back to title,artist with no header", () => {
  const out = core.suggestRetries('"Work Work","Britney Spears"\n');
  assert.equal(out[0].retry, "Britney Spears - Work Bitch");
});

test("suggestRetries skips rows with no title and handles empty input", () => {
  assert.deepEqual(core.suggestRetries(""), []);
  assert.equal(core.suggestRetries('title,artist\n"","Nobody"\n').length, 0);
});

test("formatRetries writes one commented line per suggestion", () => {
  const out = core.formatRetries(core.suggestRetries('title,artist\n"Work Work","Britney Spears"\n'));
  assert.equal(out, "Britney Spears - Work Bitch    # Fortnite uses a censored display title.\n");
  assert.equal(core.formatRetries([]), "");
});

/* ------------------------------------------------------------------ shape */

test("withDefaults fills gaps without discarding supplied values", () => {
  const options = core.withDefaults({ target: "tunemymusicText", includeOriginals: true });
  assert.equal(options.target, "tunemymusicText");
  assert.equal(options.includeOriginals, true);
  assert.equal(options.useAliases, core.DEFAULT_OPTIONS.useAliases);
  assert.deepEqual(options.overrides, {});
});

test("decide and selectRows tolerate empty and missing input", () => {
  assert.deepEqual(core.decide([], {}), []);
  assert.deepEqual(core.decide(undefined, {}), []);
  assert.deepEqual(core.selectRows([], {}), []);
  assert.deepEqual(core.countByStatus([]), { include: 0, review: 0, exclude: 0 });
});

test("SWITCH_IDS matches the keys every preset defines", () => {
  for (const preset of Object.keys(core.PRESETS)) {
    assert.deepEqual(
      Object.keys(core.PRESETS[preset].switches).sort(),
      core.SWITCH_IDS.slice().sort(),
      `preset ${preset} does not define every switch`
    );
  }
});

test("every target declares a label, extension and mime type", () => {
  for (const key of Object.keys(core.TARGETS)) {
    const spec = core.TARGETS[key];
    assert.ok(spec.label && spec.blurb && spec.extension && spec.mime, `target ${key} is incomplete`);
  }
});
