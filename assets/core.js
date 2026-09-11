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

  // Supplemental safety net, matched against a track's `id` ONLY. Every Epic
  // original in the dataset today is already caught by the
  // `artist === "Epic Games"` check in classify(); this set exists so a future
  // original credited to some other artist can be pinned without a code change.
  //
  // Do NOT compare a squashed track title against these ids. Several entries
  // ("change", "dreamer", "bloom", "runit", "turnup") are ordinary song titles,
  // so a real licensed song called "Change" would be silently dropped as an
  // Epic original.
  var ORIGINAL_IDS = new Set([
    "butterbarnhoedown", "ogfutureremix", "switchup", "showthemwhoweare", "takemehigher",
    "braceforchaos", "runit", "flickeringflame", "winterfestwish", "makeitknown",
    "streetsignite", "bloom", "bestbuds", "lordofthewasteland", "youdontknowme",
    "pealikeme", "returnofthetiger", "findthefury", "youreallmine", "forlatveria",
    "change", "magentaride", "somp", "dreamer", "sunnyssong", "bouncinback",
    "thenightporter", "racetothehorizon", "highstakesclub", "turnup", "beyondtheflame",
    "thehuntingground",
    // Epic-commissioned Battle Pass / Item Shop tracks credited to fictional
    // in-game bands rather than "Epic Games". Not streaming releases, so they
    // can never match on Spotify.
    "runamok"
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
      // The only album this app sends. Two real imports - one with albums,
      // one without - showed this track matching only when the album is
      // supplied, while for the other twelve aliases the album changed
      // nothing. Album is a per-alias property, not a global switch, because
      // the evidence is per-track.
      album: "Star Wars: Return of the Jedi (Original Motion Picture Soundtrack)",
      note: "Spotify uses Jabba's Palace Band rather than Fortnite's display subtitle."
    }),
    alias("Star Wars Main Title Theme/March of the Resistance (Fortnite Rearrangement)", "John Williams & The London Symphony Orchestra", {
      title: "Main Title and March of the Resistance",
      artist: "John Williams",
      reviewOnly: true,
      note: "Fortnite rearrangement is not a normal streaming release; excluded by default."
    }),
    alias("I Won't Say (I'm In Love)", "Hercules Cast", {
      title: 'I Won\'t Say (I\'m In Love) - From "Hercules" / Soundtrack Version',
      artist: "Susan Egan",
      note: "Disney cast credits often match better with the lead performer and soundtrack subtitle."
    }),
    alias("Zero to Hero", "Hercules Cast", {
      title: 'Zero To Hero - From "Hercules" / Soundtrack Version',
      artist: "Chorus - Hercules",
      note: "Spotify credits the soundtrack chorus/performers rather than the generic Fortnite cast name."
    }),
    alias("Today is Gonna be a Great Day", "Bowling For Soup", {
      title: "Today is Gonna be a Great Day - Theme Song to Phineas and Ferb",
      artist: "Bowling For Soup",
      note: "Spotify includes the Phineas and Ferb subtitle."
    }),
    alias("Takaneno Hanakosan", "back number", {
      title: "高嶺の花子さん",
      artist: "back number",
      note: "Spotify/import tools may prefer the original Japanese title."
    }),
    alias("Work Work", "Britney Spears", {
      title: "Work Bitch",
      artist: "Britney Spears",
      note: "Fortnite uses a censored display title."
    }),
    alias("Happy", "Pharrell Williams", {
      title: 'Happy - From "Despicable Me 2"',
      artist: "Pharrell Williams",
      note: "Avoids generic-title matching failures."
    }),
    alias("The Simpsons Main Title Theme", "Danny Elfman", {
      title: "The Simpsons Main Title Theme",
      artist: "Danny Elfman",
      note: "Adds soundtrack context."
    }),
    alias("Yoru Ni Kakeru", "YOASOBI", {
      title: "夜に駆ける",
      artist: "YOASOBI",
      note: "Original Japanese title can match better than the romanized Fortnite title."
    }),
    alias("Surround Sound", "JID ft. 21 Savage & Baby Tate", {
      title: "Surround Sound (feat. 21 Savage & Baby Tate)",
      artist: "JID",
      note: "Move featured artists into the title."
    }),
    alias("FUTW (Vixi Solo Version)", "LISA", {
      title: "FUTW",
      artist: "LISA",
      note: "Try the base title if the Fortnite version is unavailable."
    }),
    alias("Locked & Loaded", "d4vd", {
      title: "Locked & Loaded (Official Fortnite Anthem)",
      artist: "d4vd",
      note: "Released on streaming with the Official Fortnite Anthem subtitle."
    }),
    alias("A Bar Song", "Shaboozey", {
      title: "A Bar Song (Tipsy)",
      artist: "Shaboozey",
      note: "Fortnite drops the (Tipsy) subtitle the single is released under."
    }),
    alias("Rocket Man", "Elton John", {
      title: "Rocket Man (I Think It's Going To Be A Long Long Time)",
      artist: "Elton John",
      note: "Fortnite shows the short title; streaming uses the full one."
    })
  ]);

  var REASONS = {
    original: "Epic/Fortnite original",
    fortniteEdit: "Fortnite-specific remix or rearrangement",
    hardToMatch: "Library/stock or branded track; commonly fails on Spotify",
    noPreview: "No Spotify preview URL in dataset",
    missingPreview: "Missing Spotify preview URL",
    regex: "Removed by your custom exclude regex",
    notFound: "Your import tool could not find this track",
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
    overrides: {},
    failures: {},
    corrections: {}
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
    merged.failures = merged.failures || {};
    merged.corrections = merged.corrections || {};
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
    var key = trackKey(track.title, track.artist);
    var aliasData = MATCH_ALIASES.get(key) || null;

    var isEpicArtist = artist === "epic games";
    var isEpicCollab = artist.indexOf("epic games ft.") === 0 || artist.indexOf("epic games feat.") !== -1;
    var isReviewOnlyAlias = Boolean(aliasData && aliasData.reviewOnly);

    var flags = {
      isOriginal: isEpicArtist || ORIGINAL_IDS.has(clean(track.id)),
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

  // The alias an export is allowed to substitute. Review-only aliases are hints
  // for a human, never substitutions. Both selectRows() and the review CSV go
  // through this so they can never disagree about what the file will contain.
  function effectiveAlias(aliasData, useAliases) {
    return useAliases && aliasData && !aliasData.reviewOnly ? aliasData : null;
  }

  /*
   * What a track is called in the export.
   *
   * A correction always wins. Corrections come from looking the track up in a
   * real music database (see resolve.js) or from the user editing it by hand,
   * so it is real data rather than a guess baked into this file, and it can
   * carry an ISRC - which an import tool matches exactly instead of searching.
   */
  function resolveRow(decision, options) {
    var opts = withDefaults(options);
    var track = decision.track;
    var correction = opts.corrections[decision.key];
    if (correction && correction.title) {
      return {
        title: display(correction.title),
        artist: display(correction.artist || track.artist),
        album: display(correction.album || ""),
        isrc: display(correction.isrc || ""),
        note: correction.note || "Looked up in a music database",
        origin: "correction"
      };
    }
    var applied = effectiveAlias(decision.alias, opts.useAliases);
    if (applied) {
      return {
        title: applied.title,
        artist: applied.artist,
        album: applied.album || "",
        isrc: applied.isrc || "",
        note: applied.note,
        origin: "alias"
      };
    }
    return {
      title: track.title,
      artist: track.artist,
      album: "",
      isrc: "",
      note: decision.reasons.join("; "),
      origin: "dataset"
    };
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
      } else if (opts.failures[info.key]) {
        // Reported by the import tool as not found. A manual Keep still wins,
        // so a track can be forced back in after being marked failed.
        status = "exclude";
        source = "notFound";
        reasons.unshift(REASONS.notFound);
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
        var resolved = resolveRow(decision, opts);
        return {
          title: resolved.title,
          artist: resolved.artist,
          album: resolved.album,
          isrc: resolved.isrc,
          origin: resolved.origin,
          originalTitle: track.title,
          originalArtist: track.artist,
          addedToFortnite: formatDate(track.createdAt),
          releaseYear: track.releaseYear,
          status: decision.status,
          note: resolved.note
        };
      });
  }

  /*
   * Which optional columns to emit.
   *
   * Both import tools match columns by name and ignore what they do not know,
   * so an all-empty column is pure noise - that is what the original
   * "title,artist,album,isrc," header was. A column appears only when at
   * least one row actually fills it.
   */
  function activeColumns(rows) {
    return {
      album: (rows || []).some(function (row) { return row.album; }),
      isrc: (rows || []).some(function (row) { return row.isrc; })
    };
  }

  function csvLine(row, columns) {
    var cells = [row.title, row.artist];
    if (columns.album) cells.push(row.album || "");
    if (columns.isrc) cells.push(row.isrc || "");
    return cells.map(csvEscape).join(",");
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
      // TuneMyMusic matches these column names, and the same spelling is what
      // its own CSV exports use. A lowercase "artist,title,album" header is not
      // one it recognizes.
      var tmmColumns = activeColumns(rows);
      var tmmHeader = ["Track name", "Artist name"];
      if (tmmColumns.album) tmmHeader.push("Album");
      if (tmmColumns.isrc) tmmHeader.push("ISRC");
      lines = [tmmHeader.join(",")];
      (rows || []).forEach(function (row) {
        lines.push(csvLine(row, tmmColumns));
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
      lines = ["status,title,artist,exportTitle,exportArtist,album,isrc,source,addedToFortnite,releaseYear,note"];
      (decisions || []).forEach(function (decision) {
        var track = decision.track;
        // These columns must mirror selectRows exactly, so both go through
        // resolveRow. A review-only alias therefore shows the Fortnite title
        // here too, with its note kept as a hint.
        var resolved = resolveRow(decision, opts);
        var hint = decision.alias && decision.alias.note;
        lines.push([
          decision.status,
          track.title,
          track.artist,
          resolved.title,
          resolved.artist,
          resolved.album,
          resolved.isrc,
          resolved.origin,
          formatDate(track.createdAt),
          track.releaseYear || "",
          resolved.note || hint || ""
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

    // Soundiiz. It matches columns by name and ignores ones it does not know,
    // so only the columns we can actually fill are emitted.
    //
    // The original header was "title,artist,album,isrc," which declared a
    // fifth, nameless column Soundiiz discards plus two columns nothing
    // filled. The header is now exactly the columns that carry data.
    var columns = activeColumns(rows);
    var header = ["title", "artist"];
    if (columns.album) header.push("album");
    if (columns.isrc) header.push("isrc");
    lines = [header.join(",")];
    (rows || []).forEach(function (row) {
      lines.push(csvLine(row, columns));
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

    // Trimming a credit out of "Tasty Bois (ft. Backchat)" used to leave the
    // opening bracket behind, producing "Tasty Bois (". Drop any bracket left
    // unclosed by the trim.
    nextArtist = dropUnclosedBracket(nextArtist);

    return {
      title: nextTitle || title,
      artist: nextArtist || artist,
      note: "Automatic cleanup: removed subtitles/featured credits where possible."
    };
  }

  function dropUnclosedBracket(value) {
    var text = String(value === null || value === undefined ? "" : value);
    var open = text.lastIndexOf("(");
    if (open !== -1 && text.indexOf(")", open) === -1) {
      text = text.slice(0, open);
    }
    return text.replace(/[\s,&-]+$/, "").trim();
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

  /*
   * Read an import tool's result CSV and pick out the rows it could not match.
   *
   * Accepts Soundiiz's export, which appends an `isFound` column (1 found,
   * 0 not found). When there is no isFound column every row is treated as a
   * failure, so a hand-trimmed list of just the misses also works.
   */
  function parseFailureRows(csvText) {
    var rows = parseCsv(csvText);
    if (!rows.length) return [];

    var header = rows[0].map(clean);
    var looksLikeHeader = header.indexOf("title") !== -1 || header.indexOf("artist") !== -1;
    var titleIndex = looksLikeHeader && header.indexOf("title") !== -1 ? header.indexOf("title") : 0;
    var artistIndex = looksLikeHeader && header.indexOf("artist") !== -1 ? header.indexOf("artist") : 1;
    var foundIndex = looksLikeHeader ? header.indexOf("isfound") : -1;
    var body = looksLikeHeader ? rows.slice(1) : rows;

    return body.reduce(function (out, cells) {
      var title = display(cells[titleIndex]);
      if (!title) return out;
      // Only skip a row when the file explicitly says it was found.
      if (foundIndex !== -1 && clean(cells[foundIndex]) === "1") return out;
      out.push({ title: title, artist: display(cells[artistIndex]) });
      return out;
    }, []);
  }

  /*
   * Map those failed rows back onto tracks.
   *
   * The pasted CSV holds whatever was exported, which may be an aliased title,
   * so each track is indexed under both its exported form and its original
   * Fortnite form. Artist-less and artist-mismatched rows fall back to a
   * title-only match, which is why the result reports what it could not place.
   */
  function matchFailures(decisions, options, csvText) {
    var opts = withDefaults(options);
    var byPair = new Map();
    var byTitle = new Map();

    (decisions || []).forEach(function (decision) {
      var track = decision.track;
      var resolved = resolveRow(decision, opts);
      var forms = [[track.title, track.artist], [resolved.title, resolved.artist]];
      forms.forEach(function (form) {
        byPair.set(trackKey(form[0], form[1]), decision.key);
        var titleOnly = clean(form[0]);
        if (!byTitle.has(titleOnly)) byTitle.set(titleOnly, []);
        byTitle.get(titleOnly).push(decision.key);
      });
    });

    var failures = {};
    var matched = 0;
    var unmatched = [];

    parseFailureRows(csvText).forEach(function (row) {
      var key = byPair.get(trackKey(row.title, row.artist));
      if (!key) {
        // Fall back to the title alone, but only when it is unambiguous.
        var candidates = byTitle.get(clean(row.title)) || [];
        var unique = candidates.filter(function (value, index) {
          return candidates.indexOf(value) === index;
        });
        if (unique.length === 1) key = unique[0];
      }
      if (key) {
        if (!failures[key]) matched += 1;
        failures[key] = true;
      } else {
        unmatched.push(row);
      }
    });

    return { failures: failures, matched: matched, unmatched: unmatched };
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

    activeColumns: activeColumns,
    resolveRow: resolveRow,
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
    dropUnclosedBracket: dropUnclosedBracket,
    suggestRetries: suggestRetries,
    formatRetries: formatRetries,
    parseFailureRows: parseFailureRows,
    matchFailures: matchFailures
  };

  if (typeof window !== "undefined") window.JamTracks = JamTracks;
  if (typeof module !== "undefined" && module.exports) module.exports = JamTracks;
})();
