import { Hono } from 'hono';
import type { AuthContext } from '../types';
import { D1Storage } from '../storage/d1-storage';
import { createAuthMiddleware } from '../auth';

/**
 * Positions Routes - Gerenciamento de cargos/posições da eleição
 * 
 * Rotas PÚBLICAS:
 * - GET    /api/elections/:id/positions/active - Cargo ativo (PÚBLICO - voters precisam)
 * 
 * Rotas ADMIN:
 * - GET    /api/elections/:id/positions - Listar cargos da eleição (ADMIN)
 * - POST   /api/elections/:id/positions/advance-scrutiny - Avançar escrutínio (ADMIN)
 * - GET    /api/elections/:id/positions/check-tie - Verificar empate (ADMIN)
 * - POST   /api/elections/:id/positions/resolve-tie - Resolver empate (ADMIN)
 * - POST   /api/elections/:id/positions/open-next - Abrir próximo cargo (ADMIN)
 * - POST   /api/elections/:id/positions/:positionId/open - Abrir cargo específico (ADMIN)
 * - POST   /api/elections/:id/positions/:positionId/force-close - Forçar fechar (ADMIN)
 */
export function createPositionsRoutes(app: Hono<AuthContext>) {
  const positionsRouter = new Hono<AuthContext>();
  
  // Dependency injection apenas - SEM auth middleware global!
  positionsRouter.use('/*', async (c, next) => {
    c.set('d1Storage', new D1Storage(c.env.DB));
    await next();
  });
  
  // GET /api/elections/:id/positions - Listar todos os cargos (ADMIN ONLY)
  positionsRouter.get('/:id/positions', createAuthMiddleware(), async (c) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const electionId = parseInt(c.req.param('id'));
      
      const electionPositions = await storage.getElectionPositions(electionId);
      const allPositions = await storage.getAllPositions();
      
      const positionsWithNames = electionPositions.map(ep => {
        const position = allPositions.find(p => p.id === ep.positionId);
        return {
          ...ep,
          positionName: position?.name || '',
        };
      });
      
      return c.json(positionsWithNames);
    } catch (error) {
      console.error('[Positions] Error getting positions:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao buscar cargos da eleição' 
      }, 500);
    }
  });
  
  // GET /api/elections/:id/positions/active - Cargo ativo (PÚBLICO)
  // IMPORTANTE: Voters autenticados E não-autenticados podem acessar (alinhado com Express)
  positionsRouter.get('/:id/positions/active', async (c) => {
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const electionId = parseInt(c.req.param('id'));
      
      const activePosition = await storage.getActiveElectionPosition(electionId);
      
      if (!activePosition) {
        return c.json({ message: 'Nenhum cargo ativo no momento' }, 404);
      }
      
      const allPositions = await storage.getAllPositions();
      const position = allPositions.find(p => p.id === activePosition.positionId);
      
      return c.json({
        ...activePosition,
        positionName: position?.name || '',
      });
    } catch (error) {
      console.error('[Positions] Error getting active position:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao buscar cargo ativo' 
      }, 500);
    }
  });
  
  // POST /api/elections/:id/positions/advance-scrutiny - Avançar escrutínio (ADMIN)
  positionsRouter.post('/:id/positions/advance-scrutiny', createAuthMiddleware(), async (c) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const electionId = parseInt(c.req.param('id'));
      
      const activePosition = await storage.getActiveElectionPosition(electionId);
      if (!activePosition) {
        return c.json({ message: 'Nenhum cargo ativo para avançar' }, 400);
      }
      
      await storage.advancePositionScrutiny(activePosition.id);
      return c.json({ message: 'Escrutínio avançado com sucesso' });
    } catch (error) {
      console.error('[Positions] Error advancing scrutiny:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao avançar escrutínio' 
      }, 400);
    }
  });
  
  // GET /api/elections/:id/positions/check-tie - Verificar empate (ADMIN ONLY)
  positionsRouter.get('/:id/positions/check-tie', createAuthMiddleware(), async (c) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const electionId = parseInt(c.req.param('id'));
      
      const activePosition = await storage.getActiveElectionPosition(electionId);
      if (!activePosition) {
        return c.json({ hasTie: false, message: 'Nenhum cargo ativo' });
      }
      
      const results = await storage.getElectionResults(electionId);
      if (!results) {
        return c.json({ hasTie: false, message: 'Resultados não encontrados' });
      }
      
      const positionResult = results.positions.find(p => p.positionId === activePosition.positionId);
      
      if (!positionResult) {
        return c.json({ hasTie: false });
      }
      
      if (positionResult.candidates.length === 0) {
        return c.json({ hasTie: false, message: 'Nenhum candidato cadastrado' });
      }
      
      const maxVotes = Math.max(...positionResult.candidates.map(c => c.voteCount));
      const tiedCandidates = positionResult.candidates.filter(c => c.voteCount === maxVotes);
      const hasTie = tiedCandidates.length > 1 && maxVotes > 0;
      
      return c.json({ 
        hasTie,
        tiedCandidates: hasTie ? tiedCandidates : [],
        scrutiny: activePosition.currentScrutiny
      });
    } catch (error) {
      console.error('[Positions] Error checking tie:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao verificar empate' 
      }, 500);
    }
  });
  
  // POST /api/elections/:id/positions/resolve-tie - Resolver empate (ADMIN)
  positionsRouter.post('/:id/positions/resolve-tie', createAuthMiddleware(), async (c) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const electionId = parseInt(c.req.param('id'));
      const { candidateId, positionId } = await c.req.json();
      
      if (!candidateId || !positionId) {
        return c.json({ message: 'candidateId e positionId são obrigatórios' }, 400);
      }
      
      const activePosition = await storage.getActiveElectionPosition(electionId);
      if (!activePosition || activePosition.positionId !== positionId) {
        return c.json({ message: 'Cargo não está ativo ou positionId inválido' }, 400);
      }
      
      await storage.setWinner(electionId, candidateId, positionId, activePosition.currentScrutiny);
      await storage.completePosition(activePosition.id);
      
      return c.json({ message: 'Empate resolvido e vencedor definido' });
    } catch (error) {
      console.error('[Positions] Error resolving tie:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao resolver empate' 
      }, 400);
    }
  });
  
  // POST /api/elections/:id/positions/open-next - Abrir próximo cargo (ADMIN)
  positionsRouter.post('/:id/positions/open-next', createAuthMiddleware(), async (c) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const electionId = parseInt(c.req.param('id'));
      
      const nextPosition = await storage.openNextPosition(electionId);
      
      if (!nextPosition) {
        return c.json({ message: 'Não há mais cargos para abrir' }, 400);
      }
      
      return c.json({ message: 'Próximo cargo aberto com sucesso', position: nextPosition });
    } catch (error) {
      console.error('[Positions] Error opening next position:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao abrir próximo cargo' 
      }, 400);
    }
  });
  
  // POST /api/elections/:id/positions/:positionId/open - Abrir cargo específico (ADMIN)
  positionsRouter.post('/:id/positions/:positionId/open', createAuthMiddleware(), async (c) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const electionId = parseInt(c.req.param('id'));
      const positionId = parseInt(c.req.param('positionId'));
      
      const positions = await storage.getElectionPositions(electionId);
      const electionPosition = positions.find(p => p.positionId === positionId);
      
      if (!electionPosition) {
        return c.json({ message: 'Cargo não encontrado nesta eleição' }, 404);
      }
      
      await storage.openPosition(electionPosition.id);
      return c.json({ message: 'Cargo aberto com sucesso' });
    } catch (error) {
      console.error('[Positions] Error opening position:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao abrir cargo' 
      }, 400);
    }
  });
  
  // POST /api/elections/:id/positions/:positionId/force-close - Forçar fechar (ADMIN)
  positionsRouter.post('/:id/positions/:positionId/force-close', createAuthMiddleware(), async (c) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const electionId = parseInt(c.req.param('id'));
      const positionId = parseInt(c.req.param('positionId'));
      const { reason, shouldReopen } = await c.req.json();
      
      const positions = await storage.getElectionPositions(electionId);
      const electionPosition = positions.find(p => p.positionId === positionId);
      
      if (!electionPosition) {
        return c.json({ message: 'Cargo não encontrado nesta eleição' }, 404);
      }
      
      await storage.forceCompletePosition(electionPosition.id, reason || 'Fechado manualmente', shouldReopen || false);
      return c.json({ message: 'Cargo fechado com sucesso' });
    } catch (error) {
      console.error('[Positions] Error force-closing position:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao fechar cargo' 
      }, 400);
    }
  });
  
  app.route('/api/elections', positionsRouter);
  return app;
}
