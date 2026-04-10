import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, '..', '..');
const rootPackageJsonPath = resolve(repoRoot, 'package.json');

const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, 'utf-8'));
const fallbackVersion = String(rootPackageJson.version ?? '0.1.0');
const requestedVersion = String(
  process.env.VITE_APP_VERSION?.trim() || fallbackVersion,
);

await build({
  entryPoints: [resolve(repoRoot, 'portal-ui/src/main.tsx')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env': JSON.stringify({
      VITE_APP_VERSION: requestedVersion,
    }),
  },
  outfile: resolve(
    repoRoot,
    'src/simulation/presentation/http/assets/console.js',
  ),
});
