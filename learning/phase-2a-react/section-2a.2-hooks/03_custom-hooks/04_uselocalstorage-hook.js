// ╔══════════════════════════════════════════════════════════════════╗
// ║   Custom Hooks  →  04_uselocalstorage-hook.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useLocalStorage hook
//
// WHAT YOU WILL MASTER HERE:
//   1. Build it — with the lazy initializer that most versions miss
//   2. The SSR crash: localStorage is not defined on the server
//   3. Why JSON.parse must be in a try/catch (corrupt data is real)
//   4. Two tabs, two truths — and the storage event that fixes it
//   5. Why useSyncExternalStore is the modern answer
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/03_custom-hooks/04_uselocalstorage-hook.js"
//
// Prerequisites: 02_built-in-hooks/01_usestate-internals.js (the lazy
// initializer), 14_usesyncexternalstore.js (the modern version).


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useLocalStorage:
// A useState that persists — it reads its initial value from localStorage and
// writes back on every change.
//
// If interviewer says "explain it simply", say:
// "It has the same API as useState, but the value survives a page reload.
//  Lazy-read from storage on mount, write on every set."
//
// If interviewer asks "why does it matter?", say:
// "Because it looks trivial and has four real traps: it crashes during SSR,
//  it re-reads storage on every render if you skip the lazy initializer, it
//  throws on corrupt JSON, and it does not sync across tabs. Interviewers ask
//  for it precisely because the naive version fails in production."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   useState + a side channel that can lie to you
//
// The naive version:
//
//   function useLocalStorage(key, initial) {
//     const [value, setValue] = useState(
//       JSON.parse(localStorage.getItem(key)) ?? initial   // 🐛🐛🐛
//     );
//     useEffect(() => {
//       localStorage.setItem(key, JSON.stringify(value));
//     }, [key, value]);
//     return [value, setValue];
//   }
//
// Three bugs in one line:
//   1. localStorage is read on EVERY render (no lazy initializer)
//   2. it CRASHES during SSR — there is no localStorage on the server
//   3. JSON.parse throws on corrupt data and takes your whole app down
//
// Runtime rule:
//   localStorage is SYNCHRONOUS and touches disk. Reading it in a render is
//   blocking I/O on the main thread. The lazy initializer is not a
//   micro-optimization here — it is the difference between one disk read and
//   one per render.
//
// Practical rule:
//   Lazy-initialize, try/catch every access, guard for SSR, and use the
//   functional form when writing.
//
// Common trap:
//   useState(readStorage()) instead of useState(() => readStorage()). The
//   argument is EVALUATED every render and thrown away.


// ══════════════════════════════════════════════════════════════════
// § 3 — A FAKE localStorage (instrumented)
// ══════════════════════════════════════════════════════════════════

function createFakeStorage(initial = {}) {
  const store = { ...initial };
  let reads = 0, writes = 0;
  const listeners = [];      // for the `storage` event

  return {
    getItem: (k) => { reads++; return k in store ? store[k] : null; },
    setItem: (k, v) => {
      writes++;
      const oldValue = store[k] ?? null;
      store[k] = String(v);
      // Real localStorage fires `storage` in OTHER tabs, never this one.
      listeners.forEach(fn => fn({ key: k, newValue: String(v), oldValue }));
    },
    removeItem: (k) => { writes++; delete store[k]; },
    onStorage: (fn) => { listeners.push(fn); return () => {
      const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1);
    }; },
    _stats: () => ({ reads, writes }),
    _reset: () => { reads = 0; writes = 0; },
    _raw: () => ({ ...store }),
  };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE LAZY INITIALIZER
// ══════════════════════════════════════════════════════════════════

console.log("§4 — reading storage on every render:\n");

