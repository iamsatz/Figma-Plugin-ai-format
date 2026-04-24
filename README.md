# Restructure

Personal Figma plugin that cleans up **layer structure** — names, Auto Layout, spacing, and child order — without touching any visual design. Cuts handoff prep from 10–20 min to under 30 sec per screen.

## What it does

| Fix type | What gets cleaned up |
|---|---|
| **AI Rename** | Generic names (Frame 23, Group 7) → semantic ones (Card_ProductHero, Button_Primary) via Gemini 2.5 Flash |
| **Auto Layout** | Detects manually-stacked frames that should be Auto Layout and converts them |
| **Spacing snap** | Rounds off-grid gaps and padding to your token grid (default 8px) |
| **Reorder** | Sorts children into reading order (top→bottom, left→right) |

All fixes are previewed with confidence badges (High / Medium / Review). You pick what to apply. ⌘Z reverts everything in one step.

## Install (local dev)

```bash
npm install
npm run build
```

Then in Figma desktop:

1. **Plugins → Development → Import plugin from manifest…**
2. Pick `manifest.json` in this folder.
3. Run **Restructure** from the Plugins menu.

For iterative development:

```bash
npm run watch
```

Reload the plugin in Figma after each rebuild: right-click canvas → *Plugins → Development → Hot reload plugin*.

## Gemini API key setup

AI renaming requires a free Gemini API key:

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey) and create a key.
2. Open the plugin → **Settings** tab → paste the key into **Gemini API key**.
3. Save. The key is stored in `figma.clientStorage` (local to your machine only).

Without a key, structural fixes (AL inference, spacing snap, reorder) still work. Layer names fall back to content-based heuristics.

## Usage

1. Select one or more frames (or choose Page / File scope).
2. Click **Scan**. Restructure walks the layer tree and proposes fixes.
3. AI naming runs in the background — watch the naming bar.
4. Review the fix list. High-confidence fixes are pre-checked; Review-tier items are unchecked.
5. Click **Apply Selected** or **Apply High** (applies all High-confidence fixes at once).
6. After apply, the list shows ✓ / ✗ / – status per fix.
7. ⌘Z to undo everything in one step if needed.

## Settings

| Setting | Default | Description |
|---|---|---|
| Grid (px) | `8` | Spacing values snap to multiples of this |
| Token overrides | — | JSON map of custom snap values, e.g. `{"4":4,"12":12}` |
| Gemini API key | — | Required for AI layer naming |
| Ignore patterns | `^_` | Regex list — layers matching any pattern are skipped |
| Confidence threshold | `0.7` | Reserved for future scoring filter |

## Limits

- **Max 20 frames** exported to the AI provider per scan (larger scans skip extras with a warning).
- Frames larger than **4096 × 4096 px** are skipped for AI naming (still get structural fixes).
- Network calls go only to `generativelanguage.googleapis.com` (Gemini), `api.anthropic.com` (Claude, if selected as the provider), and `unpkg.com` (Phosphor icon SVGs for the Icons tab) — no other endpoints.
- Only layer **structure** is modified. Colors, fills, text content, effects, typography — never touched.

## Project layout

```
src/
  code.ts              sandbox entry — figma API + message router
  ui.tsx               React root
  ui.html              plugin shell (styles + JS inlined at build time)
  styles.css
  core/
    types.ts           Settings, Fix union, postMessage types
    scan.ts            layer tree walker
    apply.ts           fix writer
    infer-autolayout.ts
    snap-spacing.ts
    reorder.ts
  utils/
    storage.ts         figma.clientStorage wrapper
    tree.ts            layer tree → JSON for Gemini
    export.ts          node → PNG base64
  ui/
    App.tsx
    MainPanel.tsx
    FixList.tsx / FixItem.tsx
    SettingsPanel.tsx
    bridge.ts          postMessage helpers
    api/
      gemini.ts        Gemini 2.5 Flash multimodal caller
      fallback-names.ts  content-based name heuristics
assets/icon.svg
manifest.json
esbuild.config.mjs
tests/                 Node test runner — pure function unit tests
```

## Build commands

```bash
npm run build      # produces dist/code.js + dist/ui.html
npm run watch      # esbuild watch mode
npm run typecheck  # tsc --noEmit
npm test           # Node built-in test runner
```
