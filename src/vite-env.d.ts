/// <reference types="vite/client" />

/**
 * Every VITE_* variable this app actually reads. Augments (does not replace)
 * vite/client's own ImportMetaEnv, so DEV / PROD / MODE / BASE_URL / SSR still
 * come from there.
 *
 * All optional: none is guaranteed to be defined at build time, and every read
 * site already falls back. Declaring them here is what lets `import.meta.env.X`
 * be read directly instead of through the `(import.meta as any).env?.X` cast
 * that used to be sprinkled across ~15 call sites.
 */
interface ImportMetaEnv {
  /** Candy backend base URL. Falls back to http://localhost:8002. */
  readonly VITE_API_BASE_URL?: string;
  /** 'true' forces verbose logging in a production build (src/utils/logger.ts). */
  readonly VITE_DEBUG?: string;
  /** localhost-only auto-login (src/utils/devAuth.ts). */
  readonly VITE_DEV_TOKEN?: string;
  /** localhost-only auto-login — JSON-encoded AuthUser (src/utils/devAuth.ts). */
  readonly VITE_DEV_USER?: string;
  /** Sibling SpaceMarvel apps linked from the sidebar / Composio SSO. */
  readonly VITE_SM_API_URL?: string;
  readonly VITE_META_API_URL?: string;
  readonly VITE_META_APP_URL?: string;
  readonly VITE_FINIXY_APP_URL?: string;
  /** PostHog (src/main.tsx). Analytics is skipped entirely without the key. */
  readonly VITE_PUBLIC_POSTHOG_KEY?: string;
  readonly VITE_PUBLIC_POSTHOG_HOST?: string;
  /** S3 target for the in-app "report an issue" screenshot upload. */
  readonly VITE_REPORT_ISSUES_BUCKET?: string;
  readonly VITE_REPORT_ISSUES_REGION?: string;
  readonly VITE_REPORT_ISSUES_ACCESS_KEY_ID?: string;
  readonly VITE_REPORT_ISSUES_SECRET_ACCESS_KEY?: string;
}
