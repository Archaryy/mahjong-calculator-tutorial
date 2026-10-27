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

  // Decomposition of mahjong hand. **All ways to split `cc` (counts) into `need` chows/pungs. cc must hold exactly 3*need tiles.

  function enumSets(cc, need) {
    let i = 0;
    while (i < 34 && cc[i] === 0) i++;
    if (i === 34) return need === 0 ? [[]] : [];
    if (need === 0) return [];
    const out = [];
    if (cc[i] >=3) {
        cc[i] -= 3;
        for (const rest of enumSets(cc, need - 1)) out.push([{ type : 'pung', tile: i }].concat(rest));
        cc[i] += 3;
    }
    if (isSuit(i) && numOf(i) <= 7 /* 7-8-9 chow */ && cc[i + 1] > 0 && cc[i + 2] > 0){
        cc[i]--; cc[i + 1]--; cc[i + 2]--;
        for (const rest of enumSets(cc, need - 1)) out.push([{ type: 'chow', tile: i}].concat(rest));
        cc[i]++; cc[i + 1]++; cc[i + 2]++;
    }
    return out;
  }

  // All (sets + pair) decompositions of the counts.
  function decompose(cc, need) {
    const res = [];
    for(let p = 0; p < 34; p++) {
        if (cc[p] < 2) continue;
        cc[p] -= 2;
        for (const sets of enumSets(cc, need)) res.push({ groups: sets, pair: p});
        cc[p] += 2;
    }
    return res;
  }

  Object.assign(api, { enumSets, decompose }); // (tutorial helper)

  // faan counting / finder
  function combos(arr, k) {
    const out = [];
    (function rec(start, cur) {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (let j = start; j < arr.length; j++) {
        cur.push(arr[j]); 
        rec(j + 1, cur); cur.pop();
      }
    }) 
    (0, []);
    return out;
  }

  // faan depend which specific tiles on hand
  function tileFans(c, add) {
    const present = []; // hand array
    for (let i = 0; i < 34; i++) if (c[i]) present.push(i);
    const all = (f) => present.every(f);
    const suits = new Set(present.filter(isSuit).map(suitOf));
    const honors = present.some(isHonor);
    const hasWind = present.some(isWind);
    const hasDragon = present.some(isDragon);

    if (all((i) => GREEN.has(i))) add('allGreen');
    if (all(isTerminal)) add('allTerminals');
    if (all(isHonor)) add('allHonors');
    if (all(isTermOrHonor)) add('allTerminalsAndHonors');
    if (!honors && suits.size === 1) add('fullFlush'); // only have 1 type of suit
    if (honors && suits.size === 1) add('halfFlush'); // only have honors and 1 type of suit
    if (all((i) => isSuit(i) && numOf(i) >= 7)) add('upperTiles');
    if (all((i) => isSuit(i) && numOf(i) >= 4 && numOf(i) <= 6)) add('middleTiles');
    if (all((i) => isSuit(i) && numOf(i) <= 3)) add('lowerTiles');
    if (all((i) => isSuit(i) && numOf(i) >= 6)) add('upperFour');
    if (all((i) => isSuit(i) && numOf(i) <= 4)) add('lowerFour');
    if (all((i) => isSuit(i) && numOf(i) >= 2 && numOf(i) <= 8)) add('allSimples');
    if (all((i) => REVERSIBLE.has(i))) add('reversibleTiles');
    if (suits.size === 3 && hasWind && hasDragon) add('allTypes'); 
    if (!honors) add('noHonors');
    if (suits.size === 2) add('oneVoidedSuit');
  }

  // faan situational hand won
  function situationFans(ctx, hasExposed, add) {
    if (ctx.selfDrawn) add('selfDrawn');
    if(!hasExposed) add(ctx.selfDrawn ? 'fullyConcealed' : 'concealedHand');
    if(ctx.lastTile) add('lastTile');
    if(ctx.lastOfWall) add(ctx.selfDrawn ? 'lastTileDraw' : 'lastTileClaim');
    if(ctx.replacement) add('outWithReplacement');
    if(ctx.robbing) add('robbingKong');
    if(ctx.flowers > 0) add ('flowers', { count: ctx.flowers });
  }

  Object.assign(api, { tileFans, situationFans }); // (tutorial helper)

  // Faan that depends on sets in standard hand (4 sets + pair, knitted straight + ...)
  function standardFans(I, pl, ctx, c, add) {
    const groups = I.groups.map((g, i) => {
      const o = Object.assign({}, g);
      if(g.type === 'pung' || g.type === 'kong') {
        // pung from discarded tile from opponent (not concealed)
        o.cp = g.declared ? g.type === 'kong' && g.concealedKong : !(pl.kind === 'pung' && pl.idx === i && !ctx.selfDrawn);
      }
      return o;
    });

    const pair = I.pair;
    const T = (i) => groups[i].tile;
    const cs = (i) => suitOf(T(i));
    const cn = (i) => numOf(T(i));
    const sortedN = (ids) => ids.map(cn).sort((a, b) => a - b);
    const sameSuit = (ids) => new Set(ids.map(cs)).size === 1;
    const distinctSuits = (ids) => new Set(ids.map(cs)).size === ids.length;
    const run = (n, step) => n.every((v, k) => k === 0 || v - n[k - 1] === step);

    const chowIdx = []; // how many was chow (which ones?)
    const pungIdx = []; // how many was pung (which ones?)
    groups.forEach((g, i) => {
      if(g.type === 'chow') chowIdx.push(i);
      else if (g.type === 'pung' || g.type === 'kong') pungIdx.push(i);
    });
    const full = groups.length === 4;

    // chow combinations
    if(chowIdx.length === 4) {
      const n = sortedN(chowIdx);
      if(chowIdx.every((i) => cs(i) === cs(chowIdx[0]) && cn(i) === cn(chowIdx[0]))) add('quadrupleChow', { uses: chowIdex});
      if (sameSuit(chowIdx) && (run(n, 1) || run(n, 2))) add('fourPureShiftedChows', { uses: chowIdx });
      if (sameSuit(chowIdx) && isSuit(pair) && suitOf(pair) === cs(chowIdx[0]) && numOf(pair) === 5 && n.join() === '1,1,7,7') {
        add('pureTerminalChows', { uses: chowIdx });
      }
      if (isSuit(pair)) {
        const set = new Set(chowIdx.map(cs));
        if (set.size === 2 && !set.has(suitOf(pair)) && numOf(pair) === 5) {
          let ok = true;
          for (const su of set) {
            const ns = chowIdx.filter((i) => cs(i) === su).map(cn).sort((a,b) => a - b);
            if (ns.join() !== '1,7') ok = false;
          }
          if (ok) add('threeSuitedTerminalChows', { uses: chowIdx });
        }
      }
    }

    for (const t of combos(chowIdx, 3)) {
      const n = sortedN(t);
      if (sameSuit(t)) {
        if (n[0] === n[1] && n[1] === n[2]) add('pureTripleChow', { uses: t }); // same suit and number as chow
        else if (run(n, 1) || run(n, 2)) add('pureShiftedChows', { uses: t });
        if (n.join() === '1,4,7') add('pureStraight', { uses: t }); // chows start with 1, 4, and 7 (same suit)
      } else if (distinctSuits(t)) {
        if (n[0] === n[1] && n[1] === n[2]) add('mixedTripleChow', { uses: t });
        if (n.join() === '1,4,7') add('mixedStraight', { uses: t }); // chows start with 1, 4, 7 but from different suits
        if (run(n, 1)) add('mixedShiftedChows', { uses: t });
      }
    }
    for (const p of combos(chowIdx, 2)) {
      const [a, b] = p;
      const na = cn(a), nb = cn(b);
      if (cs(a) === cs(b)) {
        if (na === nb) add('pureDoubleChow', { uses: p });
        else if (Math.abs(na - nb) === 3) add('shortStraight', { uses: p });
        if ((na === 1 && nb === 7) || (na === 7 && nb === 1)) add('twoTerminalChows', { uses: p });
      } else if (na === nb) {
        add('mixedDoubleChow', { uses: p });
      }
    }
    
    // pung combinations (numbered tiles)
    const suitPungs = pungIdx.filter((i) => isSuit(T(i)));
    if (suitPungs.length === 4 && sameSuit(suitPungs) && run(sortedN(suitPungs), 1)) add('fourPureShiftedPungs', { uses: suitPungs }); // must have 4, same suit and numbers shifted with sort
    for (const t of combos(suitPungs, 3)) {
      const n = sortedN(t);
      if (sameSuit(t) && run(n, 1)) add('pureShiftedPungs', { uses: t }); // 3 sets of shifted pungs with same suit
      else if (distinctSuits(t)) {
        if (run(n, 1)) add('mixedShiftedPungs', { uses: t }); // 3 shifted but different Suits
        if (n[0] === n[1] && n[1] === n[2]) add('triplePung', { uses: t });
      }
    }
    for (const p of combos(suitPungs, 2)) {
      if (cs(p[0]) !== cs(p[1]) && cn(p[0]) === cn(p[1])) add('doublePung', { uses: p });
  }

  // individual pung
  pungIdx.forEach((i) => {
      const t = T(i);
      if (isDragon(t)) add('dragonPung', { g: i });
      else if (isWind(t)) {
        let special = false;
        if (t === 27 + ctx.prevalent) { add('prevalentWind', { g: i }); special = true; }
        if (t === 27 + ctx.seat) { add('seatWind', { g: i }); special = true; }
        if (!special) add('pungTerminalsHonors', { g: i });
      } else if (isTerminal(t)) add('pungTerminalsHonors', { g: i });
    });

    const windP = pungIdx.filter((i) => isWind(T(i)));
    const dragP = pungIdx.filter((i) => isDragon(T(i)));
    if (windP.length === 4) add('bigFourWinds');
    if (windP.length === 3) {
      if (isWind(pair)) add('littleFourWinds', { consumes: { pungTerminalsHonors: windP } }); // exclusion of additional faan combination
      add('bigThreeWinds', { consumes: { pungTerminalsHonors: windP } }); // exclusion of additional faan combination
    }
    if (dragP.length === 3) add('bigThreeDragons');
    if (dragP.length === 2) {
      add('twoDragonPungs');
      if (isDragon(pair)) add('littleThreeDragons');
    }

    if (full && pungIdx.length === 4) {
      add('allPungs');
      const even = (t) => isSuit(t) && numOf(t) % 2 === 0;
      if (pungIdx.every((i) => even(T(i))) && even(pair)) add('allEvenPungs');
    }

    // concealed pungs and kongs (difference in faan)
    const cp = pungIdx.filter((i) => groups[i].cp).length;
    if (cp >= 4) add('fourConcealedPungs');
    if (cp >= 3) add('threeConcealedPungs');
    if (cp >= 2) add('twoConcealedPungs');
    const kongC = groups.filter((g) => g.type === 'kong' && g.concealedKong).length;
    const kongE = groups.filter((g) => g.type === 'kong' && !g.concealedKong).length;
    if (kongC + kongE === 4) add('fourKongs');
    if (kongC + kongE === 3) add('threeKongs');
    if (kongC === 2) add('twoConcealedKongs');
    if (kongE === 2) add('twoMeldedKongs');
    if (kongC >= 1 && kongE >= 1) add('concealedAndMeldedKong');
    for (let k = 0; k < kongC; k++) add('concealedKong');
    for (let k = 0; k < kongE; k++) add('meldedKong');

    // whole hand shapes
    if (chowIdx.length === 4 && isSuit(pair)) add('allChows');
    if (full) {
      const outside = groups.every((g) => {
        if (g.type === 'chow') return numOf(g.tile) === 1 || numOf(g.tile) === 7;
        return isTermOrHonor(g.tile);
      }) && isTermOrHonor(pair);
      if (outside) add('outsideHand');

      const five = groups.every((g) => {
        if (g.type === 'chow') return numOf(g.tile) >= 3 && numOf(g.tile) <= 5;
        return isSuit(g.tile) && numOf(g.tile) === 5;
      }) && isSuit(pair) && numOf(pair) === 5;
      if (five) add('allFives');
    }
    if (I.knitted) add('knittedStraight');

    for (let i = 0; i < 34; i++) {
      if (c[i] === 4 && !groups.some((g) => g.type === 'kong' && g.tile === i)) add('tileHog');
    }

    // nine gates (unique one suited concealed hand)
    if (ctx.noMelds) {
      const suits = new Set();
      for (let i = 0; i < 34; i++) if (c[i]) suits.add(suitOf(i));
      if (suits.size === 1 && !suits.has(3)) {
        const s = [...suits][0];
        const base = [3, 1, 1, 1, 1, 1, 1, 1, 3];
        if (base.every((b, k) => c[s * 9 + k] >= b)) add('nineGates');
      }
    }

    // melded hand and waits
    if (full && !ctx.selfDrawn && pl.kind === 'pair' && groups.every((g) => g.declared && !(g.type === 'kong' && g.concealedKong))) {
      add('meldedHand');
    }
    if (pl.kind === 'pair') add('singleWait');
    else if (pl.kind === 'chow') {
      const g = groups[pl.idx];
      if (pl.pos === 1) add('closedWait');
      else if (pl.pos === 2 && numOf(g.tile) === 1) add('edgeWait');
      else if (pl.pos === 0 && numOf(g.tile) === 7) add('edgeWait');
    }
  }

  Object.assign(api, { standardFans }); // (tutorial helper)

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MCR = api;
})(typeof window !== 'undefined' ? window : globalThis);