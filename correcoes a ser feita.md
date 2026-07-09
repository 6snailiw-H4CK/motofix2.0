# Correcoes a ser feita

Este arquivo sera o roteiro para limpar os erros atuais do `npm run lint`, principalmente os erros de tipagem do `firebase-admin` no backend e scripts.

## Objetivo

Deixar o comando abaixo passando sem erros:

```bash
npm run lint
```

Depois disso, validar tambem:

```bash
npm run build:server
npm run build:client
npm run test:offline
```

## Resumo atual

Status atualizado em 2026-07-07.

O que esta ok:

- [x] `npm run lint` esta passando.
- [x] `npm run build:server` esta passando.
- [x] `npm run build:client` esta passando.
- [x] `npm run test:offline` esta passando.
- [x] Commits 1 a 7 estao tecnicamente revisados.
- [x] Commit 8 esta com validacao completa concluida.
- [x] Commit 9 teve os riscos principais corrigidos em `firebase.json` e `public/index.html`.
- [x] Historico agora inclui tambem lancamentos caixa/ordens de servico.
- [x] Agenda de clientes ganhou filtro por nome e cards expansivos.

O que ainda falta resolver:

- [ ] Confirmar se `.firebaserc` deve apontar para `appmotofix` ou voltar para `motofix-2-local`.
- [ ] Decidir se `.firebase/hosting.ZGlzdA.cache` deve ficar fora dos commits de codigo.
- [ ] Decidir se os Commits 4 e 5 serao separados com `git add -p` ou combinados.
- [x] Remover o script legado `test-firestore-rules.js` da raiz; a validacao nova fica em `scripts/firestore-rules-validation.mjs`.
- [ ] Rodar validacao final completa depois dessas decisoes.

Ordem sugerida para finalizar:

1. Confirmar projeto Firebase em `.firebaserc`.
2. Decidir destino de `.firebase/hosting.ZGlzdA.cache`.
3. Rodar validacao final completa.
4. Separar commits por tema ou combinar Commits 4 e 5, conforme preferencia de historico.

## Ordem recomendada

1. [x] Mapear todos os usos atuais de `firebase-admin`.
2. [x] Criar um helper central para inicializacao do Firebase Admin.
3. [x] Migrar `server.ts` para o helper novo.
4. [x] Migrar as rotas de reset operacional.
5. [x] Migrar as rotas e tipos do modulo fiscal.
6. [x] Migrar as rotas e tipos do modulo WhatsApp.
7. [x] Corrigir ou remover do lint o script temporario `scripts/temp-admin-test.ts`.
8. [x] Rodar `npm run lint`.
9. [x] Corrigir erros restantes, se aparecerem.
10. [x] Rodar build e testes finais.

## Critica

Status: concluido em 2026-07-01.

### 1. Corrigir o uso antigo do Firebase Admin SDK

Arquivos provaveis:

- `server.ts`
- `server/dataResetRoutes.ts`
- `server/fiscal/fiscalRoutes.ts`
- `server/fiscal/types.ts`
- `server/whatsapp/whatsappRoutes.ts`
- `server/whatsapp/types.ts`
- `scripts/temp-admin-test.ts`

Problema atual:

O codigo usa o pacote `firebase-admin` como se ainda expusesse propriedades diretamente em `admin`, por exemplo:

```ts
admin.credential.cert(...)
admin.firestore()
admin.auth()
admin.firestore.Firestore
admin.auth.DecodedIdToken
```

Com a versao atual instalada, o TypeScript espera o modelo modular.

Correcao esperada:

Usar imports modulares:

```ts
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
```

Para tipos:

```ts
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
```

Resultado esperado:

- Remover os erros `Property 'credential' does not exist`.
- Remover os erros `Property 'firestore' does not exist`.
- Remover os erros `Property 'auth' does not exist`.
- Remover os erros `Namespace ... has no exported member 'firestore'`.
- Remover os erros `Namespace ... has no exported member 'auth'`.

### 2. Criar um helper central de Firebase Admin

Arquivo sugerido:

- `server/firebaseAdmin.ts`

Responsabilidade do helper:

- Inicializar o Firebase Admin uma unica vez.
- Exportar `adminDb`.
- Exportar `adminAuth`.
- Centralizar leitura de credenciais e configuracao.

Exemplo de formato esperado:

