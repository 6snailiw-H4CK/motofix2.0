# CEREBRO.md

## 1. Visão Geral

(Lembraremos de atualizar este arquivo à medida que a refatoração avança.)

## 2. Tech Stack

## 3. Estrutura de Diretórios

## 4. Regras de Negócio e Lógica

- `checkout` é um `AppView` suportado no frontend.
- O fluxo de pagamento usa Stripe Payment Element com `confirmPayment` e confirmações no frontend.
- O backend `server.ts` expõe `/api/payments/publishable-key`, `/api/payments/create-checkout` e `/api/payments/session/:sessionId`.
- A sessão de checkout é criada como `payment_intent` com `card` e `boleto`, usando o e-mail do usuário autenticado.
- A renovação de assinatura expirada agora direciona para a tela de checkout.

## 5. Convenções de Código

- Tela única por `AppView` gerenciada em `AppViewRenderer.tsx`.
- Tela de checkout é lazy-loaded em `src/components/layout/AppViewRenderer.tsx`.
- `SettingsView` dispara `onOpenCheckout` para mudar `view` para `checkout`.

## 6. Firestore Segurança e Permissões (Atualizado 2026-06-22)

### Correção de Permissões para `cash_launches`
- **Problema**: Erro `Missing or insufficient permissions` ao deletar lançamentos de caixa (`cash_launches`).
- **Causa raiz**: 
  - Regra `isAdmin()` só aceitava `request.auth.token.admin == true` (custom claims).
  - Usuários admin apenas no documento `/users/{uid}` não eram reconhecidos como admin.
  - Soft delete em `cash_launches` usa `updateDoc` para marcar `deletedAt`, `deletedBy`, `deletedReason`.
  - Listener de admin users tentava abrir `/users` sem validar permissão, causando "Admin users listener error".

### Solução Implementada
1. **firestore.rules**: Atualizar `isAdmin()` para aceitar:
   - Custom claim `request.auth.token.admin == true` (existente)
   - OU documento `/users/{uid}` com `role == 'admin'` e `isActive == true` (novo)

2. **src/hooks/useUserCollections.ts**: Corrigir listener de admin
   - Verificar `userProfile?.role === 'admin' && userProfile?.isActive` antes de abrir listener
   - Evita erro de permissão no Firestore ao tentar listar `/users`

3. **src/hooks/useCashRegisterActions.ts**: Melhorar UX de erro
   - Detectar "permission" na mensagem de erro
   - Mostrar: "Sem permissão para excluir este lançamento de caixa. Entre em contato com o administrador."
   - Em vez de genérico "Nao foi possivel excluir a O.S."

4. **src/services/firestoreError.ts**: Evitar promise rejection dupla
   - `handleFirestoreError` agora retorna info em vez de lançar erro adicional
   - Preserva console.error para debugging
   - Melhora o fluxo de tratamento de erro no catch

### Estrutura de Dados Confirmada
- `users/{userId}/cash_launches/{launchId}` é subcoleção (top-level dentro de user)
- Soft delete preserva campos: `deletedAt`, `deletedBy`, `deletedReason`
- Campos permitidos em update: todos os campos em `cashLaunchKeys()` (incluindo soft delete metadata)
- Validação: `cashLaunchShape(userId)` garante status, itens, total válidos

### Testes Realizados
- ✅ Delete agora faz soft delete sem erro de permissão
- ✅ Admin listener não gera erro ao abrir se user for admin ativo
- ✅ Mensagem de erro amigável em caso de permissão negada
- ✅ Commit 6d323cf enviado para GitHub

## 7. TODO / Próximos Passos

- Depriorizar Stripe e WhatsApp por enquanto e focar na limpeza da orquestração de views e no fluxo de navegação principal.
- Extrair regras de assinatura expiradas para `useSubscriptionStatus` e reduzir lógica de decisão em `App.tsx`.
- Refatorar `AppViewRenderer.tsx` para separar renderização de telas e diminuir blocos condicionais.
- Garantir que usuário expirado possa chegar à renovação sem bloquear o app inteiro.
- Revisar e documentar regras de `fiscal_*` collections (fiscal_companies, fiscal_invoices, etc.)

## 8. SettingsView, Build e Deploy (Atualizado 2026-06-24)

### Correcao do erro JSX em `SettingsView.tsx`
- **Problema**: Vite/React-Babel exibia erro em `src/components/settings/SettingsView.tsx`:
  - `Adjacent JSX elements must be wrapped in an enclosing tag`
  - Depois, `Unexpected token, expected ","`
- **Causa raiz**:
  - A arvore JSX do `return` estava com wrappers desalinhados.
  - Havia `</div>` sobrando/faltando depois dos cards de backup/sincronizacao.
  - Em uma etapa intermediaria, o arquivo ficou com fragmento `<>...</>` sem fechamento correto do `return`.
- **Solucao**:
  - `SettingsView` voltou a ter um unico `div` raiz.
  - O header fecha antes da pilha principal de conteudo.
  - A pilha principal (`flex flex-col gap-6`) envolve backups, saude da sincronizacao, inputs ocultos, perfil, templates, categorias e card institucional.
  - Removidos fechamentos extras e comentarios temporarios de reordenacao.

### Build em Windows com pouca memoria
- **Problema**: `npm run build` estourava memoria no Windows durante bundle/transpile do esbuild (`errno=1455`, `JavaScript heap out of memory`).
- **Solucao em `vite.config.ts`**:
  - Quando `MOTOFIX_LOW_MEMORY_BUILD=1`, o build usa `target: 'esnext'`.
  - O modo leve desativa minificacao JS/CSS e gzip report.
  - `rollupOptions.maxParallelFileOps` fica em `1` no modo leve.
- **Solucao em `scripts/build.mjs`**:
  - Em Windows, `npm run build` entra direto no modo de baixa memoria.
  - Isso evita tentar primeiro o build pesado, que deixava processos `node/esbuild` consumindo memoria e travava o fluxo.

### Validacoes feitas
- `@babel/parser` parseou `SettingsView.tsx` com plugins `typescript` e `jsx`.
- `npm run build:client` passou no modo leve.
- `npm run build:server` passou.
- `npm run build` passou completo apos ajuste do script.

### Deploy Firebase
- Comando usado: `firebase deploy --only hosting,firestore:rules`.
- Projeto: `motofix-2-local`.
- Firestore rules compiladas e publicadas em `cloud.firestore`.
- Hosting publicado no canal live.
- URL publicada: `https://motofix-2-local.web.app`.

### Observacoes de workspace
- `.firebase/hosting.ZGlzdA.cache` foi atualizado pelo deploy.
- `package.json`, `package-lock.json` e scripts de validacao Firestore soltos ja estavam modificados antes desta etapa e devem ser revisados em separado antes de entrarem em outro commit.
