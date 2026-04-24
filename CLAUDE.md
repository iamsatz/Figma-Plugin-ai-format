# Restructure — project notes for Claude Code

## What this is

Personal Figma plugin that cleans up **layer structure** (names, Auto Layout, spacing, order) without ever touching visual design. Structure-only. Single user. Gemini 2.5 Flash for layer naming.

See `README.md` for install/build and the PRD (in session history) for the full spec.

## Build commands

- `npm run build` — produce `dist/code.js` and `dist/ui.html`
- `npm run watch` — esbuild watch mode
- `npm run typecheck` — `tsc --noEmit`

Always run `npm run typecheck` and `npm run build` before declaring a feature done.

## DO NOT raise the esbuild target above es2017

`esbuild.config.mjs` pins `target: 'es2017'` for both bundles. Figma's plugin sandbox (QuickJS) chokes on `?.` and `??` with `Syntax error on line 1: Unexpected token ?`, which Figma then surfaces as the generic *"An error occurred while running this plugin"* banner with no further hint. Targeting es2017 forces esbuild to transpile optional chaining and nullish coalescing down to equivalent ternary checks.

If you need a newer runtime feature, add a shim — do not bump the target.

## Hard scope rule

The plugin **must never** modify any visual attribute: colours, fills, strokes, effects, opacity, text content, typography, corner radii, or visual-only node props. Only these properties are in scope:

- `name`
- `layoutMode`, `itemSpacing`, `paddingTop/Right/Bottom/Left`, `primaryAxisAlignItems`, `counterAxisAlignItems`
- child order within a parent
- Group → Frame conversion when Auto Layout needs it

Any PR / diff that touches a visual attribute is a bug.

## Review agents (run at end of every session)

After finishing work in a session — always, even for small changes — invoke the following five agents in parallel and surface their findings to the user:

1. `tester` — build/typecheck/feature verification
2. `ui-designer` — visual/UI bugs
3. `product-designer` — scope discipline vs the PRD
4. `user` — first-person persona walkthrough
5. `ux-analyst` — flow/state/accessibility bugs

All five live in `.claude/agents/`. Launch them concurrently (one message, five Agent tool calls) so reviews come back in parallel. Summarise their findings for the user at the end of the session and, if any blockers surfaced, offer to fix them before closing out.

## Branch

All Phase-by-Phase work happens on `claude/figma-layer-cleanup-plugin-Evq6K`. Do not push to other branches without explicit permission.
