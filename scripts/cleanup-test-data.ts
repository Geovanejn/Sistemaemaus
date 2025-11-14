import Database from "better-sqlite3";
import { join } from "path";

const dbPath = join(process.cwd(), "data", "emaus-vota.db");
const db = new Database(dbPath);

console.log("🧹 Limpando dados de teste...\n");

try {
  db.exec("BEGIN TRANSACTION");

  const testElectionNames = ["Eleição 2024/2025", "Eleição 2025/2026"];
  const testEmailDomains = ["@example.com", "@teste.com"];

  const elections = db.prepare(`
    SELECT id, name FROM elections 
    WHERE name IN (${testElectionNames.map(() => '?').join(',')})
  `).all(...testElectionNames) as any[];

  if (elections.length > 0) {
    console.log(`📋 Encontradas ${elections.length} eleições de teste:`);
    elections.forEach(e => console.log(`   - ${e.name} (ID: ${e.id})`));

    for (const election of elections) {
      console.log(`\n🗑️  Removendo eleição "${election.name}"...`);
      
      db.prepare("DELETE FROM votes WHERE election_id = ?").run(election.id);
      console.log("   ✓ Votos removidos");
      
      db.prepare("DELETE FROM election_winners WHERE election_id = ?").run(election.id);
      console.log("   ✓ Vencedores removidos");
      
      db.prepare("DELETE FROM candidates WHERE election_id = ?").run(election.id);
      console.log("   ✓ Candidatos removidos");
      
      db.prepare("DELETE FROM election_positions WHERE election_id = ?").run(election.id);
      console.log("   ✓ Cargos da eleição removidos");
      
      db.prepare("DELETE FROM election_attendance WHERE election_id = ?").run(election.id);
      console.log("   ✓ Presenças removidas");
      
      db.prepare("DELETE FROM elections WHERE id = ?").run(election.id);
      console.log("   ✓ Eleição removida");
    }
  } else {
    console.log("✅ Nenhuma eleição de teste encontrada");
  }

  const testUsers = db.prepare(`
    SELECT id, full_name, email FROM users 
    WHERE ${testEmailDomains.map(() => 'email LIKE ?').join(' OR ')}
  `).all(...testEmailDomains.map(domain => `%${domain}`)) as any[];

  if (testUsers.length > 0) {
    console.log(`\n👤 Encontrados ${testUsers.length} usuários de teste:`);
    testUsers.forEach(u => console.log(`   - ${u.full_name} (${u.email})`));
    
    const userIds = testUsers.map(u => u.id);
    
    db.prepare(`
      DELETE FROM verification_codes 
      WHERE email IN (${testUsers.map(() => '?').join(',')})
    `).run(...testUsers.map(u => u.email));
    console.log("   ✓ Códigos de verificação removidos");
    
    db.prepare(`
      DELETE FROM users 
      WHERE id IN (${userIds.map(() => '?').join(',')})
    `).run(...userIds);
    console.log("   ✓ Usuários de teste removidos");
  } else {
    console.log("\n✅ Nenhum usuário de teste encontrado");
  }

  db.exec("COMMIT");
  console.log("\n✅ Limpeza concluída com sucesso!");
  
  const remainingElections = db.prepare("SELECT COUNT(*) as count FROM elections").get() as any;
  const remainingUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE is_member = 1").get() as any;
  
  console.log("\n📊 Estado atual do banco de dados:");
  console.log(`   - ${remainingElections.count} eleições`);
  console.log(`   - ${remainingUsers.count} membros`);

} catch (error) {
  db.exec("ROLLBACK");
  console.error("\n❌ Erro durante a limpeza:", error);
  throw error;
} finally {
  db.close();
}
