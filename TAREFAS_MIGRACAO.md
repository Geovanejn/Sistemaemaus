# 📋 Tarefas de Migração - Critérios Detalhados

Este documento define **critérios de aceitação** detalhados para cada tarefa da migração.

---

## ✅ Tarefa 1: Criar Documentação

**Objetivo**: Documentação completa e detalhada da migração

**Pré-requisitos**: Nenhum

**Ações**:
- [x] Criar INSTRUCOES_CLOUDFLARE_SETUP.md
- [x] Criar DIARIO_MIGRACAO.md
- [x] Criar TAREFAS_MIGRACAO.md (este arquivo)
- [x] Criar templates de código

**Critérios de Aceitação**:
- [ ] Todos os arquivos MD criados
- [ ] Índice completo em INSTRUCOES
- [ ] Exemplos de código copy-paste ready
- [ ] Troubleshooting documentado
- [ ] Checklist de verificação

**Verificação**:
```bash
ls -l INSTRUCOES_CLOUDFLARE_SETUP.md
ls -l DIARIO_MIGRACAO.md
ls -l TAREFAS_MIGRACAO.md
```

**Status**: ✅ CONCLUÍDO

---

## 📦 Tarefa 2: Instalar Dependências

**Objetivo**: Instalar todas as dependências Cloudflare Workers

**Pré-requisitos**: Node.js 18+ instalado

**⚠️ IMPORTANTE**: Apenas dependências compatíveis com Workers!

**Ações**:
```bash
# Produção - APENAS Workers-compatible
npm install hono
npm install drizzle-orm@latest

# Desenvolvimento
npm install --save-dev wrangler @cloudflare/workers-types
npm install --save-dev drizzle-kit@latest
npm install --save-dev @types/node@latest
```

**❌ NÃO INSTALE** (incompatíveis com Workers):
```bash
# ❌ ERRADO - Node.js only!
npm install @hono/node-server express

# ❌ ERRADO - Não funciona em Workers!
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

# ❌ ERRADO - Não necessário
npm install bcryptjs jsonwebtoken
```

**Atualizar .gitignore**:
```gitignore
# Cloudflare
.wrangler/
.dev.vars
wrangler.toml.local
.mf/

# Local development  
data/*.db
dist-worker/
```

**Critérios de Aceitação**:
- [ ] package.json contém todas as dependências
- [ ] `node_modules` instalado sem erros
- [ ] .gitignore atualizado
- [ ] TypeScript compila sem erros: `npx tsc --noEmit`

**Verificação**:
```bash
npm list hono wrangler @cloudflare/workers-types
git status .gitignore
npx tsc --noEmit
```

**Status**: ⏳ PENDENTE

---

## ⚙️ Tarefa 3: Configurar wrangler.toml

**Objetivo**: Criar e configurar wrangler.toml completo

**Pré-requisitos**: 
- Tarefa 2 concluída
- Conta Cloudflare criada
- `wrangler login` executado

**Ações**:

1. **Login Cloudflare**:
```bash
npx wrangler login
```

2. **Criar D1 Database**:
```bash
npx wrangler d1 create emaus-vota-db
# ANOTAR o database_id retornado!
```

3. **Criar R2 Bucket**:
```bash
npx wrangler r2 bucket create emaus-vota-storage
```

4. **Criar wrangler.toml** (arquivo completo já disponível nos docs)

5. **Configurar secrets**:
```bash
npx wrangler secret put RESEND_API_KEY
# Cole: re_xxxxxxxxxxxxx

npx wrangler secret put SESSION_SECRET
# Cole: [string aleatória de 32+ chars]
```

**Critérios de Aceitação**:
- [ ] `wrangler.toml` existe e está configurado
- [ ] `database_id` correto no wrangler.toml
- [ ] Secrets configurados: `wrangler secret list`
- [ ] Teste local funciona: `wrangler dev` (mesmo sem código)

**Verificação**:
```bash
ls -l wrangler.toml
wrangler secret list
wrangler dev --test-scheduled  # Testar que inicia
```

**Status**: ⏳ PENDENTE

---

## 🗃️ Tarefa 4: Criar schema-worker.ts

**Objetivo**: Adaptar schema atual para Cloudflare Workers (Web Crypto API)

