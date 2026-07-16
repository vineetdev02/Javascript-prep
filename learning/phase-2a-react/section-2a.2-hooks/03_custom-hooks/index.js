// ╔══════════════════════════════════════════════════════════════════╗
// ║        REACT INTERVIEW PREP — GOOGLE / APPLE LEVEL
// ║             ◆ Custom Hooks — MASTER INDEX
// ╚══════════════════════════════════════════════════════════════════╝
//
// This index belongs to React Phase 2A, Section 2A.2 — Hooks.
//
// Folder:
//   learning/phase-2a-react/section-2a.2-hooks/03_custom-hooks/
//
// Files:
// ├── index.js
// ├── 01_rules-of-hooks.js
// ├── 02_usefetch-custom-hook.js
// ├── 03_usedebounce-hook.js
// ├── 04_uselocalstorage-hook.js
// ├── 05_usewindowsize-hook.js
// ├── 06_useonclickoutside-hook.js
// ├── 07_useprevious-hook.js
// ├── 08_useinterval-hook.js
// ├── 09_composing-custom-hooks.js
//
// Study rule:
//   Do not only read. Predict output, run the file, change it, break it,
//   fix it, and then answer the Q&A without hints.
//
// WHY THESE SEVEN HOOKS:
//   They are the ones interviewers ask you to BUILD. "Write useDebounce" is
//   a real whiteboard question. Each one is short enough to write in five
//   minutes and deep enough that the details separate people.

// ══════════════════════════════════════════════════════════════════
// TOPIC MAP
// ══════════════════════════════════════════════════════════════════
// 01. Rules of Hooks — call order IS the identity. Both rules fall out of that.
// 02. useFetch — the race condition, res.ok, and why React Query exists.
// 03. useDebounce — the CLEANUP is the debounce. Delete it and it is a delay.
// 04. useLocalStorage — lazy init, SSR, and never trust what is in storage.
// 05. useWindowSize — a firehose. 300 renders to compute one boolean.
// 06. useOnClickOutside — contains(target). Do not try to STOP the event.
// 07. usePrevious — return first, THEN update. The gap IS the previous value.
// 08. useInterval — the interval outlives the render that created it.
// 09. Composing custom hooks — they FLATTEN. That is why hooks beat HOCs.

const topics = [
  "Rules of Hooks",
  "useFetch custom hook",
  "useDebounce hook",
  "useLocalStorage hook",
  "useWindowSize hook",
  "useOnClickOutside hook",
  "usePrevious hook",
  "useInterval hook",
  "Composing custom hooks",
];

console.log("Custom Hooks topic count:", topics.length);
console.log(topics.join(" | "));

// ══════════════════════════════════════════════════════════════════
// THE ONE FACT UNDERNEATH ALL OF THEM
// ══════════════════════════════════════════════════════════════════
//
// A custom hook has NO fiber and NO hook list. It borrows the CALLER's.
//
// Everything follows:
//   • the Rules of Hooks apply INSIDE custom hooks, three levels deep (01)
//   • two components using one hook do NOT share state — separate fibers (09)
//   • hooks FLATTEN, so four levels of nesting is one linear list (09)
//   • the `use` prefix is for the LINTER, not React. React cannot tell.
//
// If someone asks "how do custom hooks work?", that paragraph is the answer.
// They are functions. There is no mechanism.

// ══════════════════════════════════════════════════════════════════
// THE PATTERN THAT APPEARS THREE TIMES
// ══════════════════════════════════════════════════════════════════
//
// 06 (useOnClickOutside), 08 (useInterval), and 02_built-in-hooks/05 §8:
//
//   const savedRef = useRef(callback);
//   useLayoutEffect(() => { savedRef.current = callback; });
//   useEffect(() => {
//     const listener = () => savedRef.current();     // read the BOX at CALL time
//     subscribe(listener);
//     return () => unsubscribe(listener);
//   }, []);                                          // subscribe ONCE
//
// The tension it resolves, every time:
//   deps: [callback] → correct, but resubscribes on every render
//   deps: []         → efficient, but the closure is frozen at render #1
//   ref + deps: []   → BOTH. One subscription, always the latest callback.
//
// Three hooks, one idea. When you see a fourth case, you will recognize it.

// ══════════════════════════════════════════════════════════════════
// THE HONEST TABLE: SHOULD YOU WRITE THESE?
// ══════════════════════════════════════════════════════════════════
//
//   hook               | write it? | what to say instead
//   -------------------|-----------|---------------------------------------
//   useFetch           | ❌ no     | React Query. Server data is a CACHE.
//   useDebounce        | ✅ yes    | 8 lines, and use-debounce for maxWait.
//   useLocalStorage    | ⚠️  maybe  | usehooks-ts, or Zustand's persist.
//   useWindowSize      | ❌ mostly | a CSS media query. Or matchMedia.
//   useOnClickOutside  | ⚠️  maybe  | Radix. This is 60% of a dropdown.
//   usePrevious        | ⚠️  rarely | derive during render, or use a key.
//   useInterval        | ✅ yes    | Dan's version. Or React Query polling.
//
// Notice how many say "no". That is deliberate and it is the senior skill:
// knowing the hook cold AND knowing you would reach for something else.
//
// The interview move for every one of these: BUILD IT, prove you can handle
// the race/staleness/cleanup — then say what you would ship instead, and why.

// ══════════════════════════════════════════════════════════════════
// THE BUGS THESE FILES PROVE
// ══════════════════════════════════════════════════════════════════
//
//   useFetch     : the slow first response overwrites the fast second one
//   useDebounce  : delete the cleanup → 5 requests instead of 1
//   useLocalStorage: JSON.parse('dark') throws → a white screen for returning users
//   useWindowSize: 300 re-renders to compute `isMobile`
//   useOnClickOutside: 'click' closes your modal when the user selects text
//   usePrevious  : move one line into the render body → silently useless
//   useInterval  : logs [0,0,0,0,0] forever while the screen shows 47
//
// Every one is reproduced with real output, not described.

// Interview drill:
// Pick any topic above and answer:
//   1. What is it?
//   2. What runtime rule controls it?
//   3. What output does the example produce?
//   4. What real bug does it cause?
//   5. How do you fix or avoid that bug?

// NEXT SECTION -> section-2a.3-state-management/04_state-patterns/