function createMiniReact() {
  const hooks = [];
  let cursor = 0;
  let component = null;

  function useState(initial) {
    const slot = cursor++;
    if (!(slot in hooks)) {
      // THE LAZY INITIALIZER: a function argument is CALLED once, on mount.
      // A value argument was already evaluated by the caller — every render.
      hooks[slot] = { value: typeof initial === "function" ? initial() : initial };
    }
    const setState = (next) => {
      const value = typeof next === "function" ? next(hooks[slot].value) : next;
      if (Object.is(value, hooks[slot].value)) return;
      hooks[slot].value = value;
      render();
    };
    return [hooks[slot].value, setState];
  }

  function useEffect(fn, deps) {
    const slot = cursor++;
    const prev = hooks[slot];
    const changed = !prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps[i]));
    if (changed) {
      if (prev?.cleanup) prev.cleanup();
      hooks[slot] = { deps, cleanup: undefined };
      hooks[slot].cleanup = fn();
    }
  }

  function render() { cursor = 0; return component(); }
  function mount(fn) { component = fn; return render(); }
  return { useState, useEffect, mount, render };
}

// ❌ EAGER — the argument is evaluated on every render
const eagerStorage = createFakeStorage({ theme: '"dark"' });
const R1 = createMiniReact();
let setTheme1;
R1.mount(() => {
  const [theme, set] = R1.useState(JSON.parse(eagerStorage.getItem("theme")));
  //                               ^^^^^^^^^^ evaluated EVERY render, discarded
  setTheme1 = set;
  return theme;
});
setTheme1("light");
setTheme1("dark");
const eagerStats = eagerStorage._stats();

// ✅ LAZY — the function is called once, on mount
const lazyStorage = createFakeStorage({ theme: '"dark"' });
const R2 = createMiniReact();
let setTheme2;
R2.mount(() => {
  const [theme, set] = R2.useState(() => JSON.parse(lazyStorage.getItem("theme")));
  //                               ^^^^^ called ONCE
  setTheme2 = set;
  return theme;
});
setTheme2("light");
setTheme2("dark");
const lazyStats = lazyStorage._stats();

console.log("  3 renders (mount + 2 updates):\n");
console.log("    useState(JSON.parse(ls.getItem(k)))       → storage reads:",
  eagerStats.reads, "🐛");
console.log("    useState(() => JSON.parse(ls.getItem(k))) → storage reads:",
  lazyStats.reads, "✅");
