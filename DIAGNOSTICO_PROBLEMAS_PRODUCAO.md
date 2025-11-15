# Diagnóstico de Problemas em Produção - emausvota.com.br

## 🔍 Análise dos Problemas

### Problema Principal Identificado

**CRÍTICO: Configuração faltando no wrangler.toml**

A configuração `not_found_handling = "single-page-application"` estava **FALTANDO** no arquivo wrangler.toml. 

**Isso causava:**
- ❌ Rotas do React Router retornavam 404 ao recarregar a página
- ❌ Navegação direta para URLs como `/admin`, `/elections`, etc. não funcionavam
- ❌ Apenas a rota `/` (raiz) funcionava

**Solução aplicada:** ✅ Adicionado `not_found_handling = "single-page-application"` no wrangler.toml

### Problema Secundário: Código TypeScript Incorreto

**Erro no workers/index.ts:**
```typescript
// ❌ ERRADO - URL object não pode ser passado para fetch
c.env.ASSETS.fetch(url)

// ✅ CORRETO - Precisa converter para string
c.env.ASSETS.fetch(url.toString())
```

**Solução aplicada:** ✅ Corrigido para usar `.toString()`

## 📊 Diferenças: Replit vs Cloudflare

### Arquitetura

| Componente | Replit (Dev) | Cloudflare (Prod) |
|------------|--------------|-------------------|
| **Runtime** | Node.js | Cloudflare Workers (V8) |
| **Backend Framework** | Express.js | Hono |
| **Database** | SQLite (better-sqlite3) | D1 (SQLite distribuído) |
| **File Storage** | Sistema de arquivos local | R2 (Object Storage) |
| **Static Assets** | Vite Dev Server | ASSETS Binding |
| **Sessions** | express-session + MemoryStore | JWT Stateless |
| **Cron Jobs** | node-cron | Workers Triggers |

### Implicações das Diferenças

#### 1. **Variáveis de Ambiente**

**Replit (server/index.ts):**
```typescript
const apiKey = process.env.RESEND_API_KEY;
```

