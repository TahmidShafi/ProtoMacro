import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE_URL = 'http://localhost:4173/';
const SCRATCH_DIR = os.tmpdir();
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const out = {
  searchDom: null,
  flowA_foodLog: null,
  flowB_mealPlanGrocery: null,
  flowC_workout: null,
  flowD_habit: null,
  flowE_weight: null,
  flowF_backupCycle: null,
  lightThemeMobile: [],
  deadButtonsOrPlaceholders: []
};

async function run() {
  const browser = await chromium.launch({
    executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });

  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();

    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.stack || e.message));

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    // ---------------------------------------------------------
    // Flow A: Food search (local + USDA) & log to tracker
    // ---------------------------------------------------------
    errors.length = 0;
    await page.click('.sidebar-link[data-nav="search"]');
    await page.waitForTimeout(300);
    out.searchDom = await page.evaluate(() => {
      const sec = document.querySelector('#search');
      return {
        inputs: Array.from(sec.querySelectorAll('input, select')).map((el) => ({ id: el.id, type: el.type, placeholder: el.placeholder })),
        buttons: Array.from(sec.querySelectorAll('button')).map((b) => ({ id: b.id, text: b.innerText.trim() }))
      };
    });

    await page.fill('#searchInput', 'chicken');
    await page.waitForTimeout(600);
    const localCards = await page.locator('#searchResults .food-card, #searchResults > div, #searchResults li').count();
    const addBtn = page.locator('#searchResults button').first();
    const firstBtnText = (await addBtn.count()) > 0 ? await addBtn.innerText() : null;
    if ((await addBtn.count()) > 0) {
      await addBtn.click();
      await page.waitForTimeout(400);
      // check if modal opened
      const modalOpen = await page.locator('#modalRoot .modal, #modalBackdrop.open').count();
      if (modalOpen > 0) {
        const submitBtn = page.locator('#modalRoot button[type="submit"], #modalRoot .btn-primary').first();
        if ((await submitBtn.count()) > 0) await submitBtn.click();
        await page.waitForTimeout(300);
      }
    }
    await page.click('.sidebar-link[data-nav="tracker"]');
    await page.waitForTimeout(300);
    const trackerLogText = await page.locator('#tracker').innerText();

    // Test USDA search (how does search.js trigger USDA? via button or auto-fallback?)
    await page.click('.sidebar-link[data-nav="search"]');
    await page.waitForTimeout(200);
    await page.fill('#searchInput', 'dragonfruit');
    await page.press('#searchInput', 'Enter');
    await page.waitForTimeout(1500);
    const usdaSearchBtn = page.locator('#usdaSearchBtn, #searchUsdaBtn, button:has-text("USDA")').first();
    let usdaResponse = null;
    if ((await usdaSearchBtn.count()) > 0) {
      const [resp] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('nal.usda.gov'), { timeout: 6000 }).catch(() => null),
        usdaSearchBtn.click()
      ]);
      await page.waitForTimeout(600);
      usdaResponse = {
        buttonId: await usdaSearchBtn.getAttribute('id'),
        httpStatus: resp ? resp.status() : 'no network request / timeout',
        resultsText: (await page.locator('#searchResults').innerText()).slice(0, 300)
      };
    } else {
      // Check if typing a non-local food automatically triggers USDA
      usdaResponse = {
        buttonFound: false,
        resultsText: (await page.locator('#searchResults').innerText()).slice(0, 300)
      };
    }
    out.flowA_foodLog = {
      localCards,
      firstBtnText,
      trackerHasChicken: /chicken/i.test(trackerLogText),
      trackerSnippet: trackerLogText.slice(0, 300),
      usdaResponse,
      errors: [...errors]
    };

    // ---------------------------------------------------------
    // Flow B: Meal plan -> Grocery list
    // ---------------------------------------------------------
    errors.length = 0;
    await page.click('.sidebar-link[data-nav="planner"]');
    await page.waitForTimeout(300);
    const plannerBtns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#planner button')).map((b) => ({ id: b.id, text: b.innerText.trim(), visible: b.offsetParent !== null }))
    );
    const smartGenBtn = page.locator('#aiGenerateBtn, #smartPlanBtn, button:has-text("Generate")').first();
    let genClicked = false;
    if ((await smartGenBtn.count()) > 0) {
      await smartGenBtn.click();
      await page.waitForTimeout(500);
      genClicked = true;
    }
    const aiApplyBtn = page.locator('#aiApplyBtn, button:has-text("Apply")').first();
    let applyClicked = false;
    if ((await aiApplyBtn.count()) > 0 && (await aiApplyBtn.isVisible())) {
      await aiApplyBtn.click();
      await page.waitForTimeout(400);
      applyClicked = true;
    }
    const groceryBtn = page.locator('#groceryBtn, button:has-text("Grocery List")').first();
    let groceryModalText = '';
    if ((await groceryBtn.count()) > 0) {
      await groceryBtn.click();
      await page.waitForTimeout(400);
      groceryModalText = await page.evaluate(() => document.querySelector('#modalRoot')?.innerText?.slice(0, 500) || '');
      await page.evaluate(() => document.querySelector('#modalRoot .modal-close, #modalRoot button')?.click());
      await page.waitForTimeout(200);
    }
    out.flowB_mealPlanGrocery = {
      plannerBtns: plannerBtns.slice(0, 15),
      genClicked,
      applyClicked,
      groceryModalText,
      errors: [...errors]
    };

    // ---------------------------------------------------------
    // Flow C: Log Workout
    // ---------------------------------------------------------
    errors.length = 0;
    await page.click('.sidebar-link[data-nav="workouts"]');
    await page.waitForTimeout(300);
    await page.fill('#woName', 'Bench Press');
    await page.fill('#woWeight', '80');
    await page.fill('#woReps', '8');
    await page.click('#woAddSetBtn');
    await page.waitForTimeout(200);
    await page.click('#woSaveBtn');
    await page.waitForTimeout(400);
    const woText = await page.locator('#workouts').innerText();
    out.flowC_workout = {
      hasBenchPressInLog: /Bench Press/i.test(woText),
      snippet: woText.slice(0, 400),
      errors: [...errors]
    };

    // ---------------------------------------------------------
    // Flow D: Add Habit
    // ---------------------------------------------------------
    errors.length = 0;
    await page.click('.sidebar-link[data-nav="reset"]');
    await page.waitForTimeout(300);
    await page.click('#habitAddBtn');
    await page.waitForTimeout(300);
    const habitModalInfo = await page.evaluate(() => {
      const ov = document.querySelector('.modal-overlay');
      if (!ov) return { open: false };
      return {
        open: true,
        inputs: Array.from(ov.querySelectorAll('input, select, textarea')).map((el) => ({ id: el.id, name: el.name, type: el.type, value: el.value, required: el.required })),
        buttons: Array.from(ov.querySelectorAll('button')).map((b) => ({ className: b.className, type: b.type, text: b.innerText.trim() }))
      };
    });
    if (habitModalInfo.open) {
      const textInputs = page.locator('.modal-overlay input[type="text"], .modal-overlay input:not([type])');
      if ((await textInputs.count()) > 0) {
        await textInputs.first().fill('No Soda');
      }
      const submitBtn = page.locator('.modal-overlay button[type="submit"], .modal-overlay .btn-primary').first();
      if ((await submitBtn.count()) > 0) {
        await submitBtn.click();
        await page.waitForTimeout(400);
      }
      // Close if still open
      await page.evaluate(() => document.querySelector('.modal-overlay .modal-close, .modal-overlay .btn-ghost')?.click());
      await page.waitForTimeout(200);
    }
    const resetText = await page.locator('#reset').innerText();
    out.flowD_habit = {
      habitModalInfo,
      hasNoSoda: /No Soda/i.test(resetText),
      snippet: resetText.slice(0, 400),
      errors: [...errors]
    };

    // ---------------------------------------------------------
    // Flow E: Log Weight
    // ---------------------------------------------------------
    errors.length = 0;
    await page.click('.sidebar-link[data-nav="progress"]');
    await page.waitForTimeout(300);
    await page.fill('#weightInput', '75.5');
    await page.click('#logWeightBtn');
    await page.waitForTimeout(400);
    const progressText = await page.locator('#progress').innerText();
    out.flowE_weight = {
      has755: /75\.5/.test(progressText),
      snippet: progressText.slice(0, 400),
      errors: [...errors]
    };

    // ---------------------------------------------------------
    // Flow F: Export Backup -> Clear All -> Import Backup
    // ---------------------------------------------------------
    errors.length = 0;
    await page.click('.sidebar-link[data-nav="settings"]');
    await page.waitForTimeout(300);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#exportBackupBtn')
    ]);
    const backupPath = path.join(SCRATCH_DIR, 'test-backup.json');
    await download.saveAs(backupPath);
    const exportedJson = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

    // Clear all data
    await page.click('#clearAllBtn');
    await page.waitForTimeout(300);
    // Confirm clear modal
    const confirmClearBtn = page.locator('.modal-overlay .btn-danger, .modal-overlay .btn-primary, .modal-overlay button:has-text("Clear"), .modal-overlay button:has-text("Delete"), .modal-overlay button:has-text("Confirm")').first();
    if ((await confirmClearBtn.count()) > 0) {
      await confirmClearBtn.click();
      await page.waitForTimeout(500);
    }
    const afterClearHabits = await page.evaluate(() => {
      const raw = localStorage.getItem('protomacro_v1') || localStorage.getItem('protomacro_state');
      return { keys: Object.keys(localStorage), rawLen: raw ? raw.length : 0 };
    });

    // Import backup
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#importBackupBtn');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(backupPath);
    await page.waitForTimeout(400);
    const importConfirmText = await page.evaluate(() => document.querySelector('.modal-overlay')?.innerText || '');
    const importApplyBtn = page.locator('.modal-overlay .btn-primary, .modal-overlay button:has-text("Replace"), .modal-overlay button:has-text("Merge"), .modal-overlay button:has-text("Import")').first();
    if ((await importApplyBtn.count()) > 0) {
      await importApplyBtn.click();
      await page.waitForTimeout(500);
    }

    // Verify restored
    await page.click('.sidebar-link[data-nav="reset"]');
    await page.waitForTimeout(300);
    const resetAfterRestore = await page.locator('#reset').innerText();

    out.flowF_backupCycle = {
      exportedFile: download.suggestedFilename(),
      exportedKeys: Object.keys(exportedJson),
      afterClearHabits,
      importConfirmText: importConfirmText.slice(0, 300),
      restoredHabitPresent: /No Soda/i.test(resetAfterRestore),
      errors: [...errors]
    };

    // ---------------------------------------------------------
    // Check light theme on mobile (390x844) for today & settings
    // ---------------------------------------------------------
    await page.click('.sidebar-link[data-nav="settings"]');
    await page.waitForTimeout(200);
    await page.click('#themeSeg [data-value="light"]');
    await page.waitForTimeout(300);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);

    for (const r of ['today', 'settings']) {
      await page.click('#hamburger');
      await page.waitForTimeout(200);
      await page.click(`.sidebar-link[data-nav="${r}"]`);
      await page.waitForTimeout(400);
      const info = await page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        docOverflow: document.documentElement.scrollWidth > window.innerWidth,
        hOverflowDiff: document.documentElement.scrollWidth - window.innerWidth
      }));
      out.lightThemeMobile.push({ route: r, ...info });
    }

    await ctx.close();
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(SCRATCH_DIR, 'audit-flows.json'), JSON.stringify(out, null, 2));
  console.log('FLOWS_DONE');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
