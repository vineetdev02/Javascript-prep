// ╔══════════════════════════════════════════════════════════════════╗
// ║   Optimization Techniques  →  06_dynamic-import.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Dynamic import()
//
// WHAT YOU WILL MASTER HERE:
//   1. import() is an OPERATOR, not a function — and what follows from that
//   2. Static vs dynamic: hoisting, live bindings, and where each is allowed
//   3. The module namespace object — why `.default` keeps appearing
//   4. The module cache: called ten times, fetched once — PROVEN
//   5. Bundler magic comments, and Vite's equivalents
//   6. The React-free uses: heavy libs, polyfills, locales, admin tools
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.4-performance/05_optimization-techniques/06_dynamic-import.js"
//
// Prerequisites: 04 (the strategy) and 05 (React.lazy). This file is the layer
// UNDERNEATH both — the JavaScript feature that makes chunks exist at all.
// Related: 07_modern-es6-es2024-features/14_top-level-await.js.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Dynamic import():
// A syntax form that loads an ES module at RUNTIME and returns a promise for its
// module namespace object — so a module can be fetched conditionally, lazily, or
// from a computed decision, instead of always.
//
// If interviewer says "explain it simply", say:
// "A normal `import` at the top of a file is static — it always runs, before
//  anything else, and the bundler puts that code in the bundle. `import()`
//  written as a call is dynamic — it runs when you reach that line, it returns
//  a promise, and the bundler puts that code in a separate file it fetches at
//  that moment."
//
// If interviewer asks "why does it matter?", say:
// "Two reasons. It's the only way to make loading conditional — 'download the
//  PDF library only if the user clicks Export' — and it's the marker bundlers
//  use to decide where to split. Every chunk in a modern web app exists because
//  someone wrote an import() somewhere. React.lazy, next/dynamic and route-level
//  splitting are all thin wrappers around this one operator."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   import() is a SPLIT POINT the bundler can see
//
// Runtime rule:
//   import(specifier) returns a Promise that resolves to the MODULE NAMESPACE
//   OBJECT — every export, keyed by name, with the default export under
//   `.default`. It does not resolve to the default export.
//
// Practical rule:
//   Use a static import when the module is always needed. Use import() when the
//   module is needed sometimes, later, or on a specific route.
//
// Common trap:
//   `const chart = await import("./chart"); chart();` — you called the namespace
//   object. You wanted `chart.default()` or destructuring. This is exactly the
//   same fact behind React.lazy's `{ default: Component }` contract. → 05 §4
//
// The three things that are true at once:
//
//   import("./x")   is JavaScript      → a promise for a namespace object
//                   is a bundler hint  → emit x as a separate chunk
//                   is a network call  → it can be slow, and it can FAIL


// ══════════════════════════════════════════════════════════════════
// § 3 — IT IS AN OPERATOR, NOT A FUNCTION
// ══════════════════════════════════════════════════════════════════
//
// This looks pedantic until it explains three real behaviours:
//
//   const f = import;            // ❌ SyntaxError. You cannot reference it.
//   import.call(null, "./x");    // ❌ SyntaxError. It has no .call/.apply/.bind.
//   [1, 2].map(import);          // ❌ SyntaxError. It is not a value.
//   const f = m => import(m);    // ✅ wrap it — this IS a function
//
//   import.meta.url              // ✅ `import` is a keyword, so it can carry
//                                //    property-like syntax the parser handles
//
// Why it must be syntax and not a function:
//   1. It needs the CONTEXT of the importing module to resolve a relative
//      specifier. `import("./x")` in /a/b.js means /a/x.js — a plain function
//      passed around could not know where it was called from.
//   2. Bundlers must find split points by reading the source without executing
//      it. A callable value could be aliased, stored, or passed as an argument,
//      and static analysis would be impossible.
//
// The practical consequence, and the thing to actually remember:
//   The specifier should be a LITERAL. Everything a bundler can do for you
//   depends on being able to read it. → 05 §5.

console.log("§3 — what a bundler can and cannot see:\n");

