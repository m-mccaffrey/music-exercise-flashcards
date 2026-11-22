// Browser smoke test: loads index.html, draws many cards at every level and in
// manual mode, and fails on any page error or notation failure.
// Usage: node tests/browser-smoke.js [screenshot.png]
// Set VEXFLOW_PATH to a local vexflow.js to run without CDN access.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    if (process.env.VEXFLOW_PATH) {
        await page.route('https://cdn.jsdelivr.net/**', r =>
            r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(process.env.VEXFLOW_PATH) }));
    }
    await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));

    const check = async (label) => {
        const r = await page.evaluate(() => ({
            svg: !!document.querySelector('#notation svg'),
            text: document.getElementById('notation').textContent,
            title: document.getElementById('card-title').textContent
        }));
        if (!r.svg) errors.push(`${label} (${r.title}): no notation: ${r.text}`);
    };

    for (const level of ['easy', 'medium', 'hard', 'pro']) {
        await page.click(`[data-level="${level}"]`);
        for (let i = 0; i < 60; i++) { await page.click('#next'); await check(level); }
    }
    await page.click('[data-mode="manual"]');
    for (let i = 0; i < 60; i++) { await page.click('#random'); await check('manual'); }

    // Narrow screen re-layout.
    await page.setViewportSize({ width: 390, height: 800 });
    await page.waitForTimeout(400);
    await check('mobile');

    if (process.argv[2]) {
        await page.setViewportSize({ width: 1100, height: 900 });
        await page.click('[data-mode="auto"]');
        await page.click('[data-level="hard"]');
        await page.waitForTimeout(300);
        await page.screenshot({ path: process.argv[2], fullPage: true });
    }
    await browser.close();
    if (errors.length) { console.error(errors.slice(0, 20).join('\n')); process.exit(1); }
    console.log('browser smoke test passed');
})();
