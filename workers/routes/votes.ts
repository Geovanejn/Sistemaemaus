import { Hono } from 'hono';
import type { AuthContext } from '../types';
import { D1Storage } from '../storage/d1-storage';
import { createAuthMiddleware } from '../auth';
import { insertVoteSchema } from '@shared/schema-worker';
import { z } from 'zod';

/**
 * Votes Routes - Sistema de votação
 * 
 * Rotas:
 * - POST /api/vote - Registrar voto
 */
export function createVotesRoutes(app: Hono<AuthContext>) {
  const votesRouter = new Hono<AuthContext>();
  
  // Middleware chain
  votesRouter.use('/*', async (c, next) => {
    c.set('d1Storage', new D1Storage(c.env.DB));
    await next();
  });
  
  votesRouter.use('/*', createAuthMiddleware());
  
  // POST /api/vote - Registrar voto
  votesRouter.post('/', async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Usuário não autenticado' }, 401);
    }
    
    try {
      const storage = c.get('d1Storage') as D1Storage;
      const body = await c.req.json();
      
      const { candidateId, positionId, electionId, scrutinyRound } = body;
      
      // Validação: todos campos obrigatórios (candidateId pode ser null para voto em branco)
      if (candidateId === undefined || !positionId || !electionId || scrutinyRound === undefined) {
        return c.json({ 
          message: 'candidateId, positionId, electionId e scrutinyRound são obrigatórios' 
        }, 400);
      }
      
      // 1. Validar eleição
      const election = await storage.getElectionById(electionId);
      if (!election) {
        return c.json({ message: 'Eleição não encontrada' }, 404);
      }
      
      if (!election.isActive || election.closedAt) {
        return c.json({ message: 'Eleição não está ativa' }, 400);
      }
      
      // 2. Validar presença
      const isPresent = await storage.isMemberPresent(electionId, user.id);
      if (!isPresent) {
        return c.json({ message: 'Você não está marcado como presente nesta eleição' }, 403);
      }
      
      // 3. Validar se já votou
      const hasVoted = await storage.hasUserVoted(user.id, positionId, electionId, scrutinyRound);
      if (hasVoted) {
        return c.json({ message: 'Você já votou neste escrutínio' }, 400);
      }
      
      // 4. Validar cargo ativo
      const activePosition = await storage.getActiveElectionPosition(electionId);
      if (!activePosition) {
        return c.json({ message: 'Nenhum cargo está aberto para votação no momento' }, 400);
      }
      
      if (activePosition.positionId !== positionId) {
        return c.json({ message: 'Este cargo não está aberto para votação no momento' }, 400);
      }
      
      // 5. Validar escrutínio
      if (activePosition.currentScrutiny !== scrutinyRound) {
        return c.json({ 
          message: `Escrutínio inválido. Escrutínio atual: ${activePosition.currentScrutiny}` 
        }, 400);
      }
      
      // 6. Validar candidato (se não for voto em branco)
      if (candidateId !== null && candidateId !== 0) {
        const candidates = await storage.getCandidatesByPosition(positionId, electionId);
        const candidateExists = candidates.some(c => c.id === candidateId);
        
        if (!candidateExists) {
          return c.json({ 
            message: 'Candidato não encontrado neste cargo/eleição' 
          }, 400);
        }
      }
      
      // 7. Criar voto
      const voteData = insertVoteSchema.parse({
        voterId: user.id,
        candidateId: candidateId === 0 ? null : candidateId, // Normalizar voto em branco
        positionId,
        electionId,
        scrutinyRound,
      });
      
      const vote = await storage.createVote(voteData);
      
      return c.json({ 
        message: 'Voto registrado com sucesso',
        voteId: vote.id
      }, 201);
    } catch (error) {
      console.error('[Votes] Error creating vote:', error);
      if (error instanceof z.ZodError) {
        return c.json({ message: 'Dados inválidos', errors: error.errors }, 400);
      }
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao registrar voto' 
      }, 400);
    }
  });
  
  app.route('/api/vote', votesRouter);
  return app;
}
