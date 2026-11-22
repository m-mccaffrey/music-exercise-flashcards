// Music theory + exercise generation. Pure functions, no DOM.
// Works as a browser global (window.Theory) and as a Node module (for tests).
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Theory = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const ACC_TEXT = { '-2': 'bb', '-1': 'b', '0': '', '1': '#', '2': '##' };

    const mod = (n, m) => ((n % m) + m) % m;

    // ---------- Notes ----------
    // A note is { letter, acc, octave } using scientific pitch (octave follows the
    // letter, so Cb4 sounds as B3). Optional fields: duration ('8','q','h'), rest.

    function noteName(n) { return n.letter + ACC_TEXT[n.acc]; }

    function toMidi(n) { return 12 * (n.octave + 1) + LETTER_PC[n.letter] + n.acc; }

    function parseRoot(name) {
        const letter = name[0];
        const rest = name.slice(1);
        const acc = rest === '#' ? 1 : rest === 'b' ? -1 : 0;
        return { letter, acc };
    }

    // Spell a MIDI pitch using a given letter (returns null if it needs > 2 accidentals).
    function spellWithLetter(midi, letter) {
        const pc = mod(midi, 12);
        let acc = pc - LETTER_PC[letter];
        if (acc > 6) acc -= 12;
        if (acc < -6) acc += 12;
        if (Math.abs(acc) > 2) return null;
        const octave = Math.floor((midi - LETTER_PC[letter] - acc) / 12) - 1;
        return { letter, acc, octave };
    }

    function shiftLetter(letter, steps) {
        return LETTERS[mod(LETTERS.indexOf(letter) + steps, 7)];
    }

    // ---------- Scales ----------
    // Spelling comes from the degree formula: degree N always uses the Nth letter
    // above the root, so F major gets Bb (not A#) and C altered gets Fb.
    const SCALES = {
        'major':             { name: 'Major (Ionian)',            formula: '1 2 3 4 5 6 7',       family: 'major-modes' },
        'dorian':            { name: 'Dorian',                    formula: '1 2 b3 4 5 6 b7',     family: 'major-modes' },
        'phrygian':          { name: 'Phrygian',                  formula: '1 b2 b3 4 5 b6 b7',   family: 'major-modes' },
        'lydian':            { name: 'Lydian',                    formula: '1 2 3 #4 5 6 7',      family: 'major-modes' },
        'mixolydian':        { name: 'Mixolydian',                formula: '1 2 3 4 5 6 b7',      family: 'major-modes' },
        'aeolian':           { name: 'Aeolian (Natural Minor)',   formula: '1 2 b3 4 5 b6 b7',    family: 'major-modes' },
        'locrian':           { name: 'Locrian',                   formula: '1 b2 b3 4 b5 b6 b7',  family: 'major-modes' },
        'melodic-minor':     { name: 'Melodic Minor',             formula: '1 2 b3 4 5 6 7',      family: 'melodic-minor' },
        'dorian-b2':         { name: 'Dorian b2',                 formula: '1 b2 b3 4 5 6 b7',    family: 'melodic-minor' },
        'lydian-augmented':  { name: 'Lydian Augmented',          formula: '1 2 3 #4 #5 6 7',     family: 'melodic-minor' },
        'lydian-dominant':   { name: 'Lydian Dominant',           formula: '1 2 3 #4 5 6 b7',     family: 'melodic-minor' },
        'mixolydian-b6':     { name: 'Mixolydian b6',             formula: '1 2 3 4 5 b6 b7',     family: 'melodic-minor' },
        'locrian-nat2':      { name: 'Locrian ♮2',                formula: '1 2 b3 4 b5 b6 b7',   family: 'melodic-minor' },
        'altered':           { name: 'Altered (Super Locrian)',   formula: '1 b2 b3 b4 b5 b6 b7', family: 'melodic-minor' },
        'harmonic-minor':    { name: 'Harmonic Minor',            formula: '1 2 b3 4 5 b6 7',     family: 'harmonic' },
        'phrygian-dominant': { name: 'Phrygian Dominant',         formula: '1 b2 3 4 5 b6 b7',    family: 'harmonic' },
        'harmonic-major':    { name: 'Harmonic Major',            formula: '1 2 3 4 5 b6 7',      family: 'harmonic' },
        'double-harmonic':   { name: 'Double Harmonic (Byzantine)', formula: '1 b2 3 4 5 b6 7',   family: 'ethnic' },
        'hungarian-minor':   { name: 'Hungarian Minor',           formula: '1 2 b3 #4 5 b6 7',    family: 'ethnic' },
        'neapolitan-minor':  { name: 'Neapolitan Minor',          formula: '1 b2 b3 4 5 b6 7',    family: 'ethnic' },
        'neapolitan-major':  { name: 'Neapolitan Major',          formula: '1 b2 b3 4 5 6 7',     family: 'ethnic' },
        'persian':           { name: 'Persian',                   formula: '1 b2 3 4 b5 b6 7',    family: 'ethnic' },
        'diminished-wh':     { name: 'Diminished (Whole-Half)',   formula: '1 2 b3 4 b5 b6 6 7',  family: 'symmetric' },
        'diminished-hw':     { name: 'Diminished (Half-Whole)',   formula: '1 b2 b3 3 #4 5 6 b7', family: 'symmetric' },
        'whole-tone':        { name: 'Whole Tone',                formula: '1 2 3 #4 #5 b7',      family: 'symmetric' },
        'blues':             { name: 'Blues',                     formula: '1 b3 4 b5 5 b7',      family: 'symmetric' }
    };

    function parseFormula(formula) {
        return formula.split(' ').map(tok => {
            const m = tok.match(/^(bb|b|##|#|♮)?(\d+)$/);
            const acc = { bb: -2, b: -1, '##': 2, '#': 1 }[m[1]] || 0;
            const degree = parseInt(m[2], 10);
            return { letterStep: degree - 1, semis: [0, 2, 4, 5, 7, 9, 11][degree - 1] + acc };
        });
    }

    // Tertian = 7 notes, one per letter: thirds/chords/intervals/melodic cells make sense.
    function isTertian(scaleType) { return parseFormula(SCALES[scaleType].formula).length === 7; }

    const PITCH_CLASSES = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];
    const NATURAL_KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

    // Spell a scale (one octave, root at octave 0 reference) from a concrete root name.
    function spellScaleFromRoot(rootName, scaleType, rootOctave) {
        const root = parseRoot(rootName);
        const rootNote = { letter: root.letter, acc: root.acc, octave: rootOctave };
        const rootMidi = toMidi(rootNote);
        return parseFormula(SCALES[scaleType].formula).map(d =>
            spellWithLetter(rootMidi + d.semis, shiftLetter(root.letter, d.letterStep)));
    }

    function accidentalCost(notes) {
        if (notes.some(n => n === null)) return Infinity;
        return notes.reduce((s, n) => s + (Math.abs(n.acc) === 2 ? 10 : Math.abs(n.acc)), 0);
    }

    // Pick the enharmonic root spelling (e.g. Db vs C#) with the fewest accidentals.
    function bestRootName(pitchClass, scaleType) {
        const options = PITCH_CLASSES[pitchClass].split('/');
        let best = options[0], bestCost = Infinity;
        for (const opt of options) {
            const cost = accidentalCost(spellScaleFromRoot(opt, scaleType, 4)) + (opt.length > 1 ? 0.5 : 0);
            if (cost < bestCost) { bestCost = cost; best = opt; }
        }
        return best;
    }

    function pitchClassOf(rootName) {
        const r = parseRoot(rootName);
        return mod(LETTER_PC[r.letter] + r.acc, 12);
    }

    // Keep exercises comfortably on the treble staff: roots C..F# in octave 4, G..B in octave 3.
    function defaultRootOctave(rootName) { return 'GAB'.includes(rootName[0]) ? 3 : 4; }

    function buildScale(rootName, scaleType) {
        const octave = defaultRootOctave(rootName);
        const notes = spellScaleFromRoot(rootName, scaleType, octave);
        const len = notes.length;
        // degree(k): any integer scale degree, k = 0 is the root, k = len is the octave.
        const degree = (k) => {
            const n = notes[mod(k, len)];
            return { letter: n.letter, acc: n.acc, octave: n.octave + Math.floor(k / len) };
        };
        return { rootName, scaleType, notes, len, degree };
    }

    // ---------- Patterns ----------
    const PATTERNS = {
        'scale':           { name: 'Full Scale',            tertian: false },
        '3-note':          { name: '3-Note Groups',         tertian: false, shape: [0, 1, 2] },
        '4-note':          { name: '4-Note Groups',         tertian: false, shape: [0, 1, 2, 3] },
        '6-note':          { name: '6-Note Groups',         tertian: false, shape: [0, 1, 2, 3, 4, 5] },
        'thirds':          { name: 'Thirds',                tertian: true,  shape: [0, 2] },
        'fourths':         { name: 'Fourths',               tertian: true,  shape: [0, 3] },
        'fifths':          { name: 'Fifths',                tertian: true,  shape: [0, 4] },
        'sixths':          { name: 'Sixths',                tertian: true,  shape: [0, 5] },
        'sevenths':        { name: 'Sevenths',              tertian: true,  shape: [0, 6] },
        'triads':          { name: 'Triads',                tertian: true, chordal: true,  shape: [0, 2, 4] },
        'chords':          { name: 'Seventh Chords',        tertian: true, chordal: true,  shape: [0, 2, 4, 6] },
        'arpeggios':       { name: 'Arpeggios (1-3-5-8)',   tertian: true, chordal: true,  shape: [0, 2, 4, 7] },
        // Pivot: octave down to the 3rd then up through 5-7; reversed: root up to 7th, down to 3rd.
        'pivot-arpeggios': { name: 'Pivot Arpeggios',       tertian: true, chordal: true,  fwd: [7, 2, 4, 6], bwd: [0, 6, 4, 2] },
        'melodic-cells':   { name: 'Melodic Cell', tertian: true }
    };

    const DIRECTIONS = {
        'forward':              'Forward',
        'backward':             'Backward',
        'forward-backward-alt': 'Forward / Backward Alternating',
        'backward-forward-alt': 'Backward / Forward Alternating'
    };

    const PROGRESSIONS = { 'up': 'Up', 'down': 'Down' };

    function patternAllowed(pattern, scaleType) {
        return !PATTERNS[pattern].tertian || isTertian(scaleType);
    }

    // Full scale: forward = up an octave, backward = down, alternating = up+down / down+up.
    function fullScaleDegrees(len, direction) {
        const up = [], down = [];
        for (let k = 0; k <= len; k++) up.push(k);
        for (let k = len; k >= 0; k--) down.push(k);
        if (direction === 'forward') return up;
        if (direction === 'backward') return down;
        if (direction === 'forward-backward-alt') return up.concat(down.slice(1));
        return down.concat(up.slice(1));
    }

    // Cell patterns: one cell per scale degree. "Up" anchors each cell's lowest note on
    // degrees 0..len-1 and resolves to the octave. "Down" anchors runs/intervals by their
    // highest note on degrees len..1, and chordal cells on chord roots len-1..0; both
    // resolve to the root.
    function cellShapes(pattern, opts) {
        if (pattern === 'melodic-cells') {
            const fwd = cellOffsets(opts.cell);
            return { fwd, bwd: fwd.slice().reverse() };
        }
        const p = PATTERNS[pattern];
        const fwd = p.fwd || p.shape;
        return { fwd, bwd: p.bwd || fwd.slice().reverse(), chordal: !!p.chordal };
    }

    // Returns one degree list per cell, plus the tonic degree to resolve to.
    function cellDegrees(pattern, len, direction, progression, opts) {
        const { fwd, bwd, chordal } = cellShapes(pattern, opts);
        const span = Math.max(...fwd);
        const alternating = direction.endsWith('-alt');
        const forwardFirst = direction === 'forward-backward-alt';
        const cells = [];
        for (let i = 0; i < len; i++) {
            // Chordal cells descend through chord roots (7th chord .. tonic chord);
            // other cells descend so each cell's top note walks down from the octave.
            const base = progression === 'up' ? i : chordal ? len - 1 - i : (len - i) - span;
            const isFwd = alternating ? (i % 2 === 0) === forwardFirst : direction === 'forward';
            cells.push((isFwd ? fwd : bwd).map(off => base + off));
        }
        return { cells, tonic: progression === 'up' ? len : 0 };
    }

    // ---------- Approach tones (Barry Harris style) ----------
    // approach:  half step below the target, unless that pitch is already in the scale,
    //            in which case the scale tone above the target.
    // enclosure: scale tone above, then half step below; if the half step below is a
    //            scale tone, the chromatic half step above, then that scale tone below.
    function spellApproach(targetMidi, targetLetter, fromBelow) {
        const midi = fromBelow ? targetMidi - 1 : targetMidi + 1;
        const neighbour = shiftLetter(targetLetter, fromBelow ? -1 : 1);
        const n = spellWithLetter(midi, neighbour);
        if (n && Math.abs(n.acc) <= 1) return n;
        return spellWithLetter(midi, targetLetter);
    }

    function approachNotes(scale, k, kind) {
        const target = scale.degree(k);
        const tMidi = toMidi(target);
        const pcs = new Set(scale.notes.map(n => mod(toMidi(n), 12)));
        const belowInScale = pcs.has(mod(tMidi - 1, 12));
        const aboveInScale = pcs.has(mod(tMidi + 1, 12));
        const chromBelow = () => spellApproach(tMidi, target.letter, true);
        const chromAbove = () => spellApproach(tMidi, target.letter, false);
        if (kind === 'approach') return [belowInScale ? scale.degree(k + 1) : chromBelow()];
        if (kind === 'enclosure') {
            if (!belowInScale) return [scale.degree(k + 1), chromBelow()];
            if (!aboveInScale) return [chromAbove(), scale.degree(k - 1)];
            return [scale.degree(k + 1), scale.degree(k - 1)];
        }
        return [];
    }

    // Returns an array of notes (with durations) ready to render and play.
    // opts: { cell: interval list for melodic cells, approach: 'none'|'approach'|'enclosure' }
    function generateExercise(rootName, scaleType, pattern, direction, progression, opts) {
        opts = Object.assign({ approach: 'none' }, opts);
        if (pattern === 'melodic-cells' && !opts.cell) opts.cell = randomCell(Math.random);
        const scale = buildScale(rootName, scaleType);
        const asNote = (n) => Object.assign(n, { duration: '8' });
        let notes, tonic = null, lastDeg;
        if (pattern === 'scale') {
            const degrees = fullScaleDegrees(scale.len, direction);
            notes = degrees.map(k => asNote(scale.degree(k)));
            lastDeg = degrees[degrees.length - 1];
        } else {
            const res = cellDegrees(pattern, scale.len, direction, progression, opts);
            tonic = res.tonic;
            notes = [];
            for (const cell of res.cells) {
                if (opts.approach !== 'none') notes.push(...approachNotes(scale, cell[0], opts.approach).map(asNote));
                notes.push(...cell.map(k => asNote(scale.degree(k))));
            }
            const lastCell = res.cells[res.cells.length - 1];
            lastDeg = lastCell[lastCell.length - 1];
        }
        // Resolve to the tonic with a held note.
        if (tonic === null || lastDeg === tonic) {
            notes[notes.length - 1].duration = 'q';
        } else {
            if (opts.approach !== 'none') notes.push(...approachNotes(scale, tonic, opts.approach).map(asNote));
            notes.push(Object.assign(scale.degree(tonic), { duration: 'q' }));
        }
        return fitRange(notes);
    }

    // ---------- Melodic cells ----------
    // A cell is a short motif of diatonic intervals, given as signed scale steps
    // (+2 = up a third, -1 = down a second), sequenced through the scale like the
    // other patterns.
    function cellOffsets(cell) {
        const out = [0];
        for (const step of cell) out.push(out[out.length - 1] + step);
        return out;
    }

    function describeCell(cell) {
        return cell.map(st => (st > 0 ? '↑' : '↓') + (Math.abs(st) + 1)).join(' ');
    }

    // Rules: 2-4 intervals (2nd..6th, no unisons), stays within a 4th below / 6th
    // above the starting note, has at least one leap, never ends a step away from its
    // start (the next cell starts there, so that would repeat a note), and doesn't
    // immediately undo a leap.
    function cellOk(cell) {
        const offs = cellOffsets(cell);
        if (Math.min(...offs) < -3 || Math.max(...offs) > 5) return false;
        if (!cell.some(st => Math.abs(st) >= 2)) return false;
        const net = offs[offs.length - 1];
        if (Math.abs(net) === 1) return false;
        for (let i = 1; i < cell.length; i++) if (cell[i] === -cell[i - 1] && Math.abs(cell[i]) >= 2) return false;
        if (new Set(offs).size < offs.length - 1) return false; // mostly distinct notes
        return true;
    }

    function randomCell(rng) {
        rng = rng || Math.random;
        const SIZES = [1, 1, 1, 2, 2, 2, 3, 3, 4, 5]; // weight toward steps and thirds
        for (let tries = 0; tries < 500; tries++) {
            const n = 2 + Math.floor(rng() * 3);
            const cell = [];
            for (let i = 0; i < n; i++) cell.push(SIZES[Math.floor(rng() * SIZES.length)] * (rng() < 0.55 ? 1 : -1));
            if (cellOk(cell)) return cell;
        }
        return [2, -1, 2];
    }

    // Shift a whole line by octaves so it sits within the guitar's comfortable written
    // range (E3..E6, a 24-fret neck) when possible.
    const LOW = 52, HIGH = 88;
    function fitRange(notes) {
        const midis = notes.filter(n => !n.rest).map(toMidi);
        const lo = Math.min(...midis), hi = Math.max(...midis);
        let shift = 0;
        while (hi + 12 * shift > HIGH && lo + 12 * (shift - 1) >= LOW) shift--;
        while (lo + 12 * shift < LOW && hi + 12 * (shift + 1) <= HIGH) shift++;
        if (shift) notes.forEach(n => { if (!n.rest) n.octave += shift; });
        return notes;
    }

    // ---------- Difficulty levels (auto mode) ----------
    const ALL_KEYS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const MAJOR_MODES = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian'];
    const ALL_DIRS = Object.keys(DIRECTIONS);
    const RUNS = ['scale', '3-note', '4-note', '6-note'];
    const INTERVALS = ['thirds', 'fourths', 'fifths', 'sixths', 'sevenths'];
    const CHORDAL = ['triads', 'chords', 'arpeggios', 'pivot-arpeggios'];

    // Each level is a list of pools; a card picks a pool (by weight), then one
    // option from each field of that pool.
    const LEVELS = {
        easy: {
            name: 'Easy',
            description: 'Major scales in C, G, D and F; intervals in C major.',
            pools: [
                { weight: 2, keys: ['C', 'G', 'D', 'F'], scales: ['major'], patterns: ['scale'],
                  directions: ['forward', 'forward-backward-alt'], progressions: ['up'] },
                { weight: 1, keys: ['C'], scales: ['major'], patterns: ['thirds', 'fourths', 'fifths'],
                  directions: ['forward'], progressions: ['up'] }
            ]
        },
        medium: {
            name: 'Medium',
            description: 'Major scales on every natural root: runs, groups and all intervals.',
            pools: [
                { weight: 1, keys: NATURAL_KEYS, scales: ['major'], patterns: RUNS.concat(INTERVALS),
                  directions: ALL_DIRS, progressions: ['up', 'down'] }
            ]
        },
        hard: {
            name: 'Hard',
            description: 'Every major-scale mode in all 12 keys, including triads and arpeggios.',
            pools: [
                { weight: 1, keys: ALL_KEYS, scales: MAJOR_MODES, patterns: RUNS.concat(INTERVALS, CHORDAL),
                  directions: ALL_DIRS, progressions: ['up', 'down'] }
            ]
        },
        pro: {
            name: 'Pro',
            description: 'Melodic & harmonic minor modes, ethnic and symmetric scales, random melodic cells.',
            pools: [
                { weight: 3, keys: ALL_KEYS,
                  scales: Object.keys(SCALES).filter(s => isTertian(s)),
                  patterns: RUNS.concat(INTERVALS, CHORDAL), directions: ALL_DIRS, progressions: ['up', 'down'] },
                { weight: 2, keys: ALL_KEYS,
                  scales: Object.keys(SCALES).filter(s => isTertian(s)),
                  patterns: ['melodic-cells'], directions: ALL_DIRS, progressions: ['up', 'down'] },
                { weight: 1, keys: ALL_KEYS, scales: Object.keys(SCALES).filter(s => !isTertian(s)),
                  patterns: RUNS, directions: ALL_DIRS, progressions: ['up', 'down'] }
            ]
        }
    };

    function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

    // Returns { root, scale, pattern, direction, progression }. `key` entries are either
    // pitch-class numbers (spelled per scale) or explicit root names.
    function drawCard(level, rng) {
        rng = rng || Math.random;
        const pools = LEVELS[level].pools;
        const total = pools.reduce((s, p) => s + p.weight, 0);
        let r = rng() * total, pool = pools[0];
        for (const p of pools) { if ((r -= p.weight) < 0) { pool = p; break; } }
        const scale = pick(pool.scales, rng);
        const key = pick(pool.keys, rng);
        const root = typeof key === 'number' ? bestRootName(key, scale) : key;
        const card = {
            root, scale,
            pattern: pick(pool.patterns, rng),
            direction: pick(pool.directions, rng),
            progression: pick(pool.progressions, rng)
        };
        if (card.pattern === 'melodic-cells') card.cell = randomCell(rng);
        return card;
    }

    function cardId(c) { return [c.root, c.scale, c.pattern, c.direction, c.progression, (c.cell || []).join(',')].join('|'); }

    return {
        describeCell, randomCell, cellOk, cellOffsets,
        LETTERS, SCALES, PATTERNS, DIRECTIONS, PROGRESSIONS, LEVELS, PITCH_CLASSES, NATURAL_KEYS,
        noteName, toMidi, parseFormula, isTertian, patternAllowed, bestRootName, pitchClassOf,
        buildScale, generateExercise, drawCard, cardId, mod
    };
});
