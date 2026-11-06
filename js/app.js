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

    // tile number -> the picture file in assets/tiles
    const TILE_FILES = [];
    for (let n = 1; n <= 9; n++) TILE_FILES.push(n + 'm');
    for (let n = 1; n <= 9; n++) TILE_FILES.push(n + 'p');
    for (let n = 1; n <= 9; n++) TILE_FILES.push(n + 's');
    for (let n = 1; n <= 7; n++) TILE_FILES.push('z' + n);
    for (let n = 1; n <= 8; n++) TILE_FILES.push('f' + n);
    const FLOWER_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter', 'Plum', 'Orchid', 'Bamboo', 'Chrysanthemum'];

    function tileEl(i, tag, opts) { // tile drawn from pictures
        opts = opts || {};
        const el = document.createElement(tag || 'span');
        el.className = 'tile ' + (opts.back ? ' back' : '');
        if (tag === 'button') el.type = 'button';
        const name = i < 34 ? tileName(i) : FLOWER_NAMES[i - 34] + ' flower';
        el.setAttribute('aria-label', tileName(i));
        el.title = tileName(i);
        if (!opts.back) {
          const img = document.createElement('img');
          img.className = 'face';
          img.src = 'assets/tiles/' + TILE_FILES[i] + '.png';
          img.alt = '';
          img.draggable = 'false';
          el.appendChild(img);
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
        const box = $('#palette');
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
        melds.innerHTML = '';
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
        b.setAttribute('aria-label', 'Remove ' + (m.concealed ? 'concealed ' : '') + m.type + ' of ' + tileName(m.tile));
        const tiles = m.type === 'chow' ? [m.tile, m.tile + 1, m.tile + 2] : m.type === 'pung' ? [m.tile, m.tile, m.tile] : [m.tile, m.tile, m.tile, m.tile];
        tiles.forEach((t, k) => {
            const back = m.type === 'kong' && m.concealed && (k === 0 || k === 3);
            b.appendChild(tileEl(t, 'span', { back }));
        });
        b.addEventListener('click', () => { state.melds.splice(idx, 1);state.msg = ''; render(); });
        melds.appendChild(b);
    });

    const hand = $('#hand');
    hand.innerHTML = '';
    state.hand.forEach((t, idx) => {
        const b = tileEl(t, 'button');
        b.title = 'Remove ' + tileName(t);
        b.addEventListener('click', () => {
            state.hand.splice(idx, 1); 
            if (state.mode === 'win' && state.win !== null) state.mode = 'hand';
            state.msg = '';
            render();
        });
        hand.appendChild(b);
    });

    for (let k = state.hand.length; k < cap(); k++) {
        const s = document.createElement('span');
        s.className = 'slot';
        hand.appendChild(s);
    }
    $('#hand-count').textContent = '(' + state.hand.length + '/' + cap() + ', click to remove)';

    const win = $('#win');
    win.innerHTML = '';
    if (state.win !== null) {
      const b = tileEl(state.win, 'button');
      b.title = 'Remove ' + tileName(state.win);
      b.addEventListener('click', () => { state.win = null; state.mode = state.hand.length < cap() ? 'hand' : 'win'; render(); });
      win.appendChild(b);
    } else {
      const s = document.createElement('span');
      s.className = 'slot';
      win.appendChild(s);
    }
}

renderers.push(renderHand);
$('#clear').addEventListener('click', clearAll);

