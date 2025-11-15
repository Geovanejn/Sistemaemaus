import { Hono } from 'hono';
import type { AuthContext } from '../types';
import { D1Storage } from '../storage/d1-storage';
import { createAuthMiddleware } from '../auth';
import { insertCandidateSchema } from '@shared/schema-worker';
import { z } from 'zod';

/**
 * Candidates Routes - Gerenciamento de candidatos
 * 
 * Rotas:
 * - POST /api/candidates - Adicionar candidato (ADMIN)
 * - POST /api/candidates/batch - Adicionar múltiplos candidatos (ADMIN)
 * - GET  /api/candidates - Listar candidatos da eleição ativa
 * - GET  /api/elections/:electionId/positions/:positionId/candidates - Candidatos por posição
 */
export function createCandidatesRoutes(app: Hono<AuthContext>) {
  const candidatesRouter = new Hono<AuthContext>();
  
  // Middleware chain
  candidatesRouter.use('/*', async (c, next) => {
    c.set('d1Storage', new D1Storage(c.env.DB));
    await next();
  });
  
  candidatesRouter.use('/*', createAuthMiddleware());
  
  // POST /api/candidates - Adicionar candidato (ADMIN)
  candidatesRouter.post('/', async (c) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const body = await c.req.json();
      const validatedData = insertCandidateSchema.parse(body);
      
      const candidate = await storage.createCandidate(validatedData);
      return c.json(candidate, 201);
    } catch (error) {
      console.error('[Candidates] Error creating candidate:', error);
      if (error instanceof z.ZodError) {
        return c.json({ message: 'Dados inválidos', errors: error.errors }, 400);
      }
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao adicionar candidato' 
      }, 400);
    }
  });
  
  // POST /api/candidates/batch - Adicionar múltiplos candidatos (ADMIN)
  candidatesRouter.post('/batch', async (c) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const { candidates } = await c.req.json();
      
      if (!Array.isArray(candidates)) {
        return c.json({ message: 'candidates deve ser um array' }, 400);
      }
      
      const validatedCandidates = candidates.map(c => insertCandidateSchema.parse(c));
      
      const created = await Promise.all(
        validatedCandidates.map(candidate => storage.createCandidate(candidate))
      );
      
      return c.json({ 
        message: `${created.length} candidatos adicionados com sucesso`,
        candidates: created
      }, 201);
    } catch (error) {
      console.error('[Candidates] Error creating batch candidates:', error);
      if (error instanceof z.ZodError) {
        return c.json({ message: 'Dados inválidos', errors: error.errors }, 400);
      }
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao adicionar candidatos em lote' 
      }, 400);
    }
  });
  
  // GET /api/candidates - Listar candidatos da eleição ativa (ADMIN ONLY)
  candidatesRouter.get('/', async (c) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const activeElection = await storage.getActiveElection();
      
      if (!activeElection) {
        return c.json({ message: 'Nenhuma eleição ativa' }, 404);
      }
      
      const candidates = await storage.getCandidatesByElection(activeElection.id);
      return c.json(candidates);
    } catch (error) {
      console.error('[Candidates] Error getting candidates:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao buscar candidatos' 
      }, 500);
    }
  });
  
  app.route('/api/candidates', candidatesRouter);
  return app;
}

/**
 * Candidates by Position Routes - Candidatos por posição específica
 * Montado em /api/elections para manter compatibilidade
 */
export function createCandidatesByPositionRoutes(app: Hono<AuthContext>) {
  const router = new Hono<AuthContext>();
  
  router.use('/*', async (c, next) => {
    c.set('d1Storage', new D1Storage(c.env.DB));
    await next();
  });
  
  router.use('/*', createAuthMiddleware());
  
  // GET /api/elections/:electionId/positions/:positionId/candidates (AUTHENTICATED)
  // IMPORTANTE: Voters precisam acessar para ver quem são os candidatos antes de votar!
  router.get('/:electionId/positions/:positionId/candidates', async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Autenticação necessária' }, 401);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const electionId = parseInt(c.req.param('electionId'));
      const positionId = parseInt(c.req.param('positionId'));
      
      const candidates = await storage.getCandidatesByPosition(positionId, electionId);
      return c.json(candidates);
    } catch (error) {
      console.error('[Candidates] Error getting candidates by position:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao buscar candidatos' 
      }, 500);
    }
  });
  
  app.route('/api/elections', router);
  return app;
}
