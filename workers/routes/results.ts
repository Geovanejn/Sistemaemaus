import { Hono } from 'hono';
import type { AuthContext } from '../types';
import { D1Storage } from '../storage/d1-storage';
import { createAuthMiddleware } from '../auth';

/**
 * Results Routes - Resultados das eleições
 * 
 * IMPORTANTE: Rotas PÚBLICAS (sem autenticação) para transparência eleitoral
 * 
 * Rotas:
 * - GET /api/results/latest - Resultados da última eleição (PÚBLICO)
 * - GET /api/results/:electionId - Resultados de eleição específica (PÚBLICO)
 * - GET /api/elections/:electionId/winners - Vencedores da eleição (PÚBLICO)
 */
export function createResultsRoutes(app: Hono<AuthContext>) {
  const resultsRouter = new Hono<AuthContext>();
  
  // Dependency injection apenas - SEM auth middleware (rotas públicas)
  resultsRouter.use('/*', async (c, next) => {
    c.set('d1Storage', new D1Storage(c.env.DB));
    await next();
  });
  
  // GET /api/results/latest - Resultados da última eleição (PÚBLICO)
  resultsRouter.get('/latest', async (c) => {
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
  
  // GET /api/results/:electionId - Resultados de eleição específica (PÚBLICO)
  resultsRouter.get('/:electionId', async (c) => {
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
 * 
 * IMPORTANTE: Rota PÚBLICA para transparência dos resultados eleitorais
 */
export function createWinnersRoutes(app: Hono<AuthContext>) {
  const winnersRouter = new Hono<AuthContext>();
  
  // Dependency injection apenas - SEM auth middleware (rota pública)
  winnersRouter.use('/*', async (c, next) => {
    c.set('d1Storage', new D1Storage(c.env.DB));
    await next();
  });
  
  // GET /api/elections/:electionId/winners (PÚBLICO)
  winnersRouter.get('/:electionId/winners', async (c) => {
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
