/*
 * MCR (Mahjong Competition Rules / Chinese Official) scoring engine.
 *
 * Tiles are numbered 0..33:
 *   0-8   Characters 1-9   (m)
 *   9-17  Dots 1-9         (p)
 *   18-26 Bamboo 1-9       (s)
 *   27-30 East South West North (z)
 *   31-33 Red, Green, White dragons (z)
 *
 * Pipeline:
 *   1. validate input
 *   2. build every possible interpretation of the hand
 *      (standard 4 sets + pair, knitted straight, seven pairs, thirteen orphans, ...)
 *   3. for each interpretation (and each way of placing the winning tile)
 *      collect every fan that applies
 *   4. apply the exclusion rules and the "don't reuse a set" rule
 *   5. keep the interpretation with the highest score
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- tiles
  const isSuit = (i) => i < 27;
  const suitOf = (i) => (i < 27 ? Math.floor(i / 9) : 3);
  const numOf = (i) => (i % 9) + 1; // only meaningful for suit tiles
  const isHonor = (i) => i >= 27;
  const isWind = (i) => i >= 27 && i <= 30;
  const isDragon = (i) => i >= 31;
  const isTerminal = (i) => i < 27 && (i % 9 === 0 || i % 9 === 8);
  const isTermOrHonor = (i) => isHonor(i) || isTerminal(i);

  const OFFSETS = { m: 0, p: 9, s: 18, z: 27 };
  const SUIT_NAMES = ['Characters', 'Dots', 'Bamboo'];
  const HONOR_NAMES = ['East', 'South', 'West', 'North', 'Red Dragon', 'Green Dragon', 'White Dragon'];

  function tileName(i) {
    return isSuit(i) ? numOf(i) + ' ' + SUIT_NAMES[suitOf(i)] : HONOR_NAMES[i - 27];
  }

  /** "123m456p77z" -> [0,1,2,12,13,14,33,33] */
  function parseTiles(str) {
    const out = [];
    let buf = [];
    for (const ch of String(str)) {
      if (ch >= '0' && ch <= '9') buf.push(+ch);
      else if (ch in OFFSETS) {
        for (const n of buf) out.push(OFFSETS[ch] + n - 1);
        buf = [];
      }
    }
    return out;
  }

  const GREEN = new Set([19, 20, 21, 23, 25, 32]); // 2,3,4,6,8 bamboo + green dragon
  const REVERSIBLE = new Set(
    [1, 2, 3, 4, 5, 8, 9].map((n) => 9 + n - 1) // dots
      .concat([2, 4, 5, 6, 8, 9].map((n) => 18 + n - 1)) // bamboo
      .concat([33]) // white dragon
  );
  const ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  const KNIT_PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

  const api = { parseTiles, tileName }; // (tutorial helper)

  // CATALOG FOR POINTS BY MCR (Mahjong Competition Rules) *zh chinese name *excludes for not stacking points by the same configs of hands
  const CATALOG = {};
  function def(id, fan, name, zh, excludes) {
    CATALOG[id] = {id, fan, name, zh, excludes: excludes || [] };
  }

  // 88 points / faan
  def('bigFourWinds', 88, 'Big Four Winds', '大四喜', ['bigThreeWinds', 'littleFourWinds', 'allPungs', 'pungTerminalsHonors', 'prevalentWind', 'seatWind']);

  def('bigThreeDragons', 88, 'Big Three Dragons', '大三元', ['twoDragonPungs', 'dragonPung']);

  def('allGreen', 88, 'All Green', '绿一色', ['halfFlush']);

  def('nineGates', 88, 'Nine Gates', '九莲宝灯', ['fullFlush', 'halfFlush', 'concealedHand', 'oneVoidedSuit', 'pungTerminalsHonors', 'twoConcealedPungs', 'singleWait', 'edgeWait', 'closedWait']);

  def('fourKongs', 88, 'Four Kongs', '四杠', ['threeKongs', 'twoConcealedKongs', 'twoMeldedKongs', 'concealedAndMeldedKong', 'concealedKong', 'meldedKong', 'singleWait', 'allPungs']);

  def('sevenShiftedPairs', 88, 'Seven Shifted Pairs', '连七对', ['sevenPairs', 'fullFlush', 'halfFlush', 'concealedHand', 'pairWait', 'noHonors', 'oneVoidedSuit']);

  def('thirteenOrphans', 88, 'Thirteen Orphans', '十三幺', ['allTypes', 'concealedHand', 'singleWait', 'allTerminalsAndHonors', 'outsideHand']);

  // 64 points / faan
  def('allTerminals', 64, 'All Terminals', '清幺九', ['allPungs', 'outsideHand', 'pungTerminalsHonors', 'noHonors', 'allTerminalsAndHonors']);

  def('allHonors', 64, 'All Honors', '字一色', ['allPungs', 'outsideHand', 'pungTerminalHonors', 'allTerminalsAndHonors']);

  def('littleFourWinds', 64, 'Little Four Winds', '小四喜', ['bigThreeWinds', 'pungTerminalsHonors']);

  def('littleThreeDragons', 64, 'Little Three Dragons', '小三元', ['twoDragonPungs', 'dragonPung']);

  def('fourConcealedPungs', 64, 'Four Concealed Pungs', '四暗刻', ['allPungs', 'threeConcealedPungs', 'twoConcealedPungs', 'concealedHand']);

  def('pureTerminalChows', 64, 'Pure Terminal Chows', '一色双龙会', ['fullFlush', 'allChows', 'pureDoubleChow', 'twoTerminalChows', 'noHonors', 'oneVoidedSuit']);

  // 48 points / faan
  def('quadrupleChow', 48, 'Quadruple Chow', '一色四同顺', ['tileHog', 'pureTripleChow', 'pureDoubleChow']);

  def('fourPureShiftedPungs', 48, 'Four Pure Shifted Pungs', '一色四节高', ['pureShiftedPungs', 'allPungs']);

  // 32 points / faan
  def('fourPureShiftedChows', 32 , 'Four Pure Shifted Chows', '一色四步高', ['pureShiftedChows', 'shortStraight']);

  def('threeKongs', 32, 'Three Kongs', '三杠', ['twoConcealedKongs', 'twoMeldedKongs', 'concealedAndMeldedKong', 'concealedKong', 'meldedKong']);

  def('allTerminalsAndHonors', 32, 'All Terminals And Honors', '混幺九', ['allPungs', 'outsideHand', 'pungTerminalsHonors']);

  // 24 points / faan
  def('sevenPairs', 24, 'Seven Pairs', '七对', ['concealedHand']);

  def('greaterHonorsKnitted', 24, 'Greater Honors and Knitted Tiles', '七星不靠', ['allTypes', 'concealedHand']);
  
  def('allEvenPungs', 24, 'All Even Pungs', '全双刻', ['allPungs', 'allSimples', 'noHonors']);
  
  def('fullFlush', 24, 'Full Flush', '清一色', ['oneVoidedSuit', 'noHonors']);
  
  def('pureTripleChow', 24, 'Pure Triple Chow', '一色三同顺', ['pureDoubleChow']);
  
  def('pureShiftedPungs', 24, 'Pure Shifted Pungs', '一色三节高', []);
  
  def('upperTiles', 24, 'Upper Tiles', '全大', ['upperFour', 'noHonors']);
 
  def('middleTiles', 24, 'Middle Tiles', '全中', ['allSimples', 'noHonors']);
  
  def('lowerTiles', 24, 'Lower Tiles', '全小', ['lowerFour', 'noHonors']);

  // 16 points / faan
  def('pureStraight', 16, 'Pure Straight', '清龙', []);
  
  def('threeSuitedTerminalChows', 16, 'Three-Suited Terminal Chows', '三色双龙会', ['allChows', 'noHonors']);
  
  def('pureShiftedChows', 16, 'Pure Shifted Chows', '一色三步高', []);
 
  def('allFives', 16, 'All Fives', '全带五', ['allSimples']);
  
  def('triplePung', 16, 'Triple Pung', '三同刻', ['doublePung']);
  
  def('threeConcealedPungs', 16, 'Three Concealed Pungs', '三暗刻', ['twoConcealedPungs']);
  
  // 12 points / faan
  
  def('lesserHonorsKnitted', 12, 'Lesser Honors and Knitted Tiles', '全不靠', ['allTypes', 'concealedHand']);
  
  def('knittedStraight', 12, 'Knitted Straight', '组合龙', []);
 
  def('upperFour', 12, 'Upper Four', '大于五', ['noHonors']);
  
  def('lowerFour', 12, 'Lower Four', '小于五', ['noHonors']);
 
  def('bigThreeWinds', 12, 'Big Three Winds', '三风刻', []);

  // 8 points / faan
  def('mixedStraight', 8, 'Mixed Straight', '花龙', []);
  
  def('reversibleTiles', 8, 'Reversible Tiles', '推不倒', ['oneVoidedSuit']);
  
  def('mixedTripleChow', 8, 'Mixed Triple Chow', '三色三同顺', []);
 
  def('mixedShiftedPungs', 8, 'Mixed Shifted Pungs', '三色三节高', []);
  
  def('chickenHand', 8, 'Chicken Hand', '无番和', []);
 
  def('lastTileDraw', 8, 'Last Tile Draw', '妙手回春', ['selfDrawn']);
 
  def('lastTileClaim', 8, 'Last Tile Claim', '海底捞月', []);
  
  def('outWithReplacement', 8, 'Out with Replacement Tile', '杠上开花', ['selfDrawn']);
 
  def('robbingKong', 8, 'Robbing the Kong', '抢杠和', ['lastTile']);

  // 6 points / faan
  def('allPungs', 6, 'All Pungs', '碰碰和', []);
  
  def('halfFlush', 6, 'Half Flush', '混一色', ['oneVoidedSuit']);
  
  def('mixedShiftedChows', 6, 'Mixed Shifted Chows', '三色三步高', []);
  
  def('allTypes', 6, 'All Types', '五门齐', []);
 
  def('meldedHand', 6, 'Melded Hand', '全求人', ['singleWait']);
 
  def('twoConcealedKongs', 6, 'Two Concealed Kongs', '双暗杠', ['concealedKong', 'twoConcealedPungs']);
  
  def('twoDragonPungs', 6, 'Two Dragon Pungs', '双箭刻', ['dragonPung']);

   // 5 points / faan *special maybe not too sure on this one.
  def('concealedAndMeldedKong', 5, 'Concealed and Melded Kong', '明暗杠', ['concealedKong', 'meldedKong']);

  // 4 points / faan
  def('outsideHand', 4, 'Outside Hand', '全带幺', []);
  
  def('fullyConcealed', 4, 'Fully Concealed Hand', '不求人', ['selfDrawn', 'concealedHand']);
 
  def('twoMeldedKongs', 4, 'Two Melded Kongs', '双明杠', ['meldedKong']);
 
  def('lastTile', 4, 'Last Tile', '和绝张', []);
  
  // 2 points / faan
  def('dragonPung', 2, 'Dragon Pung', '箭刻', []);
 
  def('prevalentWind', 2, 'Prevalent Wind', '圈风刻', []);
  
  def('seatWind', 2, 'Seat Wind', '门风刻', []);
  
  def('concealedHand', 2, 'Concealed Hand', '门前清', []);
  
  def('allChows', 2, 'All Chows', '平和', ['noHonors']);
  
  def('tileHog', 2, 'Tile Hog', '四归一', []);
  
  def('doublePung', 2, 'Double Pung', '双同刻', []);
  
  def('twoConcealedPungs', 2, 'Two Concealed Pungs', '双暗刻', []);
  
  def('concealedKong', 2, 'Concealed Kong', '暗杠', []);
  
  def('allSimples', 2, 'All Simples', '断幺', ['noHonors']);
  
  // 1 point / faan
  def('pureDoubleChow', 1, 'Pure Double Chow', '一般高', []);
 
  def('mixedDoubleChow', 1, 'Mixed Double Chow', '喜相逢', []);
  
  def('shortStraight', 1, 'Short Straight', '连六', []);
  
  def('twoTerminalChows', 1, 'Two Terminal Chows', '老少副', []);
  
  def('pungTerminalsHonors', 1, 'Pung of Terminals or Honors', '幺九刻', []);
 
  def('meldedKong', 1, 'Melded Kong', '明杠', []);
  
  def('oneVoidedSuit', 1, 'One Voided Suit', '缺一门', []);
  
  def('noHonors', 1, 'No Honors', '无字', []);
  
  def('edgeWait', 1, 'Edge Wait', '边张', []);
  
  def('closedWait', 1, 'Closed Wait', '坎张', []);
  
  def('singleWait', 1, 'Single Wait', '单钓将', []);
  
  def('selfDrawn', 1, 'Self-Drawn', '自摸', []);
 
  def('flowers', 1, 'Flower Tiles', '花牌', []);

  Object.assign(api, { CATALOG }); // (tutorial helper)

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MCR = api;
})(typeof window !== 'undefined' ? window : globalThis);