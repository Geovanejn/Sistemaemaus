import { sql } from "drizzle-orm";
import { sqliteTable, integer, text, unique } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import crypto from "crypto";

// Utility function to generate Gravatar URL from email
export function getGravatarUrl(email: string): string {
  const hash = crypto
    .createHash("md5")
    .update(email.toLowerCase().trim())
    .digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?d=mp&s=200`;
}

// Utility function to generate verification hash for PDF
export function generatePdfVerificationHash(electionId: number, electionName: string, timestamp: string): string {
  const data = `${electionId}-${electionName}-${timestamp}-${Math.random()}`;
  return crypto.createHash("sha256").update(data).digest("hex");
}

// Users table
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  hasPassword: integer("has_password", { mode: "boolean" }).notNull().default(false),
  photoUrl: text("photo_url"),
  birthdate: text("birthdate"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  isMember: integer("is_member", { mode: "boolean" }).notNull().default(true),
  activeMember: integer("active_member", { mode: "boolean" }).notNull().default(true),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Positions table (fixed positions)
export const positions = sqliteTable("positions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const insertPositionSchema = createInsertSchema(positions).omit({
  id: true,
});

export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type Position = typeof positions.$inferSelect;

// Elections table
export const elections = sqliteTable("elections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  closedAt: text("closed_at"),
});

// Election Winners table - tracks which candidate won each position (for tie resolution in 3rd scrutiny)
export const electionWinners = sqliteTable("election_winners", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  electionId: integer("election_id").notNull().references(() => elections.id),
  positionId: integer("position_id").notNull().references(() => positions.id),
  candidateId: integer("candidate_id").notNull().references(() => candidates.id),
  wonAtScrutiny: integer("won_at_scrutiny").notNull(), // Which scrutiny this winner was chosen (1, 2, or 3)
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const insertElectionSchema = createInsertSchema(elections).omit({
  id: true,
  isActive: true,
  createdAt: true,
});

export type InsertElection = z.infer<typeof insertElectionSchema>;
export type Election = typeof elections.$inferSelect;

export const insertElectionWinnerSchema = createInsertSchema(electionWinners).omit({
  id: true,
  createdAt: true,
});

export type InsertElectionWinner = z.infer<typeof insertElectionWinnerSchema>;
export type ElectionWinner = typeof electionWinners.$inferSelect;

// Election Positions table - tracks each position within an election sequentially
export const electionPositions = sqliteTable("election_positions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  electionId: integer("election_id").notNull().references(() => elections.id),
  positionId: integer("position_id").notNull().references(() => positions.id),
  orderIndex: integer("order_index").notNull(), // Order in which positions are voted (0 = first)
  status: text("status").notNull().default("pending"), // pending, active, completed
  currentScrutiny: integer("current_scrutiny").notNull().default(1), // 1, 2, or 3
  openedAt: text("opened_at"),
  closedAt: text("closed_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const insertElectionPositionSchema = createInsertSchema(electionPositions).omit({
  id: true,
  status: true,
  currentScrutiny: true,
  createdAt: true,
});

export type InsertElectionPosition = z.infer<typeof insertElectionPositionSchema>;
export type ElectionPosition = typeof electionPositions.$inferSelect;

// Election Attendance table - tracks which members are present for voting per position
export const electionAttendance = sqliteTable("election_attendance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  electionId: integer("election_id").notNull().references(() => elections.id),
  electionPositionId: integer("election_position_id").references(() => electionPositions.id), // Link to specific position opening
  memberId: integer("member_id").notNull().references(() => users.id),
  isPresent: integer("is_present", { mode: "boolean" }).notNull().default(false),
  markedAt: text("marked_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const insertElectionAttendanceSchema = createInsertSchema(electionAttendance).omit({
  id: true,
  createdAt: true,
});

export type InsertElectionAttendance = z.infer<typeof insertElectionAttendanceSchema>;
export type ElectionAttendance = typeof electionAttendance.$inferSelect;

// Candidates table
export const candidates = sqliteTable("candidates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull(), // Email to fetch Gravatar photo
  userId: integer("user_id").notNull().references(() => users.id), // Reference to user
  positionId: integer("position_id").notNull().references(() => positions.id),
  electionId: integer("election_id").notNull().references(() => elections.id),
}, (table) => ({
  // Prevent duplicate candidates for same user, position, and election
  uniqueCandidate: unique().on(table.userId, table.positionId, table.electionId),
}));

export const insertCandidateSchema = createInsertSchema(candidates).omit({
  id: true,
});

export type InsertCandidate = z.infer<typeof insertCandidateSchema>;
export type Candidate = typeof candidates.$inferSelect;

// Votes table
export const votes = sqliteTable("votes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  voterId: integer("voter_id").notNull().references(() => users.id),
  candidateId: integer("candidate_id").notNull().references(() => candidates.id),
  positionId: integer("position_id").notNull().references(() => positions.id),
  electionId: integer("election_id").notNull().references(() => elections.id),
  scrutinyRound: integer("scrutiny_round").notNull().default(1), // 1, 2, or 3
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const insertVoteSchema = createInsertSchema(votes).omit({
  id: true,
  createdAt: true,
});

export type InsertVote = z.infer<typeof insertVoteSchema>;
export type Vote = typeof votes.$inferSelect;

// Verification Codes table
export const verificationCodes = sqliteTable("verification_codes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  code: text("code").notNull(),
  expiresAt: text("expires_at").notNull(),
  isPasswordReset: integer("is_password_reset", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const insertVerificationCodeSchema = createInsertSchema(verificationCodes).omit({
  id: true,
  createdAt: true,
});

export type InsertVerificationCode = z.infer<typeof insertVerificationCodeSchema>;
export type VerificationCode = typeof verificationCodes.$inferSelect;

// PDF Verification table
export const pdfVerifications = sqliteTable("pdf_verifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  electionId: integer("election_id").notNull().references(() => elections.id),
  verificationHash: text("verification_hash").notNull().unique(),
  presidentName: text("president_name"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const insertPdfVerificationSchema = createInsertSchema(pdfVerifications).omit({
  id: true,
  createdAt: true,
});

export type InsertPdfVerification = z.infer<typeof insertPdfVerificationSchema>;
export type PdfVerification = typeof pdfVerifications.$inferSelect;

// Auth schemas
export const requestCodeSchema = z.object({
  email: z.string().email("Email inválido"),
  isPasswordReset: z.boolean().optional(),
});

export type RequestCodeData = z.infer<typeof requestCodeSchema>;

export const verifyCodeSchema = z.object({
  email: z.string().email("Email inválido"),
  code: z.string().length(6, "Código deve ter 6 dígitos"),
});

export type VerifyCodeData = z.infer<typeof verifyCodeSchema>;

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});

export type LoginData = z.infer<typeof loginSchema>;

export const registerSchema = loginSchema.extend({
  fullName: z.string().min(2, "Nome completo é obrigatório"),
});

export type RegisterData = z.infer<typeof registerSchema>;

export const addMemberSchema = z.object({
  fullName: z.string().min(2, "Nome completo é obrigatório"),
  email: z.string().email("Email inválido"),
  photoUrl: z.string().optional(),
  birthdate: z.string().optional(),
  activeMember: z.boolean().default(true),
});

export type AddMemberData = z.infer<typeof addMemberSchema>;

export const updateMemberSchema = z.object({
  fullName: z.string().min(2, "Nome completo é obrigatório").optional(),
  email: z.string().email("Email inválido").optional(),
  photoUrl: z.string().optional(),
  birthdate: z.string().optional(),
  activeMember: z.boolean().optional(),
});

export type UpdateMemberData = z.infer<typeof updateMemberSchema>;

export const setPasswordSchema = z.object({
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  confirmPassword: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

export type SetPasswordData = z.infer<typeof setPasswordSchema>;

export const loginPasswordSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});

export type LoginPasswordData = z.infer<typeof loginPasswordSchema>;

// Response types
export type AuthResponse = {
  user: Omit<User, "password">;
  token: string;
};

export type CandidateWithDetails = Candidate & {
  positionName: string;
  electionName: string;
  voteCount?: number;
  photoUrl?: string;
};

export type PositionWithCandidates = Position & {
  candidates: Candidate[];
};

export type ElectionResults = {
  electionId: number;
  electionName: string;
  isActive: boolean;
  currentScrutiny: number;
  presentCount: number; // Number of members present
  createdAt: string; // Election opening date/time
  closedAt: string | null; // Election closing date/time
  positions: Array<{
    positionId: number;
    positionName: string;
    status: string; // pending, active, completed
    currentScrutiny: number; // Current scrutiny for this position
    orderIndex: number; // Order in which position is voted
    totalVoters: number; // Total number of voters in this scrutiny
    majorityThreshold: number; // Half + 1 (for scrutiny 1&2) or simple majority (scrutiny 3)
    needsNextScrutiny: boolean; // If no candidate reached majority
    winnerId?: number; // ID of elected candidate (if any)
    winnerScrutiny?: number; // Which scrutiny elected the winner
    candidates: Array<{
      candidateId: number;
      candidateName: string;
      candidateEmail: string;
      photoUrl: string;
      voteCount: number;
      isElected: boolean;
      electedInScrutiny?: number; // 1, 2, or 3
      wonAtScrutiny?: number; // Alias for electedInScrutiny
    }>;
  }>;
};

export type VoterActivity = {
  voterId: number;
  voterName: string;
  voterEmail: string;
  positionName: string;
  candidateName: string;
  scrutinyRound: number;
  votedAt: string;
};

export type VoterAttendance = {
  voterId: number;
  voterName: string;
  voterEmail: string;
  firstVoteAt: string;
  totalVotes: number;
};

export type ElectionAuditData = {
  results: ElectionResults;
  electionMetadata: {
    createdAt: string;
    closedAt?: string;
    totalPositions: number;
    completedPositions: number;
    totalMembers: number;
  };
  voterAttendance: VoterAttendance[];
  voteTimeline: VoterActivity[];
  scrutinyHistory?: Array<{
    positionId: number;
    positionName: string;
    scrutinies: Array<{
      round: number;
      candidates: Array<{
        candidateId: number;
        candidateName: string;
        candidateEmail: string;
        voteCount: number;
        advancedToNext: boolean;
        isElected: boolean;
      }>;
    }>;
  }>;
};
