// Staff rendering with VexFlow 4 (low-level API, no EasyScore).
// Notes are { letter, acc, octave, duration, rest } from theory.js.
(function (root) {
    'use strict';

    const TICKS = { '8': 1, 'q': 2, 'h': 4, 'w': 8 };
    const TICKS_PER_BAR = 8;
    const ACC_KEY = { '-2': 'bb', '-1': 'b', '0': '', '1': '#', '2': '##' };

    function getVF() {
        if (typeof Vex !== 'undefined' && Vex.Flow) return Vex.Flow;
        if (typeof VexFlow !== 'undefined') return VexFlow;
        return null;
    }

    // Split into bars; a note that would cross a barline is pushed to the next bar,
    // and short bars are filled with rests.
    function toBars(notes) {
        const bars = [];
        let bar = [], ticks = 0;
        for (const n of notes) {
            const t = TICKS[n.duration || '8'];
            if (ticks + t > TICKS_PER_BAR) { bars.push(fillBar(bar, ticks)); bar = []; ticks = 0; }
            bar.push(n);
            ticks += t;
            if (ticks === TICKS_PER_BAR) { bars.push(bar); bar = []; ticks = 0; }
        }
        if (bar.length) bars.push(fillBar(bar, ticks));
        return bars;
    }

    function fillBar(bar, ticks) {
        let need = TICKS_PER_BAR - ticks;
        const out = bar.slice();
        // Rests that respect the beat: eighth to reach a beat, then quarters/halves.
        if (need > 0 && ticks % 2 === 1) { out.push({ rest: true, duration: '8' }); need--; }
        while (need > 0) {
            const pos = TICKS_PER_BAR - need;
            if (need >= 4 && pos % 4 === 0) { out.push({ rest: true, duration: 'h' }); need -= 4; }
            else { out.push({ rest: true, duration: 'q' }); need -= 2; }
        }
        return out;
    }

    function makeStaveNote(VF, n, index) {
        const dur = (n.duration || '8') + (n.rest ? 'r' : '');
        const key = n.rest ? 'b/4' : n.letter.toLowerCase() + ACC_KEY[n.acc] + '/' + n.octave;
        const sn = new VF.StaveNote({ keys: [key], duration: dur, auto_stem: !n.rest });
        sn.__index = index;
        return sn;
    }

    // Renders into container. Returns an array mapping note index -> SVG element
    // (rests included) so playback can highlight the current note.
    function render(container, notes) {
        container.innerHTML = '';
        const VF = getVF();
        if (!VF) {
            container.textContent = 'Notation library failed to load. Check your connection and reload.';
            return [];
        }
        if (!notes.length) return [];

        const bars = toBars(notes);
        const width = Math.max(300, container.clientWidth || 800);
        const CLEF_EXTRA = 70;
        const MIN_BAR_W = 190;
        const perLine = Math.max(1, Math.min(4, Math.floor((width - CLEF_EXTRA - 10) / MIN_BAR_W)));
        const lines = Math.ceil(bars.length / perLine);
        const LINE_H = 110;
        const height = 30 + lines * LINE_H;

        const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
        renderer.resize(width, height);
        const ctx = renderer.getContext();

        const elements = [];
        let idx = 0;
        const usable = width - 10;
        const barW = Math.floor((usable - CLEF_EXTRA) / perLine);

        bars.forEach((bar, b) => {
            const line = Math.floor(b / perLine);
            const pos = b % perLine;
            const first = pos === 0;
            const x = 5 + (first ? 0 : CLEF_EXTRA + pos * barW);
            const w = first ? barW + CLEF_EXTRA : barW;
            const stave = new VF.Stave(x, 10 + line * LINE_H, w);
            if (first) stave.addClef('treble');
            if (b === 0) stave.addTimeSignature('4/4');
            if (b === bars.length - 1) stave.setEndBarType(VF.Barline.type.END);
            stave.setContext(ctx).draw();

            const staveNotes = bar.map(n => {
                // Rests that fill a bar aren't part of the exercise sequence.
                const isFiller = !notes.includes(n);
                return makeStaveNote(VF, n, isFiller ? -1 : idx++);
            });
            const voice = new VF.Voice({ num_beats: 4, beat_value: 4 }).setStrict(false);
            voice.addTickables(staveNotes);
            // Accidentals per bar, as a reader expects (naturals cancel earlier ones).
            VF.Accidental.applyAccidentals([voice], 'C');
            const beams = VF.Beam.generateBeams(staveNotes, { groups: [new VF.Fraction(1, 4)] });
            new VF.Formatter().joinVoices([voice]).format([voice], w - (stave.getNoteStartX() - x) - 15);
            voice.draw(ctx, stave);
            beams.forEach(bm => bm.setContext(ctx).draw());
            staveNotes.forEach(sn => {
                if (sn.__index >= 0) elements[sn.__index] = sn.getSVGElement ? sn.getSVGElement() : null;
            });
        });
        const svg = container.querySelector('svg');
        if (svg) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Exercise notation'); }
        return elements;
    }

    root.Notation = { render, toBars };
})(typeof self !== 'undefined' ? self : this);
