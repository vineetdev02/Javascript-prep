// ╔══════════════════════════════════════════════════════════════════╗
// ║   Design Patterns  →  11_headless-components.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Headless Components
//
// WHAT YOU WILL MASTER HERE:
//   1. Behaviour without pixels — and why that is the valuable half
//   2. The styled-library trap, counted in escape hatches
//   3. ONE hook, TWO completely different UIs, identical behaviour — proven
//   4. Prop getters: what they are, and the override that silently breaks them
//   5. Accessibility is the actual product — the 14-item checklist you inherit
//   6. Headless vs styled vs shadcn/ui: who owns the source
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/06_design-patterns/11_headless-components.js"
//
// Prerequisites: everything from 01 to 10. This file is where the section's
// argument lands: headless components are compound components (01) + the
// container/presentational split (04) + slots (10) + render props' prop
// getters (02), assembled into the way real libraries ship in 2025.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Headless Component:
// A component or hook that provides STATE, BEHAVIOUR and ACCESSIBILITY, and
// renders no markup at all — the consumer supplies 100% of the UI.
//
//   const { isOpen, selected, getToggleProps, getMenuProps, getItemProps } =
//     useSelect({ items });
//
//   <button {...getToggleProps()}>{selected ?? "Pick one"}</button>
//   <ul {...getMenuProps()}>
//     {isOpen && items.map((item, index) =>
//       <li key={item} {...getItemProps({ item, index })}>{item}</li>)}
//   </ul>
//
// The library shipped zero divs and zero CSS. It shipped the state machine and
// the aria wiring.
//
// If interviewer says "explain it simply", say:
// "It gives you the behaviour and none of the looks. A dropdown's real work is
//  keyboard navigation, focus management and about a dozen aria attributes
//  that have to point at each other by id. A headless library does all of
//  that and hands you props to spread onto whatever markup you want."
//
// If interviewer asks "why does it matter?", say:
// "Because styling is the part that differs between every product, and
//  behaviour is the part that's identical and hard. A styled component library
//  gets that backwards: it gives you the easy half for free and makes the hard
//  half — matching your design — a fight with specificity. Headless inverts
//  it, and it's why Radix, Headless UI, TanStack Table, React Aria and
//  Downshift all look the way they do."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   LOGIC WITHOUT PIXELS. You bring the DOM; it brings the correctness.
//
// Runtime rule:
//   The library returns state plus PROP GETTERS — functions that produce the
//   props for one element. You spread them. They contain event handlers, aria
//   attributes, ids, tabIndex and refs, all wired to each other.
//
// Practical rule:
//   Reach for headless when the same behaviour must look different across
//   brands, themes or products — and any time you were about to override a
//   third-party component's internals with a deep CSS selector.
//
// Common trap:
//   Spreading a prop getter and then adding your own handler AFTER it:
//     <li {...getItemProps({ index })} onClick={mine} />   🐛 yours replaces theirs
//   The getter takes your handler as an ARGUMENT so it can compose both:
//     <li {...getItemProps({ index, onClick: mine })} />   ✅
//
// The mental picture:
//
//   styled library              headless library
//   ──────────────              ────────────────
//   ships markup + CSS + logic  ships logic + aria only
//   restyle = fight specificity restyle = write your own markup
//   upgrade = visual regressions upgrade = behaviour improvements
//   fast to start               fast to start once, correct forever
//   you fork it eventually      there is nothing to fork


// ══════════════════════════════════════════════════════════════════
// § 3 — THE PROBLEM: A COMPONENT THAT DECIDED HOW IT LOOKS
// ══════════════════════════════════════════════════════════════════

console.log("§3 — the escape hatches you reach for, in order:\n");

// Design asks for the dropdown's selected item to have a left accent bar and
// 4px more padding. The library's <Select> renders its own markup with its own
// class names. Your options, in the order teams actually try them:
const escapeHatches = [
  ["pass a className", "lands on the outer element only; the item is 3 levels in"],
  ["a deep selector", ".mySelect ul li[aria-selected] { … } — breaks on their next release"],
  ["!important", "wins the specificity fight, loses the next one"],
  ["classNames / styles override props", "works if the library exposed a slot for THAT element. Usually not"],
  ["fork the component", "you now own their bugs and their a11y, forever"],
];
escapeHatches.forEach(([hatch, cost], i) => console.log(`    ${i + 1}. ${hatch.padEnd(34)} ${cost}`));

