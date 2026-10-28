const { score, parseTiles } = require('./js/engine.js');
const result = score({
  melds: [],
  hand: parseTiles('123456789m77p88s'),
  win: parseTiles('8s')[0],
  flowers: 2,
});
console.log('valid:', result.valid, '| total:', result.total);
result.fans.forEach((f) => console.log(' ', f.points, f.name));