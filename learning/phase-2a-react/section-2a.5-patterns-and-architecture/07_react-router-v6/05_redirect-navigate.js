// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Router v6  →  05_redirect-navigate.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Redirect / Navigate
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: <Navigate> IS A COMPONENT
//      THAT PERFORMS A SIDE EFFECT — so it costs a render, and obeys
//      React's render-phase rules
//   2. v5's <Redirect> → v6's <Navigate>: the rename, and the real change
//      underneath it
//   3. Why you cannot call navigate() during render, and how <Navigate>
//      makes the same thing legal
//   4. Redirect CHAINS: push pollutes history with dead intermediate URLs —
//      measured, 4 entries vs 2
//   5. The v6.4+ `redirect()` from a loader — a genuinely different
//      mechanism that costs ONE render pass instead of two, and renders no
//      redirecting UI at all
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/07_react-router-v6/05_redirect-navigate.js"
//
// Prerequisites: 04_protected-routes.js — that file used <Navigate replace>
// inside a guard and proved WHY `replace` matters for the back button. This
// file is the component itself: what it is, what it costs, and the three
// other ways to express the same intent.
//
// 04 treated <Navigate> as a known quantity. It isn't quite: it is a
// component whose entire job is a side effect, which puts it in an unusual
// corner of React's rules — and in v6.4+ there is now a way to redirect that
// skips rendering altogether. §7 measures the difference.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// <Navigate>:
// A component that, when rendered, changes the current location — the
// declarative form of "go somewhere else", for the case where the decision
// is part of what you render rather than a reaction to an event.
//
// If interviewer says "explain it simply", say:
//   "It's a redirect you can put in JSX. You render `<Navigate to='/login'
//    replace />` instead of returning UI, and the router changes the
//    location. It exists because you can't just call navigate() in the
//    middle of rendering — that's a side effect during render, which React
//    doesn't allow. <Navigate> wraps that call in an effect so it's legal."
//
// If interviewer says "when would you use it instead of useNavigate?", say:
//   "<Navigate> when the redirect IS the render result — a guard deciding
//    this user shouldn't be here, or a legacy URL that always forwards.
//    useNavigate when the redirect is a REACTION — after a form submits,
//    after a delete succeeds, on a button click. Declarative for 'given this
//    state, we belong elsewhere'; imperative for 'this just happened, go
//    there'."
//
// Why it matters in interviews:
//   The v5 → v6 rename is a surface question. The real one underneath is
//   whether you know why a redirect needs to be a component at all — which
//   is a React rules-of-rendering question wearing a routing costume.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   RENDERING <Navigate> IS HOW YOU LEGALLY NAVIGATE DURING RENDER.
//
// Runtime rule:
//   <Navigate> renders nothing. On mount it runs an effect that calls the
//   same navigate() function useNavigate() would have given you. So the
//   component that returned it DID render (and committed) before the
//   navigation happened — the redirect costs one full render pass of the
//   tree you were about to leave.
//
// Practical rule:
//   Reach for <Navigate> when the decision is a pure function of current
//   state and the answer is "not here". Reach for useNavigate() inside an
//   event handler or an effect when something HAPPENED. And in a data
//   router (v6.4+), prefer redirect() from a loader for anything decidable
//   before render — it is strictly cheaper. §7.
//
// Common trap:
//   Calling navigate() directly in a component body "because it's simpler
//   than rendering <Navigate>". That is a side effect during render: React
//   may run the render twice (StrictMode), discard it, or run it
//   concurrently, and a navigation fired from there is unpredictable.
//   <Navigate> is not ceremony — it is the same call, moved somewhere legal.
//
// The mental picture:
//
//   DECLARATIVE                        IMPERATIVE
//   if (!user) return <Navigate …/>    async function onSubmit() {
//     ▲                                  await save();
//     │ the redirect IS the render        navigate("/thanks");
//     │ result                          }
//                                         ▲ the redirect is a REACTION
//
//   BEFORE RENDER (v6.4+ data router)
//   async function loader() {
//     if (!user) return redirect("/login");   ← no render happens at all
//     return data;
//   }


// ══════════════════════════════════════════════════════════════════
// § 3 — v5's <Redirect> → v6's <Navigate>
// ══════════════════════════════════════════════════════════════════

console.log("§3 — what actually changed in the rename:\n");

