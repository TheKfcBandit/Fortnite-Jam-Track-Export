/*
 * End-to-end tests: drives index.html in a real browser.
 *
 *   npm install          (once, to get Playwright)
 *   npm run test:e2e
 *
 * The live dataset request is intercepted and answered with
 * tests/fixtures/tracks.sample.json, so these tests never touch the network.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..", "..");
const DATA_URL = "https://raw.githubusercontent.com/FNFestival/fnfestival.github.io/refs/heads/main/data/tracks.json";
const FIXTURE_PATH = path.join(ROOT, "tests", "fixtures", "tracks.sample.json");
const FIXTURE = fs.readFileSync(FIXTURE_PATH, "utf8");
const TRACK_COUNT = Object.keys(JSON.parse(FIXTURE)).length - 1;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

let server;
let browser;
let baseUrl;

// Serve the repository exactly as a static host would.
test.before(async () => {
  server = http.createServer((req, res) => {
    const relative = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const target = path.join(ROOT, relative);
    if (!target.startsWith(ROOT) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(target)] || "application/octet-stream" });
    res.end(fs.readFileSync(target));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/index.html`;
  browser = await chromium.launch();
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

/*
 * Opens the wizard with the dataset stubbed, and fails the test on any
 * uncaught page error. A thrown error inside init() is exactly the bug that
 * made every control in the previous version inert, so every test watches
 * for it rather than only the dedicated one below.
 */
async function openWizard(t, options = {}) {
  const context = await browser.newContext(
    Object.assign({ acceptDownloads: true }, options.contextOptions)
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.route(DATA_URL, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: options.body || FIXTURE })
  );

  await page.goto(baseUrl, { waitUntil: "load" });
  if (!options.expectNoData) {
    await page.waitForFunction(
      () => Number(document.getElementById("includedCount").textContent) > 0,
      undefined,
      { timeout: 10000 }
    );
  }

  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], "the page must not raise any uncaught errors");
  });

  return { page, errors };
}

const count = async (page, id) => Number(await page.textContent("#" + id));
const preview = (page) => page.inputValue("#outputText");
const goToStep = (page, step) => page.click(`.rail-step[data-goto="${step}"]`);

/* -------------------------------------------------------- the original bug */

test("the page loads with no uncaught errors and wires up every control", async (t) => {
  const { page, errors } = await openWizard(t);
  assert.deepEqual(errors, []);

  // Regression guard: every id app.js binds must exist in index.html.
  const warnings = [];
  const second = await page.context().newPage();
  second.on("console", (msg) => {
    if (msg.type() === "warning" && msg.text().includes("[app]")) warnings.push(msg.text());
  });
  await second.route(DATA_URL, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: FIXTURE })
  );
  await second.goto(baseUrl, { waitUntil: "load" });
  await second.waitForTimeout(300);
  assert.deepEqual(warnings, [], "app.js must not reference elements that do not exist");
  await second.close();
});

test("track data loads automatically, with no click required", async (t) => {
  const { page } = await openWizard(t);
  await assert.doesNotReject(page.waitForSelector("#dataBadge:has-text('tracks')"));
  assert.match(await page.textContent("#dataBadge"), new RegExp(`${TRACK_COUNT} tracks`));
  assert.equal(await page.isVisible("#notice"), false, "no error notice on a successful load");
});

/* ------------------------------------------------------------- navigation */

test("the wizard walks forward and back through all four steps", async (t) => {
  const { page } = await openWizard(t);

  assert.equal(await page.textContent("#stepCounter"), "Step 1 of 4");
  assert.equal(await page.isVisible("#step1"), true);
  assert.equal(await page.isDisabled("#backButton"), true, "Back is disabled on the first step");

  for (const step of [2, 3, 4]) {
    await page.click("#nextButton");
    assert.equal(await page.textContent("#stepCounter"), `Step ${step} of 4`);
    assert.equal(await page.isVisible(`#step${step}`), true);
    for (const other of [1, 2, 3, 4].filter((n) => n !== step)) {
      assert.equal(await page.isVisible(`#step${other}`), false, `step ${other} must be hidden`);
    }
  }

  assert.equal(await page.isDisabled("#nextButton"), true, "Next is disabled on the last step");

  await page.click("#backButton");
  assert.equal(await page.textContent("#stepCounter"), "Step 3 of 4");
});