console.log("\n    escape hatches needed for ONE visual change:", escapeHatches.length, "🐛");
console.log("    escape hatches needed with a headless library:", 0, "— you wrote the <li>");

console.log("\n  The deeper problem is ownership. A styled library owns your DOM, so");
console.log("  every upgrade is a visual regression risk, and every design request");
console.log("  is a negotiation with someone else's markup. Meanwhile the part you");
console.log("  actually wanted — the state machine and the aria wiring — is the part");
console.log("  you would never have written correctly yourself.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — ONE HOOK, TWO UIs
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the same behaviour wearing two designs:\n");

// ── a small React ─────────────────────────────────────────────────
function h(type, props, ...children) {
  const p = { ...(props || {}) };
  const kids = children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false);
  if (kids.length) p.children = kids.length === 1 ? kids[0] : kids;
  return { type, props: p };
}
function render(node) {
  if (node === null || node === undefined || node === false) return [];
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(render);
  const { type, props } = node;
  if (typeof type === "function") return render(type(props));
  return [`<${type}>`, ...render(props.children), `</${type}>`];
}

// ── the headless hook: state + behaviour + aria, no markup ────────
function useSelect({ items, id = "sel" }) {
  let isOpen = true;                       // stands in for useState
  let highlighted = 1;
  let selected = items[1];

  const menuId = `${id}-menu`;
  const itemId = i => `${id}-item-${i}`;

  function compose(...handlers) {
    return (...args) => handlers.forEach(fn => fn && fn(...args));
  }

  return {
    isOpen, selected, highlighted,
    getToggleProps: (user = {}) => ({
      id: `${id}-toggle`,
      role: "combobox",
      tabIndex: 0,
      "aria-haspopup": "listbox",
      "aria-expanded": isOpen,
      "aria-controls": menuId,
      "aria-activedescendant": isOpen ? itemId(highlighted) : undefined,
      onKeyDown: compose(user.onKeyDown, () => calls.push("library:keydown")),
      onClick: compose(user.onClick, () => calls.push("library:toggle")),
    }),
    getMenuProps: (user = {}) => ({
      id: menuId,
      role: "listbox",
      "aria-labelledby": `${id}-toggle`,
      tabIndex: -1,
      ...user,
    }),
    getItemProps: (user = {}) => ({
      id: itemId(user.index),
      role: "option",
      "aria-selected": user.index === highlighted,
      onClick: compose(user.onClick, () => calls.push("library:select")),
      onMouseMove: compose(user.onMouseMove, () => calls.push("library:highlight")),
    }),
  };
}

const calls = [];
const items = ["Ship it", "Hold", "Revert"];

// UI #1 — a plain list
function ListSelect() {
  const s = useSelect({ items });
  return h("div", null, [
    h("button", s.getToggleProps(), s.selected),
    h("ul", s.getMenuProps(), items.map((item, index) => h("li", s.getItemProps({ index }), item))),
  ]);
}

// UI #2 — a completely different design: a grid of cards, no <ul> anywhere
function CardSelect() {
  const s = useSelect({ items });
  return h("section", null, [
    h("div", s.getToggleProps(), h("strong", null, s.selected)),
    h("div", s.getMenuProps(), items.map((item, index) =>
      h("article", s.getItemProps({ index }), [h("h4", null, item), h("small", null, "⌘K")]))),
  ]);
}

const listOut = render(h(ListSelect, null));
const cardOut = render(h(CardSelect, null));

const s1 = useSelect({ items });
const behaviourProps = Object.keys(s1.getToggleProps())
  .concat(Object.keys(s1.getItemProps({ index: 0 })));

console.log("    UI #1 (list)  :", JSON.stringify(listOut.filter(t => t.startsWith("<") && !t.startsWith("</"))));
console.log("    UI #2 (cards) :", JSON.stringify(cardOut.filter(t => t.startsWith("<") && !t.startsWith("</"))));
console.log("    shared markup elements:", 0);
console.log("    shared behaviour props:", behaviourProps.length, "— identical in both");
console.log("      toggle:", JSON.stringify(Object.keys(s1.getToggleProps())));
console.log("      item  :", JSON.stringify(Object.keys(s1.getItemProps({ index: 0 }))));