const apiComparison = [
  ["v5", "<Redirect to='/login' />", "push by default", "only inside <Switch>"],
  ["v5", "<Redirect push to='/x' />", "opt IN to push", "`push` prop"],
  ["v6", "<Navigate to='/login' />", "PUSH by default", "anywhere in the tree"],
  ["v6", "<Navigate to='/x' replace />", "opt IN to replace", "`replace` prop"],
];

console.log("      version  usage".padEnd(45) + "history".padEnd(20) + "where it works");
console.log("      " + "─".repeat(88));
for (const [v, usage, hist, where] of apiComparison) {
  console.log("      " + v.padEnd(9) + usage.padEnd(36) + hist.padEnd(20) + where);
}

console.log("\n    Two real differences behind the rename:");
console.log("      • v5's <Redirect> was special — <Switch> knew about it and handled it");
console.log("        during matching. v6's <Navigate> is an ORDINARY component with an");
console.log("        effect, usable anywhere any component is usable. That is why it works");
console.log("        inside a pathless guard route (04 §3), which v5 had no equivalent of.");
console.log("      • v5's <Redirect> defaulted to REPLACE. v6's <Navigate> defaults to");
console.log("        PUSH. Porting a guard from v5 to v6 without adding `replace` silently");
console.log("        introduces the back-button loop from 04 §4. 🐛");

