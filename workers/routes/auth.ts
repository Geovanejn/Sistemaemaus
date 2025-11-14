import { Hono } from "hono";
import type { AuthContext } from "../types";
import { D1Storage } from "../storage/d1-storage";
import { 
  generateToken, 
  verifyPassword, 
  hashPassword, 
  createAuthMiddleware 
} from "../auth";
import { 
  loginSchema,
  requestCodeSchema,
  verifyCodeSchema,
  setPasswordSchema,
  type AuthResponse 
} from "@shared/schema-worker";
import { sendVerificationEmail, sendPasswordResetEmail } from "../email";

/**
 * Generate a 6-digit verification code using crypto.getRandomValues
 * for cryptographic security
 */
function generateVerificationCode(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  // Generate number between 100000-999999
  const code = (array[0] % 900000) + 100000;
  return code.toString();
}

/**
 * Create authentication routes for Hono
 */
export function createAuthRoutes(app: Hono<AuthContext>) {
  const authRouter = new Hono<AuthContext>();

  // POST /api/auth/login - Login with email and password
  authRouter.post("/login", async (c) => {
    try {
      const body = await c.req.json();
      const validatedData = loginSchema.parse(body);
      
      const storage = new D1Storage(c.env.DB);
      const user = await storage.getUserByEmail(validatedData.email);
      
      if (!user) {
        return c.json({ message: "Email ou senha incorretos" }, 401);
      }

      const isPasswordValid = await verifyPassword(
        validatedData.password,
        user.password
      );
      
      if (!isPasswordValid) {
        return c.json({ message: "Email ou senha incorretos" }, 401);
      }

      const { password, ...userWithoutPassword } = user;
      const token = await generateToken(userWithoutPassword, c.env.SESSION_SECRET);

      const response: AuthResponse = {
        user: userWithoutPassword,
        token,
      };

      return c.json(response);
    } catch (error) {
      console.error("Login error:", error);
      return c.json({ 
        message: error instanceof Error ? error.message : "Erro ao fazer login" 
      }, 400);
    }
  });

  // POST /api/auth/request-code - Request verification code
  authRouter.post("/request-code", async (c) => {
    try {
      const body = await c.req.json();
      const validatedData = requestCodeSchema.parse(body);
      
      const storage = new D1Storage(c.env.DB);
      const user = await storage.getUserByEmail(validatedData.email);
      
      if (!user) {
        return c.json({ 
          message: "Este e-mail não está cadastrado no sistema. Entre em contato com o administrador." 
        }, 404);
      }

      // Check if user already has a password set and this is NOT a password reset request
      if (user.hasPassword && !validatedData.isPasswordReset) {
        return c.json({ 
          message: "Usuário já possui senha cadastrada",
          hasPassword: true 
        });
      }

      // Delete any existing verification codes for this email
      await storage.deleteVerificationCodesByEmail(validatedData.email);

      const code = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const isPasswordReset = validatedData.isPasswordReset || false;

      await storage.createVerificationCode({
        email: validatedData.email,
        code,
        expiresAt,
        isPasswordReset,
      });

      // Send email
      const emailSent = isPasswordReset 
        ? await sendPasswordResetEmail(validatedData.email, code, c.env)
        : await sendVerificationEmail(validatedData.email, code, c.env);

      if (!emailSent) {
        console.log(`[FALLBACK] Código de ${isPasswordReset ? 'recuperação' : 'verificação'} para ${validatedData.email}: ${code}`);
      }

      return c.json({ 
        message: "Código enviado para seu email",
        hasPassword: user.hasPassword 
      });
    } catch (error) {
      console.error("Request code error:", error);
      return c.json({ 
        message: error instanceof Error ? error.message : "Erro ao solicitar código" 
      }, 400);
    }
  });

  // POST /api/auth/verify-code - Verify code and login
  authRouter.post("/verify-code", async (c) => {
    try {
      const body = await c.req.json();
      const validatedData = verifyCodeSchema.parse(body);
      
      const storage = new D1Storage(c.env.DB);
      const verificationCode = await storage.getValidVerificationCode(
        validatedData.email,
        validatedData.code
      );

      if (!verificationCode) {
        return c.json({ message: "Código inválido ou expirado" }, 401);
      }

      const user = await storage.getUserByEmail(validatedData.email);
      if (!user) {
        return c.json({ 
          message: "Este e-mail não está cadastrado no sistema" 
        }, 404);
      }

      // Delete verification code after successful verification
      await storage.deleteVerificationCodesByEmail(validatedData.email);

      const { password, ...userWithoutPassword } = user;
      const token = await generateToken(userWithoutPassword, c.env.SESSION_SECRET);

      const response: AuthResponse = {
        user: userWithoutPassword,
        token,
      };

      // If this is a password reset, indicate that user needs to set new password
      if (verificationCode.isPasswordReset) {
        return c.json({
          ...response,
          requiresPasswordReset: true,
        });
      }

      return c.json(response);
    } catch (error) {
      console.error("Verify code error:", error);
      return c.json({ 
        message: error instanceof Error ? error.message : "Erro ao verificar código" 
      }, 400);
    }
  });

  // POST /api/auth/set-password - Set password (requires authentication)
  // Register middleware first
  authRouter.use('/set-password', createAuthMiddleware());
  authRouter.post("/set-password", async (c) => {
    try {
      const body = await c.req.json();
      const validatedData = setPasswordSchema.parse(body);
      
      const user = c.get('user');
      if (!user) {
        return c.json({ message: "Não autenticado" }, 401);
      }

      const storage = new D1Storage(c.env.DB);
      const hashedPassword = await hashPassword(validatedData.password);
      
      const updatedUser = await storage.updateUser(user.id, {
        password: hashedPassword,
        hasPassword: true,
      });

      if (!updatedUser) {
        return c.json({ message: "Usuário não encontrado" }, 404);
      }

      const { password, ...userWithoutPassword } = updatedUser;
      const token = await generateToken(userWithoutPassword, c.env.SESSION_SECRET);

      const response: AuthResponse = {
        user: userWithoutPassword,
        token,
      };

      return c.json(response);
    } catch (error) {
      console.error("Set password error:", error);
      return c.json({ 
        message: error instanceof Error ? error.message : "Erro ao definir senha" 
      }, 400);
    }
  });

  // POST /api/auth/login-password - Login with password (same as /login)
  // This is kept for backward compatibility
  authRouter.post("/login-password", async (c) => {
    try {
      const body = await c.req.json();
      const validatedData = loginSchema.parse(body);
      
      const storage = new D1Storage(c.env.DB);
      const user = await storage.getUserByEmail(validatedData.email);
      
      if (!user) {
        return c.json({ message: "Email ou senha incorretos" }, 401);
      }

      if (!user.hasPassword) {
        return c.json({ 
          message: "Você ainda não definiu uma senha. Use o código de verificação para fazer login." 
        }, 400);
      }

      const isPasswordValid = await verifyPassword(
        validatedData.password,
        user.password
      );
      
      if (!isPasswordValid) {
        return c.json({ message: "Email ou senha incorretos" }, 401);
      }

      const { password, ...userWithoutPassword } = user;
      const token = await generateToken(userWithoutPassword, c.env.SESSION_SECRET);

      const response: AuthResponse = {
        user: userWithoutPassword,
        token,
      };

      return c.json(response);
    } catch (error) {
      console.error("Login password error:", error);
      return c.json({ 
        message: error instanceof Error ? error.message : "Erro ao fazer login" 
      }, 400);
    }
  });

  // Mount auth routes under /api/auth
  app.route("/api/auth", authRouter);
}
