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

  const ready = () => state.win !== null && state.hand.length === cap(); // complete enough to score?

  function pendingText() { // what to do next; used by the score bar and the breakdown
    const t = total();
    const goal = cap() + 1;
    if (t > goal) return 'You have ' + t + ' tiles but a hand needs ' + goal + '. Tap a tile you hold four of and declare it as a kong.';
    if (t === goal) return 'Now tap the tile you won with and choose "This is the winning tile".';
    if (state.win === null && state.hand.length === cap()) return 'Your hand is ready and waiting. Tap a winning tile below, or add the tile you won with.';
    const need = goal - t;
    return 'Add ' + need + ' more tile' + (need === 1 ? '' : 's') + ' to complete the hand (' + t + '/' + goal + ').';
  }

  let lastTotal = null;
  function renderScoreboard() { // the bar at the top: live total, what is missing, and a small copy of your hand
    const bar = $('#scoreboard');
    const box = $('#sb-hand');
    const r = ready() ? score(scoreInput(state.win)) : null;

    let st = 'pending', text = pendingText(), shown = '–';
    if (r && !r.valid) { st = 'bad'; text = r.error; }
    else if (r) {
      shown = String(r.total);
      st = r.meetsMinimum ? 'ok' : 'low';
      text = r.meetsMinimum ? 'Valid win (8+ fan)' : 'Only ' + r.base + ' fan without flowers: needs 8 to win';
    }
    if (total() === 0 && state.melds.length === 0) text = 'Add tiles to start. The score shows up here and stays in view.';

    bar.dataset.state = st;
    $('#sb-status').textContent = text;
    $('#sb-total').textContent = shown;
    const btn = $('#sb-score');
    btn.disabled = !r || !r.valid;
    btn.setAttribute('aria-label', btn.disabled ? 'No score yet' : shown + ' fan. Show the score breakdown');
    if (shown !== lastTotal) { // a little pop whenever the number changes
      btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
      lastTotal = shown;
    }

    box.innerHTML = '';
    state.melds.forEach((m) => {
      const t = m.tile;
      const tiles = m.type === 'chow' ? [t, t + 1, t + 2] : m.type === 'pung' ? [t, t, t] : [t, t, t, t];
      const g = document.createElement('span');
      g.className = 'grp';
      tiles.forEach((x, k) => g.appendChild(tileEl(x, 'span', { back: m.type === 'kong' && m.concealed && (k === 0 || k === 3) })));
      box.appendChild(g);
    });
    const g = document.createElement('span');
    g.className = 'grp';
    state.hand.forEach((x) => g.appendChild(tileEl(x, 'span')));
    box.appendChild(g);
    if (state.win !== null) {
      const w = document.createElement('span');
      w.className = 'grp win';
      w.appendChild(tileEl(state.win, 'span'));
      box.appendChild(w);
    }
    const n = document.createElement('span');
    n.className = 'sb-count';
    n.textContent = total() + '/' + (cap() + 1);
    box.appendChild(n);
  }
  renderers.push(renderScoreboard);

  $('#sb-score').addEventListener('click', () => { // tapping the number scrolls down to the breakdown
    $('#breakdown').scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    });
  });

  // the tray shows one suit at a time, so it stays short and your hand stays in view
  const TRAY = [
    { glyph: '萬', label: 'Chars',   from: 0,  to: 9 },
    { glyph: '筒', label: 'Dots',    from: 9,  to: 18 },
    { glyph: '索', label: 'Bamboo',  from: 18, to: 27 },
    { glyph: '字', label: 'Honors',  from: 27, to: 34 },
    { glyph: '花', label: 'Flowers', from: 34, to: 42 },
  ];
  let trayTab = 0; // which suit is open

  (function buildTrayTabs() { // built once, so the tab you tapped keeps keyboard focus
    const box = $('#palette-tabs');
    TRAY.forEach((t, k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tray-tab';
      b.innerHTML = '<span class="g">' + t.glyph + '</span><span class="n">' + t.label + '</span><span class="cnt"></span>';
      b.addEventListener('click', () => { trayTab = k; renderPalette(); });
      box.appendChild(b);
    });
  })();

  function renderPalette() {
    const u = usage();
    const focused = document.activeElement && document.activeElement.closest && document.activeElement.closest('#palette');
    const keepFocus = focused ? document.activeElement.dataset.tile : null;

    // tabs: which one is open, and how many tiles of that suit you already hold
    $('#palette-tabs').querySelectorAll('.tray-tab').forEach((b, k) => {
      const t = TRAY[k];
      let held = 0;
      if (t.from >= 34) held = state.flowers.length;
      else for (let i = t.from; i < t.to; i++) held += u[i];
      b.setAttribute('aria-pressed', String(k === trayTab));
      b.querySelector('.cnt').textContent = held || '';
      b.setAttribute('aria-label', t.label + (held ? ', ' + held + ' in your hand' : ''));
    });

    const box = $('#palette');
    box.innerHTML = '';
    const r = document.createElement('div');
    r.className = 'row';
    for (let i = TRAY[trayTab].from; i < TRAY[trayTab].to; i++) {
      const b = tileEl(i, 'button');
      b.dataset.tile = i;
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
    if (keepFocus !== null && keepFocus !== undefined) {
      const nb = box.querySelector('[data-tile="' + keepFocus + '"]');
      if (nb && !nb.disabled) nb.focus({ preventScroll: true });
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
          p.textContent = state.hand.length ? 'Tap a tile in your hand to make a chow, pung or kong, or to mark it as the winning tile.' : 'Tiles you pick will appear on the table above.';;
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
      $('#melds-zone').hidden = state.melds.length === 0; // no empty box until you declare a set
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
      p.textContent = 'None yet. Flowers are 1 fan each (see the Flowers tab).';
      box.appendChild(p);
    }
    state.flowers.forEach((k) => {
      const b = tileEl(34 + k, 'button');
      b.addEventListener('click', () => removeFlower(k));
      box.appendChild(b);
    });
    $('#flower-count').textContent = state.flowers.length ? '(' + state.flowers.length + ' of 8, tap to remove)' : '(0 of 8)';
  }

  renderers.push(renderFlowers);

  $('#clear').addEventListener('click', clearAll);

  const WIND_ZH = ['東', '南', '西', '北'];

  function group(title, inner) {
      return '<div class="opt-group"><span class="opt-label">' + title + '</span>' + inner + '</div>';
  }
  function seg(name, items, value) { // a row of big buttons that are really radio inputs
    return '<div class="seg" role="radiogroup" aria-label="' + name + '">' + items.map((it) =>
      '<label><input type="radio" name="' + name + '" value="' + it.value + '"' + (it.value === value ? ' checked' : '') + '><span>' + it.html + '</span></label>').join('') + '</div>';
  }
  function windSeg(name, value) {
    return seg(name, WIND_NAMES.map((n, k) => ({ value: k, html: '<b>' + WIND_ZH[k] + '</b>' + n })), value);
  }
  function check(id, text, checked, off) {
    return '<label class="check' + (off ? ' off' : '') + '"><input id="' + id + '" type="checkbox"' + (checked ? ' checked' : '') + (off ? ' disabled' : '') + '> <span>' + text + '</span></label>';
  }

  // redraw only what depends on the options, so the control you just used keeps keyboard focus
  function refreshScore() {
    renderScoreboard();
    renderResult();
    renderShare();
  }

  function renderOpts() {
    const s = state;
    $('#opts').innerHTML =
      group('Win by', seg('how', [
        { value: 'self', html: 'Self-drawn' },
        { value: 'discard', html: 'Discard' },
      ], s.selfDrawn ? 'self' : 'discard')) +
      '<div class="opt-pair">' +
        group('Prevalent wind', windSeg('prevalent', s.prevalent)) +
        group('Seat wind', windSeg('seat', s.seat)) +
      '</div>' +
      group('Special circumstances', '<div class="checks">' +
        check('lastTile', 'Last tile (4th copy of the winning tile)', s.lastTile) +
        check('lastOfWall', 'Last tile of the wall (' + (s.selfDrawn ? 'draw' : 'discard') + ')', s.lastOfWall) +
        check('replacement', 'Out with replacement tile', s.replacement, !s.selfDrawn) +
        check('robbing', 'Robbing the kong', s.robbing, s.selfDrawn) +
      '</div>');

    document.querySelectorAll('input[name="how"]').forEach((el) => el.addEventListener('change', () => {
      state.selfDrawn = el.value === 'self';
      if (state.selfDrawn) state.robbing = false; else state.replacement = false;
      render();
      const again = document.querySelector('input[name="how"]:checked'); // render() rebuilt the controls
      if (again) again.focus({ preventScroll: true });
    }));
    document.querySelectorAll('input[name="prevalent"], input[name="seat"]').forEach((el) => el.addEventListener('change', () => {
      state[el.name] = +el.value;
      refreshScore();
    }));
    for (const id of ['lastTile', 'lastOfWall', 'replacement', 'robbing']) {
      $('#' + id).addEventListener('change', (e) => { state[id] = e.target.checked; refreshScore(); });
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

  function scoreInput(win) { // everything score() needs, for a given winning tile.
    return {
      melds : state.melds,
      hand : state.hand,
      win : win,
      selfDrawn : state.selfDrawn,
      prevalent : state.prevalent,
      seat : state.seat,
      flowers : state.flowers.length,
      lastTile : state.lastTile,
      lastOfWall : state.lastOfWall,
      replacement : state.replacement,
      robbing : state.robbing,
    };
  }

  function findWaits() { // every tile that would win with 8 fan or more.
    const used = usage();
    const waits = [];
    for (let t = 0; t < 34; t++) {
      if (used[t] >= 4) continue; // all four copies already in hand
      const r = score(scoreInput(t));
      if (r.valid && r.meetsMinimum) waits.push({
        tile: t, total: r.total
      });
    }
    return waits;
  }

  function renderWaits() { // sits right under your hand, where you need it
    const box = $('#waits');
    box.innerHTML = '';
    if (!(state.win === null && state.hand.length === cap())) return;
    const waits = findWaits();
    const wrap = document.createElement('div');
    wrap.className = 'waits';
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = waits.length ? 'Winning tiles (8+ fan)' : 'No winning tile gives 8 fan yet.';
    wrap.appendChild(label);
    const row = document.createElement('div');
    row.className = 'tile-row';
    waits.forEach((w) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wait';
      b.title = 'Use ' + tileName(w.tile) + ' as the winning tile';
      b.appendChild(tileEl(w.tile, 'span'));
      const n = document.createElement('span');
      n.className = 'fan';
      n.textContent = w.total + ' fan';
      b.appendChild(n);
      b.addEventListener('click', () => {
        state.win = w.tile;
        state.sel = null;
        render();
      });
      row.appendChild(b);
    });
    wrap.appendChild(row);
    box.appendChild(wrap);
  }

  function renderResult() {
    const box = $('#result');
    box.innerHTML = '';
    if (!ready()) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = total() === 0 && state.melds.length === 0
        ? 'Build a hand above and every fan that applies will be listed here.'
        : pendingText();
      box.appendChild(p);
      return;
    }
    const r = score(scoreInput(state.win));
    if (!r.valid) {
      const p = document.createElement('p');
      p.className = 'err';
      p.textContent = r.error;
      box.appendChild(p);
      return;
    }
    const rows = r.fans.map((f) =>
      '<tr><td><a class="fanlink" href="rules.html#fan-' + f.id + '">' + esc(f.name) + '</a><span class="zh">' + esc(f.zh) + '</span>' +
      (f.count > 1 && f.id !== 'flowers' ? ' <span class="mult">× ' + f.count + '</span>' : '') +
      (f.id === 'flowers' ? ' <span class="mult">× ' + f.count + '</span>' : '') +
      '</td><td class="pts">' + f.points + '</td></tr>').join('');
    const table = document.createElement('table');
    table.className = 'fans';
    table.innerHTML = '<tbody>' + rows + '</tbody><tfoot><tr><td>Total' +
      (r.flowers ? ' <span class="mult">(including ' + r.flowers + ' flower' + (r.flowers === 1 ? '' : 's') + ')</span>' : '') +
      '</td><td class="pts">' + r.total + '</td></tr></tfoot>';
    box.appendChild(table);
    box.appendChild(decompHTML(r.decomposition));
  }

  renderers.push(renderWaits, renderResult);

  const SUIT_LETTERS = ['m', 'p', 's', 'z']; // [0,1,2,12] -> 123m4p
  function tilesToShort(tiles) {
    let out = '';
    let digits = '';
    let suit = -1;
    tiles.slice().sort((a, b) => a - b).forEach((t) => {
      const sIdx = Math.floor(t / 9);  // 0 m, 1 p, 2 s , 3 honours
      if (sIdx !== suit && digits) {
        out += digits + SUIT_LETTERS[suit]; digits = '';
      }
      suit = sIdx;
      digits += (t % 9) + 1;
    });
    if (digits) out += digits + SUIT_LETTERS[suit];
    return out;
  }

  function shareHash() {
    const parts = [];
    if (state.hand.length) parts.push('h=' + tilesToShort(state.hand));
    if (state.win !== null) parts.push('w=' + tilesToShort([state.win]));
    if(state.melds.length) {
      parts.push('m=' + state.melds.map((m) => (m.type === 'chow' ? 'c' : m.type === 'pung' ? 'p' : (m.concealed ? 'K' : 'k')) + tilesToShort([m.tile])).join(','));
    }
    
    if (state.flowers.length) parts.push('f=' + state.flowers.map((k) => k + 1).join(''));
    let o = '';
    if (state.selfDrawn) o += 's';
    if (state.lastTile) o += 'l';
    if (state.lastOfWall) o += 'w';
    if (state.replacement) o += 'r';
    if (state.robbing) o += 'b';
    if (o) parts.push('o=' + o);
    parts.push('pw=' + state.prevalent, 'sw=' + state.seat);
    return parts.join('&');
  }

  function shareURL() {
    return location.href.split('#')[0] + '#' + shareHash();
  }

  function applyHash() {
    const raw = location.hash.replace(/^#/, '');
    if(!raw) return false;
    const q = new URLSearchParams(raw);
    const next = { melds: [], hand: [], win: null, flowers: [] };
    const used = new Array(34).fill(0);
    const ok = (t) => Number.isInteger(t) && t >=0 && t < 34;

    next.hand = parseTiles(q.get('h') || '').sort((a, b) => a - b);
    const w = parseTiles(q.get('w') || '');
    if (w.length > 1) return false;
    if (w.length) next.win = w[0];

    const mtext = q.get('m');
    if (mtext) {
      for (const piece of mtext.split(',')) {
        const kind = piece[0];
        const t = parseTiles(piece.slice(1))[0];
        if (!'cpkK'.includes(kind) || !ok(t)) return false;
        if (kind === 'c' && !(t < 27 && t % 9 <= 6)) return false;
        next.melds.push({ type: kind === 'c' ? 'chow' : kind === 'p' ? 'pung' : 'kong', tile: t, concealed: kind === 'K' });
      }
    }
    if (next.melds.length > 4) return false;

    const ftext = q.get('f') || '';
    for (const ch of ftext) {
      const k = +ch - 1;
      if (k >= 0 && k < 8 && !next.flowers.includes(k)) next.flowers.push(k);
    }
    next.flowers.sort((a, b) => a - b);

    // never trust the address: check every tile and that no tile is used more than 4 times
    next.hand.concat(next.win === null ? [] : [next.win]).forEach((t) => used[t]++);
    next.melds.forEach((m) => {
      if (m.type === 'chow') { used[m.tile]++; used[m.tile + 1]++; used[m.tile + 2]++; }
      else used[m.tile] += m.type === 'kong' ? 4 : 3;
    });
    if (!next.hand.every(ok) || used.some((n) => n > 4)) return false;
    if (next.hand.length + (next.win === null ? 0 : 1) > 18) return false;

    state.melds = next.melds;
    state.hand = next.hand;
    state.win = next.win;
    state.flowers = next.flowers;
    const o = q.get('o') || '';
    state.selfDrawn = o.includes('s');
    state.lastTile = o.includes('l');
    state.lastOfWall = o.includes('w');
    state.replacement = o.includes('r');
    state.robbing = o.includes('b');
    const pw = +q.get('pw'), sw = +q.get('sw');
    state.prevalent = pw >= 0 && pw < 4 ? pw : 0;
    state.seat = sw >= 0 && sw < 4 ? sw : 0;
    state.sel = null;
    state.msg = '';
    return true;
  }

  window.addEventListener('hashchange', () => { if (applyHash()) render(); });

  function currentResult() { // the score of the finished hand, or null
  if (state.win === null || state.hand.length !== cap()) return null;
  const r = score(scoreInput(state.win));
  return r.valid ? r : null;
  }

  function shareMsg(text) { $('#share-msg').textContent = text; }

  async function shareLink() {
    const url = shareURL();
    const r = currentResult();
    const text = r ? 'My mahjong hand: ' + r.total + ' fan' : 'My mahjong hand';
    if (navigator.share) {
      try { await navigator.share({ title: 'MCR Mahjong Calculator', text: text, url: url }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    copyLink();
  }

  async function copyLink() {
    const url = shareURL();
    try {
      await navigator.clipboard.writeText(url);
      shareMsg('Link copied. Paste it to a friend.');
    } catch (e) {
      window.prompt('Copy this link:', url);
    }
  }

  function renderShare() {
  const card = $('#share-card');
  card.hidden = !(state.hand.length || state.melds.length || state.win !== null);
  const done = !!currentResult();
  $('#share-image').disabled = !done;
  $('#share-print').disabled = !done;
  $('#share-msg').textContent = done ? '' : 'The image and print buttons wake up when the hand is complete.';
  }

  renderers.push(renderShare);
  $('#share-link').addEventListener('click', shareLink);
  $('#share-copy').addEventListener('click', copyLink);
  $('#share-image').addEventListener('click', saveImage);
  $('#share-print').addEventListener('click', printCard);

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function roundRect(ctx, x, y, w, h, r) { // rectangle with rounded corners
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x , y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  async function buildCard(r) {
    const W = 960, PAD = 40, TW = 50, TH = 66, GAP = 14;
    const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans SC", sans-serif';
    const d = r.decomposition;

    // tile groups to draw
    const groups = [];
    if (d.groups.length) {
      d.groups.forEach((g) => groups.push(g.tiles.map((t, k) => ({ t: t, back: g.type === 'kong' && g.concealedKong && (k === 0 || k === 3)}))));
        if (d.pair) groups.push(d.pair.map((t) => ({ t: t })));
    } else {
      groups.push((d.tiles || []).map((t) => ({ t: t })));
    }
    const flowerTiles = state.flowers.map((k) => 34 + k);


    // load every picture needed, once
    const needed = new Set();
    groups.forEach((g) => g.forEach((x) => { if (!x.back)needed.add(x.t); }));
    flowerTiles.forEach((t) => needed.add(t));
    const imgs = {};
    await Promise.all([...needed].map(async (t) => {
      imgs[t] = await loadImage('assets/tiles/' + TILE_FILES[t] + '.png');
    }));

    // size the canvas
    const rowH = 30;
    const H = PAD + 30 + 90 + (TH + 34) + (flowerTiles.length ? 56 + 34 : 0) + r.fans.length * rowH + 30 + PAD;
    const SCALE = 2;
    const cv = document.createElement('canvas');
    cv.width = W * SCALE;
    cv.height = H * SCALE;
    const ctx = cv.getContext('2d');
    ctx.scale(SCALE, SCALE);

    // background and white card
    ctx.fillStyle = '#0e3b34';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fbf8f1';
    roundRect(ctx, 20, 20, W - 40, H - 40, 18);
    ctx.fill();

    // title, big total and the valid / not valid chip
    let y = PAD + 20;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#8a6d1f';
    ctx.font = '600 15px ' + FONT;
    ctx.fillText('MCR MAHJONG CALCULATOR  ·  国标麻将算番器', PAD, y);
    y += 62;
    ctx.fillStyle = '#1d1f1e';
    ctx.font = '700 64px ' + FONT;
    ctx.fillText(String(r.total), PAD, y);
    const tw = ctx.measureText(String(r.total)).width;
    ctx.font = '600 24px ' + FONT;
    ctx.fillStyle = '#667069';
    ctx.fillText('fan', PAD + tw + 10, y);
    const chip = r.meetsMinimum ? 'Valid win (8+ fan)' : 'Only ' + r.base + ' fan without flowers: needs 8';
    ctx.font = '600 16px ' + FONT;
    const cw = ctx.measureText(chip).width + 28;
    ctx.fillStyle = r.meetsMinimum ? '#dff2e5' : '#f8dedb';
    roundRect(ctx, W - PAD - cw, y - 34, cw, 34, 17);
    ctx.fill();
    ctx.fillStyle = r.meetsMinimum ? '#1f7a3d' : '#b3261e';
    ctx.fillText(chip, W - PAD - cw + 14, y - 11);

    // the hand : one group ata a time
    y += 28;
    ctx.fillStyle = '#667069';
    ctx.font = '600 13px '+ FONT;
    ctx.fillText('HAND', PAD, y);
    y += 10;
    let x = PAD;
    groups.forEach((g) => {
      g.forEach((tile) => {
        if (tile.back) {
          ctx.fillStyle = '#1f7a64';
          roundRect(ctx, x, y, TW, TH, 5);
          ctx.fill();
        }
        else {
          ctx.drawImage(imgs[tile.t], x, y, TW, TH);
        }
        x += TW + 2;
      });
      x += GAP;
    });
    y += TH + 28;

    // flowers
    if (flowerTiles.length) {
      ctx.fillStyle = '#667069';
      ctx.font = '600 13px ' + FONT;
      ctx.fillText('FLOWERS', PAD, y);
      y += 10;
      let fx = PAD;
      flowerTiles.forEach((t) => { ctx.drawImage(imgs[t], fx, y, 42, 56); fx += 46; });
      y += 56 + 28;
    }

    // how it was won
    const how = [state.selfDrawn ? 'Self-drawn' : 'Won on a discard', 'Prevalent ' + WIND_NAMES[state.prevalent], 'Seat ' + WIND_NAMES[state.seat]];
    if (state.lastTile) how.push('Last tile');
    if (state.lastOfWall) how.push('Last of the wall');
    if (state.replacement) how.push('Replacement tile');
    if (state.robbing) how.push('Robbing the kong');
    ctx.fillStyle = '#667069';
    ctx.font = '500 15px ' + FONT;
    ctx.fillText(how.join('  ·  '), PAD, y);
    y += 14;


    // fans table
    ctx.strokeStyle = '#e2dccb';
    ctx.lineWidth = 1;
    r.fans.forEach((f) => {
      y += rowH;
      ctx.beginPath(); ctx.moveTo(PAD, y + 8); ctx.lineTo(W - PAD, y + 8); ctx.stroke();
      ctx.fillStyle = '#1d1f1e';
      ctx.font = '500 18px ' + FONT;
      const label = f.name + (f.count > 1 ? '  × ' + f.count : '');
      ctx.fillText(label, PAD, y);
      const lw = ctx.measureText(label).width;
      ctx.fillStyle = '#667069';
      ctx.font = '400 15px ' + FONT;
      ctx.fillText(f.zh, PAD + lw + 12, y);
      ctx.fillStyle = '#1d1f1e';
      ctx.font = '700 18px ' + FONT;
      ctx.textAlign = 'right';
      ctx.fillText(String(f.points), W - PAD, y);
      ctx.textAlign = 'left';
    });
    y += 38;
    ctx.fillStyle = '#9a9a8a';
    ctx.font = '400 13px ' + FONT;
    ctx.fillText('Learning project · scoring follows the MCR 81-fan list with simplified exclusions', PAD, y);
    return cv;
  }

  function canvasBlob(cv) { // canvas -> a PNG file in memory
    return new Promise((resolve, reject) => {
      try { cv.toBlob((b) => (b ? resolve(b) : reject(new Error('empty'))), 'image/png'); }
      catch (e) { reject(e); }
    });
  }

  async function saveImage() {
    const r = currentResult();
    if (!r) return;
    try {
      const blob = await canvasBlob(await buildCard(r));
      const file = new File([blob], 'mahjong-hand.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'My mahjong hand', text: r.total + ' fan' }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'mahjong-hand.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      shareMsg('Image saved.');
    } catch (e) {
      shareMsg('Could not make the image. Open the page from a web address (not a double-clicked file) and try again.');
    }
  }

  async function printCard() {
    const r = currentResult();
    if (!r) return;
    try {
      const cv = await buildCard(r);
      $('#print-sheet').innerHTML = '';
      const img = new Image();
      img.alt = 'Mahjong score card';
      img.src = cv.toDataURL('image/png');
      $('#print-sheet').appendChild(img);
      await img.decode();
      window.print();
    } catch (e) {
      shareMsg('Could not prepare the print sheet. Open the page from a web address and try again.');
    }
  }

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

function previewScore (tiles, flowerCount) {
  if (tiles.length !== 14) return null;
  return score ({
    melds: [],
    hand: tiles.slice(0, 13),
    win: tiles[13],
    selfDrawn: state.selfDrawn,
    prevalent: state.prevalent,
    seat: state.seat,
    flowers: flowerCount,
    lastTile: state.lastTile,
    lastOfWall: state.lastOfWall,
    replacement: state.replacement,
    robbing: state.robbing,
  });

}
window.App = {state: state, render: render, tileEl: tileEl, cap: cap, preview: previewScore};

  applyHash();
  render();

})();