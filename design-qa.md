# Stage 4.1 UI Shell Design QA

- Source visual truth: `ui-exploration/sound-creation-shell/references/selected-creation-ui-board.png`
- Size-correction baseline: `docs/audits/stage4-1-ui-size/01-current-identity.png`
- Revised implementation: `docs/audits/stage4-1-ui-size/02-centered-resized-1127x640.png`
- Implementation URL: `http://127.0.0.1:4176/`
- Primary comparison viewport: `1127 × 640`
- Responsive checks: `1280 × 720`, `844 × 390`, `390 × 844`
- State: create-character identity step

## Findings

No actionable P0, P1, or P2 issue remains after the size correction.

The component structure, visual hierarchy, controls, copy, assets, and interaction semantics are unchanged. The adjustment is limited to viewport-relative sizing, true viewport centering, and internal spacing needed to remove the unnecessary desktop scrollbar.

## Required fidelity surfaces

- Fonts and typography: unchanged from the approved UI Shell.
- Spacing and layout rhythm: the desktop panel is `860 × 560` at `1127 × 640`, centered at `(563.6, 320)` against the viewport center `(563.5, 320)`. It keeps 40 px top and bottom clearance.
- Colors and visual tokens: unchanged.
- Image quality and asset fidelity: the existing room and full-body character assets remain unchanged and unfiltered.
- Copy and content: unchanged; creation, recording, importing, playback, save, and replacement semantics remain intact.

## Comparison history

### Iteration 1 — blocked

- P1: the fixed 600 px panel exceeded the visible stage area at short desktop heights.
- P1: the panel was horizontally centered but visually shifted downward, with its footer clipped.
- P2: the identity state exposed an unnecessary scrollbar.

### Fixes made

- Centered the overlay against the browser viewport instead of the letterboxed stage.
- Reduced the desktop maximum width from 900 px to 860 px.
- Replaced fixed 600 px height with `min(560px, calc(100dvh - 64px))`.
- Reduced only the content area's vertical padding so the desktop identity state fits without scrolling.

### Post-fix evidence

- `1127 × 640`: panel center differs from the viewport center by approximately `0.1 px` horizontally and `0 px` vertically.
- `1127 × 640`: content `clientHeight / scrollHeight` is `369 / 369`; no scrollbar is required.
- `1280 × 720`: panel is centered and the document has no overflow.
- `844 × 390`: panel is centered; short-height internal scrolling remains available; the document has no overflow.
- `390 × 844`: portrait bottom drawer remains intact; no document overflow.

## Follow-up polish

- P3: very short landscape screens still require card-internal scrolling by design.

## Verification

- `npm run test`: 8 files, 52 tests passed.
- `npm run build`: passed.
- Browser console: no new errors observed during the size check.

Focused region comparison was not needed because the change only affects the outer panel bounds and vertical spacing; typography, controls, imagery, and component internals were intentionally preserved.

final result: passed