```ts
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

export const adminDb = getFirestore();
export const adminAuth = getAuth();
```

Observacao:

O exemplo acima precisa ser adaptado ao formato real de credenciais que o projeto ja usa em `server.ts`.

Resultado esperado:

- Evitar inicializacao duplicada.
- Evitar imports diferentes em cada rota.
- Deixar a manutencao mais simples.

## Media

Status: concluido em 2026-07-01.

### 3. Migrar `server.ts`

O que fazer:

- Remover uso direto de `admin.credential`, `admin.firestore` e `admin.auth`.
- Importar `adminDb` e `adminAuth` do helper novo.
- Manter o comportamento atual do servidor sem alterar endpoints.

Validacao:

```bash
npm run build:server
```

### 4. Migrar `server/dataResetRoutes.ts`

O que fazer:

- Trocar tipos antigos `admin.firestore.*` por imports de tipo modulares.
- Trocar qualquer acesso a `admin.auth()` por `adminAuth`.
- Trocar qualquer acesso a `admin.firestore()` por `adminDb`.

Validacao:

- Conferir se as rotas continuam recebendo `db`/`auth` corretamente.
- Rodar `npm run lint`.

### 5. Migrar modulo fiscal

Arquivos provaveis:

- `server/fiscal/fiscalRoutes.ts`
- `server/fiscal/types.ts`
- `server/fiscal/fiscalStore.ts`

O que fazer:

- Corrigir imports de tipos Firestore.
- Corrigir imports de tipos Auth.
- Garantir que as funcoes continuem recebendo a instancia correta do banco.

Validacao:

```bash
npm run lint
npm run build:server
```

### 6. Migrar modulo WhatsApp

Arquivos provaveis:

- `server/whatsapp/whatsappRoutes.ts`
- `server/whatsapp/types.ts`
- `server/whatsapp/whatsappStore.ts`

O que fazer:

- Corrigir imports de tipos Firestore.
- Corrigir imports de tipos Auth.
- Garantir que o modulo continue usando a mesma instancia Admin compartilhada.

Validacao:

```bash
npm run lint
npm run build:server
```

### 7. Resolver `scripts/temp-admin-test.ts`

Decisao necessaria:

- Se o script ainda for util, migrar para os imports modulares.
- Se for realmente temporario, remover do escopo do lint ou excluir o arquivo, somente com confirmacao.

Preferencia inicial:

- Corrigir o script sem remover, para preservar historico e evitar apagar algo que ainda pode ser util.

Validacao:

```bash
npm run lint
```

## Baixa

Status: concluido em 2026-07-01.

### 8. Atualizar documentacao tecnica

O que fazer:

- [x] Procurar referencias antigas a `admin.firestore()`, `admin.auth()` ou `admin.credential`.
- [x] Atualizar exemplos internos, se existirem.
- [x] Migrar scripts auxiliares que ainda usavam o padrao antigo fora do TypeScript.

Comando util:

```bash
rg -n "admin\\.firestore|admin\\.auth|admin\\.credential|firebase-admin" .
```

### 9. Padronizar nomes dos exports

Sugestao:

- [x] `adminDb` para Firestore Admin.
- [x] `adminAuth` para Auth Admin.
- [x] `adminApp` somente se algum arquivo realmente precisar da app inicializada.

Evitar:

- Varios arquivos inicializando Admin SDK por conta propria.
- Misturar imports modulares com imports antigos.

### 10. Validacao final

Rodar na ordem:

```bash
npm run lint
npm run build:server
npm run build:client
npm run test:offline
```

Resultado esperado:

- [x] `npm run lint` sem erros.
- [x] Backend compilando.
- [x] Frontend compilando.
- [x] Testes offline continuando verdes.

## Criterio de conclusao

Esta tarefa sera considerada concluida quando:

- [x] Todos os erros atuais de `firebase-admin` sumirem.
- [x] `npm run lint` passar.
- [x] `npm run build:server` passar.
- [x] Nenhuma mudanca de comportamento for introduzida nas rotas existentes.
- [x] As mudancas forem pequenas, rastreaveis e concentradas na migracao do Admin SDK.

## Separacao revisada dos arquivos

Status: revisado em 2026-07-01.

Observacao importante:

