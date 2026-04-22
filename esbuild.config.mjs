import esbuild from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

if (!existsSync(outdir)) await mkdir(outdir, { recursive: true });

const commonOptions = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  logLevel: 'info',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
};

const sandboxOptions = {
  ...commonOptions,
  entryPoints: ['src/code.ts'],
  outfile: `${outdir}/code.js`,
};

const uiOptions = {
  ...commonOptions,
  entryPoints: ['src/ui.tsx'],
  outfile: `${outdir}/ui.js`,
  loader: { '.svg': 'text' },
  define: {
    'process.env.NODE_ENV': watch ? '"development"' : '"production"',
  },
};

async function buildHtml() {
  const shell = await readFile('src/ui.html', 'utf8');
  const css = await readFile('src/styles.css', 'utf8');
  const js = await readFile(`${outdir}/ui.js`, 'utf8');
  const inlined = shell
    .replace('/* __STYLES__ */', css)
    .replace('/* __SCRIPT__ */', js);
  await writeFile(`${outdir}/ui.html`, inlined);
}

if (watch) {
  const sandboxCtx = await esbuild.context(sandboxOptions);
  const uiCtx = await esbuild.context({
    ...uiOptions,
    plugins: [
      {
        name: 'rebuild-html',
        setup(build) {
          build.onEnd(async (result) => {
            if (result.errors.length === 0) {
              try {
                await buildHtml();
                console.log('[layercraft] ui.html rebuilt');
              } catch (err) {
                console.error('[layercraft] html inline failed:', err);
              }
            }
          });
        },
      },
    ],
  });
  await Promise.all([sandboxCtx.watch(), uiCtx.watch()]);
  console.log('[layercraft] watching for changes...');
} else {
  await Promise.all([esbuild.build(sandboxOptions), esbuild.build(uiOptions)]);
  await buildHtml();
  // Copy icon alongside build output for convenience; manifest doesn't reference it
  // but the UI reads it via inline SVG import, so this is just a sanity copy.
  if (existsSync('assets/icon.svg')) {
    await cp('assets/icon.svg', path.join(outdir, 'icon.svg'));
  }
  console.log('[layercraft] build complete');
}
