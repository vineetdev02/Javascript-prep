// ╔══════════════════════════════════════════════════════════════════╗
// ║        JAVASCRIPT INTERVIEW PREP — GOOGLE / APPLE LEVEL
// ║             ◆ Modern ES6-ES2024 Features — MASTER INDEX
// ╚══════════════════════════════════════════════════════════════════╝
//
// This index belongs to JavaScript Phase 1.
// Every numbered file is a deep-dive lesson with runnable code,
// detailed comments, traps, drills, and interview Q&A.
//
// Folder:
//   learning/phase-1-javascript/section-1.3-js-advanced-concepts/07_modern-es6-es2024-features/
//
// Files:
// ├── index.js
// ├── 01_destructuring-array-object.js
// ├── 02_template-literals.js
// ├── 03_symbol-type.js
// ├── 04_map-vs-object.js
// ├── 05_set-vs-array.js
// ├── 06_generators-iterators.js
// ├── 07_proxy-reflect.js
// ├── 08_optional-chaining.js
// ├── 09_nullish-coalescing.js
// ├── 10_logical-assignment.js
// ├── 11_array-methods-at-findlast.js
// ├── 12_object-entries-fromentries.js
// ├── 13_structuredclone.js
// ├── 14_top-level-await.js
// ├── 15_import-assertions.js
//
// Study rule:
//   Do not only read. Predict output, run the file, change it, break it,
//   fix it, and then answer the Q&A without hints.

// ══════════════════════════════════════════════════════════════════
// TOPIC MAP
// ══════════════════════════════════════════════════════════════════
// 01. Destructuring (array & object) — Destructuring extracts values from arrays and objects by pattern.
// 02. Template literals — Template literals support interpolation, multiline strings, and tags.
// 03. Symbol type — Symbols create unique property keys.
// 04. Map vs Object — Map is designed for dynamic key-value collections.
// 05. Set vs Array — Set stores unique values and gives quick membership checks.
// 06. Generators & iterators — Generators produce lazy iterable sequences with `yield`.
// 07. Proxy & Reflect — Proxy intercepts object operations; Reflect performs default operations.
// 08. Optional chaining (?.) — Optional chaining safely stops on null or undefined.
// 09. Nullish coalescing (??) — Nullish coalescing defaults only on null or undefined.
// 10. Logical assignment (||=, &&=) — Logical assignment combines a logical check with assignment.
// 11. Array methods (.at, .findLast) — Modern array helpers improve negative indexing and reverse search.
// 12. Object.entries / fromEntries — entries/fromEntries convert objects to pairs and back.
// 13. structuredClone() — structuredClone deep-clones supported structured data.
// 14. top-level await — Top-level await allows awaiting directly in ES modules.
// 15. Import assertions — Import assertions/import attributes add metadata to imports.

const topics = [
  "Destructuring (array & object)",
  "Template literals",
  "Symbol type",
  "Map vs Object",
  "Set vs Array",
  "Generators & iterators",
  "Proxy & Reflect",
  "Optional chaining (?.)",
  "Nullish coalescing (??)",
  "Logical assignment (||=, &&=)",
  "Array methods (.at, .findLast)",
  "Object.entries / fromEntries",
  "structuredClone()",
  "top-level await",
  "Import assertions"
];

console.log("Modern ES6-ES2024 Features topic count:", topics.length);
console.log(topics.join(" | "));

// Interview drill:
// Pick any topic above and answer:
//   1. What is it?
//   2. What runtime rule controls it?
//   3. What output does the example produce?
//   4. What real bug does it cause?
//   5. How do you fix or avoid that bug?