**Pré-requisitos**: Tarefa 2 e 3 concluídas

**Ações**:

1. **Criar `shared/schema-worker.ts`** (copiar de schema.ts e adaptar)

2. **Principais mudanças**:
   - `crypto.createHash()` → `crypto.subtle.digest()`
   - Funções síncronas → assíncronas
   - `Buffer` → `Uint8Array`

3. **Atualizar `drizzle.config.ts`** para D1:
```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./shared/schema-worker.ts",
  out: "./migrations",
  dialect: "sqlite",
  driver: "d1-http",
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    token: process.env.CLOUDFLARE_API_TOKEN!,
  },
});
```

**Critérios de Aceitação**:
- [ ] `shared/schema-worker.ts` existe
- [ ] Todas as tabelas migradas
- [ ] `getGravatarUrl()` usa Web Crypto API
- [ ] `generatePdfVerificationHash()` usa Web Crypto API
- [ ] TypeScript compila: `npx tsc --noEmit`
- [ ] Drizzle gera migration: `npx drizzle-kit generate`

**Verificação**:
```bash
ls -l shared/schema-worker.ts
npx tsc --noEmit
npx drizzle-kit generate
ls -l migrations/
```

**Status**: ⏳ PENDENTE

---

## 💾 Tarefa 5: Criar D1Storage

**Objetivo**: Implementar camada de storage para D1 Database

**Pré-requisitos**: Tarefa 4 concluída

**Ações**:

1. **Criar `workers/storage-d1.ts`**

2. **Implementar interface IStorage**:
   - Todos os métodos devem ser **assíncronos**
   - Usar `drizzle-orm/d1`
   - Manter compatibilidade com storage atual

3. **Exemplo de método**:
```typescript
async getUser(id: number): Promise<User | undefined> {
  return this.db.query.users.findFirst({
    where: eq(schema.users.id, id),
  });
}
```

**Critérios de Aceitação**:
- [ ] `workers/storage-d1.ts` existe
- [ ] Todos os métodos de IStorage implementados
- [ ] Código TypeScript sem erros
- [ ] Testes unitários básicos passam
- [ ] Compatível com rotas atuais

**Verificação**:
```bash
ls -l workers/storage-d1.ts
npx tsc --noEmit
npm test workers/storage-d1.test.ts  # Se houver
```

**Status**: ⏳ PENDENTE

---

## 📸 Tarefa 6: Criar R2Storage

**Objetivo**: Implementar storage de fotos com R2 (binding nativo)

**Pré-requisitos**: Tarefa 3 concluída

**⚠️ IMPORTANTE**: Usar R2 binding nativo, NÃO AWS SDK!

**Ações**:

1. **Criar `workers/storage-r2.ts`**

2. **Implementar métodos usando binding nativo**:
```typescript
// ✅ CORRETO
await env.STORAGE.put(key, arrayBuffer, { httpMetadata: {...} });
const object = await env.STORAGE.get(key);
await env.STORAGE.delete(key);

// ❌ ERRADO - Não usar!
// import { S3Client } from '@aws-sdk/client-s3';
```

3. **Implementar métodos**:
   - `uploadPhoto(userId, fileData, contentType)` → retorna key
   - `getPhoto(key)` → retorna R2ObjectBody
   - `deletePhoto(key)` → void
   - `getPhotoUrl(key)` → URL pública
   - `servePhoto(c, key)` → Response (rota Worker)

4. **Configurar domínio público no R2** (via dashboard Cloudflare):
   - Settings → R2 → Bucket → Public Access
   - Ou usar rota Worker para servir fotos

**Critérios de Aceitação**:
- [ ] `workers/storage-r2.ts` existe
- [ ] ✅ USA binding nativo (env.STORAGE.put/get/delete)
- [ ] ❌ NÃO usa AWS SDK
- [ ] Upload de foto funciona (ArrayBuffer)
- [ ] Download de foto funciona
- [ ] Delete de foto funciona
- [ ] URLs públicas funcionam OU rota Worker funciona
- [ ] CORS configurado (se usando domínio público)

**Verificação** (CHECKLIST OBRIGATÓRIO - 6 testes):