test("the progress rail jumps straight to a step", async (t) => {
  const { page } = await openWizard(t);
  await goToStep(page, 4);
  assert.equal(await page.isVisible("#step4"), true);
  assert.equal(await page.getAttribute('.rail-step[data-goto="4"]', "aria-current"), "step");
  await goToStep(page, 2);
  assert.equal(await page.isVisible("#step2"), true);
});

/* --------------------------------------------------- step 1: destinations */

test("each destination produces its own format and filename", async (t) => {
  const { page } = await openWizard(t);

  const expected = {
    soundiiz: { header: "title,artist,album,isrc,", label: "Soundiiz CSV preview" },
    tunemymusicCsv: { header: "artist,title,album", label: "TuneMyMusic CSV preview" },
    reviewCsv: {
      header: "status,title,artist,exportTitle,exportArtist,album,addedToFortnite,releaseYear,note",
      label: "Review CSV preview"
    }
  };

  for (const [target, { header, label }] of Object.entries(expected)) {
    await goToStep(page, 1);
    await page.check(`input[name="target"][value="${target}"]`);
    await goToStep(page, 4);
    assert.equal((await preview(page)).split("\n")[0], header, `${target} header`);
    assert.equal(await page.textContent("#outputLabel"), label);
  }

  await goToStep(page, 1);
  await page.check('input[name="target"][value="tunemymusicText"]');
  await goToStep(page, 4);
  const lines = (await preview(page)).trim().split("\n");
  assert.ok(lines.every((line) => line.includes(" - ")), "text export is Artist - Title");
  assert.ok(!lines[0].startsWith("title,"), "text export has no CSV header");
});

/* --------------------------------------------------------- step 2: presets */

test("presets change the counts and drive the fine-tune switches", async (t) => {
  const { page } = await openWizard(t);
  await goToStep(page, 2);

  await page.check('input[name="preset"][value="recommended"]');
  const recommended = await count(page, "includedCount");
  assert.equal(await page.isChecked("#includeOriginals"), false);

  await page.check('input[name="preset"][value="complete"]');
  const complete = await count(page, "includedCount");
  assert.equal(await page.isChecked("#includeOriginals"), true, "complete ticks the originals switch");
  assert.equal(await page.isChecked("#includeFortniteEdits"), true);
  assert.ok(complete > recommended, "complete must include more tracks than recommended");
  assert.equal(await count(page, "excludedCount"), 0);

  await page.check('input[name="preset"][value="broad"]');
  const broad = await count(page, "includedCount");
  assert.ok(broad > recommended && broad < complete, "broad sits between the other two");
});

test("changing a switch by hand flips the preset to Custom", async (t) => {
  const { page } = await openWizard(t);
  await goToStep(page, 2);
  await page.check('input[name="preset"][value="recommended"]');

  const before = await count(page, "includedCount");
  await page.click("#advanced summary");
  await page.check("#includeOriginals");

  assert.equal(await page.isChecked('input[name="preset"][value="custom"]'), true);
  assert.ok(await count(page, "includedCount") > before, "including originals adds tracks");
});

test("the sort order rearranges the export without changing its size", async (t) => {
  const { page } = await openWizard(t);
  await goToStep(page, 2);
  await page.selectOption("#sortSelect", "addedAsc");
  await goToStep(page, 4);
  const ascending = await preview(page);

  await goToStep(page, 2);
  await page.selectOption("#sortSelect", "addedDesc");
  await goToStep(page, 4);
  const descending = await preview(page);

  assert.notEqual(ascending, descending, "a different sort must reorder the file");
  assert.equal(ascending.trim().split("\n").length, descending.trim().split("\n").length);
});

test("turning aliases off restores the original Fortnite titles", async (t) => {
  const { page } = await openWizard(t);
  await goToStep(page, 4);
  assert.ok((await preview(page)).includes("Work Bitch"), "aliases are applied by default");

  await goToStep(page, 2);
  await page.click("#advanced summary");
  await page.uncheck("#useAliases");
  await goToStep(page, 4);

  const raw = await preview(page);
  assert.ok(raw.includes("Work Work"), "the Fortnite title is used when aliases are off");
  assert.ok(!raw.includes("Work Bitch"));
});

test("requiring a preview URL removes the tracks that lack one", async (t) => {
  const { page } = await openWizard(t);
  await goToStep(page, 2);
  const before = await count(page, "includedCount");
  await page.click("#advanced summary");
  await page.check("#requirePreview");
  assert.ok(await count(page, "includedCount") < before, "some fixture tracks have no preview");
});

