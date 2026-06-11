import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // Coverage is scoped to the unit-testable business logic: the API client
      // layer, utilities, hooks, and the error boundaries. Presentation-heavy
      // components, full pages, and browser-media modules (MediaSource/MediaRecorder/
      // SSE streaming) are excluded — they're verified by the build + manual QA,
      // not unit tests, and would otherwise dilute the signal.
      include: [
        'src/api/**/*.ts',
        'src/utils/**/*.ts',
        'src/hooks/**/*.ts',
        'src/components/ErrorBoundary.tsx',
      ],
      exclude: [
        'src/api/index.ts',     // barrel re-export, no logic
        'src/api/tts.ts',       // MediaSource Extensions — not available in jsdom
        'src/utils/mockData.ts', // static seed data, no logic
      ],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      // The predeploy-check orchestrator reads coverage/coverage-summary.json
      // and decides the verdict itself, so we don't hard-fail the test run on
      // a coverage threshold here (that would mask which tests actually passed).
    },
  },
});