const v5DefaultWasReplace = true;
const v6DefaultIsPush = true;
console.log("\n      v5 <Redirect> default : " + (v5DefaultWasReplace ? "replace" : "push"));
console.log("      v6 <Navigate> default : " + (v6DefaultIsPush ? "push" : "replace"), "← the flip that breaks ports 🐛\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — WHY IT HAS TO BE A COMPONENT
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the render-phase rule, and what <Navigate> is working around:\n");

// A model of React's phases, strict about what is legal where.
function attemptNavigation(where, { strictMode = false } = {}) {
  const problems = [];
  let effectiveNavigations = 0;
  let renderPasses = 0;

  if (where === "render body") {
    // React may render a component more than once before committing, and may
    // throw the result away entirely. A side effect here runs an unknown
    // number of times, possibly for a tree that is never committed.
    renderPasses = strictMode ? 2 : 1;
    effectiveNavigations = renderPasses;             // fires once PER render attempt
    problems.push("side effect during render — React does not guarantee it runs once");
    if (strictMode) problems.push("StrictMode double-invokes render → fired twice");
    problems.push("may fire for a render React discards and never commits");
  } else if (where === "effect (what <Navigate> does)") {
    renderPasses = strictMode ? 2 : 1;               // render may run twice…
    effectiveNavigations = 1;                        // …but the effect runs after COMMIT, once
    problems.push("none — effects run after commit, exactly once per mount");
  } else if (where === "event handler (useNavigate)") {
    renderPasses = 0;                                // not during render at all
    effectiveNavigations = 1;
    problems.push("none — event handlers are outside the render phase entirely");
  }

  return { where, renderPasses, effectiveNavigations, problems };
}

const inRender = attemptNavigation("render body", { strictMode: true });
const inEffect = attemptNavigation("effect (what <Navigate> does)", { strictMode: true });
const inHandler = attemptNavigation("event handler (useNavigate)", { strictMode: true });

for (const r of [inRender, inEffect, inHandler]) {
  console.log("    calling navigate() in the " + r.where + ":");
  console.log("      render passes            :", r.renderPasses);
  console.log("      navigations actually fired:", r.effectiveNavigations,
    r.effectiveNavigations > 1 ? "🐛" : "✅");
  for (const p of r.problems) console.log("      • " + p);
  console.log("");
}

console.log("    So <Navigate> is not a stylistic wrapper. It is the SAME navigate() call,");
console.log("    relocated from the render body (illegal, unpredictable) into an effect");
console.log("    (legal, exactly once). Writing:");
console.log("      ❌ function Guard() { if (!user) navigate('/login'); return <Outlet/>; }");
console.log("      ✅ function Guard() { if (!user) return <Navigate to='/login' replace/>; ");
console.log("                            return <Outlet/>; }");
console.log("\n    …and note the second version also RETURNS instead of continuing — the");
console.log("    first one navigates AND still renders <Outlet/>, so protected content");
console.log("    flashes on screen before the redirect lands. That is 04's Bug 3. 🐛\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — REDIRECT CHAINS: WHAT push DOES TO HISTORY
// ══════════════════════════════════════════════════════════════════

console.log("§5 — a URL that redirects to a URL that redirects:\n");

// A realistic legacy-URL situation: /old was renamed to /new, which was
// later renamed again to /newest. Both redirects are still in place.
function walkRedirectChain({ useReplace }) {
  const entries = ["/"];
  let index = 0;
  const push = (to) => { entries.length = index + 1; entries.push(to); index = entries.length - 1; };
  const replace = (to) => { entries[index] = to; };
  const go = useReplace ? replace : push;

  push("/old");        // the user clicks a link to the legacy URL
  go("/new");          // <Navigate to="/new" />
  go("/newest");       // <Navigate to="/newest" />

  // now the user presses BACK once
  const backIndex = Math.max(0, index - 1);
  return { entries, landsOnBack: entries[backIndex], depth: entries.length };
}

const chainPush = walkRedirectChain({ useReplace: false });
const chainReplace = walkRedirectChain({ useReplace: true });

console.log("    the user clicked ONE link (to /old) and was forwarded twice.\n");
console.log("      <Navigate>            history entries                      back lands on");
console.log("      " + "─".repeat(76));
console.log("      push (default)    " + JSON.stringify(chainPush.entries).padEnd(38) + JSON.stringify(chainPush.landsOnBack),
  chainPush.landsOnBack === "/new" ? "🐛" : "");
console.log("      replace           " + JSON.stringify(chainReplace.entries).padEnd(38) + JSON.stringify(chainReplace.landsOnBack), "✅");

console.log("\n      history depth: " + chainPush.depth + " vs " + chainReplace.depth);

console.log("\n    With push, the two DEAD intermediate URLs are now in the user's history.");
console.log("    Pressing back lands on /new, which immediately forwards to /newest again —");
console.log("    the same trap as 04 §4, but built out of ordinary redirects instead of a");
console.log("    guard. The user has to press back three times to escape one click.");
console.log("\n    The rule generalises: a redirect the USER did not choose should always");
console.log("    replace. Reserve push for navigation the user actually requested.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — DECLARATIVE VS IMPERATIVE: PICKING ONE
// ══════════════════════════════════════════════════════════════════

console.log("§6 — the same intent, expressed three ways:\n");

const scenarios = [
  ["a guard: this user may not be here", "<Navigate replace />", "declarative — the redirect IS the render result"],
  ["a legacy URL that always forwards", "<Navigate replace />", "declarative — a pure function of the route"],
  ["after a form submits successfully", "useNavigate()", "imperative — a reaction to an event"],
  ["after deleting the record you're on", "useNavigate()", "imperative — an event, and the page no longer exists"],
  ["a 'go back' button", "useNavigate()(-1)", "imperative — only expressible as a call"],
  ["auth decidable before render (v6.4+)", "redirect() in a loader", "neither — happens before rendering at all"],
];

console.log("      situation".padEnd(40) + "use".padEnd(24) + "why");
console.log("      " + "─".repeat(96));
for (const [situation, use, why] of scenarios) {
  console.log("      " + situation.padEnd(40) + use.padEnd(24) + why);
}

console.log("\n    The test that decides it, in one question: is the redirect a FUNCTION OF");
console.log("    STATE, or a REACTION TO AN EVENT?");
console.log("      function of state → declarative. Re-deriving it on every render gives");
console.log("        the same answer, so rendering <Navigate> is honest.");
console.log("      reaction to an event → imperative. There is no state that says 'a form");
console.log("        was just submitted' — the event happened once, so it must be a call.");
console.log("\n    Trying to force the second case into <Navigate> means inventing a");
console.log("    `justSubmitted` state flag purely to trigger a render that redirects —");
console.log("    which is state that exists only to fake an event. → file 06\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE v6.4+ redirect(): A DIFFERENT MECHANISM, AND CHEAPER
// ══════════════════════════════════════════════════════════════════

console.log("§7 — redirecting BEFORE anything renders:\n");

// <Navigate> is a component, so the tree containing it must render and
// commit first. A data router's loader runs BEFORE render — so redirect()
// from a loader never renders the page being left at all.
function costOfNavigateComponent() {
  const timeline = [
    "match routes for /dashboard",
    "RENDER pass 1: RootLayout → Dashboard → <Navigate to='/login'/>",
    "commit — the user can SEE this frame",
    "<Navigate/> effect fires → navigate('/login', { replace: true })",
    "match routes for /login",
    "RENDER pass 2: RootLayout → Login",
  ];
  return { timeline, renderPasses: 2, framesUserCouldSee: 1 };
}

function costOfLoaderRedirect() {
  const timeline = [
    "match routes for /dashboard",
    "run /dashboard's loader — NO render yet",
    "loader returns redirect('/login')",
    "router follows it, re-matches for /login",
    "run /login's loader",
    "RENDER pass 1: RootLayout → Login",
  ];
  return { timeline, renderPasses: 1, framesUserCouldSee: 0 };
}

const navigateCost = costOfNavigateComponent();
const loaderCost = costOfLoaderRedirect();

console.log("    <Navigate> component, redirecting /dashboard → /login:");
navigateCost.timeline.forEach(t => console.log("      " + t));
console.log("      → render passes:", navigateCost.renderPasses,
  " frames of the abandoned page the user could see:", navigateCost.framesUserCouldSee, "🐛");

console.log("\n    redirect() from a loader, same journey:");
loaderCost.timeline.forEach(t => console.log("      " + t));
console.log("      → render passes:", loaderCost.renderPasses,
  " frames of the abandoned page the user could see:", loaderCost.framesUserCouldSee, "✅");

console.log("\n    The difference is structural, not an optimisation:");
console.log("      • <Navigate> is a RENDER RESULT. To produce it, React must render the");
console.log("        component that returns it — which is the page you are leaving.");
console.log("      • redirect() is a LOADER RESULT. Loaders run before render, so the");
console.log("        router can change its mind about what to render before rendering it.");
console.log("\n    redirect() is not a component and returns nothing renderable — it builds");
console.log("    a Response with a 302 status and a Location header, deliberately mirroring");
console.log("    how a server redirect works. The router recognises it and follows it:");
console.log("      export async function loader() {");
console.log("        const user = await getUser();");
console.log("        if (!user) return redirect('/login');   // ← never renders /dashboard");
console.log("        return user;");
console.log("      }");
console.log("\n    So the modern rule, when you are on a data router: put the decision in a");
console.log("    loader if it CAN be made before render, and keep <Navigate> for decisions");
console.log("    that genuinely depend on rendered state. → file 09\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — A v5 → v6 port where every guard suddenly breaks the back button:
//   v5's <Redirect> defaulted to replace, v6's <Navigate> defaults to push.
//   → §3, and 04 §4 for the loop itself.
//
// Bug 2 — Protected content flashing on screen before the redirect: the
//   component called navigate() and then STILL returned its normal UI,
//   instead of returning <Navigate> and nothing else. → §4.
//
// Bug 3 — A redirect that fires twice in development and once in
//   production: navigate() called in the render body, double-invoked by
//   StrictMode. → §4.
//
// Bug 4 — Back requiring three presses to escape one click: a redirect
//   chain using push, leaving dead intermediate URLs in history. → §5.
//
// Bug 5 — A `justSubmitted` boolean in state whose only job is to trigger a
//   render that renders <Navigate>: an event forced into declarative shape.
//   Use useNavigate() in the handler. → §6.
//
// Bug 6 — <Navigate> rendered unconditionally at the top of a component,
//   creating an immediate loop when the target route renders the same
//   component. Always guard the condition.
//
// Bug 7 — A redirect in a loader that returns instead of throwing where the
//   codebase expects a thrown Response: both are supported by React Router,
//   but mixing conventions in one codebase makes control flow hard to
//   follow. Pick one.
//
// Bug 8 — Using <Navigate> in a data router for something the loader
//   already knew: costs an extra render pass and shows the user a frame of
//   a page they are not allowed to see. → §7.
//
// Bug 9 — `to` built by string concatenation with an un-encoded value,
//   changing which route matches. Same class as 02 §6's encoding rule.
//
// Bug 10 — Assuming <Navigate to=".." /> resolves like a filesystem path
//   from the URL: relative `to` resolves against the ROUTE hierarchy, not
//   the raw pathname — an easy mismatch in deeply nested trees. → file 06.


// ══════════════════════════════════════════════════════════════════
// § 9 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The v5 → v6 flip:
assert(v5DefaultWasReplace === true && v6DefaultIsPush === true,
  "v5's <Redirect> defaulted to replace and v6's <Navigate> defaults to push — the flip that breaks ports 🐛");

// The render-phase rule:
assert(inRender.effectiveNavigations === 2,
  "navigate() in the render body fired TWICE under StrictMode — a side effect during render 🐛");
assert(inEffect.effectiveNavigations === 1,
  "…the same call inside an effect (what <Navigate> does) fired exactly once ✅");
assert(inEffect.renderPasses === inRender.renderPasses,
  "…and both rendered the same number of times — <Navigate> fixes the FIRING, not the rendering");
assert(inHandler.renderPasses === 0 && inHandler.effectiveNavigations === 1,
  "an event handler is outside the render phase entirely — no render, one navigation ✅");

// Redirect chains:
assert(chainPush.depth === 4 && chainReplace.depth === 2,
  "one click through a two-step redirect chain left 4 history entries with push, 2 with replace 🐛→✅");
assert(chainPush.landsOnBack === "/new",
  "…so back landed on a DEAD intermediate URL that immediately forwards again 🐛");
assert(chainReplace.landsOnBack === "/",
  "…while replace let back reach the real previous page ✅");

// The loader redirect:
assert(navigateCost.renderPasses === 2 && loaderCost.renderPasses === 1,
  "<Navigate> costs 2 render passes; a loader redirect() costs 1 ✅");
assert(navigateCost.framesUserCouldSee === 1 && loaderCost.framesUserCouldSee === 0,
  "…and <Navigate> commits one visible frame of the page being abandoned; redirect() commits none 🐛→✅");

console.log("§9 — mini assertions passed for: Redirect / Navigate");
console.log("\n  The pair that captures it: the same redirect cost 2 render passes and one");
console.log("  visible frame of a page the user was not allowed to see as a <Navigate>");
console.log("  component, and 1 pass with no such frame as a loader redirect() — while");
console.log("  forgetting `replace` on a two-step chain turned one click into " + chainPush.depth + " history");
console.log("  entries the user then had to press back through.");


// ══════════════════════════════════════════════════════════════════
// § 10 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do you redirect in React Router v6?", answer:
//
//   "There are three ways, and they're genuinely different mechanisms rather
//    than three styles. Declaratively, you render <Navigate to='/login'
//    replace /> — that's v6's replacement for v5's <Redirect>. Imperatively,
//    you call navigate() from useNavigate() inside an event handler. And on
//    a v6.4+ data router, you return redirect('/login') from a loader.
//
//    The thing worth understanding about <Navigate> is WHY it's a component
//    at all. You can't call navigate() in a component's render body — that's
//    a side effect during render, so React may run it more than once, or run
//    it for a render it then throws away. Under StrictMode it fires twice.
//    <Navigate> is that same call moved into an effect, which runs after
//    commit, exactly once. So it isn't ceremony — it's the legal place to put
//    it. And it must be RETURNED, not called alongside your normal UI, or
//    the protected content renders and flashes before the redirect lands.
//
//    The gotcha porting from v5 is that the defaults flipped: v5's <Redirect>
//    defaulted to replace, v6's <Navigate> defaults to push. A guard ported
//    without adding `replace` gives you a back-button loop. And the same
//    thing bites on redirect chains — a legacy URL forwarding to a URL that
//    forwards again leaves both dead intermediate entries in history, so one
//    click takes three back presses to escape. My rule is that any redirect
//    the user didn't choose should replace.
//
//    The newer mechanism is the interesting one. <Navigate> is a render
//    result, so React has to render the page you're leaving in order to
//    produce it — that's two render passes and one committed frame of a page
//    the user may not be allowed to see. redirect() from a loader runs
//    before rendering, so the router changes its mind about what to render
//    before rendering anything — one pass, no flash. It literally returns a
//    Response with a 302 and a Location header, deliberately mirroring a
//    server redirect. So on a data router I put the decision in the loader
//    whenever it can be made before render, and keep <Navigate> for
//    decisions that genuinely depend on rendered state."
//
// Leading with "why does a redirect need to be a component" and closing with
// the measured cost difference against redirect() is what makes this senior.


// ══════════════════════════════════════════════════════════════════
// § 11 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What replaced v5's <Redirect> in v6?
// A1. <Navigate> — and unlike <Redirect>, it's an ordinary component usable
//     anywhere, not something <Switch> handled specially.
//
// Q2. What default changed between them?
// A2. v5's <Redirect> replaced; v6's <Navigate> pushes. Porting without
//     adding `replace` reintroduces the back-button loop.
//
// Q3. Why can't you just call navigate() during render?
// A3. It's a side effect during render — React may run it multiple times or
//     discard the render entirely. StrictMode double-invokes it.
//
// Q4. So what is <Navigate> actually doing?
// A4. The same navigate() call, inside an effect — which runs after commit,
//     exactly once per mount.
//
// Q5. Does <Navigate> prevent the current page from rendering?
// A5. No — the component returning it renders and commits first. That's the
//     one visible frame, and why redirect() in a loader is cheaper.
//
// Q6. When do you use useNavigate instead?
// A6. When the redirect is a reaction to an event — a submit, a delete, a
//     back button — rather than a function of current state.
//
// Q7. What's the test for choosing between them?
// A7. Function of state → declarative <Navigate>. Reaction to an event →
//     imperative navigate().
//
// Q8. What does redirect() from a loader return?
// A8. A Response with a 302 status and a Location header — deliberately the
//     same shape as a server redirect. The router follows it.
//
// Q9. How many render passes does each cost?
// A9. <Navigate>: two, plus one committed frame of the abandoned page.
//     Loader redirect(): one, with no such frame.
//
// Q10. Why does a redirect chain need replace even more than a single
//      redirect?
// A10. Each hop adds an entry, so back walks through dead intermediate URLs
//      that immediately forward again — one click, several back presses.
//
// Q11. Is it valid to throw redirect() rather than return it?
// A11. Yes, React Router supports both — but mixing conventions in one
//      codebase makes control flow hard to follow. Pick one.
//
// Q12. How does a relative `to` resolve?
// A12. Against the ROUTE hierarchy, not the raw pathname — which can
//      surprise you in deeply nested trees. → file 06.


// ══════════════════════════════════════════════════════════════════
// § 12 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: v5's <Redirect> became what in v6?
//   Back : <Navigate> — an ordinary component, not a <Switch> special case.
//
// Flashcard 2:
//   Front: What default flipped between them?
//   Back : v5 replaced by default; v6 pushes by default.
//
// Flashcard 3:
//   Front: Why is <Navigate> a component?
//   Back : Calling navigate() during render is a side effect during render.
//          <Navigate> moves it into an effect.
//
// Flashcard 4:
//   Front: What happens if you call navigate() in the render body?
//   Back : Fires per render attempt — twice under StrictMode, possibly for a
//          discarded render.
//
// Flashcard 5:
//   Front: Declarative or imperative — how do you choose?
//   Back : Function of state → <Navigate>. Reaction to an event →
//          useNavigate().
//
// Flashcard 6:
//   Front: What does redirect() return?
//   Back : A Response — 302 + Location — mirroring a server redirect.
//
// Flashcard 7:
//   Front: Render cost, <Navigate> vs loader redirect()?
//   Back : 2 passes + a visible frame, vs 1 pass and no frame.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "A redirect the user didn't choose should always replace — and on
//          a data router it shouldn't render at all."


// ══════════════════════════════════════════════════════════════════
// § 13 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write a component that calls navigate() in its render body, run it under
//   StrictMode, and count how many times the navigation fires.
//
// Task 2:
//   Build the /old → /new → /newest chain with push, then with replace, and
//   count the back presses needed to escape in each.
//
// Task 3:
//   Take a guard that calls navigate() and still returns <Outlet />, and
//   watch protected content flash. Then fix it by returning <Navigate>.
//
// Task 4:
//   Convert an auth guard from <Navigate> to a loader redirect() on a data
//   router, and compare the number of renders in the React DevTools Profiler.
//
// Task 5:
//   Find a place in code you own where a boolean state flag exists only to
//   trigger a <Navigate>. Replace it with useNavigate() in the handler.
//
// Task 6:
//   Port a v5 <Redirect> guard to v6 without adding `replace`, reproduce the
//   loop, then fix it — so you've felt the exact bug the rename causes.
//
// Task 7:
//   Read React Router's source for <Navigate> (it's ~15 lines) and confirm
//   for yourself that it is a useEffect around navigate().


// ══════════════════════════════════════════════════════════════════
// § 14 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   <Navigate> exists because you cannot navigate during render. It is the
//   same call, moved into an effect — which is also why it costs a render
//   pass and a visible frame.
//
// If you remember the common bug:
//   v6's <Navigate> pushes by default where v5's <Redirect> replaced — every
//   ported guard breaks the back button until you add `replace`.
//
// If you remember the professional framing:
//   Function of state → declarative. Reaction to an event → imperative.
//   Decidable before render on a data router → neither: redirect() in a
//   loader, and nothing renders at all.
//
// NEXT TOPIC -> 06_usenavigate-programmatic-navigation.js
