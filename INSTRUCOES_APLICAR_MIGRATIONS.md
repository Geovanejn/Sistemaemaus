# 🔄 Instruções: Como Aplicar Migrations D1

Este documento explica **passo a passo** como aplicar migrations no D1 Database.

---

## 📋 O Que São Migrations?

Migrations são **scripts SQL** que criam e modificam a estrutura do banco de dados (tabelas, colunas, índices, etc).

**Por que usar migrations?**
- ✅ Controle de versão do banco de dados
- ✅ Mesma estrutura em dev e produção
- ✅ Histórico de mudanças rastreável
- ✅ Rollback possível (voltar para versão anterior)

---

## 📁 Onde Ficam as Migrations?

**Diretório:** `/migrations/`

**Estrutura atual:**
```
migrations/
├── 0000_loose_prima.sql    # Migration inicial (10 tabelas)
└── meta/
    └── _journal.json        # Histórico de migrations
```

**Arquivo de migration:**
- Nome automático: `XXXX_<nome-aleatório>.sql`
- Contém comandos SQL (`CREATE TABLE`, `ALTER TABLE`, etc)

---

## 🛠️ Como Gerar Novas Migrations

### Passo 1: Modificar o Schema
Edite o arquivo `/shared/schema-worker.ts`:

```typescript
// Exemplo: Adicionar nova coluna
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  // ... outras colunas ...
  phoneNumber: text("phone_number"),  // ← NOVA COLUNA
});
```

### Passo 2: Gerar Migration
Execute o comando:

```bash
npx drizzle-kit generate --config=drizzle.config.worker.ts
```

**Output esperado:**
```
[✓] Your SQL migration file ➜ migrations/0001_nova_migration.sql 🚀
```

### Passo 3: Revisar a Migration
Abra o arquivo gerado em `/migrations/0001_nova_migration.sql`:

```sql
-- Migration gerada automaticamente
ALTER TABLE `users` ADD COLUMN `phone_number` text;
```

**⚠️ IMPORTANTE:** Sempre revise a migration antes de aplicar!

---

## 🚀 Como Aplicar Migrations

### Ambiente LOCAL (Desenvolvimento)

**Comando:**
```bash
npm run db:migrate:local
```

**Ou usando wrangler diretamente:**
```bash
npx wrangler d1 migrations apply emaus-vota-db --local
```

**O que acontece:**
1. Wrangler lê as migrations em `/migrations/`
2. Aplica no banco local (`.wrangler/state/v3/d1/`)
3. Atualiza o histórico de migrations

**Output esperado:**
```
 ⛅️ wrangler 4.48.0
───────────────────
Resource location: local 

Migrations to be applied:
┌──────────────────────────┐
│ name                     │
├──────────────────────────┤
│ 0001_nova_migration.sql  │
└──────────────────────────┘

? About to apply 1 migration(s)
  Your database may not be available during migration, continue? › yes

🚣 3 commands executed successfully
┌──────────────────────────┬────────┐
│ name                     │ status │
├──────────────────────────┼────────┤
│ 0001_nova_migration.sql  │ ✅     │
└──────────────────────────┴────────┘
```

---

### Ambiente PRODUÇÃO (Cloudflare)

**⚠️ ATENÇÃO:** Sempre teste localmente ANTES de aplicar em produção!

**Comando:**
```bash
npm run db:migrate
```

**Ou usando wrangler diretamente:**
```bash
npx wrangler d1 migrations apply emaus-vota-db --remote
```

**O que acontece:**
1. Wrangler se conecta ao D1 na Cloudflare
2. Aplica as migrations remotamente
3. Banco de dados pode ficar indisponível por alguns segundos

**Output esperado:**
```
 ⛅️ wrangler 4.48.0
───────────────────
Resource location: remote 

Migrations to be applied:
┌──────────────────────────┐
│ name                     │
├──────────────────────────┤
│ 0001_nova_migration.sql  │
└──────────────────────────┘

? About to apply 1 migration(s)
  Your database may not be available during migration, continue? › yes

🚣 Executed 3 commands in 1.82ms
┌──────────────────────────┬────────┐
│ name                     │ status │
├──────────────────────────┼────────┤
│ 0001_nova_migration.sql  │ ✅     │
└──────────────────────────┴────────┘
```

---

## 🔍 Como Verificar Migrations Aplicadas

### Listar Migrations Executadas

**Comando:**
```bash
npx wrangler d1 migrations list emaus-vota-db --local
```

**Output:**
```
┌──────────────────────┬─────────────────────┐
│ name                 │ applied_at          │
├──────────────────────┼─────────────────────┤
│ 0000_loose_prima.sql │ 2025-11-14 15:06:46 │
└──────────────────────┴─────────────────────┘
```

---

## 📊 Como Consultar o Banco D1

### Executar Query SQL

**Local:**
```bash
npx wrangler d1 execute emaus-vota-db --local --command="SELECT * FROM users"
```

