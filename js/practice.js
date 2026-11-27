// MIDI practice: take tracking and scoring. Pure logic, no DOM or MIDI APIs.
// Works as window.Practice in the browser and as a Node module for tests.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Practice = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const TICKS = { '8': 1, 'q': 2, 'h': 4, 'w': 8 };

    // Expected targets from an exercise: one per non-rest note, with its index in
    // the full note list (for highlighting) and its length in eighth-note ticks.
    function targetsFrom(notes, toMidi) {
        const out = [];
        notes.forEach((n, i) => {
            if (!n.rest) out.push({ index: i, midi: toMidi(n), ticks: TICKS[n.duration || '8'] });
        });
        return out;
    }

    // A take consumes MIDI note-ons in order. A wrong note counts as a mistake and
    // does not advance; the player must find the right note to move on.
    function createTake(targets, opts) {
        return {
            targets,
            ignoreOctave: !!(opts && opts.ignoreOctave),
            pos: 0,
            wrong: 0,
            hits: [],      // { time, midi } for each correct note, in order
            events: [],    // every note-on/off: { type, midi, velocity, time }
            done: false
        };
    }

    function matches(take, expected, midi) {
        return take.ignoreOctave ? ((expected - midi) % 12 + 12) % 12 === 0 : expected === midi;
    }

    // Returns 'correct' | 'wrong' | 'ignored'.
    function noteOn(take, midi, velocity, time) {
        take.events.push({ type: 'on', midi, velocity, time });
        if (take.done) return 'ignored';
        const t = take.targets[take.pos];
        if (matches(take, t.midi, midi)) {
            take.hits.push({ time, midi });
            take.pos++;
            if (take.pos >= take.targets.length) take.done = true;
            return 'correct';
        }
        take.wrong++;
        return 'wrong';
    }

    function noteOff(take, midi, time) {
        take.events.push({ type: 'off', midi, velocity: 0, time });
    }

    // Rhythm consistency, calibrated like the rhythm trainer: errors are judged in
    // milliseconds, with a linear falloff to 0 at 300 ms.
    // Each gap between consecutive correct notes is divided by the written length of
    // the earlier note and compared with the median gap (your own tempo, whatever it
    // is). The error for a note is how far its gap is from the median, in ms.
    // A take must be connected: if any gap is off by more than half a gap AND by more
    // than 130 ms (a pause, a stumble or a rush), timing is broken and evenness is 0,
    // so a broken take can't score more than 50 overall.
    const TOLERANCE_MS = 300;
    const GOOD_MS = 60, OK_MS = 130; // per-note colours, as in the rhythm trainer
    function median(xs) {
        const a = xs.slice().sort((x, y) => x - y);
        const m = Math.floor(a.length / 2);
        return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    }

    function rhythmScore(take) {
        const gaps = [];
        for (let i = 1; i < take.hits.length; i++) {
            gaps.push((take.hits[i].time - take.hits[i - 1].time) / take.targets[i - 1].ticks);
        }
        if (gaps.length < 2) return { score: gaps.length ? 100 : 0, hesitations: 0, beatMs: gaps[0] || 0, errorsMs: [] };
        const med = median(gaps);
        let total = 0, hesitations = 0;
        // errorsMs[i] is the timing error of correct note i (the first note has none).
        const errorsMs = [0];
        gaps.forEach((g, i) => {
            const err = Math.abs(g - med) * take.targets[i].ticks;
            errorsMs.push(err);
            total += Math.max(0, 1 - err / TOLERANCE_MS);
            if (err > OK_MS && Math.abs(g - med) > 0.5 * med) hesitations++;
        });
        const score = hesitations ? 0 : Math.round(100 * total / gaps.length);
        return { score, hesitations, broken: hesitations > 0, beatMs: med * 2, errorsMs };
    }

    function timingGrade(errMs) { return errMs < GOOD_MS ? 'good' : errMs < OK_MS ? 'ok' : 'bad'; }

    function accuracyScore(take) {
        const correct = take.hits.length;
        const attempts = correct + take.wrong;
        return attempts ? Math.round(100 * correct / attempts) : 0;
    }

    function result(take) {
        const rhythm = rhythmScore(take);
        const accuracy = accuracyScore(take);
        return {
            accuracy,
            rhythm: rhythm.score,
            hesitations: rhythm.hesitations,
            broken: !!rhythm.broken,
            errorsMs: rhythm.errorsMs,
            bpm: rhythm.beatMs > 0 ? Math.round(60000 / rhythm.beatMs) : 0,
            wrong: take.wrong,
            score: Math.round((accuracy + rhythm.score) / 2)
        };
    }

    // ---------- History storage (per exercise) ----------
    const MAX_HISTORY = 100;

    // Exercise key: the card fields plus the notes themselves (melodic cells are random,
    // so the same card can produce different lines).
    function exerciseKey(card, targets) {
        return [card.root, card.scale, card.pattern, card.direction, card.progression].join('|') +
            '|' + targets.map(t => t.midi).join(',');
    }

    // Recorded events are stored relative to the first note-on.
    function recording(take) {
        const first = take.events.find(e => e.type === 'on');
        const t0 = first ? first.time : 0;
        return take.events.map(e => [e.type === 'on' ? 1 : 0, e.midi, e.velocity, Math.round(e.time - t0)]);
    }

    // Adds a finished take to a record; returns { record, isBest }.
    function addTake(record, take, now) {
        record = record || { takes: [], best: null };
        const r = result(take);
        record.takes.push({ at: now, score: r.score, accuracy: r.accuracy, rhythm: r.rhythm, bpm: r.bpm });
        if (record.takes.length > MAX_HISTORY) record.takes = record.takes.slice(-MAX_HISTORY);
        const isBest = !record.best || r.score > record.best.score;
        if (isBest) record.best = { at: now, score: r.score, accuracy: r.accuracy, rhythm: r.rhythm, bpm: r.bpm, events: recording(take) };
        return { record, isBest, result: r };
    }

    return { timingGrade, targetsFrom, createTake, noteOn, noteOff, rhythmScore, accuracyScore, result, exerciseKey, recording, addTake };
});
