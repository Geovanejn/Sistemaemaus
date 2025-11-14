import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

// Fetcher type for Assets binding
interface Fetcher {
  fetch(request: Request | string): Promise<Response>;
}

export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  ASSETS: Fetcher;
  RESEND_API_KEY: string;
  SESSION_SECRET: string;
  RESEND_FROM_EMAIL: string;
}

export interface SessionUser {
  id: number;
  email: string;
  fullName: string;
  isAdmin: boolean;
}

/**
 * JWT payload structure
 */
export interface JWTPayload {
  id: number;
  email: string;
  isAdmin: boolean;
  isMember: boolean;
  exp: number; // Expiration timestamp (seconds)
}

/**
 * Hono context type with authentication support
 * Includes both environment bindings and user variable
 * Note: user is optional as not all routes require authentication
 */
export type AuthContext = {
  Bindings: Env;
  Variables: {
    user?: JWTPayload;
    d1Storage?: any; // D1Storage instance (injected in admin routes)
    r2Storage?: any; // R2Storage instance (injected in admin routes)
  };
}
