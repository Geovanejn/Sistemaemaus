# Configuração do Cloudflare para Emaús Vota

Este documento explica como configurar o Cloudflare Workers para hospedar o sistema Emaús Vota.

## Pré-requisitos

- Conta no Cloudflare
- Domínio configurado no Cloudflare (opcional, mas recomendado)
- Node.js instalado localmente
- Wrangler CLI (`npm install -g wrangler`)

## 1. Criar API Token do Cloudflare

Para fazer deploy do projeto, você precisará de um token de API com as permissões corretas.

### Método Recomendado: Usar Template "Edit Cloudflare Workers"

1. Acesse o [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Vá em **My Profile → API Tokens**
3. Clique em **Create Token**
4. Selecione o template **"Edit Cloudflare Workers"**
5. Clique em **Continue to summary**
6. Clique em **Create Token**
7. **IMPORTANTE**: Copie e guarde o token imediatamente (você não verá novamente!)

### Permissões Necessárias do Token

Se você preferir criar um token personalizado, configure as seguintes permissões:

**Permissões de Conta (Account):**
- Account Settings: Read
- Workers Scripts: Edit
- Workers KV Storage: Edit
- Workers R2 Storage: Edit

**Permissões de Zona (Zone):**
- Workers Routes: Edit (para todas as zonas ou zona específica)

**Permissões de Usuário (User):**
- User Details: Read (opcional, mas recomendado)

## 2. Configurar Recursos do Cloudflare

### 2.1 Criar Banco de Dados D1

O sistema usa Cloudflare D1 para armazenar dados.

```bash
# Fazer login no Cloudflare
npx wrangler login

# Criar o banco de dados
npx wrangler d1 create emaus-vota-db
```

Após criar, copie o `database_id` retornado e atualize no arquivo `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "emaus-vota-db"
database_id = "seu-database-id-aqui"  # Substitua pelo ID gerado
migrations_dir = "./migrations"
```

### 2.2 Criar Bucket R2 para Armazenar Fotos

O sistema usa Cloudflare R2 para armazenar fotos de membros.

```bash
# Criar bucket de produção
npx wrangler r2 bucket create emaus-vota-storage

# Criar bucket de desenvolvimento (opcional)
npx wrangler r2 bucket create emaus-vota-storage-local
```

Os nomes dos buckets já estão configurados no `wrangler.toml`.

### 2.3 Configurar Secrets

Configure as variáveis secretas que o sistema precisa:

```bash
# Chave da API Resend (para envio de emails)
npx wrangler secret put RESEND_API_KEY
# Cole sua chave da API quando solicitado

# Secret para sessão JWT (mínimo 32 caracteres)
npx wrangler secret put SESSION_SECRET
# Cole uma string aleatória longa quando solicitado
```

**Para gerar SESSION_SECRET:**
```bash
# Linux/Mac
openssl rand -base64 32

# Windows (PowerShell)
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

## 3. Executar Migrações do Banco de Dados

Depois de criar o D1, execute as migrações para criar as tabelas:

```bash
# Aplicar migrações ao banco de produção
npx wrangler d1 migrations apply emaus-vota-db --remote
```

Para ambiente local (desenvolvimento):

```bash
# Aplicar migrações localmente
npx wrangler d1 migrations apply emaus-vota-db --local
```

## 4. Deploy do Projeto

### 4.1 Build e Deploy

```bash
# Instalar dependências
npm install

# Build do projeto (frontend + worker)
npm run build
npm run build:worker

# Deploy para produção
npx wrangler deploy
```

### 4.2 Configurar Domínio Personalizado (Opcional)

No Cloudflare Dashboard:

1. Vá em **Workers & Pages**
2. Selecione seu worker (`emaus-vota`)
3. Vá na aba **Settings → Domains & Routes**
4. Clique em **Add Custom Domain**
5. Digite seu domínio (ex: `emausvota.com.br`)
6. Clique em **Add Domain**

Alternativamente, descomente e configure no `wrangler.toml`:

```toml
[[routes]]
pattern = "emausvota.com.br"
custom_domain = true
```

## 5. Verificar Deploy

Após o deploy, você verá uma URL no console:

```
Published emaus-vota (X.XX sec)
  https://emaus-vota.seu-subdominio.workers.dev
```

Acesse a URL para verificar se o sistema está funcionando.

## 6. Monitoramento e Logs

### Ver Logs em Tempo Real

```bash
npx wrangler tail
```

### Ver Estatísticas de Uso

Acesse o Cloudflare Dashboard → Workers & Pages → seu worker → Analytics

## 7. Limites do Plano Gratuito

O Cloudflare Workers oferece um plano gratuito generoso:

- **Requisições**: 100.000 por dia
- **CPU Time**: 10ms por requisição
- **Memória**: 128MB por worker
- **D1**: 5GB de armazenamento, 5 milhões de linhas lidas/dia
- **R2**: 10GB de armazenamento, 1 milhão de operações/mês

## 8. Configuração de Email (Resend)

O sistema usa Resend para envio de emails. Para configurar:

1. Crie uma conta em [resend.com](https://resend.com)
2. Verifique seu domínio (adicione os registros DNS fornecidos)
3. Crie uma API Key
4. Configure a chave usando `npx wrangler secret put RESEND_API_KEY`

No `wrangler.toml`, configure o email de envio:

```toml
[vars]
RESEND_FROM_EMAIL = "noreply@seudominio.com.br"
```

## 9. Cron Jobs (Aniversários)

O sistema envia emails de aniversário automaticamente usando Cron Triggers:

```toml
[triggers]
crons = ["0 7 * * *"]  # Executa às 7h UTC (4h BRT / 3h BRST)
```

Para testar localmente:

```bash
npx wrangler dev --test-scheduled
```

## 10. Troubleshooting

### Erro "database not found"
- Verifique se o `database_id` no `wrangler.toml` está correto
- Execute as migrações: `npx wrangler d1 migrations apply emaus-vota-db --remote`

### Erro "binding not found"
- Verifique se todos os bindings (DB, STORAGE, ASSETS) estão configurados no `wrangler.toml`
- Faça redeploy: `npx wrangler deploy`

### Emails não estão sendo enviados
- Verifique se o secret `RESEND_API_KEY` está configurado
- Verifique se o domínio está verificado no Resend
- Verifique os logs: `npx wrangler tail`

## 11. Desenvolvimento Local

Para rodar localmente antes do deploy:

```bash
# Instalar dependências
npm install

# Rodar em modo desenvolvimento (Express + Vite)
npm run dev
```

Para testar o worker localmente:

```bash
# Build do worker
npm run build:worker

# Rodar worker local com Wrangler
npx wrangler dev
```

## 12. CI/CD (GitHub Actions)

Para configurar deploy automático via GitHub Actions:

1. Adicione o token como secret no GitHub:
   - Vá em Settings → Secrets and variables → Actions
   - Adicione `CLOUDFLARE_API_TOKEN` com o valor do seu token

2. Crie `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm run build
      - run: npm run build:worker
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

## Resumo dos Comandos

```bash
# Setup inicial
npx wrangler login
npx wrangler d1 create emaus-vota-db
npx wrangler r2 bucket create emaus-vota-storage
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put SESSION_SECRET

# Migrações
npx wrangler d1 migrations apply emaus-vota-db --remote

# Deploy
npm install
npm run build
npm run build:worker
npx wrangler deploy

# Monitoramento
npx wrangler tail
```

## Suporte

Para mais informações sobre Cloudflare Workers:
- [Documentação do Wrangler](https://developers.cloudflare.com/workers/wrangler/)
- [Documentação do D1](https://developers.cloudflare.com/d1/)
- [Documentação do R2](https://developers.cloudflare.com/r2/)
.
