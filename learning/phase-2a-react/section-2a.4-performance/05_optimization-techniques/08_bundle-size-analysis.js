// ╔══════════════════════════════════════════════════════════════════╗
// ║   Optimization Techniques  →  08_bundle-size-analysis.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Bundle size analysis
//
// WHAT YOU WILL MASTER HERE:
//   1. The three sizes a report shows you, and which one is the real one
//   2. How to read a treemap: the four shapes of waste
//   3. Tree shaking — the four conditions, and what silently defeats it
//   4. The barrel-file problem, and why `import { Icon } from "lib"` can cost 400KB
//   5. Duplicate dependencies: the same library, three times, in one bundle
//   6. Budgets in CI — the only fix that survives a year
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.4-performance/05_optimization-techniques/08_bundle-size-analysis.js"
//
// Prerequisites: 04 and 06. Splitting MOVES bytes; this file DELETES them.
// Do this one first in real life — there is no point splitting a bundle whose
// weight is one badly-imported dependency.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Bundle size analysis:
// Inspecting the build output to see exactly which modules contribute how many
// bytes — so you can delete, replace, or defer the ones that are not worth what
// they cost.
//
// If interviewer says "explain it simply", say:
// "You run a plugin that turns the build into a treemap, where each rectangle is
//  a module sized by its bytes. It usually takes about thirty seconds to find
//  something you didn't know was in there — a date library with every locale, an
//  icon set imported whole, or the same package bundled twice."
//
// If interviewer asks "why does it matter?", say:
// "Because it makes the biggest optimization visible, and it's the one that
//  needs no architecture change. Code splitting moves bytes to later; removing a
//  dependency deletes them for every route and every user, forever. And it's the
//  only way to answer 'why is our bundle 1.4MB' with a fact instead of a guess —
//  I'd rather do this before any memoization work, because the numbers usually
//  say the problem was never rendering."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   MEASURE → attribute → delete / replace / defer
//
// Runtime rule:
//   A bundler includes a module if any reachable code imports it. "Reachable"
//   is decided statically, so anything the bundler cannot prove is unused stays
//   in — and side effects make almost everything unprovable.
//
// Practical rule:
//   Look at GZIPPED size, sorted descending, and start at the top. The top three
//   modules are usually more than half the bundle.
//
// Common trap:
//   Optimizing your own components. Your application code is usually 10-20% of
//   the bundle. The other 80% is node_modules, and that is where the wins are.
//
// The three sizes every report shows:
//
//   STAT     the raw source size, before minification.       Ignore it.
//   PARSED   after minification — what the browser PARSES.   ← CPU cost
//   GZIP     what actually crosses the network.              ← transfer cost
//
// Quote gzip (or brotli) for "how big is our bundle". Watch PARSED for
// main-thread cost, because the browser decompresses first and then parses the
// full parsed size. A 900KB parsed / 250KB gzip bundle is a 900KB parse job.


// ══════════════════════════════════════════════════════════════════
// § 3 — READING THE REPORT
// ══════════════════════════════════════════════════════════════════

console.log("§3 — a real-shaped bundle report:\n");

// Sizes are gzipped KB, from a genuinely typical mid-size React app.
const bundle = [
  { module: "moment",                kb: 72,  note: "+ 68KB of locales you never use" },
  { module: "moment/locale/*",       kb: 68,  note: "231 locales, bundled by default" },
  { module: "lodash",                kb: 71,  note: "the WHOLE library for 4 functions" },
  { module: "@mui/icons-material",   kb: 96,  note: "a barrel export — 5 icons used" },
  { module: "chart.js",              kb: 62,  note: "used on ONE route" },
  { module: "react-dom",             kb: 45,  note: "unavoidable" },
  { module: "react",                 kb: 7,   note: "unavoidable" },
  { module: "core-js polyfills",     kb: 38,  note: "targeting IE11 in 2026" },
  { module: "your app code",         kb: 54,  note: "everything you actually wrote" },
  { module: "react-router",          kb: 12,  note: "unavoidable" },
];

const total = bundle.reduce((s, m) => s + m.kb, 0);
const sorted = [...bundle].sort((a, b) => b.kb - a.kb);

