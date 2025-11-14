import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  generateToken, 
  hashPassword, 
  comparePassword, 
  authenticateToken, 
  requireAdmin, 
  requireMember,
  type AuthRequest 
} from "./auth";
import { 
  loginSchema, 
  registerSchema, 
  insertCandidateSchema,
  requestCodeSchema,
  verifyCodeSchema,
  addMemberSchema,
  updateMemberSchema,
  setPasswordSchema,
  loginPasswordSchema,
  getGravatarUrl,
  generatePdfVerificationHash,
} from "@shared/schema";
import type { AuthResponse } from "@shared/schema";
import { sendVerificationEmail, sendPasswordResetEmail } from "./email";

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/auth/login", async (req, res) => {
    try {
      const validatedData = loginSchema.parse(req.body);
      
      const user = storage.getUserByEmail(validatedData.email);
      if (!user) {
        return res.status(401).json({ message: "Email ou senha incorretos" });
      }

      const isPasswordValid = await comparePassword(
        validatedData.password,
        user.password
      );
      
      if (!isPasswordValid) {
        return res.status(401).json({ message: "Email ou senha incorretos" });
      }

      const { password, ...userWithoutPassword } = user;
      const token = generateToken(userWithoutPassword);

      const response: AuthResponse = {
        user: userWithoutPassword,
        token,
      };

      res.json(response);
    } catch (error) {
      console.error("Login error:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Erro ao fazer login" 
      });
    }
  });

  app.post("/api/auth/request-code", async (req, res) => {
    try {
      const validatedData = requestCodeSchema.parse(req.body);
      
      const user = storage.getUserByEmail(validatedData.email);
      if (!user) {
        return res.status(404).json({ message: "Este e-mail não está cadastrado no sistema. Entre em contato com o administrador." });
      }

      // Check if user already has a password set and this is NOT a password reset request
      if (user.hasPassword && !validatedData.isPasswordReset) {
        return res.json({ 
          message: "Usuário já possui senha cadastrada",
          hasPassword: true 
        });
      }

      storage.deleteVerificationCodesByEmail(validatedData.email);

      const code = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const isPasswordReset = validatedData.isPasswordReset || false;

      storage.createVerificationCode({
        email: validatedData.email,
        code,
        expiresAt,
        isPasswordReset,
      });

      const emailSent = isPasswordReset 
        ? await sendPasswordResetEmail(validatedData.email, code)
        : await sendVerificationEmail(validatedData.email, code);

      if (!emailSent) {
        console.log(`[FALLBACK] Código de ${isPasswordReset ? 'recuperação' : 'verificação'} para ${validatedData.email}: ${code}`);
      }

      res.json({ 
        message: "Código enviado para seu email",
        hasPassword: user.hasPassword 
      });
    } catch (error) {
      console.error("Request code error:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Erro ao solicitar código" 
      });
    }
  });

  app.post("/api/auth/verify-code", async (req, res) => {
    try {
      const validatedData = verifyCodeSchema.parse(req.body);
      
      const verificationCode = storage.getValidVerificationCode(
        validatedData.email,
        validatedData.code
      );

      if (!verificationCode) {
        return res.status(401).json({ message: "Código inválido ou expirado" });
      }

      const user = storage.getUserByEmail(validatedData.email);
      if (!user) {
        return res.status(404).json({ message: "Este e-mail não está cadastrado no sistema" });
      }

      storage.deleteVerificationCodesByEmail(validatedData.email);

      const { password, ...userWithoutPassword } = user;
      const token = generateToken(userWithoutPassword);

      const response: AuthResponse = {
        user: userWithoutPassword,
        token,
      };

      // If this is a password reset, indicate that user needs to set new password
      if (verificationCode.isPasswordReset) {
        return res.json({
          ...response,
          requiresPasswordReset: true,
        });
      }

      res.json(response);
    } catch (error) {
      console.error("Verify code error:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Erro ao verificar código" 
      });
    }
  });

  app.post("/api/auth/set-password", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const validatedData = setPasswordSchema.parse(req.body);
      
      if (!req.user) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const hashedPassword = await hashPassword(validatedData.password);
      
      const updatedUser = storage.updateUser(req.user.id, {
        password: hashedPassword,
        hasPassword: true,
      });

      if (!updatedUser) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      const { password, ...userWithoutPassword } = updatedUser;
      const token = generateToken(userWithoutPassword);

      const response: AuthResponse = {
        user: userWithoutPassword,
        token,
      };

      res.json(response);
    } catch (error) {
      console.error("Set password error:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Erro ao definir senha" 
      });
    }
  });

  app.post("/api/auth/login-password", async (req, res) => {
    try {
      const validatedData = loginPasswordSchema.parse(req.body);
      
      const user = storage.getUserByEmail(validatedData.email);
      if (!user) {
        return res.status(401).json({ message: "Email ou senha incorretos" });
      }

      if (!user.hasPassword) {
        return res.status(400).json({ 
          message: "Você ainda não definiu uma senha. Use o código de verificação para fazer login." 
        });
      }

      const isPasswordValid = await comparePassword(
        validatedData.password,
        user.password
      );
      
      if (!isPasswordValid) {
        return res.status(401).json({ message: "Email ou senha incorretos" });
      }

      const { password, ...userWithoutPassword } = user;
      const token = generateToken(userWithoutPassword);

      const response: AuthResponse = {
        user: userWithoutPassword,
        token,
      };

      res.json(response);
    } catch (error) {
      console.error("Login password error:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Erro ao fazer login" 
      });
    }
  });

  app.post("/api/admin/members", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const validatedData = addMemberSchema.parse(req.body);
      
      const existingUser = storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email já cadastrado" });
      }

      const user = storage.createUser({
        fullName: validatedData.fullName,
        email: validatedData.email,
        password: Math.random().toString(36),
        hasPassword: false,
        photoUrl: validatedData.photoUrl,
        birthdate: validatedData.birthdate,
        isAdmin: false,
        isMember: true,
        activeMember: validatedData.activeMember,
      } as any);

      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Add member error:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Erro ao adicionar membro" 
      });
    }
  });

  app.patch("/api/admin/members/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const memberId = parseInt(req.params.id);
      
      if (isNaN(memberId)) {
        return res.status(400).json({ message: "ID inválido" });
      }

      const validatedData = updateMemberSchema.parse(req.body);

      if (validatedData.email) {
        const existingUser = storage.getUserByEmail(validatedData.email);
        if (existingUser && existingUser.id !== memberId) {
          return res.status(400).json({ message: "Este email já está sendo usado por outro membro" });
        }
      }

      const updatedUser = storage.updateUser(memberId, validatedData);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "Membro não encontrado" });
      }

      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Update member error:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Erro ao atualizar membro" 
      });
    }
  });

  app.delete("/api/admin/members/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const memberId = parseInt(req.params.id);
      
      if (isNaN(memberId)) {
        return res.status(400).json({ message: "ID inválido" });
      }

      storage.deleteMember(memberId);
      res.json({ message: "Membro removido com sucesso" });
    } catch (error) {
      console.error("Delete member error:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Erro ao remover membro" 
      });
    }
  });

  app.post("/api/elections", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { name } = req.body;
      
      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Nome da eleição é obrigatório" });
      }

      const election = storage.createElection(name);
      res.json(election);
    } catch (error) {
      console.error("Create election error:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Erro ao criar eleição" 
      });
    }
  });

  app.patch("/api/elections/:id/close", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const electionId = parseInt(req.params.id);
      
      const election = storage.getElectionById(electionId);
      if (!election) {
        return res.status(404).json({ message: "Eleição não encontrada" });
      }

      storage.closeElection(electionId);
      res.json({ message: "Eleição encerrada com sucesso" });
    } catch (error) {
      console.error("Close election error:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Erro ao encerrar eleição" 
      });
    }
  });

  app.post("/api/elections/:id/finalize", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const electionId = parseInt(req.params.id);
      
      const election = storage.getElectionById(electionId);
      if (!election) {
        return res.status(404).json({ message: "Eleição não encontrada" });
      }

      // Verificar se todos os cargos estão decididos
      const positions = storage.getElectionPositions(electionId);
      const allCompleted = positions.every(p => p.status === 'completed');
      
      if (!allCompleted) {
        return res.status(400).json({ message: "Todos os cargos devem estar decididos antes de finalizar a eleição" });
      }

      storage.finalizeElection(electionId);
      res.json({ message: "Eleição finalizada com sucesso" });
    } catch (error) {
      console.error("Finalize election error:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Erro ao finalizar eleição" 
      });
    }
  });

  app.get("/api/elections/history", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const history = storage.getElectionHistory();
      res.json(history);
    } catch (error) {
      console.error("Get election history error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Erro ao buscar histórico de eleições" 
      });
    }
  });

  // Election Attendance endpoints
  app.get("/api/elections/:id/attendance", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const electionId = parseInt(req.params.id);
      const attendance = storage.getElectionAttendance(electionId);
      
      // Get winners for this election to exclude them from attendance list
      const winners = storage.getElectionWinners(electionId);
      const winnerUserIds = new Set(winners.map(w => w.userId));
      
      // Join with user information and filter out winners
      const attendanceWithUsers = attendance
        .map(att => {
          const user = storage.getUserById(att.memberId);
          return {
            ...att,
            memberName: user?.fullName || '',
            memberEmail: user?.email || '',
          };
        })
        .filter(att => !winnerUserIds.has(att.memberId));
      
      res.json(attendanceWithUsers);
    } catch (error) {
      console.error("Get attendance error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Erro ao buscar presença" 
      });
    }
  });

  app.post("/api/elections/:id/attendance/initialize", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const electionId = parseInt(req.params.id);
      storage.initializeAttendance(electionId);
      res.json({ message: "Lista de presença inicializada" });
    } catch (error) {
      console.error("Initialize attendance error:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Erro ao inicializar presença" 
      });
    }
  });

  app.patch("/api/elections/:id/attendance/:memberId", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const electionId = parseInt(req.params.id);
      const memberId = parseInt(req.params.memberId);
      const { isPresent } = req.body;
      
      if (typeof isPresent !== 'boolean') {
        return res.status(400).json({ message: "isPresent deve ser booleano" });
      }
      
      storage.setMemberAttendance(electionId, memberId, isPresent);
      res.json({ message: "Presença atualizada" });
    } catch (error) {
      console.error("Set attendance error:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Erro ao atualizar presença" 
      });
    }
  });

  app.get("/api/elections/:id/attendance/count", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const electionId = parseInt(req.params.id);
      const count = storage.getPresentCount(electionId);
      res.json({ presentCount: count });
    } catch (error) {
      console.error("Get present count error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Erro ao contar presentes" 
      });
    }
  });

  // Election Positions endpoints
  app.get("/api/elections/:id/positions", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const electionId = parseInt(req.params.id);
      const electionPositions = storage.getElectionPositions(electionId);
      
      // Join with position names
      const positionsWithNames = electionPositions.map(ep => {
        const allPositions = storage.getAllPositions();
        const position = allPositions.find(p => p.id === ep.positionId);
        return {
          ...ep,
          positionName: position?.name || '',
        };
      });
      
      res.json(positionsWithNames);
    } catch (error) {
      console.error("Get election positions error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Erro ao buscar cargos da eleição" 
      });
    }
  });

  app.get("/api/elections/:id/positions/active", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const electionId = parseInt(req.params.id);
      const activePosition = storage.getActiveElectionPosition(electionId);
      
      if (!activePosition) {
        return res.json(null);
      }
      
      // Join with position name
      const allPositions = storage.getAllPositions();
      const position = allPositions.find(p => p.id === activePosition.positionId);
      
      res.json({
        ...activePosition,
        positionName: position?.name || '',
      });
    } catch (error) {
      console.error("Get active position error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Erro ao buscar cargo ativo" 
      });
    }
  });

  app.post("/api/elections/:id/positions/advance-scrutiny", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const electionId = parseInt(req.params.id);
      const activePosition = storage.getActiveElectionPosition(electionId);
      
      if (!activePosition) {
        return res.status(404).json({ message: "Nenhum cargo ativo encontrado" });
      }
      
      storage.advancePositionScrutiny(activePosition.id);
      res.json({ message: "Escrutínio avançado com sucesso" });
    } catch (error) {
      console.error("Advance scrutiny error:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Erro ao avançar escrutínio" 
      });
    }
  });

  app.get("/api/elections/:id/positions/check-tie", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const electionId = parseInt(req.params.id);
      const activePosition = storage.getActiveElectionPosition(electionId);
      
      if (!activePosition) {
        return res.json({ hasTie: false, candidates: [] });
      }
      
      const tieCheck = storage.checkThirdScrutinyTie(activePosition.id);
      
      // If there's a tie, get candidate details
      if (tieCheck.hasTie) {
        const candidates = storage.getCandidatesByPosition(activePosition.positionId, electionId);
        const tiedCandidates = tieCheck.candidates.map(tc => {
          const candidate = candidates.find(c => c.id === tc.candidateId);
          return {
            ...tc,
            name: candidate?.name || '',
            email: candidate?.email || '',
          };
        });
        
        res.json({ hasTie: true, candidates: tiedCandidates, electionPositionId: activePosition.id });
      } else {
        res.json({ hasTie: false, candidates: [] });
      }
    } catch (error) {
      console.error("Check tie error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Erro ao verificar empate" 
      });
    }
  });

  app.post("/api/elections/:id/positions/resolve-tie", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const electionId = parseInt(req.params.id);
      const { electionPositionId, winnerId } = req.body;
      
      if (!electionPositionId || !winnerId) {
        return res.status(400).json({ message: "Dados incompletos" });
      }
      
      storage.resolveThirdScrutinyTie(electionPositionId, winnerId);
      res.json({ message: "Empate resolvido com sucesso" });
    } catch (error) {
      console.error("Resolve tie error:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Erro ao resolver empate" 
      });
    }
  });

  app.post("/api/elections/:id/positions/open-next", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const electionId = parseInt(req.params.id);
      
      // Check if there are any present members before opening position
      const presentCount = storage.getPresentCount(electionId);
      if (presentCount === 0) {
        return res.status(400).json({ message: "Registre primeiro a presença dos membros antes de abrir a votação" });
      }
      
      const nextPosition = storage.openNextPosition(electionId);
      
      if (!nextPosition) {
        return res.status(404).json({ message: "Nenhum próximo cargo disponível" });
      }
      
      // Join with position name
      const allPositions = storage.getAllPositions();
      const position = allPositions.find(p => p.id === nextPosition.positionId);
      
      res.json({
        ...nextPosition,
        positionName: position?.name || '',
      });
    } catch (error) {
      console.error("Open next position error:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Erro ao abrir próximo cargo" 
      });
    }
  });

  app.post("/api/elections/:id/positions/:positionId/open", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const electionId = parseInt(req.params.id);
      const electionPositionId = parseInt(req.params.positionId);
      
      // Check if there are any present members before opening position
      const presentCount = storage.getPresentCount(electionId);
      if (presentCount === 0) {
        return res.status(400).json({ message: "Confirme primeiro a presença dos membros antes de abrir a votação." });
      }
      
      // Open the specific position
      const openedPosition = storage.openPosition(electionPositionId);
      
      // Join with position name
      const allPositions = storage.getAllPositions();
      const position = allPositions.find(p => p.id === openedPosition.positionId);
      
      res.json({
        ...openedPosition,
        positionName: position?.name || '',
      });
    } catch (error) {
      console.error("Open position error:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Erro ao abrir cargo" 
      });
    }
  });

  app.post("/api/elections/:id/positions/:positionId/force-close", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const electionId = parseInt(req.params.id);
      const electionPositionId = parseInt(req.params.positionId);
      const { reason, shouldReopen } = req.body;
      
      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        return res.status(400).json({ message: "É necessário fornecer um motivo para fechar manualmente" });
      }
      
      // Verify this is an active position
      const activePosition = storage.getActiveElectionPosition(electionId);
      if (!activePosition || activePosition.id !== electionPositionId) {
        return res.status(400).json({ message: "Esta posição não está ativa" });
      }
      
      // Force complete the position
      storage.forceCompletePosition(electionPositionId, reason, shouldReopen === true);
      
      const message = shouldReopen 
        ? "Cargo fechado e reaberto para nova votação" 
        : "Cargo fechado permanentemente com sucesso";
      
      res.json({ message });
    } catch (error) {
      console.error("Force close position error:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Erro ao fechar cargo manualmente" 
      });
    }
  });

  app.post("/api/candidates", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertCandidateSchema.parse(req.body);
      
      // Validate that the user is not an admin
      const user = storage.getUserById(validatedData.userId);
      if (!user) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }
      
      if (user.isAdmin) {
        return res.status(400).json({ message: "Administradores não podem ser candidatos" });
      }

      // Check if user is present
      const isPresent = storage.isMemberPresent(validatedData.electionId, validatedData.userId);
      if (!isPresent) {
        return res.status(400).json({ message: "Apenas membros com presença confirmada podem ser candidatos" });
      }
      
      // Validate that the user is not already a winner in this election
      const winners = storage.getElectionWinners(validatedData.electionId);
      const isAlreadyWinner = winners.some(w => w.userId === validatedData.userId);
      if (isAlreadyWinner) {
        return res.status(400).json({ message: "Este membro já foi eleito para um cargo nesta eleição" });
      }

      // Check if candidate is already added to this position
      const existingCandidates = storage.getCandidatesByPosition(validatedData.positionId, validatedData.electionId);
      const isDuplicate = existingCandidates.some(c => c.userId === validatedData.userId);
      if (isDuplicate) {
        return res.status(400).json({ message: "Este candidato já foi adicionado para este cargo" });
      }

      // Check if the position is active before adding candidates
      const activePosition = storage.getActiveElectionPosition(validatedData.electionId);
      if (!activePosition || activePosition.positionId !== validatedData.positionId) {
        return res.status(400).json({ message: "A votação para este cargo ainda não foi aberta" });
      }
      
      const candidate = storage.createCandidate(validatedData);
      res.json(candidate);
    } catch (error) {
      console.error("Create candidate error:", error);
      
      // Handle UNIQUE constraint violation
      if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
        return res.status(409).json({ message: "Este candidato já foi adicionado para este cargo" });
      }
      
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Erro ao adicionar candidato" 
      });
    }
  });

  app.post("/api/candidates/batch", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { candidates, positionId, electionId } = req.body;

      if (!Array.isArray(candidates) || candidates.length === 0) {
        return res.status(400).json({ message: "Lista de candidatos inválida ou vazia" });
      }

      if (!positionId || !electionId) {
        return res.status(400).json({ message: "ID do cargo e eleição são obrigatórios" });
      }

      const activePosition = storage.getActiveElectionPosition(electionId);
      if (!activePosition || activePosition.positionId !== positionId) {
        return res.status(400).json({ message: "A votação para este cargo ainda não foi aberta" });
      }

      const winners = storage.getElectionWinners(electionId);
      const existingCandidates = storage.getCandidatesByPosition(positionId, electionId);
      const createdCandidates = [];
      const errors = [];

      for (const candidate of candidates) {
        try {
          if (!candidate.userId || !candidate.name || !candidate.email) {
            errors.push(`Candidato inválido: dados incompletos`);
            continue;
          }

          const user = storage.getUserById(candidate.userId);
          if (!user) {
            errors.push(`Usuário ${candidate.name} não encontrado`);
            continue;
          }
          
          if (user.isAdmin) {
            errors.push(`${candidate.name} é administrador e não pode ser candidato`);
            continue;
          }

          const isPresent = storage.isMemberPresent(electionId, candidate.userId);
          if (!isPresent) {
            errors.push(`${candidate.name} não está presente`);
            continue;
          }
          
          const isAlreadyWinner = winners.some(w => w.userId === candidate.userId);
          if (isAlreadyWinner) {
            errors.push(`${candidate.name} já foi eleito para um cargo nesta eleição`);
            continue;
          }

          const isDuplicate = existingCandidates.some(c => c.userId === candidate.userId);
          if (isDuplicate) {
            errors.push(`${candidate.name} já foi adicionado para este cargo`);
            continue;
          }

          const created = storage.createCandidate({
            name: candidate.name,
            email: candidate.email,
            userId: candidate.userId,
            positionId,
            electionId,
          });

          createdCandidates.push(created);
          existingCandidates.push(created);
        } catch (error) {
          errors.push(`Erro ao adicionar ${candidate.name}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        }
      }

      if (createdCandidates.length === 0) {
        return res.status(400).json({ 
          message: "Nenhum candidato foi adicionado", 
          errors 
        });
      }

      res.json({
        message: `${createdCandidates.length} candidato(s) adicionado(s) com sucesso`,
        candidates: createdCandidates,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      console.error("Batch create candidates error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Erro ao adicionar candidatos em lote" 
      });
    }
  });

  app.get("/api/elections/active", async (req, res) => {
    try {
      const election = storage.getActiveElection();
      res.json(election);
    } catch (error) {
      console.error("Get active election error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Erro ao buscar eleição ativa" 
      });
    }
  });

  app.get("/api/members", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const members = storage.getAllMembers();
      const membersWithoutPasswords = members.map(({ password, ...user }) => user);
      res.json(membersWithoutPasswords);
    } catch (error) {
      console.error("Get members error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Erro ao buscar membros" 
      });
    }
  });

  app.get("/api/members/non-admins", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const members = storage.getAllMembers(true); // Exclude admins
      let membersWithoutPasswords = members.map(({ password, ...user }) => user);
      
      // If electionId is provided, exclude members who already won a position in this election
      // and filter only members who are present
      const electionId = req.query.electionId ? parseInt(req.query.electionId as string) : null;
      if (electionId) {
        const winners = storage.getElectionWinners(electionId);
        const winnerUserIds = new Set(winners.map(w => w.userId));
        
        console.log(`\n[API /api/members/non-admins] ========== MEMBER FILTERING DEBUG ==========`);
        console.log(`[DEBUG] Election ID: ${electionId}`);
        console.log(`[DEBUG] Winners found:`, JSON.stringify(winners, null, 2));
        console.log(`[DEBUG] Winner User IDs:`, Array.from(winnerUserIds));
        console.log(`[DEBUG] Total members before filtering:`, membersWithoutPasswords.length);
        console.log(`[DEBUG] Members before filtering (id, fullName):`, membersWithoutPasswords.map(m => ({ id: m.id, fullName: m.fullName })));
        
        // Filter by winners
        const beforeWinnerFilter = membersWithoutPasswords.length;
        membersWithoutPasswords = membersWithoutPasswords.filter(m => {
          const isWinner = winnerUserIds.has(m.id);
          if (isWinner) {
            console.log(`[DEBUG] Filtering out winner: ${m.fullName} (id: ${m.id})`);
          }
          return !isWinner;
        });
        
        console.log(`[DEBUG] Filtered out ${beforeWinnerFilter - membersWithoutPasswords.length} winners`);
        console.log(`[DEBUG] Members after winner filter:`, membersWithoutPasswords.length);
        console.log(`[DEBUG] Remaining members (id, fullName):`, membersWithoutPasswords.map(m => ({ id: m.id, fullName: m.fullName })));
        
        // Filter by presence - only include members who are present
        membersWithoutPasswords = membersWithoutPasswords.filter(m => 
          storage.isMemberPresent(electionId, m.id)
        );
        
        console.log(`[DEBUG] Members after presence filter:`, membersWithoutPasswords.length);
        console.log(`[DEBUG] Final members (id, fullName):`, membersWithoutPasswords.map(m => ({ id: m.id, fullName: m.fullName })));
        console.log(`[API /api/members/non-admins] ========== END DEBUG ==========\n`);
      }
      
      res.json(membersWithoutPasswords);
    } catch (error) {
      console.error("Get non-admin members error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Erro ao buscar membros" 
      });
    }
  });

  app.get("/api/positions", async (req, res) => {
    try {
      const positions = storage.getAllPositions();
      res.json(positions);
    } catch (error) {
      console.error("Get positions error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Erro ao buscar cargos" 
      });
    }
  });

  app.get("/api/candidates", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const activeElection = storage.getActiveElection();
      if (!activeElection) {
        return res.json([]);
      }

      const candidates = storage.getCandidatesByElection(activeElection.id);
      res.json(candidates);
    } catch (error) {
      console.error("Get candidates error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Erro ao buscar candidatos" 
      });
    }
  });

  app.get("/api/elections/:electionId/positions/:positionId/candidates", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const electionId = parseInt(req.params.electionId);
      const positionId = parseInt(req.params.positionId);
      
      if (isNaN(electionId) || isNaN(positionId)) {
        return res.status(400).json({ message: "IDs inválidos" });
      }

      const candidates = storage.getCandidatesByPosition(positionId, electionId);
      const candidatesWithPhotos = candidates.map(candidate => {
        const user = storage.getUserById(candidate.userId);
        return {
          ...candidate,
          photoUrl: user?.photoUrl || getGravatarUrl(candidate.email),
        };
      });
      
      res.json(candidatesWithPhotos);
    } catch (error) {
      console.error("Get position candidates error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Erro ao buscar candidatos" 
      });
    }
  });

  app.post("/api/vote", authenticateToken, requireMember, async (req: AuthRequest, res) => {
    try {
      const { candidateId, positionId, electionId } = req.body;
      const voterId = req.user!.id;

      if (!candidateId || !positionId || !electionId) {
        return res.status(400).json({ message: "Dados incompletos" });
      }

      // Check if voter is present
      const isPresent = storage.isMemberPresent(electionId, voterId);
      if (!isPresent) {
        return res.status(403).json({ message: "Apenas membros com presença confirmada podem votar" });
      }

      // Get active position for this election to determine scrutiny round
      const activePosition = storage.getActiveElectionPosition(electionId);
      if (!activePosition) {
        return res.status(400).json({ message: "Nenhum cargo ativo no momento" });
      }

      // Verify user is voting for the active position
      if (activePosition.positionId !== positionId) {
        return res.status(400).json({ message: "Este cargo não está ativo no momento" });
      }

      const scrutinyRound = activePosition.currentScrutiny;

      const hasVoted = storage.hasUserVoted(voterId, positionId, electionId, scrutinyRound);
      if (hasVoted) {
        return res.status(403).json({ message: "Você já votou para esse cargo neste escrutínio." });
      }

      const vote = storage.createVote({
        voterId,
        candidateId,
        positionId,
        electionId,
        scrutinyRound,
      });

      res.json({ 
        message: "Voto registrado com sucesso!",
        vote 
      });
    } catch (error) {
      console.error("Vote error:", error);
      
      if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
        return res.status(403).json({ message: "Você já votou para esse cargo neste escrutínio." });
      }
      
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Erro ao registrar voto" 
      });
    }
  });

  app.get("/api/results/latest", async (req, res) => {
    try {
      const results = storage.getLatestElectionResults();
      if (results) {
        // Add photo URLs to candidates (custom photo or Gravatar)
        results.positions.forEach(position => {
          position.candidates.forEach(candidate => {
            const user = storage.getUserByEmail(candidate.candidateEmail);
            candidate.photoUrl = user?.photoUrl || getGravatarUrl(candidate.candidateEmail);
          });
        });
      }
      res.json(results);
    } catch (error) {
      console.error("Get latest results error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Erro ao buscar resultados" 
      });
    }
  });

  app.get("/api/results/:electionId", async (req, res) => {
    try {
      const electionId = parseInt(req.params.electionId);
      const results = storage.getElectionResults(electionId);
      
      if (!results) {
        return res.status(404).json({ message: "Eleição não encontrada" });
      }

      // Add photo URLs to candidates (custom photo or Gravatar)
      results.positions.forEach(position => {
        position.candidates.forEach(candidate => {
          const user = storage.getUserByEmail(candidate.candidateEmail);
          candidate.photoUrl = user?.photoUrl || getGravatarUrl(candidate.candidateEmail);
        });
      });

      res.json(results);
    } catch (error) {
      console.error("Get results error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Erro ao buscar resultados" 
      });
    }
  });

  app.get("/api/elections/:electionId/winners", async (req, res) => {
    try {
      const electionId = parseInt(req.params.electionId);
      const winners = storage.getElectionWinners(electionId);
      const results = storage.getElectionResults(electionId);
      
      if (!results) {
        return res.status(404).json({ message: "Eleição não encontrada" });
      }
      
      // Get position, user details, and vote count for each winner
      const formattedWinners = winners.map(w => {
        const user = storage.getUserById(w.userId);
        const positions = storage.getAllPositions();
        const position = positions.find(p => p.id === w.positionId);
        
        // Find vote count from results
        const positionResults = results.positions.find(p => p.positionId === w.positionId);
        const candidateResults = positionResults?.candidates.find(c => c.candidateId === w.candidateId);
        
        return {
          positionId: w.positionId,
          positionName: position?.name || '',
          candidateName: user?.fullName || '',
          photoUrl: user?.photoUrl || (user?.email ? getGravatarUrl(user.email) : undefined),
          voteCount: candidateResults?.voteCount || 0,
          wonAtScrutiny: w.wonAtScrutiny
        };
      });

      res.json(formattedWinners);
    } catch (error) {
      console.error("Get winners error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Erro ao buscar vencedores" 
      });
    }
  });

  app.get("/api/elections/:electionId/audit", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const electionId = parseInt(req.params.electionId);
      const auditData = storage.getElectionAuditData(electionId);
      
      if (!auditData) {
        return res.status(404).json({ message: "Dados de auditoria não encontrados para esta eleição" });
      }

      // Add photo URLs to candidates in results
      auditData.results.positions.forEach((position: any) => {
        position.candidates.forEach((candidate: any) => {
          const user = storage.getUserByEmail(candidate.candidateEmail);
          candidate.photoUrl = user?.photoUrl || getGravatarUrl(candidate.candidateEmail);
        });
      });

      // Generate verification hash for PDF
      const verificationHash = generatePdfVerificationHash(
        electionId,
        auditData.results.electionName,
        new Date().toISOString()
      );

      // Add verification hash to audit data
      auditData.verificationHash = verificationHash;

      res.json(auditData);
    } catch (error) {
      console.error("Get election audit data error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Erro ao buscar dados de auditoria" 
      });
    }
  });

  app.post("/api/elections/:electionId/audit/send-email", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const electionId = parseInt(req.params.electionId);
      const { presidentEmail, presidentName, pdfBase64 } = req.body;

      if (!presidentEmail || !presidentName || !pdfBase64) {
        return res.status(400).json({ message: "Email do presidente, nome e PDF são obrigatórios" });
      }

      const election = storage.getElectionById(electionId);
      if (!election) {
        return res.status(404).json({ message: "Eleição não encontrada" });
      }

      const pdfBuffer = Buffer.from(pdfBase64, 'base64');
      
      const emailModule = await import("./email");
      const success = await emailModule.sendAuditPDFEmail(
        presidentName,
        presidentEmail,
        election.name,
        pdfBuffer
      );

      if (!success) {
        return res.status(500).json({ message: "Erro ao enviar email. Verifique a configuração do serviço de email." });
      }

      res.json({ 
        message: "PDF de auditoria enviado com sucesso para o email do presidente",
        sentTo: presidentEmail
      });
    } catch (error) {
      console.error("Send audit PDF email error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Erro ao enviar PDF por email" 
      });
    }
  });

  app.post("/api/dev/seed-test-users", async (req, res) => {
    try {
      if (app.get("env") !== "development") {
        return res.status(403).json({ message: "Este endpoint só está disponível em desenvolvimento" });
      }

      const testUsers = [
        { fullName: "Admin Teste", email: "admin@teste.com", password: "senha123", isAdmin: true },
        { fullName: "João Silva", email: "joao@teste.com", password: "senha123", isAdmin: false },
        { fullName: "Maria Santos", email: "maria@teste.com", password: "senha123", isAdmin: false },
        { fullName: "Pedro Oliveira", email: "pedro@teste.com", password: "senha123", isAdmin: false },
        { fullName: "Ana Costa", email: "ana@teste.com", password: "senha123", isAdmin: false },
        { fullName: "Carlos Pereira", email: "carlos@teste.com", password: "senha123", isAdmin: false },
        { fullName: "Juliana Lima", email: "juliana@teste.com", password: "senha123", isAdmin: false },
        { fullName: "Roberto Alves", email: "roberto@teste.com", password: "senha123", isAdmin: false },
        { fullName: "Fernanda Souza", email: "fernanda@teste.com", password: "senha123", isAdmin: false },
        { fullName: "Lucas Martins", email: "lucas@teste.com", password: "senha123", isAdmin: false },
        { fullName: "Patricia Rocha", email: "patricia@teste.com", password: "senha123", isAdmin: false },
      ];

      const createdUsers = [];
      const skippedUsers = [];

      for (const userData of testUsers) {
        const existingUser = storage.getUserByEmail(userData.email);
        if (existingUser) {
          skippedUsers.push(userData.email);
          continue;
        }

        const hashedPassword = await hashPassword(userData.password);
        const user = storage.createUser({
          fullName: userData.fullName,
          email: userData.email,
          password: hashedPassword,
          isAdmin: userData.isAdmin,
          isMember: true,
        });

        createdUsers.push({
          email: user.email,
          fullName: user.fullName,
          isAdmin: user.isAdmin,
        });
      }

      res.json({
        message: "Usuários de teste criados com sucesso",
        created: createdUsers,
        skipped: skippedUsers,
        credentials: {
          admin: { email: "admin@teste.com", password: "senha123" },
          members: { email: "qualquer@teste.com", password: "senha123" }
        }
      });
    } catch (error) {
      console.error("Seed test users error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Erro ao criar usuários de teste" 
      });
    }
  });

  // Public route to verify PDF authenticity
  app.get("/api/verify/:hash", async (req, res) => {
    try {
      const { hash } = req.params;
      
      if (!hash) {
        return res.status(400).json({ message: "Hash de verificação não fornecido" });
      }

      const verification = storage.getPdfVerification(hash);
      
      if (!verification) {
        return res.status(404).json({ 
          verified: false,
          message: "Este documento não pôde ser verificado. O hash não foi encontrado no sistema." 
        });
      }

      res.json({
        verified: true,
        electionName: verification.electionName,
        electionId: verification.electionId,
        presidentName: verification.presidentName,
        createdAt: verification.createdAt,
        electionCreatedAt: verification.electionCreatedAt,
        electionClosedAt: verification.electionClosedAt,
      });
    } catch (error) {
      console.error("Verify PDF error:", error);
      res.status(500).json({ 
        verified: false,
        message: error instanceof Error ? error.message : "Erro ao verificar documento" 
      });
    }
  });

  // Route to save PDF verification hash
  app.post("/api/elections/:electionId/audit/save-hash", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const electionId = parseInt(req.params.electionId);
      const { verificationHash, presidentName } = req.body;

      if (!verificationHash) {
        return res.status(400).json({ message: "Hash de verificação é obrigatório" });
      }

      const verification = storage.createPdfVerification(electionId, verificationHash, presidentName);
      res.json(verification);
    } catch (error) {
      console.error("Save verification hash error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Erro ao salvar hash de verificação" 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
