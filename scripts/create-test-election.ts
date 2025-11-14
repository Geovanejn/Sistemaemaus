import Database from "better-sqlite3";
import { join } from "path";

const dbPath = join(process.cwd(), "data", "emaus-vota.db");
const db = new Database(dbPath);

console.log("Criando nova eleição de teste...");

// Create election
const electionResult = db.prepare(`
  INSERT INTO elections (name, is_active, created_at, closed_at)
  VALUES (?, ?, ?, ?)
`).run(
  "Eleição 2025/2026",
  0, // Not active (finalized)
  new Date().toISOString(),
  new Date().toISOString()
);

const electionId = electionResult.lastInsertRowid as number;
console.log(`✅ Eleição criada: ID ${electionId}`);

// Get positions
const positions = db.prepare("SELECT * FROM positions ORDER BY id").all() as any[];
console.log(`✅ ${positions.length} cargos encontrados`);

// Get members (excluding admin)
const members = db.prepare("SELECT * FROM users WHERE is_member = 1 AND is_admin = 0").all() as any[];
console.log(`✅ ${members.length} membros encontrados`);

if (members.length < 2) {
  console.error("❌ Não há membros suficientes. Execute scripts/seed-test-data.ts primeiro");
  process.exit(1);
}

// Create election positions
positions.forEach((position, index) => {
  db.prepare(`
    INSERT INTO election_positions (election_id, position_id, order_index, status, current_scrutiny)
    VALUES (?, ?, ?, ?, ?)
  `).run(electionId, position.id, index, "completed", 1);
});

console.log("✅ Cargos adicionados à eleição");

// For each position, add 2-3 candidates and create a winner
positions.forEach((position) => {
  // Pick random candidates for this position
  const numCandidates = 2 + Math.floor(Math.random() * 2); // 2 or 3 candidates
  const selectedMembers = [...members]
    .sort(() => Math.random() - 0.5)
    .slice(0, numCandidates);

  selectedMembers.forEach((member) => {
    db.prepare(`
      INSERT INTO candidates (election_id, position_id, user_id, name, email)
      VALUES (?, ?, ?, ?, ?)
    `).run(electionId, position.id, member.id, member.full_name, member.email);
  });

  // Pick winner (first candidate)
  const winner = selectedMembers[0];
  const candidateResult = db.prepare(`
    SELECT id FROM candidates 
    WHERE election_id = ? AND position_id = ? AND user_id = ?
  `).get(electionId, position.id, winner.id) as any;

  if (candidateResult) {
    // Create votes for the winner
    const voteCount = 5 + Math.floor(Math.random() * 5); // 5-9 votes
    for (let i = 0; i < voteCount; i++) {
      const voter = members[i % members.length];
      db.prepare(`
        INSERT INTO votes (election_id, position_id, candidate_id, voter_id, scrutiny_round)
        VALUES (?, ?, ?, ?, ?)
      `).run(electionId, position.id, candidateResult.id, voter.id, 1);
    }

    // Register winner
    db.prepare(`
      INSERT INTO election_winners (election_id, position_id, candidate_id, won_at_scrutiny)
      VALUES (?, ?, ?, ?)
    `).run(electionId, position.id, candidateResult.id, 1);

    console.log(`✅ ${position.name}: ${winner.full_name} (${voteCount} votos)`);
  }
});

console.log("\n🎉 Eleição de teste criada com sucesso!");
console.log(`📊 Nome: Eleição 2025/2026`);
console.log(`✅ Status: Finalizada`);
console.log(`👥 ${positions.length} cargos com vencedores definidos`);
console.log("\nAcesse o histórico no painel admin para ver os resultados!");

db.close();
