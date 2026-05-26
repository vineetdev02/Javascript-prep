# JSHub — JavaScript Interview Prep

A structured, hands-on JavaScript study environment built as a local web app. Deep-dive topics from junior to Google/Apple senior level, a live code playground, and a visual pattern gallery — all running in your browser, no server required.

> **Level:** Junior → Google / Apple / Meta Senior

---

## Screenshots

### Home
![Home page](docs/screenshots/home.png)

### Playground
![Playground with live output](docs/screenshots/playground.png)

### Pattern Gallery
![Pattern gallery](docs/screenshots/patterns.png)

> **To add screenshots:** save your browser screenshots as `docs/screenshots/home.png`, `playground.png`, and `patterns.png`.

---

## The Web App (`index.html`)

Open `index.html` directly in Chrome or Edge — no build step, no server needed.

```
file:///path/to/JavaScript/index.html
```

Three views, navigated from the top bar:

### Home
Landing page with module overview, animated stats, and feature cards. Shows what each module covers and links you straight to the Playground or Patterns.

### Playground
A full code editor (CodeMirror with VS Code Dark+ syntax highlighting) with a live console output panel.

**Features:**
- Draggable resizer between editor and output
- `Ctrl+Enter` to run code
- Console output captured with line numbers and color-coded by type (log / warn / error / info)
- 5 built-in snippet buttons: Hello World, Closure Demo, Arrow vs Regular, Array HOF, Hoisting

**Pattern Integration (new):**

The `🔷 Patterns ▾` button in the Playground header gives you full read/write access to your `scripts/patterns/` files:

| Action | How |
|--------|-----|
| Load existing pattern | Click `🔷 Patterns ▾` → click any listed pattern → code loads in editor + auto-runs |
| Edit a pattern | Modify code in editor → press `💾 Save Pattern` or `Ctrl+S` |
| Create new pattern | Click `＋ New Pattern` → auto-incremented filename (pattern2.js, pattern3.js…) → edit → save |
| Validation | Code is validated before saving — must return `{ title, output }` with no errors |
| Error feedback | If code errors or returns wrong shape, save is blocked and the error is shown |

On first use the browser will ask for folder access — navigate to and select your `scripts/patterns/` folder. That permission persists for the session.

> **Browser requirement:** Chrome or Edge 86+. Firefox does not support the File System Access API.

### Pattern Gallery
Auto-loads all `scripts/patterns/pattern1.js`, `pattern2.js`, … and renders each one as a glowing card showing the title and output. Add or edit patterns via the Playground and they'll appear here on the next visit to Patterns.

---

## Learning Modules (`learning/`)

All course content lives in the `learning/` folder. JavaScript Phase 1 is now complete: 8 modules, 93 runnable lesson files.

```
learning/
├── 01_variables-and-scope/             # 9 topics
├── 02_functions-deep-dive/             # 12 topics
├── 03_this-keyword/                    # 9 topics
├── 04_asynchronous-javascript/         # 18 topics
├── 05_prototypes-and-oop/              # 12 topics
├── 06_closures-and-memory/             # 9 topics
├── 07_modern-es6-es2024-features/      # 15 topics
└── 08_error-handling-and-debugging/     # 9 topics
```

### Module 1 — Variables & Scope

| # | Topic | Key Concepts |
|---|-------|--------------|
| 01 | var vs let vs const | Declaration keywords, reassignment rules, `const` ≠ immutable |
| 02 | Hoisting | `var` hoisting vs `let`/`const` behavior, function hoisting |
| 03 | Temporal Dead Zone | TDZ mechanics, why it exists, common pitfalls |
| 04 | Block vs Function Scope | How `{}` creates scope boundaries |
| 05 | Global Scope Pollution | Why globals are dangerous, how to avoid them |
| 06 | Variable Shadowing | Inner vs outer scope naming conflicts |
| 07 | Lexical Scoping | How JS resolves variables at author-time |
| 08 | Scope Chain | How the engine walks up the chain to resolve names |
| 09 | Closures | The most powerful (and most asked) scope concept |

### Module 2 — Functions Deep Dive

| # | Topic | Key Concepts |
|---|-------|--------------|
| 01 | Declaration vs Expression | 3 ways to define functions, hoisting differences |
| 02 | Arrow vs Regular Function | `this` binding, `arguments`, use-case rules |
| 03 | IIFE Pattern | Immediately Invoked Function Expressions, module pattern |
| 04 | Higher-Order Functions | Functions that accept/return functions |
| 05 | Pure Functions | No side effects, same input → same output |
| 06 | First-Class Functions | Functions as values, callbacks, stored in data structures |
| 07 | Currying | Transforming multi-arg into single-arg chains |
| 08 | Partial Application | Pre-filling arguments for reuse |
| 09 | Function Composition | Combining small functions into pipelines |
| 10 | Default Parameters | ES6 defaults, expressions as defaults, gotchas |
| 11 | Rest & Spread | `...` in parameters vs arguments |
| 12 | Arguments Object | Legacy `arguments`, why rest params are better |

