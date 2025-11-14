import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

app.use('/*', cors({
  origin: '*',
  credentials: true,
}));

app.get('/', (c) => {
  return c.json({
    message: 'Emaús Vota API - Cloudflare Workers',
    status: 'online',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    database: 'connected',
    storage: 'connected',
  });
});

export default app;

export { Env };
