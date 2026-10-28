const { score, parseTiles } = require('../js/engine.js');

const T = (s) => parseTiles(s);
let passed = 0;
let failed = 0;

function mk(o) {
  return Object.assign(
    {
      melds: (o.melds || []).map(([type, tile, concealed]) => ({ type, tile: T(tile)[0], concealed: !!concealed })),
      hand: T(o.hand),
      win: T(o.win)[0],
    },
    o.opts || {}
  );
}

function test(name, o, check) {
  const r = score(mk(o));
  let ok = true;
  let why = '';
  try {
    check(r);
  } catch (e) {
    ok = false;
    why = e.message;
  }
  if (ok) {
    passed++;
    console.log('  ok   ' + name);
  } else {
    failed++;
    console.log('  FAIL ' + name + ' -> ' + why);
    console.log('       ' + (r.valid ? r.total + ': ' + r.fans.map((f) => f.name + 'x' + f.count + '=' + f.points).join(', ') : r.error));
  }
}

function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'expected') + ' ' + b + ' but got ' + a);
}
const ids = (r) => r.fans.map((f) => f.id);
const has = (r, id) => { if (!ids(r).includes(id)) throw new Error('missing ' + id + ' in [' + ids(r).join(',') + ']'); };
const hasNot = (r, id) => { if (ids(r).includes(id)) throw new Error('unexpected ' + id); };

console.log('MCR engine');

test('Thirteen Orphans', { hand: '19m19p19s1234567z', win: '7z' }, (r) => {
  eq(r.valid, true);
  eq(r.total, 88, 'total');
  has(r, 'thirteenOrphans');
});

test('Seven Shifted Pairs (self-drawn)', { hand: '1122334455667m', win: '7m', opts: { selfDrawn: true } }, (r) => {
  has(r, 'sevenShiftedPairs');
  hasNot(r, 'fullFlush');
  eq(r.total, 88 + 4, 'sevenShifted + fully concealed');
});

test('Seven Pairs', { hand: '1133557799m225p', win: '5p' }, (r) => {
  has(r, 'sevenPairs');
  eq(r.total, 26, 'seven pairs + no honors + one voided');
});

test('Nine Gates', { hand: '1112345678999m', win: '5m', opts: { selfDrawn: true } }, (r) => {
  has(r, 'nineGates');
  hasNot(r, 'fullFlush');
  hasNot(r, 'concealedHand');
});

test('Big Three Dragons (melds + closed wait)', { melds: [['pung', '5z'], ['pung', '6z'], ['pung', '7z']], hand: '23m55p', win: '4m' }, (r) => {
  has(r, 'bigThreeDragons');
  hasNot(r, 'dragonPung');
  hasNot(r, 'twoDragonPungs');
  eq(r.total, 88 + 1, 'big three dragons + one voided suit (4m is an open wait)');
});

test('Big Four Winds hand', { hand: '111z222z333z444z5m', win: '5m' }, (r) => {
  has(r, 'bigFourWinds');
  has(r, 'fourConcealedPungs');
  hasNot(r, 'allPungs');
});

test('Chicken Hand (no fans) = 8', {
  melds: [['chow', '2m'], ['chow', '3p'], ['chow', '6s']],
  hand: '45m77z',
  win: '6m',
}, (r) => {
  has(r, 'chickenHand');
  eq(r.total, 8);
});

test('Pure Straight, won on discard', { hand: '123456789m77p88s', win: '8s' }, (r) => {
  has(r, 'pureStraight');
  has(r, 'concealedHand');
});

test('Win tile in a pung makes it not concealed', { hand: '11m222m333p456s77z', win: '1m' }, (r) => {
  // 1m completes a pung by discard -> only 2 concealed pungs, so no Three Concealed Pungs
  hasNot(r, 'threeConcealedPungs');
});

test('Three Concealed Pungs when pair is the winning tile', { hand: '111m222m333p456s5z', win: '5z' }, (r) => {
  has(r, 'threeConcealedPungs');
});

test('Melded Hand (valid)', {
  melds: [['chow', '1m'], ['pung', '5p'], ['pung', '9s'], ['chow', '4s']],
  hand: '3p',
  win: '3p',
}, (r) => {
  has(r, 'meldedHand');
  hasNot(r, 'singleWait');
});

test('Four Kongs', {
  melds: [['kong', '1m', true], ['kong', '5p'], ['kong', '9s'], ['kong', '3z']],
  hand: '2z',
  win: '2z',
}, (r) => {
  has(r, 'fourKongs');
  hasNot(r, 'threeKongs');
});

test('Flowers add 1 each but are not counted toward the 8 minimum', {
  melds: [['chow', '2m'], ['chow', '3p'], ['chow', '6s']],
  hand: '45m77z',
  win: '6m',
  opts: { flowers: 2 },
}, (r) => {
  eq(r.total, 10);
  eq(r.base, 8);
  eq(r.meetsMinimum, true);
});

test('Full Flush with all chows', { hand: '12345678m234m88m', win: '9m' }, (r) => {
  has(r, 'fullFlush');
});

test('Knitted Straight', { hand: '147m258p369s1234z', win: '4z' }, (r) => {
  // 9 knitted tiles + 4 honors in hand = 13 + win: not a winning hand shape (needs a set + pair)
  eq(r.valid, false);
});

test('Knitted Straight with set + pair', { hand: '147m258p369s234m5z', win: '5z' }, (r) => {
  has(r, 'knittedStraight');
});

test('Lesser Honors and Knitted Tiles', { hand: '147m258p36s12345z', win: '6z' }, (r) => {
  // 14 tiles: 147m 258p 36s (8 knitted? 7: 1,4,7,2,5,8,3,6) + honors
  // 8 knitted + 6 honors
  has(r, 'lesserHonorsKnitted');
});

test('Not a winning hand', { hand: '1357m2468p13579s', win: '1z' }, (r) => {
  eq(r.valid, false);
});

test('Rejects 5 copies of a tile', { hand: '1111m234p567s11z', win: '1m' }, (r) => {
  eq(r.valid, false);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);