import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, AuthContext } from './types';
import { R2Storage } from './storage/r2-storage';
import { createAuthRoutes } from './routes/auth';
import { createAdminRoutes } from './routes/admin';
import { createElectionsRoutes } from './routes/elections';
import { createPositionsRoutes } from './routes/positions';
import { createCandidatesRoutes, createCandidatesByPositionRoutes } from './routes/candidates';
import { createVotesRoutes } from './routes/votes';
import { createResultsRoutes, createWinnersRoutes } from './routes/results';
import { createAuditRoutes } from './routes/audit';

const app = new Hono<AuthContext>();

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

/**
 * Rota para servir fotos do R2
 * 
 * GET /photos/{key} - Serve foto com cache headers apropriados
 * 
 * @example
 * GET /photos/photos/1-1731609234567.jpg
 * Returns: JPEG image com cache de 1 ano
 */
app.get('/photos/*', async (c) => {
  const key = c.req.param('*');
  
  if (!key) {
    return c.json({ error: 'Photo key is required' }, 400);
  }
  
  const r2Storage = new R2Storage(c.env.STORAGE);
  return await r2Storage.servePhoto(c, key);
});

// Register authentication routes
createAuthRoutes(app);

// Register admin routes (protected by admin middleware)
createAdminRoutes(app);

// Register elections routes (CRUD + attendance - protected by auth + admin checks)
createElectionsRoutes(app);

// Register positions routes (position management - protected by auth + admin checks)
createPositionsRoutes(app);

// Register candidates routes (candidate management - protected by auth + admin checks)
createCandidatesRoutes(app);
createCandidatesByPositionRoutes(app);

// Register votes routes (voting system - protected by auth)
createVotesRoutes(app);

// Register results routes (election results - protected by auth)
createResultsRoutes(app);
createWinnersRoutes(app);

// Register audit routes (audit data and PDF verification - protected by auth + admin checks)
createAuditRoutes(app);

export default app;

export { Env };