- [x] Nada foi colocado em stage com `git add`.
- [x] A separacao abaixo e um roteiro para commitar por tema.
- [x] O `package.json` foi corrigido para manter `firebase-admin` em `dependencies`, porque o servidor usa o pacote em runtime.
- [x] Se quiser um historico mais limpo, alguns arquivos com mudancas misturadas podem exigir `git add -p`.

### Commit 1: Firebase Admin SDK e tooling de regras

Status: pronto para commit.

Mensagem sugerida:

```bash
fix: migrar Firebase Admin SDK para imports modulares
```

Arquivos:

- [x] `package.json`
- [x] `package-lock.json`
- [x] `server/firebaseAdmin.ts`
- [x] `server.ts`
- [x] `server/dataResetRoutes.ts`
- [x] `server/fiscal/fiscalRoutes.ts`
- [x] `server/fiscal/types.ts`
- [x] `server/whatsapp/whatsappRoutes.ts`
- [x] `server/whatsapp/types.ts`
- [x] `server/whatsapp/whatsappStore.ts`
- [x] `scripts/temp-admin-test.ts`
- [x] `scripts/set-admin-claim.mjs`
- [x] `scripts/generate-client-removal-test-user.js`
- [x] `scripts/firestore-rules-validation.mjs`
- [x] `RELATORIO_INTERNO_WHATSAPP_IA.md`
- [x] `correcoes a ser feita.md`

Motivo:

- Remove `admin.credential`, `admin.firestore`, `admin.auth` e tipos antigos `admin.firestore.*`.
- Centraliza o Admin SDK em `server/firebaseAdmin.ts`.
- Mantem `firebase-admin` como dependencia de runtime.
- Inclui `@firebase/rules-unit-testing` porque ha teste de regras usando esse pacote.

Validacao exigida antes de commitar:

- [x] `npm run lint`
- [x] `npm run build:server`
- [x] `node --check scripts/set-admin-claim.mjs`
- [x] `node --check scripts/generate-client-removal-test-user.js`
- [x] `node --check scripts/firestore-rules-validation.mjs`

### Commit 2: PWA, icones e manifest

Status: concluido em 2026-07-07.

Mensagem sugerida:

```bash
feat: atualizar icones e manifest do PWA
```

Arquivos:

- [x] `index.html`
- [x] `public/manifest.json`
- [x] `public/motofix-logo.svg`
- [x] `public/motofix-icon.svg`
- [x] `src/components/layout/AppHeader.tsx`
- [x] `src/components/layout/SidebarNav.tsx`
- [x] `src/hooks/useNotifications.ts`

Motivo:

- Troca referencias de logo antigo por `/motofix-icon.svg`.
- Separa wordmark (`motofix-logo.svg`) de icone quadrado (`motofix-icon.svg`).
- Ajusta notificacoes para usar o novo icone.

Validacao realizada:

- [x] Conferidas referencias com `rg`.
- [x] `npm run lint`
- [x] `npm run build:client`

### Commit 3: Offline automatico e cache de assets

Status: concluido em 2026-07-07.

Mensagem sugerida:

```bash
feat: preparar dados e assets para uso offline automatico
```

Arquivos:

- [x] `OFFLINE_SYNC.md`
- [x] `public/sw.js`
- [x] `src/App.tsx`
- [x] `src/main.tsx`
- [x] `src/hooks/useAuthProfile.ts`
- [x] `src/hooks/useUserCollections.ts`
- [x] `src/hooks/useOfflineDataPreload.ts`
- [x] `src/services/offlineDataPreload.ts`
- [x] `src/services/serviceWorkerRegistration.ts`
- [x] `vite.config.ts`

Motivo:

- Registra service worker de forma centralizada.
- Gera manifest de assets offline no build.
- Pre-carrega dados principais do usuario no IndexedDB do Firestore.
- Evita apagar dados em memoria quando listeners falham offline.

Validacao exigida:

- [x] `npm run lint`
- [x] `npm run build:client`
- [x] `npm run test:offline`

Conferencia adicional:

- [x] `dist/offline-assets.json` gerado com assets do build.
- [x] `dist/sw.js` gerado com `APP_VERSION` substituido.

### Commit 4: Fila offline com retry de batches

Status: concluido em 2026-07-07, mas revisar junto com o commit de produtos porque `productRepository.ts` tambem tem mudancas de produto.

Mensagem sugerida:

```bash
fix: permitir replay offline de escritas em lote
```

Arquivos:

