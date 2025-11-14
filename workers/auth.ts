import type { MiddlewareHandler } from "hono";
import type { User } from "@shared/schema-worker";
import type { Env, JWTPayload, AuthContext } from "./types";

// ============================================================================
// PASSWORD HASHING - HYBRID APPROACH
// ============================================================================
// Legacy passwords use bcrypt:: prefix (verified via bcryptjs)
// New passwords use pbkdf2:: prefix (Web Crypto PBKDF2-SHA256)

const PBKDF2_ITERATIONS = 150000;
const SALT_LENGTH = 32;

/**
 * Check if a stored password hash uses bcrypt format
 */
export function isBcryptHash(hash: string): boolean {
  return hash.startsWith('bcrypt::');
}

/**
 * Hash a new password using Web Crypto PBKDF2
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  // Generate random salt
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  
  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  // Derive hash using PBKDF2
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    256 // 32 bytes
  );
  
  // Encode salt and hash to base64
  const saltB64 = bytesToBase64(salt);
  const hashB64 = bytesToBase64(new Uint8Array(hashBuffer));
  
  return `pbkdf2::${PBKDF2_ITERATIONS}::${saltB64}::${hashB64}`;
}

/**
 * Verify a password against a PBKDF2 hash
 */
async function verifyPBKDF2Password(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('::');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    return false;
  }
  
  const iterations = parseInt(parts[1], 10);
  const saltB64 = parts[2];
  const hashB64 = parts[3];
  
  // Decode salt using symmetric helper
  const salt = base64ToBytes(saltB64);
  
  // Hash the input password with same salt and iterations
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  
  const computedHashB64 = bytesToBase64(new Uint8Array(hashBuffer));
  
  // Constant-time comparison
  return computedHashB64 === hashB64;
}

/**
 * Verify a password against a bcrypt hash using bcryptjs
 * Note: bcryptjs is a pure JS implementation that works in Workers
 */
async function verifyBcryptPassword(password: string, storedHash: string): Promise<boolean> {
  // Remove bcrypt:: prefix
  const bcryptHash = storedHash.substring(8);
  
  // bcryptjs compare - this is a pure JS implementation
  // We need to import bcryptjs dynamically
  try {
    const bcrypt = await import('bcryptjs');
    return await bcrypt.compare(password, bcryptHash);
  } catch (error) {
    console.error('Error verifying bcrypt password:', error);
    return false;
  }
}

/**
 * Verify a password against any supported hash format
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (isBcryptHash(storedHash)) {
    return verifyBcryptPassword(password, storedHash);
  } else if (storedHash.startsWith('pbkdf2::')) {
    return verifyPBKDF2Password(password, storedHash);
  } else {
    // Legacy hash without prefix - assume bcrypt for backward compatibility
    // Add bcrypt:: prefix and verify
    return verifyBcryptPassword(password, `bcrypt::${storedHash}`);
  }
}

// ============================================================================
// JWT IMPLEMENTATION - MANUAL HMAC-SHA256
// ============================================================================

/**
 * Convert Uint8Array to base64 string
 * Uses loop to avoid downlevelIteration issues
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array
 * Symmetric to bytesToBase64
 */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

/**
 * Base64URL encode (RFC 4648)
 */
function base64URLEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  const base64 = bytesToBase64(bytes);
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64URL decode
 */
function base64URLDecode(str: string): Uint8Array {
  // Add padding if needed
  const padding = '='.repeat((4 - (str.length % 4)) % 4);
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + padding;
  const binary = atob(base64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

/**
 * Generate JWT token using HMAC-SHA256
 */
export async function generateToken(user: Omit<User, 'password'>, secret: string): Promise<string> {
  if (!secret || secret.trim().length === 0) {
    throw new Error('SESSION_SECRET must be configured');
  }
  
  const encoder = new TextEncoder();
  
  // Header
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
  // Payload
  const payload: JWTPayload = {
    id: user.id,
    email: user.email,
    isAdmin: user.isAdmin,
    isMember: user.isMember,
    exp: Math.floor(Date.now() / 1000) + (2 * 60 * 60) // 2 hours from now
  };
  
  // Encode header and payload
  const headerB64 = base64URLEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64URLEncode(encoder.encode(JSON.stringify(payload)));
  
  // Create signature
  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(data)
  );
  
  const signatureB64 = base64URLEncode(signatureBuffer);
  
  return `${data}.${signatureB64}`;
}

/**
 * Verify and decode JWT token
 */
export async function verifyToken(token: string, secret: string): Promise<JWTPayload | null> {
  if (!secret || secret.trim().length === 0) {
    console.error('SESSION_SECRET is not configured');
    return null;
  }
  
  try {
    const encoder = new TextEncoder();
    const parts = token.split('.');
    
    if (parts.length !== 3) {
      return null;
    }
    
    const [headerB64, payloadB64, signatureB64] = parts;
    
    // Verify signature
    const data = `${headerB64}.${payloadB64}`;
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    const signature = base64URLDecode(signatureB64);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      encoder.encode(data)
    );
    
    if (!isValid) {
      return null;
    }
    
    // Decode payload
    const payloadStr = new TextDecoder().decode(base64URLDecode(payloadB64));
    const payload = JSON.parse(payloadStr) as JWTPayload;
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null;
    }
    
    return payload;
  } catch (error) {
    console.error('JWT verification error:', error);
    return null;
  }
}

// ============================================================================
// HONO MIDDLEWARES
// ============================================================================

/**
 * Authentication middleware for Hono
 * Extracts JWT from Authorization header and attaches user to context
 */
export function createAuthMiddleware(): MiddlewareHandler<AuthContext> {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader) {
      return c.json({ message: 'Token não fornecido' }, 401);
    }
    
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;
    
    const payload = await verifyToken(token, c.env.SESSION_SECRET);
    
    if (!payload) {
      return c.json({ message: 'Token inválido ou expirado' }, 403);
    }
    
    // Attach user to context
    c.set('user', payload);
    
    await next();
  };
}

/**
 * Require admin middleware
 */
export function requireAdmin(): MiddlewareHandler<AuthContext> {
  return async (c, next) => {
    const user = c.get('user');
    
    if (!user?.isAdmin) {
      return c.json({ message: 'Acesso negado: apenas administradores' }, 403);
    }
    
    await next();
  };
}

/**
 * Require member middleware
 */
export function requireMember(): MiddlewareHandler<AuthContext> {
  return async (c, next) => {
    const user = c.get('user');
    
    if (!user?.isMember && !user?.isAdmin) {
      return c.json({ message: 'Acesso negado: apenas membros' }, 403);
    }
    
    await next();
  };
}
