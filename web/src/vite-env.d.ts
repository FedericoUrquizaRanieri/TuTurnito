/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where complexes that want to join write to (owner accounts are created by hand). */
  readonly VITE_CONTACT_EMAIL?: string;
  /** Cloudflare Turnstile site key; without it the captcha isn't shown (local dev). */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
