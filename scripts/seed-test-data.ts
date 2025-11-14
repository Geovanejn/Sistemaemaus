import Database from "better-sqlite3";
import { join } from "path";

const db = new Database(join(process.cwd(), "data", "emaus-vota.db"));

// Criar 10 membros de teste
console.log("Criando 10 membros de teste...");
const insertUser = db.prepare(`
  INSERT INTO users (full_name, email, password, is_admin, is_member) 
  VALUES (?, ?, '', 0, 1)
`);

const testMembers = [
  { name: 'Ana Paula Santos', email: 'ana.santos@example.com' },
  { name: 'Bruno Costa Silva', email: 'bruno.silva@example.com' },
  { name: 'Carla Mendes Oliveira', email: 'carla.oliveira@example.com' },
  { name: 'Daniel Ferreira Lima', email: 'daniel.lima@example.com' },
  { name: 'Elena Rodrigues Souza', email: 'elena.souza@example.com' },
  { name: 'Felipe Alves Pereira', email: 'felipe.pereira@example.com' },
  { name: 'Gabriela Martins Costa', email: 'gabriela.costa@example.com' },
  { name: 'Henrique Santos Rocha', email: 'henrique.rocha@example.com' },
  { name: 'Isabela Fernandes Dias', email: 'isabela.dias@example.com' },
  { name: 'João Pedro Carvalho', email: 'joao.carvalho@example.com' }
];

for (const member of testMembers) {
  try {
    insertUser.run(member.name, member.email);
    console.log(`✓ Criado: ${member.name}`);
  } catch (e) {
    console.log(`- Já existe: ${member.name}`);
  }
}

// Buscar todos os membros
const members = db.prepare("SELECT * FROM users WHERE is_member = 1 ORDER BY id").all() as any[];
console.log(`\nTotal de membros: ${members.length}`);

// Criar eleição 2024/2025
console.log("\nCriando eleição 2024/2025...");
const insertElection = db.prepare(`
  INSERT INTO elections (name, is_active) 
  VALUES ('Eleição 2024/2025', 0)
`);

let electionId: number;
try {
  const result = insertElection.run();
  electionId = result.lastInsertRowid as number;
  console.log(`✓ Eleição criada com ID: ${electionId}`);
} catch (e) {
  // Se já existe, buscar ID
  const existing = db.prepare("SELECT id FROM elections WHERE name = 'Eleição 2024/2025'").get() as any;
  electionId = existing.id;
  console.log(`- Eleição já existe com ID: ${electionId}`);
}

// Buscar posições
const positions = db.prepare("SELECT * FROM positions ORDER BY id").all() as any[];
console.log(`\nCriando election_positions para ${positions.length} cargos...`);

for (const position of positions) {
  try {
    db.prepare(`
      INSERT INTO election_positions (election_id, position_id, status, current_scrutiny, order_index) 
      VALUES (?, ?, 'completed', 1, ?)
    `).run(electionId, position.id, position.id);
    console.log(`✓ Cargo ${position.name} adicionado`);
  } catch (e) {
    console.log(`- Cargo ${position.name} já existe`);
  }
}

// Criar candidatos e votos para cada cargo
console.log("\nCriando candidatos e votos...");
const insertCandidate = db.prepare(`
  INSERT INTO candidates (user_id, election_id, position_id, name, email) 
  VALUES (?, ?, ?, ?, ?)
`);

const insertVote = db.prepare(`
  INSERT INTO votes (voter_id, candidate_id, position_id, election_id, scrutiny_round) 
  VALUES (?, ?, ?, ?, 1)
`);

const insertWinner = db.prepare(`
  INSERT INTO election_winners (election_id, position_id, candidate_id, won_at_scrutiny) 
  VALUES (?, ?, ?, 1)
`);

// Para cada cargo, criar 2-3 candidatos
for (let posIdx = 0; posIdx < positions.length && posIdx < 5; posIdx++) {
  const position = positions[posIdx];
  console.log(`\n${position.name}:`);
  
  // Selecionar 3 membros como candidatos para este cargo
  const candidatesForPosition = members.slice(posIdx * 2, posIdx * 2 + 3);
  const candidateIds: number[] = [];
  
  for (const member of candidatesForPosition) {
    try {
      const result = insertCandidate.run(member.id, electionId, position.id, member.full_name, member.email);
      const candidateId = result.lastInsertRowid as number;
      candidateIds.push(candidateId);
      console.log(`  ✓ Candidato: ${member.full_name}`);
    } catch (e) {
      // Se já existe, buscar ID
      const existing = db.prepare(
        "SELECT id FROM candidates WHERE user_id = ? AND election_id = ? AND position_id = ?"
      ).get(member.id, electionId, position.id) as any;
      if (existing) candidateIds.push(existing.id);
    }
  }
  
  // Criar votos distribuídos entre os candidatos
  // O primeiro candidato recebe mais votos para ganhar
  if (candidateIds.length > 0) {
    const winnerId = candidateIds[0];
    let voterIdx = 0;
    
    // Votos para o vencedor (60% dos membros)
    const winnerVotes = Math.ceil(members.length * 0.6);
    for (let i = 0; i < winnerVotes && voterIdx < members.length; i++) {
      try {
        insertVote.run(members[voterIdx].id, winnerId, position.id, electionId);
        voterIdx++;
      } catch (e) {}
    }
    
    // Votos distribuídos para outros candidatos
    for (let cidx = 1; cidx < candidateIds.length; cidx++) {
      const votesForThis = Math.floor(members.length * 0.15);
      for (let i = 0; i < votesForThis && voterIdx < members.length; i++) {
        try {
          insertVote.run(members[voterIdx].id, candidateIds[cidx], position.id, electionId);
          voterIdx++;
        } catch (e) {}
      }
    }
    
    // Marcar vencedor
    try {
      insertWinner.run(electionId, position.id, winnerId);
      const winner = candidatesForPosition[0];
      console.log(`  🏆 Vencedor: ${winner.full_name}`);
    } catch (e) {}
  }
}

// Finalizar eleição
console.log("\nFinalizando eleição...");
db.prepare(`
  UPDATE elections 
  SET is_active = 0, closed_at = datetime('now') 
  WHERE id = ?
`).run(electionId);

console.log("✅ Dados de teste criados com sucesso!");
console.log("\nResumo:");
console.log(`- ${members.length} membros cadastrados`);
console.log(`- 1 eleição completa (2024/2025) com todos os cargos decididos`);
console.log(`- Eleição finalizada e disponível no histórico`);

db.close();
