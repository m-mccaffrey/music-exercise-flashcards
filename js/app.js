(function () {
    'use strict';
    const T = window.Theory;
    const $ = (id) => document.getElementById(id);

    // ---------- Persistent settings ----------
    const STORE_KEY = 'mef-settings-v1';
    function loadSettings() {
        try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
    }
    function saveSettings() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(state.settings)); } catch (e) { /* ignore */ }
    }

    const state = {
        settings: Object.assign({ mode: 'auto', level: 'easy', tempo: 80, loop: false,
            manual: { pc: 0, scale: 'major', pattern: 'scale', direction: 'forward', progression: 'up' } },
            loadSettings()),
        card: null,
        notes: [],
        noteEls: [],
        lastCardId: null
    };

    // ---------- Manual-mode controls ----------
    const FAMILY_LABELS = {
        'major-modes': 'Major scale modes', 'melodic-minor': 'Melodic minor modes',
        'harmonic': 'Harmonic minor / major', 'ethnic': 'Ethnic', 'symmetric': 'Symmetric & blues'
    };

    function fillSelect(sel, entries) {
        sel.innerHTML = '';
        for (const [value, text] of entries) {
            const o = document.createElement('option');
            o.value = value; o.textContent = text;
            sel.appendChild(o);
        }
    }

    function buildManualControls() {
        fillSelect($('key'), T.PITCH_CLASSES.map((n, i) => [i, n.replace('/', ' / ')]));
        const scaleSel = $('scale');
        scaleSel.innerHTML = '';
        for (const fam of Object.keys(FAMILY_LABELS)) {
            const g = document.createElement('optgroup');
            g.label = FAMILY_LABELS[fam];
            for (const [id, s] of Object.entries(T.SCALES)) {
                if (s.family !== fam) continue;
                const o = document.createElement('option');
                o.value = id; o.textContent = s.name;
                g.appendChild(o);
            }
            scaleSel.appendChild(g);
        }
        fillSelect($('pattern'), Object.entries(T.PATTERNS).map(([k, p]) => [k, p.name]));
        fillSelect($('direction'), Object.entries(T.DIRECTIONS));
        fillSelect($('progression'), Object.entries(T.PROGRESSIONS));
    }

    function syncManualControls() {
        const m = state.settings.manual;
        $('key').value = m.pc;
        $('scale').value = m.scale;
        for (const o of $('pattern').options) o.disabled = !T.patternAllowed(o.value, m.scale);
        if (!T.patternAllowed(m.pattern, m.scale)) m.pattern = 'scale';
        $('pattern').value = m.pattern;
        $('direction').value = m.direction;
        $('progression').value = m.progression;
        const noProg = m.pattern === 'scale' || m.pattern === 'melodic-cells';
        $('progression').disabled = noProg;
        $('direction').disabled = m.pattern === 'melodic-cells';
    }

    function manualCard() {
        const m = state.settings.manual;
        return { root: T.bestRootName(+m.pc, m.scale), scale: m.scale, pattern: m.pattern,
            direction: m.direction, progression: m.progression };
    }

    // ---------- Mode / level ----------
    function applyMode() {
        const mode = state.settings.mode;
        document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
        $('auto-panel').hidden = mode !== 'auto';
        $('manual-panel').hidden = mode !== 'manual';
        $('next').innerHTML = (mode === 'auto' ? 'Next card' : 'Regenerate') + ' <kbd>Space</kbd>';
        document.querySelectorAll('[data-level]').forEach(b => {
            b.setAttribute('role', 'radio');
            b.setAttribute('aria-checked', String(b.dataset.level === state.settings.level));
        });
        $('level-description').textContent = T.LEVELS[state.settings.level].description;
    }

    // ---------- Cards ----------
    function nextCard() {
        let card;
        if (state.settings.mode === 'manual') {
            card = manualCard();
        } else {
            for (let tries = 0; tries < 10; tries++) {
                card = T.drawCard(state.settings.level);
                if (T.cardId(card) !== state.lastCardId) break;
            }
        }
        state.lastCardId = T.cardId(card);
        showCard(card);
    }

    function showCard(card) {
        stopPlayback();
        state.card = card;
        state.notes = T.generateExercise(card.root, card.scale, card.pattern, card.direction, card.progression);
        const scale = T.SCALES[card.scale];
        $('card-title').textContent = card.root + ' ' + scale.name;
        const spelled = T.buildScale(card.root, card.scale).notes.map(T.noteName);
        $('card-formula').textContent = scale.formula + '   ·   ' + spelled.join(' ');
        const tags = [T.PATTERNS[card.pattern].name];
        if (card.pattern !== 'melodic-cells') tags.push(T.DIRECTIONS[card.direction]);
        if (card.pattern !== 'scale' && card.pattern !== 'melodic-cells') tags.push('Progression: ' + T.PROGRESSIONS[card.progression]);
        const lineEl = $('card-line');
        lineEl.hidden = card.pattern !== 'melodic-cells';
        if (!lineEl.hidden) {
            lineEl.innerHTML = '<span class="muted">Degrees</span>';
            lineEl.appendChild(document.createTextNode(T.describeDegrees(state.notes, card.root, card.scale)));
        }
        $('card-tags').innerHTML = '';
        for (const t of tags) {
            const s = document.createElement('span');
            s.className = 'tag'; s.textContent = t;
            $('card-tags').appendChild(s);
        }
        $('notes-text').textContent = state.notes.map(n => n.rest ? '–' : T.noteName(n) + n.octave).join(' ');
        renderNotation();
        renderFretboard(card, spelled);
        resetPractice();
    }

    function renderNotation() {
        try {
            state.noteEls = window.Notation.render($('notation'), state.notes);
            paintTake();
        } catch (err) {
            state.noteEls = [];
            $('notation').textContent = 'Could not draw notation: ' + (err && err.message ? err.message : err);
            console.error(err);
        }
    }

    // ---------- Fretboard (whole neck, scale tones highlighted) ----------
    const STRINGS = [ // high E on top, like tab
        { label: 'e', pc: 4 }, { label: 'B', pc: 11 }, { label: 'G', pc: 7 },
        { label: 'D', pc: 2 }, { label: 'A', pc: 9 }, { label: 'E', pc: 4 }
    ];
    const FRETS = 15;

    function renderFretboard(card, spelled) {
        const fb = $('fretboard');
        fb.innerHTML = '';
        const byPc = {};
        T.buildScale(card.root, card.scale).notes.forEach((n, i) => { byPc[T.mod(T.toMidi(n), 12)] = spelled[i]; });
        const rootPc = T.pitchClassOf(card.root);
        for (const s of STRINGS) {
            const row = document.createElement('div');
            row.className = 'fb-row';
            row.innerHTML = '<span class="lbl">' + s.label + '</span>';
            for (let f = 0; f <= FRETS; f++) {
                const cell = document.createElement('div');
                cell.className = 'fb-cell' + (f === 0 ? ' nut' : '');
                const pc = (s.pc + f) % 12;
                if (byPc[pc]) {
                    const dot = document.createElement('span');
                    dot.className = 'fb-dot' + (pc === rootPc ? ' root' : '');
                    dot.textContent = byPc[pc];
                    cell.appendChild(dot);
                }
                row.appendChild(cell);
            }
            fb.appendChild(row);
        }
        const nums = document.createElement('div');
        nums.className = 'fb-row fb-nums';
        nums.innerHTML = '<span></span>';
        for (let f = 0; f <= FRETS; f++) {
            const c = document.createElement('div');
            c.className = 'fb-cell';
            c.textContent = [0, 3, 5, 7, 9, 12, 15].includes(f) ? f : '';
            nums.appendChild(c);
        }
        fb.appendChild(nums);
    }

    // ---------- Playback: look-ahead scheduling on the audio clock ----------
    const TICKS = { '8': 1, 'q': 2, 'h': 4, 'w': 8 };
    let audioCtx = null;
    const play = { active: false, index: 0, nextTime: 0, timer: null, raf: null, queue: [] };

    function secondsPerTick() { return 60 / state.settings.tempo / 2; }

    function scheduleNote(n, time, dur) {
        if (!n.rest) synth(T.toMidi(n), time, dur);
    }

    function ensureAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    function synth(midi, time, dur, level) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(level || 0.35, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.05, dur * 0.92));
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(time);
        osc.stop(time + dur);
        return osc;
    }

    function scheduler() {
        const horizon = audioCtx.currentTime + 0.12;
        while (play.active && play.nextTime < horizon) {
            if (play.index >= state.notes.length) {
                if (!state.settings.loop) {
                    play.queue.push({ time: play.nextTime, index: -1, end: true });
                    play.active = false;
                    break;
                }
                play.index = 0;
                play.nextTime += secondsPerTick() * 2; // one beat breath between loops
            }
            const n = state.notes[play.index];
            const dur = TICKS[n.duration || '8'] * secondsPerTick();
            scheduleNote(n, play.nextTime, dur);
            play.queue.push({ time: play.nextTime, index: play.index });
            play.nextTime += dur;
            play.index++;
        }
        if (play.active) play.timer = setTimeout(scheduler, 25);
    }

    let highlighted = null;
    function highlight(index) {
        if (highlighted) highlighted.classList.remove('playing');
        highlighted = index >= 0 ? state.noteEls[index] : null;
        if (highlighted) highlighted.classList.add('playing');
    }

    function drawLoop() {
        const now = audioCtx.currentTime;
        while (play.queue.length && play.queue[0].time <= now) {
            const ev = play.queue.shift();
            if (ev.end) { stopPlayback(); return; }
            highlight(ev.index);
        }
        play.raf = requestAnimationFrame(drawLoop);
    }

    function startPlayback() {
        if (play.active || play.raf) { stopPlayback(); return; }
        if (!state.notes.length) return;
        stopBest();
        ensureAudio();
        Object.assign(play, { active: true, index: 0, nextTime: audioCtx.currentTime + 0.08, queue: [] });
        $('play').innerHTML = '■ Stop <kbd>P</kbd>';
        scheduler();
        drawLoop();
    }

    function stopPlayback() {
        play.active = false;
        clearTimeout(play.timer);
        if (play.raf) cancelAnimationFrame(play.raf);
        play.raf = null;
        play.queue = [];
        highlight(-1);
        $('play').innerHTML = '▶ Play <kbd>P</kbd>';
    }

    // ---------- MIDI practice ----------
    const P = window.Practice;
    const TAKES_KEY = 'mef-takes-v1';
    const prac = { targets: [], key: null, take: null, takeNo: 0, missTimer: null, bestTimers: [], bestOscs: [] };

    function loadTakes() {
        try { return JSON.parse(localStorage.getItem(TAKES_KEY)) || {}; } catch (e) { return {}; }
    }
    function saveRecord(key, record) {
        const all = loadTakes();
        all[key] = record;
        try { localStorage.setItem(TAKES_KEY, JSON.stringify(all)); } catch (e) { /* storage full or blocked */ }
    }
    function currentRecord() { return loadTakes()[prac.key] || null; }

    function resetPractice() {
        stopBest();
        prac.targets = P.targetsFrom(state.notes, T.toMidi);
        prac.key = P.exerciseKey(state.card, prac.targets);
        prac.take = null;
        const rec = currentRecord();
        prac.takeNo = rec ? rec.takes.length : 0;
        $('take-status').textContent = 'Play the first note to start a take.';
        showScores(null, rec);
        paintTake();
    }

    function newTake() {
        stopPlayback();
        stopBest();
        prac.take = P.createTake(prac.targets, { ignoreOctave: $('any-octave').checked });
        prac.takeNo++;
        updateTakeStatus();
        paintTake();
    }

    function updateTakeStatus() {
        const t = prac.take;
        if (!t) return;
        $('take-status').textContent = 'Take ' + prac.takeNo + ': ' + t.pos + ' / ' + t.targets.length + ' notes' +
            (t.wrong ? ', ' + t.wrong + ' wrong' : '');
    }

    function setClass(index, cls, on) {
        const el = state.noteEls[index];
        if (el) el.classList.toggle(cls, on);
    }

    function paintTake() {
        const t = prac.take;
        prac.targets.forEach((tg, i) => {
            setClass(tg.index, 'hit', !!t && i < t.pos);
            setClass(tg.index, 'next', !!t && !t.done && i === t.pos);
            setClass(tg.index, 'miss', false);
        });
    }

    function flashMiss(index) {
        setClass(index, 'miss', true);
        clearTimeout(prac.missTimer);
        prac.missTimer = setTimeout(() => setClass(index, 'miss', false), 250);
    }

    function onMidiNoteOn(midi, velocity, time) {
        if (!prac.targets.length) return;
        if (!prac.take || prac.take.done) newTake();
        const t = prac.take;
        const expected = t.targets[t.pos];
        const res = P.noteOn(t, midi, velocity, time);
        if (res === 'wrong') flashMiss(expected.index);
        paintTake();
        updateTakeStatus();
        if (t.done) finishTake();
    }

    function onMidiNoteOff(midi, time) {
        if (prac.take) P.noteOff(prac.take, midi, time);
    }

    function finishTake() {
        const t = prac.take;
        // Give the last note a moment to release so the recording includes its length.
        setTimeout(() => {
            const out = P.addTake(currentRecord(), t, Date.now());
            saveRecord(prac.key, out.record);
            const r = out.result;
            $('take-status').textContent = 'Take ' + prac.takeNo + ' done' + (out.isBest ? ' — new best!' : '') +
                ' Play again for another take.';
            showScores(r, out.record);
        }, 600);
    }

    function showScores(r, rec) {
        $('s-score').textContent = r ? r.score : '–';
        $('s-accuracy').textContent = r ? r.accuracy + '%' : '–';
        $('s-rhythm').textContent = r ? r.rhythm + '%' : '–';
        $('s-bpm').textContent = r && r.bpm ? r.bpm + ' bpm' : '–';
        $('s-best').textContent = rec && rec.best ? rec.best.score : '–';
        $('play-best').disabled = !(rec && rec.best && rec.best.events.length);
        const bars = $('history-bars');
        bars.innerHTML = '';
        const takes = rec ? rec.takes : [];
        $('take-count').textContent = takes.length ? takes.length + (takes.length === 1 ? ' take' : ' takes') : 'none yet';
        const bestAt = rec && rec.best ? rec.best.at : null;
        for (const tk of takes) {
            const b = document.createElement('div');
            b.className = 'bar' + (tk.at === bestAt ? ' best' : '');
            b.style.height = Math.max(2, tk.score) + '%';
            b.title = 'Score ' + tk.score + ' (notes ' + tk.accuracy + '%, evenness ' + tk.rhythm + '%)';
            bars.appendChild(b);
        }
    }

    function playBest() {
        if (prac.bestTimers.length) { stopBest(); return; }
        const rec = currentRecord();
        if (!rec || !rec.best) return;
        stopPlayback();
        ensureAudio();
        const start = audioCtx.currentTime + 0.1;
        const ev = rec.best.events; // [on(1)/off(0), midi, velocity, ms]
        let endMs = 0;
        ev.forEach((e, i) => {
            if (e[0] !== 1) return;
            let off = ev.slice(i + 1).find(o => o[1] === e[1]);
            const durMs = off ? off[3] - e[3] : 400;
            prac.bestOscs.push(synth(e[1], start + e[3] / 1000, Math.max(0.08, durMs / 1000), 0.1 + 0.3 * (e[2] / 127)));
            endMs = Math.max(endMs, e[3] + durMs);
        });
        $('play-best').innerHTML = '■ Stop <kbd>B</kbd>';
        prac.bestTimers.push(setTimeout(stopBest, endMs + 200));
    }

    function stopBest() {
        prac.bestTimers.forEach(clearTimeout);
        prac.bestTimers = [];
        prac.bestOscs.forEach(o => { try { o.stop(); } catch (e) { /* already stopped */ } });
        prac.bestOscs = [];
        $('play-best').innerHTML = '▶ Play best take <kbd>B</kbd>';
    }

    let midiAccess = null;
    function handleMidiMessage(e) {
        const [status, d1, d2] = e.data;
        const cmd = status & 0xf0;
        const time = e.timeStamp || performance.now();
        if (cmd === 0x90 && d2 > 0) onMidiNoteOn(d1, d2, time);
        else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) onMidiNoteOff(d1, time);
    }
    function refreshMidiInputs() {
        const names = [];
        midiAccess.inputs.forEach(input => { input.onmidimessage = handleMidiMessage; names.push(input.name); });
        $('midi-status').textContent = names.length ? 'Listening to: ' + names.join(', ') : 'No MIDI input found. Plug one in.';
        $('midi-enable').hidden = names.length > 0;
    }
    function enableMidi(fromUser) {
        if (!navigator.requestMIDIAccess) {
            if (fromUser) $('midi-status').textContent = 'This browser has no Web MIDI support (try Chrome or Edge).';
            return;
        }
        navigator.requestMIDIAccess().then(access => {
            midiAccess = access;
            access.onstatechange = refreshMidiInputs;
            refreshMidiInputs();
            state.settings.midi = true; saveSettings();
        }, () => {
            if (fromUser) $('midi-status').textContent = 'MIDI access was blocked. Allow it in the browser’s site settings.';
        });
    }

    // ---------- Wiring ----------
    function init() {
        buildManualControls();
        $('tempo').value = state.settings.tempo;
        $('tempo-value').textContent = state.settings.tempo;
        $('loop').checked = state.settings.loop;
        applyMode();
        syncManualControls();

        document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
            state.settings.mode = b.dataset.mode; saveSettings(); applyMode(); nextCard();
        }));
        document.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => {
            state.settings.level = b.dataset.level; saveSettings(); applyMode(); nextCard();
        }));
        for (const id of ['key', 'scale', 'pattern', 'direction', 'progression']) {
            $(id).addEventListener('change', () => {
                state.settings.manual[id === 'key' ? 'pc' : id] = $(id).value;
                syncManualControls(); saveSettings(); nextCard();
            });
        }
        $('random').addEventListener('click', () => {
            const c = T.drawCard('pro');
            const m = state.settings.manual;
            Object.assign(m, { pc: T.pitchClassOf(c.root), scale: c.scale, pattern: c.pattern,
                direction: c.direction, progression: c.progression });
            syncManualControls(); saveSettings(); nextCard();
        });
        $('next').addEventListener('click', nextCard);
        $('midi-enable').addEventListener('click', () => enableMidi(true));
        $('new-take').addEventListener('click', newTake);
        $('play-best').addEventListener('click', playBest);
        $('any-octave').checked = state.settings.anyOctave !== false;
        $('any-octave').addEventListener('change', () => {
            state.settings.anyOctave = $('any-octave').checked; saveSettings();
            if (prac.take) prac.take.ignoreOctave = state.settings.anyOctave;
        });
        if (state.settings.midi) enableMidi(false);
        $('play').addEventListener('click', startPlayback);
        $('tempo').addEventListener('input', () => {
            state.settings.tempo = +$('tempo').value;
            $('tempo-value').textContent = state.settings.tempo;
            saveSettings();
        });
        $('loop').addEventListener('change', () => { state.settings.loop = $('loop').checked; saveSettings(); });

        document.addEventListener('keydown', (e) => {
            const tag = e.target.tagName;
            if (tag === 'SELECT' || tag === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === ' ' || e.key === 'n') { e.preventDefault(); nextCard(); }
            else if (e.key === 'p') startPlayback();
            else if (e.key === 't') newTake();
            else if (e.key === 'b') playBest();
        });

        let resizeTimer;
        let lastWidth = $('notation').clientWidth;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                const w = $('notation').clientWidth;
                if (w !== lastWidth) { lastWidth = w; stopPlayback(); renderNotation(); }
            }, 150);
        });

        nextCard();
    }

    init();
})();
