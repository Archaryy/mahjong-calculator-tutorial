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

  async function scan(file) {
    $('#scan-use').hidden = true;
    $('#scan-canvas').hidden = true;
    $('#scan-tiles').innerHTML = '';
    try {
      await loadModel();
    } catch (e) {
      say(e.message === 'no-model'
        ? 'No scanning model is installed yet. Train one with Lesson 29, then put mahjong.onnx and classes.json in the models folder.'
        : 'Could not load the scanner. Check your connection and try again.');
      return;
    }
    say('Reading the photo…');
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const lb = letterbox(bitmap.width, bitmap.height, SIZE);
    const out = await session.run({ [session.inputNames[0]]: photoToTensor(bitmap, lb) });
    const result = out[session.outputNames[0]];
    const n = result.dims[2];
    const numClasses = result.dims[1] - 4;
    const dets = nms(decodeYolo(result.data, numClasses, n, lb, CONF), 0.5);
    found = toHand(dets, classCodes, UNSURE);
    found.bitmap = bitmap;
    show();
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
    ctx.lineWidth = 3;
    ctx.font = '700 ' + Math.max(14, Math.round(cv.width / 40)) + 'px system-ui, sans-serif';

    let tileNo = 0;
    ordered.forEach((d) => {
      const t = window.ScanCore.codeToTile(classCodes[d.cls]);
      const isTile = t >= 0 && t < 34;
      const weak = isTile && unsure.includes(tileNo);
      ctx.strokeStyle = weak ? '#e08a00' : '#1f7a3d';    // orange = check this one
      ctx.strokeRect(d.x1 * k, d.y1 * k, (d.x2 - d.x1) * k, (d.y2 - d.y1) * k);
      if (isTile) {
        tileNo++;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fillText(String(tileNo), d.x1 * k + 3, d.y1 * k - 5 < 14 ? d.y1 * k + 16 : d.y1 * k - 5);
      }
    });
    cv.hidden = false;

    const row = $('#scan-tiles');
    row.innerHTML = '';
    tiles.forEach((t, i) => {
      const w = document.createElement('span');
      w.className = 'scan-tile' + (unsure.includes(i) ? ' unsure' : '');
      const no = document.createElement('span');
      no.className = 'no';
      no.textContent = i + 1;
      w.appendChild(no);
      w.appendChild(App.tileEl(t, 'span'));
      row.appendChild(w);
    });

    if (!tiles.length) {
      say('I could not find any tiles. Try a closer photo, brighter light, or tiles in a straight row.');
      return;
    }
    let text = 'Found ' + tiles.length + ' tile' + (tiles.length === 1 ? '' : 's') + '.';
    if (found.flowers.length) text += ' ' + found.flowers.length + ' flower' + (found.flowers.length === 1 ? '' : 's') + '.';
    if (unsure.length) text += ' Orange ones (' + unsure.map((i) => i + 1).join(', ') + ') are uncertain: please check them.';
    say(text);
    $('#scan-use').hidden = false;
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

  $('#scan-file').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) scan(file).catch((e) => { console.error(e); say('Something went wrong reading that photo. Try another one.'); });
    e.target.value = '';   // so choosing the same photo again still works
  });
  $('#scan-use').addEventListener('click', useTiles);
})();