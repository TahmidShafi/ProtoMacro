import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE_URL = 'http://localhost:4173/';
const SCREENS_DIR = path.resolve('status-screens');
const OUT_DIR = os.tmpdir();

fs.mkdirSync(SCREENS_DIR, { recursive: true });

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const report = {
  welcomeModal: null,
  desktopDark: [],
  mobileDark: [],
  lightThemeChecks: [],
  flows: {},
  pwa: {},
  allConsoleErrors: [],
  allPageErrors: []
};

async function run() {
  const browser = await chromium.launch({
    executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });

  try {
    // =========================================================
    // 1. DESKTOP (1440x900) DARK THEME + WELCOME MODAL
    // =========================================================
    const ctx1 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx1.newPage();

    const routeErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        routeErrors.push(text);
        report.allConsoleErrors.push(text);
      }
    });
    page.on('pageerror', (err) => {
      const text = err.stack || err.message || String(err);
      routeErrors.push(text);
      report.allPageErrors.push(text);
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Check welcome modal
    const modalVisible = await page.evaluate(() => {
      const m = document.querySelector('#modalBackdrop, #modalRoot, .modal-backdrop.open, .modal.open');
      if (!m) return null;
      const style = getComputedStyle(m);
      return {
        visible: style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0',
        text: m.innerText?.slice(0, 300)
      };
    });
    report.welcomeModal = modalVisible;

    // Dismiss any open modal
    await page.evaluate(() => {
      const btn = document.querySelector('#modalRoot button, .modal-close, [data-dismiss="modal"], .modal .btn-primary, .modal .btn-ghost');
      if (btn) btn.click();
    });
    await page.waitForTimeout(300);

    // Get all sidebar links
    const sidebarLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.sidebar-link')).map((a) => ({
        nav: a.dataset.nav || a.getAttribute('href')?.replace(/^#/, '') || '',
        href: a.getAttribute('href') || '',
        text: a.innerText.trim()
      }));
    });

    for (const link of sidebarLinks) {
      routeErrors.length = 0;
      const sel = `.sidebar-link[data-nav="${link.nav}"], .sidebar-link[href="${link.href}"]`;
      await page.click(sel);
      await page.waitForTimeout(450);

      const info = await page.evaluate(() => {
        const activeView = document.querySelector('.app-view.active');
        const pageTitle = document.querySelector('#pageTitle')?.textContent?.trim() || '';
        const appMain = document.querySelector('#appMain');
        const docOverflow = document.documentElement.scrollWidth > window.innerWidth;
        const mainOverflow = appMain ? appMain.scrollWidth > appMain.clientWidth : false;
        const hOverflowDiff = document.documentElement.scrollWidth - window.innerWidth;
        const mainOverflowDiff = appMain ? appMain.scrollWidth - appMain.clientWidth : 0;

        // Check broken images
        const brokenImgs = Array.from(document.querySelectorAll('img'))
          .filter((img) => img.offsetParent !== null && (!img.complete || img.naturalWidth === 0))
          .map((img) => img.src);

        // Check canvases with 0 size in active view
        const zeroCanvases = activeView
          ? Array.from(activeView.querySelectorAll('canvas'))
              .filter((c) => c.offsetParent !== null && (c.width === 0 || c.height === 0))
              .map((c) => c.id || 'unnamed-canvas')
          : [];

        // Check buttons inside active view
        const buttons = activeView
          ? Array.from(activeView.querySelectorAll('button')).filter((b) => b.offsetParent !== null).length
          : 0;

        return {
          hash: location.hash,
          docTitle: document.title,
          pageTitle,
          activeViewId: activeView?.id || null,
          activeViewHeight: activeView?.offsetHeight || 0,
          docOverflow,
          hOverflowDiff,
          mainOverflow,
          mainOverflowDiff,
          brokenImgs,
          zeroCanvases,
          visibleButtons: buttons,
          theme: document.documentElement.dataset.theme
        };
      });

      const fileName = `desktop-${link.nav || 'unknown'}.png`;
      await page.screenshot({ path: path.join(SCREENS_DIR, fileName), fullPage: false });

      report.desktopDark.push({
        route: link.nav,
        label: link.text,
        screenshot: `status-screens/${fileName}`,
        consoleErrors: [...routeErrors],
        ...info
      });
    }

    // =========================================================
    // 2. LIGHT THEME CHECK (1440x900)
    // =========================================================
    await page.click('.sidebar-link[data-nav="settings"]');
    await page.waitForTimeout(300);
    await page.click('#themeSeg [data-value="light"]');
    await page.waitForTimeout(300);

    for (const route of ['today', 'progress', 'tracker', 'search', 'planner', 'workouts', 'settings']) {
      routeErrors.length = 0;
      await page.click(`.sidebar-link[data-nav="${route}"]`);
      await page.waitForTimeout(400);
      const lightInfo = await page.evaluate(() => {
        const bodyBg = getComputedStyle(document.body).backgroundColor;
        const bodyColor = getComputedStyle(document.body).color;
        const card = document.querySelector('.app-view.active .card, .app-view.active .panel, .app-view.active .dash-card');
        const cardBg = card ? getComputedStyle(card).backgroundColor : null;
        return {
          theme: document.documentElement.dataset.theme,
          bodyBg,
          bodyColor,
          cardBg
        };
      });
      report.lightThemeChecks.push({
        route,
        viewport: '1440x900',
        consoleErrors: [...routeErrors],
        ...lightInfo
      });
    }

    // Reset to dark theme for mobile checks
    await page.click('.sidebar-link[data-nav="settings"]');
    await page.waitForTimeout(200);
    await page.click('#themeSeg [data-value="dark"]');
    await page.waitForTimeout(200);

    // =========================================================
    // 3. MOBILE (390x844) DARK THEME
    // =========================================================
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);

    for (const link of sidebarLinks) {
      routeErrors.length = 0;
      // Open mobile drawer
      const drawerOpen = await page.evaluate(() => document.querySelector('#appShell')?.classList.contains('drawer-open'));
      if (!drawerOpen) {
        await page.click('#hamburger');
        await page.waitForTimeout(250);
      }
      const sel = `.sidebar-link[data-nav="${link.nav}"], .sidebar-link[href="${link.href}"]`;
      await page.click(sel);
      await page.waitForTimeout(450);

      const info = await page.evaluate(() => {
        const activeView = document.querySelector('.app-view.active');
        const appMain = document.querySelector('#appMain');
        const docOverflow = document.documentElement.scrollWidth > window.innerWidth;
        const mainOverflow = appMain ? appMain.scrollWidth > appMain.clientWidth : false;
        const overflowingEls = [];
        if (activeView) {
          for (const el of activeView.querySelectorAll('*')) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.right > window.innerWidth + 2) {
              overflowingEls.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + String(el.className).split(' ')[0] : ''} (right=${Math.round(r.right)})`);
              if (overflowingEls.length >= 5) break;
            }
          }
        }
        return {
          hash: location.hash,
          activeViewId: activeView?.id || null,
          docOverflow,
          hOverflowDiff: document.documentElement.scrollWidth - window.innerWidth,
          mainOverflow,
          mainOverflowDiff: appMain ? appMain.scrollWidth - appMain.clientWidth : 0,
          overflowingEls
        };
      });

      const fileName = `mobile-${link.nav || 'unknown'}.png`;
      await page.screenshot({ path: path.join(SCREENS_DIR, fileName), fullPage: false });

      report.mobileDark.push({
        route: link.nav,
        label: link.text,
        screenshot: `status-screens/${fileName}`,
        consoleErrors: [...routeErrors],
        ...info
      });
    }

    await ctx1.close();

    // =========================================================
    // 4. CORE END-TO-END FLOWS (fresh context, 1440x900)
    // =========================================================
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const p2 = await ctx2.newPage();
    const flowErrors = [];
    p2.on('console', (msg) => {
      if (msg.type() === 'error') flowErrors.push(msg.text());
    });
    p2.on('pageerror', (err) => flowErrors.push(err.message));

    await p2.goto(BASE_URL, { waitUntil: 'networkidle' });
    await p2.waitForTimeout(400);
    await p2.evaluate(() => {
      const btn = document.querySelector('#modalRoot button, .modal-close, [data-dismiss="modal"]');
      if (btn) btn.click();
    });
    await p2.waitForTimeout(200);

    // Flow A: Log food (local + USDA)
    try {
      flowErrors.length = 0;
      await p2.click('.sidebar-link[data-nav="search"]');
      await p2.waitForTimeout(300);
      await p2.fill('#foodSearchInput, #searchInput, input[type="search"]', 'chicken');
      await p2.waitForTimeout(500);
      const localResultsCount = await p2.locator('#searchResults .food-card, #searchResults .food-item, #foodResults > *').count();
      const firstAddBtn = p2.locator('#searchResults button, #foodResults button').first();
      let loggedLocal = false;
      if ((await firstAddBtn.count()) > 0) {
        await firstAddBtn.click();
        await p2.waitForTimeout(300);
        // If a modal opened for grams/meal, submit it
        const modalSubmit = p2.locator('#modalRoot button[type="submit"], #modalRoot .btn-primary').first();
        if ((await modalSubmit.count()) > 0 && (await modalSubmit.isVisible())) {
          await modalSubmit.click();
          await p2.waitForTimeout(300);
        }
        loggedLocal = true;
      }
      await p2.click('.sidebar-link[data-nav="tracker"]');
      await p2.waitForTimeout(300);
      const trackerText = await p2.locator('#tracker').innerText();

      // USDA search
      await p2.click('.sidebar-link[data-nav="search"]');
      await p2.waitForTimeout(200);
      const usdaBtn = p2.locator('#usdaSearchBtn, button:has-text("USDA")').first();
      let usdaStatus = 'button not found';
      if ((await usdaBtn.count()) > 0) {
        await p2.fill('#foodSearchInput, #searchInput, input[type="search"]', 'avocado');
        await usdaBtn.click();
        await p2.waitForTimeout(3000);
        const searchAreaText = await p2.locator('#search').innerText();
        usdaStatus = searchAreaText.slice(0, 400);
      }

      report.flows.foodLog = {
        localResultsCount,
        loggedLocal,
        trackerHasChicken: /chicken/i.test(trackerText),
        usdaStatus,
        errors: [...flowErrors]
      };
    } catch (e) {
      report.flows.foodLog = { error: e.message };
    }

    // Flow B: Meal plan -> grocery list
    try {
      flowErrors.length = 0;
      await p2.click('.sidebar-link[data-nav="planner"]');
      await p2.waitForTimeout(300);
      const genBtn = p2.locator('#aiPlanGenerateBtn, #generatePlanBtn, button:has-text("Generate")').first();
      let generated = false;
      if ((await genBtn.count()) > 0) {
        await genBtn.click();
        await p2.waitForTimeout(600);
        generated = true;
      }
      const applyBtn = p2.locator('#aiPlanApplyBtn, button:has-text("Apply")').first();
      let applied = false;
      if ((await applyBtn.count()) > 0 && (await applyBtn.isVisible())) {
        await applyBtn.click();
        await p2.waitForTimeout(400);
        applied = true;
      }
      await p2.click('.sidebar-link[data-nav="grocery"]');
      await p2.waitForTimeout(400);
      const groceryVisible = await p2.locator('#groceryModal, #groceryPanel, #groceryList, .grocery-list').first().isVisible().catch(() => false);
      const groceryText = await p2.evaluate(() => {
        const el = document.querySelector('#modalRoot, #groceryList, #planner');
        return el ? el.innerText.slice(0, 400) : '';
      });
      // Close grocery modal if it opened in modalRoot
      await p2.evaluate(() => {
        const btn = document.querySelector('#modalRoot .modal-close, #modalRoot button[data-dismiss="modal"]');
        if (btn) btn.click();
      });
      report.flows.mealPlanToGrocery = {
        generated,
        applied,
        groceryVisible,
        groceryText,
        errors: [...flowErrors]
      };
    } catch (e) {
      report.flows.mealPlanToGrocery = { error: e.message };
    }

    // Flow C: Log workout
    try {
      flowErrors.length = 0;
      await p2.click('.sidebar-link[data-nav="workouts"]');
      await p2.waitForTimeout(300);
      const workoutsHtmlInfo = await p2.evaluate(() => {
        const sec = document.querySelector('#workouts');
        return {
          inputs: Array.from(sec.querySelectorAll('input, select')).map((el) => ({ id: el.id, type: el.type, placeholder: el.placeholder })),
          buttons: Array.from(sec.querySelectorAll('button')).map((b) => ({ id: b.id, text: b.innerText.trim() }))
        };
      });
      report.flows.workoutDom = workoutsHtmlInfo;
    } catch (e) {
      report.flows.workoutDom = { error: e.message };
    }

    // Flow D: Add habit
    try {
      flowErrors.length = 0;
      await p2.click('.sidebar-link[data-nav="reset"]');
      await p2.waitForTimeout(300);
      const habitDom = await p2.evaluate(() => {
        const sec = document.querySelector('#reset');
        return {
          inputs: Array.from(sec.querySelectorAll('input, select')).map((el) => ({ id: el.id, type: el.type, placeholder: el.placeholder })),
          buttons: Array.from(sec.querySelectorAll('button')).map((b) => ({ id: b.id, text: b.innerText.trim() }))
        };
      });
      report.flows.habitDom = habitDom;
    } catch (e) {
      report.flows.habitDom = { error: e.message };
    }

    // Flow E: Log weight
    try {
      flowErrors.length = 0;
      await p2.click('.sidebar-link[data-nav="progress"]');
      await p2.waitForTimeout(300);
      const weightDom = await p2.evaluate(() => {
        const sec = document.querySelector('#progress');
        return {
          inputs: Array.from(sec.querySelectorAll('input, select')).map((el) => ({ id: el.id, type: el.type, placeholder: el.placeholder })),
          buttons: Array.from(sec.querySelectorAll('button')).map((b) => ({ id: b.id, text: b.innerText.trim() }))
        };
      });
      report.flows.weightDom = weightDom;
    } catch (e) {
      report.flows.weightDom = { error: e.message };
    }

    // Flow F: Export backup -> clear -> import backup
    try {
      flowErrors.length = 0;
      await p2.click('.sidebar-link[data-nav="settings"]');
      await p2.waitForTimeout(300);
      const settingsDom = await p2.evaluate(() => {
        const sec = document.querySelector('#settings');
        return {
          inputs: Array.from(sec.querySelectorAll('input')).map((el) => ({ id: el.id, type: el.type })),
          buttons: Array.from(sec.querySelectorAll('button')).map((b) => ({ id: b.id, text: b.innerText.trim() }))
        };
      });
      report.flows.settingsDom = settingsDom;
    } catch (e) {
      report.flows.settingsDom = { error: e.message };
    }

    // =========================================================
    // 5. PWA & OFFLINE CHECK
    // =========================================================
    try {
      await p2.reload({ waitUntil: 'networkidle' });
      await p2.waitForTimeout(1000);
      const swInfo = await p2.evaluate(async () => {
        const manifestLink = document.querySelector('link[rel="manifest"]')?.getAttribute('href') || null;
        let manifestStatus = null;
        let manifestJson = null;
        if (manifestLink) {
          const res = await fetch(manifestLink);
          manifestStatus = res.status;
          manifestJson = await res.json().catch(() => null);
        }
        const regs = await navigator.serviceWorker.getRegistrations();
        return {
          manifestLink,
          manifestStatus,
          manifestJson,
          swCount: regs.length,
          swStates: regs.map((r) => ({
            scope: r.scope,
            active: r.active?.state || null,
            waiting: r.waiting?.state || null,
            installing: r.installing?.state || null
          })),
          controller: Boolean(navigator.serviceWorker.controller)
        };
      });

      // Check icon fetches
      const assetChecks = await p2.evaluate(async () => {
        const urls = ['icons/icon-192.png', 'icons/icon-512.png', 'favicon.svg'];
        const out = {};
        for (const u of urls) {
          try {
            const r = await fetch(u);
            out[u] = { status: r.status, type: r.headers.get('content-type') };
          } catch (e) {
            out[u] = { error: e.message };
          }
        }
        return out;
      });

      // Offline test
      await ctx2.setOffline(true);
      let offlineResult = null;
      try {
        await p2.reload({ waitUntil: 'domcontentloaded', timeout: 8000 });
        await p2.waitForTimeout(500);
        offlineResult = await p2.evaluate(() => ({
          loaded: true,
          title: document.title,
          hasAppShell: Boolean(document.querySelector('#appShell')),
          pageTitle: document.querySelector('#pageTitle')?.textContent?.trim() || ''
        }));
      } catch (e) {
        offlineResult = { loaded: false, error: e.message };
      }

      report.pwa = { swInfo, assetChecks, offlineResult };
    } catch (e) {
      report.pwa = { error: e.message };
    }

    await ctx2.close();
  } finally {
    await browser.close();
  }

  const reportPath = path.join(OUT_DIR, 'protomacro-audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const mobileOverflows = report.mobileDark.filter((r) => r.hOverflowDiff > 0).map((r) => `${r.route}:+${r.hOverflowDiff}`);
  console.log(JSON.stringify({
    reportPath,
    desktopRoutes: report.desktopDark.length,
    mobileRoutes: report.mobileDark.length,
    mobileOverflows,
    consoleErrors: report.allConsoleErrors.length,
    pageErrors: report.allPageErrors.length
  }));
  console.log('AUDIT_DONE');
  if (report.allConsoleErrors.length > 0 || report.allPageErrors.length > 0 || mobileOverflows.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
