# Correções de Paridade API: Express vs Cloudflare Workers

**Data:** 15 de Novembro de 2025  
**Sistema:** Emaús Vota - Sistema de Votação UMP Emaús  
**Arquitetura:** Dual deployment (Express no Replit + Cloudflare Workers em produção)

---

## 📋 Sumário Executivo

Este documento registra as **7 correções críticas** implementadas para garantir paridade entre as implementações Express (desenvolvimento) e Cloudflare Workers (produção). As divergências causavam:

- ❌ **Contador de presença zerado** na interface
- ❌ **Admin dashboard não carregava** lista de cargos (404)
- ❌ **Gerenciamento de cargos quebrado** por restrições de permissão incorretas
- 🔴 **VULNERABILIDADE CRÍTICA:** Dados sensíveis de membros expostos publicamente

---

## 🔴 PROBLEMA 1: Vulnerabilidade de Segurança Crítica - Rotas de Members Públicas

### ⚠️ Severidade: **CRÍTICA**

### Descrição do Problema

As rotas `/api/members` e `/api/members/non-admins` no Cloudflare Workers estavam **completamente públicas**, expondo dados sensíveis de todos os membros (nomes, emails, status de presença) para qualquer pessoa com acesso à rede.

### Impacto em Produção

- **Exposição de PII:** Emails e informações pessoais de membros acessíveis sem autenticação
- **Violação de privacidade:** Qualquer usuário podia listar todos os membros da igreja
- **Risco de compliance:** Possível violação de LGPD/GDPR

### Divergência Identificada

| Rota | Express (Correto) | Workers (Vulnerável) |
|------|-------------------|----------------------|
| `GET /api/members` | `authenticateToken` + `requireAdmin` | ❌ **SEM AUTH** |
| `GET /api/members/non-admins` | `authenticateToken` + `requireAdmin` | ❌ **SEM AUTH** |

### Código Anterior (Vulnerável)

```typescript
// workers/routes/members.ts - ANTES
export function createPublicMemberRoutes(app: Hono<AuthContext>) {
  const membersRouter = new Hono<AuthContext>();
  
  // ❌ SEM AUTH MIDDLEWARE
  membersRouter.use('/*', async (c, next) => {
    c.set('d1Storage', new D1Storage(c.env.DB));
    await next();
  });
  
  // ❌ ROTA PÚBLICA - QUALQUER UM PODE ACESSAR
  membersRouter.get('/', async (c) => {
    const members = await storage.getAllMembers();
    const membersWithoutPasswords = members.map(({ password, ...user }) => user);
    return c.json(membersWithoutPasswords); // ❌ Expõe emails, nomes, etc
  });
```

### Correção Implementada

```typescript
// workers/routes/members.ts - DEPOIS
export function createPublicMemberRoutes(app: Hono<AuthContext>) {
  const membersRouter = new Hono<AuthContext>();
  
  // Dependency Injection
  membersRouter.use('/*', async (c, next) => {
    c.set('d1Storage', new D1Storage(c.env.DB));
    await next();
  });
  
  // ✅ AUTH + ADMIN MIDDLEWARE (alinhado com Express)
  membersRouter.use('/*', createAuthMiddleware());
  membersRouter.use('/*', createAdminMiddleware());
  
  // ✅ AGORA REQUER ADMIN
  membersRouter.get('/', async (c) => {
    const storage = c.get('d1Storage') as D1Storage;
    const members = await storage.getAllMembers();
    const membersWithoutPasswords = members.map(({ password, ...user }) => user);
    return c.json(membersWithoutPasswords);
  });
```

### Arquivos Modificados

- `workers/routes/members.ts` (linhas 10-32)

### Status
✅ **CORRIGIDO** - Ambas as rotas agora requerem autenticação + privilégios de admin

---

## 🟡 PROBLEMA 2: Contador de Presença Sempre Zerado

### Descrição do Problema

O contador de presença na interface administrativa mostrava sempre `0/0` membros presentes, mesmo quando havia membros marcados como presentes no sistema.

### Causa Raiz

Divergência no formato de resposta da API entre Express e Workers:

```typescript
// Express retornava (CORRETO):
{ presentCount: 5 }

// Workers retornava (INCORRETO):
{ count: 5 }
```

**NOTA:** A autenticação estava correta em ambos (ambos requerem `authenticateToken`). O problema era **apenas** o formato da resposta.

### Frontend Esperava

```typescript
// client/src/pages/admin.tsx
const { data } = useQuery<{ presentCount: number }>({
  queryKey: ['/api/elections', activeElection.id, 'attendance', 'count']
});

// Acessava: data?.presentCount
// Resultado com Workers: undefined (porque retornava "count")
```

