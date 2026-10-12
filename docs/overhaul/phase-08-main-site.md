# Phase 8 — Main site improvements

Read [`README.md`](README.md) first.

- **Branch:** `overhaul/phase-8-main-site`
- **Depends on:** nothing. **Independent** of every other phase and can be done at any time, in parallel with any of them (it touches only `sites/main/`)
- **Review items covered:** 16, 19, 22, 23 (+ main-site parts of plan section 8)
- **Plan section:** 8 (Main site improvements)
- **Touches:** `sites/main/public/{index.html,styles.css,script.js}` only. Do **not** touch `sites/fsociety00`

## Goal

Make the personal site (`filiposakkq.dev`) accessible, consistent and smooth, without redesigning it. Visual identity (dark, red/pink accent) stays.

## Current state (baseline `8ea680b`)

- `index.html` (182 lines): header with wordmark and nav, `intro`, `about` (toolkit chips, language switcher, inspiration card, contact links), `projects` (a card linking to the fsociety00 site), site note, footer, and a native `<dialog class="easter-egg">`.
- `script.js` (222 lines), `styles.css` (946 lines) with a `:root` token block that already contains `--background --surface --border --text --muted --dim --accent --mono` plus a **partial** tonal scale (`--text-primary --text-secondary --text-tertiary --text-quaternary --text-muted-alt --surface-light --surface-mid --border-light --border-mid --accent-soft --accent-deep --success`). About **23 distinct hex values** remain in the stylesheet.
- `prefers-reduced-motion` is already handled in `styles.css` (one block near the end) and `script.js` reads `matchMedia('(prefers-reduced-motion: reduce)')`.
- Breakpoints: `900px`, `780px`, `760px`, `560px`, `360px`.

## Status of each review/plan item at the baseline — verify, then fix or close

| Item | Claim | What was found | Action |
|---|---|---|---|
| 16 | Tool chips never update `aria-pressed` | `index.html` chips have `aria-pressed="false"` and `script.js` toggles `aria-pressed` together with `.is-selected` | **Looks fixed.** Verify in the browser with the accessibility tree; close if correct. Also check the language switcher and that `aria-controls="toolkitNote"` points to an element with `aria-live="polite"` |
| 19 | Unthrottled `pointermove`, forced reflows | `script.js` keeps cached bounds (`cardBounds`) refreshed on enter/resize and writes inside `requestAnimationFrame` | **Looks fixed.** Verify: no `getBoundingClientRect()` inside `pointermove`, coalesced writes, nothing runs on touch devices that lack hover; close if correct |
| 22 | 35+ hardcoded colors | Token scale partly done; ~23 distinct hex values remain | **Finish consolidation** (below) |
| 23 | Same `.about-details` rule at 4 breakpoints | Current file declares `grid-template-columns: 1fr` once (780px); other breakpoints change `gap`/other properties | Verify that no breakpoint repeats an identical declaration already in force at a wider breakpoint; remove genuine duplicates only |
| plan | Compounding reveal-item transforms | `.js-enhanced .reveal-item` animates `opacity` + `transform: translateY` with `transition-delay: calc(var(--reveal-index) * 70ms)` | Check for nested reveal items (a child of a reveal item that is also a reveal item) which compound transform and delay; flatten so each element reveals once |
| plan | `prefers-reduced-motion` support | Present | Verify it covers *every* animation/transition added since (reveal, card tilt, easter egg), including `scroll-behavior: smooth` |
| plan | `aria-label` on divs | `.language-switcher` is `div role="group" aria-label=…` (fine, it has a role). `section aria-label` is fine | Audit for any `aria-label` on elements with no role/semantics (`div`/`span`) and replace with semantic markup or `aria-labelledby` pointing to a visible heading |
| plan | External link indicator | `target="_blank"` links use `rel="noreferrer"` with no visual or accessible hint | Add `rel="noopener noreferrer"`, a small external-link icon (CSS or inline SVG, `aria-hidden`) and visually hidden text `(opens in a new tab)` |

## Contrast (real problems found)

Measured with the WCAG formula on the dark background `#10090c`:

| Token | Value | Contrast | AA body (4.5:1) |
|---|---|---|---|
| `--dim` | `#657570` | **4.06** | fails |
| `--text-muted-alt` | `#72575c` | **3.03** | fails |
| `--accent-deep` | `#9d7378` | 4.84 | passes |
| `--muted` | `#96a49f` | 7.60 | passes |