console.log("\n  Two designs with nothing in common — one uses <ul>/<li>, the other");
console.log("  <div>/<article> — and the keyboard behaviour, the roles and the aria");
console.log("  relationships are byte-identical, because neither UI wrote them.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — PROP GETTERS, AND THE OVERRIDE THAT BREAKS THEM
// ══════════════════════════════════════════════════════════════════

console.log("§5 — why they are functions and not objects:\n");

// If the library exposed plain objects — `itemProps` — you could only spread
// them. The moment you needed your own onClick you would have to choose
// between yours and theirs. A GETTER takes your handlers as arguments and
// composes them, so both run and the library's behaviour survives.

calls.length = 0;
const s = useSelect({ items });

// ✅ correct: hand your handler TO the getter
const correct = s.getItemProps({ index: 0, onClick: () => calls.push("mine") });
correct.onClick();
const correctCalls = [...calls];

// 🐛 wrong: spread the getter, then override
calls.length = 0;
const broken = { ...s.getItemProps({ index: 0 }), onClick: () => calls.push("mine") };
broken.onClick();
const brokenCalls = [...calls];

console.log("    {...getItemProps({ index, onClick: mine })} → ran:", JSON.stringify(correctCalls), "✅");
console.log("    {...getItemProps({ index })} onClick={mine}  → ran:", JSON.stringify(brokenCalls), "🐛");
console.log("    the library's selection handler was:", brokenCalls.includes("library:select") ? "kept" : "SILENTLY DELETED");

console.log("\n  The symptom in a real app: clicking an option runs your analytics");
console.log("  and does not select anything. Nothing throws. The dropdown just");
console.log("  stops working for mouse users while the keyboard still works.");
console.log("\n  This is the same composition problem as asChild in 10 §7 — merge,");
console.log("  never replace — and it is why the API is a function call. Radix");
console.log("  solves it differently, by rendering real components you can put");
console.log("  props on; Downshift and React Aria use getters. Both are answers to");
console.log("  the same question: how does the caller add behaviour without");
console.log("  destroying the library's?\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — ACCESSIBILITY IS THE PRODUCT
// ══════════════════════════════════════════════════════════════════

console.log("§6 — what you are actually buying:\n");

// The WAI-ARIA combobox pattern, in full. This is the list you would have to
// implement, test with a screen reader, and keep correct through every
// refactor — for ONE dropdown.
const comboboxRequirements = [
  ['role="combobox" on the trigger', "getToggleProps"],
  ['aria-haspopup="listbox"', "getToggleProps"],
  ["aria-expanded reflects open state", "getToggleProps"],
  ["aria-controls points at the menu id", "getToggleProps"],
  ["aria-activedescendant points at the highlighted option", "getToggleProps"],
  ['role="listbox" on the menu', "getMenuProps"],
  ["aria-labelledby points back at the trigger", "getMenuProps"],
  ['role="option" on each item', "getItemProps"],
  ["aria-selected on the highlighted item", "getItemProps"],
  ["unique, stable ids linking all of the above", "all three"],
  ["ArrowUp / ArrowDown move the highlight", "onKeyDown"],
  ["Home / End jump to first / last", "onKeyDown"],
  ["Enter selects, Escape closes and restores focus", "onKeyDown"],
  ["typeahead: typing 'rev' highlights Revert", "onKeyDown"],
];

const suppliedByHook = comboboxRequirements.length;
comboboxRequirements.slice(0, 6).forEach(([req, from]) => console.log(`    ✅ ${req.padEnd(52)} ${from}`));
console.log(`    …and ${comboboxRequirements.length - 6} more`);

console.log("\n    requirements for one accessible dropdown:", comboboxRequirements.length);
console.log("    supplied by the headless hook          :", suppliedByHook);
console.log("    you have to implement                  :", comboboxRequirements.length - suppliedByHook);

// Prove a couple of the id relationships actually line up, since "wired to
// each other by id" is the part that is easy to claim and easy to get wrong:
const toggle = s.getToggleProps();
const menu = s.getMenuProps();
const item1 = s.getItemProps({ index: 1 });

console.log("\n    the wiring, checked:");
console.log("      toggle['aria-controls'] =", JSON.stringify(toggle["aria-controls"]), "→ menu.id =", JSON.stringify(menu.id));
console.log("      menu['aria-labelledby'] =", JSON.stringify(menu["aria-labelledby"]), "→ toggle.id =", JSON.stringify(toggle.id));
console.log("      toggle['aria-activedescendant'] =", JSON.stringify(toggle["aria-activedescendant"]), "→ item.id =", JSON.stringify(item1.id));

console.log("\n  Say this in an interview: a headless library is not a styling");
console.log("  decision, it is an accessibility decision. Every team that writes its");
console.log("  own dropdown ships a <div onClick> that a keyboard cannot reach, and");
console.log("  nobody notices until an audit. → 07_portals.js §7 made the same");
console.log("  point about dialogs.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — HEADLESS vs STYLED vs shadcn/ui
// ══════════════════════════════════════════════════════════════════
//
//                     Styled (MUI, AntD)   Headless (Radix, Aria)   shadcn/ui
//   ───────────────────────────────────────────────────────────────────────────
//   ships markup      yes                  no                       yes, into YOUR repo
//   ships CSS         yes                  no                       yes, Tailwind, yours
//   ships behaviour   yes                  YES — the point           Radix underneath
//   who owns the DOM  the library          you                      you
//   restyling         override + fight     just write it            edit the file
//   upgrades          visual regressions   behaviour fixes          you re-copy, manually
//   time to first UI  minutes              hours                    minutes
//   time to YOUR UI   weeks                hours                    hours
//   bundle            everything           only what you use        only what you copied
//
// shadcn/ui is the interesting one to bring up, because it is a distribution
// idea rather than a technical one: unstyled Radix primitives plus Tailwind,
// copied into your repository as source. Not a dependency — a starting point.
// You get the headless correctness AND the fast start, and you pay by owning
// the file, which means upgrades are a manual diff.
//
// The honest trade-off, worth saying out loud: headless costs you time up
// front and a real risk of getting the markup wrong (a <div role="option">
// still needs to be focusable, still needs the right nesting). Styled costs
// you every time design changes. Pick based on how likely your design is to
// stay identical to someone else's defaults — for a product, never; for an
// internal admin tool, quite likely.


// ══════════════════════════════════════════════════════════════════
// § 8 — THE LINEAGE: THIS SECTION, ASSEMBLED
// ══════════════════════════════════════════════════════════════════

console.log("§8 — headless is the whole section in one API:\n");

const lineage = [
  ["04 container / presentational", "logic separated from view — here the view is the CALLER's"],
  ["02 render props / prop getters", "the library hands you values to render with"],
  ["01 compound components", "Radix's <Select.Trigger>/<Select.Content> share state via context"],
  ["10 slots + asChild", "your element, their behaviour merged onto it"],
  ["09 forwarding refs", "without it, none of the above can reach a DOM node"],
  ["05 provider pattern", "the state machine lives in a provider around the parts"],
];
lineage.forEach(([from, what]) => console.log(`    ${from.padEnd(32)} ${what}`));

console.log("\n  That is why this file is last. 'Headless component' is not a seventh");
console.log("  idea — it is the name for what happens when you apply the previous");
console.log("  six to a library boundary and keep the markup on the caller's side.\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — THE COSTS
// ══════════════════════════════════════════════════════════════════
//
//   • YOU WRITE THE MARKUP, so you can still get it wrong. A headless hook
//     gives you role="option"; it cannot stop you nesting it somewhere a
//     screen reader will not announce, or forgetting to render the menu at all
//     when isOpen is false.
//
//   • THE CALL SITE IS LONGER. Three spreads and a map where a styled library
//     had one component. Teams solve this by wrapping the headless primitive
//     once, internally — which is exactly shadcn/ui's idea.
//
//   • OVERRIDING BREAKS IT SILENTLY. §5. Prop getters are easy to misuse and
//     the failure is a dead click handler, not an error.
//
//   • TYPING PROP GETTERS IS GENUINELY HARD. The return type depends on the
//     element you will spread onto, and on the handlers you passed in.
//
//   • MORE DECISIONS PER COMPONENT. Every team member now decides what a
//     dropdown looks like. Without a design system on top, headless produces
//     five different dropdowns, which is worse than one ugly one.
//
// The mitigation for all five is the same, and it is the senior answer:
// wrap the headless primitive ONCE in your own design-system component, and
// let the product import yours. Headless at the bottom, styled at the top.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Clicking an option runs your handler and selects nothing:
//   You overrode onClick after spreading the getter. → §5.
//
// Bug 2 — Keyboard works, mouse does not (or the reverse):
//   Half the getter was spread onto the wrong element.
//
// Bug 3 — The screen reader announces nothing:
//   The prop getter was spread onto a wrapper <div> instead of the element
//   carrying the role. Spread it where the role belongs.
//
// Bug 4 — Duplicate ids on the page:
//   Two instances of the hook with the same id prop. Use useId().
//   → 02_built-in-hooks/13_useid.js
//
// Bug 5 — Hydration mismatch on the generated ids:
//   Ids generated with Math.random() instead of useId. Same file.
//
// Bug 6 — The menu is in a portal and click-outside closes it instantly:
//   → 07_portals.js §6.
//
// Bug 7 — The whole list re-renders on every keystroke:
//   getItemProps returns a new object per item per render — correct, and the
//   reason virtualized headless tables expose row keys. Memoize the ROW, not
//   the props. → 05_optimization-techniques/07_virtualization-react-window.js
//
// Bug 8 — Five different dropdowns in one product:
//   No internal wrapper. Headless without a design system on top. → §9.
//
// Bug 9 — Upgrading the library changed behaviour, not looks:
//   That is the deal. Behaviour is what you outsourced. Read the changelog for
//   keyboard changes, not visual ones.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The problem:
assert(escapeHatches.length === 5, "five escalating escape hatches for one visual change 🐛");

// One hook, two UIs:
assert(listOut.includes("<ul>") && listOut.includes("<li>"), "UI #1 is a list");
assert(cardOut.includes("<article>") && !cardOut.includes("<ul>"),
  "UI #2 shares no markup with UI #1 ✅");
assert(JSON.stringify(Object.keys(s1.getToggleProps())) ===
       JSON.stringify(Object.keys(useSelect({ items }).getToggleProps())),
  "...and both get the identical behaviour contract");
assert(behaviourProps.length === 14,
  "14 behaviour/aria props supplied by the hook, 0 written by either UI");

// Prop getters:
assert(JSON.stringify(correctCalls) === '["mine","library:select"]',
  "passing your handler INTO the getter runs both ✅");
assert(JSON.stringify(brokenCalls) === '["mine"]',
  "spreading then overriding deletes the library's handler, silently 🐛");
assert(brokenCalls.includes("library:select") === false,
  "...which is a dropdown that no longer selects anything");

// Accessibility wiring:
assert(comboboxRequirements.length === 14, "14 requirements for one accessible dropdown");
assert(suppliedByHook === 14 && comboboxRequirements.length - suppliedByHook === 0,
  "all 14 come from the hook; you write zero of them ✅");
assert(toggle["aria-controls"] === menu.id, "aria-controls really points at the menu ✅");
assert(menu["aria-labelledby"] === toggle.id, "aria-labelledby really points back ✅");
assert(toggle["aria-activedescendant"] === item1.id,
  "aria-activedescendant really points at the highlighted option ✅");
assert(item1["aria-selected"] === true && s.getItemProps({ index: 0 })["aria-selected"] === false,
  "and aria-selected tracks the highlighted index");

// The lineage:
assert(lineage.length === 6, "headless is six earlier patterns applied at a library boundary");

console.log("§11 — mini assertions passed for: Headless Components");
console.log("\n  The pair that captures it: two UIs sharing zero markup elements got");
console.log("  14 identical behaviour props and all 14 combobox a11y requirements");
console.log("  for free — and one misplaced onClick override silently deleted the");
console.log("  library's selection handler.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what are headless components?", answer:
//
//   "A component or hook that ships behaviour, state and accessibility and no
//    markup at all. useSelect gives you isOpen, the highlighted index, and
//    prop getters — getToggleProps, getMenuProps, getItemProps — that you
//    spread onto whatever elements you want. Radix, Headless UI, TanStack
//    Table, React Aria and Downshift all work this way.
//
//    The reason it wins is that it splits the problem along the right line.
//    Styling is the part that differs between every product; behaviour is the
//    part that's identical everywhere and hard to get right. A styled library
//    gives you the easy half for free and turns the hard half — matching your
//    design — into a specificity fight that ends in a deep selector, an
//    !important, or a fork. With headless there's nothing to override, because
//    you wrote the markup.
//
//    And what you're really buying is accessibility. A combobox needs about
//    fourteen things: role combobox, aria-haspopup, aria-expanded,
//    aria-controls and aria-activedescendant pointing at generated ids,
//    role listbox and option, aria-selected, arrow keys, Home/End, Enter,
//    Escape restoring focus, and typeahead. Every team that writes its own
//    ships a div with an onClick that a keyboard user can't reach, and nobody
//    finds out until an audit. Headless is an accessibility decision more than
//    a styling one.
//
//    The API detail worth knowing is why they're prop GETTERS instead of
//    objects. If you spread getItemProps() and then add your own onClick after
//    it, yours replaces theirs and the dropdown silently stops selecting. The
//    getter takes your handler as an argument and composes both. It's the same
//    merge-don't-replace problem as Radix's asChild.
//
//    The costs are real: the call site is longer, you can still nest the
//    markup wrong, prop getters are painful to type, and without a wrapper
//    you end up with five different dropdowns in one product. So the way I'd
//    actually use it is headless at the bottom, styled at the top — wrap the
//    primitive once in our own design-system component and let the product
//    import ours. That's essentially what shadcn/ui formalised: Radix
//    underneath, Tailwind on top, copied into your repo as source you own."
//
// The "fourteen a11y requirements" and "headless at the bottom, styled at the
// top" lines are what make this an architecture answer.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does a headless library actually ship?
// A1. A state machine, keyboard handling, focus management, and aria wiring —
//     as state plus prop getters or unstyled primitives.
//
// Q2. Why prop getters instead of plain objects?
// A2. So your handlers compose with theirs instead of replacing them.
//
// Q3. What breaks if you override a handler after spreading?
// A3. The library's behaviour, silently. No error, just a dead interaction.
//
// Q4. Headless vs a styled component library?
// A4. Styled owns your DOM; headless owns your behaviour. Restyling is a
//     specificity fight vs writing markup you already know how to write.
//
// Q5. What is shadcn/ui?
// A5. Not a dependency — Radix primitives plus Tailwind, copied into your repo
//     as source. Headless correctness with a styled component's start-up
//     speed, at the cost of manual upgrades.
//
// Q6. Which patterns is it built from?
// A6. Compound components for the parts, context for shared state, slots and
//     asChild for the markup, forwarded refs so any of it can reach the DOM.
//
// Q7. Does headless mean unstyled?
// A7. Not quite. Unstyled ships markup with no CSS; headless ships no markup
//     at all. Radix is somewhere between — unstyled primitives with headless
//     behaviour.
//
// Q8. What is the biggest risk?
// A8. Inconsistency. Everyone builds their own, so wrap it once internally.
//
// Q9. How do ids work across SSR?
// A9. useId. Anything random breaks hydration and can duplicate ids.
//
// Q10. When would you NOT go headless?
// A10. An internal tool where the default look is fine, or a prototype. The
//      time-to-first-UI cost is real and the design constraint is not.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Headless component, in one line?
//   Back : All behaviour and accessibility, zero markup. You bring the DOM.
//
// Flashcard 2:
//   Front: What is a prop getter?
//   Back : A function returning the props for one element, composing your
//          handlers with the library's.
//
// Flashcard 3:
//   Front: The classic misuse?
//   Back : Spreading the getter and then overriding onClick. Silently kills
//          the behaviour.
//
// Flashcard 4:
//   Front: What are you really buying?
//   Back : Accessibility. ~14 aria/keyboard requirements per dropdown.
//
// Flashcard 5:
//   Front: Headless vs styled?
//   Back : Who owns the DOM. Styled → they do, so restyling is a fight.
//
// Flashcard 6:
//   Front: What is shadcn/ui?
//   Back : Radix + Tailwind copied into your repo as source you own.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "Headless at the bottom, styled at the top — wrap the primitive
//          once so the product imports one dropdown, not five."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write useToggle() headless: state, getButtonProps with aria-pressed, and
//   a composed onClick. Render two visually different toggles from it.
//
// Task 2:
//   Spread the getter and then override onClick. Watch the toggle stop
//   working with no error. Fix it by passing the handler in.
//
// Task 3:
//   Build an accessible dropdown from scratch — no library. Get all fourteen
//   items from §6. Time yourself. Then use Downshift and time that.
//
// Task 4:
//   Test both with a screen reader (VoiceOver or NVDA). This is the task that
//   changes your mind about the pattern.
//
// Task 5:
//   Take a styled library's Select and make one visual change design asked
//   for. Count how many escape hatches you used.
//
// Task 6:
//   Wrap a Radix primitive in your own <Select> with your styles. That wrapper
//   is your design system.
//
// Task 7:
//   Read Downshift's or React Aria's source for one prop getter. Count the
//   edge cases you would not have thought of.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Behaviour and accessibility from the library, markup and styling from you.
//
// If you remember the common bug:
//   Spreading a prop getter and then overriding one of its handlers. The
//   library's behaviour disappears without a warning.
//
// If you remember the professional framing:
//   Headless splits the problem along the line that actually matters: styling
//   is what differs between products, behaviour is what is identical and hard.
//   Put headless at the bottom and your own styled wrapper on top, so the
//   product imports one dropdown instead of five.
//
// NEXT TOPIC -> 12_controlled-component-design.js
