/*
 * core.js — all Jam Track logic, with zero DOM access.
 *
 * Loaded two ways on purpose:
 *   browser  <script src="assets/core.js">  -> window.JamTracks
 *   tests    require("../../assets/core.js") -> module.exports
 *
 * Keeping this a classic script (not an ES module) means index.html still works
 * when opened directly from disk over file://, which an ES module would break.
 */
(function () {
  "use strict";

  var DATA_URL = "https://raw.githubusercontent.com/FNFestival/fnfestival.github.io/refs/heads/main/data/tracks.json";

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */

  // Normalized form used for all key lookups and searching.
  function clean(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/\s+/g, " ")
      .replace(/[’]/g, "'")
      .trim()
      .toLowerCase();
  }

  // Human-facing form: collapse whitespace, keep original casing.
  function display(value) {
    return String(value === null || value === undefined ? "" : value).replace(/\s+/g, " ").trim();
  }

  function formatDate(value) {
    if (!value) return "—";
    var date = new Date(value);
    if (Number.isNaN(date.valueOf())) return "—";
    return date.toISOString().slice(0, 10);
  }

  function csvEscape(value) {
    var text = String(value === null || value === undefined ? "" : value);
    return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  // Identity of a track for aliases, curated sets, and manual overrides.
  function trackKey(title, artist) {
    return clean(title) + ":::" + clean(artist);
  }

  function todayStamp(now) {
    return (now || new Date()).toISOString().slice(0, 10);
  }

  /* ------------------------------------------------------------------ *
   * Curated data
   * ------------------------------------------------------------------ */

  // Supplemental safety net only. Every Epic original in the dataset today is
  // already caught by the `artist === "Epic Games"` check in classify(); this
  // set exists so a future original credited to some other artist can be
  // pinned without a code change to the rules.
  var ORIGINAL_IDS = new Set([
    "butterbarnhoedown", "ogfutureremix", "switchup", "showthemwhoweare", "takemehigher",
    "braceforchaos", "runit", "flickeringflame", "winterfestwish", "makeitknown",
    "streetsignite", "bloom", "bestbuds", "lordofthewasteland", "youdontknowme",
    "pealikeme", "returnofthetiger", "findthefury", "youreallmine", "forlatveria",
    "change", "magentaride", "somp", "dreamer", "sunnyssong", "bouncinback",
    "thenightporter", "racetothehorizon", "highstakesclub", "turnup", "beyondtheflame",
    "thehuntingground"
  ]);

  // Licensed library/stock or branded tracks that reliably fail streaming match.
  var HARD_TO_MATCH = new Set([
    trackKey("Funny Song", "Slipstream Music"),
    trackKey("Loves Like a Lady", "Anthony Harrison"),
    trackKey("Blue English", "Vittorio Iannucci, Federica Capretti"),
    trackKey("Bruno-San's Theme Song", "Bruno Mars")
  ]);

  function alias(title, artist, data) {
    return [trackKey(title, artist), data];
  }

  // Rewrites that improve import-tool search hits for known-difficult entries.
  // These are search hints, not authoritative streaming metadata.
  var MATCH_ALIASES = new Map([
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
      title: 'I Won\'t Say (I\'m In Love) - From "Hercules" / Soundtrack Version',
      artist: "Susan Egan",
      album: "Hercules (Original Motion Picture Soundtrack)",
      note: "Disney cast credits often match better with the lead performer and soundtrack subtitle."
    }),
    alias("Zero to Hero", "Hercules Cast", {
      title: 'Zero To Hero - From "Hercules" / Soundtrack Version',
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
      title: 'Happy - From "Despicable Me 2"',
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
    })
  ]);

  var REASONS = {
    original: "Epic/Fortnite original",
    fortniteEdit: "Fortnite-specific remix or rearrangement",
    hardToMatch: "Library/stock or branded track; commonly fails on Spotify",
    noPreview: "No Spotify preview URL in dataset",
    missingPreview: "Missing Spotify preview URL",
    regex: "Removed by your custom exclude regex",
    forcedIn: "Kept by you",
    forcedOut: "Removed by you",
    ready: "Ready for export"
  };

  /* ------------------------------------------------------------------ *
   * Presets, sorts, targets
   * ------------------------------------------------------------------ */

  var PRESETS = {
    recommended: {
      label: "Recommended",
      blurb: "Real songs you can actually stream.",
      help: "Real-world streaming tracks only. Excludes Epic/Fortnite originals, Fortnite remixes/rearrangements, and stock/library tracks that usually fail on Spotify.",
      switches: {
        includeOriginals: false,
        includeFortniteEdits: false,
        includeAmbiguous: false,
        requirePreview: false,
        includeReviewInExport: false
      }
    },
    broad: {
      label: "Broad",
      blurb: "Adds licensed tracks that may need manual matching.",
      help: "Includes licensed tracks even if they may need manual matching. Still excludes Epic/Fortnite originals and Fortnite-specific remixes.",
      switches: {
        includeOriginals: false,
        includeFortniteEdits: false,
        includeAmbiguous: true,
        requirePreview: false,
        includeReviewInExport: true
      }
    },
    complete: {
      label: "Complete",
      blurb: "Every Jam Track, including Epic originals.",
      help: "Exports every Jam Track in the dataset. Useful for archival lists, not ideal for Spotify matching.",
      switches: {
        includeOriginals: true,
        includeFortniteEdits: true,
        includeAmbiguous: true,
        requirePreview: false,
        includeReviewInExport: true
      }
    }
  };

  var SWITCH_IDS = [
    "includeOriginals",
    "includeFortniteEdits",
    "includeAmbiguous",
    "requirePreview",
    "includeReviewInExport"
  ];

  var SORTS = {
    addedAsc: "Fortnite added date, oldest first",
    addedDesc: "Fortnite added date, newest first",
    titleAsc: "Title A–Z",
    artistAsc: "Artist A–Z",
    releaseYearAsc: "Song release year"
  };

  var TARGETS = {
    soundiiz: {
      label: "Soundiiz CSV",
      blurb: "Best for Spotify, Apple Music, YouTube Music and Tidal.",
      extension: "csv",
      mime: "text/csv;charset=utf-8"
    },
    tunemymusicText: {
      label: "TuneMyMusic text",
      blurb: 'Plain "Artist - Title" lines, one per track.',
      extension: "txt",
      mime: "text/plain;charset=utf-8"
    },
    tunemymusicCsv: {
      label: "TuneMyMusic CSV",
      blurb: "Spreadsheet-friendly artist/title/album columns.",
      extension: "csv",
      mime: "text/csv;charset=utf-8"
    },
    reviewCsv: {
      label: "Review CSV",
      blurb: "Every track with its filter decision. For checking, not importing.",
      extension: "csv",
      mime: "text/csv;charset=utf-8"
    }
  };

  var DEFAULT_OPTIONS = {
    preset: "recommended",
    includeOriginals: false,
    includeFortniteEdits: false,
    includeAmbiguous: false,
    requirePreview: false,
    useAliases: true,
    includeReviewInExport: false,
    customRegex: "",
    sort: "addedAsc",
    target: "soundiiz",
    overrides: {}
  };

  function withDefaults(options) {
    var merged = {};
    Object.keys(DEFAULT_OPTIONS).forEach(function (name) {
      merged[name] = DEFAULT_OPTIONS[name];
    });
    Object.keys(options || {}).forEach(function (name) {
      if (options[name] !== undefined) merged[name] = options[name];
    });
    merged.overrides = merged.overrides || {};
    return merged;
  }

  // Returns the switch values a preset implies, or null for "custom".
  function presetSwitches(preset) {
    return PRESETS[preset] ? PRESETS[preset].switches : null;
  }

  /* ------------------------------------------------------------------ *
   * Parsing the dataset
   * ------------------------------------------------------------------ */

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
      duration: item.duration || ""
    };
  }

  // The dataset is an object keyed by track id, plus a "_metadata" sibling.
  function parseTracks(data) {
    if (!data || typeof data !== "object") {
      throw new Error("Track data must be an object keyed by track id.");
    }
    var metadata = data._metadata || {};
    var seen = new Set();
    var tracks = [];

    Object.keys(data).forEach(function (name) {
      if (name === "_metadata") return;
      var item = data[name];
      if (!item || typeof item !== "object") return;
      if (!item.title || !item.artist) return;
      var track = normalizeTrack(item);
      var key = trackKey(track.title, track.artist);
      if (seen.has(key)) return;
      seen.add(key);
      tracks.push(track);
    });

    return { tracks: tracks, metadata: metadata };
  }

  /* ------------------------------------------------------------------ *
   * Custom exclude regex
   * ------------------------------------------------------------------ */

  // Accepts a bare pattern ("Epic Games|Bruno-San") or /pattern/flags form.
  // Never throws: an unusable pattern comes back as { regex: null, error }.
  function compileRegex(input) {
    var text = String(input === null || input === undefined ? "" : input).trim();
    if (!text) return { regex: null, error: null };

    var source = text;
    var flags = "i";
    var delimited = /^\/(.*)\/([gimsuy]*)$/.exec(text);
    if (delimited) {
      source = delimited[1];
      flags = delimited[2] || "";
    }
    if (!source) return { regex: null, error: null };

    try {
      // Strip the global flag: a shared /g regex carries lastIndex between
      // .test() calls, which would make filtering skip every other match.
      return { regex: new RegExp(source, flags.replace(/g/g, "")), error: null };
    } catch (error) {
      return { regex: null, error: error.message };
    }
  }

  /* ------------------------------------------------------------------ *
   * Classification
   * ------------------------------------------------------------------ */

  // Pure inspection of a single track. Knows nothing about user options.
  function classify(track) {
    var artist = clean(track.artist);
    var title = clean(track.title);
    var key = trackKey(track.title, track.artist);
    var aliasData = MATCH_ALIASES.get(key) || null;

    var isEpicArtist = artist === "epic games";
    var isEpicCollab = artist.indexOf("epic games ft.") === 0 || artist.indexOf("epic games feat.") !== -1;
    var isReviewOnlyAlias = Boolean(aliasData && aliasData.reviewOnly);

    var flags = {
      isOriginal: isEpicArtist || ORIGINAL_IDS.has(clean(track.id)) || ORIGINAL_IDS.has(title.replace(/[^a-z0-9]/g, "")),
      isFortniteEdit:
        isEpicCollab ||
        /fortnite rearrangement/i.test(track.title) ||
        (/\bremix\b/i.test(track.title) && /epic games/i.test(track.artist)) ||
        isReviewOnlyAlias,
      isHardToMatch: HARD_TO_MATCH.has(key),
      hasPreview: Boolean(track.previewUrl),
      hasAlias: Boolean(aliasData)
    };

    var notes = [];
    if (flags.isOriginal) notes.push(REASONS.original);
    if (flags.isFortniteEdit) notes.push(isReviewOnlyAlias ? aliasData.note || REASONS.fortniteEdit : REASONS.fortniteEdit);
    if (flags.isHardToMatch) notes.push(REASONS.hardToMatch);
    if (!flags.hasPreview) notes.push(REASONS.noPreview);
    if (aliasData && !aliasData.reviewOnly) notes.push("Alias available: " + aliasData.note);

    return { key: key, flags: flags, notes: notes, alias: aliasData };
  }

  /* ------------------------------------------------------------------ *
   * Decisions
   * ------------------------------------------------------------------ */

  /*
   * Resolve every track to "include" | "review" | "exclude".
   *
   * Precedence, highest first:
   *   1. manual override from the review table
   *   2. custom exclude regex
   *   3. requirePreview with no preview URL
   *   4. Epic/Fortnite original
   *   5. Fortnite remix/rearrangement (includes review-only aliases)
   *   6. hard-to-match library/stock track  -> review
   *   7. include
   */
  function decide(tracks, options) {
    var opts = withDefaults(options);
    var compiled = compileRegex(opts.customRegex);
    var regex = compiled.regex;
    var overrides = opts.overrides;

    var decisions = (tracks || []).map(function (track) {
      var info = classify(track);
      var flags = info.flags;
      var reasons = info.notes.slice();
      var override = overrides[info.key] || null;

      // The regex is matched against the visible fields plus the reasons we
      // just generated, so "Epic/Fortnite original" is itself targetable.
      var haystack = [
        track.title,
        track.artist,
        track.id,
        track.releaseYear,
        formatDate(track.createdAt),
        reasons.join(" ")
      ].join(" ␟ ");
      var regexHit = Boolean(regex && regex.test(haystack));

      var status;
      var source;

      if (override === "include") {
        status = "include";
        source = "override";
        reasons.unshift(REASONS.forcedIn);
      } else if (override === "exclude") {
        status = "exclude";
        source = "override";
        reasons.unshift(REASONS.forcedOut);
      } else if (regexHit) {
        status = "exclude";
        source = "regex";
        reasons.unshift(REASONS.regex);
      } else if (opts.requirePreview && !flags.hasPreview) {
        status = "exclude";
        source = "requirePreview";
        reasons.unshift(REASONS.missingPreview);
      } else if (flags.isOriginal && !opts.includeOriginals) {
        status = "exclude";
        source = "original";
      } else if (flags.isFortniteEdit && !opts.includeFortniteEdits) {
        status = "exclude";
        source = "fortniteEdit";
      } else if (flags.isHardToMatch && !opts.includeAmbiguous) {
        status = "review";
        source = "hardToMatch";
      } else {
        status = "include";
        source = "default";
      }

      return {
        key: info.key,
        track: track,
        status: status,
        source: source,
        overridden: Boolean(override),
        reasons: reasons,
        flags: flags,
        alias: info.alias
      };
    });

    return sortDecisions(decisions, opts.sort);
  }

  function sortDecisions(decisions, sort) {
    var byTitle = function (a, b) {
      return a.track.title.localeCompare(b.track.title) || a.track.artist.localeCompare(b.track.artist);
    };
    var byArtist = function (a, b) {
      return a.track.artist.localeCompare(b.track.artist) || a.track.title.localeCompare(b.track.title);
    };
    var comparators = {
      titleAsc: byTitle,
      artistAsc: byArtist,
      addedAsc: function (a, b) {
        return Date.parse(a.track.createdAt || "9999-12-31") - Date.parse(b.track.createdAt || "9999-12-31") || byArtist(a, b);
      },
      addedDesc: function (a, b) {
        return Date.parse(b.track.createdAt || "0000-01-01") - Date.parse(a.track.createdAt || "0000-01-01") || byArtist(a, b);
      },
      releaseYearAsc: function (a, b) {
        return Number(a.track.releaseYear || 9999) - Number(b.track.releaseYear || 9999) || byArtist(a, b);
      }
    };
    return decisions.slice().sort(comparators[sort] || comparators.addedAsc);
  }

  function countByStatus(decisions) {
    var counts = { include: 0, review: 0, exclude: 0 };
    (decisions || []).forEach(function (decision) {
      if (counts[decision.status] !== undefined) counts[decision.status] += 1;
    });
    return counts;
  }

  /* ------------------------------------------------------------------ *
   * Export rows and files
   * ------------------------------------------------------------------ */

  // The tracks that actually land in an import file, with aliases applied.
  function selectRows(decisions, options) {
    var opts = withDefaults(options);
    return (decisions || [])
      .filter(function (decision) {
        return decision.status === "include" || (opts.includeReviewInExport && decision.status === "review");
      })
      .map(function (decision) {
        var track = decision.track;
        var aliasData = decision.alias;
        var useAlias = Boolean(opts.useAliases && aliasData && !aliasData.reviewOnly);
        return {
          title: useAlias ? aliasData.title : track.title,
          artist: useAlias ? aliasData.artist : track.artist,
          album: useAlias ? aliasData.album || "" : "",
          isrc: "",
          originalTitle: track.title,
          originalArtist: track.artist,
          addedToFortnite: formatDate(track.createdAt),
          releaseYear: track.releaseYear,
          status: decision.status,
          note: useAlias ? aliasData.note : decision.reasons.join("; ")
        };
      });
  }

  function buildExport(target, rows, decisions, options, now) {
    var opts = withDefaults(options);
    var stamp = todayStamp(now);
    var spec = TARGETS[target] || TARGETS.soundiiz;
    var lines;

    if (target === "tunemymusicText") {
      return {
        target: target,
        text: (rows || []).map(function (row) { return row.artist + " - " + row.title; }).join("\n") + "\n",
        filename: "fortnite-jam-tracks-tunemymusic-" + stamp + ".txt",
        mime: spec.mime,
        label: "TuneMyMusic text preview",
        count: (rows || []).length
      };
    }

    if (target === "tunemymusicCsv") {
      lines = ["artist,title,album"];
      (rows || []).forEach(function (row) {
        lines.push([row.artist, row.title, row.album].map(csvEscape).join(","));
      });
      return {
        target: target,
        text: lines.join("\n") + "\n",
        filename: "fortnite-jam-tracks-tunemymusic-" + stamp + ".csv",
        mime: spec.mime,
        label: "TuneMyMusic CSV preview",
        count: (rows || []).length
      };
    }

    if (target === "reviewCsv") {
      lines = ["status,title,artist,exportTitle,exportArtist,album,addedToFortnite,releaseYear,note"];
      (decisions || []).forEach(function (decision) {
        var track = decision.track;
        var aliasData = opts.useAliases ? decision.alias : null;
        lines.push([
          decision.status,
          track.title,
          track.artist,
          (aliasData && aliasData.title) || track.title,
          (aliasData && aliasData.artist) || track.artist,
          (aliasData && aliasData.album) || "",
          formatDate(track.createdAt),
          track.releaseYear || "",
          (aliasData && aliasData.note) || decision.reasons.join("; ")
        ].map(csvEscape).join(","));
      });
      return {
        target: target,
        text: lines.join("\n") + "\n",
        filename: "fortnite-jam-tracks-review-" + stamp + ".csv",
        mime: spec.mime,
        label: "Review CSV preview",
        count: (decisions || []).length
      };
    }

    // Soundiiz. The trailing comma in the header is intentional: Soundiiz
    // expects a fifth, empty column after isrc.
    lines = ["title,artist,album,isrc,"];
    (rows || []).forEach(function (row) {
      lines.push([row.title, row.artist, row.album, row.isrc, ""].map(csvEscape).join(","));
    });
    return {
      target: "soundiiz",
      text: lines.join("\n") + "\n",
      filename: "fortnite-jam-tracks-soundiiz-" + stamp + ".csv",
      mime: TARGETS.soundiiz.mime,
      label: "Soundiiz CSV preview",
      count: (rows || []).length
    };
  }

  // All four files at once, for the "download everything" button.
  function buildAllExports(decisions, options, now) {
    var opts = withDefaults(options);
    var rows = selectRows(decisions, opts);
    return Object.keys(TARGETS).map(function (target) {
      return buildExport(target, rows, decisions, opts, now);
    });
  }

  /* ------------------------------------------------------------------ *
   * Soundiiz not-found helper
   * ------------------------------------------------------------------ */

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var cell = "";
    var inQuotes = false;
    var source = String(text === null || text === undefined ? "" : text);

    for (var i = 0; i < source.length; i += 1) {
      var char = source[i];
      var next = source[i + 1];
      if (inQuotes) {
        if (char === '"' && next === '"') { cell += '"'; i += 1; }
        else if (char === '"') inQuotes = false;
        else cell += char;
      } else if (char === '"') inQuotes = true;
      else if (char === ",") { row.push(cell); cell = ""; }
      else if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (char !== "\r") cell += char;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }

    return rows.filter(function (cells) {
      return cells.some(function (value) { return String(value).trim(); });
    });
  }

  // Generic cleanup for titles/artists with no curated alias.
  function fallbackAlias(title, artist) {
    var nextTitle = title
      .replace(/\s*\(Fortnite Rearrangement\)/i, "")
      .replace(/\s*\(Jabba's Palace\)/i, "")
      .trim();
    var nextArtist = artist
      .replace(/\s*&\s*The London Symphony Orchestra/i, "")
      .replace(/\s*ft\..*/i, "")
      .replace(/\s*feat\..*/i, "")
      .trim();
    return {
      title: nextTitle || title,
      artist: nextArtist || artist,
      note: "Automatic cleanup: removed subtitles/featured credits where possible."
    };
  }

  // Turn Soundiiz's isFound=0 export into better retry searches.
  function suggestRetries(csvText) {
    var rows = parseCsv(csvText);
    if (!rows.length) return [];

    var header = rows[0].map(clean);
    var looksLikeHeader = header.indexOf("title") !== -1 || header.indexOf("artist") !== -1;
    var titleIndex = looksLikeHeader && header.indexOf("title") !== -1 ? header.indexOf("title") : 0;
    var artistIndex = looksLikeHeader && header.indexOf("artist") !== -1 ? header.indexOf("artist") : 1;
    var body = looksLikeHeader ? rows.slice(1) : rows;

    return body.reduce(function (out, cells) {
      var title = display(cells[titleIndex]);
      var artist = display(cells[artistIndex]);
      if (!title) return out;
      var suggestion = MATCH_ALIASES.get(trackKey(title, artist)) || fallbackAlias(title, artist);
      out.push({
        original: artist ? artist + " - " + title : title,
        retry: suggestion.artist ? suggestion.artist + " - " + suggestion.title : suggestion.title,
        note: suggestion.note || "Try a simplified artist/title search."
      });
      return out;
    }, []);
  }

  function formatRetries(suggestions) {
    if (!suggestions || !suggestions.length) return "";
    return suggestions.map(function (item) {
      return item.retry + "    # " + item.note;
    }).join("\n") + "\n";
  }

  /* ------------------------------------------------------------------ *
   * Demo data, used only when the live fetch fails
   * ------------------------------------------------------------------ */

  var SAMPLE_TRACKS = {
    _metadata: { lastUpdated: "2026-01-01T00:00:00.000Z", sample: true },
    badguy: { id: "badguy", title: "bad guy", artist: "Billie Eilish", releaseYear: 2019, createdAt: "2024-12-26T04:08:19.835Z", lastFeatured: null, previewUrl: "https://p.scdn.co/sample" },
    workwork: { id: "workwork", title: "Work Work", artist: "Britney Spears", releaseYear: 2013, createdAt: "2025-02-14T00:00:00.000Z", previewUrl: null },
    spiesmarshmello: { id: "spiesmarshmello", title: "Spies! (Marshmello Remix)", artist: "Epic Games ft. Marshmello", releaseYear: 2020, createdAt: "2025-04-01T00:00:00.000Z", previewUrl: null },
    funny: { id: "funny", title: "Funny Song", artist: "Slipstream Music", releaseYear: 2024, createdAt: "2025-06-01T00:00:00.000Z", previewUrl: null },
    yorunikakeru: { id: "yorunikakeru", title: "Yoru Ni Kakeru", artist: "YOASOBI", releaseYear: 2019, createdAt: "2025-07-01T00:00:00.000Z", previewUrl: null },
    butterbarnhoedown: { id: "butterbarnhoedown", title: "Butter Barn Hoedown", artist: "Epic Games", releaseYear: 2021, createdAt: "2024-12-26T04:08:19.834Z", previewUrl: null }
  };

  var JamTracks = {
    DATA_URL: DATA_URL,
    PRESETS: PRESETS,
    SWITCH_IDS: SWITCH_IDS,
    SORTS: SORTS,
    TARGETS: TARGETS,
    REASONS: REASONS,
    DEFAULT_OPTIONS: DEFAULT_OPTIONS,
    ORIGINAL_IDS: ORIGINAL_IDS,
    HARD_TO_MATCH: HARD_TO_MATCH,
    MATCH_ALIASES: MATCH_ALIASES,
    SAMPLE_TRACKS: SAMPLE_TRACKS,

    clean: clean,
    display: display,
    formatDate: formatDate,
    csvEscape: csvEscape,
    trackKey: trackKey,
    withDefaults: withDefaults,
    presetSwitches: presetSwitches,

    parseTracks: parseTracks,
    compileRegex: compileRegex,
    classify: classify,
    decide: decide,
    sortDecisions: sortDecisions,
    countByStatus: countByStatus,
    selectRows: selectRows,
    buildExport: buildExport,
    buildAllExports: buildAllExports,

    parseCsv: parseCsv,
    fallbackAlias: fallbackAlias,
    suggestRetries: suggestRetries,
    formatRetries: formatRetries
  };

  if (typeof window !== "undefined") window.JamTracks = JamTracks;
  if (typeof module !== "undefined" && module.exports) module.exports = JamTracks;
})();