### Correção Implementada

```typescript
// workers/routes/elections.ts - ANTES
router.get('/:id/attendance/count', async (c) => {
  // ...
  return c.json({ count: presentCount }); // ❌ ERRADO
});

// workers/routes/elections.ts - DEPOIS
router.get('/:id/attendance/count', async (c) => {
  // ...
  return c.json({ presentCount }); // ✅ CORRETO
});
```

### Arquivos Modificados

- `workers/routes/elections.ts` (linha ~145)

### Status
✅ **CORRIGIDO** - Retorna `{ presentCount: number }` alinhado com Express

---

## 🟡 PROBLEMA 3: Admin Dashboard - Dropdown de Cargos Vazio (404)

### Descrição do Problema

O dropdown de seleção de cargos no admin dashboard não carregava nenhum cargo, aparecendo vazio. Console do navegador mostrava erro `404 Not Found` ao chamar `/api/positions`.

### Causa Raiz

Rota `GET /api/positions` **estava completamente ausente** no Cloudflare Workers, mas existia no Express.

### Impacto em Produção

- Admin não conseguia criar eleições (precisa selecionar cargos)
- Admin não conseguia adicionar candidatos (precisa selecionar cargo)
- Gerenciamento de cargos completamente quebrado em produção

### Código Express (Correto)

```typescript
// server/routes.ts (linha 919)
app.get("/api/positions", async (req, res) => {
  try {
    const positions = storage.getAllPositions();
    res.json(positions);
  } catch (error) {
    res.status(500).json({ message: "Erro ao buscar cargos" });
  }
});
```

### Código Workers (Faltando)

```typescript
// workers/routes/positions.ts - ANTES
// ❌ ROTA NÃO EXISTIA
```

### Correção Implementada

```typescript
// workers/routes/positions.ts - DEPOIS
export function createPositionsRoutes(app: Hono<AuthContext>) {
  const positionsRouter = new Hono<AuthContext>();
  
  // ... outras rotas ...
  
  app.route('/api/elections', positionsRouter);
  
  // ✅ NOVA ROTA ADICIONADA (pública, alinhada com Express)
  app.get('/api/positions', async (c) => {
    try {
      const storage = new D1Storage(c.env.DB);
      const positions = await storage.getAllPositions();
      return c.json(positions);
    } catch (error) {
      console.error('[Positions] Error getting all positions:', error);
      return c.json({ 
        message: error instanceof Error ? error.message : 'Erro ao buscar cargos' 
      }, 500);
    }
  });
  
  return app;
}
```

### Arquivos Modificados

- `workers/routes/positions.ts` (linhas 277-293)

### Status
✅ **CORRIGIDO** - Rota adicionada, admin dropdown agora funciona

---

## 🟡 PROBLEMA 4: Gerenciamento de Cargos Quebrado - Restrição Incorreta

### Descrição do Problema

Ao tentar gerenciar cargos no admin (adicionar candidatos, visualizar candidatos), o sistema retornava erro `403 Forbidden - Acesso negado. Apenas administradores.`, mesmo quando o usuário era admin.

### Causa Raiz

A rota `GET /api/candidates` no Workers requeria privilégios de **admin**, mas no Express requeria apenas **autenticação**. Isso causava falha no fluxo de gerenciamento de cargos.

### Divergência Identificada

| Rota | Express (Correto) | Workers (Incorreto) |
|------|-------------------|---------------------|
| `GET /api/candidates` | `authenticateToken` | `authenticateToken` + `requireAdmin` ❌ |

### Fluxo Quebrado

1. Admin autenticado tenta gerenciar cargo
2. Frontend chama `GET /api/candidates`
3. Workers rejeita com 403 (requer admin, mas validação falhava)
4. Interface não carrega lista de candidatos
5. Gerenciamento de cargo impossível

### Correção Implementada

```typescript
// workers/routes/candidates.ts - ANTES
candidatesRouter.get('/', createAuthMiddleware(), async (c) => {
  const user = c.get('user');
  if (!user?.isAdmin) {  // ❌ VERIFICAÇÃO INCORRETA
    return c.json({ error: 'Acesso negado. Apenas administradores.' }, 403);
  }
  // ...
});

// workers/routes/candidates.ts - DEPOIS
candidatesRouter.get('/', createAuthMiddleware(), async (c) => {
  // ✅ REMOVIDA VERIFICAÇÃO DE ADMIN (alinhado com Express)
  try {
    const storage = c.get('d1Storage') as D1Storage;
    const activeElection = await storage.getActiveElection();
    // ...
  }
});
```

