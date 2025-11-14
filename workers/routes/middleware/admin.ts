import type { Context, Next } from 'hono';
import type { AuthContext } from '../../types';
import { createAuthMiddleware } from '../../auth';

/**
 * Admin Middleware - Requer autenticação + isAdmin
 * 
 * Combina:
 * 1. createAuthMiddleware() - Valida JWT e hydrata c.set('user')
 * 2. Verificação isAdmin - Retorna 403 se não for admin
 * 
 * @example
 * app.use('/api/admin/*', createAdminMiddleware());
 */
export function createAdminMiddleware() {
  return async (c: Context<AuthContext>, next: Next) => {
    // 1. Primeiro validar autenticação (JWT)
    const authMiddleware = createAuthMiddleware();
    const authResult = await authMiddleware(c, async () => {
      // Autenticação bem-sucedida, continuar para verificação admin
    });
    
    // Se authMiddleware retornou resposta (erro 401/403), parar aqui
    if (authResult) {
      return authResult;
    }
    
    // 2. Verificar se é admin
    const user = c.get('user');
    
    if (!user) {
      return c.json({ error: 'Não autenticado' }, 401);
    }
    
    if (!user.isAdmin) {
      console.log(`[Admin Middleware] Access denied for user ${user.id} (isAdmin: ${user.isAdmin})`);
      return c.json({ error: 'Acesso negado. Apenas administradores podem acessar esta rota.' }, 403);
    }
    
    console.log(`[Admin Middleware] Access granted for admin user ${user.id}`);
    await next();
  };
}
