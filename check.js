const { CATALOG } = require('./js/engine.js');
const all = Object.values(CATALOG);
console.log('fans in the catalog:', all.length);
console.log('64-fan hands:');
all.filter((f) => f.fan === 64).forEach((f) => console.log(' -', f.name, f.zh));