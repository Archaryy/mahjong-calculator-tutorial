MCR Mahjong Calculator
A web app that scores a Mahjong hand under Mahjong Competition Rules (MCR, 国标麻将). Pick the tiles of a winning hand, say how it was won, and see every scoring pattern (fan), the total, and how the hand was split into sets.

Features
Tile picker with claimed chows, pungs, kongs and concealed kongs
81 MCR scoring patterns plus flower tiles, with the exclusion rules
Special hands: Thirteen Orphans, Seven Pairs, Knitted tiles and more
Shows the arrangement of sets the score is based on
Example hands to try, and a 19-test suite for the scoring engine
How to run
Open index.html in a browser. To run the tests, install Node.js and run node tests/engine.test.js.

How it works
The scoring engine (js/engine.js) has no connection to the page, so it can be tested on its own. It turns the hand into every possible arrangement of four sets and a pair, scores each arrangement, removes the patterns that are swallowed by bigger ones, and keeps the best score. The page (js/app.js) just collects the hand and shows the result.

What I learned
You have to calculate everything and give an if clause for different combinations of a winning hand. Melded or Concealed? Which tiles form the set? Besides Mahjong learning, I learned some parts of writing code in javascript. Thanks to the help of Claude for simplifying parts and breaking down the stages.

Known limitations
The exclusion rules were written from the common EMA table and simplified, so rare edge cases may differ from the official rulebook.