import { hashPassword } from "../server/auth";

async function createAdminUser() {
  const email = "marketingumpemaus@gmail.com";
  const password = "reRe@@3131*#$";
  
  console.log("Gerando hash da senha...");
  const hashedPassword = await hashPassword(password);
  
  console.log("\n=== Dados do Usuário Administrador ===");
  console.log(`Email: ${email}`);
  console.log(`Senha: ${password}`);
  console.log(`Hash: ${hashedPassword}`);
  
  // Criar SQL para inserir no D1
  const sql = `INSERT INTO users (full_name, email, password, has_password, is_admin, is_member, active_member) VALUES ('Administrador UMP Emaús', '${email}', '${hashedPassword}', 1, 1, 1, 1);`;
  
  console.log("\n=== SQL para D1 ===");
  console.log(sql);
  
  // Criar JSON para API do Cloudflare
  const apiPayload = {
    sql: sql
  };
  
  console.log("\n=== JSON Payload (copie para uso) ===");
  console.log(JSON.stringify(apiPayload));
}

createAdminUser().catch(console.error);
