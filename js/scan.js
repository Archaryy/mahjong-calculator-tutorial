(function () {
  'use strict';
  const { letterbox, decodeYolo, nms, toHand } = window.ScanCore;
  const App = window.App;
  const $ = (sel) => document.querySelector(sel);

  const SIZE = 640;     // the model sees a 640 x 640 picture
  const CONF = 0.25;    // ignore guesses below 25% confident
  const UNSURE = 0.6;   // flag tiles below 60% so the user checks them
  let session = null;   // the loaded model, kept so the second scan is fast
  let classCodes = null;
  let found = null;     // the last scan result

  function say(text) { $('#scan-msg').textContent = text; }

  async function loadModel() {
    if (session) return;
    say('Loading the scanner (the first time takes a few seconds)…');
    const res = await fetch('models/classes.json');
    if (!res.ok) throw new Error('no-model');
    classCodes = await res.json();
    await new Promise((resolve, reject) => {
      if (window.ort) return resolve();
      const s = document.createElement('script');
      s.src = 'vendor/ort/ort.wasm.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    window.ort.env.wasm.wasmPaths = 'vendor/ort/';
    window.ort.env.wasm.numThreads = 1;
    session = await window.ort.InferenceSession.create('models/mahjong.onnx', { executionProviders: ['wasm'] });
  }

    // photo -> 3 colour layers, each 640 x 640, values 0 to 1
  function photoToTensor(bitmap, lb) {
    const c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgb(114,114,114)';            // grey bars
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(bitmap, lb.padX, lb.padY, lb.nw, lb.nh);
    const px = ctx.getImageData(0, 0, SIZE, SIZE).data;   // R,G,B,A,R,G,B,A...
    const plane = SIZE * SIZE;
    const data = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
      data[i] = px[i * 4] / 255;
      data[plane + i] = px[i * 4 + 1] / 255;
      data[2 * plane + i] = px[i * 4 + 2] / 255;
    }
    return new window.ort.Tensor('float32', data, [1, 3, SIZE, SIZE]);
  }

    // run the model once on a picture (a bitmap or a canvas) and return the cleaned-up boxes
  async function detect(img) {
    const lb = letterbox(img.width, img.height, SIZE);
    const out = await session.run({ [session.inputNames[0]]: photoToTensor(img, lb) });
    const result = out[session.outputNames[0]];
    const n = result.dims[2];
    const numClasses = result.dims[1] - 4;
    return nms(decodeYolo(result.data, numClasses, n, lb, CONF), 0.5);
  }

  // how good a reading is: more tiles and more confident tiles both raise it
  function quality(dets) { return dets.reduce((sum, d) => sum + d.score, 0); }

  // turn a picture by some degrees (clockwise is positive) on a bigger canvas so no corner is cut off
  function rotateImage(img, deg) {
    const r = deg * Math.PI / 180;
    const cos = Math.abs(Math.cos(r)), sin = Math.abs(Math.sin(r));
    const w = Math.round(img.width * cos + img.height * sin);
    const h = Math.round(img.width * sin + img.height * cos);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgb(114,114,114)';                // the same grey as the model's padding
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.rotate(r);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    return c;
  }

  async function scan(file) {
    $('#scan-use').hidden = true;
    $('#scan-canvas').hidden = true;
    $('#scan-tiles').innerHTML = '';
    $('#scan-picker').hidden = true;
    try {
      await loadModel();
    } catch (e) {
      say(e.message === 'no-model'
        ? 'No scanning model is installed yet. Train one with Lesson 29, then put mahjong.onnx and classes.json in the models folder.'
        : 'Could not load the scanner. Check your connection and try again.');
      return;
    }
    say('Reading the photo\u2026');
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });   // <- this line was missing
    let best = { img: bitmap, dets: await detect(bitmap), turned: 0 };

    // A photo taken at an angle: straighten it and look again, then keep whichever pass read better.
    const tries = [];
    const est = window.ScanCore.rowAngle(best.dets);
    if (est !== null && Math.abs(est) >= 5) tries.push(est);        // the row's own slope, measured
    if (best.dets.length < 8) tries.push(-25, 25);                  // too few tiles seen: try turning blindly
    for (const deg of tries) {
      say('Straightening the photo\u2026');
      const img = rotateImage(bitmap, -deg);
      const dets = await detect(img);
      if (quality(dets) > quality(best.dets) * 1.05) best = { img: img, dets: dets, turned: deg };
    }

    found = toHand(best.dets, classCodes, UNSURE);
    found.bitmap = best.img;
    found.turned = best.turned;
    show();
  }

    // a rectangle path with rounded corners (drawn by hand so it works in every browser)
  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
    // draw the photo with a numbered box round every tile found
  function show() {
    const { bitmap, ordered, unsure, tiles } = found;
    const cv = $('#scan-canvas');
    const k = Math.min(1, 900 / bitmap.width);           // shrink big photos to fit
    cv.width = Math.round(bitmap.width * k);
    cv.height = Math.round(bitmap.height * k);
    const ctx = cv.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, cv.width, cv.height);
        const lw = Math.max(2, Math.round(cv.width / 320));       // line thickness grows with the picture
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.font = '700 ' + Math.max(12, Math.round(cv.width / 45)) + 'px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    let tileNo = 0;
    ordered.forEach((d) => {
      const t = window.ScanCore.codeToTile(classCodes[d.cls]);
      const isTile = t >= 0 && t < 34;
      const weak = isTile && unsure.includes(tileNo);
      const color = weak ? '#f0a000' : '#27c05a';
      const x = d.x1 * k, y = d.y1 * k, w = (d.x2 - d.x1) * k, h = (d.y2 - d.y1) * k;
      const rad = Math.min(8, w / 5, h / 5);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.55)';                     // a dark glow so the box shows on any background
      ctx.shadowBlur = 4;
      ctx.fillStyle = color + '26';                            // the colour at about 15% see-through
      roundedRect(ctx, x, y, w, h, rad);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.restore();
      if (isTile) {
        tileNo++;
        const label = String(tileNo);
        const pw = Math.max(ctx.measureText(label).width + 10, 20), ph = 20 + Math.round(cv.width / 400);
        const px = Math.min(Math.max(x + w / 2 - pw / 2, 2), cv.width - pw - 2);     // the number sits on the top edge, centred
        const py = Math.max(y - ph / 2, 2);
        ctx.fillStyle = color;
        roundedRect(ctx, px, py, pw, ph, ph / 2);
        ctx.fill();
        ctx.fillStyle = weak ? '#2b1a00' : '#06210f';
        ctx.textAlign = 'center';
        ctx.fillText(label, px + pw / 2, py + ph / 2 + 1);
      }
    });
    cv.hidden = false;
    closePicker();
    renderRow();
  }

  let editing = null;   // the tile number being edited, or null if none

  function summary() {
    const n = found.tiles.length;
    if (!n) {
      say('No tiles in the list. Tap + to add them, or try a closer photo, brighter light, or tiles in a straight row.');
      return;
    }
    let text = n + ' tile' + (n === 1 ? '' : 's') + '.';
    if (found.flowers.length) text += ' ' + found.flowers.length + ' flower' + (found.flowers.length === 1 ? '' : 's') + '.';
    text += found.unsure.length ? ' Orange tiles (' + found.unsure.map((i) => i + 1).join(', ') + ') are uncertain: tap them to check or change.': ' Tap any tile to change or remove it.';
    say(text);
  }

  function renderRow() {
    const row = $('#scan-tiles');
    row.innerHTML = '';
    found.tiles.forEach((t, i) => {
      const w = document.createElement('button');
      w.type = 'button';
      w.className = 'scan-tile' + (found.unsure.includes(i) ? ' unsure' : '') + (editing === i ? ' active' : '');
      w.setAttribute('aria-label', 'Tile ' + (i + 1) + ': tap to change');
      const no = document.createElement('span');
      no.className = 'no';
      no.textContent = i + 1;
      w.appendChild(no);
      w.appendChild(App.tileEl(t, 'span'));
      w.addEventListener('click', () => openPicker(i));
      row.appendChild(w);
    });
    const add = document.createElement('button');
    add.type = 'button';  
    add.className = 'scan-add' + (editing === -1 ? ' active' : '');
    add.textContent = '+';
    add.setAttribute('aria-label', 'Add a tile the scan missed');
    add.addEventListener('click', () => openPicker(-1));
    row.appendChild(add);
    $('#scan-use').hidden = !found.tiles.length;
    summary();
  }

    function buildPicker() {
    const box = $('#scan-picker');
    box.innerHTML = '';
    const title = document.createElement('p');
    title.id = 'scan-picker-title';
    title.className = 'picker-title';
    box.appendChild(title);
    [[0, 9], [9, 18], [18, 27], [27, 34]].forEach(([from, to]) => {
      const r = document.createElement('div');
      r.className = 'row';
      for (let t = from; t < to; t++) {
        const b = App.tileEl(t, 'button');
        b.dataset.tile = t;
        b.addEventListener('click', () => choose(t));
        r.appendChild(b);
      }
      box.appendChild(r);
    });
    const acts = document.createElement('div');
    acts.className = 'picker-actions';
    acts.innerHTML = '<button type="button" class="btn" id="pk-keep">Keep this one</button>' +
      '<button type="button" class="btn" id="pk-remove">Remove tile</button>' +
      '<button type="button" class="btn" id="pk-cancel">Cancel</button>';
    box.appendChild(acts);
    $('#pk-keep').addEventListener('click', keepTile);
    $('#pk-remove').addEventListener('click', removeTile);
    $('#pk-cancel').addEventListener('click', closePicker);
  }

  function openPicker(i) {
    editing = i;
    const box = $('#scan-picker');
    if (!box.firstChild) buildPicker();
    $('#scan-picker-title').textContent = i === -1 ? 'Add a tile: pick it below' : 'Tile ' + (i + 1) + ': pick the right tile';
    // a tile already used 4 times cannot be picked again
    const used = new Array(34).fill(0);
    found.tiles.forEach((t, j) => { if (j !== i) used[t]++; });
    box.querySelectorAll('button[data-tile]').forEach((b) => {
      const t = +b.dataset.tile;
      b.disabled = used[t] >= 4;
      b.classList.toggle('current', i >= 0 && found.tiles[i] === t);
    });
    $('#pk-keep').hidden = i === -1;
    $('#pk-remove').hidden = i === -1;
    box.hidden = false;
    renderRow();
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function closePicker() {
    editing = null;
    $('#scan-picker').hidden = true;
    if (found) renderRow();
  }

    function dropUnsure(i) { found.unsure = found.unsure.filter((u) => u !== i); }

  function choose(t) {
    if (editing === -1) {
      found.tiles.push(t);                 // a new tile goes at the right-hand end
    } else {
      found.tiles[editing] = t;
      dropUnsure(editing);                 // the person has checked it, so it is no longer orange
    }
    closePicker();
  }

  function keepTile() { dropUnsure(editing); closePicker(); }

  function removeTile() {
    const i = editing;
    found.tiles.splice(i, 1);
    found.unsure = found.unsure.filter((u) => u !== i).map((u) => (u > i ? u - 1 : u));
    closePicker();
  }

    function useTiles() {
    const st = App.state;
    const goal = App.cap() + 1;                       // 14 tiles with no declared sets
    let tiles = found.tiles.slice();
    const seen = new Array(34).fill(0);
    tiles = tiles.filter((t) => ++seen[t] <= 4);      // never more than four copies
    if (tiles.length > goal) tiles = tiles.slice(0, goal);
    st.melds = [];
    st.win = null;
    if (tiles.length === goal) {
      st.win = tiles[goal - 1];                       // the right-most tile is the winning tile
      st.hand = tiles.slice(0, goal - 1).sort((a, b) => a - b);
    } else {
      st.hand = tiles.sort((a, b) => a - b);          // 13 tiles: the winning-tile finder takes over
    }
    st.flowers = Array.from(new Set(found.flowers)).sort((a, b) => a - b);
    App.render();
  }

  ['#scan-cam', '#scan-file'].forEach((sel) => {
  $(sel).addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) scan(file).catch((err) => { console.error(err); say('Something went wrong reading that photo. Try another one.'); });
    e.target.value = '';   // so choosing the same photo again still works
  });
});
  $('#scan-use').addEventListener('click', useTiles);
})();