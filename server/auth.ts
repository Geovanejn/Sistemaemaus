import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { User } from "@shared/schema";

const JWT_SECRET = process.env.JWT_SECRET || "emaus-vota-secret-key-2025";

export interface AuthRequest extends Request {
  user?: Omit<User, "password"> & { id: number };
}

export function generateToken(user: Omit<User, "password">): string {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      isAdmin: user.isAdmin,
      isMember: user.isMember 
    },
    JWT_SECRET,
    { expiresIn: "2h" }
  );
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Token não fornecido" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Omit<User, "password"> & { id: number };
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: "Token inválido" });
  }
}

export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ message: "Acesso negado: apenas administradores" });
  }
  next();
}

export function requireMember(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.isMember && !req.user?.isAdmin) {
    return res.status(403).json({ message: "Acesso negado: apenas membros" });
  }
  next();
}
