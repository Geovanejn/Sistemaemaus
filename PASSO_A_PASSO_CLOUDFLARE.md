# 🚀 Passo a Passo - Configuração Cloudflare

Este documento contém os comandos que **VOCÊ** precisa executar para configurar os recursos do Cloudflare.

---

## ✅ Status Atual

- ✅ Dependências instaladas
- ✅ `wrangler.toml` criado
- ✅ Scripts do `package.json` configurados
- ⏳ **PRÓXIMO**: Você precisa executar os comandos abaixo

---

## 📝 Passo 1: Login no Cloudflare

Execute este comando para fazer login na sua conta Cloudflare:

```bash
npx wrangler login
```

**O que acontecerá:**
1. Abrirá seu navegador
2. Você fará login na sua conta Cloudflare
3. Autorizará o Wrangler CLI
4. Verá mensagem de sucesso no terminal

**Confirmação:**
Você deve ver: `✅ Successfully logged in.`

---

## 📝 Passo 2: Criar D1 Database

Execute este comando para criar o banco de dados:

```bash
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

**⚠️ IMPORTANTE:** 
1. **COPIE** o `database_id` que aparecerá (é um UUID como `a1b2c3d4-e5f6-...`)
2. **COLE** esse ID no arquivo `wrangler.toml` substituindo `SUBSTITUA_PELO_SEU_DATABASE_ID`

---

## 📝 Passo 3: Atualizar wrangler.toml com database_id

Abra o arquivo `wrangler.toml` e:

**ANTES:**
```toml
database_id = "SUBSTITUA_PELO_SEU_DATABASE_ID"
```

**DEPOIS:**
```toml
database_id = "seu-database-id-real-aqui"
```

**Exemplo real:**
```toml
database_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

---

## 📝 Passo 4: Criar R2 Bucket (Produção)

Execute este comando para criar o bucket de armazenamento:

```bash
npx wrangler r2 bucket create emaus-vota-storage
```

**Output esperado:**
```
✅ Created bucket 'emaus-vota-storage' with default storage class set to Standard.
```

---

## 📝 Passo 5: Criar R2 Bucket (Desenvolvimento Local)

Execute este comando para criar o bucket de desenvolvimento:

```bash
npx wrangler r2 bucket create emaus-vota-storage-local
```

**Output esperado:**
```
✅ Created bucket 'emaus-vota-storage-local' with default storage class set to Standard.
```

---

## 📝 Passo 6: Configurar Secret - RESEND_API_KEY

Execute este comando para configurar a chave da API Resend:

```bash
npx wrangler secret put RESEND_API_KEY
```

**O que acontecerá:**
1. Terminal pedirá: `Enter a secret value:`
2. Cole sua chave da Resend (começa com `re_...`)
3. Pressione Enter

**Onde encontrar sua chave Resend:**
1. Acesse https://resend.com/api-keys
2. Copie sua API Key (ou crie uma nova)

**Output esperado:**
```
✅ Successfully created secret RESEND_API_KEY
```

---

## 📝 Passo 7: Configurar Secret - SESSION_SECRET

Execute este comando para configurar o secret do JWT:

```bash
npx wrangler secret put SESSION_SECRET
```

**O que fazer:**
1. Terminal pedirá: `Enter a secret value:`
2. Cole uma string aleatória de pelo menos 32 caracteres
3. Pressione Enter

**Como gerar uma string aleatória segura:**

**Opção 1 - Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Opção 2 - Online:**
Acesse: https://www.random.org/strings/ e gere uma string de 64 caracteres

**Output esperado:**
```
✅ Successfully created secret SESSION_SECRET
```

---

## 📝 Passo 8: Atualizar RESEND_FROM_EMAIL no wrangler.toml

Abra o arquivo `wrangler.toml` e atualize o email:

**ANTES:**
```toml
RESEND_FROM_EMAIL = "noreply@seudominio.com"
```

**DEPOIS:**
```toml
RESEND_FROM_EMAIL = "noreply@seu-dominio-real.com"
```

**⚠️ IMPORTANTE:** 
- O domínio deve estar verificado na Resend
- Use o mesmo domínio que você configurou na Resend
- Exemplo: `noreply@umpemail.com.br` ou `onboarding@resend.dev` (teste)

---

## 📝 Passo 9: Verificar Configuração

Execute estes comandos para confirmar que tudo está configurado:

```bash
# 1. Verificar se os secrets foram criados
npx wrangler secret list

# 2. Verificar se o database foi criado
npx wrangler d1 list

# 3. Verificar se os buckets foram criados
npx wrangler r2 bucket list
```

**Output esperado:**

**Secrets:**
```
[
  {
    "name": "RESEND_API_KEY",
    "type": "secret_text"
  },
  {
    "name": "SESSION_SECRET",
    "type": "secret_text"
  }
]
```

**D1 Databases:**
```
┌────────────────┬──────────────────────────────────────┐
│ name           │ uuid                                 │
├────────────────┼──────────────────────────────────────┤
│ emaus-vota-db  │ seu-database-id-aqui                 │
└────────────────┴──────────────────────────────────────┘
```

**R2 Buckets:**
```
┌──────────────────────────────┬────────────┐
│ name                         │ class      │
├──────────────────────────────┼────────────┤
│ emaus-vota-storage           │ Standard   │
│ emaus-vota-storage-local     │ Standard   │
└──────────────────────────────┴────────────┘
```

---

## ✅ Checklist Final

Marque cada item conforme for completando:

- [ ] **Passo 1:** Login no Cloudflare (`wrangler login`)
- [ ] **Passo 2:** D1 Database criado
- [ ] **Passo 3:** `database_id` atualizado no `wrangler.toml`
- [ ] **Passo 4:** R2 Bucket produção criado
- [ ] **Passo 5:** R2 Bucket dev criado
- [ ] **Passo 6:** Secret `RESEND_API_KEY` configurado
- [ ] **Passo 7:** Secret `SESSION_SECRET` configurado
- [ ] **Passo 8:** `RESEND_FROM_EMAIL` atualizado no `wrangler.toml`
- [ ] **Passo 9:** Verificações executadas com sucesso

---

## 🎯 Próximos Passos (Após Completar)

Quando você terminar TODOS os passos acima, me avise com:

> "Completei todos os passos! Aqui está meu database_id: `[cole aqui]`"

Então continuaremos com:
- ✅ **Tarefa 4:** Criar schema-worker.ts (adaptar para Web Crypto API)
- ✅ **Tarefa 5:** Criar D1Storage
- ✅ **Tarefa 6:** Criar R2Storage

---

## 🐛 Troubleshooting

### Erro: "You are not authenticated"
**Solução:** Execute `npx wrangler login` novamente

### Erro: "Database already exists"
**Solução:** 
1. Liste databases: `npx wrangler d1 list`
2. Use o database_id existente

### Erro: "Bucket already exists"
**Solução:**
1. Liste buckets: `npx wrangler r2 bucket list`
2. Confirme que o bucket existe e prossiga

### Erro: "Failed to create secret"
**Solução:**
1. Verifique se está autenticado: `npx wrangler whoami`
2. Tente novamente o comando `wrangler secret put`

---

**Data de criação:** 2024-11-14  
**Versão wrangler:** 4.48.0
