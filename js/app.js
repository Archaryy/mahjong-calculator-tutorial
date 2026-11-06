(function () {
    'use strict';

    const { score, parseTiles, tileName } = window.MCR;

    // state
    const state = {
        melds : [], // {type:'chow'|'pung'|'kong', tile, concealed}
        hand : [], // concealed tiles, without the winning tile
        win: null,
        sel : null, // selected tile : {zone : 'hand', idx} or {zone: win}
        selfDrawn: false,
        prevalent: 0,
        seat: 0,
        flowers: [], // flower tiles you hold: 0 to 7
        lastTile: false,
        lastOfWall: false,
        replacement: false,
        robbing: false,
        msg: '',
    };

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
        el.setAttribute('aria-label', name);
        el.title = name;
        if (!opts.back) {
          const img = document.createElement('img');
          img.className = 'face';
          img.src = 'assets/tiles/' + TILE_FILES[i] + '.png';
          img.alt = '';
          img.draggable = false;
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

    // new design
    function inHand() { // how many of each tile are loose in the hand
      const c = new Array(34).fill(0);
      state.hand.forEach((t) => c[t]++);
      return c;
    }

    const total = () => state.hand.length + (state.win !== null ? 1 : 0);

    function quads() {
      const have = inHand();
      if (state.win !== null) have[state.win]++;
      const list = [];
      for (let t = 0; t < 34; t++) {
        if (have[t] === 4) list.push(t);
      }
      return list;
    }

    // most tile the hand may hold : the normal size, plus one extra for each four of a kind.
    const maxTotal = () => cap() + 1 + Math.min(quads().length, 4 - state.melds.length);

    function chowOptions(t) { // every chow you could make that includes tile t
      if (t >= 27) return [];
      const have = inHand();
      const found = [];
      for (let s = t - 2; s <= t; s++) {
        if (s < 0 || s % 9 > 6) continue; // a chow cannot start on 8 or 9
        if (Math.floor(s / 9) !== Math.floor(t / 9)) continue; //must be in one suit
        if (have[s] && have[s + 1] && have[s + 2]) found.push(s);
      }
      return found;
    }

    function removeFromHand(tile, n) { // take n copies of tile out of hand
      for (let k = 0; k < n; k++) state.hand.splice(state.hand.indexOf(tile), 1);
    }

    // actions new design*
    function pick(i) { // a tile clicked in the palette: add it to the hand
        state.msg = '';
        state.sel = null;
        const u = usage();
        if (u[i] >= 4) {
            state.msg = 'All four copies of that tile are already used.';
        }
        else if (total() >= maxTotal()) {
            state.msg = 'The hand is full (' + (cap() + 1) + ' tiles). Tap a tile to remove it' +
                (quads().length ? ', or turn your four of a kind into a kong to make room.' : '.');
        }
        else {
            state.hand.push(i);
            state.hand.sort((a, b) => a - b);
            // the tile that fills the hand is the winning tile
            if (state.win === null && total() === cap() + 1 && quads().length === 0) {
                removeFromHand(i, 1);
                state.win = i;
                state.msg = 'The last tile you added is the winning tile. Tap any tile to change that.';
            }
        }
        render();
    }

    function makeMeld(type, tile, concealed) { // turn tiles from the hand into a declared set
        if (state.melds.length >= 4) { state.msg = 'A hand has at most four melds.'; render(); return; }
        const set = type === 'chow' ? [tile, tile + 1, tile + 2]
            : type === 'pung' ? [tile, tile, tile]
            : [tile, tile, tile, tile];
        set.forEach((t) => removeFromHand(t, 1));
        state.melds.push({ type: type, tile: tile, concealed: !!concealed });
        state.melds.sort((a, b) => a.tile - b.tile);
        state.sel = null;
        state.msg = '';
        render();
    }

    function makeWin() { // the selected hand tile becomes the winning tile
        const s = state.sel;
        if (!s || s.zone !== 'hand') return;
        const t = state.hand[s.idx];
        state.hand.splice(s.idx, 1);
        if (state.win !== null) {            // the old winning tile goes back into the hand
            state.hand.push(state.win);
            state.hand.sort((a, b) => a - b);
        }
        state.win = t;
        state.sel = null;
        state.msg = '';
        render();
    }

    function winToHand() { // the winning tile goes back into the hand
        if (state.win === null) return;
        state.hand.push(state.win);
        state.hand.sort((a, b) => a - b);
        state.win = null;
        state.sel = null;
        state.msg = '';
        render();
    }

    function removeSelected() { // throw the selected tile away
        const s = state.sel;
        if (!s) return;
        if (s.zone === 'hand') state.hand.splice(s.idx, 1);
        else state.win = null;
        state.sel = null;
        state.msg = '';
        render();
    }

    function breakMeld(idx) { // undo a declared set: its tiles go back into the hand
        const m = state.melds[idx];
        const tiles = m.type === 'chow' ? [m.tile, m.tile + 1, m.tile + 2]
            : m.type === 'pung' ? [m.tile, m.tile, m.tile]
            : [m.tile, m.tile, m.tile, m.tile];
        state.melds.splice(idx, 1);
        state.hand.push(...tiles);
        state.hand.sort((a, b) => a - b);
        state.sel = null;
        state.msg = '';
        render();
    }

    // new flower design*
    function addFlower(k) { // flower tile tapped in the palette
      if(!state.flowers.includes(k)) {
        state.flowers.push(k);
        state.flowers.sort((a, b) => a - b);
      }
      state.msg = '';
      render();
    }
    
    function removeFlower(k) { // flower tile tapped in the flowers row
      state.flowers = state.flowers.filter((f) => f !== k)
        render();
    }

    function loadExample(ex) {
        state.melds = (ex.melds || []).map(([type, t, c]) => ({ type, tile: parseTiles(t)[0], concealed: !!c}));
        state.hand = parseTiles(ex.hand).sort((a, b) => a - b);
        state.win = parseTiles(ex.win)[0];
        state.selfDrawn = !!ex.selfDrawn;
        state.lastTile = state.lastOfWall = state.replacement = state.robbing = false;
        state.flowers = [];
        state.sel = null;
        state.msg = '';
        render();
    }

    function clearAll() {
        state.melds = [];
        state.hand = [];
        state.win = null;
        state.flowers= [];
        state.sel = null;
        state.msg = '';
        render();
    }

    // render new design*
    function hintText() { // grey help line above the palette
      if (state.msg) return state.msg;
      const q = quads();
      if (q.length && state.melds.length < 4) {
        return 'You hold all four ' + tileName(q[0]) + '. Tap one in your hand to declare it as a kong';
      }
      if (total() === 0 && state.melds.length === 0) {
        return 'Tap tiles to build your hand. Then tap a tile in it to make a chow, pung or kong.';
      }
      return '';
    }

    function renderPalette() {
      const u = usage();
      const box = $('#palette');
      box.innerHTML = '';
      const rows = [
        Array.from({ length: 9}, (_, k) => k),
        Array.from({ length: 9}, (_, k) => 9 + k),
        Array.from({ length: 9}, (_, k) => 18 + k),
        Array.from({ length: 7}, (_, k) => 27 + k),
        Array.from({ length: 8}, (_, k) => 34 + k), // flowers
      ];
      for (const row of rows) {
        const r = document.createElement('div');
        r.className = row[0] >= 34 ? 'row flowers-row' : 'row';
        for (const i of row) {
          const b = tileEl(i, 'button');
          if (i >= 34) { // flower (only one of each exists)
            b.disabled = state.flowers.includes(i - 34);
            b.addEventListener('click', () => addFlower(i - 34));
          }
          else {
            const left = 4 - u[i];
            const badge  = document.createElement('span');
            badge.className = 'left';
            badge.textContent = left;
            b.appendChild(badge);
            b.disabled = left === 0;
            b.addEventListener('click', () => pick(i));
          }
          r.appendChild(b);
        }
        box.appendChild(r);
      }
      const st = $('#status');
      st.textContent = hintText();
      st.className = 'status' + (state.msg ? '' : ' hint');
    }

    renderers.push(renderPalette);

    // render : buttons under hand
    function actionBtn(label, tiles, onClick, extra) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn act' + (extra ? ' ' + extra : '');
        if (tiles) {
            const strip = document.createElement('span');
            strip.className = 'mini';
            tiles.forEach((t, k) => strip.appendChild(tileEl(t, 'span', { back: extra === 'conc' && (k === 0 || k === 3) })));
            b.appendChild(strip);
        }
        b.appendChild(document.createTextNode(label));
        b.addEventListener('click', onClick);
        return b;
    }

    function renderActions() { // new action layout
        const box = $('#tile-actions');
        box.innerHTML = '';
        const s = state.sel;
        if (!s) {
            const p = document.createElement('span');
            p.className = 'small';
            p.textContent = state.hand.length ? 'Tap a tile in your hand to see what you can do with it.' : '';
            box.appendChild(p);
            return;
        }
        const t = s.zone === 'win' ? state.win : state.hand[s.idx];
        const title = document.createElement('div');
        title.className = 'sel-title';
        title.textContent = tileName(t) + (s.zone === 'win' ? ' (winning tile)' : '');
        box.appendChild(title);

        const row = document.createElement('div');
        row.className = 'act-row';
        if (s.zone === 'hand') {
            const have = inHand();
            chowOptions(t).forEach((st) => row.appendChild(actionBtn('Chow', [st, st + 1, st + 2], () => makeMeld('chow', st))));
            if (have[t] >= 3) row.appendChild(actionBtn('Pung', [t, t, t], () => makeMeld('pung', t)));
            if (have[t] >= 4) {
                row.appendChild(actionBtn('Open kong', [t, t, t, t], () => makeMeld('kong', t, false)));
                row.appendChild(actionBtn('Concealed kong', [t, t, t, t], () => makeMeld('kong', t, true), 'conc'));
            }
            row.appendChild(actionBtn(state.win === null ? 'This is the winning tile' : 'Make this the winning tile', null, makeWin));
            row.appendChild(actionBtn('Remove', null, removeSelected, 'danger'));
        }
        else {
            row.appendChild(actionBtn('Put back in hand', null, winToHand));
            row.appendChild(actionBtn('Remove', null, removeSelected, 'danger'));
        }
        box.appendChild(row);
    }

    // render: declared sets, the hand and the winning tile
    function renderHand() {
        const melds = $('#melds');
        melds.innerHTML = '';
        if (state.melds.length === 0) {
            const p = document.createElement('span');
            p.className = 'small';
            p.textContent = 'None yet. Pick tiles below, then tap them to form a chow, pung or kong.';
            melds.appendChild(p);
        }
        state.melds.forEach((m, idx) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'meld';
            b.title = 'Tap to put these tiles back in your hand';
            b.setAttribute('aria-label', 'Undo ' + (m.concealed ? 'concealed ' : '') + m.type + ' of ' + tileName(m.tile));
            const tiles = m.type === 'chow' ? [m.tile, m.tile + 1, m.tile + 2]
                : m.type === 'pung' ? [m.tile, m.tile, m.tile]
                : [m.tile, m.tile, m.tile, m.tile];
            const set = document.createElement('span');
            set.className = 'meld-set';
            tiles.forEach((t, k) => {
                const back = m.type === 'kong' && m.concealed && (k === 0 || k === 3);
                set.appendChild(tileEl(t, 'span', { back }));
            });
            b.appendChild(set);
            const tag = document.createElement('span');
            tag.className = 'meld-tag';
            tag.textContent = m.type === 'kong' ? (m.concealed ? 'concealed kong' : 'kong') : m.type;
            b.appendChild(tag);
            b.addEventListener('click', () => breakMeld(idx));
            melds.appendChild(b);
        });

        const hand = $('#hand');
        hand.innerHTML = '';
        state.hand.forEach((t, idx) => {
            const b = tileEl(t, 'button');
            const isSel = state.sel && state.sel.zone === 'hand' && state.sel.idx === idx;
            if (isSel) b.classList.add('selected');
            b.addEventListener('click', () => {
                state.sel = isSel ? null : { zone: 'hand', idx: idx };
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
        const goal = cap() + 1;
        $('#hand-count').textContent = '(' + total() + '/' + goal + (total() > goal ? ', extra tiles are for your kongs' : '') + ')';

        const win = $('#win');
        win.innerHTML = '';
        if (state.win !== null) {
            const b = tileEl(state.win, 'button');
            const isSel = state.sel && state.sel.zone === 'win';
            if (isSel) b.classList.add('selected');
            b.addEventListener('click', () => {
                state.sel = isSel ? null : { zone: 'win' };
                state.msg = '';
                render();
            });
            win.appendChild(b);
        }
        else {
            const s = document.createElement('span');
            s.className = 'slot';
            win.appendChild(s);
        }
    }

    renderers.push(renderHand, renderActions);

    // render the flowers you hold
    function renderFlowers() {
      const box = $('#flowers');
      box.innerHTML = '';
      if (state.flowers.length === 0) {
        const p = document.createElement('span');
        p.className = 'small';
        p.textContent = 'None. Tap a flower tile above if you hold any (1 fan each).';
        box.appendChild(p);
      }
      state.flowers.forEach((k) => {
        const b = tileEl(34 + k, 'button');
        b.addEventListener('click', () => removeFlower(k));
        box.appendChild(b);
      });
      $('#flower-count').textContent = '(' + state.flowers.length + ' of 8, tap to remove)';
    }

    renderers.push(renderFlowers);

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
      const p = document.createElement('p');
      p.className = 'empty';
      const t = total();
      const goal = cap() + 1;
      if (t > goal) {
        p.textContent = 'You have ' + t + ' tiles but a hand needs ' + goal + '. Tap a tile you hold four of and declare it as a kong.';
      }
      else if (t === goal) {
        p.textContent = 'Now tap the tile you won with and choose "This is the winning tile".';
      }
      else {
        const need = goal - t;
        p.textContent = 'Add ' + need + ' more tile' + (need === 1 ? '' : 's') + ' to complete the hand (' + t + '/' + goal + ').';
      }
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
        flowers: state.flowers.length,
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
    document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { state.sel = null; render(); }
    });
  render();

})();



