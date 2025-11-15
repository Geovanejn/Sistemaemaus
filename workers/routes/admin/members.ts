import type { Hono } from 'hono';
import type { AuthContext } from '../../types';
import type { D1Storage } from '../../storage/d1-storage';
import type { R2Storage } from '../../storage/r2-storage';
import { 
  addMemberSchema, 
  updateMemberSchema,
} from '@shared/schema-worker';

/**
 * Member Routes - CRUD de membros + upload de fotos
 * 
 * NOTA: Rotas GET foram movidas para workers/routes/members.ts (montadas em /api/members)
 * para manter compatibilidade com frontend. Este router mantém apenas operações de escrita.
 * 
 * POST   /members              - Criar novo membro
 * PATCH  /members/:id          - Atualizar membro
 * DELETE /members/:id          - Deletar membro
 * POST   /members/:id/photo    - Upload foto do membro (R2)
 */
export function createMemberRoutes(app: Hono<AuthContext>) {
  
  // POST /api/admin/members - Criar membro
  app.post('/members', async (c) => {
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const validatedData = addMemberSchema.parse(await c.req.json());
      
      // Verificar se email já existe
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return c.json({ message: 'Email já cadastrado' }, 400);
      }

      // Criar usuário (senha aleatória temporária, hasPassword: false)
      const user = await storage.createUser({
        fullName: validatedData.fullName,
        email: validatedData.email,
        password: Math.random().toString(36), // Temporária
        hasPassword: false,
        photoUrl: validatedData.photoUrl || null,
        birthdate: validatedData.birthdate,
        isAdmin: false,
        isMember: true,
        activeMember: validatedData.activeMember,
      } as any);

      // Remover senha da resposta
      const { password, ...userWithoutPassword } = user;
      return c.json(userWithoutPassword, 201);
    } catch (error) {
      console.error('[Admin] Error creating member:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao adicionar membro' 
      }, 400);
    }
  });

  // PATCH /api/admin/members/:id - Atualizar membro
  app.patch('/members/:id', async (c) => {
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const memberId = parseInt(c.req.param('id'));
      
      if (isNaN(memberId)) {
        return c.json({ message: 'ID inválido' }, 400);
      }

      const validatedData = updateMemberSchema.parse(await c.req.json());

      // Verificar se novo email já está em uso
      if (validatedData.email) {
        const existingUser = await storage.getUserByEmail(validatedData.email);
        if (existingUser && existingUser.id !== memberId) {
          return c.json({ message: 'Este email já está sendo usado por outro membro' }, 400);
        }
      }

      const updatedUser = await storage.updateUser(memberId, validatedData);
      
      if (!updatedUser) {
        return c.json({ message: 'Membro não encontrado' }, 404);
      }

      const { password, ...userWithoutPassword } = updatedUser;
      return c.json(userWithoutPassword);
    } catch (error) {
      console.error('[Admin] Error updating member:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao atualizar membro' 
      }, 400);
    }
  });

  // DELETE /api/admin/members/:id - Deletar membro
  app.delete('/members/:id', async (c) => {
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const memberId = parseInt(c.req.param('id'));
      
      if (isNaN(memberId)) {
        return c.json({ message: 'ID inválido' }, 400);
      }

      await storage.deleteMember(memberId);
      return c.json({ message: 'Membro removido com sucesso' });
    } catch (error) {
      console.error('[Admin] Error deleting member:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao remover membro' 
      }, 400);
    }
  });

  // POST /api/admin/members/:id/photo - Upload foto (R2)
  app.post('/members/:id/photo', async (c) => {
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const r2Storage = c.get('r2Storage') as R2Storage;
      const memberId = parseInt(c.req.param('id'));
      
      if (isNaN(memberId)) {
        return c.json({ message: 'ID inválido' }, 400);
      }

      // Verificar se membro existe
      const user = await storage.getUserById(memberId);
      if (!user) {
        return c.json({ message: 'Membro não encontrado' }, 404);
      }

      // Extrair foto do FormData
      const formData = await c.req.formData();
      const file = formData.get('photo') as File;
      
      if (!file) {
        return c.json({ message: 'Nenhuma foto foi enviada' }, 400);
      }

      // Validação adicional de tamanho/tipo (R2Storage já faz, mas double-check)
      if (file.size === 0) {
        return c.json({ message: 'Arquivo vazio' }, 400);
      }

      // Upload para R2
      const buffer = await file.arrayBuffer();
      
      try {
        const photoKey = await r2Storage.uploadPhoto(memberId, buffer, file.type);
        const photoUrl = r2Storage.getPhotoUrl(photoKey);

        // Atualizar photoUrl no banco
        await storage.updateUser(memberId, { photoUrl });

        return c.json({ 
          message: 'Foto enviada com sucesso',
          photoKey,
          photoUrl,
        });
      } catch (uploadError) {
        // Erros de validação do R2Storage (MIME, tamanho) retornam 400
        const errorMessage = uploadError instanceof Error ? uploadError.message : 'Erro ao fazer upload';
        
        if (errorMessage.includes('Unsupported') || errorMessage.includes('too large') || errorMessage.includes('empty')) {
          return c.json({ message: errorMessage }, 400);
        }
        
        // Erros de storage (R2.put failure) retornam 500
        throw uploadError;
      }
    } catch (error) {
      console.error('[Admin] Error uploading photo:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao fazer upload da foto' 
      }, 500);
    }
  });

  return app;
}
