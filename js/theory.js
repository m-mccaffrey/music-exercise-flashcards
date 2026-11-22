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
        'melodic-cells':   { name: 'Melodic Cells (Random)', tertian: true }
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
    function cellDegrees(pattern, len, direction, progression) {
        const p = PATTERNS[pattern];
        const fwd = p.fwd || p.shape;
        const bwd = p.bwd || fwd.slice().reverse();
        const span = Math.max(...fwd);
        const alternating = direction.endsWith('-alt');
        const forwardFirst = direction === 'forward-backward-alt';
        const out = [];
        for (let i = 0; i < len; i++) {
            // Chordal cells descend through chord roots (7th chord .. tonic chord);
            // runs/intervals descend so each cell's top note walks down from the octave.
            const base = progression === 'up' ? i : p.chordal ? len - 1 - i : (len - i) - span;
            let isFwd;
            if (alternating) isFwd = (i % 2 === 0) === forwardFirst;
            else isFwd = direction === 'forward';
            for (const off of (isFwd ? fwd : bwd)) out.push(base + off);
        }
        const tonic = progression === 'up' ? len : 0;
        return { degrees: out, tonic };
    }

    // Returns an array of notes (with durations) ready to render and play.
    function generateExercise(rootName, scaleType, pattern, direction, progression, rng) {
        rng = rng || Math.random;
        const scale = buildScale(rootName, scaleType);
        if (pattern === 'melodic-cells') return fitRange(generateMelodicCellLine(scale, rng));
        let degrees, tonic = null;
        if (pattern === 'scale') {
            degrees = fullScaleDegrees(scale.len, direction);
        } else {
            ({ degrees, tonic } = cellDegrees(pattern, scale.len, direction, progression));
        }
        const notes = degrees.map(k => Object.assign(scale.degree(k), { duration: '8' }));
        // Resolve to the tonic with a held note.
        if (tonic !== null) {
            const last = degrees[degrees.length - 1];
            if (mod(last, scale.len) === 0 && Math.abs(last - tonic) <= scale.len) notes[notes.length - 1].duration = 'q';
            else notes.push(Object.assign(scale.degree(tonic), { duration: 'q' }));
        } else {
            notes[notes.length - 1].duration = 'q';
        }
        return fitRange(notes);
    }

    // Shift a whole line by octaves so it sits within the guitar's comfortable written
    // range (E3..D6, i.e. 22 frets) when possible.
    const LOW = 52, HIGH = 86;
    function fitRange(notes) {
        const midis = notes.filter(n => !n.rest).map(toMidi);
        const lo = Math.min(...midis), hi = Math.max(...midis);
        let shift = 0;
        while (hi + 12 * shift > HIGH && lo + 12 * (shift - 1) >= LOW) shift--;
        while (lo + 12 * shift < LOW && hi + 12 * (shift + 1) <= HIGH) shift++;
        if (shift) notes.forEach(n => { if (!n.rest) n.octave += shift; });
        return notes;
    }

    // ---------- Melodic cells ----------
    // Randomly stitches 1-2 beat cells (scale steps, diatonic thirds, chromatic
    // approach tones) so that a chord tone (1/3/5/7) lands on every downbeat, then
    // resolves to the root. Leading rests pad it to whole 4/4 bars.
    function spellApproach(targetMidi, targetLetter, fromBelow) {
        const midi = fromBelow ? targetMidi - 1 : targetMidi + 1;
        const neighbour = shiftLetter(targetLetter, fromBelow ? -1 : 1);
        const n = spellWithLetter(midi, neighbour);
        if (n && Math.abs(n.acc) <= 1) return n;
        return spellWithLetter(midi, targetLetter);
    }

    function generateMelodicCellLine(scale, rng) {
        const len = scale.len;
        const isChordTone = (k) => { const d = mod(k, len); return d % 2 === 0 && d <= 6; };
        const lo = -2, hi = len + 5; // keep the line within roughly a 9th either side of the root
        const inRange = (k) => k >= lo && k <= hi;

        function stepCell(start, beats, dir, stride) {
            const notes = [];
            for (let t = 0; t < beats * 2; t++) {
                const k = start + t * dir * stride;
                if (!inRange(k)) return null;
                if (t % 2 === 0 && !isChordTone(k)) return null;
                notes.push(scale.degree(k));
            }
            const land = start + beats * 2 * dir * stride;
            if (!inRange(land) || !isChordTone(land)) return null;
            return { notes, land };
        }

        function chromaticCell(start, dir) {
            const land = start + 2 * dir;
            if (!inRange(land) || !isChordTone(land)) return null;
            const target = scale.degree(land);
            const approach = spellApproach(toMidi(target), target.letter, dir > 0);
            if (Math.abs(toMidi(approach) - toMidi(scale.degree(start))) < 1) return null;
            return { notes: [scale.degree(start), approach], land };
        }

        function randomCell(start) {
            const makers = [];
            for (const dir of [1, -1]) {
                for (const beats of [1, 2]) {
                    makers.push(() => stepCell(start, beats, dir, 1));
                    makers.push(() => stepCell(start, beats, dir, 2));
                }
                makers.push(() => chromaticCell(start, dir));
            }
            for (let i = makers.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                [makers[i], makers[j]] = [makers[j], makers[i]];
            }
            for (const make of makers) { const c = make(); if (c) return c; }
            return null;
        }

        const chordDegrees = [0, 2, 4, 6];
        let k = chordDegrees[Math.floor(rng() * chordDegrees.length)];
        const line = [];
        let beats = 0;
        while (beats < 16) {
            const cell = randomCell(k);
            if (!cell) break;
            line.push(...cell.notes);
            beats += cell.notes.length / 2;
            k = cell.land;
            if (beats >= 6 && mod(k, len) === 0) break;
        }
        // Walk home to a root: down by chord-tone thirds, or a 7th resolving up by step.
        const notes = line.map(n => Object.assign(n, { duration: '8' }));
        let guard = 0;
        while (mod(k, len) !== 0 && guard++ < 8) {
            if (mod(k, len) === 6) {
                notes.push(Object.assign(scale.degree(k), { duration: 'q' }));
                beats += 1;
                k += 1;
                break;
            }
            const cell = stepCell(k, 1, -1, 1) || chromaticCell(k, -1);
            if (!cell) break;
            notes.push(...cell.notes.map(n => Object.assign(n, { duration: '8' })));
            beats += 1;
            k = cell.land;
        }
        notes.push(Object.assign(scale.degree(k), { duration: 'q' }));
        let pad = mod(4 - mod(beats + 1, 4), 4);
        const rests = [];
        if (pad >= 2) { rests.push({ rest: true, duration: 'h' }); pad -= 2; }
        if (pad >= 1) rests.push({ rest: true, duration: 'q' });
        return rests.concat(notes);
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
                  patterns: ['melodic-cells'], directions: ['forward'], progressions: ['up'] },
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
        return {
            root, scale,
            pattern: pick(pool.patterns, rng),
            direction: pick(pool.directions, rng),
            progression: pick(pool.progressions, rng)
        };
    }

    function cardId(c) { return [c.root, c.scale, c.pattern, c.direction, c.progression].join('|'); }

    // Describe a line as scale degrees grouped by beat, e.g. "↑1 3 · 5 7 · ↓6 #5 · 5".
    // Chromatic notes are shown relative to the scale degree with the same letter
    // (so a C# in C major is "#1"); an arrow marks every change of direction.
    function describeDegrees(notes, rootName, scaleType) {
        const scale = buildScale(rootName, scaleType);
        const rootLetter = scale.notes[0].letter;
        const degreeOf = (n) => {
            const step = mod(LETTERS.indexOf(n.letter) - LETTERS.indexOf(rootLetter), 7);
            const ref = scale.notes.find(s => s.letter === n.letter);
            const diff = ref ? n.acc - ref.acc : 0;
            return (diff > 0 ? '#'.repeat(diff) : 'b'.repeat(-diff)) + (step + 1);
        };
        const TICKS = { '8': 1, 'q': 2, 'h': 4 };
        const beats = [];
        let tick = 0, prev = null, dir = 0, beat = [];
        for (const n of notes) {
            if (n.rest) { tick += TICKS[n.duration]; continue; }
            const m = toMidi(n);
            let label = degreeOf(n);
            if (prev !== null && m !== prev) {
                const d = m > prev ? 1 : -1;
                if (d !== dir) label = (d > 0 ? '↑' : '↓') + label;
                dir = d;
            }
            prev = m;
            beat.push(label);
            tick += TICKS[n.duration || '8'];
            if (tick % 2 === 0) { beats.push(beat.join(' ')); beat = []; }
        }
        if (beat.length) beats.push(beat.join(' '));
        return beats.join(' · ');
    }

    return {
        describeDegrees,
        LETTERS, SCALES, PATTERNS, DIRECTIONS, PROGRESSIONS, LEVELS, PITCH_CLASSES, NATURAL_KEYS,
        noteName, toMidi, parseFormula, isTertian, patternAllowed, bestRootName, pitchClassOf,
        buildScale, generateExercise, drawCard, cardId, mod
    };
});
