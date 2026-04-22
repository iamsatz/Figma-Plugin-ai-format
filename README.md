# Layercraft

Personal Figma plugin that cleans up **layer structure** (names, Auto Layout, spacing, order) without touching any visual design. Structure-only.

## Status

**Phase 1 — Scaffolding** complete:

- Plugin sandbox ↔ UI iframe bridge (postMessage round-trip)
- Settings panel persisting via `figma.clientStorage`
- Grid / tokens / Gemini API key / ignore patterns / confidence threshold
- Placeholder icon

Phases 2–5 (scan pipeline, Auto Layout inference, spacing snap, reorder, preview/diff UI, Gemini naming, polish) are not yet implemented.

## Install (local dev)

```bash
npm install
npm run build
```

Then in Figma desktop:

1. **Plugins → Development → Import plugin from manifest…**
2. Pick `manifest.json` in this folder.
3. Run **Layercraft** from the Plugins menu.

For iterative development:

```bash
npm run watch
```

Reload the plugin window in Figma after each rebuild (right-click → *Plugins → Development → Hot reload plugin*).

## Layout

```
src/
  code.ts              sandbox entry — message router + clientStorage access
  ui.tsx               React root
  ui.html              shell (styles + bundled JS inlined at build time)
  styles.css
  core/types.ts        Settings, Fix union, postMessage types
  utils/storage.ts     figma.clientStorage wrapper
  ui/
    App.tsx
    MainPanel.tsx      Phase 1 placeholder + ping/pong tester
    SettingsPanel.tsx
    bridge.ts          postMessage helpers
assets/icon.svg        placeholder logo
manifest.json
esbuild.config.mjs
```

## Verify Phase 1

1. `npm run build` exits clean, `dist/code.js` and `dist/ui.html` present
2. `npm run typecheck` passes
3. Plugin opens 400×640, shows Layercraft logo and Main/Settings tabs
4. Settings → fill grid `8` + API key `test` → Save → toast "Settings saved"
5. Close and reopen plugin → Settings values still populated
6. Main tab → *Test bridge (ping)* → UI devtools logs `pong from sandbox`

## Next (Phase 2 preview)

- `core/scan.ts` — walk selection and collect Fix candidates
- `core/infer-autolayout.ts`, `snap-spacing.ts`, `reorder.ts` — pure functions
- `core/apply.ts` — write accepted fixes back
- Wire scan results into the UI (but keep Phase 1 bridge untouched)