- [x] `scripts/offline-resilience-test.ts`
- [x] `src/services/firestoreOfflineQueue.ts`
- [x] `src/services/firestoreWriteReplay.ts`
- [x] `src/services/clientRepository.ts`
- [x] `src/services/maintenanceRepository.ts`
- [x] `src/services/productRepository.ts`

Motivo:

- Adiciona descritor de replay para batches.
- Permite retry seguro de arquivamento/restauracao em lote.
- Acrescenta cenario automatizado para batch retry.

Nota:

- [x] `src/services/productRepository.ts` tambem inclui apagar/restaurar varias mercadorias. Se quiser commit perfeito, usar `git add -p` para separar as partes de replay das partes de produto.

Validacao realizada:

- [x] `npm run test:offline` passou com 11 cenarios.

### Commit 5: Produtos, importacao e limpeza em massa

Status: concluido em 2026-07-07, mas `productRepository.ts` tem hunk misto com o Commit 4.

Mensagem sugerida:

```bash
feat: melhorar importacao e limpeza de mercadorias
```

Arquivos:

- [x] `src/components/layout/AppViewRenderer.tsx`
- [x] `src/components/products/ProductsView.tsx`
- [x] `src/hooks/useProductActions.ts`
- [x] `src/services/productRepository.ts`
- [x] `src/services/productSpreadsheet.ts`

Motivo:

- Adiciona acao para apagar mercadorias importadas em massa.
- Melhora mensagens de erro de importacao.
- Torna o parser de planilhas de mercadorias mais flexivel.

Nota:

- [x] Por causa do hunk misto em `productRepository.ts`, este commit e o Commit 4 podem ser combinados se a prioridade for simplicidade.

Validacao realizada:

- [x] `npm run lint`
- [x] `npm run build:client`
- [x] `npm run test:offline`

### Commit 6: Landing page e plano comercial

Status: concluido tecnicamente em 2026-07-07. Revisar copy comercial antes de publicar anuncios.

Mensagem sugerida:

```bash
feat: ajustar landing para plano fundador
```

Arquivos:

- [x] `src/components/auth/AuthScreen.tsx`
- [x] `PLANO_VENDAS_MOTOFIX.md`

Motivo:

- Remove promessas e metricas fortes que precisam de comprovacao.
- Ajusta oferta para Plano Fundador de R$ 49,90/mes.
- Direciona CTAs para WhatsApp/demo.

Nota:

- [x] Revisar copy comercial antes de publicar, porque muda posicionamento e preco percebido.

Validacao realizada:

- [x] Busca por precos antigos/placeholders na landing.
- [x] `npm run lint`
- [x] `npm run build:client`

### Commit 7: WhatsApp frontend de lembretes

Status: concluido em 2026-07-07.

Mensagem sugerida quando estiver completo:

```bash
feat: acionar lembretes WhatsApp pelo painel
```

Arquivos:

- [x] `src/components/whatsapp/WhatsAppView.tsx`
- [x] `src/modules/whatsapp/hooks/useWhatsAppConnection.ts`
- [x] `src/modules/whatsapp/interfaces/index.ts`
- [x] `src/modules/whatsapp/services/whatsappApi.ts`
- [x] `src/modules/whatsapp/routes/index.ts`
- [x] `server/whatsapp/whatsappRoutes.ts`
- [x] `server.ts`

Bloqueio encontrado e resolvido:

- [x] O frontend chama `POST /api/whatsapp/reminders/send-due`.
- [x] A rota backend correspondente foi adicionada em `server/whatsapp/whatsappRoutes.ts`.

Acao antes de commitar:

- [x] Implementar a rota backend autenticada para processar clientes elegiveis.
- [x] Registrar limite especifico para o envio de lembretes em `server.ts`.
- [x] Validar tipagem, build do servidor e build do frontend.

Validacao realizada:

- [x] `npm run lint`
- [x] `npm run build:server`
- [x] `npm run build:client`

### Commit 8: Firestore rules e scripts de validacao

Status: validacao completa concluida em 2026-07-07.

Mensagem sugerida:

```bash
test: adicionar validacoes de regras Firestore
```

Arquivos:

- [x] `firestore.rules`
- [x] `package.json`
- [x] `scripts/firestore-rules-scenarios.mjs`
- [x] `scripts/validate-firestore-rules.mjs`
- [x] `scripts/firestore-rules-validation.mjs`

