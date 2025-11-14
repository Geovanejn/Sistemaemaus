import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
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
