/*
 * app.js — wizard controller. All DOM lives here; all rules live in core.js.
 *
 * Every element lookup goes through el()/on(), which warn instead of throwing.
 * The previous version called addEventListener on a missing element inside
 * init(), which threw and silently killed every listener registered after it.
 */
(function (core) {
  "use strict";

  var TOTAL_STEPS = 4;
  var MAX_ROWS = 500;

  var state = {
    step: 1,
    tracks: [],
    metadata: {},
    decisions: [],
    overrides: {},
    failures: {},
    statusFilter: null,
    exportFile: { text: "", filename: "fortnite-jam-tracks.csv", mime: "text/csv;charset=utf-8", label: "Preview", count: 0 },
    retryText: ""
  };

  /* ------------------------------------------------------------------ DOM */

  function el(id) {
    var node = document.getElementById(id);
    if (!node) console.warn("[app] missing element #" + id);
    return node;
  }

  // Tolerant binder: a missing element logs and is skipped, it never throws.
  function on(id, event, handler) {
    var node = document.getElementById(id);
    if (!node) {
      console.warn("[app] cannot bind " + event + " on missing #" + id);
      return null;
    }
    node.addEventListener(event, handler);
    return node;
  }

  function text(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function show(node, visible) {
    if (node) node.hidden = !visible;
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function downloadText(filename, body, mime) {
    var blob = new Blob([body], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
      link.remove();
    }, 0);
  }

  function flash(button, message) {
    if (!button) return;
    var original = button.textContent;
    button.textContent = message;
    window.setTimeout(function () { button.textContent = original; }, 1200);
  }

  /* -------------------------------------------------------- Build controls */

  // Radio cards are generated from core's constants so the markup and the
  // logic can never drift out of sync.
  function buildCards(containerId, groupName, entries) {
    var container = el(containerId);
    if (!container) return;
    container.innerHTML = entries.map(function (entry, index) {
      return '<label class="card">' +
        '<input type="radio" name="' + groupName + '" value="' + escapeHtml(entry.value) + '"' +
        (index === 0 ? " checked" : "") + " />" +
        '<span class="card-body">' +
          '<span class="card-title">' + escapeHtml(entry.label) + "</span>" +
          '<span class="card-note">' + escapeHtml(entry.note) + "</span>" +
        "</span></label>";
    }).join("");
  }

  function buildTargetCards() {
    buildCards("targetCards", "target", Object.keys(core.TARGETS).map(function (value) {
      return { value: value, label: core.TARGETS[value].label, note: core.TARGETS[value].blurb };
    }));
  }

  function buildPresetCards() {
    var entries = Object.keys(core.PRESETS).map(function (value) {
      return { value: value, label: core.PRESETS[value].label, note: core.PRESETS[value].blurb };
    });
    entries.push({ value: "custom", label: "Custom", note: "Set the switches yourself in Fine-tune below." });
    buildCards("presetCards", "preset", entries);
  }

  function buildSortSelect() {
    var select = el("sortSelect");
    if (!select) return;
    select.innerHTML = Object.keys(core.SORTS).map(function (value) {
      return '<option value="' + escapeHtml(value) + '">' + escapeHtml(core.SORTS[value]) + "</option>";
    }).join("");
    select.value = core.DEFAULT_OPTIONS.sort;
  }

  function radioValue(groupName, fallback) {
    var checked = document.querySelector('input[name="' + groupName + '"]:checked');
    return checked ? checked.value : fallback;
  }

  function setRadio(groupName, value) {
    var node = document.querySelector('input[name="' + groupName + '"][value="' + value + '"]');
    if (node) node.checked = true;
  }

  function checkboxValue(id) {
    var node = document.getElementById(id);
    return node ? node.checked : Boolean(core.DEFAULT_OPTIONS[id]);
  }

  /* ------------------------------------------------------------- Options */

  function getOptions() {
    return {
      preset: radioValue("preset", "recommended"),
      target: radioValue("target", "soundiiz"),
      sort: (el("sortSelect") || {}).value || core.DEFAULT_OPTIONS.sort,
      includeOriginals: checkboxValue("includeOriginals"),
      includeFortniteEdits: checkboxValue("includeFortniteEdits"),
      includeAmbiguous: checkboxValue("includeAmbiguous"),
      requirePreview: checkboxValue("requirePreview"),
      useAliases: checkboxValue("useAliases"),
      sendAlbums: checkboxValue("sendAlbums"),
      includeReviewInExport: checkboxValue("includeReviewInExport"),
      customRegex: (el("customRegex") || {}).value || "",
      overrides: state.overrides,
      failures: state.failures
    };
  }

  // Push a preset's switch values into the checkboxes. "custom" changes nothing.
  function applyPreset(preset) {
    var switches = core.presetSwitches(preset);
    if (!switches) return;
    core.SWITCH_IDS.forEach(function (id) {
      var node = document.getElementById(id);
      if (node && switches[id] !== undefined) node.checked = switches[id];
    });
  }

  /* ---------------------------------------------------------- Data loading */

  function setBadge(message) {
    text("dataBadge", message);
  }

  function setNotice(message, kind, offerDemo) {
    var notice = el("notice");
    text("noticeText", message || "");
    show(el("demoButton"), Boolean(offerDemo));
    if (!notice) return;
    notice.dataset.kind = kind || "info";
    notice.hidden = !message;
  }

  function loadData(raw, source) {
    var parsed;
    try {
      parsed = core.parseTracks(raw);
    } catch (error) {
      setNotice("That track data could not be read: " + error.message, "error", true);
      return;
    }
    state.tracks = parsed.tracks;
    state.metadata = parsed.metadata;

    if (source === "sample") {
      setNotice("Showing a small demo set, not the real catalog. Press Refresh to try the live data again.", "info", false);
    } else {
      setNotice("", "info", false);
    }
    render();
  }

  function fetchTracks() {
    var button = el("refreshButton");
    if (button) button.disabled = true;
    setBadge("Loading tracks…");
    setNotice("", "info", false);

    return fetch(core.DATA_URL, { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) { loadData(data, "live"); })
      .catch(function (error) {
        setBadge("Could not load tracks");
        setNotice(
          "Could not reach the track data (" + error.message + "). Check your connection, " +
          "or run this page from a local server instead of opening the file directly.",
          "error",
          true
        );
      })
      .then(function () {
        if (button) button.disabled = false;
      });
  }

  /* ------------------------------------------------------------- Rendering */

  function render() {
    var options = getOptions();

    // Custom exclude regex: validate live, show the message inline, and never
    // let a half-typed pattern break the rest of the pipeline.
    var compiled = core.compileRegex(options.customRegex);
    text("customRegexError", compiled.error ? "Not a valid pattern: " + compiled.error : "");

    state.decisions = core.decide(state.tracks, options);
    var counts = core.countByStatus(state.decisions);
    var rows = core.selectRows(state.decisions, options);
    state.exportFile = core.buildExport(options.target, rows, state.decisions, options);

    text("includedCount", counts.include);
    text("reviewCount", counts.review);
    text("excludedCount", counts.exclude);

    setBadge(state.tracks.length
      ? state.tracks.length + " tracks • updated " + core.formatDate(state.metadata.lastUpdated)
      : "No tracks loaded");

    var output = el("outputText");
    if (output) output.value = state.exportFile.text;
    text("outputLabel", state.exportFile.label);

    var targetLabel = (core.TARGETS[options.target] || core.TARGETS.soundiiz).label;
    text("readySummary", state.tracks.length
      ? state.exportFile.count + " tracks, formatted for " + targetLabel + ". Download it, then import the file in that tool."
      : "No tracks loaded yet.");

    var overrideTotal = Object.keys(state.overrides).length;
    text("overrideCount", overrideTotal);
    show(el("clearOverridesButton"), overrideTotal > 0);

    var droppedTotal = state.decisions.filter(function (decision) {
      return decision.source === "notFound";
    }).length;
    var failureTotal = Object.keys(state.failures).length;
    show(el("failureNotice"), failureTotal > 0);
    if (failureTotal > 0) {
      // Phrased as a state, not a delta: a track your import tool missed may
      // already have been excluded for another reason, so the included count
      // can move by less than this number.
      text("failureNoticeText",
        droppedTotal + (droppedTotal === 1 ? " track is" : " tracks are") +
        " excluded because your import tool could not find them.");
    }

    renderTable();
  }

  function renderTable() {
    var tbody = el("trackTableBody");
    if (!tbody) return;

    if (!state.tracks.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">No tracks loaded yet.</td></tr>';
      text("tableNote", "");
      return;
    }

    var query = core.clean((el("searchInput") || {}).value || "");
    var matches = state.decisions.filter(function (decision) {
      if (state.statusFilter && decision.status !== state.statusFilter) return false;
      if (!query) return true;
      var haystack = core.clean([
        decision.status,
        decision.track.title,
        decision.track.artist,
        core.formatDate(decision.track.createdAt),
        decision.reasons.join(" ")
      ].join(" "));
      return haystack.indexOf(query) !== -1;
    });

    if (!matches.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">Nothing matches that.</td></tr>';
      text("tableNote", "");
      return;
    }

    var visible = matches.slice(0, MAX_ROWS);
    tbody.innerHTML = visible.map(function (decision) {
      var track = decision.track;
      var alias = decision.alias;
      var override = state.overrides[decision.key] || null;
      var reasons = decision.reasons.length ? decision.reasons.join("; ") : core.REASONS.ready;
      var aliasTitle = alias && alias.title && alias.title !== track.title
        ? '<div class="muted">→ ' + escapeHtml(alias.title) + "</div>" : "";
      var aliasArtist = alias && alias.artist && alias.artist !== track.artist
        ? '<div class="muted">→ ' + escapeHtml(alias.artist) + "</div>" : "";

      return '<tr' + (override ? ' class="is-overridden"' : "") + ' data-key="' + escapeHtml(decision.key) + '">' +
        '<td><span class="status ' + decision.status + '">' + decision.status + "</span></td>" +
        '<td><span class="track-title">' + escapeHtml(track.title) + "</span>" + aliasTitle +
          // Narrow screens hide the artist column, so repeat it under the title.
          '<div class="muted only-narrow">' + escapeHtml(track.artist) + "</div></td>" +
        '<td class="artist">' + escapeHtml(track.artist) + aliasArtist + "</td>" +
        '<td class="added">' + core.formatDate(track.createdAt) + "</td>" +
        '<td class="reason">' + escapeHtml(reasons) + "</td>" +
        '<td><span class="choice">' +
          '<button type="button" data-act="keep" aria-pressed="' + (override === "include") + '"' +
            ' title="Always keep this track">Keep</button>' +
          '<button type="button" data-act="drop" aria-pressed="' + (override === "exclude") + '"' +
            ' title="Always leave this track out">Drop</button>' +
        "</span></td></tr>";
    }).join("");

    text("tableNote", matches.length > visible.length
      ? "Showing the first " + visible.length + " of " + matches.length + " rows. Search to narrow it down."
      : matches.length + (matches.length === 1 ? " track" : " tracks") + " shown.");
  }

  /* -------------------------------------------------------------- Overrides */

  function handleTableClick(event) {
    var button = event.target.closest("button[data-act]");
    if (!button) return;
    var row = button.closest("tr[data-key]");
    if (!row) return;

    var key = row.dataset.key;
    var wanted = button.dataset.act === "keep" ? "include" : "exclude";

    // Pressing the active choice again returns the track to automatic.
    if (state.overrides[key] === wanted) delete state.overrides[key];
    else state.overrides[key] = wanted;

    render();
  }

  function clearOverrides() {
    state.overrides = {};
    render();
  }

  /* ------------------------------------------------------------- Navigation */

  function goToStep(step) {
    state.step = Math.min(TOTAL_STEPS, Math.max(1, step));

    for (var i = 1; i <= TOTAL_STEPS; i += 1) {
      show(el("step" + i), i === state.step);
    }

    var railButtons = document.querySelectorAll(".rail-step");
    Array.prototype.forEach.call(railButtons, function (button) {
      var index = Number(button.dataset.goto);
      if (index === state.step) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
      button.classList.toggle("done", index < state.step);
    });

    text("stepCounter", "Step " + state.step + " of " + TOTAL_STEPS);

    var back = el("backButton");
    var next = el("nextButton");
    if (back) back.disabled = state.step === 1;
    if (next) {
      next.disabled = state.step === TOTAL_STEPS;
      next.textContent = state.step === TOTAL_STEPS - 1 ? "Get my file →" : "Next →";
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ------------------------------------------------------- Not-found helper */

  function analyzeNotFound() {
    var input = el("notFoundInput");
    var output = el("notFoundOutput");
    var raw = input ? input.value.trim() : "";

    if (!raw) {
      state.retryText = "";
      if (output) output.value = "Paste the result CSV from your import tool first.";
      return;
    }

    var suggestions = core.suggestRetries(raw);
    state.retryText = core.formatRetries(suggestions);
    if (output) {
      output.value = state.retryText || "No usable rows found in that CSV.";
    }
  }

  // Read the import tool's result CSV and drop what it could not find.
  function dropFailures() {
    var input = el("notFoundInput");
    var raw = input ? input.value.trim() : "";
    var output = el("notFoundOutput");

    if (!raw) {
      if (output) output.value = "Paste the result CSV from your import tool first.";
      return;
    }

    var result = core.matchFailures(state.decisions, getOptions(), raw);
    if (!result.matched && !result.unmatched.length) {
      if (output) output.value = "That CSV has no unmatched rows, so there is nothing to drop.";
      return;
    }

    state.failures = result.failures;
    render();

    var lines = ["Marked " + result.matched + " track" + (result.matched === 1 ? "" : "s") +
      " as not found, and left them out of the export."];
    if (result.unmatched.length) {
      lines.push("");
      lines.push(result.unmatched.length + " row" + (result.unmatched.length === 1 ? "" : "s") +
        " could not be matched to a Jam Track and were left alone:");
      result.unmatched.forEach(function (row) {
        lines.push("  " + (row.artist ? row.artist + " - " : "") + row.title);
      });
    }
    if (output) output.value = lines.join("\n") + "\n";
  }

  function clearFailures() {
    state.failures = {};
    render();
    var output = el("notFoundOutput");
    if (output) output.value = "Dropped tracks are back in the export.";
  }

  function copyToClipboard(value, button) {
    if (!value) {
      flash(button, "Nothing to copy");
      return;
    }
    if (!navigator.clipboard) {
      flash(button, "Copy unsupported");
      return;
    }
    navigator.clipboard.writeText(value).then(
      function () { flash(button, "Copied"); },
      function () { flash(button, "Copy failed"); }
    );
  }

  /* ------------------------------------------------------------------- Init */

  function init() {
    buildTargetCards();
    buildPresetCards();
    buildSortSelect();
    applyPreset("recommended");

    // Step 1: destination.
    on("targetCards", "change", render);

    // Step 2: presets, sort, switches, regex.
    on("presetCards", "change", function (event) {
      if (event.target.name !== "preset") return;
      applyPreset(event.target.value);
      render();
    });
    on("sortSelect", "change", render);

    // useAliases and sendAlbums are formatting choices, not part of what a
    // preset decides, so they do not flip the preset to Custom.
    var FORMAT_SWITCHES = ["useAliases", "sendAlbums"];
    core.SWITCH_IDS.concat(FORMAT_SWITCHES).forEach(function (id) {
      on(id, "change", function () {
        if (FORMAT_SWITCHES.indexOf(id) === -1) setRadio("preset", "custom");
        render();
      });
    });
    on("customRegex", "input", render);

    // Step 3: search, status filter, per-track overrides.
    on("searchInput", "input", renderTable);
    on("trackTableBody", "click", handleTableClick);
    on("clearOverridesButton", "click", clearOverrides);

    Array.prototype.forEach.call(document.querySelectorAll(".stat[data-filter]"), function (button) {
      button.addEventListener("click", function () {
        var wanted = button.dataset.filter;
        state.statusFilter = state.statusFilter === wanted ? null : wanted;
        Array.prototype.forEach.call(document.querySelectorAll(".stat[data-filter]"), function (other) {
          other.setAttribute("aria-pressed", String(other.dataset.filter === state.statusFilter));
        });
        renderTable();
      });
    });

    // Step 4: output.
    on("downloadButton", "click", function () {
      downloadText(state.exportFile.filename, state.exportFile.text, state.exportFile.mime);
    });
    on("copyButton", "click", function (event) {
      copyToClipboard(state.exportFile.text, event.currentTarget);
    });
    on("downloadAllButton", "click", function () {
      core.buildAllExports(state.decisions, getOptions()).forEach(function (file) {
        downloadText(file.filename, file.text, file.mime);
      });
    });
    on("analyzeNotFoundButton", "click", analyzeNotFound);
    on("dropFailuresButton", "click", dropFailures);
    on("clearFailuresButton", "click", clearFailures);
    on("copyRetryButton", "click", function (event) {
      copyToClipboard(state.retryText || (el("notFoundOutput") || {}).value, event.currentTarget);
    });

    // Chrome.
    on("refreshButton", "click", fetchTracks);
    on("demoButton", "click", function () { loadData(core.SAMPLE_TRACKS, "sample"); });
    on("backButton", "click", function () { goToStep(state.step - 1); });
    on("nextButton", "click", function () { goToStep(state.step + 1); });

    Array.prototype.forEach.call(document.querySelectorAll(".rail-step"), function (button) {
      button.addEventListener("click", function () { goToStep(Number(button.dataset.goto)); });
    });

    goToStep(1);
    render();
    fetchTracks();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window.JamTracks);
