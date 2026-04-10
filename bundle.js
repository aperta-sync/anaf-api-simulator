const { build } = require('esbuild');
const { join } = require('path');

build({
  entryPoints: [join(__dirname, 'src', 'main.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: join(__dirname, 'dist', 'bundle.js'),
  external: ['@nestjs/microservices', '@nestjs/websockets/socket-module', 'ioredis'], // ioredis is problematic to bundle
  minify: true,
  sourcemap: false,
  tsconfig: join(__dirname, 'tsconfig.json'),
  define: {
    'process.env.NODE_ENV': '"production"'
  }
}).catch(() => process.exit(1));
