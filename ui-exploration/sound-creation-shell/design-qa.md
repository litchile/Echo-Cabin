# Sound Creation UI Shell V0.2 — Design QA

## Scope

- Implementation: `ui-exploration/sound-creation-shell/`
- Visual source of truth: `references/selected-creation-ui-board.png`
- Product behavior sources: `docs/02_UX_Flow_V0.6.md` and `docs/SOUND_CREATION_UI_SHELL_V0.2.md`
- This is a simulated UI preview. It does not use a microphone, local audio files, `AudioContext`, persistence, or formal Prototype business logic.

## Browser evidence

- Desktop identity state: `qa-desktop-final-identity.png`
- Desktop sound-source state: `qa-desktop-final-source.png`
- Desktop additional state: `qa-desktop-final.png`
- Mobile landscape identity state: `qa-landscape-identity.png`
- Mobile portrait identity state: `qa-portrait-identity-final.png`
- Full-view reference comparison: `qa-side-by-side.png`

The preview was rendered in the in-app browser from `http://127.0.0.1:4175/`. Application console errors were empty during the final interaction checks.

## Fidelity review

| Surface | Result | Notes |
| --- | --- | --- |
| Typography | Passed | Warm dark-brown hierarchy, compact labels, and readable button text match the selected direction. |
| Spacing and layout | Passed | Centered cream card preserves the room as the visual subject. Desktop maximum width was increased from 940 px to 1080 px after comparison. |
| Colors and tokens | Passed | Cream surfaces, coral primary actions, warm brown text, and subdued borders replace the former dark control-panel styling. |
| Images and assets | Passed | Uses the current room art and the current full-body character asset without modifying the originals. |
| Copy and content | Passed | Creation and editing use distinct language: “保存声音并创建角色” versus “替换声音”. No online-invitation or locked-slot language remains. |
| Icons | Passed | Phosphor icons provide consistent microphone, folder, play, and pause symbols. Final custom icon art is intentionally deferred. |
| Interaction | Passed | Creation and existing-character sound editing are separate state machines. Record/import candidates, cancellation, failures, and replacement retention are simulated. |
| Responsiveness | Passed | Checked at desktop, 844 × 390 landscape, and 390 × 844 portrait. Portrait uses a bottom drawer; no horizontal overflow was found. |
| Accessibility | Passed | Primary controls are buttons, focus-visible styling is present, touch targets are sized for mobile, and flows do not depend on hover. |

## Interaction checks

- Empty scene → identity → sound source → record → candidate confirmation → optional playback → save/create.
- Import processing, cancel, success, failure, and retry paths.
- Avatar popover → role switch → edit current sound.
- Existing sound → rerecord/reimport → candidate confirmation → optional playback → atomic replacement.
- Save/replace failures retain the candidate; replacement failure also retains the existing official sound.
- Only one simulated preview can play at a time; opening/closing layers and changing role stop playback.
- Stale simulated async results are discarded through an operation token.

## Iterations completed

1. Increased the desktop card width after the first comparison showed excessive empty space and a weaker hierarchy than the reference.
2. Hid the empty-scene creation prompt while a modal is open so it no longer appears as a duplicate blurred call to action.
3. Replaced the custom CSS recording glyph with a consistent Phosphor microphone icon.
4. Styled progress controls with the coral accent instead of the browser default.
5. Verified creation and editing modes do not share step labels, primary-button copy, or exit semantics.

## Remaining non-blocking polish

- Production typeface selection and bespoke icon illustration remain outside this UI Shell checkpoint.
- Real audio permission, decoding, recording, playback, and persistence behavior belong to Stage 4.
- The Phosphor SVG font increases the production bundle size; it is acceptable for this preview and can be subset or replaced during formal integration.

No P0, P1, or P2 visual or interaction issues remain for this checkpoint.

## Post-review correction — 2026-07-20

- Removed the incorrect requirement to play a candidate before saving or replacing it. Playback is now optional in both modes.
- Added a visible simulated file-picker state so the frontend-only import path can be understood before Stage 4 connects the browser file APIs.
- Confirmed this independent UI Shell does not implement scene movement; movement remains in the formal Prototype and is intentionally isolated from this visual checkpoint.
- Removed all role-specific hue and saturation filters. Reused character art now preserves the original source colors.
- Rebuilt successfully and rechecked the create/import and edit/import flows in the browser. Both save actions are enabled before playback.

final result: passed
