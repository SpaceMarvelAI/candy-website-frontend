import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  console.log(`\n[env] mode=${mode}  VITE_API_BASE_URL=${env.VITE_API_BASE_URL}  VITE_SM_API_URL=${env.VITE_SM_API_URL}  VITE_META_API_URL=${env.VITE_META_API_URL}\n`);

  return {
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
  };
});
