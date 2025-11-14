import type { Config } from 'drizzle-kit';

export default {
  schema: './shared/schema-worker.ts',
  out: './migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
} satisfies Config;