const analysable = [
  ['import("./Chart")',                 "one chunk",                  true],
  ['import("./locales/en.json")',       "one chunk",                  true],
  ['import(userSuppliedPath)',          "nothing — runtime failure",  false],
  ['import("./locales/" + code)',       "EVERY file in ./locales",    false],
  ['import(`./locales/${code}.js`)',    "every match of the pattern", false],
];
for (const [expr, result, good] of analysable) {
  console.log(`    ${expr.padEnd(34)} → ${result} ${good ? "✅" : "🐛"}`);
}
console.log("\n  Rows 4 and 5 are the ones that bite. They do not error — webpack");
console.log("  quietly emits a chunk for every matching file, so a 'lazy' locale");
console.log("  loader can ship 40 languages. Write the map explicitly instead.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — STATIC vs DYNAMIC
// ══════════════════════════════════════════════════════════════════
//
//                        static  import x from "./x"     dynamic  import("./x")
//   ────────────────────  ──────────────────────────────  ─────────────────────────
//   When it runs          Before ANY code in the file     When the line executes
//   Hoisted?              Yes — the whole graph loads      No
//                         before the first statement
//   Allowed where?        Top level only                   Anywhere: functions,
//                                                          conditionals, handlers
//   Returns               live BINDINGS                    a Promise of a namespace
//   Bindings update?      Yes — you see later writes       Snapshot object (its
//                                                          properties are still
//                                                          live getters)
//   Conditional?          No                               Yes
//   Bundle effect         goes IN the bundle               becomes a CHUNK
//   Specifier             must be a literal                should be a literal
//
// The hoisting row is the one people miss:
//
//   console.log("first?");
//   import "./side-effects.js";     // ← runs BEFORE the console.log
//
// Static imports are hoisted and evaluated before any statement in the module.
// That is why you cannot write `if (dev) import "./devtools"` — there is no
// "when" for it to happen at. import() supplies the "when".

console.log("§4 — hoisting, demonstrated:\n");

const executionOrder = [];
function staticImportOf(name) { executionOrder.push(`module:${name}`); }
// Simulating the module system's real order:
staticImportOf("./analytics");     // hoisted — evaluated first
staticImportOf("./polyfills");
executionOrder.push("first statement in my file");

console.log("    " + executionOrder.join("  →  "));
console.log("    ↑ both static imports ran before the file's own first line.");
console.log("\n    with import(), YOU choose the moment:");
const dynamicOrder = ["first statement in my file", "user clicked Export", "module:./pdf"];
console.log("    " + dynamicOrder.join("  →  "));
console.log("");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE MODULE NAMESPACE OBJECT
// ══════════════════════════════════════════════════════════════════

console.log("§5 — what the promise actually resolves to:\n");

// A module written like this:
//
//   export default function generatePDF() {}
//   export const version = "3.1";
//   export function compress() {}
//
// resolves to a namespace object shaped like this:

const namespace = Object.freeze({
  default: function generatePDF() {},
  version: "3.1",
  compress: function compress() {},
  [Symbol.toStringTag]: "Module",
});

console.log("    Object.keys(module) :", JSON.stringify(Object.keys(namespace)));
console.log("    module[Symbol.toStringTag] :", namespace[Symbol.toStringTag]);
console.log("    frozen / sealed      :", Object.isFrozen(namespace), "← you cannot add to it");

console.log("\n    ❌ const pdf = await import('./pdf'); pdf();");
console.log("       → TypeError: pdf is not a function. You called the NAMESPACE.");
console.log("    ✅ const { default: generatePDF, compress } = await import('./pdf');");
console.log("    ✅ const pdf = await import('./pdf'); pdf.default();");

console.log("\n  And this is the same fact as React.lazy's contract:");
console.log("    lazy(() => import('./C'))  works because React reads module.default");
console.log("    lazy(() => import('./C').then(m => ({ default: m.Named })))  remaps it");
console.log("  One rule — 'import() gives you the namespace, not the export' — showing");
console.log("  up in two places. → 05 §4\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE MODULE CACHE
// ══════════════════════════════════════════════════════════════════

console.log("§6 — called many times, fetched once:\n");

// The module registry is keyed by RESOLVED SPECIFIER. Once a module is
// requested, the same promise is handed back forever — so the module is
// fetched once, evaluated once, and its top-level state is shared.

function makeRegistry() {
  const registry = new Map();
  let fetches = 0, evaluations = 0;
  return {
    dynamicImport(specifier) {
      if (!registry.has(specifier)) {
        fetches++;                                 // network
        evaluations++;                             // top-level code runs ONCE
        registry.set(specifier, { default: () => "pdf", _id: fetches });
      }
      return registry.get(specifier);
    },
    stats: () => ({ fetches, evaluations, cached: registry.size }),
  };
}

const reg = makeRegistry();
const results = [];
for (let i = 0; i < 10; i++) results.push(reg.dynamicImport("./pdf"));
reg.dynamicImport("./chart");

console.log("    import('./pdf') called 10× + import('./chart') once:");
console.log("      ", JSON.stringify(reg.stats()));
console.log("      all 10 pdf results are the same object:",
  results.every(r => Object.is(r, results[0])), "✅");

console.log("\n  Three things follow, and all three are asked:");
console.log("    1. Preloading is free. Calling import() on hover and again on click");
console.log("       is ONE request. → 04 §7, 05 §7a");
console.log("    2. Module top-level code runs exactly once, so a module-level cache,");
console.log("       counter or singleton is genuinely shared.");
console.log("    3. You cannot 'unload' or re-import a module to reset it. Cache-bust");
console.log("       with a query string — import(`./m.js?v=${Date.now()}`) — and know");
console.log("       that this creates a SEPARATE module instance, with separate state.");
console.log("       That is the trick behind retry-after-failed-chunk, and also why");
console.log("       careless use of it doubles your module's state.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — BUNDLER CONTROL: MAGIC COMMENTS
// ══════════════════════════════════════════════════════════════════
//
// Webpack reads comments INSIDE the import parentheses:
//
//   import(/* webpackChunkName: "pdf" */ "./pdf")
//     → emits pdf.[hash].js instead of 47.[hash].js. Readable network tabs,
//       readable bundle reports, and stable names across builds.
//
//   import(/* webpackPrefetch: true */ "./Dashboard")
//     → <link rel="prefetch"> — "fetch during IDLE time, I'll probably need it".
//       LOWEST priority. Perfect for the next likely navigation.
//
//   import(/* webpackPreload: true */ "./HeroVideo")
//     → <link rel="preload"> — "fetch NOW, in parallel with the parent chunk".
//       HIGH priority, competes with your critical resources. Rarely correct.
//
//   Two chunks, one name:
//   import(/* webpackChunkName: "admin" */ "./AdminA")
//   import(/* webpackChunkName: "admin" */ "./AdminB")
//     → both land in admin.js. Deliberate grouping — fewer requests for code
//       that is always needed together.
//
// prefetch vs preload, said correctly:
//   prefetch = "later, when idle, for a FUTURE navigation".
//   preload  = "now, at high priority, for THIS navigation".
//   Using preload where you meant prefetch makes your current page slower.
//
// Vite / Rollup do not use magic comments:
//   • Chunk naming: build.rollupOptions.output.manualChunks in vite.config.
//   • Vite injects modulepreload for a dynamic import's own dependency graph
//     automatically — that is the `vite:build-import-analysis` step, and it
//     kills the chunk waterfall that used to come free with nested imports.
//   • import.meta.glob("./pages/*.jsx") is Vite's answer to a computed path:
//     it expands at BUILD time into an explicit map of literal imports, so you
//     get dynamic-looking code that is still statically analysable.

console.log("§7 — prefetch vs preload, priced:\n");

const CHUNK_MS = 300, IDLE_GAP_MS = 2000;
const scenarios = [
  ["nothing         ", "user waits the full fetch after clicking", CHUNK_MS],
  ["webpackPrefetch ", "fetched during idle time before the click", 0],
  ["webpackPreload  ", "fetched immediately — competes with the current page", 0],
];
for (const [name, note, wait] of scenarios) {
  console.log(`    ${name} → post-click wait: ${String(wait).padStart(3)}ms   (${note})`);
}
console.log("\n    ...but preload also DELAYS the current page's critical resources by");
console.log("    competing for bandwidth. prefetch does not. That is the whole");
console.log("    difference, and it is the one people get backwards.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — THE USES THAT HAVE NOTHING TO DO WITH REACT
// ══════════════════════════════════════════════════════════════════

console.log("§8 — five patterns worth naming:\n");

// ── 1. HEAVY LIBRARY BEHIND AN INTERACTION ────────────────────────
//   async function onExport() {
//     const { jsPDF } = await import("jspdf");        // 320KB, on click only
//     new jsPDF().save("report.pdf");
//   }
//   Never loaded for the 95% who don't click. The single highest-value use.
//
// ── 2. CONDITIONAL POLYFILL ───────────────────────────────────────
//   if (!("IntersectionObserver" in window)) {
//     await import("intersection-observer");
//   }
//   Modern browsers pay ZERO. A static import would ship it to everyone.
//
// ── 3. LOCALE / THEME BY VALUE, WITH AN EXPLICIT MAP ──────────────
//   const LOCALES = {                                 // ← literals, so the
//     en: () => import("./locales/en.js"),            //   bundler sees each one
//     hi: () => import("./locales/hi.js"),
//   };
//   const { default: strings } = await LOCALES[lang]();
//   The map is the fix for §3's row 4. Same ergonomics, no folder-wide chunk.
//
// ── 4. DEV-ONLY TOOLING ───────────────────────────────────────────
//   if (process.env.NODE_ENV !== "production") {
//     import("./devtools").then(m => m.install());
//   }
//   The bundler dead-code-eliminates the whole branch in prod, so the chunk is
//   never even emitted.
//
// ── 5. NODE: ESM FROM CJS ─────────────────────────────────────────
//   `require()` cannot load an ESM-only package. `await import("chalk")` can.
//   In a CommonJS file, import() is the ONLY door into the ESM world — which is
//   why you see it in scripts that never touch a browser.

const users = 1000, exportClickRate = 0.05;
const PDF_KB = 320;
const staticCost = users * PDF_KB;
const dynamicCost = Math.round(users * exportClickRate * PDF_KB);

console.log("    'Export to PDF' — 1000 users, 5% click it, library is 320KB:");
console.log("      static import  :", staticCost, "KB shipped 🐛");
console.log("      dynamic import :", dynamicCost, "KB shipped ✅");
console.log("      never downloaded:", staticCost - dynamicCost, "KB",
  `(${Math.round((1 - dynamicCost / staticCost) * 100)}% of it)`);
console.log("\n  And the 5% who DO click wait a few hundred milliseconds — during an");
console.log("  action they already expect to take a moment. That is the trade, and");
console.log("  it is almost always the right one.\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — FAILURE, RETRY, AND import ATTRIBUTES
// ══════════════════════════════════════════════════════════════════

console.log("§9 — a dynamic import is a network request:\n");

// It rejects for ordinary reasons — offline, captive portal, CDN blip — and for
// one that surprises everyone: a DEPLOY. The tab's HTML references hashed chunk
// names that no longer exist. → 04 §8
//
//   try {
//     const m = await import("./Heavy");
//   } catch (err) {
//     // "Failed to fetch dynamically imported module"
//     // "error loading dynamically imported module" (Safari)
//   }
//
// ⚠️ A retry MUST bust the cache. A failed module request is remembered as
//    failed by some engines, so importing the same specifier again can reject
//    instantly without a network attempt.

function importWithRetry(specifier, { attempts = 3, failFirst = 0 } = {}) {
  const requests = [];
  for (let i = 0; i < attempts; i++) {
    const url = i === 0 ? specifier : `${specifier}?retry=${i}`;   // ← cache-busted
    requests.push(url);
    if (i >= failFirst) return { ok: true, requests };
  }
  return { ok: false, requests };
}

console.log("    transient failure then success:");
console.log("      ", JSON.stringify(importWithRetry("./Heavy.js", { failFirst: 1 })), "✅");
console.log("    chunk genuinely gone:");
console.log("      ", JSON.stringify(importWithRetry("./Heavy.js", { failFirst: 9 })), "🐛");
console.log("      → surface a 'Reload' button. A stale tab needs the new index.html.");

// ── IMPORT ATTRIBUTES (ES2025, shipping) ──────────────────────────
//   const data = await import("./config.json", { with: { type: "json" } });
//   Static form: import config from "./config.json" with { type: "json" };
//
//   The older proposal used `assert` instead of `with`; it is deprecated, and
//   Node/Chrome now warn on it. Say `with`. A JSON module's parsed value is on
//   `.default`, like any other default export.
console.log("\n    import attributes: import('./c.json', { with: { type: 'json' } })");
console.log("      (the old `assert` keyword is deprecated — use `with`)\n");


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "x is not a function" after awaiting an import:
//   You used the namespace object instead of `.default`. → §5.
//
// Bug 2 — The bundle got bigger after "lazy loading" locales:
//   A computed specifier made webpack emit every file in the folder. → §3, §8.3.
//
// Bug 3 — "Failed to fetch dynamically imported module" in production:
//   A deploy invalidated hashed chunks under an open tab. → §9.
//
// Bug 4 — A retry that fails instantly with no network request:
//   The failed module is cached as failed. Bust it with a query string. → §9.
//
// Bug 5 — import() inside a render body:
//   A new request-and-promise every render. It belongs in an event handler, an
//   effect, or a module-level lazy(). → 05 §6.
//
// Bug 6 — Prefetching everything:
//   Every route prefetched on load defeats the split — you shipped the whole
//   app again, just later and at low priority. → §7.
//
// Bug 7 — A conditional static import that isn't conditional:
//   `if (dev) { import "./devtools" }` is a syntax error; the hoisted form has
//   no "when". Only import() can be conditional. → §4.
//
// Bug 8 — Two module instances with separate state:
//   Importing the same file through two different specifiers ("./a" and "/src/a")
//   or with a cache-busting query resolves to two registry entries. Singletons
//   silently duplicate.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// Namespace object:
assert(Object.keys(namespace).includes("default"),
  "the promise resolves to the NAMESPACE — the default export is under .default");
assert(Object.keys(namespace).includes("compress"), "...alongside every named export");
assert(namespace[Symbol.toStringTag] === "Module", "its toStringTag is 'Module'");
assert(Object.isFrozen(namespace), "a namespace object is frozen — you cannot extend it");

// Hoisting:
assert(executionOrder[0] === "module:./analytics",
  "static imports are HOISTED — they evaluate before the file's first statement");
assert(executionOrder[2] === "first statement in my file", "...both of them");

// The cache:
assert(reg.stats().fetches === 2,
  "11 import() calls across 2 specifiers → 2 fetches. Keyed by specifier ✅");
assert(reg.stats().evaluations === 2, "...and each module's top-level code ran once");
assert(results.every(r => Object.is(r, results[0])),
  "every call returned the SAME namespace object — which is why preloading is free");

// The payoff:
assert(staticCost === 320000 && dynamicCost === 16000,
  "320,000 KB → 16,000 KB across 1000 users: 95% never download it at all ✅");

// Retry:
assert(importWithRetry("./Heavy.js", { failFirst: 1 }).requests.length === 2,
  "a retry issues a SECOND, cache-busted request");
assert(importWithRetry("./Heavy.js", { failFirst: 1 }).requests[1].includes("?retry="),
  "...busted, because a failed module can be cached as failed 🐛");
assert(importWithRetry("./Heavy.js", { failFirst: 9 }).ok === false,
  "a genuinely missing chunk exhausts the retries → Error Boundary");

console.log("§11 — mini assertions passed for: Dynamic import()");
console.log("\n  The pair that captures it: eleven import() calls produced two network");
console.log("  fetches — the cache is keyed by specifier — and moving one 320KB");
console.log("  library behind a click stopped 95% of users downloading it at all.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is dynamic import()?", answer:
//
//   "It's a syntax form — not a function — that loads a module at runtime and
//    returns a promise for its module namespace object. A static import is
//    hoisted and always runs before any code in the file, so it can't be
//    conditional. import() runs when you reach that line, so it can be inside a
//    click handler, behind a feature flag, or on a route.
//
//    It resolves to the NAMESPACE, not the default export — every export keyed
//    by name, with the default under `.default`. That's why `await import('./pdf')`
//    then calling it gives 'not a function', and it's the same reason React.lazy
//    requires `{ default: Component }`. One rule showing up twice.
//
//    The reason it's syntax rather than a function is that it needs the
//    importing module's context to resolve relative paths, and bundlers have to
//    find split points by reading source without executing it. Which leads to
//    the rule that matters in practice: keep the specifier a literal. A computed
//    path either fails at runtime or makes webpack emit a chunk for every file
//    in the folder — I've seen a 'lazy' locale loader ship forty languages. The
//    fix is an explicit map of arrow functions, one literal import each.
//
//    The module cache is keyed by resolved specifier, so calling import() ten
//    times is one fetch and one evaluation. That's what makes preloading free —
//    hover and click share a request — and it's why module-level state is a real
//    singleton.
//
//    Beyond React, the highest-value use is a heavy library behind an
//    interaction. Moving a 320KB PDF exporter behind the Export button meant 95%
//    of users never downloaded it, and the 5% who did waited a moment during an
//    action they already expected to take one.
//
//    And it's a network request, so it rejects. Usually because a deploy
//    invalidated the hashed chunk an open tab is asking for. Worth knowing that
//    a retry has to bust the cache with a query string, because a failed module
//    can be remembered as failed and reject instantly without touching the
//    network."
//
// The operator-vs-function reasoning, the literal-specifier rule, and the
// cache-busting retry are the details that read as production experience.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does import() return?
// A1. A promise for the module namespace object — all exports, default under
//     `.default`.
//
// Q2. Static vs dynamic?
// A2. Static is hoisted, unconditional, top-level only, and gives live
//     bindings. Dynamic runs on demand, anywhere, and returns a promise.
//
// Q3. Why can't you write a conditional static import?
// A3. Static imports are evaluated before any statement runs. There's no "when"
//     for a condition to attach to.
//
// Q4. Is import() a function?
// A4. No — it's an operator. You can't reference, alias or pass it. It needs
//     the calling module's context, and bundlers need to read it statically.
//
// Q5. What happens if you import the same module ten times?
// A5. One fetch, one evaluation, the same namespace object every time.
//
// Q6. How do you name a chunk?
// A6. Webpack: /* webpackChunkName: "pdf" */. Vite/Rollup: manualChunks in
//     the build config.
//
// Q7. prefetch vs preload?
// A7. prefetch = low priority, during idle, for a future navigation.
//     preload = high priority, now, for this one — and it competes with your
//     current critical resources.
//
// Q8. What breaks with a computed specifier?
// A8. Vite fails; webpack emits a chunk for every matching file. Use an
//     explicit map, or import.meta.glob.
//
// Q9. How do you retry a failed chunk?
// A9. Re-import with a cache-busting query, because a failed module can be
//     cached as failed. Then fall back to a reload.
//
// Q10. How do you load JSON with import()?
// A10. import("./c.json", { with: { type: "json" } }). The old `assert` keyword
//      is deprecated.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What does import() resolve to?
//   Back : The module namespace object. Default export is under .default.
//
// Flashcard 2:
//   Front: Why can't a static import be conditional?
//   Back : It's hoisted and evaluated before any statement in the file.
//
// Flashcard 3:
//   Front: Is import() a function?
//   Back : No — an operator. It needs call-site context and static analysability.
//
// Flashcard 4:
//   Front: import the same module 10 times?
//   Back : One fetch, one evaluation, same namespace object.
//
// Flashcard 5:
//   Front: What's wrong with import("./locales/" + code)?
//   Back : Webpack emits a chunk for every file in the folder. Use a map.
//
// Flashcard 6:
//   Front: prefetch vs preload?
//   Back : prefetch = idle, future navigation. preload = now, this navigation.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "Keep the specifier literal" + "a retry must bust the cache".


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   In a Vite or webpack app, add import() for a heavy library behind a button.
//   Confirm in the network tab that it loads only on click.
//
// Task 2:
//   Log the resolved value of an import() and read the namespace object. Find
//   `default` and Symbol.toStringTag. Try to add a property to it.
//
// Task 3:
//   Write import("./locales/" + lang) and count the emitted chunks. Replace it
//   with an explicit map and count again.
//
// Task 4:
//   Call the same import() ten times. Confirm one request, and that the
//   resolved objects are ===.
//
// Task 5:
//   Add webpackChunkName to three imports and read the network tab. Then add
//   webpackPrefetch and watch when the request fires.
//
// Task 6:
//   Block a chunk in DevTools, catch the rejection, and implement a retry that
//   busts the cache. Then verify the retry actually hits the network.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   import() is an operator that returns a promise for the module NAMESPACE,
//   and it is the split point every bundler looks for.
//
// If you remember the common bug:
//   Using the namespace as if it were the default export — and a computed
//   specifier that ships the whole folder.
//
// If you remember the professional framing:
//   Keep the specifier a literal so the bundler can help you, remember the cache
//   is keyed by specifier (which makes preloading free), and treat every dynamic
//   import as a network request that WILL fail after a deploy.
//
// NEXT TOPIC -> 07_virtualization-react-window.js
