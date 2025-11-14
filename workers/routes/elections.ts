import { Hono } from 'hono';
import type { AuthContext } from '../types';
import { D1Storage } from '../storage/d1-storage';
import { createAdminMiddleware } from './middleware/admin';
import { createAuthMiddleware } from '../auth';

/**
 * Elections Routes - Rotas de gerenciamento de eleições
 * 
 * ATENÇÃO: Montado em /api/elections (SEM /admin prefix) para compatibilidade
 * com clientes existentes, MAS ainda protegido por admin middleware
 * 
 * Rotas:
 * - GET    /api/elections/:id/attendance - Lista presença (ADMIN)
 * - POST   /api/elections/:id/attendance/initialize - Inicializar (ADMIN)
 * - PATCH  /api/elections/:id/attendance/:memberId - Atualizar presença (ADMIN)
 * - GET    /api/elections/:id/attendance/count - Contar presentes (qualquer autenticado)
 */
export function createElectionsRoutes(app: Hono<AuthContext>) {
  const electionsRouter = new Hono<AuthContext>();
  
  // ========================================
  // MIDDLEWARE CHAIN (router-level - executa em ORDEM)
  // ========================================
  
  // 1. Dependency injection PRIMEIRO
  electionsRouter.use('/*', async (c, next) => {
    c.set('d1Storage', new D1Storage(c.env.DB));
    await next();
  });
  
  // 2. Authentication SEGUNDO (todas rotas precisam auth)
  electionsRouter.use('/*', createAuthMiddleware());
  
  // ========================================
  // ATTENDANCE ROUTES
  // ========================================
  // NOTA: Todas requerem AUTH (via .use acima)
  // Rotas admin fazem verificação manual de isAdmin no handler
  
  // GET /api/elections/:id/attendance - Lista de presença (ADMIN)
  electionsRouter.get('/:id/attendance', async (c) => {
    // Verificação manual de admin
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const electionId = parseInt(c.req.param('id'));
      
      const attendance = await storage.getElectionAttendance(electionId);
      
      // Buscar vencedores para excluir da lista de presença
      const winners = await storage.getElectionWinners(electionId);
      const winnerUserIds = new Set(winners.map(w => w.userId));
      
      // Join com dados do usuário e filtrar vencedores
      const attendanceWithUsers = await Promise.all(
        attendance.map(async (att) => {
          const user = await storage.getUserById(att.memberId);
          return {
            ...att,
            memberName: user?.fullName || '',
            memberEmail: user?.email || '',
          };
        })
      );
      
      const filtered = attendanceWithUsers.filter(att => !winnerUserIds.has(att.memberId));
      
      return c.json(filtered);
    } catch (error) {
      console.error('[Elections] Error getting attendance:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao buscar presença' 
      }, 500);
    }
  });

  // POST /api/elections/:id/attendance/initialize - Inicializar lista (ADMIN)
  electionsRouter.post('/:id/attendance/initialize', async (c) => {
    // Verificação manual de admin
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const electionId = parseInt(c.req.param('id'));
      
      await storage.initializeAttendance(electionId);
      return c.json({ message: 'Lista de presença inicializada' });
    } catch (error) {
      console.error('[Elections] Error initializing attendance:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao inicializar presença' 
      }, 400);
    }
  });

  // PATCH /api/elections/:id/attendance/:memberId - Atualizar presença (ADMIN)
  electionsRouter.patch('/:id/attendance/:memberId', async (c) => {
    // Verificação manual de admin
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const electionId = parseInt(c.req.param('id'));
      const memberId = parseInt(c.req.param('memberId'));
      const { isPresent } = await c.req.json();
      
      if (typeof isPresent !== 'boolean') {
        return c.json({ message: 'isPresent deve ser booleano' }, 400);
      }
      
      await storage.setMemberAttendance(electionId, memberId, isPresent);
      return c.json({ message: 'Presença atualizada' });
    } catch (error) {
      console.error('[Elections] Error setting attendance:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao atualizar presença' 
      }, 400);
    }
  });

  // GET /api/elections/:id/attendance/count - Contar presentes (qualquer autenticado)
  // NOTA: Esta rota NÃO requer admin, apenas autenticação (já aplicada via .use)
  electionsRouter.get('/:id/attendance/count', async (c) => {
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const electionId = parseInt(c.req.param('id'));
      
      const count = await storage.getPresentCount(electionId);
      return c.json({ count });
    } catch (error) {
      console.error('[Elections] Error counting attendance:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao contar presença' 
      }, 500);
    }
  });

  // Montar router no app principal
  app.route('/api/elections', electionsRouter);
  
  return app;
}
