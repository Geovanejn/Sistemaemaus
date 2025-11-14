import { Hono } from 'hono';
import type { AuthContext } from '../types';
import { D1Storage } from '../storage/d1-storage';
import { createAuthMiddleware } from '../auth';

/**
 * Audit Routes - Auditoria de eleições e verificação de PDFs
 * 
 * Rotas:
 * - GET  /api/elections/:electionId/audit - Dados completos de auditoria (ADMIN)
 * - POST /api/elections/:electionId/audit/send-email - Enviar PDF por email (ADMIN)
 * - POST /api/elections/:electionId/audit/save-hash - Salvar hash de verificação (ADMIN)
 */
export function createAuditRoutes(app: Hono<AuthContext>) {
  const auditRouter = new Hono<AuthContext>();
  
  // Middleware chain
  auditRouter.use('/*', async (c, next) => {
    c.set('d1Storage', new D1Storage(c.env.DB));
    await next();
  });
  
  auditRouter.use('/*', createAuthMiddleware());
  
  // GET /api/elections/:electionId/audit - Dados de auditoria (ADMIN)
  auditRouter.get('/:electionId/audit', async (c) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const electionId = parseInt(c.req.param('electionId'));
      
      const auditData = await storage.getElectionAuditData(electionId);
      return c.json(auditData);
    } catch (error) {
      console.error('[Audit] Error getting audit data:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao buscar dados de auditoria' 
      }, 500);
    }
  });
  
  // POST /api/elections/:electionId/audit/send-email - Enviar PDF (ADMIN)
  auditRouter.post('/:electionId/audit/send-email', async (c) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const { recipientEmail, pdfBase64, electionName } = await c.req.json();
      
      if (!recipientEmail || !pdfBase64 || !electionName) {
        return c.json({ 
          message: 'recipientEmail, pdfBase64 e electionName são obrigatórios' 
        }, 400);
      }
      
      // TODO: Implementar envio de email com Resend
      // Este código será implementado quando migrarmos o email.ts para Workers
      // Por enquanto, retornar sucesso simulado
      
      console.log('[Audit] Email sending not yet implemented for Workers');
      return c.json({ 
        message: 'Funcionalidade de envio de email será implementada em breve',
        status: 'pending_implementation'
      });
    } catch (error) {
      console.error('[Audit] Error sending email:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao enviar email' 
      }, 500);
    }
  });
  
  // POST /api/elections/:electionId/audit/save-hash - Salvar hash (ADMIN)
  auditRouter.post('/:electionId/audit/save-hash', async (c) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
      return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
    }
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const electionId = parseInt(c.req.param('electionId'));
      const { verificationHash, presidentName } = await c.req.json();
      
      if (!verificationHash) {
        return c.json({ message: 'verificationHash é obrigatório' }, 400);
      }
      
      const pdfVerification = await storage.createPdfVerification(
        electionId,
        verificationHash,
        presidentName
      );
      
      return c.json({ 
        message: 'Hash de verificação salvo com sucesso',
        pdfVerification
      });
    } catch (error) {
      console.error('[Audit] Error saving hash:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao salvar hash de verificação' 
      }, 400);
    }
  });
  
  app.route('/api/elections', auditRouter);
  return app;
}