### Module 3 — this Keyword

| # | Topic | Key Concepts |
|---|-------|--------------|
| 01 | this in Global Context | Browser vs Node vs ES module behavior, `globalThis` |
| 02 | this in Object Method | Object-before-the-dot rule, call site behavior |
| 03 | this in Arrow Function | Lexical `this`, arrows in callbacks, bad object methods |
| 04 | this in Class | Constructors, prototype methods, arrow fields, static methods |
| 05 | call vs apply vs bind | Explicit binding, method borrowing, partial application |
| 06 | Explicit vs Implicit Binding | Binding rules and priority order |
| 07 | new Binding | Constructor calls, prototype linkage, `new.target` |
| 08 | Losing this Context | Detached methods, callbacks, bind/wrapper fixes |
| 09 | this in Event Listeners | DOM listener behavior, `target` vs `currentTarget` |

### Module 4 — Asynchronous JavaScript

| # | Topic | Key Concepts |
|---|-------|--------------|
| 01 | Event Loop mechanism | Sync work, microtasks, macrotasks, execution order |
| 02 | Call Stack | LIFO execution, stack unwinding, recursion limits |
| 03 | Web APIs / Node APIs | Host APIs vs ECMAScript core |
| 04 | Callback Queue (macro) | Timers, I/O, UI events as macrotasks |
| 05 | Microtask Queue | Promise/queueMicrotask priority |
| 06 | Promise internals | States, settlement, async handlers |
| 07 | Promise chaining | Return values, thrown errors, chain flow |
| 08 | Promise.all | Parallel work, input order, fail-fast behavior |
| 09 | Promise.allSettled | Partial success handling |
| 10 | Promise.race | First settled promise |
| 11 | Promise.any | First fulfilled promise, `AggregateError` |
| 12 | async/await syntax | Async function promises, readable flow |
| 13 | Error handling in async | Rejections, `catch`, `try/await/catch` |
| 14 | try/catch/finally | Cleanup and return-value traps |
| 15 | Callback hell | Nested callbacks and refactoring |
| 16 | Debounce | Wait until calls stop |
| 17 | Throttle | Limit call frequency |
| 18 | setTimeout vs setInterval | One-shot vs repeated timers |

### Module 5 — Prototypes & OOP