/* -------------------------------------------- step 2: the custom regex */

test("the custom exclude regex actually filters, and reports bad patterns", async (t) => {
  const { page } = await openWizard(t);
  await goToStep(page, 2);
  await page.click("#advanced summary");

  const before = await count(page, "includedCount");

  // A valid pattern filters and shows no error.
  await page.fill("#customRegex", "Britney Spears");
  assert.equal(await page.textContent("#customRegexError"), "");
  const filtered = await count(page, "includedCount");
  assert.equal(filtered, before - 1, "exactly one fixture track is by Britney Spears");

  // /pattern/flags form is honoured.
  await page.fill("#customRegex", "/britney spears/i");
  assert.equal(await count(page, "includedCount"), filtered);

  // An invalid pattern shows an inline error and filters nothing.
  await page.fill("#customRegex", "([unclosed");
  assert.match(await page.textContent("#customRegexError"), /Not a valid pattern/);
  assert.equal(await count(page, "includedCount"), before, "a broken pattern must not filter");

  // Clearing it restores everything and clears the error.
  await page.fill("#customRegex", "");
  assert.equal(await page.textContent("#customRegexError"), "");
  assert.equal(await count(page, "includedCount"), before);
});

/* --------------------------------------------------- step 3: review table */

test("the review table lists tracks with statuses and reasons", async (t) => {
  const { page } = await openWizard(t);
  await goToStep(page, 3);

  assert.ok(await page.locator("#trackTableBody tr").count() > 5);
  assert.ok(await page.locator(".status.include").count() > 0);
  assert.ok(await page.locator(".status.exclude").count() > 0);
  assert.match(await page.textContent("#tableNote"), /tracks shown/);
});

test("searching narrows the table and clearing restores it", async (t) => {
  const { page } = await openWizard(t);
  await goToStep(page, 3);
  const all = await page.locator("#trackTableBody tr").count();

  await page.fill("#searchInput", "Britney");
  assert.equal(await page.locator("#trackTableBody tr").count(), 1);

  await page.fill("#searchInput", "zzz-definitely-nothing");
  assert.match(await page.textContent("#trackTableBody"), /Nothing matches that/);

  await page.fill("#searchInput", "");
  assert.equal(await page.locator("#trackTableBody tr").count(), all);
});

test("the status tiles filter the table", async (t) => {
  const { page } = await openWizard(t);
  await goToStep(page, 3);

  const excluded = await count(page, "excludedCount");
  await page.click('.stat[data-filter="exclude"]');
  assert.equal(await page.getAttribute('.stat[data-filter="exclude"]', "aria-pressed"), "true");
  assert.equal(await page.locator("#trackTableBody tr").count(), excluded);
  assert.equal(await page.locator(".status.include").count(), 0);

  await page.click('.stat[data-filter="exclude"]');
  assert.equal(await page.getAttribute('.stat[data-filter="exclude"]', "aria-pressed"), "false");
  assert.ok(await page.locator(".status.include").count() > 0);
});

/* ----------------------------------------------- step 3: manual overrides */

test("Keep forces an excluded track into the export", async (t) => {
  const { page } = await openWizard(t);
  await goToStep(page, 3);

  const included = await count(page, "includedCount");
  const excluded = await count(page, "excludedCount");

  await page.click('.stat[data-filter="exclude"]');
  const row = page.locator("#trackTableBody tr").first();
  const title = (await row.locator(".track-title").textContent()).trim();
  await row.locator('button[data-act="keep"]').click();

  assert.equal(await count(page, "includedCount"), included + 1);
  assert.equal(await count(page, "excludedCount"), excluded - 1);
  assert.equal(await page.textContent("#overrideCount"), "1");
  assert.equal(await page.isVisible("#clearOverridesButton"), true);

  // And it reaches the actual file.
  await goToStep(page, 4);
  assert.ok((await preview(page)).includes(title), `${title} should be in the export`);
});

