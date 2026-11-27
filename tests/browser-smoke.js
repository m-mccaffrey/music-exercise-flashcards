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
    // Fake Web MIDI device the test can play.
    await page.addInitScript(() => {
        const listeners = [];
        const input = { name: 'Test Keyboard', state: 'connected', addEventListener: (t, f) => listeners.push(f),
            open: () => Promise.resolve(), onmidimessage: (e) => listeners.forEach(f => f(Object.assign({ target: input }, e))) };
        window.__midiInput = input;
        navigator.requestMIDIAccess = () => Promise.resolve({ inputs: new Map([['t', input]]), onstatechange: null });
    });
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

    // MIDI practice: play the current card evenly with one wrong note, then a clean take.
    await page.click('[data-mode="auto"]');
    await page.click('[data-level="easy"]');
    await page.click('#midi-enable');
    const playTake = (withMistake) => page.evaluate(async (withMistake) => {
        const toks = document.getElementById('notes-text').textContent.split(' ').filter(t => t !== '–');
        const midis = toks.map(t => {
            const m = t.match(/^([A-G])(bb|b|##|#)?(-?\d+)$/);
            return Theory.toMidi({ letter: m[1], acc: { bb: -2, b: -1, '#': 1, '##': 2 }[m[2]] || 0, octave: +m[3] });
        });
        let t = performance.now();
        const send = (data, ts) => window.__midiInput.onmidimessage({ data, timeStamp: ts });
        midis.forEach((m, i) => {
            if (withMistake && i === 2) send([0x90, m + 1, 80], t + 100);
            send([0x90, m, 90], t); send([0x80, m, 0], t + 200); t += 250;
        });
        await new Promise(r => setTimeout(r, 800));
        return {
            score: document.getElementById('s-score').textContent,
            acc: document.getElementById('s-accuracy').textContent,
            rhythm: document.getElementById('s-rhythm').textContent,
            best: document.getElementById('s-best').textContent,
            takes: document.querySelectorAll('#history-bars .bar').length,
            bestEnabled: !document.getElementById('play-best').disabled
        };
    }, withMistake);
    const first = await playTake(true);
    const second = await playTake(false);
    if (first.acc === '100%' || first.takes !== 1) errors.push('MIDI take 1 unexpected: ' + JSON.stringify(first));
    if (second.score !== '100' || second.rhythm !== '100%' || second.best !== '100' || second.takes !== 2 || !second.bestEnabled) {
        errors.push('MIDI take 2 unexpected: ' + JSON.stringify(second));
    }
    await page.click('#play-best');

    // Narrow screen re-layout.
    await page.setViewportSize({ width: 390, height: 800 });
    await page.waitForTimeout(400);
    await check('mobile');

    if (process.argv[2]) {
        await page.setViewportSize({ width: 1100, height: 900 });
        await page.waitForTimeout(300);
        await page.screenshot({ path: process.argv[2], fullPage: true });
    }
    await browser.close();
    if (errors.length) { console.error(errors.slice(0, 20).join('\n')); process.exit(1); }
    console.log('browser smoke test passed');
})();
