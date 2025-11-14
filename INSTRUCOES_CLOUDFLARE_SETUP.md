# 📘 Guia Completo: Migração Emaús Vota para Cloudflare

## 📋 Índice
1. [Visão Geral](#visão-geral)
2. [Por que Cloudflare?](#por-que-cloudflare)
3. [Arquitetura da Solução](#arquitetura-da-solução)
4. [Pré-requisitos](#pré-requisitos)
5. [Configuração da Conta Cloudflare](#configuração-da-conta-cloudflare)
6. [Instalação de Dependências](#instalação-de-dependências)
7. [Estrutura do Projeto](#estrutura-do-projeto)
8. [Configuração do Wrangler](#configuração-do-wrangler)
9. [Migração do Schema](#migração-do-schema)
10. [Implementação do Backend](#implementação-do-backend)
11. [Migração de Dados](#migração-de-dados)
12. [Testes Locais](#testes-locais)
13. [Deploy para Produção](#deploy-para-produção)
14. [Troubleshooting](#troubleshooting)

---

## 🎯 Visão Geral

Este documento detalha a migração completa do sistema **Emaús Vota** de um ambiente tradicional Node.js (Render) para **Cloudflare Workers**, utilizando os serviços gratuitos:

- **Cloudflare Workers**: Runtime serverless para o backend
- **D1 Database**: Banco de dados SQL (até 10GB grátis)
- **R2 Storage**: Armazenamento de objetos para fotos (até 10GB grátis)
- **Cron Triggers**: Agendamento de tarefas (birthday emails)

### ❌ Problemas do Render (conta gratuita)
- Sistema adormece após inatividade
- **Dados são APAGADOS** periodicamente
- Performance inconsistente
- Limitações de recursos

### ✅ Vantagens do Cloudflare
- **10GB de armazenamento gratuito** (D1)
- **10GB de armazenamento de objetos** (R2)
- Sempre online (não adormece)
- Performance global (CDN)
- Dados persistentes
- Escalabilidade automática

---

## 🏗️ Arquitetura da Solução

### Antes (Render)
```
┌─────────────────────────────────────────┐
│           Render (Node.js)              │
│  ┌─────────────────────────────────┐    │
│  │  Express.js Backend             │    │
│  │  - Better-SQLite3 (dev)         │    │
│  │  - PostgreSQL/Neon (prod)       │    │
│  │  - File System (fotos)          │    │
│  │  - node-cron (scheduler)        │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Depois (Cloudflare)
```
┌──────────────────────────────────────────────────────┐
│              Cloudflare Workers                       │
│  ┌────────────────────────────────────────────────┐  │
│  │  Hono Framework (Backend)                      │  │
│  │  - D1 Database (SQL)          ┌──────────────┐ │  │
│  │  - R2 Storage (Fotos)         │ Cron Trigger │ │  │
│  │  - Web Crypto API             │ (Birthday)   │ │  │
│  │  - Resend API (Emails)        └──────────────┘ │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────┐   │
│  │ D1 (10GB)│  │ R2 (10GB)│  │ Cloudflare Pages│   │
│  │ Database │  │  Storage │  │   (Frontend)    │   │
│  └──────────┘  └──────────┘  └─────────────────┘   │
└──────────────────────────────────────────────────────┘
```

---

## 📦 Pré-requisitos

### 1. Conta Cloudflare
- ✅ Criar conta gratuita em [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
- ✅ Verificar email
- ✅ Configurar plano gratuito

### 2. Ferramentas Necessárias
- Node.js 18+ instalado
- npm ou yarn
- Git
- Editor de código (VSCode recomendado)

### 3. Conhecimentos
- TypeScript básico
- REST APIs
- SQL básico
- Git/GitHub

---

## 🔧 Configuração da Conta Cloudflare

### Passo 1: Criar D1 Database

```bash
# Login no Cloudflare (abre navegador para autenticação)
npx wrangler login

# Criar database D1
npx wrangler d1 create emaus-vota-db
```

**Output esperado:**
```
✅ Successfully created DB 'emaus-vota-db'!

[[d1_databases]]
binding = "DB"
database_name = "emaus-vota-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

⚠️ **IMPORTANTE**: Copie o `database_id` - você vai precisar!

### Passo 2: Criar R2 Bucket

```bash
# Criar bucket para fotos
npx wrangler r2 bucket create emaus-vota-storage
```

**Output esperado:**
```
✅ Created bucket 'emaus-vota-storage' with default storage class set to Standard.
```

### Passo 3: Configurar Secrets

```bash
# Secret para Resend (emails)
npx wrangler secret put RESEND_API_KEY
# Cole sua chave da Resend quando solicitado

# Secret para JWT
npx wrangler secret put SESSION_SECRET
# Digite uma string aleatória forte (min 32 caracteres)
```

**Como gerar SESSION_SECRET seguro:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📥 Instalação de Dependências

### Dependências de Produção

```bash
npm install hono
npm install drizzle-orm@latest
```

⚠️ **IMPORTANTE**:
- ❌ **NÃO** use `@hono/node-server` - isso é para Node.js, não Workers!
- ❌ **NÃO** use `@aws-sdk/*` - R2 é acessado via binding nativo!
- ✅ **USE** apenas `hono` puro + `wrangler` para deploy

### Dependências de Desenvolvimento

```bash
npm install --save-dev wrangler @cloudflare/workers-types
npm install --save-dev drizzle-kit@latest
```

### Atualizar .gitignore

Adicionar ao `.gitignore`:
```
# Cloudflare
.wrangler/
.dev.vars
wrangler.toml.local

# Local development
.mf/
```

---

## 📁 Estrutura do Projeto

```
emaus-vota/
├── client/                 # Frontend (React + Vite)
│   └── src/
│       └── ... (sem mudanças)
│
├── server/                 # Backend Node.js (MANTER como referência)
│   ├── index.ts
│   ├── routes.ts
│   ├── auth.ts
│   └── ...
│
├── workers/               # 🆕 NOVO: Backend Cloudflare Workers
│   ├── index.ts          # Entry point do Worker
│   ├── routes.ts         # Rotas Hono
│   ├── auth.ts           # Autenticação JWT (Web Crypto)
│   ├── storage-d1.ts     # Camada D1 Database
│   ├── storage-r2.ts     # Camada R2 Storage
│   ├── scheduler.ts      # Cron Triggers
│   └── types.ts          # TypeScript types
│
├── shared/
│   ├── schema.ts         # Schema atual (Node.js)
│   └── schema-worker.ts  # 🆕 Schema adaptado (Workers)
│
├── migrations/           # 🆕 Scripts de migração D1
│   ├── 0001_initial.sql
│   └── migrate-data.ts   # Script de migração de dados
│
├── wrangler.toml         # 🆕 Configuração Cloudflare
├── drizzle.config.ts     # Atualizar para D1
└── package.json          # Atualizar scripts
```

---

## ⚙️ Configuração do Wrangler

### wrangler.toml

```toml
#:schema node_modules/wrangler/config-schema.json
name = "emaus-vota"
main = "workers/index.ts"
compatibility_date = "2024-11-14"
compatibility_flags = ["nodejs_compat"]

# D1 Database Binding
[[d1_databases]]
binding = "DB"
database_name = "emaus-vota-db"
database_id = "COLE_SEU_DATABASE_ID_AQUI"  # ⚠️ Substituir!

# R2 Storage Binding
[[r2_buckets]]
binding = "STORAGE"
bucket_name = "emaus-vota-storage"

# Cron Trigger para Birthday Emails
[triggers]
crons = ["0 7 * * *"]  # Diariamente às 7h UTC (4h BRT)

# Variáveis de Ambiente
[vars]
ENVIRONMENT = "production"
RESEND_FROM_EMAIL = "noreply@seudominio.com"  # ⚠️ Substituir!

# Configurações de Build
[build]
command = "npm run build:worker"

# Limites (plano gratuito)
[limits]
cpu_ms = 10  # 10ms por requisição
```

### Atualizar package.json scripts

```json
{
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "dev:worker": "wrangler dev",
    "build": "vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
    "build:worker": "esbuild workers/index.ts --bundle --format=esm --outdir=dist-worker --external:cloudflare:*",
    "deploy": "wrangler deploy",
    "db:migrate": "wrangler d1 migrations apply emaus-vota-db",
    "db:migrate:local": "wrangler d1 migrations apply emaus-vota-db --local",
    "db:studio": "drizzle-kit studio",
    "start": "NODE_ENV=production node dist/index.js"
  }
}
```

---

## 🗄️ Migração do Schema

### Diferenças Principais

| Node.js (Better-SQLite3) | Cloudflare Workers (D1) |
|--------------------------|-------------------------|
| `crypto` module | Web Crypto API |
| Funções síncronas | Funções assíncronas |
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `INTEGER PRIMARY KEY AUTOINCREMENT` (compatível) |
| File System | R2 Storage API |
| `node-cron` | Cron Triggers |

### shared/schema-worker.ts

```typescript
import { sql } from "drizzle-orm";
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ✅ Web Crypto API (substituir Node.js crypto)
export async function getGravatarUrl(email: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(email.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("MD5", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `https://www.gravatar.com/avatar/${hashHex}?d=mp&s=200`;
}

export async function generatePdfVerificationHash(
  electionId: number,
  electionName: string,
  timestamp: string
): Promise<string> {
  const data = `${electionId}-${electionName}-${timestamp}-${Math.random()}`;
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// ✅ Tables (sem mudanças estruturais)
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

// ... (resto das tabelas idênticas ao schema.ts original)
```

---

## 🔨 Implementação do Backend

### workers/index.ts (Entry Point)

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRoutes } from './routes/auth';
import { adminRoutes } from './routes/admin';
import { electionRoutes } from './routes/elections';

export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  RESEND_API_KEY: string;
  SESSION_SECRET: string;
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Routes
app.route('/api/auth', authRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/elections', electionRoutes);

// Cron Trigger para Birthday Emails
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
  
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Birthday scheduler
    const { sendBirthdayEmails } = await import('./scheduler');
    await sendBirthdayEmails(env);
  },
};
```

### workers/storage-d1.ts

```typescript
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../shared/schema-worker';
import { eq, and } from 'drizzle-orm';
import type { Env } from './index';

export class D1Storage {
  private db;

  constructor(d1Database: D1Database) {
    this.db = drizzle(d1Database, { schema });
  }

  // Users
  async getUser(id: number) {
    return this.db.query.users.findFirst({
      where: eq(schema.users.id, id),
    });
  }

  async getUserByEmail(email: string) {
    return this.db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
  }

  async createUser(data: schema.InsertUser) {
    const result = await this.db.insert(schema.users).values(data).returning();
    return result[0];
  }

  // ... (implementar todos os métodos de storage)
}
```

### workers/storage-r2.ts (Código Completo)

```typescript
import type { Context } from 'hono';

/**
 * R2Storage - Gerenciamento de fotos usando Cloudflare R2
 * ✅ USA BINDING NATIVO (env.STORAGE)
 * ❌ NÃO USA AWS SDK
 */
export class R2Storage {
  private bucket: R2Bucket;

  constructor(r2Bucket: R2Bucket) {
    this.bucket = r2Bucket;
  }

  /**
   * Upload de foto usando R2 binding nativo
   * @param userId - ID do usuário
   * @param fileData - Dados da foto em ArrayBuffer
   * @param contentType - MIME type (ex: image/jpeg)
   * @returns Key da foto no R2
   */
  async uploadPhoto(
    userId: number, 
    fileData: ArrayBuffer, 
    contentType: string
  ): Promise<string> {
    try {
      const key = `photos/${userId}-${Date.now()}.jpg`;
      
      // ✅ CORRETO: Usar binding nativo R2
      await this.bucket.put(key, fileData, {
        httpMetadata: {
          contentType: contentType,
        },
      });

      console.log(`✅ Photo uploaded: ${key}`);
      return key;
    } catch (error) {
      console.error('❌ Error uploading photo:', error);
      throw new Error('Failed to upload photo');
    }
  }

  /**
   * Buscar foto do R2
   * @param key - Chave da foto
   * @returns Objeto R2 ou null se não encontrado
   */
  async getPhoto(key: string): Promise<R2ObjectBody | null> {
    try {
      // ✅ CORRETO: Usar binding nativo R2
      const object = await this.bucket.get(key);
      return object;
    } catch (error) {
      console.error(`❌ Error getting photo ${key}:`, error);
      return null;
    }
  }

  /**
   * Deletar foto do R2
   * @param key - Chave da foto
   */
  async deletePhoto(key: string): Promise<void> {
    try {
      // ✅ CORRETO: Usar binding nativo R2
      await this.bucket.delete(key);
      console.log(`✅ Photo deleted: ${key}`);
    } catch (error) {
      console.error(`❌ Error deleting photo ${key}:`, error);
      throw new Error('Failed to delete photo');
    }
  }

  /**
   * Gerar URL pública da foto
   * IMPORTANTE: Configure domínio público no dashboard Cloudflare
   * @param key - Chave da foto
   * @returns URL pública
   */
  getPhotoUrl(key: string): string {
    // Opção 1: Domínio público R2 (requer configuração no dashboard)
    // Settings → R2 → seu-bucket → Public Access → Add Custom Domain
    return `https://pub-YOUR-BUCKET-ID.r2.dev/${key}`;
    
    // Opção 2: Workers route (mais seguro, permite auth)
    // return `https://emaus-vota.workers.dev/photos/${key}`;
  }
  
  /**
   * Rota Worker para servir fotos (use em workers/index.ts)
   * Exemplo de uso:
   * app.get('/photos/:key', async (c) => {
   *   const r2Storage = new R2Storage(c.env.STORAGE);
   *   return await r2Storage.servePhoto(c, c.req.param('key'));
   * });
   */
  async servePhoto(c: Context, key: string): Promise<Response> {
    const object = await this.bucket.get(key);
    
    if (!object) {
      return new Response('Photo not found', { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000', // Cache 1 ano
        'ETag': object.etag || '',
      },
    });
  }
  
  /**
   * Listar todas as fotos (útil para migração)
   */
  async listPhotos(prefix: string = 'photos/'): Promise<string[]> {
    const list = await this.bucket.list({ prefix });
    return list.objects.map(obj => obj.key);
  }
}

/**
 * ========================
 * ❌ PADRÕES INCORRETOS (NÃO USE!)
 * ========================
 * 
 * // ❌ ERRADO 1: Usar AWS SDK
 * import { S3Client } from '@aws-sdk/client-s3';
 * const s3 = new S3Client(...);  // Runtime error em Workers!
 * 
 * // ❌ ERRADO 2: Usar @hono/node-server
 * import { serve } from '@hono/node-server';  // Não funciona em Workers!
 * 
 * ========================
 * ✅ PADRÕES CORRETOS (USE!)
 * ========================
 * 
 * // ✅ CORRETO 1: Binding nativo
 * const r2 = env.STORAGE;
 * await r2.put(key, data, { httpMetadata: {...} });
 * 
 * // ✅ CORRETO 2: Em workers/index.ts
 * export interface Env {
 *   STORAGE: R2Bucket;  // Binding automático do wrangler.toml
 * }
 * 
 * // ✅ CORRETO 3: Usar na rota
 * app.post('/upload', async (c) => {
 *   const r2 = new R2Storage(c.env.STORAGE);
 *   const formData = await c.req.formData();
 *   const file = formData.get('photo') as File;
 *   const buffer = await file.arrayBuffer();
 *   const key = await r2.uploadPhoto(userId, buffer, file.type);
 *   return c.json({ photoKey: key });
 * });
 */
```

### Checklist de Verificação R2

Após implementar R2Storage, **OBRIGATÓRIO** testar:

```bash
# 1. Iniciar wrangler dev
wrangler dev

# 2. Testar UPLOAD
curl -X POST http://localhost:8787/api/admin/upload-test \
  -F "photo=@test.jpg" \
  -H "Authorization: Bearer TOKEN"
# Esperado: {"photoKey": "photos/1-1234567890.jpg"}

# 3. Testar GET (via Worker route)
curl http://localhost:8787/photos/photos/1-1234567890.jpg \
  -o downloaded.jpg
# Esperado: Foto baixada com sucesso

# 4. Verificar R2 via CLI
wrangler r2 object get emaus-vota-storage photos/1-1234567890.jpg

# 5. Testar DELETE
curl -X DELETE http://localhost:8787/api/admin/photos/photos/1-1234567890.jpg \
  -H "Authorization: Bearer TOKEN"
# Esperado: 200 OK

# 6. Confirmar que foi deletado
wrangler r2 object get emaus-vota-storage photos/1-1234567890.jpg
# Esperado: Error: Object not found
```

✅ **Todos os 6 testes devem passar!**

---

## 🔄 Migração de Dados

### Script: migrations/migrate-data.ts

```typescript
import Database from 'better-sqlite3';
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import * as schema from '../shared/schema-worker';

export async function migrateData(
  sqliteDbPath: string,
  d1Database: D1Database
) {
  console.log('🚀 Iniciando migração de dados...');
  
  // Conectar ao SQLite local
  const sqlite = new Database(sqliteDbPath);
  const sqliteDb = drizzle(sqlite);
  
  // Conectar ao D1
  const d1Db = drizzleD1(d1Database, { schema });
  
  // 1. Migrar usuários
  console.log('📦 Migrando usuários...');
  const users = sqlite.prepare('SELECT * FROM users').all();
  for (const user of users) {
    await d1Db.insert(schema.users).values(user);
  }
  console.log(`✅ ${users.length} usuários migrados`);
  
  // 2. Migrar eleições
  console.log('📦 Migrando eleições...');
  const elections = sqlite.prepare('SELECT * FROM elections').all();
  for (const election of elections) {
    await d1Db.insert(schema.elections).values(election);
  }
  console.log(`✅ ${elections.length} eleições migradas`);
  
  // ... (continuar para todas as tabelas)
  
  console.log('✨ Migração concluída com sucesso!');
}
```

---

## 🧪 Testes Locais

```bash
# 1. Criar database local
wrangler d1 execute emaus-vota-db --local --file=migrations/0001_initial.sql

# 2. Iniciar servidor local
npm run dev:worker

# 3. Testar endpoints
curl http://localhost:8787/health
curl -X POST http://localhost:8787/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"senha123"}'
```

---

## 🚀 Deploy para Produção

```bash
# 1. Aplicar migrations no D1 produção
npm run db:migrate

# 2. Deploy do Worker
npm run deploy

# 3. Verificar deployment
wrangler tail  # Ver logs em tempo real
```

---

## 🐛 Troubleshooting

### Erro: "Cannot use crypto.createHash"
**Solução**: Use Web Crypto API (`crypto.subtle.digest`)

### Erro: "Module not found"
**Solução**: Adicionar `compatibility_flags = ["nodejs_compat"]` no wrangler.toml

### Erro: "Database not found"
**Solução**: Verificar se `database_id` está correto no wrangler.toml

### Erro: "R2 bucket not found"
**Solução**: Executar `wrangler r2 bucket create emaus-vota-storage`

---

## 📊 Checklist de Migração

- [ ] Conta Cloudflare criada
- [ ] D1 Database criado
- [ ] R2 Bucket criado
- [ ] Secrets configurados
- [ ] Dependências instaladas
- [ ] wrangler.toml configurado
- [ ] Schema adaptado para Workers
- [ ] Storage layer implementado
- [ ] Rotas migradas para Hono
- [ ] Autenticação implementada
- [ ] Scheduler implementado
- [ ] Dados migrados
- [ ] Fotos migradas para R2
- [ ] Testes locais passando
- [ ] Deploy em produção
- [ ] Domínio customizado configurado
- [ ] Monitoramento ativo

---

**Última atualização**: 2024-11-14
**Status**: Em desenvolvimento
**Progresso**: 0/15 tarefas concluídas