function optHTML(title, inner) {
    return '<div class="opt"><span>' + title + '</span>' + inner + '</div>';
  }
  function windSelect(id, value) {
    return '<select id="' + id + '">' + WIND_NAMES.map((n, k) => '<option value="' + k + '"' + (k === value ? ' selected' : '') + '>' + n + '</option>').join('') + '</select>';
  }

  function renderOpts() {
    const s = state;
    $('#opts').innerHTML =
      optHTML('Win by',
        '<label><input type="radio" name="how" value="self"' + (s.selfDrawn ? ' checked' : '') + '> Self-drawn</label>' +
        '<label><input type="radio" name="how" value="discard"' + (!s.selfDrawn ? ' checked' : '') + '> Discard</label>') +
      optHTML('Prevalent wind', windSelect('prevalent', s.prevalent)) +
      optHTML('Seat wind', windSelect('seat', s.seat)) +
      optHTML('Flower tiles', '<input id="flowers" type="number" min="0" max="8" value="' + s.flowers + '">') +
      optHTML('Special circumstances',
        '<label><input id="lastTile" type="checkbox"' + (s.lastTile ? ' checked' : '') + '> Last tile (4th copy of the winning tile)</label>' +
        '<label><input id="lastOfWall" type="checkbox"' + (s.lastOfWall ? ' checked' : '') + '> Last tile of the wall (' + (s.selfDrawn ? 'draw' : 'discard') + ')</label>' +
        '<label class="' + (s.selfDrawn ? '' : 'off') + '"><input id="replacement" type="checkbox"' + (s.replacement ? ' checked' : '') + (s.selfDrawn ? '' : ' disabled') + '> Out with replacement tile</label>' +
        '<label class="' + (s.selfDrawn ? 'off' : '') + '"><input id="robbing" type="checkbox"' + (s.robbing ? ' checked' : '') + (s.selfDrawn ? ' disabled' : '') + '> Robbing the kong</label>');

    document.querySelectorAll('input[name="how"]').forEach((el) => el.addEventListener('change', () => {
      state.selfDrawn = el.value === 'self';
      if (state.selfDrawn) state.robbing = false; else state.replacement = false;
      render();
    }));
    $('#prevalent').addEventListener('change', (e) => { state.prevalent = +e.target.value; renderResult(); });
    $('#seat').addEventListener('change', (e) => { state.seat = +e.target.value; renderResult(); });
    $('#flowers').addEventListener('input', (e) => {
      state.flowers = Math.max(0, Math.min(8, parseInt(e.target.value, 10) || 0));
      renderResult();
    });
    for (const id of ['lastTile', 'lastOfWall', 'replacement', 'robbing']) {
      $('#' + id).addEventListener('change', (e) => { state[id] = e.target.checked; renderResult(); });
    }
  }

  renderers.push(renderOpts);

      function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function decompHTML(d) {
    const labels = {
      standard: 'Arrangement used',
      knitted: 'Arrangement used (knitted straight)',
      thirteenOrphans: 'Special hand',
      sevenPairs: 'Special hand',
      sevenShiftedPairs: 'Special hand',
      greaterHonorsKnitted: 'Special hand',
      lesserHonorsKnitted: 'Special hand',
    };
    const wrap = document.createElement('div');
    wrap.className = 'decomp';
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = labels[d.kind] || 'Arrangement used';
    wrap.appendChild(label);
    const row = document.createElement('div');
    row.className = 'tile-row';
    if (d.groups.length) {
      d.groups.forEach((g) => {
        const grp = document.createElement('span');
        grp.className = 'grp';
        g.tiles.forEach((t, k) => grp.appendChild(tileEl(t, 'span', { back: g.type === 'kong' && g.concealedKong && (k === 0 || k === 3) })));
        row.appendChild(grp);
      });
      if (d.pair) {
        const grp = document.createElement('span');
        grp.className = 'grp';
        d.pair.forEach((t) => grp.appendChild(tileEl(t, 'span')));
        row.appendChild(grp);
      }
    } else {
      (d.tiles || []).forEach((t) => row.appendChild(tileEl(t, 'span')));
    }
    wrap.appendChild(row);
    return wrap;
  }

  function renderResult() {
    const box = $('#result');
    box.innerHTML = '';
    const ready = state.win !== null && state.hand.length === cap();
    if (!ready) {
      const need = cap() - state.hand.length + (state.win === null ? 1 : 0);
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'Add ' + need + ' more tile' + (need === 1 ? '' : 's') + ' to complete the hand (' + (state.hand.length + (state.win !== null ? 1 : 0)) + '/' + (cap() + 1) + ').';
      box.appendChild(p);
      return;
    }
    const r = score({
      melds: state.melds,
      hand: state.hand,
      win: state.win,
      selfDrawn: state.selfDrawn,
      prevalent: state.prevalent,
      seat: state.seat,
      flowers: state.flowers,
      lastTile: state.lastTile,
      lastOfWall: state.lastOfWall,
      replacement: state.replacement,
      robbing: state.robbing,
    });
    if (!r.valid) {
      const p = document.createElement('p');
      p.className = 'err';
      p.textContent = r.error;
      box.appendChild(p);
      return;
    }
    const head = document.createElement('div');
    head.innerHTML =
      '<div class="total"><strong>' + r.total + '</strong><span>fan' + (r.flowers ? ' (including ' + r.flowers + ' flower' + (r.flowers === 1 ? '' : 's') + ')' : '') + '</span></div>' +
      '<span class="chip ' + (r.meetsMinimum ? 'ok' : 'bad') + '">' +
      (r.meetsMinimum ? 'Valid win (8+ fan)' : 'Only ' + r.base + ' fan without flowers: needs 8 to win') + '</span>';
    box.appendChild(head);

    const rows = r.fans.map((f) =>
      '<tr><td>' + esc(f.name) + '<span class="zh">' + esc(f.zh) + '</span>' +
      (f.count > 1 && f.id !== 'flowers' ? ' <span class="mult">× ' + f.count + '</span>' : '') +
      (f.id === 'flowers' ? ' <span class="mult">× ' + f.count + '</span>' : '') +
      '</td><td class="pts">' + f.points + '</td></tr>').join('');
    const table = document.createElement('table');
    table.className = 'fans';
    table.innerHTML = '<tbody>' + rows + '</tbody><tfoot><tr><td>Total</td><td class="pts">' + r.total + '</td></tr></tfoot>';
    box.appendChild(table);
    box.appendChild(decompHTML(r.decomposition));
  }

  renderers.push(renderResult);

    function renderExamples() {
    const sel = $('#example');
    sel.innerHTML = '<option value="">Choose…</option>' + EXAMPLES.map((e, k) => '<option value="' + k + '">' + esc(e.name) + '</option>').join('');
    sel.onchange = () => {
      if (sel.value !== '') loadExample(EXAMPLES[+sel.value]);
      sel.value = '';
    };
  }

  renderExamples();

function render(){
    renderers.forEach((draw) => draw());
    }

render();

})();