Motivo:

- Adiciona validacoes manuais/automatizadas de cenarios de permissao.
- Corrige `hasAdminClaim()` para validar `request.auth.token.admin == true` sem quebrar quando a claim nao existe.
- Corrige a regra de `invoiced` para aceitar lancamentos de caixa antigos sem esse campo opcional.
- Renomeia scripts temporarios da raiz para nomes definitivos dentro de `scripts/`.
- Adiciona comandos `test:rules`, `test:rules:static` e `test:rules:scenarios`.

Nota:

- [x] `tmp-firestore-rules-validation.mjs` foi renomeado para `scripts/firestore-rules-validation.mjs`.
- [x] `validate-firestore-rules.js` foi renomeado para `scripts/validate-firestore-rules.mjs`.
- [x] `test-scenarios.js` foi renomeado para `scripts/firestore-rules-scenarios.mjs`.
- [x] `npm run test:rules` passou no emulador Firestore.

Validacao realizada:

- [x] `npm run test:rules:static`
- [x] `npm run test:rules:scenarios`
- [x] `npm run test:rules`
- [x] `node --check scripts/firestore-rules-validation.mjs`
- [x] `node --check scripts/validate-firestore-rules.mjs`
- [x] `node --check scripts/firestore-rules-scenarios.mjs`
- [x] `npm run lint`

### Commit 9: Firebase Hosting e deploy

Status: parcialmente corrigido em 2026-07-07; falta confirmar projeto default e destino do cache de deploy.

Mensagem sugerida:

```bash
chore: atualizar configuracao do Firebase Hosting
```

Arquivos:

- [x] `.firebaserc`
- [x] `firebase.json`
- [x] `.firebase/hosting.ZGlzdA.cache`
- [x] `public/index.html`

Alertas:

- [ ] `.firebaserc` troca o projeto default de `motofix-2-local` para `appmotofix`. Confirmar se este e o projeto correto de deploy.
- [x] `firebase.json` voltou a ignorar arquivos sensiveis como service account, PEM/P12/PFX, chaves e backups.
- [ ] `.firebase/hosting.ZGlzdA.cache` e cache gerado de deploy/build. Nao commitar sem decisao explicita.
- [x] `public/index.html` era a pagina padrao do Firebase Hosting e foi removido para nao competir com o `index.html` do Vite.

Recomendacao:

- Nao commitar este bloco sem revisar intencao de deploy.
- Confirmar se `.firebaserc` deve apontar para `appmotofix` ou voltar para `motofix-2-local`.
- Nao incluir `.firebase/hosting.ZGlzdA.cache` em commit de codigo; se quiser limpar historico futuro, avaliar remover do controle de versao com `git rm --cached`.

Validacao realizada:

- [x] `npm run build:client`
- [x] `dist/index.html` conferido como app MotoFix/Vite.

### Commit 10: Limpeza da raiz do repositorio

Status: concluido em 2026-07-07.

Mensagem sugerida:

```bash
chore: limpar arquivos antigos da raiz
```

Arquivos mantidos na raiz:

- [x] Configuracoes essenciais: `.env.example`, `.firebaserc`, `.gitignore`, `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`.
- [x] Entradas do app: `index.html`, `server.ts`.
- [x] Documentacao viva: `README.md`, `DOCUMENTACAO.md`, `OFFLINE_SYNC.md`, `PLANO_VENDAS_MOTOFIX.md`, `correcoes a ser feita.md`.
- [x] Arquivos locais sensiveis/ignorados preservados: `.env`, `firebase-service-account.json`.

Arquivos arquivados em `docs/archive/`:

- [x] `ANALISE_TECNICA_COMPLETA_APP.md`
- [x] `auditoria final.md`
- [x] `AUDITORIA_INTEGRIDADE_DADOS.md`
- [x] `CEREBRO.md`
- [x] `CORRECOES_RECOMENDADAS.md`
- [x] `FASE2_VALIDATION.md`
- [x] `FASE2_VALIDATION_FINAL.md`
- [x] `GIT_PUSH_COMMANDS.md`
- [x] `PLANO_REDESIGN_LAYOUT.md`
- [x] `RELATORIO_INTERNO_WHATSAPP_IA.md`

Arquivos removidos:

