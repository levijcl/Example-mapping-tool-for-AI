/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { DEFAULT_PORT } from '@example-map/shared';

const target = `http://127.0.0.1:${process.env.PORT ?? DEFAULT_PORT}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': target,
      '/mcp': target,
      '/ws': { target, ws: true },
    },
  },
  test: { name: 'web', environment: 'node' },
});