```bash
# Pré-verificação
ls -l workers/storage-r2.ts
grep -n "@aws-sdk" workers/storage-r2.ts  # ❌ NÃO deve encontrar!
grep -n "bucket.put\|bucket.get" workers/storage-r2.ts  # ✅ Deve encontrar!

# 1. Iniciar wrangler dev
wrangler dev

# 2. ✅ Teste UPLOAD
curl -X POST http://localhost:8787/api/admin/upload-test \
  -F "photo=@test.jpg" \
  -H "Authorization: Bearer TOKEN"
# Esperado: {"photoKey": "photos/1-1234567890.jpg"}

# 3. ✅ Teste GET (via Worker route)
curl http://localhost:8787/photos/photos/1-1234567890.jpg \
  -o downloaded.jpg
# Esperado: Foto baixada com sucesso
# Verificar: file downloaded.jpg  # Deve ser JPEG

# 4. ✅ Verificar R2 via CLI
wrangler r2 object get emaus-vota-storage photos/1-1234567890.jpg \
  --local > cli-download.jpg
# Esperado: Arquivo salvo com sucesso

# 5. ✅ Teste DELETE
curl -X DELETE http://localhost:8787/api/admin/photos/photos/1-1234567890.jpg \
  -H "Authorization: Bearer TOKEN"
# Esperado: 200 OK

# 6. ✅ Confirmar DELETE funcionou
wrangler r2 object get emaus-vota-storage photos/1-1234567890.jpg --local
# Esperado: Error: Object not found
```

**✅ TODOS os 6 testes devem passar antes de marcar como concluído!**

**Status**: ⏳ PENDENTE

---

## 🚀 Tarefa 7: Criar Worker Entry Point

**Objetivo**: Criar ponto de entrada do Worker com Hono

**Pré-requisitos**: Tarefas 5 e 6 concluídas

**Ações**:

1. **Criar `workers/index.ts`** (entry point)

2. **Estrutura**:
```typescript
import { Hono } from 'hono';

export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  RESEND_API_KEY: string;
  SESSION_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

// Middleware + Routes + Handlers

export default {
  fetch: app.fetch,
  scheduled: async (event, env, ctx) => {
    // Cron handler
  },
};
```

**Critérios de Aceitação**:
- [ ] `workers/index.ts` existe
- [ ] Interface Env definida
- [ ] CORS configurado
- [ ] Logger configurado
- [ ] Health check funciona: GET /health
- [ ] `wrangler dev` inicia sem erros

**Verificação**:
```bash
ls -l workers/index.ts
wrangler dev
curl http://localhost:8787/health
```

**Status**: ⏳ PENDENTE

---

## 🛣️ Tarefa 8: Converter Rotas para Hono

**Objetivo**: Migrar todas as rotas Express para Hono

**Pré-requisitos**: Tarefa 7 concluída

**Ações**:

1. **Criar módulos de rotas**:
   - `workers/routes/auth.ts`
   - `workers/routes/admin.ts`
   - `workers/routes/elections.ts`
   - `workers/routes/candidates.ts`
   - `workers/routes/votes.ts`

2. **Padrão de conversão**:
```typescript
// Express (antes)
app.post("/api/auth/login", async (req, res) => {
  const data = req.body;
  // ...
  res.json(response);
});

// Hono (depois)
auth.post("/login", async (c) => {
  const data = await c.req.json();
  // ...
  return c.json(response);
});
```

**Critérios de Aceitação**:
- [ ] Todos os arquivos de rotas criados
- [ ] Todas as rotas convertidas
- [ ] Validação Zod mantida
- [ ] Error handling implementado
- [ ] Testes de integração passam

**Verificação**:
```bash
ls -l workers/routes/*.ts
wrangler dev
# Testar cada rota manualmente
```

**Status**: ⏳ PENDENTE

---

## 🔐 Tarefa 9: Implementar Autenticação JWT

**Objetivo**: Autenticação JWT usando Web Crypto API

**Pré-requisitos**: Tarefa 8 concluída

**Ações**:

1. **Criar `workers/auth.ts`**

