import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // Os componentes de tela usam o JSX automático do React 19.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': here('./src'),
      // `server-only` lança fora do ambiente de servidor do Next; nos testes é um módulo vazio.
      'server-only': here('./src/test/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: [here('./src/test/setup.ts')],
    include: ['src/**/*.test.{ts,tsx}'],
    // O Postgres embutido (PGlite) sobe em WebAssembly: dá mais folga ao primeiro teste de cada arquivo.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
