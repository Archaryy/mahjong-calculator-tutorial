const S = require('../js/scan-core.js');
let pass = 0, fail = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : (fail++, console.log('FAIL', name, JSON.stringify(a), '!=', JSON.stringify(b))); };

eq('letterbox', S.letterbox(1280, 960, 640), { scale: 0.5, nw: 640, nh: 480, padX: 0, padY: 80 });
eq('1m', S.codeToTile('1m'), 0);
eq('9s', S.codeToTile('9s'), 26);
eq('7z', S.codeToTile('7z'), 33);
eq('8z is not a tile', S.codeToTile('8z'), -1);
eq('red five counts as 5', S.codeToTile('5mr'), 4);
eq('flower', S.codeToTile('f3'), 36);

const A = { x1: 0, y1: 0, x2: 10, y2: 10, cls: 0, score: .9 };
const B = { x1: 1, y1: 1, x2: 11, y2: 11, cls: 1, score: .6 };
const C = { x1: 50, y1: 0, x2: 60, y2: 10, cls: 2, score: .7 };
eq('nms drops the duplicate', S.nms([B, A, C], 0.5).map((d) => d.cls), [0, 2]);

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);