| # | Topic | Key Concepts |
|---|-------|--------------|
| 01 | Prototype chain | Property lookup and inherited properties |
| 02 | `__proto__` vs `prototype` | Object prototype vs constructor prototype |
| 03 | Object.create() | Creating objects with chosen prototypes |
| 04 | Constructor functions | `new`, shared prototype methods |
| 05 | ES6 Classes | Class syntax over prototype behavior |
| 06 | Class inheritance | `extends`, inherited methods |
| 07 | super keyword | Parent constructors and methods |
| 08 | Static methods & properties | Class-level behavior |
| 09 | Private fields (#) | Real private state |
| 10 | Mixin pattern | Composing reusable behavior |
| 11 | Polymorphism | Shared interfaces across object types |
| 12 | Encapsulation | Protecting state through APIs |

### Module 6 — Closures & Memory

| # | Topic | Key Concepts |
|---|-------|--------------|
| 01 | Closure definition | Function plus retained lexical scope |
| 02 | Practical closure examples | Factories, config, callbacks |
| 03 | Module pattern via closures | Private state with IIFEs |
| 04 | Memory leaks via closures | Retained references and cleanup |
| 05 | Garbage collection | Reachability and release patterns |
| 06 | WeakMap / WeakSet | Weak object metadata |
| 07 | WeakRef | Non-owning references |
| 08 | FinalizationRegistry | Cleanup after collection |
| 09 | Memoization implementation | Closure-backed caches |

### Module 7 — Modern ES6–ES2024 Features

| # | Topic | Key Concepts |
|---|-------|--------------|
| 01 | Destructuring | Array/object extraction, defaults, rest |
| 02 | Template literals | Interpolation, multiline strings |
| 03 | Symbol type | Unique keys, hidden-ish metadata |
| 04 | Map vs Object | Dynamic key-value collections |
| 05 | Set vs Array | Uniqueness and membership |
| 06 | Generators & iterators | Lazy sequences and `yield` |
| 07 | Proxy & Reflect | Operation interception |
| 08 | Optional chaining (`?.`) | Safe nested access |
| 09 | Nullish coalescing (`??`) | Defaults only for null/undefined |
| 10 | Logical assignment | `||=`, `&&=`, `??=` behavior |
| 11 | Array methods | `.at()`, `.findLast()` |
| 12 | Object.entries / fromEntries | Object transformation pipelines |
| 13 | structuredClone() | Deep cloning structured data |
| 14 | top-level await | ES module async loading |
| 15 | Import assertions | Import metadata and JSON modules |

### Module 8 — Error Handling & Debugging

| # | Topic | Key Concepts |
|---|-------|--------------|
| 01 | Error types | `TypeError`, `ReferenceError`, meaning from names |
| 02 | Custom Error classes | Domain errors with metadata |
| 03 | try/catch scope | Block scope and catch parameters |
| 04 | Unhandled promise rejection | Escaped async failures |
| 05 | window.onerror | Browser global error capture |
| 06 | console methods | `table`, `time`, `warn`, `trace`, more |
| 07 | Breakpoints in DevTools | Stepping, scope, call stack |
| 08 | Performance profiling | Measuring hot paths |
| 09 | Memory snapshot | Retained objects and leak hunting |

### How to study a file

Every `.js` file in `learning/` follows a consistent format:
- **Header** — topic name, level, what you'll master
- **Concept sections** — progressively deeper explanations with runnable code
- **Interview questions** — with model answers at the end

**Study method:**
1. Read the comments first — each file is a mini-lesson
2. Predict the output of each snippet before running it
3. Copy the code into the Playground to run it and experiment
4. Modify and break things — change values, remove keywords, observe what changes

---

## How to Add a Pattern

**Option A — via Playground (recommended):**
1. Open the Playground
2. Click `🔷 Patterns ▾` → `＋ New Pattern`
3. Grant folder access when prompted (select `scripts/patterns/`)
4. Edit the template — set `title` and write your pattern logic
5. Press `💾 Save Pattern` — validation runs, file is saved automatically

**Option B — manually:**

Create `scripts/patterns/pattern2.js` (increment the number):

```js
window.patterns.push(function () {
  let output = "";

  // your logic here
  for (let i = 5; i >= 1; i--) {
    output += "* ".repeat(i) + "\n";
  }

  return {
    title: "Inverted Triangle",
    output: output
  };
});
```

The Patterns page auto-loads all `pattern1.js`, `pattern2.js`, … files in order.

---

## Repository Structure

```
JavaScript/
├── index.html                        # The web app — open this in Chrome/Edge
├── css/
│   └── style.css                     # Design system (dark neon, glassmorphism)
├── scripts/
│   ├── router.js                     # View navigation
│   ├── home.js                       # Home page view
│   ├── playground.js                 # Playground + pattern editor
│   ├── patterns-view.js              # Pattern gallery view
│   └── patterns/
│       ├── pattern1.js               # Triangle pattern (example)
│       └── pattern2.js, ...          # Your patterns (add more here)
├── learning/
│   ├── 01_variables-and-scope/       # Module 1 — 9 deep-dive files
│   ├── 02_functions-deep-dive/       # Module 2 — 12 deep-dive files
│   ├── 03_this-keyword/              # Module 3 — 9 deep-dive files
│   ├── 04_asynchronous-javascript/   # Module 4 — 18 deep-dive files
│   ├── 05_prototypes-and-oop/        # Module 5 — 12 deep-dive files
│   ├── 06_closures-and-memory/       # Module 6 — 9 deep-dive files
│   ├── 07_modern-es6-es2024-features/# Module 7 — 15 deep-dive files
│   └── 08_error-handling-and-debugging/# Module 8 — 9 deep-dive files
└── docs/
    └── screenshots/                  # App screenshots for this README
```

---

## Running in Node.js

The learning files can also be run directly in Node:

```bash
node "learning/01_variables-and-scope/01_var-vs-let-vs-const.js"
node "learning/02_functions-deep-dive/07_currying.js"
node "learning/03_this-keyword/05_call-vs-apply-vs-bind.js"
node "learning/04_asynchronous-javascript/01_event-loop-mechanism.js"
node "learning/05_prototypes-and-oop/01_prototype-chain.js"
node "learning/06_closures-and-memory/09_memoization-implementation.js"
node "learning/07_modern-es6-es2024-features/13_structuredclone.js"
node "learning/08_error-handling-and-debugging/02_custom-error-classes.js"
```

---

## License

Open for learning. Use it, share it, build on it.
