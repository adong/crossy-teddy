/* HoppiTTy Hop: game content. The kids (Teddy, Tommy and friends) live in the shared kit: kit/roster.js. */

// The friendly inspector from Metro Surfer, who comes with his dog if you stand still too long (not pickable).
// Same look as metro-surfer/js/content.js.
window.CrossyInspector = {
  head: 'human', skin: '#eeb98f', hair: 'short', hairColor: '#6a6a6a', hat: 'cap', hatColor: '#1c2f66',
  badge: true, mustache: true, belly: true, shirt: 'jacket', top: '#27428c', bottom: '#1c2f66', shoes: '#151418',
};

// Treats your buddy hands over.
window.CrossyTreats = [['🍦', 'ICE CREAM'], ['💧', 'WATER'], ['🧃', 'JUICE BOX'], ['🍪', 'COOKIE'], ['🍉', 'WATERMELON'], ['🍌', 'BANANA']];

// What the game-over card says for each way a run can end.
window.CrossyEndings = {
  car: ['BUSTED!', '🚗 BEEP BEEP! A CAR!'],
  truck: ['BUSTED!', '🍦 THE ICE-CREAM TRUCK!'],
  bus: ['BUSTED!', '🚌 THE BUS GOT YOU!'],
  train: ['BUSTED!', '🚇 WHOOSH! THE TRAIN!'],
  splash: ['SPLASH!', '💦 INTO THE RIVER!'],
  swept: ['SPLASH!', '💦 THE LOG FLOATED AWAY!'],
  caught: ['BUSTED!', '🐶 THE INSPECTOR CAUGHT YOU!'],
};
