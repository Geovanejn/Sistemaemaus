# Configurar Secrets no Cloudflare Workers

## ✅ Banco D1 Configurado com Sucesso!

O banco D1 em produção foi configurado com sucesso:
- ✅ Usuário administrador criado
- ✅ 5 posições fixas criadas
- ✅ Banco limpo e pronto para uso

## 🔐 Configurar Secrets Manualmente

Agora você precisa configurar 2 secrets no Cloudflare Workers Dashboard:

### Passo a Passo:

1. **Acesse o Dashboard:**
   - Vá para: https://dash.cloudflare.com/7e46c8d99b0909238b20c614d41f0234/workers-and-pages
   - Clique no worker **"emaus-vota"**

2. **Configure os Secrets:**
   - Vá para aba **"Settings"** > **"Variables and Secrets"**
   - Clique em **"Add variable"** ou **"Add secret"**

### Secret 1: RESEND_API_KEY
```
Nome: RESEND_API_KEY
Tipo: Secret (encrypted)
Valor: re_Yr1HaGUQ_KZVQzTHT5zfEoXAwUYYGAbpn
```

### Secret 2: SESSION_SECRET
```
Nome: SESSION_SECRET
Tipo: Secret (encrypted)
Valor: 00777aec8d339b5183e74c401ed128c2cb6dff9279f16c8bbc919377059e3d48
```

3. **Salvar:**
   - Clique em **"Save"** ou **"Deploy"** para aplicar as mudanças

---

## ✅ Resumo do que foi configurado:

### Banco D1 em Produção
- **Database ID:** bb0bdd12-c0a1-44c6-b3fc-dba40765a508
- **Usuário Admin:**
  - Email: marketingumpemaus@gmail.com
  - Senha: reRe@@3131*#$
- **Posições criadas:** Presidente, Vice-Presidente, 1º Secretário, 2º Secretário, Tesoureiro

### Secrets Necessários
- **RESEND_API_KEY:** Para envio de emails
- **SESSION_SECRET:** Para segurança de sessões JWT

---

## 🧪 Testar o Sistema

Após configurar os secrets no dashboard:

1. Acesse: https://emausvota.com.br
2. Faça login com:
   - Email: marketingumpemaus@gmail.com
   - Senha: reRe@@3131*#$

Se tudo estiver correto, você conseguirá acessar o painel de administrador!

---

## ⚠️ Importante - Segurança

Após confirmar que tudo está funcionando:

1. **Altere a senha do administrador** no sistema
2. **Revogue os tokens de API temporários** que foram usados:
   - Token D1/Workers: DLIpUtOppcte0kb20Mw3wTHh6OtpRPc5wDd7rtRl
   - Token Routes/DNS: 5mcREMljkV8g3cNjpvwQQpCFmyqIDILN7ZB43X5t
3. Crie novos tokens com permissões mínimas necessárias

---

✨ O sistema está quase pronto! Apenas configure os secrets e teste o acesso.
