const { parseTiles, thirteenOrphans, sevenPairs, sevenShiftedPairs, knittedHonors } = require('./js/engine.js');
const counts = (s) => { const c = new Array(34).fill(0); parseTiles(s).forEach((t) => c[t]++); return c; };
console.log('thirteen orphans:', thirteenOrphans(counts('19m19p19s12345677z')));
console.log('seven pairs:', sevenPairs(counts('1133557799m22p44s')));
console.log('seven shifted pairs:', sevenShiftedPairs(counts('11223344556677m')));
console.log('knitted (greater):', knittedHonors(counts('147m258p3s1234567z')));
console.log('knitted (lesser):', knittedHonors(counts('147m258p36s123456z')));
console.log('ordinary hand:', knittedHonors(counts('123456789m77p88s')));
