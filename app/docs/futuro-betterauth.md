# Futuro — integração com BetterAuth

> Decisão **adiada** (15/06/2026). Esta página guarda o plano para quando formos
> conectar o app ao [BetterAuth](https://www.better-auth.com/). O gerenciamento de
> usuários (tela `/usuarios.html` + `routes/users.ts` + papéis admin/consultor) já
> está pronto **sobre o auth atual** (scrypt + sessões em SQLite); o BetterAuth
> entra depois, reaproveitando essa camada de gestão.

## Estado atual (sem BetterAuth)

Auth próprio, só stdlib, em `src/server/`:

- **`auth.ts`** — hash scrypt (`salt:hash`), sessões em SQLite (cookie `sid`, httpOnly,
  30 dias), e a posse multi-tenant (`user_clients`). Papéis via coluna `users.role`
  (`admin` | `consultor`).
- **`routes/authRoutes.ts`** — `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
  + o gate global (sessão obrigatória; checagem de posse em `/api|/report/:client/:slug`).
- **`routes/users.ts`** — CRUD de usuários (admin): listar, criar, resetar senha,
  papel, atribuir clientes, remover. Guard de admin.
- **`db.ts`** — tabelas `users (id,email,pass_hash,role,created_at)`, `sessions`,
  `user_clients`.
- **Dev:** `AUTH_DISABLED=1` (porta 3132) desliga o gate inteiro.
- **Defesa em profundidade (02/07/2026):** o client sanitiza prosa com HTML inline via
  `safeHtml()` (renderer.ts — whitelist strong/em/br/code) — independe do provedor de auth.

## Por que BetterAuth (motivação)

- Login social (Google), verificação de e-mail, recuperação de senha, 2FA — tudo
  pronto, sem reimplementar fluxo sensível à mão.
- Sessões, rotação de token e CSRF mantidos pela lib.

## Decisão pendente — qual profundidade

1. **Migrar tudo p/ BetterAuth** — troca login/sessões/hash pelas tabelas do BetterAuth
   (`user`/`session`/`account`/`verification`) e religa `user_clients` no `user.id` dele.
   Mais poderoso, porém migração maior (mexe em login, sessões, testes e seed).
2. **Auth atual + camada BetterAuth** — mantém o login atual e adiciona o BetterAuth ao
   lado para habilitar recursos novos (social/2FA) gradualmente.
3. *(feito agora)* **Só gerência de usuários** sobre o auth atual; BetterAuth depois.

## Plano de migração (se opção 1)

1. **Deps:** `npm i better-auth`. Adapter SQLite via Kysely sobre o mesmo
   `better-sqlite3` (`data/comments.db`) — ou um arquivo dedicado.
2. **Instância** `src/server/betterauth.ts`:
   ```ts
   import { betterAuth } from 'better-auth';
   export const auth = betterAuth({
     database: { dialect: kyselyBetterSqlite3, type: 'sqlite' },
     emailAndPassword: { enabled: true },
     // socialProviders: { google: { clientId, clientSecret } },
   });
   ```
3. **Handler:** montar `auth.handler` em `/api/auth/*` (substitui `installAuth` /
   `authRoutes.ts`). Sessão via `auth.api.getSession({ headers })` no gate.
4. **Schema:** rodar a migração do BetterAuth (gera `user`/`session`/`account`/
   `verification`). **Migrar** os usuários atuais: para cada `users`, criar `user` +
   `account` (provider `credential`). O scrypt atual **não** é compatível com o hash do
   BetterAuth → exigir reset de senha no 1º login, ou rodar um rehash on-login.
5. **Posse:** `user_clients.user_id` passa a referenciar `user.id` do BetterAuth.
   Migrar o mapeamento por e-mail (id antigo → novo). `clientOwner/ownsClient/
   assignClient/clientsOf` ficam (só mudam de fonte de id).
6. **Papéis:** usar o plugin `admin` do BetterAuth **ou** manter a coluna `role` própria
   numa tabela à parte chaveada por `user.id`. A tela `/usuarios.html` e `routes/users.ts`
   continuam — só trocam as funções de `auth.ts` por chamadas ao `auth.api`.
7. **Gate de tenant** (`/api|/report/:client/:slug` → 404 se não for dono) **permanece**:
   é regra de negócio do app, independente do provedor de auth.
8. **Dev:** manter o atalho `AUTH_DISABLED=1` (curto-circuita o gate antes de chamar o
   BetterAuth).
9. **Testes:** `test/server/auth.test.ts` reescreve login/me/logout para o fluxo do
   BetterAuth; manter os testes de posse multi-tenant.

## O que NÃO muda

- `user_clients` (modelo multi-tenant) e o gate de posse.
- A tela de gerência (`/usuarios.html`) e o contrato das rotas `/api/users/*`.
- O atalho de dev `AUTH_DISABLED=1`.

## Variáveis de ambiente novas (quando entrar)

`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, e (se social) `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET` — em `app/.env` (ver `src/server/env.ts`).
