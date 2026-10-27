const { parseTiles, standardFans } = require('./js/engine.js');
const counts = (s) => { const c = new Array(34).fill(0); parseTiles(s).forEach((t) => c[t]++); return c; };
const arrangement = {
  groups: [
    { type: 'chow', tile: 0, declared: false },  // 123 characters
    { type: 'chow', tile: 9, declared: false },  // 123 dots
    { type: 'chow', tile: 18, declared: false }, // 123 bamboo
    { type: 'chow', tile: 3, declared: false },  // 456 characters
  ],
  pair: 31, // red dragons
};
const context = { selfDrawn: false, prevalent: 0, seat: 0, noMelds: true };
const found = [];
standardFans(arrangement, { kind: 'pair' }, context, counts('123m123p123s456m55z'), (id) => found.push(id));
console.log(found.join(', '));