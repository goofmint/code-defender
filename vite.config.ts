import { defineConfig } from 'vite';

// Production builds are published at https://goofmint.github.io/code-defender/
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/code-defender/' : '/',
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
}));