### Arquivos Modificados

- `workers/routes/candidates.ts` (linhas 90-108)

### Status
✅ **CORRIGIDO** - Agora requer apenas autenticação, não admin

---

## 🟡 PROBLEMA 5: Listagem de Candidatos por Cargo - Sem Autenticação

### Descrição do Problema

A rota `GET /api/elections/:electionId/positions/:positionId/candidates` estava **pública** no Workers, mas requeria autenticação no Express.

### Divergência Identificada

| Rota | Express (Correto) | Workers (Incorreto) |
|------|-------------------|---------------------|
| `GET /api/elections/:id/positions/:id/candidates` | `authenticateToken` | ❌ **SEM AUTH** |

### Correção Implementada

```typescript
// workers/routes/candidates.ts - ANTES
export function createCandidatesByPositionRoutes(app: Hono<AuthContext>) {
  const router = new Hono<AuthContext>();
  
  // ❌ SEM AUTH MIDDLEWARE (rota pública)
  router.use('/*', async (c, next) => {
    c.set('d1Storage', new D1Storage(c.env.DB));
    await next();
  });
  
  router.get('/:electionId/positions/:positionId/candidates', async (c) => {
    // ❌ QUALQUER UM PODE ACESSAR
  });
}

// workers/routes/candidates.ts - DEPOIS
export function createCandidatesByPositionRoutes(app: Hono<AuthContext>) {
  const router = new Hono<AuthContext>();
  
  // Dependency injection
  router.use('/*', async (c, next) => {
    c.set('d1Storage', new D1Storage(c.env.DB));
    await next();
  });
  
  // ✅ AUTH MIDDLEWARE ADICIONADO
  router.use('/*', createAuthMiddleware());
  
  router.get('/:electionId/positions/:positionId/candidates', async (c) => {
    // ✅ AGORA REQUER AUTENTICAÇÃO
  });
}
```

### Arquivos Modificados

- `workers/routes/candidates.ts` (linhas 120-152)

### Status
✅ **CORRIGIDO** - Rota agora requer autenticação

---

## 🟡 PROBLEMA 6: Cargo Ativo Sem Autenticação

### Descrição do Problema

A rota `GET /api/elections/:id/positions/active` (que retorna o cargo atualmente aberto para votação) estava **pública** no Workers, mas requeria autenticação no Express.

### Divergência Identificada

| Rota | Express (Correto) | Workers (Incorreto) |
|------|-------------------|---------------------|
| `GET /api/elections/:id/positions/active` | `authenticateToken` | ❌ **SEM AUTH** |

### Correção Implementada

```typescript
// workers/routes/positions.ts - ANTES
positionsRouter.get('/:id/positions/active', async (c) => {
  // ❌ ROTA PÚBLICA
  try {
    const storage = c.get('d1Storage') as D1Storage;
    const electionId = parseInt(c.req.param('id'));
    const activePosition = await storage.getActiveElectionPosition(electionId);
    // ...
  }
});

// workers/routes/positions.ts - DEPOIS
positionsRouter.get('/:id/positions/active', createAuthMiddleware(), async (c) => {
  // ✅ AGORA REQUER AUTENTICAÇÃO
  try {
    const storage = c.get('d1Storage') as D1Storage;
    const electionId = parseInt(c.req.param('id'));
    const activePosition = await storage.getActiveElectionPosition(electionId);
    // ...
  }
});
```

### Arquivos Modificados

- `workers/routes/positions.ts` (linhas 63-89)

### Status
✅ **CORRIGIDO** - Rota agora requer autenticação

---

## 📊 Resumo das Correções

### Tabela Comparativa Final

| # | Rota | Express | Workers (ANTES) | Workers (DEPOIS) | Status |
|---|------|---------|-----------------|------------------|--------|
| 1 | `GET /api/members` | AUTH + ADMIN | ❌ PÚBLICA | ✅ AUTH + ADMIN | CORRIGIDO |
| 2 | `GET /api/members/non-admins` | AUTH + ADMIN | ❌ PÚBLICA | ✅ AUTH + ADMIN | CORRIGIDO |
| 3 | `GET /api/elections/:id/attendance/count` | AUTH + `{ presentCount }` | ✅ AUTH + ❌ `{ count }` | ✅ AUTH + ✅ `{ presentCount }` | CORRIGIDO |
| 4 | `GET /api/positions` | PÚBLICA | ❌ NÃO EXISTIA | ✅ PÚBLICA | CORRIGIDO |
| 5 | `GET /api/candidates` | AUTH | ❌ AUTH + ADMIN | ✅ AUTH | CORRIGIDO |
| 6 | `GET /api/elections/:id/positions/:id/candidates` | AUTH | ❌ PÚBLICA | ✅ AUTH | CORRIGIDO |
| 7 | `GET /api/elections/:id/positions/active` | AUTH | ❌ PÚBLICA | ✅ AUTH | CORRIGIDO |

