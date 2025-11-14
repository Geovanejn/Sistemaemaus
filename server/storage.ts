import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { sendCongratulationsEmail } from "./email";
import type {
  User,
  InsertUser,
  Position,
  Election,
  InsertElection,
  Candidate,
  InsertCandidate,
  Vote,
  InsertVote,
  VerificationCode,
  InsertVerificationCode,
  CandidateWithDetails,
  ElectionResults,
  ElectionPosition,
  InsertElectionPosition,
  ElectionAttendance,
  InsertElectionAttendance,
} from "@shared/schema";

const dbDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, "emaus-vota.db");
const db = new Database(dbPath);

export interface IStorage {
  getUserByEmail(email: string): User | undefined;
  getUserById(id: number): User | undefined;
  createUser(user: InsertUser): User;
  updateUser(id: number, updates: Partial<Omit<User, 'id'>>): User | undefined;
  getAllMembers(excludeAdmins?: boolean): User[];
  deleteMember(id: number): void;
  
  getAllPositions(): Position[];
  
  getActiveElection(): Election | null;
  getElectionById(id: number): Election | undefined;
  createElection(name: string): Election;
  closeElection(id: number): void;
  finalizeElection(id: number): void;
  getElectionHistory(): Election[];
  setWinner(electionId: number, candidateId: number, positionId: number, scrutiny: number): void;
  
  // Election Positions management
  getElectionPositions(electionId: number): ElectionPosition[];
  getActiveElectionPosition(electionId: number): ElectionPosition | null;
  getElectionPositionById(id: number): ElectionPosition | null;
  advancePositionScrutiny(electionPositionId: number): void;
  openNextPosition(electionId: number): ElectionPosition | null;
  openPosition(electionPositionId: number): ElectionPosition;
  completePosition(electionPositionId: number): void;
  forceCompletePosition(electionPositionId: number, reason: string, shouldReopen?: boolean): void;
  
  // Election Attendance management
  getElectionAttendance(electionId: number): ElectionAttendance[];
  getPresentCount(electionId: number): number;
  getPresentCountForPosition(electionPositionId: number): number;
  isMemberPresent(electionId: number, memberId: number): boolean;
  setMemberAttendance(electionId: number, memberId: number, isPresent: boolean): void;
  initializeAttendance(electionId: number): void;
  createAttendanceSnapshot(electionPositionId: number): void;
  
  getAllCandidates(): Candidate[];
  getCandidatesByElection(electionId: number): CandidateWithDetails[];
  getCandidatesByPosition(positionId: number, electionId: number): Candidate[];
  createCandidate(candidate: InsertCandidate): Candidate;
  clearCandidatesForPosition(positionId: number, electionId: number): void;
  
  createVote(vote: InsertVote): Vote;
  hasUserVoted(voterId: number, positionId: number, electionId: number, scrutinyRound: number): boolean;
  
  getElectionResults(electionId: number): ElectionResults | null;
  getLatestElectionResults(): ElectionResults | null;
  getElectionWinners(electionId: number): Array<{ userId: number; positionId: number; candidateId: number; wonAtScrutiny: number }>;
  
  getVoterAttendance(electionId: number): Array<any>;
  getVoteTimeline(electionId: number): Array<any>;
  getElectionAuditData(electionId: number): any | null;
  
  createVerificationCode(data: InsertVerificationCode): VerificationCode;
  getValidVerificationCode(email: string, code: string): VerificationCode | null;
  deleteVerificationCodesByEmail(email: string): void;
  
  createPdfVerification(electionId: number, verificationHash: string, presidentName?: string): any;
  getPdfVerification(verificationHash: string): any | null;
}

