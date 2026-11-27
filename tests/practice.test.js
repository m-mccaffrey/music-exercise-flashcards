const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/theory.js');
const P = require('../js/practice.js');

const cMajor = () => T.generateExercise('C', 'major', 'scale', 'forward', 'up');
const play = (take, midis, gapMs, jitter) => {
    let t = 1000;
    midis.forEach((m, i) => { P.noteOn(take, m, 90, t); t += gapMs + (jitter ? jitter(i) : 0); });
};

test('targets skip rests and keep note indexes', () => {
    const notes = [{ rest: true, duration: 'q' }, ...cMajor()];
    const targets = P.targetsFrom(notes, T.toMidi);
    assert.equal(targets.length, 8);
    assert.equal(targets[0].index, 1);
    assert.equal(targets[0].midi, 60);
    assert.equal(targets[7].ticks, 2);
});

test('perfectly even take at any tempo scores 100', () => {
    for (const gap of [150, 400, 900]) {
        const take = P.createTake(P.targetsFrom(cMajor(), T.toMidi));
        play(take, [60, 62, 64, 65, 67, 69, 71, 72], gap);
        assert.ok(take.done);
        const r = P.result(take);
        assert.equal(r.accuracy, 100);
        assert.equal(r.rhythm, 100);
        assert.equal(r.score, 100);
        assert.equal(r.bpm, Math.round(60000 / (gap * 2)));
    }
});

test('uneven timing lowers the rhythm score', () => {
    const take = P.createTake(P.targetsFrom(cMajor(), T.toMidi));
    play(take, [60, 62, 64, 65, 67, 69, 71, 72], 300, i => (i % 2 ? 30 : -30));
    const r = P.result(take);
    assert.ok(r.rhythm < 100 && r.rhythm > 0, String(r.rhythm));
});

test('wrong notes count against accuracy and do not advance', () => {
    const take = P.createTake(P.targetsFrom(cMajor(), T.toMidi));
    assert.equal(P.noteOn(take, 60, 80, 0), 'correct');
    assert.equal(P.noteOn(take, 63, 80, 200), 'wrong');
    assert.equal(take.pos, 1);
    assert.equal(P.noteOn(take, 62, 80, 250), 'correct');
    assert.equal(P.accuracyScore(take), 67);
});

test('ignore-octave mode accepts any octave', () => {
    const strict = P.createTake(P.targetsFrom(cMajor(), T.toMidi));
    assert.equal(P.noteOn(strict, 48, 80, 0), 'wrong');
    const loose = P.createTake(P.targetsFrom(cMajor(), T.toMidi), { ignoreOctave: true });
    assert.equal(P.noteOn(loose, 48, 80, 0), 'correct');
});

test('longer written notes are normalised (quarter = two eighths)', () => {
    const notes = T.generateExercise('C', 'major', 'thirds', 'forward', 'up'); // ends with a quarter
    const targets = P.targetsFrom(notes, T.toMidi);
    const take = P.createTake(targets);
    play(take, targets.map(t => t.midi), 250);
    assert.equal(P.result(take).rhythm, 100);
});

test('history keeps every take and the best recording', () => {
    let record = null;
    const card = { root: 'C', scale: 'major', pattern: 'scale', direction: 'forward', progression: 'up' };
    const targets = P.targetsFrom(cMajor(), T.toMidi);
    const sloppy = P.createTake(targets);
    play(sloppy, [60, 62, 64, 65, 67, 69, 71, 72], 300, i => (i % 2 ? 80 : -80));
    let out = P.addTake(record, sloppy, 1);
    assert.ok(out.isBest);
    record = out.record;
    const clean = P.createTake(targets);
    play(clean, [60, 62, 64, 65, 67, 69, 71, 72], 300);
    P.noteOff(clean, 72, 3500);
    out = P.addTake(record, clean, 2);
    assert.ok(out.isBest);
    assert.equal(out.record.takes.length, 2);
    assert.equal(out.record.best.score, 100);
    assert.deepEqual(out.record.best.events[0], [1, 60, 90, 0]);
    assert.equal(out.record.best.events.length, 9);
    const worse = P.createTake(targets);
    play(worse, [60, 61, 62, 64, 65, 67, 69, 71, 72], 300);
    assert.equal(P.addTake(out.record, worse, 3).isBest, false);
    assert.ok(P.exerciseKey(card, targets).endsWith('60,62,64,65,67,69,71,72'));
});

test('one hesitation only costs its own share of evenness', () => {
    const targets = P.targetsFrom(T.generateExercise('D', 'dorian', 'triads', 'forward', 'up'), T.toMidi);
    const take = P.createTake(targets);
    play(take, targets.map(t => t.midi), 250, i => (i === 10 ? 950 : 0));
    const r = P.result(take);
    assert.equal(r.hesitations, 1);
    assert.ok(r.rhythm >= 90, String(r.rhythm));
    assert.equal(r.bpm, 120);
    assert.equal(P.timingGrade(r.errorsMs[11]), 'bad');
    assert.equal(P.timingGrade(r.errorsMs[5]), 'good');
});

test('timing errors are judged in milliseconds', () => {
    const targets = P.targetsFrom(T.generateExercise('C', 'major', 'thirds', 'forward', 'up'), T.toMidi);
    const take = P.createTake(targets);
    play(take, targets.map(t => t.midi), 250, i => (i % 2 ? 15 : -15)); // gaps alternate 235/265 ms
    const r = P.result(take);
    assert.ok(r.rhythm >= 93 && r.rhythm <= 97, String(r.rhythm)); // ~15 ms off per gap
    assert.ok(r.errorsMs.slice(1).every(e => P.timingGrade(e) === 'good'));
});
