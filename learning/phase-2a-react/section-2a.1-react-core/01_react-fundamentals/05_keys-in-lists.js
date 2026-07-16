// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Fundamentals  →  05_keys-in-lists.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Keys in lists (why important)
//
// WHAT YOU WILL MASTER HERE:
//   1. Exact definition in interview language
//   2. The key={index} bug — SIMULATED with real state, not hand-waved
//   3. When key={index} is actually fine (nuance interviewers probe for)
//   4. key as a deliberate state-reset tool
//   5. Real bugs and production fixes
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.1-react-core/01_react-fundamentals/05_keys-in-lists.js"
//
// Prerequisite: 03_reconciliation-algorithm.js — keys are heuristic 2.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Keys:
// A key is the stable IDENTITY of a list child, telling React "this is the
// same item as before, even if it moved."
//
// If interviewer says "explain it simply", say:
// "Without keys React matches list children by position. With keys it
//  matches by identity, so it can move a node instead of rewriting it —
//  and the node keeps its state."
//
// If interviewer asks "why does it matter?", say:
// "Because DOM nodes hold state React does not manage: focus, caret
//  position, scroll, uncontrolled input values, CSS animation progress.
//  Match the wrong node to the wrong item and that state lands on the
//  wrong row. Users see it. Tests usually do not."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   identity, not position
//
// The question React asks for each child:
//   "Have I seen this key before?"
//     YES → reuse that fiber, its state, and its DOM node. Move if needed.
//     NO  → mount a fresh one.
//
// Runtime rule:
//   Keys only need to be unique among SIBLINGS, not globally.
//   Keys are lifted out of props — props.key is always undefined. (→ 01)
//
// Practical rule:
//   key = the ID of the DATA, not the position in the array.
//   Ask: "if the array is reordered, does this key follow the item?"
//   If not, it is not a key — it is a position wearing a key's clothes.
//
// Common trap:
//   Using key={index}. The index does not follow the item; it stays with
//   the SLOT. React then thinks item 0 was never moved — only edited.
//
// The subtle part most people miss:
//   key={index} does not usually produce a VISUAL bug in the text, because
//   React dutifully rewrites the text of each slot. The bug lands in the
//   state React did NOT rewrite — the checkbox, the focus, the input value.


// ══════════════════════════════════════════════════════════════════
// § 3 — A MINI REACT THAT ACTUALLY HOLDS STATE PER ROW
// ══════════════════════════════════════════════════════════════════
//
// To PROVE the key bug we need components with state. So: a tiny renderer
// where each row owns a DOM node holding uncontrolled state (a checkbox).