2. **Implementar**:
   - `hashPassword()` usando Web Crypto
   - `comparePassword()` usando Web Crypto
   - `generateToken()` usando Web Crypto (HMAC)
   - `verifyToken()` usando Web Crypto
   - Middleware `authenticateToken`
   - Middleware `requireAdmin`
   - Middleware `requireMember`

3. **⚠️ IMPORTANTE**: NÃO hardcode JWT_SECRET!
```typescript
// ❌ ERRADO
const JWT_SECRET = "hardcoded-secret";

// ✅ CORRETO
const JWT_SECRET = env.SESSION_SECRET;
```

**Critérios de Aceitação**:
- [ ] `workers/auth.ts` existe
- [ ] Bcrypt substituído por Web Crypto
- [ ] JWT usando Web Crypto (não jsonwebtoken)
- [ ] Sem secrets hardcoded
- [ ] Middleware funciona com Hono
- [ ] Login/logout funcionam

**Verificação**:
```bash
ls -l workers/auth.ts
grep -n "hardcoded\|const.*SECRET.*=" workers/auth.ts  # Não deve achar
# Testar login
curl -X POST http://localhost:8787/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"senha123"}'
```

**Status**: ⏳ PENDENTE

---

## ⏰ Tarefa 10: Converter Scheduler

**Objetivo**: Migrar node-cron para Cron Triggers

**Pré-requisitos**: Tarefa 7 concluída

**Ações**:

1. **Criar `workers/scheduler.ts`**

2. **Implementar `sendBirthdayEmails()`**:
   - Buscar membros aniversariantes do dia
   - Enviar emails via Resend (fetch API)
   - Log de resultados

3. **Adicionar handler em `workers/index.ts`**:
```typescript
async scheduled(event, env, ctx) {
  await sendBirthdayEmails(env);
}
```

4. **Testar localmente**:
```bash
wrangler dev --test-scheduled
```

**Critérios de Aceitação**:
- [ ] `workers/scheduler.ts` existe
- [ ] `sendBirthdayEmails()` implementado
- [ ] Handler scheduled configurado
- [ ] Teste local funciona
- [ ] Logs mostram execução

**Verificação**:
```bash
ls -l workers/scheduler.ts
wrangler dev --test-scheduled
# Verificar logs
```

**Status**: ⏳ PENDENTE

---

## 🔄 Tarefa 11: Script de Migração de Dados

**Objetivo**: Migrar dados do SQLite/PostgreSQL para D1

**Pré-requisitos**: Tarefas 3 e 4 concluídas

**Ações**:

1. **Criar `migrations/migrate-data.ts`**

2. **Implementar**:
   - Conectar ao DB atual (SQLite ou PostgreSQL)
   - Conectar ao D1
   - Migrar tabela por tabela
   - Validar integridade
   - Log de progresso

3. **Ordem de migração** (respeitar FKs):
   1. users
   2. positions
   3. elections
   4. electionPositions
   5. candidates
   6. verificationCodes
   7. electionAttendance
   8. votes
   9. electionWinners
   10. pdfAudits

**Critérios de Aceitação**:
- [ ] Script criado
- [ ] Todas as tabelas migradas
- [ ] Validação de integridade
- [ ] Sem perda de dados
- [ ] Log detalhado
- [ ] Script é idempotente (pode rodar múltiplas vezes)

**Verificação**:
```bash
ls -l migrations/migrate-data.ts
npm run migrate:data
# Verificar counts
wrangler d1 execute emaus-vota-db --command "SELECT COUNT(*) FROM users"
```

**Status**: ⏳ PENDENTE

---

## 📸 Tarefa 12: Migrar Fotos para R2

**Objetivo**: Mover fotos do filesystem/Neon para R2

**Pré-requisitos**: Tarefa 6 concluída

**Ações**:

1. **Criar script `migrations/migrate-photos.ts`**

2. **Implementar**:
   - Ler fotos do local atual
   - Upload para R2
   - Atualizar `photoUrl` nos users
   - Log de progresso

3. **Executar**:
```bash
npm run migrate:photos
```

**Critérios de Aceitação**:
- [ ] Script criado
- [ ] Todas as fotos migradas
- [ ] URLs atualizadas no banco
- [ ] Fotos acessíveis publicamente
- [ ] Sem fotos perdidas