console.log("\n  The eager version read the disk on every render and threw the");
console.log("  result away — useState ignores its argument after mount. It also");
console.log("  ran JSON.parse each time.");
console.log("\n  localStorage is SYNCHRONOUS and hits disk. This is blocking I/O");
console.log("  on the main thread, once per render, for a value that is only");
console.log("  used once. The lazy initializer is not a micro-optimization.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE SSR CRASH
// ══════════════════════════════════════════════════════════════════

console.log("§5 — localStorage is not defined on the server:\n");

// Node has no `window`, so every SSR guard below would think it is always on
// the server. Fake a browser for the rest of this file, and delete it again in
// onServer() to simulate SSR. This is exactly what jsdom does for your tests.
globalThis.window = { fakeBrowser: true };

function readStorage(storage, key, fallback) {
  // The guard. `typeof window === "undefined"` is THE SSR check.
  if (typeof window === "undefined") return fallback;
  try {
    const raw = storage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// Simulate the server: no window, no localStorage.
function onServer(fn) {
  const hadWindow = typeof globalThis.window !== "undefined";
  const saved = globalThis.window;
  delete globalThis.window;
  try { return fn(); } finally { if (hadWindow) globalThis.window = saved; }
}

const storage = createFakeStorage({ theme: '"dark"' });

const naiveOnServer = onServer(() => {
  try {
    // The naive version touches localStorage directly:
    return JSON.parse(globalThis.localStorage.getItem("theme"));
  } catch (e) {
    return "💥 " + e.constructor.name + ": " + e.message.split("\n")[0];
  }
});

const guardedOnServer = onServer(() => readStorage(storage, "theme", "light"));

console.log("  during SSR:");
console.log("    naive   →", naiveOnServer);
console.log("    guarded →", JSON.stringify(guardedOnServer),
  "← the fallback. No crash. ✅");

console.log("\n  ⚠️  But the guard creates a NEW problem — hydration mismatch:");
console.log("     server renders with 'light' (the fallback)");
console.log("     client hydrates and reads 'dark' from storage");
console.log("     → the HTML says light, React says dark → mismatch warning,");
console.log("       and a visible flash of the wrong theme.");
console.log("\n  There is no perfect fix — the server genuinely cannot know what");
console.log("  is in the user's localStorage. The real options:");
console.log("    • render the fallback, then correct it in useEffect (a flash)");
console.log("    • a blocking inline <script> in <head> that sets a class");
console.log("      BEFORE first paint — this is how next-themes kills the flash");
console.log("    • a cookie instead, which the server CAN read");
console.log("\n  Saying 'the theme flash is unavoidable with localStorage + SSR,");
console.log("  which is why theme libraries use a blocking script or a cookie'");
console.log("  is a strong senior answer.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — CORRUPT DATA
// ══════════════════════════════════════════════════════════════════

console.log("§6 — JSON.parse on whatever is in there:\n");

const corrupt = createFakeStorage({
  good: '{"name":"Vineet"}',
  broken: "{not json",              // a failed write, or another app's key
  legacy: "dark",                   // written before you added JSON.stringify
});

const cases = ["good", "broken", "legacy", "missing"];
console.log("  key      | raw value          | naive JSON.parse | guarded");
console.log("  ---------|--------------------|------------------|--------");
for (const key of cases) {
  const raw = corrupt.getItem(key);
  let naive;
  try {
    naive = JSON.stringify(JSON.parse(raw));
  } catch (e) {
    naive = "💥 " + e.constructor.name;
  }
  const guarded = JSON.stringify(readStorage(corrupt, key, "fallback"));
  console.log(`  ${key.padEnd(8)} | ${String(raw).padEnd(18)} | ` +
    `${String(naive).padEnd(16)} | ${guarded}`);
}

console.log("\n  Look at 'legacy'. A plain string 'dark' — written by YOUR OWN");
console.log("  app before you added JSON.stringify. JSON.parse('dark') throws.");
console.log("  You shipped a version bump and every returning user got a white");
console.log("  screen. This is a real, common outage.");
console.log("\n  localStorage is shared across your whole origin and persists");
console.log("  for years. It WILL contain data from an old version of your app,");
console.log("  a different app on the same domain, a browser extension, or a");
console.log("  user who edited it. Never trust it. try/catch is mandatory.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — TWO TABS, TWO TRUTHS
// ══════════════════════════════════════════════════════════════════

console.log("§7 — the multi-tab problem:\n");

// Tab A and Tab B, both using useLocalStorage("theme"):
const shared = createFakeStorage({ theme: '"dark"' });

// WITHOUT the storage event: each tab has its own useState copy.
let tabA = JSON.parse(shared.getItem("theme"));
let tabB = JSON.parse(shared.getItem("theme"));

// The user changes the theme in tab A:
shared.setItem("theme", '"light"');
tabA = "light";                         // tab A's setState ran

console.log("  user switches to light in Tab A:");
console.log("    localStorage:", shared._raw().theme);
console.log("    Tab A shows :", JSON.stringify(tabA));
console.log("    Tab B shows :", JSON.stringify(tabB), "🐛 STALE");
console.log("\n  Tab B's useState never heard about it. It will keep rendering");
console.log("  the old theme until someone reloads — and if Tab B writes, it");
console.log("  overwrites Tab A's change with stale data.");

// WITH the storage event:
const shared2 = createFakeStorage({ theme: '"dark"' });
let tabC = JSON.parse(shared2.getItem("theme"));
let tabD = JSON.parse(shared2.getItem("theme"));

// Tab D subscribes to the `storage` event — fired by OTHER tabs only.
const unsub = shared2.onStorage((e) => {
  if (e.key === "theme") tabD = JSON.parse(e.newValue);
});

shared2.setItem("theme", '"light"');
tabC = "light";

console.log("\n  the same thing, with a `storage` listener in the hook:");
console.log("    Tab C shows:", JSON.stringify(tabC));
console.log("    Tab D shows:", JSON.stringify(tabD), "✅ synced");
unsub();

console.log("\n  The fix:");
console.log("    useEffect(() => {");
console.log("      const onStorage = (e) => {");
console.log("        if (e.key === key) setValue(JSON.parse(e.newValue));");
console.log("      };");
console.log("      window.addEventListener('storage', onStorage);");
console.log("      return () => window.removeEventListener('storage', onStorage);");
console.log("    }, [key]);");
console.log("\n  ⚠️  The `storage` event does NOT fire in the tab that made the");
console.log("     change — only in OTHER tabs. That asymmetry surprises people");
console.log("     and is worth knowing: it is why you still need your own");
console.log("     setState locally.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — THE COMPLETE HOOK
// ══════════════════════════════════════════════════════════════════
//
//   function useLocalStorage(key, initialValue) {
//     // 1. LAZY read, SSR-guarded, try/catch'd.
//     const [value, setValue] = useState(() => {
//       if (typeof window === "undefined") return initialValue;
//       try {
//         const raw = window.localStorage.getItem(key);
//         return raw === null ? initialValue : JSON.parse(raw);
//       } catch {
//         return initialValue;                      // corrupt → fall back
//       }
//     });
//
//     // 2. Write on change. Functional form so it never goes stale.
//     const setStoredValue = useCallback((next) => {
//       setValue(prev => {
//         const resolved = next instanceof Function ? next(prev) : next;
//         try {
//           window.localStorage.setItem(key, JSON.stringify(resolved));
//         } catch (e) {
//           // QuotaExceededError, or Safari private mode. Keep the state.
//           console.warn("localStorage write failed", e);
//         }
//         return resolved;
//       });
//     }, [key]);
//
//     // 3. Sync across tabs.
//     useEffect(() => {
//       const onStorage = (e) => {
//         if (e.key !== key || e.newValue === null) return;
//         try { setValue(JSON.parse(e.newValue)); } catch { /* ignore */ }
//       };
//       window.addEventListener("storage", onStorage);
//       return () => window.removeEventListener("storage", onStorage);
//     }, [key]);
//
//     return [value, setStoredValue];
//   }
//
// Note the write try/catch — the trap nobody mentions. setItem THROWS:
//   • QuotaExceededError when storage is full (~5MB per origin)
//   • in Safari private browsing, historically, on every write
//   • when the user has disabled storage entirely
// An unhandled throw there takes down your event handler.


// ══════════════════════════════════════════════════════════════════
// § 9 — THE MODERN ANSWER: useSyncExternalStore
// ══════════════════════════════════════════════════════════════════
//
// Everything above describes a value that lives OUTSIDE React and can change
// without React knowing. That is the exact definition of an external store.
//
//   function useLocalStorage(key, initialValue) {
//     const value = useSyncExternalStore(
//       subscribe,                          // the `storage` event
//       () => localStorage.getItem(key),    // getSnapshot — a STRING. Stable ✅
//       () => null                          // getServerSnapshot — SSR-safe
//     );
//     return value === null ? initialValue : JSON.parse(value);
//   }
//
// Why this is better:
//   • getServerSnapshot handles SSR by DESIGN, not by a typeof guard
//   • no tearing — every component reading that key sees one value
//   • no manual event wiring
//
// Note the deliberate detail: getSnapshot returns the raw STRING, and the
// JSON.parse happens after. If getSnapshot returned the parsed OBJECT, it
// would be a new object every call → infinite loop.
// → 02_built-in-hooks/14_usesyncexternalstore.js §6
//
// The interview line:
//   "The useState version works, but localStorage IS an external store, so
//    useSyncExternalStore is the right primitive — SSR and tearing fall out of
//    the API instead of being patched in. In practice I'd use usehooks-ts or
//    Zustand's persist middleware rather than hand-roll it."


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "localStorage is not defined" during SSR:
//   No typeof window guard. → §5. Instant Next.js build failure.
//
// Bug 2 — Hydration mismatch + a theme flash:
//   The guard's fallback differs from the client's real value. → §5.
//
// Bug 3 — A white screen for returning users after a deploy:
//   JSON.parse on data written by an older version. → §6.
//
// Bug 4 — Disk read on every render:
//   No lazy initializer. → §4.
//
// Bug 5 — Tabs out of sync, and one overwrites the other:
//   No storage listener. → §7.
//
// Bug 6 — The handler throws in Safari private mode:
//   setItem can throw. Wrap the WRITE too. → §8.
//
// Bug 7 — QuotaExceededError at 5MB:
//   Someone stored an image as base64. Same fix: catch it.
//
// Bug 8 — Storing a JWT in localStorage:
//   Not a bug in the hook — a SECURITY issue. Any XSS reads it. Use an
//   httpOnly cookie for tokens. Worth saying if the interviewer mentions auth.
//
// Bug 9 — Values that survive too long:
//   No versioning. Add a namespace: `myapp:v2:theme`. Then a schema change
//   is a new key, not a parse crash.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The lazy initializer:
assert(eagerStats.reads === 3, "eager: localStorage read on ALL 3 renders 🐛");
assert(lazyStats.reads === 1, "lazy: read exactly ONCE, on mount ✅");
assert(eagerStats.reads > lazyStats.reads, "the initializer argument is evaluated every render");

// SSR:
assert(typeof naiveOnServer === "string" && naiveOnServer.startsWith("💥"),
  "the naive version CRASHES on the server — there is no localStorage");
assert(guardedOnServer === "light",
  "the guarded version returns the fallback...");
assert(guardedOnServer !== JSON.parse(storage.getItem("theme")),
  "...which DIFFERS from the client's real value → hydration mismatch + flash");

// Corrupt data:
assert(readStorage(corrupt, "good", "fallback").name === "Vineet", "valid JSON parses");
assert(readStorage(corrupt, "broken", "fallback") === "fallback",
  "corrupt JSON falls back instead of crashing");
assert(readStorage(corrupt, "legacy", "fallback") === "fallback",
  "a plain string written by an OLD version of your app would throw — caught");
assert(readStorage(corrupt, "missing", "fallback") === "fallback", "a missing key falls back");

let threw = false;
try { JSON.parse(corrupt.getItem("legacy")); } catch { threw = true; }
assert(threw, "JSON.parse('dark') genuinely throws — this is the deploy outage");

// Multi-tab:
assert(tabA === "light" && tabB === "dark",
  "without a storage listener, Tab B is STALE — two tabs, two truths 🐛");
assert(tabC === tabD && tabD === "light",
  "with the storage event, both tabs agree ✅");

console.log("§11 — mini assertions passed for: useLocalStorage");
console.log("\n  The one that bites hardest: JSON.parse('dark') throws. That is");
console.log("  YOUR OWN data, from before you added stringify — a white screen");
console.log("  for every returning user, shipped by a one-line change.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "write useLocalStorage", say this while writing:
//
//   "Same API as useState, but persisted. The subtleties are what make it an
//    interview question.
//
//    First, the initializer has to be lazy — useState(() => read()), not
//    useState(read()). Otherwise the argument is evaluated on every render and
//    thrown away, and since localStorage is synchronous disk I/O, that's
//    blocking the main thread on every render for a value used once.
//
//    Second, SSR. localStorage doesn't exist on the server, so the naive
//    version crashes the build. You guard with typeof window — but that
//    creates a hydration mismatch, because the server renders the fallback and
//    the client reads the real value. That's the theme flash everyone has seen.
//    There's no clean fix in React; it's why next-themes uses a blocking inline
//    script before first paint, or you use a cookie the server can read.
//
//    Third, try/catch around the parse — and this one is a real outage. If an
//    older version of your app wrote a plain string 'dark' and you now
//    JSON.parse it, it throws, and every returning user gets a white screen
//    from a one-line change. localStorage persists for years and is shared
//    across the whole origin, so it will contain data you didn't write. I'd
//    also catch the WRITE — setItem throws on quota exceeded and in Safari
//    private mode.
//
//    Fourth, multi-tab. Each tab has its own useState, so changing the theme
//    in tab A leaves tab B stale, and tab B can overwrite it. You subscribe to
//    the storage event — noting it fires only in OTHER tabs, never the one
//    that wrote.
//
//    Honestly though: localStorage is an external store that changes without
//    React knowing, so useSyncExternalStore is the right primitive — SSR and
//    tearing fall out of the API rather than being patched in. In real work I'd
//    use usehooks-ts or Zustand's persist."
//
// The legacy-string outage and the flash explanation are what land here.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Why the lazy initializer?
// A1. A value argument is evaluated every render and discarded. localStorage
//     is synchronous disk I/O — that is blocking the main thread for nothing.
//
// Q2. What breaks during SSR?
// A2. localStorage is undefined — a crash. Guard with typeof window, and then
//     accept a hydration mismatch, because the server cannot know the value.
//
// Q3. How do you avoid the theme flash?
// A3. Not from React. A blocking inline script that sets a class before paint,
//     or a cookie the server can read.
//
// Q4. Why try/catch the parse?
// A4. Storage persists for years across your whole origin. Old versions,
//     other apps, and users all put things there. JSON.parse('dark') throws.
//
// Q5. Can setItem throw?
// A5. Yes — QuotaExceededError at ~5MB, and historically in Safari private
//     mode. Wrap the write too.
//
// Q6. How do you sync tabs?
// A6. The `storage` event. Note it fires only in OTHER tabs, not the writer.
//
// Q7. Why is useSyncExternalStore better?
// A7. localStorage IS an external store. You get getServerSnapshot for SSR and
//     no tearing, instead of patching both in.
//
// Q8. Why must getSnapshot return the raw string?
// A8. Returning a parsed object creates a new reference every call → infinite
//     loop. Parse after.
//
// Q9. Should you store a JWT there?
// A9. No. Any XSS can read it. httpOnly cookies for tokens.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is useLocalStorage?
//   Back : useState that persists. Lazy read, write on change.
//
// Flashcard 2:
//   Front: Why lazy-initialize?
//   Back : Otherwise it is synchronous disk I/O on every render.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : No try/catch. JSON.parse('dark') throws — a white screen for
//          returning users.
//
// Flashcard 4:
//   Front: What breaks in SSR?
//   Back : localStorage is undefined. Guard it, then accept a hydration flash.
//
// Flashcard 5:
//   Front: How do you sync tabs?
//   Back : The `storage` event — which never fires in the writing tab.
//
// Flashcard 6:
//   Front: What is the modern version?
//   Back : useSyncExternalStore. getSnapshot returns the STRING, not the parse.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Explain why the theme flash is unfixable in React, and why tokens
//          do not belong there.


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write the §8 hook from memory. Four musts: lazy, SSR guard, try/catch
//   both ways, storage listener.
//
// Task 2:
//   Reproduce the legacy-string outage: write 'dark' unstringified, then read
//   it with JSON.parse. That is the deploy that broke production.
//
// Task 3:
//   Rewrite it with useSyncExternalStore. Prove that returning the parsed
//   object loops, and the raw string does not.
//
// Task 4:
//   Add versioned keys — `myapp:v2:theme` — and a migration from v1. Now a
//   schema change is a new key instead of a crash.
//
// Task 5:
//   Simulate QuotaExceededError on setItem. Does your component survive?
//   Should the state still update if the write failed? Defend your answer.
//
// Task 6:
//   Explain in 60 seconds why the theme flashes on every page load with SSR,
//   and why React alone cannot fix it.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Lazy-initialize, and never trust what is in storage.
//
// If you remember the common bug:
//   JSON.parse on data your old version wrote throws, and every returning
//   user gets a white screen.
//
// If you remember the professional framing:
//   localStorage is an external store — useSyncExternalStore is the right
//   primitive. The SSR flash is unfixable in React; use a script or a cookie.
//
// NEXT TOPIC -> 05_usewindowsize-hook.js