function createListRenderer() {
  let mounted = new Map();   // key → { domNode, item }
  const log = [];

  function render(items, getKey) {
    const nextMounted = new Map();

    items.forEach((item, index) => {
      const key = getKey(item, index);
      const existing = mounted.get(key);

      if (existing) {
        // REUSE: same key seen before. The DOM node survives — and so does
        // every bit of state living inside it (checked, focus, scroll...).
        existing.domNode.text = item.text;      // React rewrites the text
        // NOTE: `checked` is NOT touched. React does not know about it.
        nextMounted.set(key, { domNode: existing.domNode, item });
        log.push(`reuse  key=${key} → text="${item.text}" (checked stays ${existing.domNode.checked})`);
      } else {
        // MOUNT: brand new node, fresh state.
        const domNode = { text: item.text, checked: false };
        nextMounted.set(key, { domNode, item });
        log.push(`mount  key=${key} → text="${item.text}" (checked=false)`);
      }
    });

    for (const [key] of mounted) {
      if (!nextMounted.has(key)) log.push(`unmount key=${key}`);
    }

    mounted = nextMounted;
    return [...mounted.values()];
  }

  return {
    render,
    getLog: () => log.slice(),
    clearLog: () => (log.length = 0),
    check: (key) => { mounted.get(key).domNode.checked = true; },
    snapshot: () => [...mounted.values()].map(m => ({
      text: m.domNode.text,
      checked: m.domNode.checked,
    })),
  };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE BUG: key={index} + DELETE FROM THE TOP
// ══════════════════════════════════════════════════════════════════
//
// The scenario every interviewer uses. A todo list. You check one box.
// Then you delete a DIFFERENT row. Watch the checkmark jump.
//
// Note WHICH row we check. Checking the LAST row would just destroy the
// checkmark when the list shrinks — bad, but not the famous bug. Check a
// MIDDLE row and delete ABOVE it, and the checkmark walks to another todo.

console.log("§4 — key={index}: the checkmark jumps to the wrong row\n");

const todos = [
  { id: "t1", text: "Buy milk" },
  { id: "t2", text: "Walk dog" },
  { id: "t3", text: "Learn React" },
];

const byIndex = createListRenderer();
byIndex.render(todos, (item, index) => index);   // key = 0, 1, 2

// User checks "Walk dog" — the MIDDLE row, key=1
byIndex.check(1);
console.log("  after checking 'Walk dog':");
console.log("   ", JSON.stringify(byIndex.snapshot()));

// User deletes "Buy milk" — the row ABOVE the checked one
byIndex.clearLog();
const afterDelete = todos.slice(1);              // Walk dog, Learn React
byIndex.render(afterDelete, (item, index) => index);   // keys are STILL 0, 1

console.log("\n  user deletes 'Buy milk'. React's work:");
for (const line of byIndex.getLog()) console.log("   ", line);
console.log("\n  result:");
console.log("   ", JSON.stringify(byIndex.snapshot()));
console.log("\n  🐛 'Learn React' is checked now. The user never touched it.");
console.log("     And 'Walk dog' — the one they DID check — is unchecked.");
console.log("     Why: key 1 still exists, so React reused that node. It only");
console.log("     rewrote the text ('Walk dog' → 'Learn React') and left the");
console.log("     checkbox alone, because React does not manage `checked` on");
console.log("     an uncontrolled input. The state stayed with the SLOT while");
console.log("     the data shifted underneath it.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE FIX: key={item.id}
// ══════════════════════════════════════════════════════════════════

console.log("§5 — key={item.id}: identity follows the data\n");

const byId = createListRenderer();
byId.render(todos, (item) => item.id);

byId.check("t2");                                // check "Walk dog" — same as §4
console.log("  after checking 'Walk dog':");
console.log("   ", JSON.stringify(byId.snapshot()));

byId.clearLog();
byId.render(todos.slice(1), (item) => item.id);  // delete "Buy milk"

console.log("\n  user deletes 'Buy milk'. React's work:");
for (const line of byId.getLog()) console.log("   ", line);
console.log("\n  result:");
console.log("   ", JSON.stringify(byId.snapshot()));
console.log("\n  ✅ 'Walk dog' is still checked — the row the user actually");
console.log("     checked. Exactly ONE unmount, and it was the row they");
console.log("     actually deleted. Same data, same delete, opposite outcome.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE NUANCE: WHEN IS key={index} ACTUALLY FINE?
// ══════════════════════════════════════════════════════════════════
//
// Interviewers ask this to separate rule-followers from engineers.
// Saying "never use index" is the junior answer. The real answer:
//
// key={index} is SAFE when ALL THREE are true:
//   1. The list never reorders, and
//   2. Items are never inserted or removed from anywhere but the END, and
//   3. The items have no state — no inputs, no focus, no local component
//      state, no animation.
//
// If all three hold, the index IS a stable identity, because position and
// identity are the same thing. A static footer nav, a rendered markdown
// table, a list of read-only labels — index is fine and costs nothing.
//
// Break ANY one and you have a latent bug that shows up the day someone
// adds sorting.
//
// The honest senior line:
//   "Index keys are not wrong, they are FRAGILE. They encode an assumption
//    the code does not state. I use item IDs by default because the cost is
//    zero and the failure mode is silent and user-visible."

console.log("§6 — appending to the end: index keys behave identically\n");

const appendIndex = createListRenderer();
appendIndex.render(todos, (item, index) => index);
appendIndex.check(0);
appendIndex.clearLog();
appendIndex.render([...todos, { id: "t4", text: "Sleep" }], (item, index) => index);
const indexResult = appendIndex.snapshot();

const appendId = createListRenderer();
appendId.render(todos, (item) => item.id);
appendId.check("t1");
appendId.clearLog();
appendId.render([...todos, { id: "t4", text: "Sleep" }], (item) => item.id);
const idResult = appendId.snapshot();

console.log("  key={index} after append:", JSON.stringify(indexResult));
console.log("  key={item.id} after append:", JSON.stringify(idResult));
console.log("  same outcome?", JSON.stringify(indexResult) === JSON.stringify(idResult));
console.log("  → Append-only + no reorder = index is a valid identity.");
console.log("    This is why the bug hides in dev and appears when someone");
console.log("    ships a sort button six months later.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — key AS A DELIBERATE TOOL: FORCING A RESET
// ══════════════════════════════════════════════════════════════════
//
// Keys are not only for lists. Changing a key on ANY element forces React
// to unmount the old and mount a fresh one. That is the cleanest way to
// reset state on a prop change.
//
//   ❌ The effect approach — a render, then a second render, plus a bug
//      when userId changes back and forth:
//
//        useEffect(() => { setDraft(""); }, [userId]);
//
//   ✅ The key approach — one render, no effect, impossible to get wrong:
//
//        <ProfileEditor key={userId} userId={userId} />
//
// React's own docs call this "resetting state with a key."
//
// Real uses:
//   <Modal key={itemId} />        — fresh form for each item
//   <Chart key={dataSetId} />     — rebuild a stateful third-party widget
//   <VideoPlayer key={videoUrl} /> — force the <video> element to reload

console.log("§7 — key as a reset switch:\n");

const editor = createListRenderer();
editor.render([{ id: "u1", text: "editing user 1" }], (item) => item.id);
editor.check("u1");                               // user typed a draft
console.log("  editing user 1, draft present:", JSON.stringify(editor.snapshot()));

editor.clearLog();
// Same component, same position, but the key changed → full remount
editor.render([{ id: "u2", text: "editing user 2" }], (item) => item.id);
for (const line of editor.getLog()) console.log("   ", line);
console.log("  switched to user 2:", JSON.stringify(editor.snapshot()));
console.log("  → draft is gone. Fresh instance. No useEffect needed.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version                Real React
//   ───────────                ──────────
//   a Map of key → node        keyed fibers, matched in two passes:
//                              first a fast left-to-right walk while keys
//                              match, then a map only if they diverge
//   state = an object field    the full hook list on the fiber
//   mount/unmount logs         real lifecycle: effect cleanups run in order,
//                              refs detach, then the DOM node is removed
//   any key type               keys are coerced to STRINGS. key={1} and
//                              key={"1"} collide. So do key={null} and
//                              key={"null"}
//
// Two real details worth quoting:
//   • Duplicate keys → React warns and the behavior is undefined; the
//     second node usually clobbers the first. Silent data loss.
//   • Keys are scoped to the PARENT. Two different lists can both use key
//     "1" with no conflict. People often over-engineer globally unique keys.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Checkbox/radio checks the wrong row after a delete. → §4.
//
// Bug 2 — Typing in row 3's input, then a new row arrives at the top, and
//   your text is now in row 4's input. Same mechanism, more infuriating.
//
// Bug 3 — key={Math.random()}:
//   A new key every render → EVERY item unmounts and remounts every time.
//   Focus is impossible to hold, state never survives, performance dies.
//   Seen in real codebases as a "fix" for a stale list. It is not a fix.
//
// Bug 4 — Duplicate keys from a bad id:
//   key={user.name} and two users named "Amit" → React warns, one row
//   silently disappears or shows the wrong data.
//
// Bug 5 — key={index} + CSS transitions:
//   Items animate into the wrong positions on reorder, because React
//   rewrote content instead of moving nodes. The animation is honest;
//   your keys are not.
//
// Bug 6 — Assuming keys are props:
//   function Row({ key, text }) — key is ALWAYS undefined here. It was
//   lifted out. Pass it twice: <Row key={id} id={id} />. → 01_jsx-compilation.js
//
// Bug 7 — Keys on a Fragment:
//   <>...</> cannot take a key. Use <React.Fragment key={id}>.
//   → 06_react-fragment.js


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The headline bug, asserted:
const indexSnap = byIndex.snapshot();
assert(indexSnap[1].text === "Learn React" && indexSnap[1].checked === true,
  "key={index}: the check JUMPED to a todo the user never touched");
assert(indexSnap[0].text === "Walk dog" && indexSnap[0].checked === false,
  "key={index}: the todo the user actually checked is now unchecked");

// The fix, asserted — same data, same delete, correct outcome:
const idSnap = byId.snapshot();
assert(idSnap.find(r => r.text === "Walk dog").checked === true,
  "key={item.id}: the check stayed on the todo the user checked");
assert(idSnap.find(r => r.text === "Learn React").checked === false,
  "key={item.id}: the untouched todo stayed untouched");

// Work done — keys mean React does LESS:
const idLog = byId.getLog();
assert(idLog.filter(l => l.startsWith("unmount")).length === 1,
  "keyed delete unmounts exactly one row");
assert(idLog.filter(l => l.startsWith("mount")).length === 0,
  "keyed delete mounts nothing new");

// The nuance from §6:
assert(JSON.stringify(indexResult) === JSON.stringify(idResult),
  "append-only: index keys are equivalent to id keys");

console.log("§10 — mini assertions passed for: Keys in lists");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "why are keys important?", answer like this:
//
//   "Keys give list children a stable identity. Without them React matches
//    children by index, so if I delete the first item, React does not think
//    'item removed' — it thinks 'every item's content changed and the last
//    slot disappeared.'
//
//    That is usually invisible in the text, because React rewrites the text
//    correctly either way. The damage lands on state React does not rewrite:
//    checkbox state, focus, caret position, scroll, animation progress. So
//    you check a box, delete a different row, and the checkmark jumps.
//
//    The fix is key={item.id} — the identity of the DATA, so it follows the
//    item when the array reorders.
//
//    key={index} is not always wrong though. If the list never reorders,
//    only appends, and the rows hold no state, index IS a stable identity.
//    I still default to IDs because index keys encode an unstated assumption
//    and the failure is silent.
//
//    Keys also work as a deliberate tool: change the key on a component and
//    React remounts it, which is the cleanest way to reset state when a prop
//    like userId changes — better than a reset effect."
//
// Then offer to demo the checkbox bug. It takes twenty lines and it lands.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Why not key={index}?
// A1. The index belongs to the slot, not the item. On reorder or removal
//     the key does not follow the data, so React reuses the wrong node and
//     the row's internal state lands on the wrong item.
//
// Q2. Is key={index} ever acceptable?
// A2. Yes — static, append-only, stateless lists. Then position IS identity.
//
// Q3. Do keys have to be globally unique?
// A3. No. Only unique among siblings. Keys are scoped to the parent.
//
// Q4. Why is key={Math.random()} catastrophic?
// A4. Every render produces new keys, so every child unmounts and remounts.
//     No state, no focus, maximum DOM churn.
//
// Q5. Can I read the key inside my component?
// A5. No. createElement lifts key out before building props. Pass it again
//     as a normal prop if you need the value.
//
// Q6. What happens with duplicate keys?
// A6. A dev warning, and undefined behavior — typically one node wins and
//     the other's updates are lost.
//
// Q7. Does key affect performance or correctness?
// A7. Both, but correctness is the real reason. Wrong state on the wrong row
//     is a bug; extra DOM writes are just slow.
//
// Q8. What type can a key be?
// A8. Anything, but it is coerced to a string — so 1 and "1" collide.
//     Use real stable IDs, not array positions or object references.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is a key?
//   Back : The stable identity of a list child, so React can move it instead
//          of rewriting it.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : No key → match by index. Key → match by key. Unique among siblings.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : key={index} — the index stays with the slot, not the item.
//
// Flashcard 4:
//   Front: Why is the bug invisible in the text?
//   Back : React rewrites text correctly. It is the UNMANAGED state (focus,
//          checked, scroll) that lands on the wrong row.
//
// Flashcard 5:
//   Front: When is key={index} fine?
//   Back : Static + append-only + stateless. Then position IS identity.
//
// Flashcard 6:
//   Front: How do you reset a component's state?
//   Back : Change its key.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   In §4, delete the MIDDLE todo instead of the first. Predict which row
//   ends up checked BEFORE running it.
//
// Task 2:
//   Reverse the array with index keys. Count the reuses. Then do it with id
//   keys. Explain the difference in one sentence.
//
// Task 3:
//   Add key={Math.random()} to createListRenderer. Watch every row unmount
//   and remount on every render. That is a real bug people ship.
//
// Task 4:
//   Add duplicate-key detection: warn when two siblings share a key. That
//   is React's own dev warning, in three lines.
//
// Task 5:
//   Break §6's safe case: add a sort. Watch index keys go from correct to
//   broken with no change to the list rendering code. That is fragility.
//
// Task 6:
//   Explain in 60 seconds why the key bug shows up as "the wrong checkbox"
//   and not "the wrong text".


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   A key is identity. The index is a position. They are not the same thing.
//
// If you remember the common bug:
//   Check a box, delete another row, the checkmark jumps. Text stays correct,
//   which is exactly why it is hard to spot.
//
// If you remember the professional framing:
//   Index keys are fragile, not forbidden. And key is also a TOOL — change
//   it to reset state on purpose.
//
// NEXT TOPIC -> 06_react-fragment.js