test("Drop forces an included track out of the export", async (t) => {
  const { page } = await openWizard(t);
  await goToStep(page, 3);

  const included = await count(page, "includedCount");
  await page.click('.stat[data-filter="include"]');
  const row = page.locator("#trackTableBody tr").first();
  const title = (await row.locator(".track-title").textContent()).trim();
  await row.locator('button[data-act="drop"]').click();

  assert.equal(await count(page, "includedCount"), included - 1);

  await goToStep(page, 4);
  assert.ok(!(await preview(page)).includes(title), `${title} should not be in the export`);
});

test("pressing the same choice again returns the track to automatic", async (t) => {
  const { page } = await openWizard(t);
  await goToStep(page, 3);

  const included = await count(page, "includedCount");
  const row = page.locator("#trackTableBody tr").first();

  await row.locator('button[data-act="drop"]').click();
  assert.equal(await page.textContent("#overrideCount"), "1");
  assert.equal(await row.locator('button[data-act="drop"]').getAttribute("aria-pressed"), "true");

  await row.locator('button[data-act="drop"]').click();
  assert.equal(await page.textContent("#overrideCount"), "0");
  assert.equal(await count(page, "includedCount"), included);
});

test("overrides survive a change of preset", async (t) => {
  const { page } = await openWizard(t);
  await goToStep(page, 3);

  await page.click('.stat[data-filter="exclude"]');
  await page.locator("#trackTableBody tr").first().locator('button[data-act="keep"]').click();
  assert.equal(await page.textContent("#overrideCount"), "1");

  await goToStep(page, 2);
  await page.check('input[name="preset"][value="broad"]');
  await goToStep(page, 3);

  assert.equal(await page.textContent("#overrideCount"), "1", "the override must persist");

  // The status filter is still set to "exclude" from above, and the override
  // moved that track to "include", so clear the filter before counting rows.
  await page.click('.stat[data-filter="exclude"]');
  assert.equal(await page.locator("tr.is-overridden").count(), 1);
});

test("Undo my changes clears every override at once", async (t) => {
  const { page } = await openWizard(t);
  await goToStep(page, 3);

  const included = await count(page, "includedCount");
  const rows = page.locator("#trackTableBody tr");
  await rows.nth(0).locator('button[data-act="drop"]').click();
  await rows.nth(1).locator('button[data-act="drop"]').click();
  assert.equal(await page.textContent("#overrideCount"), "2");

  await page.click("#clearOverridesButton");
  assert.equal(await page.textContent("#overrideCount"), "0");
  assert.equal(await count(page, "includedCount"), included);
  assert.equal(await page.isVisible("#clearOverridesButton"), false);
});

/* --------------------------------------------------------- step 4: output */

test("the summary names the track count and the chosen tool", async (t) => {
  const { page } = await openWizard(t);
  await goToStep(page, 4);
  const included = await count(page, "includedCount");
  assert.match(await page.textContent("#readySummary"), new RegExp(`${included} tracks.*Soundiiz CSV`));
});

test("Download file saves the export under a dated name", async (t) => {
  const { page } = await openWizard(t);
  await goToStep(page, 4);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#downloadButton")
  ]);

  assert.match(download.suggestedFilename(), /^fortnite-jam-tracks-soundiiz-\d{4}-\d{2}-\d{2}\.csv$/);
  const saved = path.join(os.tmpdir(), `jam-${Date.now()}.csv`);
  await download.saveAs(saved);
  const body = fs.readFileSync(saved, "utf8");
  assert.equal(body.split("\n")[0], "title,artist,album,isrc,");
  assert.equal(body, await preview(page), "the file must match the preview");
  fs.unlinkSync(saved);
});

test("Download all 4 formats saves one file per target", async (t) => {
  const { page } = await openWizard(t);
  await goToStep(page, 4);

  const downloads = [];
  page.on("download", (download) => downloads.push(download));
  await page.click("#downloadAllButton");
  await page.waitForFunction(() => true);
  await page.waitForTimeout(700);

  const names = downloads.map((d) => d.suggestedFilename()).sort();
  assert.equal(names.length, 4, `expected 4 downloads, got ${names.join(", ")}`);
  assert.equal(new Set(names).size, 4, "filenames must be unique");
  assert.ok(names.some((n) => n.includes("soundiiz")));
  assert.ok(names.some((n) => n.includes("review")));
  assert.ok(names.some((n) => n.endsWith(".txt")));
});

test("Copy to clipboard copies the export", async (t) => {
  const { page } = await openWizard(t, {
    contextOptions: { permissions: ["clipboard-read", "clipboard-write"] }
  });
  await goToStep(page, 4);
  await page.click("#copyButton");

  // writeText resolves asynchronously, so wait for the confirmation label.
  await page.waitForSelector("#copyButton:has-text('Copied')");
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(clipboard, await preview(page));
});

