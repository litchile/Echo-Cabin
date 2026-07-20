# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Echo Cabin UI Shell V0.2

- The selected visual direction is a warm cream game UI layered over the existing room scene.
- Product state and return behavior come from `docs/SOUND_CREATION_UI_SHELL_V0.2.md`, not from visual boards with outdated state labels.
- Creation and existing-character sound editing are separate state machines.
- This folder is a simulated preview only: no microphone, local file access, AudioContext, persistence, or formal prototype business logic.
- Candidate playback is optional. A generated candidate may be saved or used to replace an existing sound without first pressing Play.
- Local audio import is a browser-side flow for the static Prototype; this preview must show the simulated file-selection state without pretending to read a real file.
- Scene movement is intentionally excluded from this isolated UI Shell and remains the responsibility of the formal Prototype.
- Never recolor reused character art with hue, saturation, tint, or similar filters unless the user explicitly requests a variant.
