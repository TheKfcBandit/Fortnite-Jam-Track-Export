/*
 * Unit tests for assets/resolve.js.
 *
 * No network: every test injects fetchJson. The provider payloads below follow
 * each API's documented response shape, and the track titles/artists are the
 * exact strings from two real Soundiiz imports, including the six the second
 * import still could not find.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const resolve = require("../../assets/resolve.js");
const core = require("../../assets/core.js");

/* --------------------------------------------------------------- fixtures */

// The six tracks the second real import reported as isFound=0.
const MISSES = {
  whatIsLove:  { title: "What Is Love", artist: "Haddaway" },
  popular:     { title: "Popular", artist: "The Weeknd, Madonna & Playboi Carti" },
  worldIsMine: { title: "World Is Mine", artist: "ryo (supercell) ft. Hatsune Miku" },
  laptiNek:    { title: "Lapti Nek (Jabba's Palace)", artist: "John Williams & The London Symphony Orchestra" },
  futw:        { title: "FUTW (Vixi Solo Version)", artist: "LISA" },
  soHigh:      { title: "He Gets Me So High", artist: "beabadoobee" }
};

const itunesPayload = (results) => ({ resultCount: results.length, results });
const itunesSong = (trackName, artistName, collectionName) => ({
  wrapperType: "track", kind: "song",
  trackName, artistName, collectionName,
  trackId: 1, artistId: 2, collectionId: 3,
  trackViewUrl: "https://music.apple.com/track/1",
  previewUrl: "https://audio-ssl.itunes.apple.com/x"
});

const mbPayload = (recordings) => ({ created: "2026-01-01", count: recordings.length, recordings });
const mbRecording = (title, artistNames, releaseTitle, isrcs) => ({
  id: "11111111-2222-3333-4444-555555555555",
  score: 100,
  title,
  "artist-credit": artistNames.map((name) => ({ name, artist: { id: "a", name } })),
  releases: releaseTitle ? [{ id: "r", title: releaseTitle }] : [],
  isrcs: isrcs || []
});

/* ------------------------------------------------------------ text helpers */

test("stripCredits keeps the lead artist only", () => {
  assert.equal(resolve.stripCredits("ryo (supercell) ft. Hatsune Miku"), "ryo (supercell)");
  assert.equal(resolve.stripCredits("The Weeknd, Madonna & Playboi Carti"), "The Weeknd");
  assert.equal(resolve.stripCredits("John Williams & The London Symphony Orchestra"), "John Williams");
  assert.equal(resolve.stripCredits("Post Malone w/ Swae Lee"), "Post Malone");
  assert.equal(resolve.stripCredits("Haddaway"), "Haddaway");
});

test("stripCredits never returns an empty artist", () => {
  assert.equal(resolve.stripCredits("ft. Nobody"), "ft. Nobody");
  assert.equal(resolve.stripCredits(""), "");
});

test("stripParens drops a trailing variant label", () => {
  assert.equal(resolve.stripParens("FUTW (Vixi Solo Version)"), "FUTW");
  assert.equal(resolve.stripParens("Lapti Nek (Jabba's Palace)"), "Lapti Nek");
  assert.equal(resolve.stripParens("Popular"), "Popular");
  // A title that is nothing but a bracket keeps its original form.
  assert.equal(resolve.stripParens("(Instrumental)"), "(Instrumental)");
});

test("norm folds case, punctuation and apostrophes but keeps CJK", () => {
  assert.equal(resolve.norm("Don't  Stop!"), "dont stop");
  assert.equal(resolve.norm("夜に駆ける"), "夜に駆ける");
});

test("escapeLucene escapes quotes and backslashes", () => {
  assert.equal(resolve.escapeLucene('a "b" c'), 'a \\"b\\" c');
  assert.equal(resolve.escapeLucene("back\\slash"), "back\\\\slash");
});

/* ------------------------------------------------------------ query build */

test("buildQueries tries the full credit, then the lead artist, then the bare title", () => {
  const queries = resolve.buildQueries(MISSES.worldIsMine);
  assert.equal(queries[0], "ryo (supercell) ft. Hatsune Miku World Is Mine");
  assert.ok(queries.includes("ryo (supercell) World Is Mine"));
  assert.ok(queries.includes("World Is Mine"));
});

test("buildQueries strips a variant label into its own attempt", () => {
  const queries = resolve.buildQueries(MISSES.futw);
  assert.ok(queries.some((q) => q === "LISA FUTW"), `got ${JSON.stringify(queries)}`);
});

test("buildQueries never repeats a form and never yields an empty one", () => {
  for (const track of Object.values(MISSES)) {
    const queries = resolve.buildQueries(track);
    assert.equal(new Set(queries).size, queries.length, track.title);
    assert.ok(queries.every((q) => q.trim().length > 0), track.title);
  }
});