- [x] Logs antigos da raiz (`*.log`, `*.err.log`, `*.out.log`).
- [x] `start-process-test.tmp`
- [x] `metadata.json`
- [x] `fix_new_client.js`
- [x] `replace_new_client.py`
- [x] `test-oil-ranking.js`
- [x] `test-firestore-rules.js`
- [x] `.firebase/`
- [x] `backup-current/`
- [x] `backup refatoracao atttsx/`

Arquivos/diretorios preservados por seguranca:

- [x] `backups/` foi preservado porque e um diretorio local ignorado com copias de seguranca.
- [x] `.env` e `firebase-service-account.json` foram preservados porque podem ser necessarios para rodar o backend local.

Validacao realizada:

- [x] Busca por referencias aos arquivos removidos/arquivados.
- [x] `README.md` atualizado para apontar o historico para `docs/archive/`.
- [x] `.gitignore` atualizado para evitar retorno de `.bak`, `.bak2`, `metadata.json`, backup solto e script legado.
- [x] `npm run lint`
- [x] `npm run build:server`
- [x] `npm run build:client`

### Commit 11: Historico completo com lancamentos caixa

Status: concluido em 2026-07-07.

Mensagem sugerida:

```bash
feat: incluir lancamentos caixa no historico
```

Arquivos:

- [x] `src/components/history/HistoryView.tsx`
- [x] `src/components/layout/AppViewRenderer.tsx`

Motivo:

- O historico de servicos mostrava apenas registros da aba `Servicos/Oleo`.
- Agora tambem agrupa e exibe lancamentos caixa/ordens de servico no historico do cliente.
- Registros vindos do caixa aparecem como eventuais, com origem visual propria, numero da OS quando existir, metodo de pagamento e botao para abrir o lancamento.
- Os filtros de periodo, cliente, recorrencia e tipo de servico passam a considerar tambem os lancamentos caixa.

Validacao realizada:

- [x] `npm run lint`
- [x] `npm run build:client`

### Commit 12: Filtro e cards expansivos na agenda de clientes

Status: concluido em 2026-07-07.

Mensagem sugerida:

```bash
feat: filtrar clientes na agenda
```

Arquivos:

- [x] `src/components/clients/ClientsScheduleView.tsx`

Motivo:

- Adiciona campo de pesquisa por nome na area superior da `Agenda de Clientes`.
- Mantem os cards recolhidos por padrao, mostrando somente nome e status.
- Ao clicar no cliente, o card expande e mostra moto, telefone, recorrencia, ultimo atendimento, debito e acoes de editar/deletar.
- O contador passa a acompanhar a quantidade filtrada e a tela mostra estado vazio quando nenhum cliente bate com a busca.

Validacao realizada:

- [x] `npm run lint`
- [x] `npm run build:client`

## Validacao executada

Status: atualizado em 2026-07-07.

- [x] `npm run lint`
- [x] `npm run build:server`
- [x] `npm run build:client`
- [x] `npm run test:offline`
- [x] `npm run test:rules:static`
- [x] `npm run test:rules:scenarios`
- [x] `npm run test:rules`
- [x] `node --check scripts/firestore-rules-validation.mjs`
- [x] `node --check scripts/validate-firestore-rules.mjs`
- [x] `node --check scripts/firestore-rules-scenarios.mjs`
- [x] `node --check scripts/set-admin-claim.mjs`
- [x] `node --check scripts/generate-client-removal-test-user.js`
- [x] `node --check scripts/firestore-rules-validation.mjs`

## Pendencias antes de commit/deploy

- [ ] Decidir se `Commit 4` e `Commit 5` serao separados com `git add -p` ou combinados.
- [x] Resolver o bloqueio do WhatsApp: frontend chama endpoint sem rota backend visivel.
- [ ] Confirmar se `.firebaserc` deve apontar para `appmotofix` ou voltar para `motofix-2-local`.
- [ ] Decidir se `.firebase/hosting.ZGlzdA.cache` deve ser removido dos commits de codigo.
- [x] Revisar `firebase.json` para restaurar ignores sensiveis.
- [x] Remover `public/index.html` padrao do Firebase Hosting.
- [x] Confirmar se scripts temporarios de regras devem ser renomeados ou mantidos.
- [x] Repetir `npm run test:rules` fora do sandbox.
- [x] Remover o script legado `test-firestore-rules.js` da raiz.