**Produção:**
```bash
npx wrangler d1 execute emaus-vota-db --remote --command="SELECT * FROM users"
```

### Ver Estrutura da Tabela

```bash
npx wrangler d1 execute emaus-vota-db --local --command="PRAGMA table_info(users)"
```

**Output:**
```
┌─────┬──────────────┬──────┬─────────┬─────────────┬────┐
│ cid │ name         │ type │ notnull │ dflt_value  │ pk │
├─────┼──────────────┼──────┼─────────┼─────────────┼────┤
│ 0   │ id           │ INTEGER │ 1    │             │ 1  │
│ 1   │ full_name    │ TEXT    │ 1    │             │ 0  │
│ 2   │ email        │ TEXT    │ 1    │             │ 0  │
│ 3   │ password     │ TEXT    │ 1    │             │ 0  │
└─────┴──────────────┴──────┴─────────┴─────────────┴────┘
```

---

## 🐛 Troubleshooting

### Erro: "Migration already applied"

**Causa:** Você tentou aplicar uma migration que já foi aplicada.

**Solução:** 
```bash
# Ver quais migrations já foram aplicadas
npx wrangler d1 migrations list emaus-vota-db --local
```

### Erro: "Database is locked"

**Causa:** Outro processo está usando o banco.

**Solução:**
1. Pare o Worker: `Ctrl+C` no terminal rodando `npm run dev:worker`
2. Tente novamente

### Erro: "No migrations to apply"

**Causa:** Não há migrations pendentes.

**Solução:**
- Gere uma nova migration: `npx drizzle-kit generate --config=drizzle.config.worker.ts`

### Migration Falhou - Como Reverter?

**⚠️ D1 não tem rollback automático!**

**Solução manual:**
1. Escrever SQL para reverter manualmente:
   ```sql
   ALTER TABLE users DROP COLUMN phone_number;
   ```
2. Executar:
   ```bash
   npx wrangler d1 execute emaus-vota-db --local --command="ALTER TABLE users DROP COLUMN phone_number"
   ```

**Melhor prática:** SEMPRE teste localmente antes de aplicar em produção!

---

## 📋 Checklist de Migration

Antes de aplicar uma migration em produção:

- [ ] 1. Schema modificado em `/shared/schema-worker.ts`
- [ ] 2. Migration gerada: `npx drizzle-kit generate --config=drizzle.config.worker.ts`
- [ ] 3. Migration revisada (arquivo `.sql` está correto)
- [ ] 4. Migration aplicada localmente: `npm run db:migrate:local`
- [ ] 5. Testado localmente: `npm run dev:worker`
- [ ] 6. Verificado que funciona: queries, inserts, etc
- [ ] 7. **SÓ ENTÃO** aplicar em produção: `npm run db:migrate`

---

## 🔧 Comandos Úteis

### Desenvolvimento Local

```bash
# Aplicar migrations localmente
npm run db:migrate:local

# Ver tabelas
npx wrangler d1 execute emaus-vota-db --local --command="SELECT name FROM sqlite_master WHERE type='table'"

# Contar registros
npx wrangler d1 execute emaus-vota-db --local --command="SELECT COUNT(*) FROM users"

# Limpar banco local (CUIDADO!)
rm -rf .wrangler/state/v3/d1/
npm run db:migrate:local  # Reaplicar todas as migrations
```

### Produção

```bash
# Aplicar migrations em produção
npm run db:migrate

# Listar migrations aplicadas
npx wrangler d1 migrations list emaus-vota-db --remote

# Executar query
npx wrangler d1 execute emaus-vota-db --remote --command="SELECT COUNT(*) FROM users"
```

---

## 📚 Estrutura da Migration Atual

### Migration: `0000_loose_prima.sql`

**Criada em:** 2025-11-14  
**Comandos:** 15  
**Tabelas criadas:** 10

**Tabelas:**
1. **users** - Usuários e membros do sistema
2. **positions** - Cargos/posições fixas (Presidente, Secretário, etc)
3. **elections** - Eleições criadas
4. **election_positions** - Posições em cada eleição
5. **election_attendance** - Presença de membros em votações
6. **election_winners** - Vencedores de cada posição
7. **candidates** - Candidatos em eleições
8. **votes** - Votos registrados (3 escrutínios)
9. **verification_codes** - Códigos de verificação de email
10. **pdf_verifications** - Hashes de verificação de PDFs

**Índices únicos criados:**
- `users.email` - Email único
- `positions.name` - Nome de cargo único
- `candidates(user_id, position_id, election_id)` - Evita candidaturas duplicadas
- `pdf_verifications.verification_hash` - Hash único para PDFs

**Foreign Keys criadas:**
- Total: 13 foreign keys
- Garantem integridade referencial entre tabelas

---

**Data:** 2025-11-14  
**Versão:** 1.0  
**Próxima atualização:** Quando houver mudanças no schema
