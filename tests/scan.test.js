const S = require('../js/scan-core.js');
let pass = 0, fail = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : (fail++, console.log('FAIL', name, JSON.stringify(a), '!=', JSON.stringify(b))); };

function tiltedRow(deg) {
  const r = deg * Math.PI / 180, out = [];
  for (let k = 0; k < 14; k++) {
    const cx = 300 + k * 44 * Math.cos(r), cy = 300 + k * 44 * Math.sin(r);
    const w = 40 * Math.cos(Math.abs(r)) + 52 * Math.sin(Math.abs(r));
    const h = 52 * Math.cos(Math.abs(r)) + 40 * Math.sin(Math.abs(r));
    out.push({ x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2, cls: k, score: .9 });
  }
  return out;
}
[-30, -15, 0, 15, 30].forEach((deg) => {
  const scrambled = tiltedRow(deg).reverse();                // hand the tiles over in the wrong order
  eq('order at ' + deg, S.readingOrder(scrambled).map((d) => d.cls), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
});

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);