export class SQLiteStorage implements IStorage {
  getUserByEmail(email: string): User | undefined {
    const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
    const row = stmt.get(email) as any;
    if (!row) return undefined;
    
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      password: row.password,
      hasPassword: Boolean(row.has_password),
      photoUrl: row.photo_url,
      birthdate: row.birthdate,
      isAdmin: Boolean(row.is_admin),
      isMember: Boolean(row.is_member),
      activeMember: Boolean(row.active_member),
    };
  }

  getUserById(id: number): User | undefined {
    const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
    const row = stmt.get(id) as any;
    if (!row) return undefined;
    
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      password: row.password,
      hasPassword: Boolean(row.has_password),
      photoUrl: row.photo_url,
      birthdate: row.birthdate,
      isAdmin: Boolean(row.is_admin),
      isMember: Boolean(row.is_member),
      activeMember: Boolean(row.active_member),
    };
  }

  createUser(user: InsertUser): User {
    const stmt = db.prepare(
      "INSERT INTO users (full_name, email, password, has_password, photo_url, birthdate, is_admin, is_member, active_member) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *"
    );
    const row = stmt.get(
      user.fullName,
      user.email,
      user.password,
      user.hasPassword ? 1 : 0,
      user.photoUrl || null,
      user.birthdate || null,
      user.isAdmin ? 1 : 0,
      user.isMember ? 1 : 0,
      user.activeMember ? 1 : 0
    ) as any;
    
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      password: row.password,
      hasPassword: Boolean(row.has_password),
      photoUrl: row.photo_url,
      birthdate: row.birthdate,
      isAdmin: Boolean(row.is_admin),
      isMember: Boolean(row.is_member),
      activeMember: Boolean(row.active_member),
    };
  }

  getAllMembers(excludeAdmins: boolean = false): User[] {
    const query = excludeAdmins 
      ? "SELECT * FROM users WHERE is_member = 1 AND is_admin = 0 ORDER BY full_name"
      : "SELECT * FROM users WHERE is_member = 1 ORDER BY full_name";
    const stmt = db.prepare(query);
    const rows = stmt.all() as any[];
    
    return rows.map(row => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      password: row.password,
      hasPassword: Boolean(row.has_password),
      photoUrl: row.photo_url,
      birthdate: row.birthdate,
      isAdmin: Boolean(row.is_admin),
      isMember: Boolean(row.is_member),
      activeMember: Boolean(row.active_member),
    }));
  }

  updateUser(id: number, updates: Partial<Omit<User, 'id'>>): User | undefined {
    const user = this.getUserById(id);
    if (!user) return undefined;

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.fullName !== undefined) {
      fields.push("full_name = ?");
      values.push(updates.fullName);
    }
    if (updates.email !== undefined) {
      fields.push("email = ?");
      values.push(updates.email);
    }
    if (updates.password !== undefined) {
      fields.push("password = ?");
      values.push(updates.password);
    }
    if (updates.hasPassword !== undefined) {
      fields.push("has_password = ?");
      values.push(updates.hasPassword ? 1 : 0);
    }
    if (updates.photoUrl !== undefined) {
      fields.push("photo_url = ?");
      values.push(updates.photoUrl);
    }
    if (updates.birthdate !== undefined) {
      fields.push("birthdate = ?");
      values.push(updates.birthdate);
    }
    if (updates.isAdmin !== undefined) {
      fields.push("is_admin = ?");
      values.push(updates.isAdmin ? 1 : 0);
    }
    if (updates.isMember !== undefined) {
      fields.push("is_member = ?");
      values.push(updates.isMember ? 1 : 0);
    }
    if (updates.activeMember !== undefined) {
      fields.push("active_member = ?");
      values.push(updates.activeMember ? 1 : 0);
    }

    if (fields.length === 0) return user;

    values.push(id);
    const stmt = db.prepare(
      `UPDATE users SET ${fields.join(", ")} WHERE id = ? RETURNING *`
    );
    const row = stmt.get(...values) as any;

    if (!row) return undefined;

    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      password: row.password,
      hasPassword: Boolean(row.has_password),
      photoUrl: row.photo_url,
      birthdate: row.birthdate,
      isAdmin: Boolean(row.is_admin),
      isMember: Boolean(row.is_member),
      activeMember: Boolean(row.active_member),
    };
  }
  
  deleteMember(id: number): void {
  // Apaga votos onde o usuário foi votante
  db.prepare("DELETE FROM votes WHERE voter_id = ?").run(id);

  // Apaga votos onde o usuário foi candidato
  db.prepare(`
    DELETE FROM votes 
    WHERE candidate_id IN (SELECT id FROM candidates WHERE user_id = ?)
  `).run(id);

  // Apaga vencedores ligados às candidaturas do usuário
  db.prepare(`
    DELETE FROM election_winners 
    WHERE candidate_id IN (SELECT id FROM candidates WHERE user_id = ?)
  `).run(id);

  // Apaga candidaturas do usuário
  db.prepare("DELETE FROM candidates WHERE user_id = ?").run(id);

  // Apaga registros de presença
  db.prepare("DELETE FROM election_attendance WHERE member_id = ?").run(id);

  // Finalmente, remove o usuário (se não for admin)
  db.prepare("DELETE FROM users WHERE id = ? AND is_admin = 0").run(id);
  }

  getAllPositions(): Position[] {
    const stmt = db.prepare("SELECT * FROM positions ORDER BY id");
    return stmt.all() as Position[];
  }

  getActiveElection(): Election | null {
    const stmt = db.prepare("SELECT * FROM elections WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1");
    const row = stmt.get() as any;
    if (!row) return null;
    
    return {
      id: row.id,
      name: row.name,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      closedAt: row.closed_at,
    };
  }

  getElectionById(id: number): Election | undefined {
    const stmt = db.prepare("SELECT * FROM elections WHERE id = ?");
    const row = stmt.get(id) as any;
    if (!row) return undefined;
    
    return {
      id: row.id,
      name: row.name,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      closedAt: row.closed_at,
    };
  }

  createElection(name: string): Election {
    db.prepare("UPDATE elections SET is_active = 0 WHERE is_active = 1").run();
    
    const createdAt = new Date().toISOString();
    
    const stmt = db.prepare(
      "INSERT INTO elections (name, is_active, created_at) VALUES (?, 1, ?) RETURNING *"
    );
    const row = stmt.get(name, createdAt) as any;
    
    // Create election_positions for all positions, all starting as pending
    const positions = this.getAllPositions();
    for (let i = 0; i < positions.length; i++) {
      db.prepare(`
        INSERT INTO election_positions (election_id, position_id, order_index, status, current_scrutiny)
        VALUES (?, ?, ?, 'pending', 1)
      `).run(row.id, positions[i].id, i);
    }
    
    return {
      id: row.id,
      name: row.name,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      closedAt: row.closed_at,
    };
  }

  closeElection(id: number): void {
    const stmt = db.prepare("UPDATE elections SET is_active = 0 WHERE id = ?");
    stmt.run(id);
    
    // Close all election_positions
    db.prepare("UPDATE election_positions SET status = 'completed', closed_at = datetime('now') WHERE election_id = ?").run(id);
  }

  finalizeElection(id: number): void {
    const closedAt = new Date().toISOString();
    
    const stmt = db.prepare("UPDATE elections SET is_active = 0, closed_at = ? WHERE id = ?");
    stmt.run(closedAt, id);
    
    // Close all election_positions if not already closed
    db.prepare("UPDATE election_positions SET status = 'completed', closed_at = ? WHERE election_id = ? AND status != 'completed'").run(closedAt, id);
  }

  getElectionHistory(): Election[] {
    const stmt = db.prepare("SELECT * FROM elections WHERE is_active = 0 AND closed_at IS NOT NULL ORDER BY closed_at DESC");
    const rows = stmt.all() as any[];
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      closedAt: row.closed_at,
    }));
  }

  setWinner(electionId: number, candidateId: number, positionId: number, scrutiny: number): void {
    // Get candidate info for logging
    const candidateStmt = db.prepare("SELECT user_id, name FROM candidates WHERE id = ?");
    const candidate = candidateStmt.get(candidateId) as any;
    
    console.log(`[setWinner] Setting winner for election ${electionId}, position ${positionId}, candidate ${candidateId} (userId: ${candidate?.user_id}), scrutiny ${scrutiny}`);
    
    // Insert or update winner for this position
    const checkStmt = db.prepare("SELECT id FROM election_winners WHERE election_id = ? AND position_id = ?");
    const existing = checkStmt.get(electionId, positionId) as any;
    
    if (existing) {
      const updateStmt = db.prepare("UPDATE election_winners SET candidate_id = ?, won_at_scrutiny = ? WHERE election_id = ? AND position_id = ?");
      updateStmt.run(candidateId, scrutiny, electionId, positionId);
      console.log(`[setWinner] Updated existing winner record`);
    } else {
      const insertStmt = db.prepare("INSERT INTO election_winners (election_id, position_id, candidate_id, won_at_scrutiny) VALUES (?, ?, ?, ?)");
      insertStmt.run(electionId, positionId, candidateId, scrutiny);
      console.log(`[setWinner] Inserted new winner record`);
    }
    
    // Mark the election_position as completed
    db.prepare("UPDATE election_positions SET status = 'completed', closed_at = datetime('now') WHERE election_id = ? AND position_id = ?")
      .run(electionId, positionId);
    
    // Send congratulations email to the elected candidate
    try {
      const candidateStmt = db.prepare(`
        SELECT c.name, c.email, p.name as position_name
        FROM candidates c
        JOIN positions p ON c.position_id = p.id
        WHERE c.id = ?
      `);
      const candidateData = candidateStmt.get(candidateId) as { name: string; email: string; position_name: string } | undefined;
      
      if (candidateData) {
        // Send email asynchronously (don't wait for it)
        sendCongratulationsEmail(
          candidateData.name,
          candidateData.email,
          candidateData.position_name,
          scrutiny
        ).catch(error => {
          console.error("Failed to send congratulations email:", error);
        });
      }
    } catch (error) {
      console.error("Error preparing congratulations email:", error);
    }
  }

  // Election Positions management
  getElectionPositions(electionId: number): ElectionPosition[] {
    const stmt = db.prepare(`
      SELECT * FROM election_positions 
      WHERE election_id = ? 
      ORDER BY order_index
    `);
    const rows = stmt.all(electionId) as any[];
    return rows.map(row => ({
      id: row.id,
      electionId: row.election_id,
      positionId: row.position_id,
      orderIndex: row.order_index,
      status: row.status,
      currentScrutiny: row.current_scrutiny,
      openedAt: row.opened_at,
      closedAt: row.closed_at,
      createdAt: row.created_at,
    }));
  }

  getActiveElectionPosition(electionId: number): ElectionPosition | null {
    const stmt = db.prepare(`
      SELECT * FROM election_positions 
      WHERE election_id = ? AND status = 'active'
      ORDER BY order_index
      LIMIT 1
    `);
    const row = stmt.get(electionId) as any;
    if (!row) return null;
    
    return {
      id: row.id,
      electionId: row.election_id,
      positionId: row.position_id,
      orderIndex: row.order_index,
      status: row.status,
      currentScrutiny: row.current_scrutiny,
      openedAt: row.opened_at,
      closedAt: row.closed_at,
      createdAt: row.created_at,
    };
  }

  advancePositionScrutiny(electionPositionId: number): void {
    // Get the position details before updating
    const positionStmt = db.prepare("SELECT * FROM election_positions WHERE id = ?");
    const position = positionStmt.get(electionPositionId) as any;
    
    if (!position) return;
    
    const newScrutiny = position.current_scrutiny + 1;
    
    // Note: We do NOT clear candidates when advancing to 2nd scrutiny
    // Candidates remain the same across scrutiny rounds
    // The UNIQUE constraint on (user_id, position_id, election_id) prevents duplicates
    
    // If advancing to 3rd scrutiny, keep only top 2 candidates from 2nd scrutiny
    // If there's a tie, use birthdate (oldest candidates advance)
    if (newScrutiny === 3) {
      // Get vote counts for all candidates in 2nd scrutiny with birthdate for tie-breaking
      // NULLs are placed last so candidates without birthdate don't get unfair advantage
      const candidatesStmt = db.prepare(`
        SELECT c.id, c.user_id, u.birthdate, COUNT(v.id) as vote_count
        FROM candidates c
        LEFT JOIN votes v ON v.candidate_id = c.id AND v.scrutiny_round = 2
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.position_id = ? AND c.election_id = ?
        GROUP BY c.id
        ORDER BY vote_count DESC, 
                 CASE WHEN u.birthdate IS NULL OR u.birthdate = '' THEN 1 ELSE 0 END,
                 u.birthdate ASC
        LIMIT 2
      `);
      const topCandidates = candidatesStmt.all(position.position_id, position.election_id) as any[];
      
      if (topCandidates.length === 2) {
        // Keep only these top 2 candidates, remove all others
        const candidateIds = topCandidates.map((c: any) => c.id);
        
        // FIRST: Delete votes from candidates that will be removed (to avoid foreign key constraint)
        db.prepare(`
          DELETE FROM votes 
          WHERE position_id = ? AND election_id = ? AND candidate_id NOT IN (?, ?)
        `).run(position.position_id, position.election_id, candidateIds[0], candidateIds[1]);
        
        // THEN: Delete the candidates themselves
        db.prepare(`
          DELETE FROM candidates 
          WHERE position_id = ? AND election_id = ? AND id NOT IN (?, ?)
        `).run(position.position_id, position.election_id, candidateIds[0], candidateIds[1]);
      }
    }
    
    // Update scrutiny
    db.prepare(`
      UPDATE election_positions 
      SET current_scrutiny = ? 
      WHERE id = ? AND current_scrutiny < 3
    `).run(newScrutiny, electionPositionId);
  }

  openNextPosition(electionId: number): ElectionPosition | null {
    // Get the current active position
    const currentActive = this.getActiveElectionPosition(electionId);
    
    if (!currentActive) {
      // If no active position, open the first pending one
      const nextStmt = db.prepare(`
        SELECT * FROM election_positions 
        WHERE election_id = ? AND status = 'pending'
        ORDER BY order_index
        LIMIT 1
      `);
      const nextRow = nextStmt.get(electionId) as any;
      
      if (nextRow) {
        // Clear any existing candidates for this new position before opening
        this.clearCandidatesForPosition(nextRow.position_id, electionId);
        
        db.prepare(`
          UPDATE election_positions 
          SET status = 'active', opened_at = datetime('now')
          WHERE id = ?
        `).run(nextRow.id);
        
        return this.getActiveElectionPosition(electionId);
      }
      
      return null;
    }
    
    // Complete current position and clear its data
    this.clearCandidatesForPosition(currentActive.positionId, electionId);
    
    db.prepare(`
      UPDATE election_positions 
      SET status = 'completed', closed_at = datetime('now')
      WHERE id = ?
    `).run(currentActive.id);
    
    // Find and open next position
    const nextStmt = db.prepare(`
      SELECT * FROM election_positions 
      WHERE election_id = ? AND order_index > ? AND status = 'pending'
      ORDER BY order_index
      LIMIT 1
    `);
    const nextRow = nextStmt.get(electionId, currentActive.orderIndex) as any;
    
    if (nextRow) {
      // Clear any existing candidates for this new position before opening
      this.clearCandidatesForPosition(nextRow.position_id, electionId);
      
      db.prepare(`
        UPDATE election_positions 
        SET status = 'active', opened_at = datetime('now')
        WHERE id = ?
      `).run(nextRow.id);
      
      return this.getActiveElectionPosition(electionId);
    }
    
    return null;
  }

  completePosition(electionPositionId: number): void {
    db.prepare(`
      UPDATE election_positions 
      SET status = 'completed', closed_at = datetime('now')
      WHERE id = ?
    `).run(electionPositionId);
  }

  forceCompletePosition(electionPositionId: number, reason: string, shouldReopen: boolean = false): void {
    // Admin override to manually complete a position when stuck due to abstentions
    console.log(`[ADMIN OVERRIDE] Forcing completion of position ${electionPositionId}. Reason: ${reason}. Reopen: ${shouldReopen}`);
    
    const position = this.getElectionPositionById(electionPositionId);
    if (!position) {
      throw new Error("Cargo não encontrado");
    }
    
    if (shouldReopen) {
      // Close current voting, clear ALL votes and candidates, reset to pending for revote
      console.log(`[ADMIN OVERRIDE] Clearing ALL votes, winners, and candidates for position ${electionPositionId} to reopen`);
      
      // Delete ALL votes for this position across all scrutiny rounds (not just current)
      db.prepare(`
        DELETE FROM votes 
        WHERE election_id = ? AND position_id = ?
      `).run(position.electionId, position.positionId);
      
      // Delete any winner records for this position
      db.prepare(`
        DELETE FROM election_winners 
        WHERE election_id = ? AND position_id = ?
      `).run(position.electionId, position.positionId);
      
      // Clear candidates for this position
      this.clearCandidatesForPosition(position.positionId, position.electionId);
      
      // Reset position to pending status and reset scrutiny
      db.prepare(`
        UPDATE election_positions 
        SET status = 'pending', current_scrutiny = 1, opened_at = NULL, closed_at = NULL
        WHERE id = ?
      `).run(electionPositionId);
      
      console.log(`[ADMIN OVERRIDE] Position ${electionPositionId} fully reset to pending for revote (all votes, winners, and candidates cleared)`);
    } else {
      // Permanently close the position
      db.prepare(`
        UPDATE election_positions 
        SET status = 'completed', closed_at = datetime('now')
        WHERE id = ?
      `).run(electionPositionId);
    }
  }

  getElectionPositionById(id: number): ElectionPosition | null {
    const stmt = db.prepare("SELECT * FROM election_positions WHERE id = ?");
    const row = stmt.get(id) as any;
    if (!row) return null;
    
    return {
      id: row.id,
      electionId: row.election_id,
      positionId: row.position_id,
      orderIndex: row.order_index,
      status: row.status,
      currentScrutiny: row.current_scrutiny,
      openedAt: row.opened_at,
      closedAt: row.closed_at,
      createdAt: row.created_at,
    };
  }

  openPosition(electionPositionId: number): ElectionPosition {
    const position = this.getElectionPositionById(electionPositionId);
    if (!position) {
      throw new Error("Cargo não encontrado");
    }

    // Can only open pending positions
    if (position.status !== 'pending') {
      throw new Error("Este cargo já foi aberto ou concluído.");
    }

    // Check if there's an active position in this election
    const activePosition = this.getActiveElectionPosition(position.electionId);
    if (activePosition) {
      throw new Error("Não é possível abrir um novo cargo enquanto outro ainda está ativo. Aguarde até que o cargo atual seja decidido pela votação ou complete o processo de votação.");
    }

    // SEQUENTIAL VOTING: Check if all previous positions are completed
    const previousPendingStmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM election_positions 
      WHERE election_id = ? AND order_index < ? AND status != 'completed'
    `);
    const previousPending = previousPendingStmt.get(position.electionId, position.orderIndex) as { count: number };
    
    if (previousPending.count > 0) {
      throw new Error("A votação deve seguir a ordem sequencial. Complete os cargos anteriores antes de abrir este cargo.");
    }

    // Clear old votes for this position (but keep candidates)
    db.prepare(`
      DELETE FROM votes 
      WHERE position_id = ? AND election_id = ?
    `).run(position.positionId, position.electionId);
    
    // Clear any existing attendance snapshots for this position
    db.prepare(`
      DELETE FROM election_attendance 
      WHERE election_position_id = ?
    `).run(electionPositionId);

    // Open this position
    db.prepare(`
      UPDATE election_positions 
      SET status = 'active', opened_at = datetime('now'), current_scrutiny = 1
      WHERE id = ?
    `).run(electionPositionId);

    // Create attendance snapshot for this position
    this.createAttendanceSnapshot(electionPositionId);

    return this.getElectionPositionById(electionPositionId)!;
  }

  // Election Attendance management
  getElectionAttendance(electionId: number): ElectionAttendance[] {
    const stmt = db.prepare(`
      SELECT * FROM election_attendance 
      WHERE election_id = ? AND election_position_id IS NULL
      ORDER BY member_id
    `);
    const rows = stmt.all(electionId) as any[];
    return rows.map(row => ({
      id: row.id,
      electionId: row.election_id,
      electionPositionId: row.election_position_id || null,
      memberId: row.member_id,
      isPresent: Boolean(row.is_present),
      markedAt: row.marked_at,
      createdAt: row.created_at,
    }));
  }

  getPresentCount(electionId: number): number {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count 
      FROM election_attendance 
      WHERE election_id = ? AND is_present = 1 AND election_position_id IS NULL
    `);
    const result = stmt.get(electionId) as { count: number };
    return result.count;
  }

  isMemberPresent(electionId: number, memberId: number): boolean {
    const stmt = db.prepare(`
      SELECT is_present 
      FROM election_attendance 
      WHERE election_id = ? AND member_id = ?
    `);
    const result = stmt.get(electionId, memberId) as any;
    return result ? Boolean(result.is_present) : false;
  }

  setMemberAttendance(electionId: number, memberId: number, isPresent: boolean): void {
    const checkStmt = db.prepare(`
      SELECT id FROM election_attendance 
      WHERE election_id = ? AND member_id = ?
    `);
    const existing = checkStmt.get(electionId, memberId) as any;
    
    if (existing) {
      db.prepare(`
        UPDATE election_attendance 
        SET is_present = ?, marked_at = datetime('now')
        WHERE id = ?
      `).run(isPresent ? 1 : 0, existing.id);
    } else {
      db.prepare(`
        INSERT INTO election_attendance (election_id, member_id, is_present, marked_at)
        VALUES (?, ?, ?, datetime('now'))
      `).run(electionId, memberId, isPresent ? 1 : 0);
    }
  }

  initializeAttendance(electionId: number): void {
    // Create attendance records for all active members only
    const members = this.getAllMembers().filter(m => m.activeMember);
    
    for (const member of members) {
      // Check if attendance already exists
      const checkStmt = db.prepare(`
        SELECT id FROM election_attendance 
        WHERE election_id = ? AND member_id = ?
      `);
      const existing = checkStmt.get(electionId, member.id) as any;
      
      if (!existing) {
        db.prepare(`
          INSERT INTO election_attendance (election_id, member_id, is_present)
          VALUES (?, ?, 0)
        `).run(electionId, member.id);
      }
    }
  }

  getPresentCountForPosition(electionPositionId: number): number {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count 
      FROM election_attendance 
      WHERE election_position_id = ? AND is_present = 1
    `);
    const result = stmt.get(electionPositionId) as { count: number };
    return result.count;
  }

  createAttendanceSnapshot(electionPositionId: number): void {
    const position = this.getElectionPositionById(electionPositionId);
    if (!position) return;

    // Get the current attendance state for this election
    // We use a GROUP BY to get the latest attendance record for each member
    const presentMembers = db.prepare(`
      SELECT member_id
      FROM election_attendance
      WHERE election_id = ? 
        AND election_position_id IS NULL
        AND is_present = 1
      GROUP BY member_id
    `).all(position.electionId) as Array<{ member_id: number }>;

    // Create attendance snapshot for this position
    for (const { member_id } of presentMembers) {
      db.prepare(`
        INSERT INTO election_attendance (election_id, election_position_id, member_id, is_present, marked_at)
        VALUES (?, ?, ?, 1, datetime('now'))
      `).run(position.electionId, electionPositionId, member_id);
    }
  }

  getAllCandidates(): Candidate[] {
    const stmt = db.prepare("SELECT * FROM candidates");
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      userId: row.user_id,
      positionId: row.position_id,
      electionId: row.election_id,
    }));
  }

  getCandidatesByElection(electionId: number): CandidateWithDetails[] {
    const stmt = db.prepare(`
      SELECT 
        c.*,
        p.name as positionName,
        e.name as electionName
      FROM candidates c
      JOIN positions p ON c.position_id = p.id
      JOIN elections e ON c.election_id = e.id
      WHERE c.election_id = ?
      ORDER BY p.id, c.name
    `);
    const rows = stmt.all(electionId) as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      userId: row.user_id,
      positionId: row.position_id,
      electionId: row.election_id,
      positionName: row.positionName,
      electionName: row.electionName,
    }));
  }

  getCandidatesByPosition(positionId: number, electionId: number): Candidate[] {
    const stmt = db.prepare(
      "SELECT * FROM candidates WHERE position_id = ? AND election_id = ?"
    );
    const rows = stmt.all(positionId, electionId) as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      userId: row.user_id,
      positionId: row.position_id,
      electionId: row.election_id,
    }));
  }

  createCandidate(candidate: InsertCandidate): Candidate {
    const stmt = db.prepare(
      "INSERT INTO candidates (name, email, user_id, position_id, election_id) VALUES (?, ?, ?, ?, ?) RETURNING *"
    );
    const row = stmt.get(
      candidate.name,
      candidate.email,
      candidate.userId,
      candidate.positionId,
      candidate.electionId
    ) as any;
    
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      userId: row.user_id,
      positionId: row.position_id,
      electionId: row.election_id,
    };
  }

  clearCandidatesForPosition(positionId: number, electionId: number): void {
    // Delete votes for candidates of this position first
    db.prepare(`
      DELETE FROM votes 
      WHERE candidate_id IN (
        SELECT id FROM candidates WHERE position_id = ? AND election_id = ?
      )
    `).run(positionId, electionId);
    
    // Then delete the candidates
    db.prepare(
      "DELETE FROM candidates WHERE position_id = ? AND election_id = ?"
    ).run(positionId, electionId);
  }

  createVote(vote: InsertVote): Vote {
    const stmt = db.prepare(
      "INSERT INTO votes (voter_id, candidate_id, position_id, election_id, scrutiny_round) VALUES (?, ?, ?, ?, ?) RETURNING *"
    );
    const row = stmt.get(
      vote.voterId,
      vote.candidateId,
      vote.positionId,
      vote.electionId,
      vote.scrutinyRound || 1
    ) as any;
    
    const createdVote = {
      id: row.id,
      voterId: row.voter_id,
      candidateId: row.candidate_id,
      positionId: row.position_id,
      electionId: row.election_id,
      scrutinyRound: row.scrutiny_round,
      createdAt: row.created_at,
    };

    // Check for automatic winner after vote
    this.checkAndSetAutomaticWinner(vote.electionId, vote.positionId, vote.scrutinyRound || 1);
    
    return createdVote;
  }

  private checkAndSetAutomaticWinner(electionId: number, positionId: number, scrutinyRound: number): void {
    // Get the active election position
    const activePosition = this.getActiveElectionPosition(electionId);
    if (!activePosition || activePosition.positionId !== positionId) return;

    // Get present count for this position from attendance snapshot
    const presentCount = this.getPresentCountForPosition(activePosition.id);
    if (presentCount === 0) return;

    // First, check if ALL present members have voted
    const totalVotesStmt = db.prepare(
      "SELECT COUNT(DISTINCT voter_id) as count FROM votes WHERE position_id = ? AND election_id = ? AND scrutiny_round = ?"
    );
    const totalVotesResult = totalVotesStmt.get(positionId, electionId, scrutinyRound) as { count: number };
    
    // Only check for winner if all present members have voted
    if (totalVotesResult.count < presentCount) {
      return; // Wait for all votes
    }

    const majorityThreshold = Math.floor(presentCount / 2) + 1;

    // Use a single optimized query with GROUP BY to find candidate with majority
    const winnerStmt = db.prepare(`
      SELECT candidate_id, COUNT(*) as vote_count
      FROM votes 
      WHERE position_id = ? AND election_id = ? AND scrutiny_round = ?
      GROUP BY candidate_id
      HAVING vote_count >= ?
      ORDER BY vote_count DESC
      LIMIT 1
    `);
    const winner = winnerStmt.get(positionId, electionId, scrutinyRound, majorityThreshold) as { candidate_id: number; vote_count: number } | undefined;

    if (winner) {
      // This candidate has reached majority - set as winner
      this.setWinner(electionId, winner.candidate_id, positionId, scrutinyRound);
      // Complete this position
      this.completePosition(activePosition.id);
      return;
    }

    // If 3rd scrutiny and no majority winner, use age-based tie-breaking
    if (scrutinyRound === 3) {
      // Get all candidates with their vote counts and birthdates for tie-breaking
      // NULLs are placed last so candidates without birthdate don't get unfair advantage
      const tiedCandidatesStmt = db.prepare(`
        SELECT c.id as candidate_id, COUNT(v.id) as vote_count, u.birthdate
        FROM candidates c
        LEFT JOIN votes v ON v.candidate_id = c.id AND v.scrutiny_round = 3
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.position_id = ? AND c.election_id = ?
        GROUP BY c.id
        ORDER BY vote_count DESC,
                 CASE WHEN u.birthdate IS NULL OR u.birthdate = '' THEN 1 ELSE 0 END,
                 u.birthdate ASC
        LIMIT 1
      `);
      const oldestWinner = tiedCandidatesStmt.get(positionId, electionId) as { candidate_id: number; vote_count: number; birthdate: string | null } | undefined;

      if (oldestWinner) {
        // Automatically set the oldest candidate as winner
        this.setWinner(electionId, oldestWinner.candidate_id, positionId, scrutinyRound);
        this.completePosition(activePosition.id);
      }
    }
  }

  checkThirdScrutinyTie(electionPositionId: number): { hasTie: boolean; candidates: Array<{ candidateId: number; voteCount: number }> } {
    const position = this.getElectionPositionById(electionPositionId);
    if (!position || position.currentScrutiny !== 3) {
      return { hasTie: false, candidates: [] };
    }

    // Get present count for this position
    const presentCount = this.getPresentCountForPosition(electionPositionId);
    if (presentCount === 0) {
      return { hasTie: false, candidates: [] };
    }

    // Check if all present members have voted
    const totalVotesStmt = db.prepare(
      "SELECT COUNT(DISTINCT voter_id) as count FROM votes WHERE position_id = ? AND election_id = ? AND scrutiny_round = 3"
    );
    const totalVotesResult = totalVotesStmt.get(position.positionId, position.electionId) as { count: number };
    
    if (totalVotesResult.count < presentCount) {
      return { hasTie: false, candidates: [] }; // Not all votes are in yet
    }

    // Get vote counts for all candidates in 3rd scrutiny
    const votesStmt = db.prepare(`
      SELECT candidate_id, COUNT(*) as vote_count
      FROM votes 
      WHERE position_id = ? AND election_id = ? AND scrutiny_round = 3
      GROUP BY candidate_id
      ORDER BY vote_count DESC
    `);
    const results = votesStmt.all(position.positionId, position.electionId) as Array<{ candidate_id: number; vote_count: number }>;

    if (results.length >= 2) {
      const topVotes = results[0].vote_count;
      
      // Get ALL candidates with the top vote count (could be 2, 3, or more)
      const tiedCandidates = results.filter(r => r.vote_count === topVotes);
      
      // If more than 1 candidate has the top votes, it's a tie
      if (tiedCandidates.length > 1) {
        return {
          hasTie: true,
          candidates: tiedCandidates.map(c => ({
            candidateId: c.candidate_id,
            voteCount: c.vote_count
          }))
        };
      }
    }

    return { hasTie: false, candidates: [] };
  }

  resolveThirdScrutinyTie(electionPositionId: number, winnerId: number): void {
    const position = this.getElectionPositionById(electionPositionId);
    if (!position) {
      throw new Error("Cargo não encontrado");
    }

    // Verify it's actually a tie scenario
    const tieCheck = this.checkThirdScrutinyTie(electionPositionId);
    if (!tieCheck.hasTie) {
      throw new Error("Não há empate para resolver neste cargo");
    }

    // Verify the winner is one of the tied candidates
    const isValidWinner = tieCheck.candidates.some(c => c.candidateId === winnerId);
    if (!isValidWinner) {
      throw new Error("O candidato escolhido não está entre os empatados");
    }

    // Set the winner
    this.setWinner(position.electionId, winnerId, position.positionId, 3);
    this.completePosition(electionPositionId);
  }

  hasUserVoted(voterId: number, positionId: number, electionId: number, scrutinyRound: number): boolean {
    const stmt = db.prepare(
      "SELECT COUNT(*) as count FROM votes WHERE voter_id = ? AND position_id = ? AND election_id = ? AND scrutiny_round = ?"
    );
    const result = stmt.get(voterId, positionId, electionId, scrutinyRound) as { count: number };
    return result.count > 0;
  }

  getElectionResults(electionId: number): ElectionResults | null {
    const election = this.getElectionById(electionId);
    if (!election) return null;

    // Get all election positions with position names in one query
    const electionPositions = db.prepare(`
      SELECT ep.*, p.name as positionName
      FROM election_positions ep
      JOIN positions p ON ep.position_id = p.id
      WHERE ep.election_id = ?
      ORDER BY ep.order_index
    `).all(electionId) as any[];
    
    // Get present count
    const presentCount = this.getPresentCount(electionId);
    
    const results: ElectionResults = {
      electionId: election.id,
      electionName: election.name,
      isActive: election.isActive,
      currentScrutiny: electionPositions.find(ep => ep.status === 'active')?.current_scrutiny || 1,
      presentCount,
      createdAt: election.createdAt,
      closedAt: election.closedAt,
      positions: [],
    };

    // Get all candidates with vote counts for current scrutiny
    const candidatesWithVotes = db.prepare(`
      SELECT 
        c.id as candidateId,
        c.name as candidateName,
        c.email as candidateEmail,
        c.position_id as positionId,
        ep.current_scrutiny as currentScrutiny,
        COALESCE(v.vote_count, 0) as voteCount
      FROM candidates c
      INNER JOIN election_positions ep ON c.position_id = ep.position_id AND c.election_id = ep.election_id
      LEFT JOIN (
        SELECT v.candidate_id, v.scrutiny_round, COUNT(*) as vote_count
        FROM votes v
        INNER JOIN election_positions ep2 ON v.position_id = ep2.position_id AND v.election_id = ep2.election_id
        WHERE v.election_id = ? AND v.scrutiny_round = ep2.current_scrutiny
        GROUP BY v.candidate_id, v.scrutiny_round
      ) v ON c.id = v.candidate_id AND v.scrutiny_round = ep.current_scrutiny
      WHERE c.election_id = ?
      ORDER BY c.position_id, voteCount DESC
    `).all(electionId, electionId) as any[];

    // Get all winners in one query
    const winners = db.prepare(`
      SELECT position_id as positionId, candidate_id as candidateId, won_at_scrutiny as wonAtScrutiny
      FROM election_winners
      WHERE election_id = ?
    `).all(electionId) as any[];
    
    const winnersMap = new Map(winners.map(w => [w.positionId, { candidateId: w.candidateId, wonAtScrutiny: w.wonAtScrutiny }]));

    // Get total voters per position in one query
    const votersPerPosition = db.prepare(`
      SELECT position_id, scrutiny_round, COUNT(DISTINCT voter_id) as count
      FROM votes
      WHERE election_id = ?
      GROUP BY position_id, scrutiny_round
    `).all(electionId) as any[];
    
    const votersMap = new Map(votersPerPosition.map(v => [`${v.position_id}_${v.scrutiny_round}`, v.count]));

    for (const electionPosition of electionPositions) {
      const currentScrutiny = electionPosition.current_scrutiny;
      const positionId = electionPosition.position_id;
      
      // Calculate majority threshold
      let majorityThreshold: number;
      if (currentScrutiny === 3) {
        majorityThreshold = 1;
      } else {
        majorityThreshold = Math.floor(presentCount / 2) + 1;
      }
      
      // Get candidates for this position from pre-fetched data
      const positionCandidates = candidatesWithVotes
        .filter(c => c.positionId === positionId && c.currentScrutiny === currentScrutiny)
        .map(c => ({
          candidateId: c.candidateId,
          candidateName: c.candidateName,
          candidateEmail: c.candidateEmail,
          photoUrl: "",
          voteCount: c.voteCount,
          isElected: false,
          electedInScrutiny: undefined as number | undefined,
        }));

      const totalVoters = votersMap.get(`${positionId}_${currentScrutiny}`) || 0;

      // Determine if someone won
      let winnerId: number | undefined;
      let winnerScrutiny: number | undefined;
      let needsNextScrutiny = false;

      const winner = winnersMap.get(positionId);
      if (winner) {
        winnerId = winner.candidateId;
        winnerScrutiny = winner.wonAtScrutiny;
      } else if (currentScrutiny < 3 && positionCandidates.length > 0 && positionCandidates[0].voteCount >= majorityThreshold) {
        winnerId = positionCandidates[0].candidateId;
        winnerScrutiny = currentScrutiny;
      } else if (currentScrutiny === 3) {
        if (positionCandidates.length > 1 && positionCandidates[0].voteCount === positionCandidates[1].voteCount) {
          needsNextScrutiny = false;
        } else if (positionCandidates.length > 0 && positionCandidates[0].voteCount > 0) {
          winnerId = positionCandidates[0].candidateId;
          winnerScrutiny = 3;
        }
      } else if (currentScrutiny < 3 && electionPosition.status === 'active') {
        needsNextScrutiny = true;
      }

      // Mark elected candidate
      if (winnerId) {
        const electedCandidate = positionCandidates.find(c => c.candidateId === winnerId);
        if (electedCandidate) {
          electedCandidate.isElected = true;
          electedCandidate.electedInScrutiny = winnerScrutiny;
        }
      }

      results.positions.push({
        positionId: electionPosition.position_id,
        positionName: electionPosition.positionName,
        status: electionPosition.status,
        currentScrutiny,
        orderIndex: electionPosition.order_index,
        totalVoters,
        majorityThreshold,
        needsNextScrutiny,
        winnerId,
        winnerScrutiny,
        candidates: positionCandidates,
      });
    }

    return results;
  }

  getLatestElectionResults(): ElectionResults | null {
    const stmt = db.prepare("SELECT * FROM elections ORDER BY created_at DESC LIMIT 1");
    const row = stmt.get() as any;
    
    if (!row) return null;
    
    return this.getElectionResults(row.id);
  }

  getElectionWinners(electionId: number): Array<{ userId: number; positionId: number; candidateId: number; wonAtScrutiny: number }> {
    const stmt = db.prepare(`
      SELECT 
        c.user_id as userId,
        ew.position_id as positionId,
        ew.candidate_id as candidateId,
        ew.won_at_scrutiny as wonAtScrutiny
      FROM election_winners ew
      INNER JOIN candidates c ON c.id = ew.candidate_id
      WHERE ew.election_id = ?
    `);
    
    const results = stmt.all(electionId) as any[];
    console.log(`[DB] getElectionWinners for election ${electionId}:`, results);
    return results;
  }

  createVerificationCode(data: InsertVerificationCode): VerificationCode {
    const stmt = db.prepare(
      "INSERT INTO verification_codes (email, code, expires_at, is_password_reset) VALUES (?, ?, ?, ?) RETURNING *"
    );
    const row = stmt.get(data.email, data.code, data.expiresAt, data.isPasswordReset ? 1 : 0) as any;
    
    return {
      id: row.id,
      email: row.email,
      code: row.code,
      expiresAt: row.expires_at,
      isPasswordReset: Boolean(row.is_password_reset),
      createdAt: row.created_at,
    };
  }

  getValidVerificationCode(email: string, code: string): VerificationCode | null {
    const stmt = db.prepare(
      "SELECT * FROM verification_codes WHERE email = ? AND code = ? AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1"
    );
    const row = stmt.get(email, code) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      email: row.email,
      code: row.code,
      expiresAt: row.expires_at,
      isPasswordReset: Boolean(row.is_password_reset),
      createdAt: row.created_at,
    };
  }

  deleteVerificationCodesByEmail(email: string): void {
    const stmt = db.prepare("DELETE FROM verification_codes WHERE email = ?");
    stmt.run(email);
  }

  getVoterAttendance(electionId: number): Array<any> {
    const stmt = db.prepare(`
      SELECT 
        u.id as voterId,
        u.full_name as voterName,
        u.email as voterEmail,
        MIN(v.created_at) as firstVoteAt,
        COUNT(DISTINCT v.position_id) as totalVotes
      FROM votes v
      JOIN users u ON v.voter_id = u.id
      WHERE v.election_id = ?
      GROUP BY u.id, u.full_name, u.email
      ORDER BY u.full_name
    `);
    return stmt.all(electionId) as any[];
  }

  getVoteTimeline(electionId: number): Array<any> {
    const stmt = db.prepare(`
      SELECT 
        v.voter_id as voterId,
        u.full_name as voterName,
        u.email as voterEmail,
        p.name as positionName,
        c.name as candidateName,
        v.scrutiny_round as scrutinyRound,
        v.created_at as votedAt
      FROM votes v
      JOIN users u ON v.voter_id = u.id
      JOIN positions p ON v.position_id = p.id
      JOIN candidates c ON v.candidate_id = c.id
      WHERE v.election_id = ?
      ORDER BY v.created_at ASC
    `);
    return stmt.all(electionId) as any[];
  }

  getScrutinyHistory(electionId: number): Array<any> {
    const electionPositions = this.getElectionPositions(electionId);
    const allPositions = this.getAllPositions();
    const winners = this.getElectionWinners(electionId);
    const history: any[] = [];

    // Create a map of position ID to position name
    const positionMap = new Map(allPositions.map(p => [p.id, p.name]));

    // Create a map of candidate ID to winner info
    const winnerMap = new Map(winners.map(w => [w.candidateId, { wonAtScrutiny: w.wonAtScrutiny, positionId: w.positionId }]));

    for (const position of electionPositions) {
      const posName = positionMap.get(position.positionId);
      if (!posName) continue;

      const positionHistory: any = {
        positionId: position.positionId,
        positionName: posName,
        scrutinies: []
      };

      // Get candidates for this position
      const candidates = this.getCandidatesByPosition(position.positionId, electionId);

      // For each scrutiny round (1 to current_scrutiny or max 3)
      const maxScrutiny = Math.min(position.currentScrutiny, 3);
      for (let scrutiny = 1; scrutiny <= maxScrutiny; scrutiny++) {
        const scrutinyData: any = {
          round: scrutiny,
          candidates: []
        };

        // Get vote counts for each candidate in this scrutiny
        const voteStmt = db.prepare(`
          SELECT candidate_id, COUNT(*) as voteCount
          FROM votes
          WHERE election_id = ? AND position_id = ? AND scrutiny_round = ?
          GROUP BY candidate_id
        `);
        const voteCounts = voteStmt.all(electionId, position.positionId, scrutiny) as Array<{ candidate_id: number; voteCount: number }>;

        // Map vote counts to candidates
        const voteCountMap = new Map(voteCounts.map(v => [v.candidate_id, v.voteCount]));

        for (const candidate of candidates) {
          const votes = voteCountMap.get(candidate.id) || 0;
          const user = this.getUserById(candidate.userId);
          const winnerInfo = winnerMap.get(candidate.id);

          scrutinyData.candidates.push({
            candidateId: candidate.id,
            candidateName: candidate.name,
            candidateEmail: user?.email || '',
            voteCount: votes,
            advancedToNext: scrutiny < maxScrutiny ? votes > 0 : false, // Simple logic - can be refined
            isElected: winnerInfo ? winnerInfo.wonAtScrutiny === scrutiny : false
          });
        }

        // Sort by vote count descending
        scrutinyData.candidates.sort((a: any, b: any) => b.voteCount - a.voteCount);

        positionHistory.scrutinies.push(scrutinyData);
      }

      history.push(positionHistory);
    }

    return history;
  }

  getElectionAuditData(electionId: number): any | null {
    const results = this.getElectionResults(electionId);
    if (!results) return null;

    const election = this.getElectionById(electionId);
    if (!election) return null;

    const positions = this.getElectionPositions(electionId);
    const completedPositions = positions.filter((p: any) => p.status === 'completed');
    
    const totalMembers = this.getAllMembers(true).filter(m => m.activeMember).length;

    return {
      results,
      electionMetadata: {
        createdAt: election.createdAt,
        closedAt: election.closedAt || null,
        totalPositions: positions.length,
        completedPositions: completedPositions.length,
        totalMembers,
      },
      voterAttendance: this.getVoterAttendance(electionId),
      voteTimeline: this.getVoteTimeline(electionId),
      scrutinyHistory: this.getScrutinyHistory(electionId),
    };
  }

  createPdfVerification(electionId: number, verificationHash: string, presidentName?: string): any {
    const now = new Date();
    const brasiliaTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now);
    
    const [date, time] = brasiliaTime.split(', ');
    const [month, day, year] = date.split('/');
    const formattedDateTime = `${year}-${month}-${day} ${time}`;
    
    const stmt = db.prepare(`
      INSERT INTO pdf_verifications (election_id, verification_hash, president_name, created_at)
      VALUES (?, ?, ?, ?)
      RETURNING *
    `);
    const row = stmt.get(electionId, verificationHash, presidentName || null, formattedDateTime) as any;
    return {
      id: row.id,
      electionId: row.election_id,
      verificationHash: row.verification_hash,
      presidentName: row.president_name,
      createdAt: row.created_at,
    };
  }

  getPdfVerification(verificationHash: string): any | null {
    const stmt = db.prepare(`
      SELECT pv.*, e.name as election_name, e.created_at as election_created_at, e.closed_at as election_closed_at
      FROM pdf_verifications pv
      JOIN elections e ON pv.election_id = e.id
      WHERE pv.verification_hash = ?
    `);
    const row = stmt.get(verificationHash) as any;
    if (!row) return null;
    
    return {
      id: row.id,
      electionId: row.election_id,
      electionName: row.election_name,
      electionCreatedAt: row.election_created_at,
      electionClosedAt: row.election_closed_at,
      verificationHash: row.verification_hash,
      presidentName: row.president_name,
      createdAt: row.created_at,
    };
  }
}

export const storage = new SQLiteStorage();
