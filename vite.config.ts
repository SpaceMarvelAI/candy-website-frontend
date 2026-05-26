import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,  // fail loudly if 3000 is taken instead of silently picking another
    open: false,
    proxy: {
      '/sm-api': {
        target: 'https://dashboard-api.spacemarvel.ai',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/sm-api/, ''),
      },
    },
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
});
