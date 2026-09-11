/*
 * resolve.js — look a track up in a public music database and report what it
 * is actually called there.
 *
 * Why this exists: the FNFestival dataset carries no streaming identifier at
 * all (previewUrl is an audio hash, and 82 of them point at Apple rather than
 * Spotify). Everything downstream is therefore a fuzzy text search, and a
 * hand-written alias table can only ever be a guess that takes a full import
 * round-trip to test. Two real imports fixed three tracks that way and broke a
 * fourth. Asking an authoritative source instead ends that loop.
 *
 * All network access is injected as `fetchJson`, so every function here is
 * testable without a network. Nothing in this file touches the DOM.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   * Providers
   * ------------------------------------------------------------------ */

  /*
   * iTunes Search API — no key, no auth, and the dataset already sources 82
   * of its previews from Apple, so coverage of this catalogue is known good.
   * Returns canonical store metadata but no ISRC.
   */
  var itunes = {
    id: "itunes",
    label: "Apple Music / iTunes",
    hasIsrc: false,
    // Apple asks for no more than ~20 calls/minute from one client.
    minIntervalMs: 3000,
    url: function (query) {
      return "https://itunes.apple.com/search?media=music&entity=song&limit=5&term=" +
        encodeURIComponent(query);
    },
    parse: function (payload) {
      if (!payload || !Array.isArray(payload.results)) return [];
      return payload.results.map(function (item) {
        return {
          title: str(item.trackName),
          artist: str(item.artistName),
          album: str(item.collectionName),
          isrc: "",
          source: "itunes",
          reference: item.trackViewUrl ? str(item.trackViewUrl) : ""
        };
      }).filter(function (candidate) {
        return candidate.title && candidate.artist;
      });
    }
  };

  /*
   * MusicBrainz — no key, documented CORS, and the only free source here that
   * carries ISRCs. An ISRC is matched exactly by Soundiiz rather than
   * searched, which is the real prize. Rate limited to roughly one call a
   * second for anonymous clients, so this is only ever used on the handful of
   * tracks an import actually missed.
   */
  var musicbrainz = {
    id: "musicbrainz",
    label: "MusicBrainz (adds ISRCs)",
    hasIsrc: true,
    minIntervalMs: 1100,
    url: function (query, track) {
      var lucene = 'recording:"' + escapeLucene(query) + '"';
      if (track && track.artist) {
        lucene += ' AND artist:"' + escapeLucene(stripCredits(track.artist)) + '"';
      }
      return "https://musicbrainz.org/ws/2/recording?fmt=json&limit=5&query=" +
        encodeURIComponent(lucene);
    },
    parse: function (payload) {
      if (!payload || !Array.isArray(payload.recordings)) return [];
      return payload.recordings.map(function (item) {
        var credits = Array.isArray(item["artist-credit"]) ? item["artist-credit"] : [];
        var artist = credits.map(function (credit) {
          return str(credit.name || (credit.artist && credit.artist.name));
        }).filter(Boolean).join(", ");
        var releases = Array.isArray(item.releases) ? item.releases : [];
        var isrcs = Array.isArray(item.isrcs) ? item.isrcs : [];
        return {
          title: str(item.title),
          artist: artist,
          album: releases.length ? str(releases[0].title) : "",
          isrc: isrcs.length ? str(isrcs[0]) : "",
          source: "musicbrainz",
          reference: item.id ? "https://musicbrainz.org/recording/" + str(item.id) : ""
        };
      }).filter(function (candidate) {
        return candidate.title && candidate.artist;
      });
    }
  };

  var PROVIDERS = { itunes: itunes, musicbrainz: musicbrainz };
  var DEFAULT_PROVIDER = "itunes";

  /* ------------------------------------------------------------------ *
   * Text helpers
   * ------------------------------------------------------------------ */

  function str(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/\s+/g, " ")
      .trim();
  }

  function norm(value) {
    return str(value)
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9\u3000-\u9fff\uff00-\uffef ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokens(value) {
    var text = norm(value);
    return text ? text.split(" ") : [];
  }

  // Fortnite writes featured artists as "X ft. Y"; stores usually credit X.
  //
  // The marker is bounded by whitespace rather than \b, because \b cannot
  // match after the "." in "ft." or the "/" in "w/" - both are non-word
  // characters, so a trailing \b there never fires and the credit survived.
  function stripCredits(artist) {
    return str(artist)
      .replace(/\s+(?:ft\.|feat\.|featuring|with|w\/)\s+.*$/i, "")
      .replace(/\s*[,&]\s*.*$/, "")
      .trim() || str(artist);
  }

  // A parenthesised suffix is often a Fortnite-only variant label.
  function stripParens(title) {
    return str(title).replace(/\s*[([][^)\]]*[)\]]\s*$/, "").trim() || str(title);
  }

  function escapeLucene(value) {
    return str(value).replace(/(["\\])/g, "\\$1");
  }

  /* ------------------------------------------------------------------ *
   * Queries
   * ------------------------------------------------------------------ */

  /*
   * Query forms to try, broadest signal first. Later forms drop information,
   * so the first form that yields a confident candidate wins.
   */
  function buildQueries(track) {
    var title = str(track.title);
    var artist = str(track.artist);
    var lead = stripCredits(artist);
    var bare = stripParens(title);

    var queries = [
      artist ? artist + " " + title : title,
      lead && lead !== artist ? lead + " " + title : "",
      bare !== title ? (lead || artist) + " " + bare : "",
      title
    ];

    return queries
      .map(str)
      .filter(Boolean)
      .filter(function (value, index, all) { return all.indexOf(value) === index; });
  }

  /* ------------------------------------------------------------------ *
   * Scoring
   * ------------------------------------------------------------------ */

  // Fraction of `wanted`'s tokens present in `got`.
  function coverage(wanted, got) {
    var want = tokens(wanted);
    if (!want.length) return 0;
    var have = tokens(got);
    var hits = want.filter(function (token) { return have.indexOf(token) !== -1; });
    return hits.length / want.length;
  }

  /*
   * Confidence that a candidate is the same recording, 0..1.
   *
   * The title carries most of the weight: an artist string may legitimately
   * differ (Fortnite's "ryo (supercell) ft. Hatsune Miku" against a store's
   * "supercell"), while a title that does not overlap means a different song.
   * Matching either the full or the credit-stripped artist counts in full.
   */
  function scoreCandidate(track, candidate) {
    var titleScore = Math.max(
      coverage(track.title, candidate.title),
      coverage(stripParens(track.title), candidate.title)
    );
    var artistScore = Math.max(
      coverage(track.artist, candidate.artist),
      coverage(stripCredits(track.artist), candidate.artist),
      coverage(candidate.artist, track.artist)
    );
    return Number((titleScore * 0.7 + artistScore * 0.3).toFixed(4));
  }

  var CONFIDENT = 0.75;

  function pickBest(track, candidates) {
    var scored = (candidates || []).map(function (candidate) {
      return { candidate: candidate, confidence: scoreCandidate(track, candidate) };
    }).sort(function (a, b) {
      // Prefer a higher score, and an ISRC as the tie-breaker since it makes
      // the import an exact lookup rather than another search.
      return b.confidence - a.confidence ||
        (b.candidate.isrc ? 1 : 0) - (a.candidate.isrc ? 1 : 0);
    });
    return scored.length ? scored[0] : null;
  }

  /* ------------------------------------------------------------------ *
   * Resolving
   * ------------------------------------------------------------------ */

  /*
   * Resolve one track.
   *
   * `fetchJson(url)` must resolve to parsed JSON or reject. Every query form
   * is tried until one produces a confident candidate; if none does, the best
   * of everything seen is returned as `uncertain` so a person can judge it
   * rather than having it silently applied.
   */
  function resolveTrack(track, options) {
    var opts = options || {};
    var provider = PROVIDERS[opts.provider] || PROVIDERS[DEFAULT_PROVIDER];
    var fetchJson = opts.fetchJson;
    if (typeof fetchJson !== "function") {
      return Promise.reject(new Error("resolveTrack needs a fetchJson function"));
    }

    var queries = buildQueries(track);
    var best = null;
    var tried = 0;

    function attempt(index) {
      if (index >= queries.length) return Promise.resolve(finish());
      tried += 1;
      return Promise.resolve(fetchJson(provider.url(queries[index], track)))
        .then(function (payload) {
          var picked = pickBest(track, provider.parse(payload));
          if (picked && (!best || picked.confidence > best.confidence)) best = picked;
          if (best && best.confidence >= CONFIDENT) return finish();
          return attempt(index + 1);
        }, function (error) {
          // One failed query should not abandon the remaining forms; only
          // report the error if nothing else works.
          if (index + 1 >= queries.length && !best) {
            return { track: track, status: "error", message: errorMessage(error), provider: provider.id };
          }
          return attempt(index + 1);
        });
    }

    function finish() {
      if (!best) {
        return { track: track, status: "none", provider: provider.id, queriesTried: tried };
      }
      return {
        track: track,
        status: best.confidence >= CONFIDENT ? "resolved" : "uncertain",
        provider: provider.id,
        queriesTried: tried,
        confidence: best.confidence,
        candidate: best.candidate
      };
    }

    return attempt(0);
  }

  function errorMessage(error) {
    if (!error) return "Lookup failed";
    return str(error.message) || String(error);
  }

  /*
   * Resolve a list of tracks one at a time, respecting the provider's rate
   * limit. Never rejects: each track comes back with its own status, so one
   * bad lookup cannot lose the rest of the batch.
   */
  function resolveTracks(tracks, options) {
    var opts = options || {};
    var provider = PROVIDERS[opts.provider] || PROVIDERS[DEFAULT_PROVIDER];
    var list = (tracks || []).slice();
    var wait = opts.wait || defaultWait;
    var interval = opts.minIntervalMs !== undefined ? opts.minIntervalMs : provider.minIntervalMs;
    var results = [];

    function step(index) {
      if (opts.isCancelled && opts.isCancelled()) return Promise.resolve(results);
      if (index >= list.length) return Promise.resolve(results);

      return resolveTrack(list[index], opts).then(function (result) {
        results.push(result);
        if (opts.onProgress) {
          opts.onProgress({ done: results.length, total: list.length, result: result });
        }
        if (index + 1 >= list.length) return results;
        return Promise.resolve(wait(interval)).then(function () { return step(index + 1); });
      });
    }

    return step(0);
  }

  function defaultWait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /*
   * Turn resolved results into the correction map the exporter consumes.
   * Only "resolved" results are applied automatically; "uncertain" ones are
   * left for a person to accept.
   */
  function toCorrections(results, keyOf, options) {
    var opts = options || {};
    var accept = opts.includeUncertain ? ["resolved", "uncertain"] : ["resolved"];
    var corrections = {};
    (results || []).forEach(function (result) {
      if (accept.indexOf(result.status) === -1 || !result.candidate) return;
      corrections[keyOf(result.track)] = {
        title: result.candidate.title,
        artist: result.candidate.artist,
        album: result.candidate.album || "",
        isrc: result.candidate.isrc || "",
        source: result.candidate.source,
        reference: result.candidate.reference || "",
        confidence: result.confidence,
        note: "Matched in " + (PROVIDERS[result.provider] || {}).label
      };
    });
    return corrections;
  }

  // Browser fetch, kept here so app.js has nothing to assemble.
  function browserFetchJson(url) {
    return fetch(url, { mode: "cors", cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    });
  }

  var JamResolve = {
    PROVIDERS: PROVIDERS,
    DEFAULT_PROVIDER: DEFAULT_PROVIDER,
    CONFIDENT: CONFIDENT,

    norm: norm,
    tokens: tokens,
    stripCredits: stripCredits,
    stripParens: stripParens,
    escapeLucene: escapeLucene,

    buildQueries: buildQueries,
    coverage: coverage,
    scoreCandidate: scoreCandidate,
    pickBest: pickBest,

    resolveTrack: resolveTrack,
    resolveTracks: resolveTracks,
    toCorrections: toCorrections,
    browserFetchJson: browserFetchJson
  };

  if (typeof window !== "undefined") window.JamResolve = JamResolve;
  if (typeof module !== "undefined" && module.exports) module.exports = JamResolve;
})();
