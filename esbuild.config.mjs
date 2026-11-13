import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/main.ts'], outfile: 'dist/main.js', bundle: true,
  platform: 'browser', format: 'cjs', target: 'es2022', sourcemap: 'external',
  external: ['obsidian', 'electron', '@codemirror/*'],
  banner: { js: '/* Quill — generated build; source is in src/. */' }
});
await Promise.all(['manifest.json', 'styles.css'].map(file => copyFile(file, `dist/${file}`)));
