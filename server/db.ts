import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@shared/schema";
import path from "path";
import fs from "fs";
import { hashPassword } from "./auth";

const dbDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, "emaus-vota.db");
const sqlite = new Database(dbPath);

sqlite.exec("PRAGMA foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export async function initializeDatabase() {
  console.log("Initializing database...");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      photo_url TEXT,
      birthdate TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_member INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS elections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      current_scrutiny INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS election_winners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      election_id INTEGER NOT NULL,
      position_id INTEGER NOT NULL,
      candidate_id INTEGER NOT NULL,
      won_at_scrutiny INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (election_id) REFERENCES elections(id),
      FOREIGN KEY (position_id) REFERENCES positions(id),
      FOREIGN KEY (candidate_id) REFERENCES candidates(id)
    );

    CREATE TABLE IF NOT EXISTS election_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      election_id INTEGER NOT NULL,
      position_id INTEGER NOT NULL,
      order_index INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      current_scrutiny INTEGER NOT NULL DEFAULT 1,
      opened_at TEXT,
      closed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (election_id) REFERENCES elections(id),
      FOREIGN KEY (position_id) REFERENCES positions(id)
    );

    CREATE TABLE IF NOT EXISTS election_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      election_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      is_present INTEGER NOT NULL DEFAULT 0,
      marked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (election_id) REFERENCES elections(id),
      FOREIGN KEY (member_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      user_id INTEGER NOT NULL DEFAULT 0,
      position_id INTEGER NOT NULL,
      election_id INTEGER NOT NULL,
      FOREIGN KEY (position_id) REFERENCES positions(id),
      FOREIGN KEY (election_id) REFERENCES elections(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voter_id INTEGER NOT NULL,
      candidate_id INTEGER NOT NULL,
      position_id INTEGER NOT NULL,
      election_id INTEGER NOT NULL,
      scrutiny_round INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(voter_id, position_id, election_id, scrutiny_round),
      FOREIGN KEY (voter_id) REFERENCES users(id),
      FOREIGN KEY (candidate_id) REFERENCES candidates(id),
      FOREIGN KEY (position_id) REFERENCES positions(id),
      FOREIGN KEY (election_id) REFERENCES elections(id)
    );

    CREATE TABLE IF NOT EXISTS verification_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pdf_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      election_id INTEGER NOT NULL,
      verification_hash TEXT NOT NULL UNIQUE,
      president_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (election_id) REFERENCES elections(id)
    );
  `);

  // Migration: Add new columns if they don't exist
  try {
    // Check and add columns to elections table
    const electionsColumns = sqlite.prepare("PRAGMA table_info(elections)").all() as Array<{ name: string }>;
    const electionsColumnNames = electionsColumns.map(col => col.name);
    
    // Migrate from current_scrutiny in elections to election_positions
    if (electionsColumnNames.includes('current_scrutiny')) {
      console.log("Migrating from current_scrutiny column to election_positions table...");
      
      // First, migrate existing election data to election_positions
      const existingElections = sqlite.prepare(`
        SELECT id, current_scrutiny FROM elections
      `).all() as Array<{ id: number; current_scrutiny: number }>;
      
      const allPositions = sqlite.prepare("SELECT id FROM positions ORDER BY id").all() as Array<{ id: number }>;
      
      // Create election_positions for each existing election
      for (const election of existingElections) {
        // Check if election_positions already exists for this election
        const existingEP = sqlite.prepare(`
          SELECT COUNT(*) as count FROM election_positions WHERE election_id = ?
        `).get(election.id) as { count: number };
        
        if (existingEP.count === 0) {
          for (let i = 0; i < allPositions.length; i++) {
            sqlite.prepare(`
              INSERT INTO election_positions (election_id, position_id, order_index, status, current_scrutiny)
              VALUES (?, ?, ?, ?, ?)
            `).run(election.id, allPositions[i].id, i, i === 0 ? 'active' : 'pending', i === 0 ? election.current_scrutiny : 1);
          }
          console.log(`Created election_positions for election ${election.id}`);
        }
      }
      
      // Now remove current_scrutiny column from elections table
      sqlite.exec("DROP TABLE IF EXISTS elections_new");
      sqlite.exec("PRAGMA foreign_keys = OFF");
      
      sqlite.exec(`
        CREATE TABLE elections_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        
        INSERT INTO elections_new (id, name, is_active, created_at)
        SELECT id, name, is_active, created_at FROM elections;
        
        DROP TABLE elections;
        ALTER TABLE elections_new RENAME TO elections;
      `);
      
      sqlite.exec("PRAGMA foreign_keys = ON");
      console.log("Removed current_scrutiny column from elections table");
    }
    
    // Check and add closed_at column to elections table
    if (!electionsColumnNames.includes('closed_at')) {
      sqlite.exec("ALTER TABLE elections ADD COLUMN closed_at TEXT");
      console.log("Added closed_at column to elections table");
    }

    // Check and add columns to candidates table
    const candidatesColumns = sqlite.prepare("PRAGMA table_info(candidates)").all() as Array<{ name: string }>;
    const candidatesColumnNames = candidatesColumns.map(col => col.name);
    
    if (!candidatesColumnNames.includes('email')) {
      sqlite.exec("ALTER TABLE candidates ADD COLUMN email TEXT NOT NULL DEFAULT ''");
      console.log("Added email column to candidates table");
    }
    if (!candidatesColumnNames.includes('user_id')) {
      sqlite.exec("ALTER TABLE candidates ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0");
      console.log("Added user_id column to candidates table");
    }

    // Check and add columns to votes table
    const votesColumns = sqlite.prepare("PRAGMA table_info(votes)").all() as Array<{ name: string }>;
    const votesColumnNames = votesColumns.map(col => col.name);
    
    if (!votesColumnNames.includes('scrutiny_round')) {
      sqlite.exec("ALTER TABLE votes ADD COLUMN scrutiny_round INTEGER NOT NULL DEFAULT 1");
      console.log("Added scrutiny_round column to votes table");
      
      // Need to recreate UNIQUE constraint to include scrutiny_round
      // SQLite doesn't support dropping constraints, so we need to recreate the table
      sqlite.exec(`
        CREATE TABLE votes_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          voter_id INTEGER NOT NULL,
          candidate_id INTEGER NOT NULL,
          position_id INTEGER NOT NULL,
          election_id INTEGER NOT NULL,
          scrutiny_round INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(voter_id, position_id, election_id, scrutiny_round),
          FOREIGN KEY (voter_id) REFERENCES users(id),
          FOREIGN KEY (candidate_id) REFERENCES candidates(id),
          FOREIGN KEY (position_id) REFERENCES positions(id),
          FOREIGN KEY (election_id) REFERENCES elections(id)
        );
        
        INSERT INTO votes_new (id, voter_id, candidate_id, position_id, election_id, scrutiny_round, created_at)
        SELECT id, voter_id, candidate_id, position_id, election_id, scrutiny_round, created_at FROM votes;
        
        DROP TABLE votes;
        ALTER TABLE votes_new RENAME TO votes;
      `);
      console.log("Recreated votes table with new UNIQUE constraint");
    }

    // Check and add columns to election_attendance table
    const attendanceColumns = sqlite.prepare("PRAGMA table_info(election_attendance)").all() as Array<{ name: string }>;
    const attendanceColumnNames = attendanceColumns.map(col => col.name);
    
    if (!attendanceColumnNames.includes('election_position_id')) {
      sqlite.exec("ALTER TABLE election_attendance ADD COLUMN election_position_id INTEGER REFERENCES election_positions(id)");
      console.log("Added election_position_id column to election_attendance table");
    }

    // Check and add photo_url column to users table
    const usersColumns = sqlite.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const usersColumnNames = usersColumns.map(col => col.name);
    
    if (!usersColumnNames.includes('photo_url')) {
      sqlite.exec("ALTER TABLE users ADD COLUMN photo_url TEXT");
      console.log("Added photo_url column to users table");
    }

    if (!usersColumnNames.includes('birthdate')) {
      sqlite.exec("ALTER TABLE users ADD COLUMN birthdate TEXT");
      console.log("Added birthdate column to users table");
    }

    if (!usersColumnNames.includes('has_password')) {
      sqlite.exec("ALTER TABLE users ADD COLUMN has_password INTEGER NOT NULL DEFAULT 0");
      console.log("Added has_password column to users table");
    }

    if (!usersColumnNames.includes('active_member')) {
      sqlite.exec("ALTER TABLE users ADD COLUMN active_member INTEGER NOT NULL DEFAULT 1");
      console.log("Added active_member column to users table");
    }

    // Check and add is_password_reset column to verification_codes table
    const verificationCodesColumns = sqlite.prepare("PRAGMA table_info(verification_codes)").all() as Array<{ name: string }>;
    const verificationCodesColumnNames = verificationCodesColumns.map(col => col.name);
    
    if (!verificationCodesColumnNames.includes('is_password_reset')) {
      sqlite.exec("ALTER TABLE verification_codes ADD COLUMN is_password_reset INTEGER NOT NULL DEFAULT 0");
      console.log("Added is_password_reset column to verification_codes table");
    }

    // Migration: Remove is_president column if it exists
    if (usersColumnNames.includes('is_president')) {
      console.log("Removing is_president column from users table...");
      sqlite.exec("PRAGMA foreign_keys = OFF");
      
      sqlite.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          full_name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          photo_url TEXT,
          birthdate TEXT,
          has_password INTEGER NOT NULL DEFAULT 0,
          is_admin INTEGER NOT NULL DEFAULT 0,
          is_member INTEGER NOT NULL DEFAULT 1,
          active_member INTEGER NOT NULL DEFAULT 1
        );
        
        INSERT INTO users_new (id, full_name, email, password, photo_url, birthdate, has_password, is_admin, is_member, active_member)
        SELECT id, full_name, email, password, photo_url, birthdate, has_password, is_admin, is_member, COALESCE(active_member, 1) FROM users;
        
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
      
      sqlite.exec("PRAGMA foreign_keys = ON");
      console.log("Removed is_president column from users table");
    }

    // Clean up empty string birthdates (convert to NULL)
    const emptyBirthdatesCount = sqlite.prepare("UPDATE users SET birthdate = NULL WHERE birthdate = ''").run();
    if (emptyBirthdatesCount.changes && emptyBirthdatesCount.changes > 0) {
      console.log(`Cleaned up ${emptyBirthdatesCount.changes} empty birthdate entries`);
    }

    // Migration: Add UNIQUE constraint to candidates table to prevent duplicates
    const candidatesIndexes = sqlite.prepare("PRAGMA index_list(candidates)").all() as Array<{ name: string }>;
    const hasUniqueConstraint = candidatesIndexes.some(idx => idx.name.includes('unique_candidate'));
    
    if (!hasUniqueConstraint) {
      console.log("Adding UNIQUE constraint to candidates table...");
      
      // First, remove any duplicate candidates keeping only the first one (lowest id)
      const duplicates = sqlite.prepare(`
        SELECT user_id, position_id, election_id, MIN(id) as keep_id
        FROM candidates
        GROUP BY user_id, position_id, election_id
        HAVING COUNT(*) > 1
      `).all() as Array<{ user_id: number; position_id: number; election_id: number; keep_id: number }>;
      
      if (duplicates.length > 0) {
        console.log(`Found ${duplicates.length} duplicate candidate sets. Cleaning up...`);
        
        for (const dup of duplicates) {
          // First, find all duplicate candidate IDs that will be deleted
          const duplicateCandidateIds = sqlite.prepare(`
            SELECT id FROM candidates 
            WHERE user_id = ? AND position_id = ? AND election_id = ? AND id != ?
          `).all(dup.user_id, dup.position_id, dup.election_id, dup.keep_id) as Array<{ id: number }>;
          
          if (duplicateCandidateIds.length > 0) {
            const idsToDelete = duplicateCandidateIds.map(c => c.id);
            const placeholders = idsToDelete.map(() => '?').join(',');
            
            // Clean up orphaned votes referencing these duplicate candidates
            const votesDeleted = sqlite.prepare(`
              DELETE FROM votes WHERE candidate_id IN (${placeholders})
            `).run(...idsToDelete);
            
            // Clean up orphaned election_winners referencing these duplicate candidates
            const winnersDeleted = sqlite.prepare(`
              DELETE FROM election_winners WHERE candidate_id IN (${placeholders})
            `).run(...idsToDelete);
            
            console.log(`Cleaned up ${votesDeleted.changes || 0} orphaned votes and ${winnersDeleted.changes || 0} orphaned winners for duplicate candidates`);
          }
          
          // Now safe to delete duplicate candidates (keeping the one with min id)
          sqlite.prepare(`
            DELETE FROM candidates 
            WHERE user_id = ? AND position_id = ? AND election_id = ? AND id != ?
          `).run(dup.user_id, dup.position_id, dup.election_id, dup.keep_id);
        }
        
        console.log("Removed duplicate candidates");
      }
      
      // Now create a new table with the UNIQUE constraint
      sqlite.exec("PRAGMA foreign_keys = OFF");
      sqlite.exec(`
        CREATE TABLE candidates_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL DEFAULT '',
          user_id INTEGER NOT NULL DEFAULT 0,
          position_id INTEGER NOT NULL,
          election_id INTEGER NOT NULL,
          UNIQUE(user_id, position_id, election_id),
          FOREIGN KEY (position_id) REFERENCES positions(id),
          FOREIGN KEY (election_id) REFERENCES elections(id),
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
        
        INSERT INTO candidates_new (id, name, email, user_id, position_id, election_id)
        SELECT id, name, email, user_id, position_id, election_id FROM candidates;
        
        DROP TABLE candidates;
        ALTER TABLE candidates_new RENAME TO candidates;
      `);
      sqlite.exec("PRAGMA foreign_keys = ON");
      console.log("Added UNIQUE constraint to candidates table");
    }
  } catch (error) {
    console.error("Migration error:", error);
  }

  console.log("Creating performance indexes...");
  try {
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_election_attendance_lookup 
        ON election_attendance(election_id, member_id);
      
      CREATE INDEX IF NOT EXISTS idx_election_attendance_position 
        ON election_attendance(election_position_id) WHERE election_position_id IS NOT NULL;
      
      CREATE INDEX IF NOT EXISTS idx_election_positions_status 
        ON election_positions(election_id, status, order_index);
      
      CREATE INDEX IF NOT EXISTS idx_votes_lookup 
        ON votes(election_id, position_id, scrutiny_round);
      
      CREATE INDEX IF NOT EXISTS idx_votes_candidate 
        ON votes(candidate_id);
      
      CREATE INDEX IF NOT EXISTS idx_election_winners_lookup 
        ON election_winners(election_id, position_id);
      
      CREATE INDEX IF NOT EXISTS idx_candidates_position 
        ON candidates(position_id, election_id);
      
      CREATE INDEX IF NOT EXISTS idx_candidates_user 
        ON candidates(user_id, election_id);
    `);
    console.log("Performance indexes created successfully");
  } catch (error) {
    console.error("Index creation error:", error);
  }

  const fixedPositions = [
    "Presidente",
    "Vice-Presidente", 
    "1º Secretário",
    "2º Secretário",
    "Tesoureiro"
  ];

  const existingPositions = sqlite.prepare("SELECT COUNT(*) as count FROM positions").get() as { count: number };

  if (existingPositions.count === 0) {
    console.log("Initializing fixed positions...");
    const insertPosition = sqlite.prepare("INSERT INTO positions (name) VALUES (?)");
    
    for (const position of fixedPositions) {
      insertPosition.run(position);
    }
    
    console.log(`Created ${fixedPositions.length} fixed positions`);
  }

  // Create default admin user if it doesn't exist
  const adminEmail = "marketingumpemaus@gmail.com";
  const existingAdmin = sqlite.prepare("SELECT * FROM users WHERE email = ?").get(adminEmail);
  
  if (!existingAdmin) {
    console.log("Creating default admin user...");
    const defaultPassword = await hashPassword("umpemaus2025");
    
    sqlite.prepare(`
      INSERT INTO users (full_name, email, password, has_password, is_admin, is_member)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("UMP Emaús", adminEmail, defaultPassword, 1, 1, 1);
    
    console.log(`Created admin user: ${adminEmail}`);
    console.log("Default password: umpemaus2025 (please change after first login)");
  }

  console.log("Database initialized successfully");
}
