/* The keys the ? panel shows. Press ? (Shift + /) in the game, or tap the round ? button.
   The panel and the freeze live in the shared kit: kit/help.js (Kit.help). */
Kit.help.setup({
  title: "HoppiTTy Hop",
  keys: [
    ["hop forward", "↑ W or Space"],
    ["hop sideways", "← → or A D"],
    ["hop back", "↓ or S"],
    ["call your brother", "T"],
    ["easy mode (title)", "E"],
    ["start a run", "Enter or Space"],
    ["pause", "P or Esc"],
    ["sound on / off", "M"],
  ],
  touch: "Tap anywhere to hop forward, or swipe. Tap your brother's face (bottom right) to call him.",
});
