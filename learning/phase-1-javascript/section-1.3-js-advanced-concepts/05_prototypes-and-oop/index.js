// ╔══════════════════════════════════════════════════════════════════╗
// ║        JAVASCRIPT INTERVIEW PREP — GOOGLE / APPLE LEVEL
// ║             ◆ Prototypes & OOP — MASTER INDEX
// ╚══════════════════════════════════════════════════════════════════╝
//
// This index belongs to JavaScript Phase 1.
// Every numbered file is a deep-dive lesson with runnable code,
// detailed comments, traps, drills, and interview Q&A.
//
// Folder:
//   learning/phase-1-javascript/section-1.3-js-advanced-concepts/05_prototypes-and-oop/
//
// Files:
// ├── index.js
// ├── 01_prototype-chain.js
// ├── 02_proto-vs-prototype.js
// ├── 03_object-create.js
// ├── 04_constructor-functions.js
// ├── 05_es6-classes.js
// ├── 06_class-inheritance.js
// ├── 07_super-keyword.js
// ├── 08_static-methods-properties.js
// ├── 09_private-fields.js
// ├── 10_mixin-pattern.js
// ├── 11_polymorphism.js
// ├── 12_encapsulation.js
//
// Study rule:
//   Do not only read. Predict output, run the file, change it, break it,
//   fix it, and then answer the Q&A without hints.

// ══════════════════════════════════════════════════════════════════
// TOPIC MAP
// ══════════════════════════════════════════════════════════════════
// 01. Prototype chain — The prototype chain is JavaScript's property lookup path.
// 02. __proto__ vs prototype — `prototype` is on constructor functions; `[[Prototype]]` is on objects.
// 03. Object.create() — Object.create makes a new object with a specific prototype.
// 04. Constructor functions — Constructor functions use `new` to initialize instances.
// 05. ES6 Classes — Classes are cleaner syntax over prototype-based behavior.
// 06. Class inheritance — Class inheritance links child prototypes to parent prototypes.
// 07. super keyword — super calls parent constructors and methods.
// 08. Static methods & properties — Static members live on the class constructor, not instances.
// 09. Private fields (#) — Private fields are real language-enforced private state.
// 10. Mixin pattern — Mixins compose reusable behavior without deep inheritance trees.
// 11. Polymorphism — Polymorphism lets different objects respond to the same method name.
// 12. Encapsulation — Encapsulation hides internal state behind a public API.

const topics = [
  "Prototype chain",
  "__proto__ vs prototype",
  "Object.create()",
  "Constructor functions",
  "ES6 Classes",
  "Class inheritance",
  "super keyword",
  "Static methods & properties",
  "Private fields (#)",
  "Mixin pattern",
  "Polymorphism",
  "Encapsulation"
];

console.log("Prototypes & OOP topic count:", topics.length);
console.log(topics.join(" | "));

// Interview drill:
// Pick any topic above and answer:
//   1. What is it?
//   2. What runtime rule controls it?
//   3. What output does the example produce?
//   4. What real bug does it cause?
//   5. How do you fix or avoid that bug?