---

## 🔧 Arquivos Modificados

### 1. `workers/routes/members.ts`
- **Linhas modificadas:** 10-32, 50-56
- **Mudança:** Adicionado `createAuthMiddleware()` + `createAdminMiddleware()`
- **Impacto:** Correção de vulnerabilidade crítica de segurança

### 2. `workers/routes/elections.ts`
- **Linhas modificadas:** ~145
- **Mudança:** Alterado retorno de `{ count }` para `{ presentCount }`
- **Impacto:** Correção do contador de presença na UI

### 3. `workers/routes/positions.ts`
- **Linhas modificadas:** 63-89 (auth middleware), 277-293 (nova rota)
- **Mudança:** Adicionado auth middleware + nova rota `/api/positions`
- **Impacto:** Admin dropdown funcional + cargo ativo requer auth

### 4. `workers/routes/candidates.ts`
- **Linhas modificadas:** 90-108, 120-152
- **Mudança:** Removido requireAdmin da rota GET, adicionado auth na rota de candidatos por posição
- **Impacto:** Gerenciamento de cargos funcional + listagem requer auth

---

## 🎯 Princípio Adotado

### Express como Source of Truth

Todas as correções seguiram o princípio de **"Express é a fonte da verdade"**:

1. ✅ **Autenticação:** Se Express requer auth, Workers deve requerer auth
2. ✅ **Permissões:** Se Express requer admin, Workers deve requerer admin
3. ✅ **Formato de Resposta:** Se Express retorna `{ field: value }`, Workers deve retornar idêntico
4. ✅ **Rotas:** Se Express tem uma rota, Workers deve ter a mesma rota
5. ✅ **Comportamento:** Funcionalidade deve ser 100% idêntica

### Benefícios

- 🔒 Segurança consistente entre dev e produção
- 🐛 Bugs reproduzíveis localmente
- 🚀 Deploy confiável (sem surpresas em produção)
- 📝 Contrato de API único e confiável

---

## ⚠️ Lições Aprendidas

### 1. Sempre Validar Autenticação em Dual Deployment

Quando se tem duas implementações (Express + Workers), é **fundamental** ter:

- ✅ Testes automatizados de auth
- ✅ Checklist de paridade de rotas
- ✅ Revisão de código focada em auth
- ✅ Documentação clara do contrato de API

### 2. Divergências de API São Bugs em Produção

Pequenas diferenças como `{ count }` vs `{ presentCount }` parecem triviais, mas causam:

- ❌ Interface quebrada
- ❌ Experiência ruim do usuário
- ❌ Perda de confiança no sistema

### 3. Segurança Deve Ser Verificada em Cada Deploy

A vulnerabilidade das rotas de members foi introduzida na migração e passou despercebida. Necessário:

- ✅ Audit de segurança automático
- ✅ Testes de permissão em CI/CD
- ✅ Review de código focado em auth/authz

---

## 📝 Próximos Passos Recomendados

### 1. Testes de Regressão
- [ ] Criar suite de testes E2E comparando Express vs Workers
- [ ] Validar todas as rotas críticas
- [ ] Testar fluxos completos (admin, voting, results)

### 2. Monitoramento
- [ ] Adicionar logs de autenticação
- [ ] Alertas para falhas 403/401
- [ ] Métricas de uso de cada endpoint

### 3. Documentação
- [ ] Atualizar README com arquitetura dual
- [ ] Documentar processo de sincronização Express ↔ Workers
- [ ] Criar guia de deploy seguro

### 4. Automação
- [ ] Script para validar paridade de rotas
- [ ] CI/CD com testes de auth
- [ ] Deploy staging obrigatório antes de produção

---

## 👥 Créditos

**Desenvolvedor:** Replit Agent  
**Revisão Técnica:** Architect Agent (Claude Opus 4.1)  
**Cliente:** UMP Emaús  
**Projeto:** Emaús Vota - Sistema de Votação Eletrônica

---

## 📄 Licença e Confidencialidade

Este documento contém informações técnicas confidenciais do sistema Emaús Vota.  
Distribuição restrita apenas para equipe técnica autorizada.

**Data do Documento:** 15 de Novembro de 2025  
**Versão:** 1.0  
**Status:** ✅ Todas correções implementadas e validadas
