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

    // Rhythm consistency: every gap between consecutive correct notes, divided by the
    // written length of the earlier note, should be equal. Score from the coefficient
    // of variation (std / mean) of those normalised gaps; tempo itself doesn't matter.
    function rhythmScore(take) {
        const gaps = [];
        for (let i = 1; i < take.hits.length; i++) {
            gaps.push((take.hits[i].time - take.hits[i - 1].time) / take.targets[i - 1].ticks);
        }
        if (gaps.length < 2) return { score: gaps.length ? 100 : 0, cv: 0, beatMs: gaps[0] || 0 };
        const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) * (g - mean), 0) / gaps.length);
        const cv = mean > 0 ? sd / mean : 1;
        // cv 0 -> 100, cv 0.3 or worse -> 0
        const score = Math.max(0, Math.min(100, Math.round(100 * (1 - cv / 0.3))));
        return { score, cv, beatMs: mean * 2 };
    }

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
            cv: rhythm.cv,
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

    return { targetsFrom, createTake, noteOn, noteOff, rhythmScore, accuracyScore, result, exerciseKey, recording, addTake };
});
