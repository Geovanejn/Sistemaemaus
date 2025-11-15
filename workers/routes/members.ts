import { Hono } from 'hono';
import type { AuthContext } from '../types';
import { D1Storage } from '../storage/d1-storage';
import { createAuthMiddleware } from '../auth';
import { createAdminMiddleware } from './middleware/admin';

/**
 * PUBLIC Member Routes (mounted at /api/members)
 * 
 * IMPORTANTE: Estas rotas são montadas em /api/members (SEM /admin prefix)
 * para manter compatibilidade com o frontend que espera estas URLs.
 * 
 * Estas rotas são PÚBLICAS - voters autenticados precisam acessar para votar.
 * 
 * GET /api/members - Listar todos os membros (PÚBLICO - voters precisam)
 * GET /api/members/non-admins - Listar membros não-admins com filtros (PÚBLICO - voters precisam)
 */
export function createPublicMemberRoutes(app: Hono<AuthContext>) {
  const membersRouter = new Hono<AuthContext>();
  
  // Dependency Injection apenas - SEM auth middleware (rotas públicas)
  membersRouter.use('/*', async (c, next) => {
    c.set('d1Storage', new D1Storage(c.env.DB));
    await next();
  });
  
  // GET /api/members - Listar todos os membros
  membersRouter.get('/', async (c) => {
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const members = await storage.getAllMembers();
      const membersWithoutPasswords = members.map(({ password, ...user }) => user);
      return c.json(membersWithoutPasswords);
    } catch (error) {
      console.error('[Members] Error getting members:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao buscar membros' 
      }, 500);
    }
  });

  // GET /api/members/non-admins - Listar membros não-admins
  // Usado para selecionar candidatos, com filtros:
  // - Exclui admins
  // - Exclui vencedores da eleição atual (query param electionId)
  // - Exclui membros ausentes (presença é verificada via election_attendance)
  membersRouter.get('/non-admins', async (c) => {
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const members = await storage.getAllMembers(true); // Exclude admins
      let membersWithoutPasswords = members.map(({ password, ...user }) => user);
      
      // If electionId is provided, exclude members who already won a position in this election
      // and filter only members who are present
      const electionId = c.req.query('electionId');
      if (electionId) {
        const electionIdNum = parseInt(electionId);
        const winners = await storage.getElectionWinners(electionIdNum);
        const winnerUserIds = new Set(winners.map(w => w.userId));
        
        // Filter by winners
        membersWithoutPasswords = membersWithoutPasswords.filter(m => !winnerUserIds.has(m.id));
        
        // Filter by presence - only include members who are present
        const presentMembers = membersWithoutPasswords.filter(m => 
          storage.isMemberPresent(electionIdNum, m.id)
        );
        
        return c.json(presentMembers);
      }
      
      return c.json(membersWithoutPasswords);
    } catch (error) {
      console.error('[Members] Error getting non-admin members:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao buscar membros' 
      }, 500);
    }
  });
  
  // Montar em /api/members (SEM /admin prefix)
  app.route('/api/members', membersRouter);
  
  return app;
}