- [ ] Run `node tools/contrast.mjs` (created in phase 1; if phase 1 is not merged, write the 15-line formula inline) on **every foreground/background pair actually used** (text over cards, borders for UI components need 3:1, focus rings 3:1). Fix failures by lightening the token, not by shrinking usage. Large text (≥ 24px or 19px bold) needs 3:1.
- [ ] Do not fail things that are decorative (purely decorative text can be exempt; say so in the notes).

## Tasks

- [ ] **Colors → semantic tokens.** Replace the remaining raw hex values with tokens: define a tiered scale `--text-primary`, `--text-secondary`, `--text-muted`, `--text-dim` (keep existing names where they are already used and alias if needed, do not leave two competing names for the same value), plus surface/border/accent tiers. Every hex must live only in the `:root` block. Goal: `grep -oE '#[0-9a-fA-F]{3,6}' styles.css` outside `:root` returns nothing (rgba values may stay when they derive from a token; prefer `color-mix(in srgb, var(--accent) 16%, transparent)` where supported with a fallback).
- [ ] **A11y pass:** items in the table above; visible `:focus-visible` outlines on all interactive elements with ≥ 3:1 contrast; skip link works and is the first focusable element (the baseline `<main id="main">` and the wordmark link suggest one; verify it exists); landmarks (`header`, `nav`, `main`, `footer`) unique and labeled; headings in order (`h1` → `h2` …); the easter-egg `<dialog>`: focus moves in on open and returns on close, `Escape` works, it has an accessible name (it already has `aria-labelledby`/`aria-describedby`; verify the ids exist).
- [ ] **Language switcher:** it swaps a phrase between English and Czech; ensure the changed phrase has `lang="cs"` on the Czech text and is announced politely (`aria-live` region).
- [ ] **Performance:** confirm no layout reads in pointer handlers; the reveal `IntersectionObserver` is disconnected after items reveal; no `will-change` left on; images/SVG sized to avoid layout shift. Run Lighthouse if available offline (`npx lighthouse` needs network access to fetch the package; if unavailable, measure manually with Chromium tracing) and record the numbers.
- [ ] **Redundant CSS:** remove duplicated breakpoint declarations (after verification), dead rules (check with Chromium's CSS coverage via Playwright: `page.coverage.startCSSCoverage()`), and merge repeated media-query blocks where it does not change cascade order.
- [ ] **Reveal transforms:** fix compounding transforms as described. Keep the stagger.
- [ ] **Project card link:** the card links to `https://fsociety.filiposakkq.dev/` while the repository README says the game is deployed at `fsociety00.filiposakkq.dev`. **Verify which hostname is correct with the owner** (and the visible link text/aria-label, which say fsociety00) before changing anything; record the answer in the decisions log in the master README.
- [ ] Optional (the plan says "consider"): a rotating project-card visual with a tiny live terminal preview. Do **not** build it unless the owner asks.

## Out of scope

Redesign, copy rewrites, new pages, anything under `sites/fsociety00`.

## Verification

- [ ] `python3 -m http.server 8000 --directory sites/main/public`, then Playwright: no console errors; keyboard-only run through the whole page (skip link, nav, chips toggle with Space/Enter, language switch, contact links, project card, easter egg open/close with focus return).
- [ ] Accessibility tree snapshot (`page.accessibility.snapshot()` or `locator.ariaSnapshot()`) shows pressed states, labels and the dialog correctly. If `axe-core` can be installed from npm in the environment, run it and record violations (target: zero serious/critical).
- [ ] Contrast table re-run: all pairs pass.
- [ ] Screenshots at 360, 390, 768 and 1280 px, before/after: **no visual regression** except intended fixes (attach to the PR).
- [ ] Reduced motion: no transforms/transitions.

## Done when

All table rows are verified-and-closed or fixed, hex values live only in `:root`, contrast passes, the external links are indicated, and there is no visual regression.

## Checkpoint log

Commit and push after **every row** (see "Checkpoints" in the master README). Update the row (status `todo` / `in progress` / `done` / `wip` / `skipped`, short commit hash, one line of notes) in the same push. Add rows if you split a step. A Claude resuming this phase continues at the first row that is not `done`.

| Step | Status | Commit | Notes |
|---|---|---|---|
| 8.1 Verify and close items 16, 19, 23 | todo | | |
| 8.2 Colors to semantic tokens | todo | | |
| 8.3 Contrast fixes | todo | | |
| 8.4 A11y pass + external-link indicators | todo | | |
| 8.5 Performance + reveal transforms | todo | | |
| 8.6 Redundant CSS cleanup | todo | | |
| 8.7 Project card link (owner decision) | todo | | |

## Implementation notes

_(if you stop early, put a **Stopped at** block first: state, half-edited files, failing tests, next command. Then append here)_