**Cloudflare (workers/*):**
```typescript
const apiKey = c.env.RESEND_API_KEY; // Vem do contexto Hono
```

#### 2. **Database Queries**

**Replit:** Queries síncronas com better-sqlite3
```typescript
const result = db.prepare('SELECT * FROM users').all();
```

**Cloudflare:** Queries assíncronas com D1
```typescript
const result = await db.prepare('SELECT * FROM users').all();
```

#### 3. **File Uploads**

**Replit:** Salva no filesystem
```typescript
fs.writeFileSync(path, buffer);
```

**Cloudflare:** Salva no R2
```typescript
await STORAGE.put(key, buffer);
```

## 🐛 Checklist de Problemas Comuns

### Frontend (React SPA)

- [x] ~~`not_found_handling = "single-page-application"` no wrangler.toml~~ ✅ CORRIGIDO
- [ ] Build gerou arquivos em `dist/public`
- [ ] `index.html` existe em `dist/public`
- [ ] Assets (JS/CSS) estão em `dist/public/assets`
- [ ] Vite manifest foi gerado
- [ ] CORS configurado corretamente no worker

### Backend (Cloudflare Worker)

- [x] ~~Worker TypeScript compila sem erros~~ ✅ CORRIGIDO
- [ ] Todas as rotas estão registradas no worker
- [ ] Bindings (D1, R2, ASSETS) configurados
- [ ] Secrets configurados (SESSION_SECRET, RESEND_API_KEY)
- [ ] Migrações D1 aplicadas em produção

### Database (D1)

- [ ] Database criado: `emaus-vota-db`
- [ ] Database ID correto no wrangler.toml
- [ ] Migrações aplicadas: `npm run db:migrate`
- [ ] Tabelas criadas corretamente
- [ ] Índices criados

### Storage (R2)

- [ ] Bucket criado: `emaus-vota-storage`
- [ ] Binding configurado no wrangler.toml
- [ ] Permissões de escrita/leitura funcionando
- [ ] Fotos sendo servidas em `/photos/*`

### Domínio e DNS

- [ ] Custom domain configurado no Cloudflare Dashboard
- [ ] DNS aponta para o worker
- [ ] HTTPS configurado
- [ ] Certificado SSL válido

## 🔧 Comandos de Verificação

### 1. Verificar Build Local

```bash
# Build do frontend
npm run build

# Verificar arquivos gerados
ls -la dist/public
ls -la dist/public/assets

# Build do worker
npm run build:worker

# Verificar worker gerado
ls -la dist-worker
```

### 2. Verificar Configuração Cloudflare

```bash
# Verificar autenticação
npx wrangler whoami

# Listar databases
npx wrangler d1 list

# Info do database específico
npx wrangler d1 info emaus-vota-db

# Listar buckets R2
npx wrangler r2 bucket list

# Listar deployments
npx wrangler deployments list
```

### 3. Aplicar Migrações

```bash
# Aplicar migrações no D1 de produção
npm run db:migrate

# Verificar se foram aplicadas
npx wrangler d1 execute emaus-vota-db --command "SELECT name FROM sqlite_master WHERE type='table';"
```

### 4. Deploy

```bash
# Deploy completo
npm run deploy

# Ver logs em tempo real
npx wrangler tail

# Filtrar erros
npx wrangler tail --status 500
npx wrangler tail --status 404
```

### 5. Testar em Produção

```bash
# Health check
curl https://emausvota.com.br/api/health

# Testar rota específica
curl -I https://emausvota.com.br/admin

# Testar API
curl https://emausvota.com.br/api/elections
```

## 📝 Passos para Resolver os Problemas

### Fase 1: Preparação Local ✅

1. [x] Corrigir `wrangler.toml` - adicionar `not_found_handling`
2. [x] Corrigir erros TypeScript no `workers/index.ts`
3. [ ] Fazer build local completo
4. [ ] Testar localmente com `wrangler dev --remote`

### Fase 2: Deploy para Produção

1. [ ] Criar token Cloudflare com permissões corretas
2. [ ] Configurar secrets no Cloudflare:
   ```bash
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put RESEND_API_KEY
   ```
3. [ ] Aplicar migrações: `npm run db:migrate`
4. [ ] Deploy: `npm run deploy`

### Fase 3: Verificação

1. [ ] Verificar logs: `npx wrangler tail`
2. [ ] Testar health endpoint
3. [ ] Testar login
4. [ ] Testar navegação entre páginas
5. [ ] Testar upload de foto
6. [ ] Testar votação
7. [ ] Testar geração de PDF

## ⚠️ Possíveis Erros e Soluções

### Erro: "TypeError: c.env.ASSETS.fetch is not a function"

**Causa:** Binding ASSETS não configurado ou nome incorreto

**Solução:**
```toml
[assets]
binding = "ASSETS"  # Nome deve ser exatamente "ASSETS"
```

### Erro: "Database not found"

**Causa:** Database ID incorreto ou database não criado

**Solução:**
```bash
# Listar databases
npx wrangler d1 list

# Copiar o ID correto para wrangler.toml
[[d1_databases]]
database_id = "ID-CORRETO-AQUI"
```

### Erro: "R2 bucket not found"

**Causa:** Bucket não criado ou nome incorreto

**Solução:**
```bash
# Criar bucket se não existir
npx wrangler r2 bucket create emaus-vota-storage

# Listar buckets
npx wrangler r2 bucket list
```

### Erro: "Secret SESSION_SECRET not found"

**Causa:** Secret não configurado

**Solução:**
```bash
npx wrangler secret put SESSION_SECRET
# Digite um valor aleatório (min 32 caracteres)
```

### Erro: 404 em rotas do React

**Causa:** `not_found_handling` não configurado

**Solução:** ✅ JÁ CORRIGIDO no wrangler.toml

### Erro: CORS blocked

**Causa:** CORS não configurado corretamente no worker

**Solução:**
```typescript
// Verificar em workers/index.ts
app.use('/*', cors({
  origin: '*',  // Ou especificar domínios permitidos
  credentials: true,
}));
```

## 🎯 Próximos Passos

1. **Imediato:**
   - [ ] Fazer build completo local
   - [ ] Testar com `wrangler dev --remote`

2. **Deploy:**
   - [ ] Criar token Cloudflare
   - [ ] Configurar secrets
   - [ ] Aplicar migrações
   - [ ] Deploy

3. **Validação:**
   - [ ] Monitorar logs
   - [ ] Testar todas as funcionalidades
   - [ ] Corrigir problemas encontrados

## 📞 Suporte Técnico

Se os problemas persistirem após seguir este guia:

1. **Verificar logs detalhados:**
   ```bash
   npx wrangler tail --format pretty
   ```

2. **Testar API endpoints individualmente:**
   ```bash
   curl -v https://emausvota.com.br/api/health
   curl -v https://emausvota.com.br/api/elections
   ```

3. **Verificar console do browser:**
   - Abrir DevTools (F12)
   - Ver aba Console para erros JavaScript
   - Ver aba Network para falhas de API

4. **Comparar comportamento:**
   - Testar mesma ação no Replit (funciona)
   - Testar no Cloudflare (não funciona)
   - Identificar a diferença específica

---

**Última atualização:** 2025-11-15

**Status das correções:** 
- ✅ wrangler.toml corrigido
- ✅ workers/index.ts corrigido
- ⏳ Aguardando deploy para validação