/* ----------------------------------------------------------------- parsing */

test("the iTunes parser reads the documented response shape", () => {
  const candidates = resolve.PROVIDERS.itunes.parse(itunesPayload([
    itunesSong("What Is Love", "Haddaway", "The Album")
  ]));
  assert.equal(candidates.length, 1);
  assert.deepEqual(
    { title: candidates[0].title, artist: candidates[0].artist, album: candidates[0].album },
    { title: "What Is Love", artist: "Haddaway", album: "The Album" }
  );
  assert.equal(candidates[0].isrc, "", "iTunes does not return ISRCs");
  assert.equal(candidates[0].source, "itunes");
});

test("the MusicBrainz parser joins the artist credit and lifts the first ISRC", () => {
  const candidates = resolve.PROVIDERS.musicbrainz.parse(mbPayload([
    mbRecording("World Is Mine", ["supercell", "Hatsune Miku"], "supercell", ["JPU901000123"])
  ]));
  assert.equal(candidates[0].artist, "supercell, Hatsune Miku");
  assert.equal(candidates[0].isrc, "JPU901000123");
  assert.equal(candidates[0].album, "supercell");
  assert.match(candidates[0].reference, /musicbrainz\.org\/recording\//);
});

test("both parsers survive empty, malformed and partial payloads", () => {
  for (const provider of Object.values(resolve.PROVIDERS)) {
    assert.deepEqual(provider.parse(null), []);
    assert.deepEqual(provider.parse({}), []);
    assert.deepEqual(provider.parse({ results: "nope", recordings: "nope" }), []);
  }
  // Rows missing a title or artist are dropped rather than exported blank.
  assert.deepEqual(resolve.PROVIDERS.itunes.parse(itunesPayload([
    itunesSong("", "Haddaway", "x"), itunesSong("What Is Love", "", "x")
  ])), []);
  assert.deepEqual(resolve.PROVIDERS.musicbrainz.parse(mbPayload([
    mbRecording("No Credit", [], "", [])
  ])), []);
});

test("provider URLs encode the query and target the right endpoint", () => {
  const itunesUrl = resolve.PROVIDERS.itunes.url("Haddaway What Is Love");
  assert.ok(itunesUrl.startsWith("https://itunes.apple.com/search?"));
  assert.ok(itunesUrl.includes("entity=song"));
  assert.ok(itunesUrl.includes("Haddaway%20What%20Is%20Love"));

  const mbUrl = resolve.PROVIDERS.musicbrainz.url("What Is Love", MISSES.whatIsLove);
  assert.ok(mbUrl.startsWith("https://musicbrainz.org/ws/2/recording?"));
  assert.ok(mbUrl.includes("fmt=json"));
  assert.ok(decodeURIComponent(mbUrl).includes('recording:"What Is Love"'));
  assert.ok(decodeURIComponent(mbUrl).includes('artist:"Haddaway"'));
});

/* ----------------------------------------------------------------- scoring */

test("the right candidate wins for each of the six real misses", () => {
  const cases = [
    [MISSES.whatIsLove,  itunesSong("What Is Love", "Haddaway", "The Album"),
                         itunesSong("What Is Love", "Never The Strangers", "Diary")],
    [MISSES.popular,     itunesSong("Popular", "The Weeknd, Playboi Carti & Madonna", "The Idol"),
                         itunesSong("Popular Monster", "Falling In Reverse", "Popular Monster")],
    [MISSES.worldIsMine, itunesSong("World Is Mine", "supercell", "supercell"),
                         itunesSong("World Is Mine", "Some Cover Band", "Covers")],
    [MISSES.futw,        itunesSong("FUTW", "LISA", "Alter Ego"),
                         itunesSong("Future", "LISA", "Other")],
    [MISSES.soHigh,      itunesSong("He Gets Me So High", "beabadoobee", "Our Extended Play"),
                         itunesSong("So High", "Doja Cat", "Amala")],
    [MISSES.laptiNek,    itunesSong("Lapti Nek", "John Williams", "Return of the Jedi"),
                         itunesSong("Cantina Band", "John Williams", "Star Wars")]
  ];

  for (const [track, right, wrong] of cases) {
    const picked = resolve.pickBest(track, resolve.PROVIDERS.itunes.parse(itunesPayload([wrong, right])));
    assert.equal(picked.candidate.title, right.trackName,
      `${track.title}: picked ${picked.candidate.title} / ${picked.candidate.artist}`);
    assert.ok(picked.confidence > 0, `${track.title} scored 0`);
  }
});

test("a title that does not overlap cannot be confident, however right the artist", () => {
  const picked = resolve.pickBest(MISSES.whatIsLove,
    resolve.PROVIDERS.itunes.parse(itunesPayload([itunesSong("Life", "Haddaway", "The Album")])));
  assert.ok(picked.confidence < resolve.CONFIDENT,
    `same artist, wrong song should not be confident (got ${picked.confidence})`);
});

test("an artist written differently still resolves when the title matches", () => {
  // Fortnite says "ryo (supercell) ft. Hatsune Miku"; stores say "supercell".
  const picked = resolve.pickBest(MISSES.worldIsMine,
    resolve.PROVIDERS.itunes.parse(itunesPayload([itunesSong("World Is Mine", "supercell", "supercell")])));
  assert.ok(picked.confidence >= resolve.CONFIDENT,
    `expected confidence >= ${resolve.CONFIDENT}, got ${picked.confidence}`);
});

test("an ISRC breaks a tie between equally good candidates", () => {
  const withIsrc = resolve.PROVIDERS.musicbrainz.parse(mbPayload([
    mbRecording("What Is Love", ["Haddaway"], "The Album", []),
    mbRecording("What Is Love", ["Haddaway"], "The Album", ["DEA620201558"])
  ]));
  assert.equal(resolve.pickBest(MISSES.whatIsLove, withIsrc).candidate.isrc, "DEA620201558");
});

test("pickBest returns null when there is nothing to pick", () => {
  assert.equal(resolve.pickBest(MISSES.popular, []), null);
  assert.equal(resolve.pickBest(MISSES.popular, undefined), null);
});

test("coverage is symmetric-free and bounded", () => {
  assert.equal(resolve.coverage("a b", "a b c"), 1);
  assert.equal(resolve.coverage("a b c", "a"), 1 / 3);
  assert.equal(resolve.coverage("", "anything"), 0);
});

/* --------------------------------------------------------------- resolving */

function fakeFetch(byUrl) {
  const calls = [];
  const fetchJson = (url) => {
    calls.push(url);
    const entry = Object.keys(byUrl).find((needle) => url.includes(needle));
    if (!entry) return Promise.resolve(itunesPayload([]));
    const value = byUrl[entry];
    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  };
  return { fetchJson, calls };
}

const noWait = () => Promise.resolve();

test("resolveTrack stops at the first confident answer", async () => {
  const { fetchJson, calls } = fakeFetch({
    "Haddaway%20What%20Is%20Love": itunesPayload([itunesSong("What Is Love", "Haddaway", "The Album")])
  });
  const result = await resolve.resolveTrack(MISSES.whatIsLove, { fetchJson });

  assert.equal(result.status, "resolved");
  assert.equal(result.candidate.title, "What Is Love");
  assert.equal(calls.length, 1, "a confident first query needs no further attempts");
});

test("resolveTrack falls through to a later query form", async () => {
  // The full credit finds nothing; the lead artist does.
  const { fetchJson, calls } = fakeFetch({
    "ryo%20(supercell)%20World%20Is%20Mine":
      itunesPayload([itunesSong("World Is Mine", "supercell", "supercell")])
  });
  const result = await resolve.resolveTrack(MISSES.worldIsMine, { fetchJson });

  assert.equal(result.status, "resolved");
  assert.equal(result.candidate.artist, "supercell");
  assert.ok(calls.length >= 2, "should have tried the full credit first");
});

test("resolveTrack reports a weak match as uncertain rather than applying it", async () => {
  const { fetchJson } = fakeFetch({
    "itunes.apple.com": itunesPayload([itunesSong("Life", "Haddaway", "The Album")])
  });
  const result = await resolve.resolveTrack(MISSES.whatIsLove, { fetchJson });
  assert.equal(result.status, "uncertain");
  assert.ok(result.confidence < resolve.CONFIDENT);
});

test("resolveTrack reports nothing found when every form comes back empty", async () => {
  const { fetchJson } = fakeFetch({});
  const result = await resolve.resolveTrack(MISSES.popular, { fetchJson });
  assert.equal(result.status, "none");
  assert.ok(result.queriesTried >= 1);
});

test("resolveTrack surfaces a network failure instead of pretending", async () => {
  const { fetchJson } = fakeFetch({ "itunes.apple.com": new Error("Failed to fetch") });
  const result = await resolve.resolveTrack(MISSES.popular, { fetchJson });
  assert.equal(result.status, "error");
  assert.match(result.message, /Failed to fetch/);
});

test("resolveTrack recovers when only one query form errors", async () => {
  let first = true;
  const fetchJson = (url) => {
    if (first) { first = false; return Promise.reject(new Error("boom")); }
    return Promise.resolve(itunesPayload([itunesSong("Popular", "The Weeknd, Playboi Carti & Madonna", "The Idol")]));
  };
  const result = await resolve.resolveTrack(MISSES.popular, { fetchJson });
  assert.equal(result.status, "resolved");
});

test("resolveTrack refuses to run without a fetchJson", async () => {
  await assert.rejects(() => resolve.resolveTrack(MISSES.popular, {}), /needs a fetchJson/);
});

test("resolveTracks reports progress and never rejects on one bad lookup", async () => {
  const tracks = [MISSES.whatIsLove, MISSES.popular, MISSES.futw];
  let calls = 0;
  const fetchJson = () => {
    calls += 1;
    if (calls === 2) return Promise.reject(new Error("rate limited"));
    return Promise.resolve(itunesPayload([itunesSong("What Is Love", "Haddaway", "The Album")]));
  };

  const progress = [];
  const results = await resolve.resolveTracks(tracks, {
    fetchJson, wait: noWait,
    onProgress: (event) => progress.push(event)
  });

  assert.equal(results.length, 3, "every track gets a result");
  assert.equal(progress.length, 3);
  assert.deepEqual(progress.map((p) => p.done), [1, 2, 3]);
  assert.ok(progress.every((p) => p.total === 3));
});

test("resolveTracks waits between calls using the provider's interval", async () => {
  const waits = [];
  const { fetchJson } = fakeFetch({});
  await resolve.resolveTracks([MISSES.popular, MISSES.futw], {
    fetchJson,
    provider: "musicbrainz",
    wait: (ms) => { waits.push(ms); return Promise.resolve(); }
  });
  assert.ok(waits.length >= 1, "should pause between tracks");
  assert.equal(waits[0], resolve.PROVIDERS.musicbrainz.minIntervalMs);
});

test("resolveTracks stops early when cancelled", async () => {
  const { fetchJson, calls } = fakeFetch({});
  const results = await resolve.resolveTracks(
    [MISSES.popular, MISSES.futw, MISSES.soHigh],
    { fetchJson, wait: noWait, isCancelled: () => true }
  );
  assert.equal(results.length, 0);
  assert.equal(calls.length, 0);
});

test("resolveTracks handles an empty list", async () => {
  const { fetchJson } = fakeFetch({});
  assert.deepEqual(await resolve.resolveTracks([], { fetchJson, wait: noWait }), []);
});

/* ------------------------------------------------------------ corrections */

test("toCorrections applies confident results and withholds uncertain ones", () => {
  const results = [
    { status: "resolved", provider: "itunes", confidence: 0.9, track: MISSES.whatIsLove,
      candidate: { title: "What Is Love", artist: "Haddaway", album: "The Album", isrc: "", source: "itunes", reference: "u" } },
    { status: "uncertain", provider: "itunes", confidence: 0.4, track: MISSES.popular,
      candidate: { title: "Popular Monster", artist: "Falling In Reverse", album: "", isrc: "", source: "itunes" } },
    { status: "none", provider: "itunes", track: MISSES.futw }
  ];
  const keyOf = (t) => core.trackKey(t.title, t.artist);

  const strict = resolve.toCorrections(results, keyOf);
  assert.equal(Object.keys(strict).length, 1);
  assert.ok(strict[keyOf(MISSES.whatIsLove)]);

  const loose = resolve.toCorrections(results, keyOf, { includeUncertain: true });
  assert.equal(Object.keys(loose).length, 2);
});

test("a correction produced by the resolver flows into the export with its ISRC", () => {
  const results = [{
    status: "resolved", provider: "musicbrainz", confidence: 0.95, track: MISSES.whatIsLove,
    candidate: { title: "What Is Love", artist: "Haddaway", album: "The Album",
                 isrc: "DEA620201558", source: "musicbrainz", reference: "r" }
  }];
  const corrections = resolve.toCorrections(results, (t) => core.trackKey(t.title, t.artist));

  const tracks = core.parseTracks({
    _metadata: {},
    whatislove: { id: "whatislove", title: "What Is Love", artist: "Haddaway", previewUrl: "x" }
  }).tracks;
  const options = Object.assign({ preset: "complete", corrections },
    core.presetSwitches("complete"), { target: "soundiiz" });

  const decisions = core.decide(tracks, options);
  const rows = core.selectRows(decisions, options);
  assert.equal(rows[0].isrc, "DEA620201558");
  assert.equal(rows[0].origin, "correction");

  const file = core.buildExport("soundiiz", rows, decisions, options, new Date("2026-03-04T00:00:00Z"));
  assert.equal(file.text.split("\n")[0], "title,artist,album,isrc",
    "the isrc column appears once something fills it");
  assert.ok(file.text.includes("DEA620201558"));
});
