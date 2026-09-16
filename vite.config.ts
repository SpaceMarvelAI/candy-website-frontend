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
      // `env.VITE_SM_API_URL` was being loaded and logged above but never actually used here —
      // this target was a literal hardcoded string, so `/sm-api` always hit PRODUCTION regardless
      // of any local override. That's why the sidebar's cross-app nav ("Meta Space"/"Finixy")
      // fell through to its hardcoded dev.spacemarvel.com fallback in local dev: the real
      // SSO-generate call went to prod, which doesn't recognize a token minted by a local
      // Dashboard, and errored.
      '/sm-api': {
        target: env.VITE_SM_API_URL || 'https://dashboard-api.spacemarvel.ai',
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
