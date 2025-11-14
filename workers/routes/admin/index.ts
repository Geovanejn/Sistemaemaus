import { Hono } from 'hono';
import type { AuthContext } from '../../types';
import { D1Storage } from '../../storage/d1-storage';
import { R2Storage } from '../../storage/r2-storage';
import { createAdminMiddleware } from '../middleware/admin';
import { createMemberRoutes } from './members';

/**
 * Admin Routes - Rotas protegidas por autenticação + isAdmin
 * 
 * Estrutura:
 * - /api/admin/members/* - CRUD membros + upload fotos
 * 
 * Middleware:
 * - requireAuth - Verifica token JWT válido
 * - requireAdmin - Verifica se user.isAdmin === true
 * 
 * NOTA: Attendance routes foram movidas para /api/elections (sem /admin prefix)
 * para manter compatibilidade com clientes existentes
 */
export function createAdminRoutes(app: Hono<AuthContext>) {
  const adminRouter = new Hono<AuthContext>();
  
  // IMPORTANTE: Dependency injection ANTES de auth/admin middlewares
  // para que erros de autenticação retornem 401/403 limpo (não exception)
  adminRouter.use('/*', async (c, next) => {
    // D1Storage e R2Storage serão acessíveis via c.get()
    c.set('d1Storage', new D1Storage(c.env.DB));
    c.set('r2Storage', new R2Storage(c.env.STORAGE));
    await next();
  });
  
  // Aplicar middleware de admin em todas as rotas (APÓS DI)
  adminRouter.use('/*', createAdminMiddleware());
  
  // Registrar sub-rotas de membros
  createMemberRoutes(adminRouter);
  
  // Montar router no app principal
  app.route('/api/admin', adminRouter);
  
  return app;
}
