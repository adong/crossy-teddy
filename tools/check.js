#!/usr/bin/env node
/* Headless fairness check for HoppiTTy Hop's row generator. Runs js/world.js in Node, no browser needed.

     node tools/check.js                 normal + easy, 12 worlds of 300 rows each
     node tools/check.js --worlds 40     more worlds
     node tools/check.js --broken        a deliberately unfair generator: must FAIL (proves the check can fail)

   For every world it checks that each train track leaves a long enough gap between trains, measures the
   shortest gap between cars, and walks the whole course zone by zone with the crossing search (from 10 random
   moments per zone, independently of the generator's own check): every road, river (logs reachable, lily pads
   lined up) and set of tracks must be crossable before the inspector's patience runs out. */
'use strict';
const path = require('path');
require(path.join(__dirname, '..', 'js', 'world.js'));
const W = globalThis.CrossyWorld;

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const k = args.indexOf('--' + name);
  return k >= 0 ? Number(args[k + 1]) : dflt;
};
const broken = args.includes('--broken');
const t0 = Date.now();
const report = W.check({ worlds: opt('worlds', 12), rows: opt('rows', 300), samples: opt('samples', 10), seed: opt('seed', 1234), broken });
let ok = true;
for (const [mode, r] of Object.entries(report.modes)) {
  ok = ok && r.ok;
  console.log(`${mode.padEnd(6)} ${r.ok ? 'PASS' : 'FAIL'}  ${r.worlds} worlds, ${r.rows} rows (grass ${r.types.grass}, road ${r.types.road}, river ${r.types.river}, rail ${r.types.rail})`);
  console.log(`       ${r.zones} zones, generator retries ${r.retries}, fallbacks ${r.fallbacks}`);
  console.log(`       shortest gap between trains ${r.minTrainGap} s, shortest gap between cars ${r.minCarWindow} s`);
  for (const f of r.failures.slice(0, 8)) console.log(`       ✗ seed ${f.seed} row ${f.row}: ${f.why}`);
  if (r.failures.length > 8) console.log(`       … ${r.failures.length - 8} more`);
}
console.log(`${broken ? 'broken generator: ' : ''}${ok ? 'all crossable' : 'NOT crossable'} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(broken ? (ok ? 1 : 0) : ok ? 0 : 1);
