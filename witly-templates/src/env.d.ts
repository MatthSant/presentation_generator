import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

/** O que vem de secrets/provider e não do wrangler.jsonc (`wrangler types` não gera). */
interface ExtraEnv {
  OAUTH_PROVIDER: OAuthHelpers;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  COOKIE_ENCRYPTION_KEY: string;
  /** Segredo p/ assinar URLs de download do kit (HMAC). Se ausente, usa COOKIE_ENCRYPTION_KEY. */
  DOWNLOAD_SIGNING_KEY?: string;
  PUBLIC_URL?: string;
}

declare global {
  interface Env extends ExtraEnv {}
  namespace Cloudflare {
    interface Env extends ExtraEnv {}
  }
}

export {};
