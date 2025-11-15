# Configuração do Token da Cloudflare para Emaús Vota

Este documento descreve todas as permissões necessárias para criar um token da Cloudflare que permita fazer deploy completo do sistema Emaús Vota.

## 📋 Resumo Executivo

O sistema Emaús Vota usa:
- **Cloudflare Workers** - Backend API
- **D1 Database** - Banco de dados (já criado: `emaus-vota-db`)
- **R2 Storage** - Armazenamento de fotos (já criado: `emaus-vota-storage`)
- **Static Assets** - Frontend React SPA
- **Custom Domain** - emausvota.com.br

## 🔑 Permissões Necessárias para o Token

### Como Criar o Token

1. Acesse: **Cloudflare Dashboard** → **Profile** → **API Tokens** → **Create Token**
2. Selecione: **Create Custom Token**
3. Configure as seguintes permissões:

### Permissões de Conta (Account Permissions)

| Recurso | Permissão | Justificativa |
|---------|-----------|---------------|
| **D1** | **Edit** | Criar/modificar databases, executar migrações |
| **Workers Scripts** | **Edit** | Deploy do worker (backend API) |
| **Workers R2 Storage** | **Edit** | Gerenciar buckets e uploads de fotos |
| **Account Settings** | **Read** | Necessário para CI/CD e deploy |

### Permissões de Zona (Zone Permissions) - Para Custom Domain

| Recurso | Permissão | Justificativa |
|---------|-----------|---------------|
| **Workers Routes** | **Edit** | Configurar rotas customizadas no domínio |
| **DNS** | **Edit** | Gerenciar registros DNS do domínio |
| **Zone Settings** | **Read** | Verificar configurações da zona |

### Configuração Detalhada

```
ACCOUNT PERMISSIONS:
├── D1
│   └── Edit ✓
├── Workers Scripts
│   └── Edit ✓
├── Workers R2 Storage
│   └── Edit ✓
└── Account Settings
    └── Read ✓

ZONE PERMISSIONS (emausvota.com.br):
├── Workers Routes
│   └── Edit ✓
├── DNS
│   └── Edit ✓
└── Zone Settings
    └── Read ✓
```

## 🚀 Comandos de Deploy

Após criar o token, configure-o como variável de ambiente:

```bash
# Adicionar o token às secrets do Replit
export CLOUDFLARE_API_TOKEN="seu-token-aqui"
export CLOUDFLARE_ACCOUNT_ID="seu-account-id-aqui"
```

### Deploy Completo

```bash
# 1. Build do projeto
npm run build
npm run build:worker

# 2. Aplicar migrações do D1
npm run db:migrate

# 3. Deploy do Worker
npm run deploy
```

### Verificar o Deploy

```bash
# Ver logs em tempo real
npx wrangler tail

# Testar o health endpoint
curl https://emausvota.com.br/api/health
```

## 🔍 Problemas Comuns no Site em Produção

### 1. **Assets (Frontend) não carregam - 404**

**Sintomas:**
- Página em branco
- Console mostra 404 para arquivos .js, .css
- Worker retorna erro

**Soluções:**

1. Verificar se o build foi feito corretamente:
```bash
# Deve criar a pasta dist/public com index.html
npm run build
ls -la dist/public
```

2. Verificar configuração do wrangler.toml:
```toml
[assets]
directory = "./dist/public"  # Caminho correto
binding = "ASSETS"
```

3. Adicionar `not_found_handling` para SPA:
```toml
[assets]
directory = "./dist/public"
binding = "ASSETS"
not_found_handling = "single-page-application"  # IMPORTANTE para React Router
```

### 2. **Rotas do React retornam 404 ao recarregar**

**Problema:** Funciona no Replit mas não no Cloudflare

**Solução:** Adicionar no wrangler.toml:
```toml
[assets]
not_found_handling = "single-page-application"
```

Isso faz com que todas as rotas retornem index.html, permitindo que o React Router funcione.

### 3. **API funciona mas fotos do R2 não carregam**

**Verificar:**
1. Bucket está criado: `npx wrangler r2 bucket list`
2. Binding está correto no wrangler.toml:
```toml
[[r2_buckets]]
binding = "STORAGE"
bucket_name = "emaus-vota-storage"
```

### 4. **Erros de Database**

**Verificar:**
1. Database ID está correto no wrangler.toml
2. Migrações foram aplicadas: `npm run db:migrate`
3. Verificar database: `npx wrangler d1 info emaus-vota-db`

