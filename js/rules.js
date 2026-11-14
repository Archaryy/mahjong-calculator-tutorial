(function () {
  'use strict';

  const { CATALOG, parseTiles, tileName } = window.MCR;
  const DATA = window.FANS_DATA;
  const WIND_NAMES = ['East', 'South', 'West', 'North'];

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // tile number -> picture file name
  function tileFile(i) {
    if (i < 9) return (i + 1) + 'm';
    if (i < 18) return (i - 8) + 'p';
    if (i < 27) return (i - 17) + 's';
    return 'z' + (i - 26);
  }
  function tileEl(i, back) {
    const el = document.createElement('span');
    el.className = 'tile' + (back ? ' back' : '');
    el.title = tileName(i);
    if (!back) {
      const img = document.createElement('img');
      img.className = 'face';
      img.src = 'assets/tiles/' + tileFile(i) + '.png';
      img.alt = tileName(i);
      img.draggable = false;
      el.appendChild(img);
    }
    return el;
  }

  // a link that opens the example in the calculator (the Lesson 25 link format)
  function tryLink(d) {
    const o = d.o || {};
    const parts = ['h=' + d.h, 'w=' + d.w];
    if (d.m) {
      parts.push('m=' + d.m.map(([type, tile, conc]) =>
        (type === 'chow' ? 'c' : type === 'pung' ? 'p' : (conc ? 'K' : 'k')) + tile).join(','));
    }
    if (d.flowers) parts.push('f=' + d.flowers.map((k) => k + 1).join(''));
    let flags = '';
    if (o.selfDrawn) flags += 's';
    if (o.lastTile) flags += 'l';
    if (o.lastOfWall) flags += 'w';
    if (o.replacement) flags += 'r';
    if (o.robbing) flags += 'b';
    if (flags) parts.push('o=' + flags);
    parts.push('pw=' + (o.prevalent || 0), 'sw=' + (o.seat || 0));
    return 'index.html#' + parts.join('&');
  }

    function howText(d) {
    const o = d.o || {};
    const bits = [o.selfDrawn ? 'self-drawn' : 'won on a discard'];
    if (o.lastTile) bits.push('last tile');
    if (o.lastOfWall) bits.push('last tile of the wall');
    if (o.replacement) bits.push('replacement tile');
    if (o.robbing) bits.push('robbing the kong');
    if (o.seat) bits.push('seat wind ' + WIND_NAMES[o.seat] + ', round wind ' + WIND_NAMES[o.prevalent || 0]);
    if (d.flowers) bits.push(d.flowers.length + ' flowers');
    return 'Example: ' + bits.join(', ') + '.';
  }

  function exampleRow(d) {
    const row = document.createElement('div');
    row.className = 'ex-tiles';
    (d.m || []).forEach(([type, tile, conc]) => {
      const t = parseTiles(tile)[0];
      const set = type === 'chow' ? [t, t + 1, t + 2] : type === 'pung' ? [t, t, t] : [t, t, t, t];
      const grp = document.createElement('span');
      grp.className = 'grp';
      set.forEach((x, k) => grp.appendChild(tileEl(x, type === 'kong' && conc && (k === 0 || k === 3))));
      row.appendChild(grp);
    });
    const hand = document.createElement('span');
    hand.className = 'grp';
    parseTiles(d.h).forEach((x) => hand.appendChild(tileEl(x)));
    row.appendChild(hand);
    const win = document.createElement('span');
    win.className = 'grp win';
    win.appendChild(tileEl(parseTiles(d.w)[0]));
    row.appendChild(win);
    return row;
  }

  function buildCard(f) {
    const d = DATA[f.id];
    const card = document.createElement('details');
    card.className = 'fan-card';
    card.id = 'fan-' + f.id;
    card.dataset.search = (f.name + ' ' + f.zh + ' ' + d.d).toLowerCase();
    card.innerHTML =
      '<summary><span class="fan-pts">' + f.fan + '</span>' +
      '<span class="what"><span class="nm">' + esc(f.name) + '<span class="zh">' + esc(f.zh) + '</span></span>' +
      '<span class="ds">' + esc(d.d) + '</span></span></summary>';
    const body = document.createElement('div');
    body.className = 'fan-body';
    const lab = document.createElement('div');
    lab.className = 'label';
    lab.textContent = 'Example hand (the winning tile is set apart)';
    body.appendChild(lab);
    body.appendChild(exampleRow(d));
    const how = document.createElement('p');
    how.className = 'small';
    how.textContent = howText(d);
    body.appendChild(how);
    if (f.excludes.length) {
      const ex = document.createElement('p');
      ex.className = 'small excl';
      ex.innerHTML = '<strong>Not counted together with:</strong> ' +
        f.excludes.filter((id) => CATALOG[id]).map((id) => '<a href="#fan-' + id + '">' + esc(CATALOG[id].name) + '</a>').join(', ');
      body.appendChild(ex);
    }
    const a = document.createElement('a');
    a.className = 'btn';
    a.href = tryLink(d);
    a.textContent = 'Try this hand in the calculator';
    body.appendChild(a);
    card.appendChild(body);
    return card;
  }

// build the whole list, one section per point value
  const fans = Object.values(CATALOG).filter((f) => DATA[f.id]).sort((a, b) => b.fan - a.fan);
  const list = $('#list');
  const cards = [];
  let currentFan = null;
  let section = null;
  fans.forEach((f) => {
    if (f.fan !== currentFan) {
      currentFan = f.fan;
      section = document.createElement('section');
      section.className = 'tier';
      section.innerHTML = '<h2><span class="fan-pts">' + f.fan + '</span> fan <small></small></h2>';
      list.appendChild(section);
    }
    const card = buildCard(f);
    section.appendChild(card);
    cards.push({ f: f, d: DATA[f.id], el: card });
  });

    // the filter chips
  const FILTERS = [
    { id: 'all', label: 'All', test: () => true },
    { id: 'big', label: '8+ fan', test: (f) => f.fan >= 8 },
    { id: 'C', label: 'Closed hand', test: (f, d) => d.t.includes('C') },
    { id: 'H', label: 'Honors', test: (f, d) => d.t.includes('H') },
    { id: 'S', label: 'Sequences', test: (f, d) => d.t.includes('S') },
    { id: 'P', label: 'Pungs', test: (f, d) => d.t.includes('P') },
    { id: 'K', label: 'Kongs', test: (f, d) => d.t.includes('K') },
    { id: 'W', label: 'How you win', test: (f, d) => d.t.includes('W') },
  ];
  let activeFilter = 'all';
  const chips = $('#chips');
  FILTERS.forEach((flt) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chipbtn' + (flt.id === 'all' ? ' on' : '');
    b.textContent = flt.label;
    b.addEventListener('click', () => {
      activeFilter = flt.id;
      chips.querySelectorAll('.chipbtn').forEach((x) => x.classList.toggle('on', x === b));
      apply();
    });
    chips.appendChild(b);
  });

  function apply() { // show only the cards that match the chip and the search box
    const q = $('#q').value.trim().toLowerCase();
    const test = FILTERS.find((x) => x.id === activeFilter).test;
    let shown = 0;
    cards.forEach((c) => {
      const ok = test(c.f, c.d) && (!q || c.el.dataset.search.includes(q));
      c.el.hidden = !ok;
      if (ok) shown++;
    });
    document.querySelectorAll('.tier').forEach((s) => {
      const n = s.querySelectorAll('.fan-card:not([hidden])').length;
      s.hidden = n === 0;
      s.querySelector('small').textContent = n + (n === 1 ? ' combination' : ' combinations');
    });
    $('#count').textContent = 'Showing ' + shown + ' of ' + cards.length;
  }
  $('#q').addEventListener('input', apply);
  apply();

  // open a card from a link like rules.html#fan-pureStraight
  function openFromHash() {
    const m = location.hash.match(/^#fan-(\w+)$/);
    if (!m) return;
    const el = document.getElementById('fan-' + m[1]);
    if (!el) return;
    activeFilter = 'all';
    $('#q').value = '';
    chips.querySelectorAll('.chipbtn').forEach((x, k) => x.classList.toggle('on', k === 0));
    apply();
    el.open = true;
    el.scrollIntoView({ block: 'start' });
  }
  window.addEventListener('hashchange', openFromHash);
  openFromHash();
})();