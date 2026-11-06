# MCR Mahjong Calculator

A small web app that scores a Mahjong hand under **Mahjong Competition Rules (MCR, 国标麻将)**.
Build a hand from the tile picker and it lists every fan that applies, the total, and the
arrangement of sets it used. Plain HTML, CSS and JavaScript, no framework or build step.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

Run the tests (Node 14+):

```bash
node tests/engine.test.js
```

## Project layout

```
index.html          page skeleton
css/style.css       styling
assets/tiles/       SVG tile artwork (CC0)
js/engine.js        scoring engine (pure functions, no DOM, works in browser and Node)
js/app.js           UI: state, tile picker, rendering
tests/engine.test.js  unit tests for the engine
```

## How the engine works

Tiles are numbers 0-33 (Characters, Dots, Bamboo, 4 winds, 3 dragons). `score(input)`:

1. **Validates** the input (tile counts, hand size = 13 minus 3 per meld, plus the winning tile).
2. **Builds every interpretation** of the hand: standard (4 sets + pair, found by recursive
   decomposition), knitted straight, Seven Pairs, Seven Shifted Pairs, Thirteen Orphans and the
   Honors and Knitted Tiles hands.
3. For each interpretation and each way the **winning tile** could complete it (pair, chow
   position, pung), **collects every fan** that applies. A pung finished by a discard does not
   count as concealed, which matters for Concealed Pungs.
4. **Resolves** the list: higher fans exclude the lower ones they imply (a table in the catalog),
   and combination fans (chow/pung patterns) may not reuse a set. A small search picks the
   best non-overlapping set of combinations.
5. Returns the **highest-scoring** interpretation.

Fans are defined once in `CATALOG` (id, points, English and Chinese name, what it excludes), so
adding or fixing a rule is a one-line change.

## Known limitations (good next steps)

- Exclusion rules are written from memory of the standard EMA table and simplified. Edge cases
  (for example how Three Kongs interacts with individual kong fans, or Nine Gates with
  Fully Concealed Hand) may differ from the official rulebook. Compare against it.
- Wait fans (Edge / Closed / Single Wait) are awarded if *any* interpretation allows them;
  official rules are stricter when a hand has several possible waits.
- No "claimed pung vs. concealed" prompt for a pung finished by discard beyond the discard/self-drawn
  switch, and no check that Last Tile, Robbing the Kong etc. are physically possible.
- Not covered: other rulesets (Riichi, HK, Taiwanese), score payments between players,
  tile-efficiency suggestions.

Ideas to extend it: a "what tile completes my hand?" waits finder, URL-shareable hands,
a fan reference page, other rulesets behind the same `score()` interface.

## Credits and disclaimer

- **Code:** written by Claude (an AI assistant made by Anthropic) and shared **for learning purposes only**. It is not an official scoring tool and is not for commercial use. Do not rely on it for tournament rulings.
- **Inspiration:** the idea and general layout were inspired by [mahjongcalculators.com/mcr](https://mahjongcalculators.com/mcr/). No code or assets were copied from that site.
- **Fan names and point values:** follow the standard 81-fan Mahjong Competition Rules (MCR, 国标麻将) list, as published in the [MCR Rulebook 2006](https://mahjong.dk/hubfs/Mahjong%20documents/MCR/MCR_Rulebook_2006.pdf) (World Mahjong Organization / European Mahjong Association rules). Flower tiles add 1 each.
- **Exclusion rules and edge cases:** written from memory of the commonly published tables and simplified. Check them against the official rulebook before trusting a score.
- **Tile artwork**: mahjong-tiles by zddd312 (https://github.com/zddd312/mahjong-tiles), released under the M+ font licence terms: free to use, copy, distribute and modify, commercially or not, provided "as is" (the licence text is in assets/tiles/LICENSE). The set is put together from lietxia/mahjong_graphic (https://github.com/lietxia/mahjong_graphic) and the I.Mahjong font by 內木一郎 (https://github.com/SyaoranHinata/I.Mahjong). The pictures are in assets/tiles.


## What I (the author) learned
Learn this as a side project because I have been enjoying mahjong and looked up online for some convenience tools. Before, I have been playing and counting the scores by writing on notepads. This process can be tedious and not accurate, so the inspiration comes from the mahjong calculator I have been enjoying, https://mahjongcalculators.com/mcr/. I am playing on MCR point rules.

This made me like mahjong more, and want to know what features can I add for convenience sake for people like me in the future. I learned much from this project. Mainly JavaScript language. 