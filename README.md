# JavaScript Prep — From Junior to Senior

A structured, hands-on JavaScript study guide that covers core concepts with real code, deep explanations, and interview-ready questions. Every topic is a standalone `.js` file you can run in any browser console or Node.js.

> **Level:** Junior → Google / Apple Senior

---

## Repository Structure

```
JavaScript/
├── index.html                          # Quick browser runner
├── scripts/
│   ├── Variables & Scope/              # Module 1
│   │   ├── 01_var-vs-let-vs-const.js
│   │   ├── 02_hoisting.js
│   │   ├── 03_temporal-dead-zone.js
│   │   ├── 04_block-vs-function-scope.js
│   │   ├── 05_global-scope-pollution.js
│   │   ├── 06_variable-shadowing.js
│   │   ├── 07_lexical-scoping.js
│   │   ├── 08_scope-chain.js
│   │   ├── 09_closures.js
│   │   └── index.js
│   │
│   └── Functions Deep Dive/            # Module 2
│       ├── 01_declaration-vs-expression.js
│       ├── 02_arrow-vs-regular-function.js
│       ├── 03_iife-pattern.js
│       ├── 04_higher-order-functions.js
│       ├── 05_pure-functions.js
│       ├── 06_first-class-functions.js
│       ├── 07_currying.js
│       ├── 08_partial-application.js
│       ├── 09_function-composition.js
│       ├── 10_default-parameters.js
│       ├── 11_rest-and-spread.js
│       ├── 12_arguments-object.js
│       └── index.js
└── .gitignore
```

---

## Modules

### Module 1 — Variables & Scope

Covers the foundations that every JS developer **must** know cold — from `var` vs `let` vs `const` all the way to closures.

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

Goes beyond the basics into patterns used in production codebases and tested in senior-level interviews.

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

---

## How to Use

### In the Browser
1. Open `index.html` in your browser.
2. Change the `<script src="...">` tag to point to whichever file you want to study.
3. Open **DevTools → Console** to see the output.

### In Node.js
```bash
node "scripts/Variables & Scope/01_var-vs-let-vs-const.js"
```

### Study Tips
- **Read the comments first** — each file is structured like a mini-lesson with sections, examples, and interview questions.
- **Predict before you run** — try to guess the output of each snippet before executing it.
- **Modify and break things** — change values, remove keywords, and see what happens.

---

## What Each File Contains

Every `.js` file follows a consistent format:
- **Header** — topic name and level
- **Concept sections** — progressively deeper explanations with runnable code
- **Interview questions** — with model answers at the end

---

## Contributing

Found a typo or want to add a topic? PRs are welcome. Please follow the existing file naming and formatting conventions.

---

## License

This project is open for learning. Use it, share it, and build on it.
