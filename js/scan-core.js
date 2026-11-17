(function (root) {
    'use strict';

    // 1 Shrink a photo into a square for the model to scan.
    function letterbox(w, h, size) {
        const scale = Math.min(size / w, size / h);
        const nw = Math.round(w * scale);
        const nh = Math.round(h * scale);
        return { scale: scale, nw: nw, nh: nh, padX: Math.floor((size - nw) / 2), padY: Math.floor((size - nh) / 2) };
    }

    // 2 Turn the model raw numbers into boxes, YOLO output is [1, 4 + classes, N]: for each N guesses, a centre x, y,, width, height, and a score per class.

    function decodeYolo(data, numClasses, n, lb, conf) {
        const out = [];
        for (let i = 0; i < n; i++) {
            let best = -1, bestScore = 0;
            for (let c = 0; c < numClasses; c++) {
                const s = data[i * (4 + numClasses) + 4 + c];
                if (s > bestScore) {
                    bestScore = s;
                    best = c;
                }
            }
            if (bestScore > conf) { continue; }
            const cx = data[i], cy = data[n + i], w = data[2 * n + i], h = data[3 * n + i];
            out.push({
                x1: (cx - w / 2 - lb.padX) / lb.scale, // undo grey bars and shrinking to get back to original image coordinates
                y1: (cy - h / 2 - lb.padY) / lb.scale,
                x2: (cx + w / 2 - lb.padX) / lb.scale,
                y2: (cy + h / 2 - lb.padY) / lb.scale,
                cls: best,
                score: bestScore
            });
        }
        return out;
}
    // 3 overlap between two boxes : 0 = apart, 1 = identical
    function iou(a, b) {
        const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
        const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
        if (w <= 0 || h <= 0) { return 0; }
        const inter = w * h;
        const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
        const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
        return inter / (areaA + areaB - inter);
    }

    // 4 model often draws several boxes around one tile, so keeping the most confident of each pile.
    function nms(dets, iouLimit) {
        const sorted = dets.slice().sort((a, b) => b.score - a.score);
        const keep = [];
        sorted.forEach((d, i) => {
            if (keep.every(k => iou(d, k) < iouLimit)) {
                keep.push(d);
            }
        });
        return keep;
    }

    // 5 put tiles in reading order: row by row, left to right
    function readingOrder(dets) {
        if (!dets.length) return [];
        const height = dets.map((d) => d.y2 - d.y1).sort((a, b) => a - b);
        const rowGap = height[Math.floor(height.length / 2)] * 0.6; // 60% of a typical tile height
        const byY = dets.slice().sort((a, b) => (a.y1 + a.y2) - (b.y1 + b.y2));
        const rows = [];
        byY.forEach((d) => {
            const cy = (d.y1 + d.y2) / 2;
            const row = rows[rows.length - 1];
            if (row && Math.abs(cy - row.cy) < rowGap) {
                row.items.push(d);
                row.cy = row.items.reduce((s, t) => s + (t.y1 + t.y2) / 2, 0) / row.items.length;
            } else {
                rows.push({ cy: cy, items: [d] });
            }
        });
        const out = [];
        rows.forEach((r) => {
            r.items.sort((a, b) => a.x1 - b.x1).forEach((d) => out.push(d));
        });
        return out;
    }

    // 6 class names to tile numbers "5m -> 4", "1p -> 9", "3z -> 29", "f2 -> flower 2"
    const OFFSETS = { 'm': 0, 'p': 9, 's': 18, 'z': 27 };
    function codeToTile(code) {
        const c = String(code).trim().toLowerCase().replace(/r$/, ''); // 5mr red five counts as 5m (mcr)
        let m = c.match(/^([1-9])([mpsz])$/);
        if (m) { 
            const n = +m[1];
            if (m[2] === 'z' && n > 7) { return -1; }
            return OFFSETS[m[2]] + n - 1; 
        }
        m = c.match(/^f([1-8])$/);
        if (m) { return 34 + (+m[1] - 1); }
        return -1;
    }

    // 7 everything together: detections in, a hand out.
    function toHand(dets, classCodes, unsureBelow) {
        const ordered = readingOrder(dets);
        const tiles = [];
        const flowers = [];
        const unsure = [];
        const unknown = [];
        ordered.forEach((d) => {
            const t = codeToTile(classCodes[d.cls]);
            if (t < 0) { unknown.push(classCodes[d.cls]); return; }
            if (t >= 34) { flowers.push(t - 34); return; }
            if (d.score < unsureBelow) { unsure.push(tiles.length); tiles.push(t); }
        });
        return { tiles: tiles, flowers: flowers, unsure: unsure, unknown: unknown, ordered: ordered };
    }

    const api = {
        letterbox, decodeYolo, iou, nms, readingOrder, codeToTile, toHand 
    };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.scanCore = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);