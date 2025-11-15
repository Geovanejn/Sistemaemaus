# 🔑 Resumo: Permissões do Token Cloudflare

## Criação Rápida do Token

### Passo 1: Acesse o Dashboard
1. Vá para: https://dash.cloudflare.com/profile/api-tokens
2. Clique em **"Create Token"**
3. Selecione **"Create Custom Token"**

### Passo 2: Configurações do Token

**Nome do Token:** `Emaús Vota - Deploy Completo`

#### Permissões de Conta (Account Permissions)

Selecione sua conta e adicione:

```
✓ D1 - Edit
✓ Workers Scripts - Edit  
✓ Workers R2 Storage - Edit
✓ Account Settings - Read
```

#### Permissões de Zona (Zone Permissions)

Selecione o domínio `emausvota.com.br` e adicione:

```
✓ Workers Routes - Edit
✓ DNS - Edit
✓ Zone Settings - Read
```

#### Restrições (Opcional mas Recomendado)

- **TTL (Expiração):** 1 ano
- **IP Allowlist:** Deixe em branco (ou adicione IPs específicos se souber)

### Passo 3: Criar e Copiar

1. Clique em **"Continue to summary"**
2. Revise as permissões
3. Clique em **"Create Token"**
4. **COPIE O TOKEN IMEDIATAMENTE** (você só verá ele uma vez!)

### Passo 4: Adicionar no Replit

1. No Replit, vá em **Tools** → **Secrets**
2. Adicione dois secrets:

```
CLOUDFLARE_API_TOKEN = [cole o token aqui]
CLOUDFLARE_ACCOUNT_ID = [seu account ID]
```

Para encontrar o Account ID:
- Dashboard Cloudflare → Clique no domínio → Lado direito, em "API" tem o Account ID

## ✅ Checklist Completo

### Antes do Deploy

- [ ] Token criado com todas as permissões
- [ ] Token adicionado no Replit Secrets como `CLOUDFLARE_API_TOKEN`
- [ ] Account ID adicionado no Replit Secrets como `CLOUDFLARE_ACCOUNT_ID`
- [ ] Verificar que D1 database já existe: `npx wrangler d1 list`
- [ ] Verificar que R2 bucket já existe: `npx wrangler r2 bucket list`

### Configurar Secrets da Aplicação

```bash
npx wrangler secret put SESSION_SECRET
# Digite: [string aleatória com 32+ caracteres]

npx wrangler secret put RESEND_API_KEY  
# Digite: [sua chave da API Resend]
```

### Build e Deploy

```bash
# 1. Build completo
npm run build
npm run build:worker

# 2. Aplicar migrações
npm run db:migrate

# 3. Deploy
npm run deploy
```

### Verificação

```bash
# Ver logs
npx wrangler tail

# Testar health
curl https://emausvota.com.br/api/health
```

## 🐛 Se Algo Der Errado

### Erro: "Authentication error"
→ Verifique se o token foi copiado corretamente (sem espaços)

### Erro: "Insufficient permissions"
→ Revise as permissões do token (D1, Workers Scripts, R2 Storage)

### Erro: "Database not found"
→ Confira o `database_id` no wrangler.toml

### Site mostra página em branco
→ Verifique se o build foi feito: `ls dist/public`

### Rotas retornam 404
→ ✅ Já corrigido! (`not_found_handling = "single-page-application"`)

## 📊 Template do Token (Copiar e Colar)

Para facilitar, aqui está exatamente o que configurar:

### Account Permissions
| Permission | Access |
|------------|--------|
| D1 | Edit |
| Workers Scripts | Edit |
| Workers R2 Storage | Edit |
| Account Settings | Read |

### Zone Permissions (emausvota.com.br)
| Permission | Access |
|------------|--------|
| Workers Routes | Edit |
| DNS | Edit |
| Zone Settings | Read |

### Zone Resources
- Include: **Specific zone** → `emausvota.com.br`

## 🎯 Após Deploy - Teste Completo

1. **Acesse:** https://emausvota.com.br
2. **Tente fazer login** com credenciais de teste
3. **Navegue** entre páginas (Admin, Eleições, etc.)
4. **Faça upload** de uma foto
5. **Vote** em um candidato
6. **Gere um PDF** de auditoria

Se todos os passos acima funcionarem, o deploy foi bem-sucedido! 🎉

---

**Ajuda adicional:** Consulte `CLOUDFLARE_TOKEN_SETUP.md` para documentação completa
**Diagnóstico de problemas:** Consulte `DIAGNOSTICO_PROBLEMAS_PRODUCAO.md`
