(function () {
    'use strict';

    const { score, parseTiles, tileName } = window.MCR;

    // state
    const state = {
        melds : [], // {type:'chow'|'pung'|'kong', tile, concealed}
        hand : [], // concealed tiles, without the winning tile
        win: null,
        mode: 'hand', // hand | win | chow | pung | kong | concealedKong
        selfDrawn: false,
        prevalent: 0,
        seat: 0,
        flowers: 0,
        lastTile: false,
        lastOfWall: false,
        replacement: false,
        robbing: false,
        msg: '',
    };

    const MODES = [
        ['hand', 'Hand tile'],
        ['win', 'Winning tile'],
        ['chow', 'Chow'],
        ['pung', 'Pung'],
        ['kong', 'Kong'],
        ['concealedKong', 'Concealed kong'],
    ];

    const EXAMPLES = [
        { name: 'Chicken Hand (8 fan)', melds: [['chow', '2m'], ['chow', '3p'], ['chow', '6s']], hand: '45m77z', win: '6m'},
        { name: 'Pure Straight', hand: '123456789m77p88s', win: '8s'},
        { name: 'Big Three Dragons', melds: [['pung', '5z'], ['pung', '6z'], ['pung', '7z']], hand: '23m55p', win: '4m'},
        { name: 'Four Concealed Pungs', hand: '111m222p333s444z5m', win: '5m', selfDrawn: true},
        { name: 'Seven Shifted Pairs', hand: '1122334455667m', win: '7m', selfDrawn: true},
        { name: 'Nine Gates', hand: '1112345678999m', win: '4m', selfDrawn: true},
        { name: 'Thirteen Orphans', hand: '19m19p19s1234567z', win: '5z'},
        { name: 'Knitted Straight', hand: '147m258p369s234m5z', win: '5z'},
        { name: 'Four Kongs', melds: [['kong', '1m'], ['kong', '5p'], ['kong', '6s'], ['kong', '2z']], hand: '7z', win: '7z'},

    ];

    const $ = (sel) => document.querySelector(sel);
    const WIND_NAMES = ['East', 'South', 'West', 'North'];
    const cap = () => 13 - 3 * state.melds.length; // maximum hand size
    const renderers= []; //everything that draws the page

    // tiles
    function glyph(i) { // chinese characters to go with tiles
        if (i < 27) return [String((i % 9) + 1), ['萬', '筒', '索'][Math.floor(i / 9)]];
        return [['東', '南', '西', '北', '中', '發', ''][i - 27], ''];
    }

    function tileClass(i) {
        if (i < 27) return 's-' + 'mps'[Math.floor(i / 9)];
        if (i < 31) return 'wind';
        return ['d-r', 'd-g', 'd-w'][i - 31];
    }

    function tileEl(i, tag, opts) { // box with real tiles
        opts = opts || {};
        const el = document.createElement(tag || 'span');
        el.className = 'tile ' + tileClass(i) + (opts.back ? ' back' : '');
        if (tag === 'button') el.type = 'button';
        el.setAttribute('aria-label', tileName(i));
        el.title = tileName(i);
        const g = glyph(i);
        const top = document.createElement('span');
        top.className = 't-top';
        top.textContent = g[0];
        el.appendChild(top);
        if (g[1]) {
            const bot = document.createElement('span');
            bot.className = 't-bot';
            bot.textContent = g[1];
            el.appendChild(bot);
        }
        return el;
    }

    function usage() { // how many tile are already used
        const u = new Array(34).fill(0);
        for (const m of state.melds) {
            if (m.type === 'chow') {
                u[m.tile]++; u[m.tile + 1]++; u[m.tile + 2]++;
            }   
            else {
                u[m.tile] += m.type === 'kong' ? 4 : 3;
            }
        }
        state.hand.forEach((t) => u[t]++);
        if (state.win !== null) u[state.win]++;
        return u;
    }

    // actions
    function pick(i) { // when clicking tile depending on the mode (adding or removing or adding to meld)
        const u = usage();
        state.msg = '';
        const mode = state.mode;
        if (mode === 'hand') {
            if (state.hand.length >= cap()) {
                state.msg = 'The hand is full. Choose the winning tile, or click a tile to remove it.';
                state.mode = 'win';
            }
            else if (u[i] >= 4) {
                state.msg = 'All four copies of that tile are already used.';
            }
            else {
                state.hand.push(i);
                state.hand.sort((a, b) => a - b);
                if (state.hand.length >= cap()) state.mode = 'win';
            }
        }
        else if (mode === 'win') {
            if (state.win !== null) u[state.win]--;
            if (u[i] >= 4) {
                state.msg = 'All four copies of that tile are already used.';
            }
            else {
                state.win = i;
                if (state.hand.length < cap()) state.mode = 'hand';
            }
        }
        else {
            addMeld(mode, i, u);
        }
        render();
    }

    function addMeld(mode, i, u) {
    if (state.melds.length >= 4) { state.msg = 'A hand has at most four melds.'; return; }
    if (state.hand.length > 13 - 3 * (state.melds.length + 1)) {
      state.msg = 'Remove some concealed tiles first. A new meld leaves room for ' + (13 - 3 * (state.melds.length + 1)) + '.';
      return;
    }
    if (mode === 'chow') {
      if (i >= 27 || (i % 9) > 6) { state.msg = 'A chow needs a numbered tile from 1 to 7 as its lowest tile.'; return; }
      if (u[i] >= 4 || u[i + 1] >= 4 || u[i + 2] >= 4) { state.msg = 'Not enough copies left for that chow.'; return; }
      state.melds.push({ type: 'chow', tile: i, concealed: false });
    } else if (mode === 'pung') {
      if (u[i] > 1) { state.msg = 'Not enough copies left for a pung.'; return; }
      state.melds.push({ type: 'pung', tile: i, concealed: false });
    } else {
      if (u[i] > 0) { state.msg = 'A kong needs all four copies of the tile.'; return; }
      state.melds.push({ type: 'kong', tile: i, concealed: mode === 'concealedKong' });
    }
  }

    function loadExample(ex) {
        state.melds = (ex.melds || []).map(([type, t, c]) => ({ type, tile: parseTiles(t)[0], concealed: !!c}));
        state.hand = parseTiles(ex.hand).sort((a, b) => a - b);
        state.win = parseTiles(ex.win)[0];
        state.selfDrawn = !!ex.selfDrawn;
        state.lastTile = state.lastOfWall = state.replacement = state.robbing = false;
        state.flowers = 0;
        state.mode = 'hand';
        state.msg = '';
        render();
    }

    function clearAll() {
        state.melds = [];
        state.hand = [];
        state.win = null;
        state.mode = 'hand';
        state.msg = '';
        render();
    }

    // render
    function renderModes() {
        const box = $('#modes');
        box.innerHTML = '';
        for (const [id, label] of MODES) {
            const b = document.createElement('button')
            b.type = 'button';
            b.className = 'mode';
            b. setAttribute('role', 'radio');
            b.setAttribute('aria-checked', String(state.mode === id));
            b.textContent = label;
            b.addEventListener('click', () => { state.mode = id; state.msg = ''; render(); });
            box.appendChild(b);
        }
    }

    function renderPalette() {
        const u = usage();
        const box = $('#modes');
        box.innerHTML = '';
        const rows = [
            Array.from({ length : 9}, (_, k) => k),
            Array.from({ length : 9}, (_, k) => 9 + k),
            Array.from({ length : 9}, (_, k) => 18 + k),
            Array.from({ length : 7}, (_, k) => 27 + k),
        ];
        const meldMode = ['chow', 'pung', 'kong', 'concealedKong'].includes(state.mode);
        for (const row of rows) {
            const r = document.createElement('div');
            r.className = 'row';
            for (const i of row) {
                const b = tileEl(i, 'button');
                const left = 4 - u[i];
                const left_el = document.createElement('span');
                left_el.className = 'left';
                left_el.textContent = left;
                b.appendChild(left_el);
                let disabled = left === 0 && !(state.mode === 'win' && state.win === i);
                if (state.mode === 'chow' && (i >= 27 || i % 9 > 6)) disabled = true;
                if (state.mode === 'kong' || state.mode === 'concealedKong') disabled = left < 4; 
                if (state.mode === 'pung') disabled = left < 3;
                if (meldMode && state.melds.length >= 4) disabled = true;
                b.disabled = disabled;
                b.addEventListener('click', () => pick(i));
                r.appendChild(b);
            }
            box.appendChild(r);
        }
        $('#status').textContent = state.msg;
    }

    renderers.push(renderModes, renderPalette);

    function renderHand() {
        const melds = $('#melds');
        if (state.melds.length === 0) {
            const p = document.createElement('span');
            p.className = 'small';
            p.textContent = 'None. Use the Chow / Pung / Kong buttons above to add a claimed or declared meld.';
            melds.appendChild(p);
    }
    state.melds.forEach((m, idx) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'meld';
        b.title = 'Remove this meld';
        b.setAttribute('aria-label', 'Remove' + (m.concealed ? 'concealed ' : '') + m.type + ' of ' + tileName(m.tile));
        const tiles = m.type === 'chow' ? [m.tile, m.tile + 1, m.tile + 2] : m.type === 'pung' ? [m.tile, m.tile, m.tile] : [m.tile, m.tile, m.tile, m.tile];
        tiles.forEach((t, k) => {
            const back = m.type === 'kong' && m.concealed && (k === 0 || k === 3);
            b.appendChild(tileEl(t, 'span', { back }));
        });
        b.addEventListener('click', () => { state.melds.splice(idx, 1);state.msg = ''; render(); });
        melds.appendchild(b);
    });

    const hand = $('#hand');
    hand.innerHTML = '';

    function render(){
        renderers.forEach((draw) => draw());
    }

    render();

})();



