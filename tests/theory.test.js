const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/theory.js');

const names = (notes) => notes.filter(n => !n.rest).map(n => T.noteName(n) + n.octave);
const pcs = (notes) => notes.filter(n => !n.rest).map(n => T.noteName(n));

// Deterministic RNG for reproducible tests.
function seeded(seed) {
    return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

test('scales are spelled with one letter per degree', () => {
    assert.deepEqual(T.buildScale('F', 'major').notes.map(T.noteName), ['F', 'G', 'A', 'Bb', 'C', 'D', 'E']);
    assert.deepEqual(T.buildScale('Eb', 'major').notes.map(T.noteName), ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D']);
    assert.deepEqual(T.buildScale('C', 'altered').notes.map(T.noteName), ['C', 'Db', 'Eb', 'Fb', 'Gb', 'Ab', 'Bb']);
    assert.deepEqual(T.buildScale('F#', 'major').notes.map(T.noteName), ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']);
});

test('every 7-note scale in every key is spelled with each letter once and correct pitches', () => {
    for (const scale of Object.keys(T.SCALES)) {
        const formula = T.parseFormula(T.SCALES[scale].formula);
        for (let pc = 0; pc < 12; pc++) {
            const root = T.bestRootName(pc, scale);
            const s = T.buildScale(root, scale);
            assert.equal(T.pitchClassOf(root), pc);
            s.notes.forEach((n, i) => {
                assert.ok(n, `${root} ${scale} degree ${i} spelled`);
                assert.equal(T.toMidi(n) - T.toMidi(s.notes[0]), formula[i].semis, `${root} ${scale} degree ${i}`);
            });
            if (s.len === 7) assert.equal(new Set(s.notes.map(n => n.letter)).size, 7);
        }
    }
});

test('preferred root spelling avoids needless sharps', () => {
    assert.equal(T.bestRootName(10, 'major'), 'Bb');
    assert.equal(T.bestRootName(3, 'major'), 'Eb');
    assert.equal(T.bestRootName(1, 'aeolian'), 'C#');
    assert.equal(T.bestRootName(8, 'major'), 'Ab');
});

test('bebop and pentatonic scales were removed', () => {
    for (const s of ['bebop-dominant', 'bebop-major', 'pentatonic-major', 'pentatonic-minor']) {
        assert.equal(T.SCALES[s], undefined);
    }
});

test('tertian patterns are disallowed on non-7-note scales', () => {
    for (const s of ['diminished-wh', 'diminished-hw', 'whole-tone', 'blues']) {
        for (const p of ['thirds', 'fourths', 'triads', 'chords', 'arpeggios', 'pivot-arpeggios', 'melodic-cells']) {
            assert.equal(T.patternAllowed(p, s), false, `${p} on ${s}`);
        }
        assert.equal(T.patternAllowed('4-note', s), true);
    }
});

test('full C major scale, forward and alternating', () => {
    assert.deepEqual(names(T.generateExercise('C', 'major', 'scale', 'forward', 'up')),
        ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']);
    assert.deepEqual(names(T.generateExercise('C', 'major', 'scale', 'forward-backward-alt', 'up')),
        ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4']);
});

test('thirds up resolve to the octave; thirds down resolve to the root', () => {
    assert.deepEqual(names(T.generateExercise('C', 'major', 'thirds', 'forward', 'up')),
        ['C4', 'E4', 'D4', 'F4', 'E4', 'G4', 'F4', 'A4', 'G4', 'B4', 'A4', 'C5', 'B4', 'D5', 'C5']);
    assert.deepEqual(names(T.generateExercise('C', 'major', 'thirds', 'backward', 'down')),
        ['C5', 'A4', 'B4', 'G4', 'A4', 'F4', 'G4', 'E4', 'F4', 'D4', 'E4', 'C4', 'D4', 'B3', 'C4']);
});

test('3-note groups, alternating, up', () => {
    assert.deepEqual(names(T.generateExercise('C', 'major', '3-note', 'forward-backward-alt', 'up')).slice(0, 9),
        ['C4', 'D4', 'E4', 'F4', 'E4', 'D4', 'E4', 'F4', 'G4']);
});

test('seventh chords and pivot arpeggios', () => {
    assert.deepEqual(names(T.generateExercise('C', 'major', 'chords', 'forward', 'up')).slice(0, 8),
        ['C4', 'E4', 'G4', 'B4', 'D4', 'F4', 'A4', 'C5']);
    assert.deepEqual(names(T.generateExercise('C', 'major', 'pivot-arpeggios', 'forward', 'up')).slice(0, 4),
        ['C5', 'E4', 'G4', 'B4']);
    assert.deepEqual(names(T.generateExercise('C', 'major', 'pivot-arpeggios', 'backward', 'up')).slice(0, 4),
        ['C4', 'B4', 'G4', 'E4']);
});

test('every exercise ends on the tonic', () => {
    const rng = seeded(7);
    for (const level of Object.keys(T.LEVELS)) {
        for (let i = 0; i < 300; i++) {
            const c = T.drawCard(level, rng);
            const approach = ['none', 'approach', 'enclosure'][i % 3];
            const notes = T.generateExercise(c.root, c.scale, c.pattern, c.direction, c.progression, { cell: c.cell, approach });
            const last = notes[notes.length - 1];
            assert.equal(T.noteName(last), T.noteName(T.buildScale(c.root, c.scale).notes[0]), JSON.stringify(c));
        }
    }
});

test('exercises stay in a guitar-friendly written range (E3..E6)', () => {
    const rng = seeded(11);
    for (let i = 0; i < 2000; i++) {
        const c = T.drawCard(i % 2 ? 'pro' : 'hard', rng);
        for (const n of T.generateExercise(c.root, c.scale, c.pattern, c.direction, c.progression, { cell: c.cell, approach: i % 3 ? 'enclosure' : 'none' })) {
            if (n.rest) continue;
            const m = T.toMidi(n);
            assert.ok(m >= 52 && m <= 88, `${T.noteName(n)}${n.octave} in ${JSON.stringify(c)}`);
        }
    }
});

test('random cells follow the cell rules', () => {
    const rng = seeded(3);
    for (let i = 0; i < 2000; i++) {
        const cell = T.randomCell(rng);
        assert.ok(cell.length >= 2 && cell.length <= 4, String(cell));
        assert.ok(T.cellOk(cell), String(cell));
        assert.ok(cell.every(st => st !== 0));
        const offs = T.cellOffsets(cell);
        assert.notEqual(Math.abs(offs[offs.length - 1]), 1, 'cell must not end a step from its start: ' + cell);
    }
    assert.equal(T.describeCell([2, -1, 3]), '↑3 ↓2 ↑4');
});

test('melodic cells are sequenced through the scale', () => {
    const notes = T.generateExercise('C', 'major', 'melodic-cells', 'forward', 'up', { cell: [2, -1, 3] });
    assert.deepEqual(names(notes).slice(0, 8), ['C4', 'E4', 'D4', 'G4', 'D4', 'F4', 'E4', 'A4']);
    assert.equal(names(notes).at(-1), 'C5');
    const back = T.generateExercise('C', 'major', 'melodic-cells', 'backward', 'up', { cell: [2, -1, 3] });
    assert.deepEqual(names(back).slice(0, 4), ['G4', 'D4', 'E4', 'C4']);
});

test('approach tones follow the Barry Harris rule', () => {
    // C major thirds, up. Target C: B is in the scale, so use D above. Target D: C# isn't, so C#.
    const a = names(T.generateExercise('C', 'major', 'thirds', 'forward', 'up', { approach: 'approach' }));
    assert.deepEqual(a.slice(0, 6), ['D4', 'C4', 'E4', 'C#4', 'D4', 'F4']);
    // Target F: E is in the scale -> G above.
    assert.deepEqual(a.slice(9, 12), ['G4', 'F4', 'A4']);
    // Enclosures: target D -> E above, C# below; target C (B in scale) -> Db above, B below.
    const e = names(T.generateExercise('C', 'major', 'thirds', 'forward', 'up', { approach: 'enclosure' }));
    assert.deepEqual(e.slice(0, 4), ['Db4', 'B3', 'C4', 'E4']);
    assert.deepEqual(e.slice(4, 8), ['E4', 'C#4', 'D4', 'F4']);
    // Approach spelled from the letter below where possible (Eb major, target F: E natural).
    const f = names(T.generateExercise('Eb', 'major', 'thirds', 'forward', 'up', { approach: 'approach' }));
    assert.deepEqual(f.slice(3, 5), ['E4', 'F4']);
});

test('levels only draw from their allowed material', () => {
    const rng = seeded(5);
    for (let i = 0; i < 500; i++) {
        const e = T.drawCard('easy', rng);
        assert.equal(e.scale, 'major');
        assert.ok(['scale', 'thirds', 'fourths', 'fifths'].includes(e.pattern));
        if (e.pattern !== 'scale') assert.equal(e.root, 'C');
        const m = T.drawCard('medium', rng);
        assert.equal(m.scale, 'major');
        assert.ok(T.NATURAL_KEYS.includes(m.root));
        const h = T.drawCard('hard', rng);
        assert.equal(T.SCALES[h.scale].family, 'major-modes');
        const p = T.drawCard('pro', rng);
        assert.ok(T.patternAllowed(p.pattern, p.scale));
    }
});
