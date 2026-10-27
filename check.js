const { parseTiles, decompose } = require('./js/engine.js');
const counts = (s) => { const c = new Array(34).fill(0); parseTiles(s).forEach((t) => c[t]++); return c; };
const results = decompose(counts('111222333m456p99s'), 4);
console.log('ways to read this hand:', results.length);
results.forEach((r, i) => {
  const sets = r.groups.map((g) => g.type + '@' + g.tile).join(', ');
  console.log(i + 1 + ')', sets, '| pair:', r.pair);
});