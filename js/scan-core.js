// The maths of reading a photo. No camera, no page, no model: just numbers in, numbers out.
(function (root) {
  'use strict';

  // 1. Shrink a photo into the square the model expects, keeping its shape (grey bars fill the rest)
  function letterbox(w, h, size) {
    const scale = Math.min(size / w, size / h);
    const nw = Math.round(w * scale);
    const nh = Math.round(h * scale);
    return { scale: scale, nw: nw, nh: nh, padX: Math.floor((size - nw) / 2), padY: Math.floor((size - nh) / 2) };
  }

  // 2. Turn the model's raw numbers into boxes.
  // YOLO output is [1, 4 + classes, N]: for each of N guesses, a centre x, y, width, height, then one score per class.
  function decodeYolo(data, numClasses, n, lb, conf) {
    const out = [];
    for (let i = 0; i < n; i++) {
      let best = -1, bestScore = 0;
      for (let c = 0; c < numClasses; c++) {
        const s = data[(4 + c) * n + i];
        if (s > bestScore) { bestScore = s; best = c; }
      }
      if (bestScore < conf) continue;
      const cx = data[i], cy = data[n + i], w = data[2 * n + i], h = data[3 * n + i];
      out.push({
        x1: (cx - w / 2 - lb.padX) / lb.scale,   // undo the grey bars and the shrinking
        y1: (cy - h / 2 - lb.padY) / lb.scale,
        x2: (cx + w / 2 - lb.padX) / lb.scale,
        y2: (cy + h / 2 - lb.padY) / lb.scale,
        cls: best,
        score: bestScore,
      });
    }
    return out;
  }
    // 3. Overlap between two boxes: 0 = apart, 1 = identical
  function iou(a, b) {
    const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
    const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
    if (w <= 0 || h <= 0) return 0;
    const inter = w * h;
    const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
    const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
    return inter / (areaA + areaB - inter);
  }

  // 4. The model often draws several boxes round one tile. Keep the most confident of each pile.
  function nms(dets, iouLimit) {
    const sorted = dets.slice().sort((a, b) => b.score - a.score);
    const keep = [];
    sorted.forEach((d) => {
      if (keep.every((k) => iou(k, d) < iouLimit)) keep.push(d);
    });
    return keep;
  }

  // angling tiles that are not laid flat 90 degrees or so
  // 0 = flat, positive = right hand is lower, vice versa.
  function rowAngle(dets) {
    if (dets.length < 4) return null;
    const pts = dets.map((d) => [(d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2]);
    const n = pts.length;
    const mx = pts.reduce((s, p) => s + p[0], 0) / n;
    const my = pts.reduce((s, p) => s + p[1], 0) / n;
    let sxx = 0, syy = 0, sxy = 0;
    pts.forEach((p) => {
      sxx += (p[0] - mx) * (p[0] - mx);
      syy += (p[1] - my) * (p[1] - my);
      sxy += (p[0] - mx) * (p[1] - my);
    });

    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const mid = (sxx + syy) / 2;
    const diff = Math.sqrt(((sxx - sxy) / 2) * ((sxx - syy) / 2) + sxy * sxy);
    const major = mid + diff, minor = mid - diff;
    if (minor > 0 && major / minor < 6) return null;
    let deg = theta * 180 / Math.PI;
    if (deg > 90) deg -= 180;
    if (deg <= -90) deg += 180;
    return deg;
  }

  // 5. Put tiles in reading order: row by row, left to right
  function readingOrder(dets) {
    if (!dets.length) return [];
    const ang = rowAngle(dets);
    const rad = ang !== null && Math.abs(ang) > 2 ? -ang * Math.PI / 180 : 0;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const items = dets.map((d) => {
      const cx = (d.x1 + d.x2) / 2, cy = (d.y1 + d.y2) / 2;
      return { d: d, u: cx * cos - cy * sin, v: cx * sin + cy * cos };   // u along the row, v across it
    });
    const heights = dets.map((d) => d.y2 - d.y1).sort((a, b) => a - b);
    const rowGap = heights[Math.floor(heights.length / 2)] * 0.6;
    const byV = items.slice().sort((a, b) => a.v - b.v);
    const rows = [];
    byV.forEach((it) => {
      const row = rows[rows.length - 1];
      if (row && Math.abs(it.v - row.v) <= rowGap) {
        row.items.push(it);
        row.v = row.items.reduce((s, t) => s + t.v, 0) / row.items.length;
      } else {
        rows.push({ v: it.v, items: [it] });
      }
    });
    const out = [];
    rows.forEach((r) => r.items.sort((a, b) => a.u - b.u).forEach((it) => out.push(it.d)));
    return out;
  }
    // 6. Class names to tile numbers. "5m" -> 4, "1p" -> 9, "3z" -> 29, "f2" -> flower 2.
  const OFFSETS = { m: 0, p: 9, s: 18, z: 27 };
  function codeToTile(code) {
    const c = String(code).trim().toLowerCase().replace(/r$/, ''); // "5mr" (red five) counts as 5m
    let m = c.match(/^([1-9])([mpsz])$/);
    if (m) {
      const n = +m[1];
      if (m[2] === 'z' && n > 7) return -1;
      return OFFSETS[m[2]] + n - 1;
    }
    m = c.match(/^f([1-8])$/);
    if (m) return 34 + (+m[1]) - 1;
    return -1;
  }

  // 7. Everything together: detections in, a hand out
  function toHand(dets, classCodes, unsureBelow) {
    const ordered = readingOrder(dets);
    const tiles = [];
    const flowers = [];
    const unsure = [];      // tiles the model was not confident about
    const unknown = [];     // class names that are not mahjong tiles
    ordered.forEach((d) => {
      const t = codeToTile(classCodes[d.cls]);
      if (t < 0) { unknown.push(classCodes[d.cls]); return; }
      if (t >= 34) { flowers.push(t - 34); return; }
      if (d.score < unsureBelow) unsure.push(tiles.length);
      tiles.push(t);
    });
    return { tiles: tiles, flowers: flowers, unsure: unsure, unknown: unknown, ordered: ordered };
  }

  const api = { letterbox, decodeYolo, iou, nms, rowAngle, readingOrder, codeToTile, toHand };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ScanCore = api;
})(typeof window !== 'undefined' ? window : globalThis);