import { Hono } from 'hono';
import type { AuthContext } from '../types';
import { D1Storage } from '../storage/d1-storage';
import { createAdminMiddleware } from './middleware/admin';
import { createAuthMiddleware } from '../auth';

/**
 * Elections Routes - Rotas de gerenciamento de eleições
 * 
 * ATENÇÃO: Montado em /api/elections (SEM /admin prefix) para compatibilidade
 * 
 * Rotas PÚBLICAS:
 * - GET    /api/elections/active - Eleição ativa (PÚBLICO)
 * 
 * Rotas CRUD (ADMIN):
 * - POST   /api/elections - Criar eleição (ADMIN)
 * - PATCH  /api/elections/:id/close - Encerrar eleição (ADMIN)
 * - POST   /api/elections/:id/finalize - Finalizar eleição (ADMIN)
 * - GET    /api/elections/history - Histórico eleições (ADMIN)
 * 
 * Rotas Attendance:
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
  
  // 1. Dependency injection SEMPRE PRIMEIRO (todas rotas)
  electionsRouter.use('/*', async (c, next) => {
    c.set('d1Storage', new D1Storage(c.env.DB));
    await next();
  });
  
  // ========================================
  // ROTAS PÚBLICAS (ANTES do middleware de autenticação)
  // ========================================
  
  // GET /api/elections/active - Eleição ativa (PÚBLICO)
  electionsRouter.get('/active', async (c) => {
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const activeElection = await storage.getActiveElection();
      
      if (!activeElection) {
        return c.json({ message: 'Nenhuma eleição ativa no momento' }, 404);
      }
      
      return c.json(activeElection);
    } catch (error) {
      console.error('[Elections] Error getting active election:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao buscar eleição ativa' 
      }, 500);
    }
  });
  
  // ========================================
  // ELECTIONS CRUD ROUTES (ADMIN - auth middleware por rota)
  // ========================================
  
  // POST /api/elections - Criar eleição (ADMIN)
  electionsRouter.post('/', createAuthMiddleware(), async (c) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const { name } = await c.req.json();
      
      if (!name || typeof name !== 'string') {
        return c.json({ message: 'Nome da eleição é obrigatório' }, 400);
      }
      
      const election = await storage.createElection(name);
      return c.json(election, 201);
    } catch (error) {
      console.error('[Elections] Error creating election:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao criar eleição' 
      }, 400);
    }
  });
  
  // PATCH /api/elections/:id/close - Encerrar eleição (ADMIN)
  electionsRouter.patch('/:id/close', createAuthMiddleware(), async (c) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const electionId = parseInt(c.req.param('id'));
      
      const election = await storage.getElectionById(electionId);
      if (!election) {
        return c.json({ message: 'Eleição não encontrada' }, 404);
      }
      
      await storage.closeElection(electionId);
      return c.json({ message: 'Eleição encerrada com sucesso' });
    } catch (error) {
      console.error('[Elections] Error closing election:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao encerrar eleição' 
      }, 400);
    }
  });
  
  // POST /api/elections/:id/finalize - Finalizar eleição (ADMIN)
  electionsRouter.post('/:id/finalize', createAuthMiddleware(), async (c) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const electionId = parseInt(c.req.param('id'));
      
      const election = await storage.getElectionById(electionId);
      if (!election) {
        return c.json({ message: 'Eleição não encontrada' }, 404);
      }
      
      const positions = await storage.getElectionPositions(electionId);
      const allCompleted = positions.every(p => p.status === 'completed');
      
      if (!allCompleted) {
        return c.json({ message: 'Todos os cargos devem estar decididos antes de finalizar a eleição' }, 400);
      }
      
      await storage.finalizeElection(electionId);
      return c.json({ message: 'Eleição finalizada com sucesso' });
    } catch (error) {
      console.error('[Elections] Error finalizing election:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao finalizar eleição' 
      }, 400);
    }
  });
  
  // GET /api/elections/history - Histórico (ADMIN)
  electionsRouter.get('/history', createAuthMiddleware(), async (c) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const history = await storage.getElectionHistory();
      return c.json(history);
    } catch (error) {
      console.error('[Elections] Error getting history:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao buscar histórico de eleições' 
      }, 500);
    }
  });
  
  // ========================================
  // ATTENDANCE ROUTES (ADMIN - auth middleware por rota)
  // ========================================
  
  // GET /api/elections/:id/attendance - Lista de presença (ADMIN)
  electionsRouter.get('/:id/attendance', createAuthMiddleware(), async (c) => {
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
  electionsRouter.post('/:id/attendance/initialize', createAuthMiddleware(), async (c) => {
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
  electionsRouter.patch('/:id/attendance/:memberId', createAuthMiddleware(), async (c) => {
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
  electionsRouter.get('/:id/attendance/count', createAuthMiddleware(), async (c) => {
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const electionId = parseInt(c.req.param('id'));
      
      const count = await storage.getPresentCount(electionId);
      return c.json({ presentCount: count });
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