/* ----------------------------------------------- step 4: not-found helper */

test("the not-found helper suggests better searches", async (t) => {
  const { page } = await openWizard(t);
  await goToStep(page, 4);
  await page.click("text=Some songs weren't found by Soundiiz?");

  await page.fill("#notFoundInput",
    'title,artist,album,isrc,isFound\n"World Is Mine","ryo (supercell) ft. Hatsune Miku",,,0\n');
  await page.click("#analyzeNotFoundButton");

  const output = await page.inputValue("#notFoundOutput");
  assert.match(output, /Hatsune Miku - World is Mine/);
  assert.match(output, /# .*Vocaloid/);
});

test("the not-found helper asks for input when given none", async (t) => {
  const { page } = await openWizard(t);
  await goToStep(page, 4);
  await page.click("text=Some songs weren't found by Soundiiz?");
  await page.click("#analyzeNotFoundButton");
  assert.match(await page.inputValue("#notFoundOutput"), /Paste the not-found CSV/);
});

/* ------------------------------------------------------- failure handling */

test("a failed fetch explains itself and offers the demo data", async (t) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.route(DATA_URL, (route) => route.abort("failed"));
  await page.goto(baseUrl, { waitUntil: "load" });
  await page.waitForSelector("#notice:visible");

  assert.match(await page.textContent("#noticeText"), /Could not reach the track data/);
  assert.equal(await page.isVisible("#demoButton"), true);
  assert.equal(await page.isDisabled("#refreshButton"), false, "Refresh must be usable again");

  // The demo path keeps the wizard usable rather than dead-ending.
  await page.click("#demoButton");
  await page.waitForFunction(() => Number(document.getElementById("includedCount").textContent) > 0);
  assert.match(await page.textContent("#noticeText"), /demo set/);

  await context.close();
  assert.deepEqual(errors, [], "a failed fetch must not raise an uncaught error");
});

test("malformed track data is reported instead of throwing", async (t) => {
  const { page } = await openWizard(t, { body: '"not an object"', expectNoData: true });
  await page.waitForSelector("#notice:visible");
  assert.match(await page.textContent("#noticeText"), /could not be read/);
});

/* -------------------------------------------------------------- responsive */

test("the wizard works at phone width without sideways scrolling", async (t) => {
  const { page } = await openWizard(t, { contextOptions: { viewport: { width: 400, height: 780 } } });

  for (const step of [1, 2, 3, 4]) {
    await goToStep(page, step);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    assert.ok(overflow <= 1, `step ${step} overflows horizontally by ${overflow}px`);
  }

  await goToStep(page, 4);
  assert.ok((await preview(page)).length > 0, "the export still generates on a small screen");
});

test("the Keep and Drop buttons stay reachable at phone width", async (t) => {
  const { page } = await openWizard(t, { contextOptions: { viewport: { width: 400, height: 780 } } });
  await goToStep(page, 3);

  const row = page.locator("#trackTableBody tr").first();
  const keep = row.locator('button[data-act="keep"]');
  await keep.scrollIntoViewIfNeeded();

  // The narrow layout drops the artist/added/why columns precisely so these
  // buttons do not scroll out of the table's horizontal overflow.
  const wrap = await page.locator(".table-wrap").boundingBox();
  const box = await keep.boundingBox();
  assert.ok(box, "the Keep button must be laid out");
  assert.ok(
    box.x >= wrap.x - 1 && box.x + box.width <= wrap.x + wrap.width + 1,
    `Keep button at x=${box.x}..${box.x + box.width} falls outside the table (${wrap.x}..${wrap.x + wrap.width})`
  );

  // The artist is repeated under the title, since its own column is hidden.
  assert.equal(await row.locator("td.artist").isVisible(), false);
  assert.equal(await row.locator(".only-narrow").isVisible(), true);

  // And the buttons still work. Filter to included rows first, so that
  // dropping one is guaranteed to move the count.
  await page.click('.stat[data-filter="include"]');
  const included = await count(page, "includedCount");
  await page.locator("#trackTableBody tr").first().locator('button[data-act="drop"]').click();
  assert.equal(await count(page, "includedCount"), included - 1);
});