### 5. **Secrets não configurados**

**Configurar:**
```bash
# Session secret para JWT
npx wrangler secret put SESSION_SECRET

# API key do Resend para emails
npx wrangler secret put RESEND_API_KEY
```

## 📊 Checklist de Deploy

- [ ] Token criado com todas as permissões
- [ ] Build do frontend executado (`npm run build`)
- [ ] Build do worker executado (`npm run build:worker`)
- [ ] Migrações do D1 aplicadas (`npm run db:migrate`)
- [ ] Secrets configurados (SESSION_SECRET, RESEND_API_KEY)
- [ ] Deploy realizado (`npm run deploy`)
- [ ] Custom domain configurado no Cloudflare Dashboard
- [ ] DNS apontando corretamente
- [ ] HTTPS funcionando
- [ ] Teste do health endpoint: `/api/health`
- [ ] Teste de login no site
- [ ] Teste de upload de foto

## 🔐 Segurança

### Boas Práticas para o Token

1. **Não compartilhe** o token publicamente
2. **Use TTL (expiração)** - configure uma data de expiração
3. **IP Allowlist** - se possível, restrinja por IP
4. **Rotação regular** - crie novo token periodicamente
5. **Permissões mínimas** - use apenas as necessárias

### Armazenamento Seguro

```bash
# No Replit, use Secrets (não .env)
# Dashboard → Secrets → Add Secret

CLOUDFLARE_API_TOKEN=seu-token-aqui
CLOUDFLARE_ACCOUNT_ID=seu-account-id-aqui
```

## 📞 Suporte

### Links Úteis

- [Cloudflare Dashboard](https://dash.cloudflare.com)
- [Documentação de API Tokens](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)
- [D1 Database Docs](https://developers.cloudflare.com/d1/)
- [R2 Storage Docs](https://developers.cloudflare.com/r2/)

### Comandos de Diagnóstico

```bash
# Verificar configuração
npx wrangler whoami

# Listar workers
npx wrangler deployments list

# Listar databases D1
npx wrangler d1 list

# Listar buckets R2
npx wrangler r2 bucket list

# Ver logs do worker
npx wrangler tail

# Testar cron job localmente
npx wrangler dev --test-scheduled
```

## 🐛 Debug do Site em Produção

### 1. Verificar se o Worker está rodando

```bash
curl -I https://emausvota.com.br/api/health
```

Resposta esperada:
```json
{
  "status": "healthy",
  "database": "connected",
  "storage": "connected"
}
```

### 2. Ver logs em tempo real

```bash
npx wrangler tail
```

Isso mostra:
- Todas as requisições
- Erros de execução
- Stack traces
- Console.log do worker

### 3. Testar localmente com bindings remotos

```bash
# Usa D1 e R2 de produção
npx wrangler dev --remote
```

### 4. Verificar build dos assets

```bash
# Conferir se arquivos foram gerados
ls -la dist/public

# Deve ter:
# - index.html
# - assets/ (com .js e .css)
# - vite manifest
```

### 5. Comparar Replit vs Cloudflare

| Aspecto | Replit | Cloudflare |
|---------|--------|------------|
| Backend | Express.js no Node | Hono no Worker |
| Database | SQLite local | D1 (Cloudflare) |
| Storage | Filesystem | R2 (Cloudflare) |
| Assets | Vite Dev Server | Static Assets Binding |
| Domínio | `.replit.dev` | `emausvota.com.br` |

## ⚠️ Diferenças Críticas

### Variáveis de Ambiente

**Replit:**
```bash
process.env.RESEND_API_KEY
```

**Cloudflare Worker:**
```typescript
c.env.RESEND_API_KEY  // Vem do contexto Hono
```

### Cron Jobs

**Replit:** `node-cron` roda no Node.js

**Cloudflare:** Triggers nativos do Workers
```toml
[triggers]
crons = ["0 7 * * *"]  # 7h UTC diariamente
```

### Session/Auth

**Replit:** Express Session com MemoryStore

**Cloudflare:** JWT com verificação stateless

## 🎯 Próximos Passos

1. Criar o token com as permissões listadas acima
2. Configurar no Replit Secrets
3. Executar build completo
4. Aplicar migrações
5. Fazer deploy
6. Testar no site emausvota.com.br
7. Verificar logs com `wrangler tail`
8. Ajustar conforme necessário

---

**Última atualização:** 2025-11-15
