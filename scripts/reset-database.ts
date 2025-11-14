import Database from "better-sqlite3";
import path from "path";
import { hashPassword } from "../server/auth";

const dbPath = path.join(process.cwd(), "data", "emaus-vota.db");
const db = new Database(dbPath);

async function resetDatabase() {
  console.log("=== Examinando banco de dados atual ===\n");
  
  // Lista todas as tabelas
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as Array<{ name: string }>;
  
  console.log("Tabelas encontradas:");
  tables.forEach(t => console.log(`  - ${t.name}`));
  
  // Conta registros em cada tabela
  console.log("\nContagem de registros:");
  for (const table of tables) {
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get() as { count: number };
    console.log(`  ${table.name}: ${count.count} registros`);
  }
  
  console.log("\n=== Limpando todos os dados ===\n");
  
  // Desabilita foreign keys temporariamente para facilitar a limpeza
  db.exec("PRAGMA foreign_keys = OFF");
  
  // Limpa todas as tabelas (exceto sqlite_sequence que é uma tabela do sistema)
  for (const table of tables) {
    console.log(`Limpando tabela: ${table.name}`);
    db.prepare(`DELETE FROM ${table.name}`).run();
  }
  
  // Reseta os autoincrement
  db.exec("DELETE FROM sqlite_sequence");
  
  // Reabilita foreign keys
  db.exec("PRAGMA foreign_keys = ON");
  
  console.log("\n=== Recriando dados essenciais ===\n");
  
  // Recria as posições fixas
  const fixedPositions = [
    "Presidente",
    "Vice-Presidente", 
    "1º Secretário",
    "2º Secretário",
    "Tesoureiro"
  ];
  
  console.log("Criando posições fixas...");
  const insertPosition = db.prepare("INSERT INTO positions (name) VALUES (?)");
  for (const position of fixedPositions) {
    insertPosition.run(position);
  }
  console.log(`✓ Criadas ${fixedPositions.length} posições`);
  
  // Cria o usuário administrador
  console.log("\nCriando usuário administrador...");
  const adminEmail = "marketingumpemaus@gmail.com";
  const adminPassword = "reRe@@3131*#$";
  const hashedPassword = await hashPassword(adminPassword);
  
  db.prepare(`
    INSERT INTO users (full_name, email, password, has_password, is_admin, is_member, active_member)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run("Administrador UMP Emaús", adminEmail, hashedPassword, 1, 1, 1, 1);
  
  console.log(`✓ Usuário administrador criado:`);
  console.log(`  Email: ${adminEmail}`);
  console.log(`  Senha: ${adminPassword}`);
  
  console.log("\n=== Verificação final ===\n");
  
  // Verifica o estado final
  for (const table of tables) {
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get() as { count: number };
    console.log(`  ${table.name}: ${count.count} registros`);
  }
  
  console.log("\n✓ Banco de dados resetado com sucesso!");
  console.log("✓ Sistema pronto para uso real!");
  
  db.close();
}

resetDatabase().catch(console.error);