**Verificação**:
```bash
npm run migrate:photos
# Verificar URL de exemplo
curl -I https://pub-XXXXX.r2.dev/photos/1-timestamp.jpg
```

**Status**: ⏳ PENDENTE

---

## 🧪 Tarefa 13: Testes Locais

**Objetivo**: Validar todas as funcionalidades localmente

**Pré-requisitos**: Tarefas 1-12 concluídas

**Ações**:

1. **Iniciar servidor local**:
```bash
wrangler dev
```

2. **Testar endpoints** (criar checklist):
   - [ ] POST /api/auth/request-code
   - [ ] POST /api/auth/verify-code
   - [ ] POST /api/auth/set-password
   - [ ] POST /api/auth/login
   - [ ] GET /api/auth/me
   - [ ] GET /api/admin/members
   - [ ] POST /api/admin/members
   - [ ] ... (todos os endpoints)

3. **Testar frontend**:
   - Atualizar `VITE_API_URL` para local
   - `npm run dev` (frontend)
   - Testar fluxos completos

**Critérios de Aceitação**:
- [ ] Todos os endpoints respondem
- [ ] Autenticação funciona
- [ ] Upload de foto funciona
- [ ] Votação funciona
- [ ] PDFs são gerados
- [ ] Scheduler funciona (test-scheduled)

**Verificação**:
```bash
wrangler dev
# Em outro terminal
npm run dev  # Frontend
# Abrir browser e testar tudo
```

**Status**: ⏳ PENDENTE

---

## 🚀 Tarefa 14: Deploy Produção

**Objetivo**: Deploy completo para Cloudflare

**Pré-requisitos**: Tarefa 13 concluída

**Ações**:

1. **Aplicar migrations em produção**:
```bash
npm run db:migrate
```

2. **Deploy do Worker**:
```bash
npm run deploy
```

3. **Verificar deployment**:
```bash
wrangler tail  # Ver logs em tempo real
```

4. **Configurar domínio customizado** (opcional):
   - Adicionar domínio no dashboard Cloudflare
   - Configurar DNS
   - Ativar SSL

5. **Atualizar frontend** (se hospedado separadamente):
   - Atualizar `VITE_API_URL` para produção
   - Rebuild: `npm run build`
   - Deploy frontend

**Critérios de Aceitação**:
- [ ] Worker deployado
- [ ] Database produção funciona
- [ ] R2 produção funciona
- [ ] Domínio configurado
- [ ] SSL ativo
- [ ] Frontend conectado

**Verificação**:
```bash
curl https://emaus-vota.workers.dev/health
curl https://seudominio.com/health
```

**Status**: ⏳ PENDENTE

---

## ✅ Tarefa 15: Validação Final

**Objetivo**: Validar TUDO em produção

**Pré-requisitos**: Tarefa 14 concluída

**Ações**:

1. **Checklist funcional completo**:
   - [ ] Cadastro de membro
   - [ ] Login
   - [ ] Upload de foto
   - [ ] Criação de eleição
   - [ ] Cadastro de candidatos
   - [ ] Marcação de presença
   - [ ] Votação (3 escrutínios)
   - [ ] Fechamento automático
   - [ ] Geração de PDF
   - [ ] Export de imagem de resultados
   - [ ] Emails de aniversário (aguardar trigger)

2. **Monitoramento**:
```bash
wrangler tail --format pretty
```

3. **Métricas**:
   - Latência < 100ms
   - Uptime 100%
   - Erros = 0

**Critérios de Aceitação**:
- [ ] Todos os fluxos testados
- [ ] Zero erros
- [ ] Performance adequada
- [ ] Dados persistentes
- [ ] Scheduler funcionando
- [ ] Documentação atualizada

**Verificação**:
- Testar cada funcionalidade manualmente
- Verificar analytics no dashboard Cloudflare
- Aguardar 24h para confirmar estabilidade

**Status**: ⏳ PENDENTE

---

## 📊 Progresso Total

```
[█░░░░░░░░░░░░░░] 1/15 tarefas (6.7%)

✅ Concluídas: 1
⏳ Em progresso: 0
⏸️ Pendentes: 14
```

---

**Última atualização**: 2024-11-14  
**Próxima tarefa**: #2 - Instalar Dependências
