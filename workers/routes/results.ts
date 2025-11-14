import { Hono } from 'hono';
import type { AuthContext } from '../types';
import { D1Storage } from '../storage/d1-storage';
import { createAuthMiddleware } from '../auth';

/**
 * Results Routes - Resultados das eleições
 * 
 * Rotas:
 * - GET /api/results/latest - Resultados da última eleição
 * - GET /api/results/:electionId - Resultados de eleição específica
 * - GET /api/elections/:electionId/winners - Vencedores da eleição
 */
export function createResultsRoutes(app: Hono<AuthContext>) {
  const resultsRouter = new Hono<AuthContext>();
  
  // Middleware chain
  resultsRouter.use('/*', async (c, next) => {
    c.set('d1Storage', new D1Storage(c.env.DB));
    await next();
  });
  
  resultsRouter.use('/*', createAuthMiddleware());
  
  // GET /api/results/latest - Resultados da última eleição (ADMIN ONLY)
  resultsRouter.get('/latest', async (c) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const results = await storage.getLatestElectionResults();
      
      if (!results) {
        return c.json({ message: 'Nenhuma eleição finalizada encontrada' }, 404);
      }
      
      return c.json(results);
    } catch (error) {
      console.error('[Results] Error getting latest results:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao buscar resultados' 
      }, 500);
    }
  });
  
  // GET /api/results/:electionId - Resultados de eleição específica (ADMIN ONLY)
  resultsRouter.get('/:electionId', async (c) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const electionId = parseInt(c.req.param('electionId'));
      
      const results = await storage.getElectionResults(electionId);
      return c.json(results);
    } catch (error) {
      console.error('[Results] Error getting results:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao buscar resultados' 
      }, 500);
    }
  });
  
  app.route('/api/results', resultsRouter);
  return app;
}

/**
 * Winners Routes - Vencedores por eleição
 * Montado em /api/elections para compatibilidade
 */
export function createWinnersRoutes(app: Hono<AuthContext>) {
  const winnersRouter = new Hono<AuthContext>();
  
  winnersRouter.use('/*', async (c, next) => {
    c.set('d1Storage', new D1Storage(c.env.DB));
    await next();
  });
  
  winnersRouter.use('/*', createAuthMiddleware());
  
  // GET /api/elections/:electionId/winners (ADMIN ONLY)
  winnersRouter.get('/:electionId/winners', async (c) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const electionId = parseInt(c.req.param('electionId'));
      
      const winners = await storage.getElectionWinners(electionId);
      return c.json(winners);
    } catch (error) {
      console.error('[Winners] Error getting winners:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao buscar vencedores' 
      }, 500);
    }
  });
  
  app.route('/api/elections', winnersRouter);
  return app;
}