console.log("    total (gzipped):", total, "KB\n");
console.log("    " + "module".padEnd(24) + "KB".padStart(5) + "  share");
for (const m of sorted) {
  const share = Math.round((m.kb / total) * 100);
  const bar = "█".repeat(Math.max(1, Math.round(share / 2)));
  console.log(`    ${m.module.padEnd(24)}${String(m.kb).padStart(5)}  ${String(share).padStart(2)}% ${bar}`);
}

const yourCode = bundle.find(m => m.module === "your app code").kb;
console.log("\n    your own code:", yourCode, "KB —",
  Math.round((yourCode / total) * 100) + "% of the bundle");
console.log("    node_modules :", total - yourCode, "KB —",
  Math.round(((total - yourCode) / total) * 100) + "%");
console.log("\n  That ratio is the point of the whole exercise. You could delete a");
console.log("  quarter of your own source and move the number by 4%. Fixing the top");
console.log("  four rows — without deleting a single feature — is the rest of this file.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — THE FOUR SHAPES OF WASTE
// ══════════════════════════════════════════════════════════════════

console.log("§4 — fixing the top four, with no feature loss:\n");

const fixes = [
  {
    what: "moment + locales",
    before: 140,
    after: 7,
    how: "replace with day.js (same API surface for 90% of uses). Or if you " +
         "must keep moment: IgnorePlugin/ContextReplacementPlugin for locales.",
  },
  {
    what: "lodash (whole)",
    before: 71,
    after: 4,
    how: "import get from 'lodash/get' — or lodash-es, which is ESM and " +
         "tree-shakes. `import { get } from 'lodash'` pulls in ALL of it.",
  },
  {
    what: "@mui/icons-material",
    before: 96,
    after: 3,
    how: "import Icon from '@mui/icons-material/Menu' — the deep path, not " +
         "the barrel. → §6",
  },
  {
    what: "chart.js on one route",
    before: 62,
    after: 0,
    how: "not deleted — DEFERRED with a dynamic import. Still 62KB, but only " +
         "for people who open that route. → 04, 06",
  },
  {
    what: "core-js for IE11",
    before: 38,
    after: 6,
    how: "update browserslist to '>0.5%, not dead'. IE11 support ended in 2022.",
  },
];

let saved = 0;
for (const f of fixes) {
  saved += f.before - f.after;
  console.log(`    ${f.what.padEnd(22)} ${String(f.before).padStart(4)}KB → ${String(f.after).padStart(3)}KB   (−${f.before - f.after}KB)`);
}
const after = total - saved;
console.log(`\n    total ${total}KB → ${after}KB   (−${saved}KB, ${Math.round(saved / total * 100)}% smaller)`);
console.log("    ...and not one feature was removed.");

console.log("\n  The four shapes, named — this is the checklist to run:");
console.log("    1. WRONG LIBRARY   — a smaller one does the same job (moment→dayjs).");
console.log("    2. WRONG IMPORT    — the library is fine, the import pulls it all in.");
console.log("    3. WRONG TIMING    — genuinely needed, but not on this screen.");
console.log("    4. WRONG TARGET    — polyfills and transpilation for browsers that");
console.log("                          no longer exist.");
console.log("  A fifth, from §7: the same library present TWICE.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — TREE SHAKING: THE FOUR CONDITIONS
// ══════════════════════════════════════════════════════════════════
//
// Tree shaking = dead-code elimination across module boundaries. It works only
// when ALL FOUR hold. Break any one and the whole library ships.
//
//   1. ESM SYNTAX. import/export is statically analysable; require() is not,
//      because it can be conditional, computed, or reassigned. A CJS-only
//      package cannot be tree-shaken. This is the most common cause.
//
//   2. NO SIDE EFFECTS — or a package.json that says so:
//        "sideEffects": false                       // nothing at import time
//        "sideEffects": ["*.css", "./src/polyfill.js"]   // these DO have them
//      Without this the bundler must assume importing any file might matter
//      (it might register a plugin, patch a prototype, inject CSS), so it keeps
//      the module even if you use nothing from it.
//
//   3. PRODUCTION MODE. Tree shaking runs in the minification pass. A dev build
//      is not evidence of anything. Always measure `build`, never `dev`.
//
//   4. THE BUNDLER CAN SEE THE USAGE. Re-exports through deep barrels,
//      dynamic property access (lib[name]), and namespace imports
//      (`import * as _ from "lodash"`) all defeat it.
//
// The pattern to memorize:
//
//   import _ from "lodash";            // ❌ CJS, no shaking → ~71KB
//   import { get } from "lodash";      // ❌ still CJS → ~71KB. Looks safe. Isn't.
//   import get from "lodash/get";      // ✅ ~4KB — you named the file
//   import { get } from "lodash-es";   // ✅ ~4KB — ESM build, shakes properly

console.log("§5 — tree shaking, condition by condition:\n");

function shakes({ esm, sideEffectsDeclared, production, staticUsage }) {
  return esm && sideEffectsDeclared && production && staticUsage;
}

const configs = [
  ["ESM + sideEffects:false + prod   ", { esm: true, sideEffectsDeclared: true, production: true, staticUsage: true }],
  ["...but the package is CJS        ", { esm: false, sideEffectsDeclared: true, production: true, staticUsage: true }],
  ["...but no sideEffects declared   ", { esm: true, sideEffectsDeclared: false, production: true, staticUsage: true }],
  ["...but measured in dev mode      ", { esm: true, sideEffectsDeclared: true, production: false, staticUsage: true }],
  ["...but `import * as lib`         ", { esm: true, sideEffectsDeclared: true, production: true, staticUsage: false }],
];

const LIB_KB = 71, USED_KB = 4;
for (const [label, cfg] of configs) {
  const ok = shakes(cfg);
  console.log(`    ${label} → ${ok ? `${USED_KB}KB ✅` : `${LIB_KB}KB 🐛`}`);
}
console.log("\n  Four independent conditions, one shared failure mode: the bundle is");
console.log("  silently 17× bigger and nothing warns you. This is exactly why you");
console.log("  MEASURE instead of assuming the import looked fine.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE BARREL FILE PROBLEM
// ══════════════════════════════════════════════════════════════════

console.log("§6 — one import, the whole library:\n");

// A barrel is an index file that re-exports everything:
//
//   // node_modules/@mui/icons-material/index.js
//   export { default as AccessAlarm } from "./AccessAlarm";
//   export { default as Menu } from "./Menu";
//   ... × 2,100
//
// `import { Menu } from "@mui/icons-material"` makes the bundler load and parse
// all 2,100 modules to resolve one name. Best case, tree shaking removes 2,099
// from the OUTPUT but you still paid the build time. Worst case — any of §5's
// four conditions fails — they all ship.

const ICONS_IN_LIB = 2100, ICON_KB = 0.5, ICONS_USED = 5;

const barrelWorst = ICONS_IN_LIB * ICON_KB;
const deepImport = ICONS_USED * ICON_KB;

console.log(`    library has ${ICONS_IN_LIB} icons, you use ${ICONS_USED}:`);
console.log(`      import { Menu } from "@mui/icons-material"          → ${barrelWorst}KB 🐛`);
console.log(`      import Menu from "@mui/icons-material/Menu"         → ${deepImport}KB ✅`);
console.log(`      difference: ${barrelWorst - deepImport}KB for the same five icons`);

console.log("\n  This applies to YOUR barrels too. A `src/components/index.ts` that");
console.log("  re-exports 80 components means importing a Button can pull in the");
console.log("  chart, the editor and the map — through the transitive imports of");
console.log("  components you never touched. Symptoms: slow dev server startup,");
console.log("  slow HMR, and a bundle that resists every attempt to shrink it.");
console.log("\n  The fixes, in order:");
console.log("    1. Import from the deep path. Boring, works everywhere.");
console.log("    2. babel-plugin-transform-imports / MUI's own codemod to rewrite");
console.log("       barrel imports to deep ones automatically.");
console.log("    3. Next.js: optimizePackageImports in next.config — it does the");
console.log("       rewrite for you for known packages.");
console.log("    4. Do not publish deep barrels in your own code. One level is fine.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — DUPLICATE DEPENDENCIES
// ══════════════════════════════════════════════════════════════════

console.log("§7 — the same library, three times:\n");

// npm's tree can install several versions of one package when transitive
// requirements conflict. Every copy ships.

const tree = [
  { path: "node_modules/date-fns",                     version: "3.6.0", kb: 22 },
  { path: "node_modules/@some/ui/node_modules/date-fns", version: "2.30.0", kb: 20 },
  { path: "node_modules/@other/kit/node_modules/date-fns", version: "1.30.1", kb: 18 },
];
const dupTotal = tree.reduce((s, d) => s + d.kb, 0);
for (const d of tree) console.log(`    ${d.version.padEnd(8)} ${String(d.kb).padStart(3)}KB   ${d.path}`);
console.log(`    → ${dupTotal}KB shipped for ONE library 🐛  (${dupTotal - tree[0].kb}KB of pure duplication)`);

console.log("\n  How to find it:");
console.log("    npm ls date-fns          # or: npm ls react — the classic one");
console.log("    npx npm-dedupe / npm dedupe");
console.log("    the analyzer treemap — duplicates appear as identical rectangles");
console.log("      in different folders, which is why the visual view earns its keep");
console.log("\n  How to fix it:");
console.log("    • npm/yarn `overrides` / `resolutions` to force one version");
console.log("    • upgrade the dependency that pins the old one");
console.log("    • peerDependencies exist precisely to prevent this — a library");
console.log("      that lists react as a normal dependency can ship a SECOND React,");
console.log("      which does not just add bytes: two Reacts means two hook");
console.log("      dispatchers, and you get 'Invalid hook call' or hooks silently");
console.log("      reading the wrong state. That is a correctness bug found by a");
console.log("      SIZE tool, which is a good story to have.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — THE TOOLS, AND BUDGETS
// ══════════════════════════════════════════════════════════════════
//
// ── ANALYZE ───────────────────────────────────────────────────────
//   webpack-bundle-analyzer        the classic treemap (webpack, CRA via craco)
//   rollup-plugin-visualizer       the Vite/Rollup equivalent
//   @next/bundle-analyzer          Next.js wrapper; ANALYZE=true npm run build
//   source-map-explorer            works on ANY built JS with a source map —
//                                  including a competitor's production bundle
//   vite build                     prints per-chunk gzip sizes with no plugin
//   npx bundlephobia <pkg>         size + tree-shakeability BEFORE you install
//   Import Cost (VS Code)          the size of an import, inline, as you type
//
// ── PREVENT (this is the part people skip) ────────────────────────
// Analysis is a one-off; a budget is permanent. Without one, the bundle grows
// back within a quarter, because every individual PR adds "only 8KB".
//
//   // package.json — bundlesize / size-limit
//   "size-limit": [{ "path": "dist/assets/index-*.js", "limit": "150 kB" }]
//
//   • Run it in CI and FAIL the build. A warning is ignored; a red check is not.
//   • Lighthouse CI with a performance budget, on every PR.
//   • Webpack's own performance.maxAssetSize / hints: "error".
//   • Post the delta as a PR comment: "+12KB (3 new dependencies)". Making the
//     cost visible at review time changes behaviour more than any audit.
//
// ── THE HABIT ─────────────────────────────────────────────────────
// Check bundlephobia BEFORE adding a dependency. Thirty seconds, and it shows
// size, whether it tree-shakes, and what it depends on. Most oversized bundles
// are twenty decisions nobody measured, not one bad one.

console.log("§8 — a budget, in CI:\n");

const BUDGET_KB = 150;
const builds = [
  { pr: "#412 add date picker",     kb: 148 },
  { pr: "#418 add chart to admin",  kb: 162 },
  { pr: "#419 defer chart import",  kb: 149 },
];
for (const b of builds) {
  const over = b.kb - BUDGET_KB;
  console.log(`    ${b.pr.padEnd(28)} ${b.kb}KB  ${over > 0 ? `❌ FAIL (+${over}KB over budget)` : "✅ pass"}`);
}
console.log("\n  #418 was caught at review, not six months later in a performance");
console.log("  audit — and the fix (#419) was one dynamic import. That is the entire");
console.log("  argument for budgets: the cheapest time to fix bundle size is before");
console.log("  it merges.\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "We tree-shake, so named imports are safe":
//   Not for a CJS package. `import { get } from "lodash"` ships all of lodash.
//   → §5.
//
// Bug 2 — Bundle is huge and no single module looks big:
//   A barrel file. Thousands of small modules. → §6.
//
// Bug 3 — "Invalid hook call" in production only:
//   Two copies of React from a dependency that didn't use peerDependencies.
//   → §7. A size tool found a correctness bug.
//
// Bug 4 — Removing an unused import changed nothing:
//   sideEffects isn't declared, so the bundler kept the module anyway. → §5.2.
//
// Bug 5 — Dev build looks fine, production is enormous (or vice versa):
//   Tree shaking and minification only run in production. → §5.3.
//
// Bug 6 — 68KB of moment locales in a single-language app:
//   Moment bundles all 231 by default. → §4.
//
// Bug 7 — Bundle crept from 180KB to 400KB over a year:
//   No budget in CI. Every PR added "only" a few KB. → §8.
//
// Bug 8 — Optimized components for a week, bundle unchanged:
//   Your code was 15% of it. → §3. Measure before you optimize.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The report:
assert(total === 525, "the example bundle is 525KB gzipped");
assert(yourCode === 54, "your own code is 54KB of it");
assert(Math.round(yourCode / total * 100) === 10,
  "your code is ~10% of the bundle — optimizing it moves almost nothing 🐛");

// The fixes:
assert(saved === 387, "the five fixes remove 387KB");
assert(after === 138, "525KB → 138KB, with zero features removed ✅");
assert(saved / total > 0.7, "that is over 70% of the bundle, from import changes alone");

// Tree shaking:
assert(shakes({ esm: true, sideEffectsDeclared: true, production: true, staticUsage: true }) === true,
  "all four conditions → it shakes ✅");
assert(shakes({ esm: false, sideEffectsDeclared: true, production: true, staticUsage: true }) === false,
  "a CJS package cannot be tree-shaken, however you import it 🐛");
assert(shakes({ esm: true, sideEffectsDeclared: false, production: true, staticUsage: true }) === false,
  "without sideEffects:false the bundler must assume the import matters 🐛");
assert(shakes({ esm: true, sideEffectsDeclared: true, production: false, staticUsage: true }) === false,
  "and none of it runs in dev — never measure a dev build 🐛");

// Barrels:
assert(barrelWorst === 1050 && deepImport === 2.5,
  "a barrel import can cost 1050KB where the deep path costs 2.5KB 🐛");

// Duplicates:
assert(dupTotal === 60 && tree.length === 3,
  "three versions of one library = 60KB where 22KB would do 🐛");

// Budgets:
assert(builds[1].kb > BUDGET_KB && builds[2].kb < BUDGET_KB,
  "the budget failed the PR that broke it, and passed the one that fixed it ✅");

console.log("§10 — mini assertions passed for: Bundle size analysis");
console.log("\n  The pair that captures it: your own code was 10% of the bundle, and");
console.log("  five import-level changes removed 387KB without deleting a feature.");
console.log("  Measure first — the problem is almost never the code you wrote.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how would you reduce a React app's bundle size?", answer:
//
//   "I'd measure before touching anything — webpack-bundle-analyzer, or
//    rollup-plugin-visualizer on Vite, on a PRODUCTION build, and I'd read the
//    gzipped column. In every app I've looked at, my own code was 10-20% of the
//    bundle and node_modules was the rest, so optimizing components first is
//    usually a week spent moving 4%.
//
//    Then I'd sort descending and work down, and the waste is nearly always one
//    of five shapes. Wrong library — moment with 231 locales instead of day.js,
//    140KB to 7. Wrong import — `import { get } from 'lodash'` looks
//    tree-shakeable but lodash is CommonJS, so you ship all 71KB; lodash/get is
//    4KB. Wrong timing — a chart library needed on one route, which is a dynamic
//    import rather than a deletion. Wrong target — core-js polyfills for IE11 in
//    a browserslist nobody updated. And duplicates: npm ls will show you three
//    versions of date-fns, or worse, two Reacts.
//
//    That last one is worth calling out, because two Reacts isn't a size bug —
//    it's two hook dispatchers, so you get 'Invalid hook call' or hooks reading
//    the wrong state. It's a correctness bug found by a size tool.
//
//    On tree shaking I'd be precise, because people over-trust it. It needs four
//    things: ESM syntax, a sideEffects declaration in package.json, a production
//    build, and usage the bundler can statically see. Break any one and the whole
//    library ships with no warning. Barrel files break the last one constantly —
//    importing one icon from a 2,100-icon index makes the bundler load all of
//    them, and if anything else fails you ship all of them too. The fix is the
//    deep import path, or optimizePackageImports in Next.
//
//    The part I'd insist on is what happens after. An audit is a one-off; the
//    bundle grows back, because every PR adds only 8KB. So I'd put size-limit in
//    CI with a hard failure and post the delta as a PR comment. In my example
//    that caught a 162KB build against a 150KB budget at review time, and the fix
//    was one dynamic import. That's the cheapest moment it will ever be fixed."
//
// Naming the five shapes, being precise about tree shaking's four conditions,
// and insisting on a CI budget is what turns this from trivia into a process.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Which size number matters?
// A1. Gzip/brotli for transfer, parsed for main-thread cost. Stat size is
//     noise.
//
// Q2. Why doesn't tree shaking remove unused lodash functions?
// A2. lodash is CommonJS. Static analysis can't prove what's unused. Use
//     lodash-es or deep paths.
//
// Q3. What does "sideEffects": false do?
// A3. Tells the bundler that importing a module does nothing observable, so
//     unused modules can be dropped entirely.
//
// Q4. What's a barrel file and why is it a problem?
// A4. An index that re-exports everything. One named import makes the bundler
//     pull in the whole set, hurting build time and often bundle size.
//
// Q5. How do you find duplicate dependencies?
// A5. npm ls <pkg>, npm dedupe, or identical rectangles in the treemap.
//     Fix with overrides/resolutions.
//
// Q6. Why is having two Reacts worse than large?
// A6. Two hook dispatchers. Invalid hook call errors, or hooks silently
//     reading the wrong state.
//
// Q7. How do you stop the bundle growing back?
// A7. A size budget in CI that fails the build, plus a size delta comment on
//     every PR.
//
// Q8. How do you check a package before installing it?
// A8. bundlephobia — size, gzip, tree-shakeability, and its dependencies.
//
// Q9. Split or delete first?
// A9. Delete. Splitting a bundle whose weight is one bad import just moves the
//     problem.
//
// Q10. Why measure a production build?
// A10. Minification and tree shaking only run there. A dev bundle proves
//      nothing.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Which column do you read?
//   Back : Gzip for network, parsed for CPU. Ignore stat.
//
// Flashcard 2:
//   Front: Tree shaking's four conditions?
//   Back : ESM, sideEffects declared, production build, statically visible usage.
//
// Flashcard 3:
//   Front: Why is `import { get } from "lodash"` 71KB?
//   Back : lodash is CJS. Use lodash/get or lodash-es.
//
// Flashcard 4:
//   Front: What's the barrel problem?
//   Back : One named import loads every re-exported module.
//
// Flashcard 5:
//   Front: Two copies of React — symptom?
//   Back : "Invalid hook call", or hooks reading the wrong state.
//
// Flashcard 6:
//   Front: What stops regression?
//   Back : size-limit in CI, failing the build, plus a PR size delta.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "My code was 10% of the bundle" — measure before optimizing, and
//          make the budget permanent.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Run an analyzer on any real app. Write down the top five modules and what
//   percentage is your own code.
//
// Task 2:
//   Find one library imported wholesale. Switch to deep imports and re-measure.
//
// Task 3:
//   Run `npm ls react` and `npm ls` on your three biggest deps. Look for
//   duplicates.
//
// Task 4:
//   Check three of your dependencies on bundlephobia. Find one where a smaller
//   alternative exists.
//
// Task 5:
//   Add size-limit with a budget 5KB above your current size. Add a dependency
//   and watch CI fail.
//
// Task 6:
//   Compare a dev build and a production build in the analyzer. Note what tree
//   shaking removed.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Measure a production build, read the gzip column, and start at the top.
//   Your own code is rarely the problem.
//
// If you remember the common bug:
//   `import { x } from "cjs-package"` ships the whole package, and a barrel
//   import ships the whole set. Neither warns you.
//
// If you remember the professional framing:
//   Delete before you split, and put a hard size budget in CI — otherwise the
//   bundle grows back, 8KB per pull request.
//
// NEXT TOPIC -> 09_shouldcomponentupdate.js
