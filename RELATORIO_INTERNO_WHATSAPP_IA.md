# Relatorio interno - Modulo WhatsApp + IA

Data: 2026-06-05
Projeto: MotoFix 2.0
Objetivo: mapear a arquitetura atual antes da implementacao do modulo WhatsApp multiempresa com automacao e IA.

## 1. Estrutura atual do projeto

O projeto usa React + TypeScript + Vite no frontend e Express + TypeScript no backend, com Firebase Auth, Firestore web SDK no cliente e Firebase Admin no servidor.

Arquivos centrais:

- `server.ts`: entrada Express, seguranca HTTP, rotas Stripe, rotas fiscais, Vite middleware em desenvolvimento e arquivos estaticos em producao.
- `server/httpSecurity.ts`: CORS, headers, body parser com limites, rate limit em memoria, 404 e error handler.
- `server/fiscal/*`: modulo fiscal isolado no backend, usando Focus NFe e Firestore Admin.
- `src/App.tsx`: orquestracao de hooks, estado global leve, autenticacao e renderizacao principal.
- `src/components/layout/AppViewRenderer.tsx`: roteamento interno por `AppView` com lazy loading.
- `src/hooks/useAuthProfile.ts`: autenticacao Firebase e carga/criacao de perfil.
- `src/hooks/useUserCollections.ts`: listeners Firestore das colecoes principais por usuario.
- `src/services/*Repository.ts`: operacoes Firestore do frontend.
- `firestore.rules`: regras por subcolecao em `users/{userId}`.

## 2. Rotas existentes

Rotas gerais:

- `GET /api/health`

Rotas Stripe:

- `GET /api/payments/publishable-key`
- `POST /api/payments/create-checkout`
- `GET /api/payments/session/:sessionId`
- `POST /api/payments/webhook`

Rotas fiscais:

- `GET /api/fiscal/health`
- `GET /api/fiscal/companies`
- `POST /api/fiscal/companies`
- `POST /api/fiscal/companies/:companyId/certificate`
- `POST /api/fiscal/nfse/manual`
- `POST /api/fiscal/nfse/from-cash-launch`
- `POST /api/fiscal/nfse/:invoiceId/sync`
- `POST /api/fiscal/nfse/:invoiceId/cancel`
- `GET /api/fiscal/invoices/:invoiceId/documents/:kind`

Padrao recomendado para WhatsApp:

- Criar `server/whatsapp/*` no backend, seguindo a arquitetura de `server/fiscal/*`.
- Registrar `registerWhatsAppRoutes(...)` em `server.ts` antes de `app.use("/api", apiNotFound)`.
- Criar `src/modules/whatsapp/*` no frontend para tipos, API client e hooks.

## 3. Autenticacao e permissoes

Frontend:

- Firebase Auth com Google.
- `useAuthProfile` carrega `users/{uid}`.
- Admin e identificado por custom claim `admin`.
- Usuario comum precisa de `isActive === true`.

Backend:

- Modulo fiscal valida `Authorization: Bearer <Firebase ID Token>`.
- Usa `firebase-admin` para `verifyIdToken`.
- Usuario ativo e checado em `users/{uid}.isActive`.
- Admin claim libera acesso administrativo.

Padrao recomendado para WhatsApp:

- Reutilizar middleware de autenticacao por Firebase ID token.
- Exigir usuario ativo.
- Nunca confiar em `userId` vindo do corpo da requisicao; sempre usar `decoded.uid`.

## 4. Firestore collections atuais

Subcolecoes por usuario usadas no app:

- `users/{userId}/clients`
- `users/{userId}/maintenances`
- `users/{userId}/warranties`
- `users/{userId}/appointments`
- `users/{userId}/expenses`
- `users/{userId}/products`
- `users/{userId}/cash_launches`
- `users/{userId}/settings/config`
- `users/{userId}/message_logs`
- `users/{userId}/fiscal_companies`
- `users/{userId}/fiscal_invoices`
- `users/{userId}/fiscal_logs`
- `users/{userId}/fiscal_private`
- `users/{userId}/fiscal_invoice_files`

Colecoes novas solicitadas:

- `users/{userId}/whatsapp_sessions`
- `users/{userId}/whatsapp_messages`
- `users/{userId}/whatsapp_contacts`
- `users/{userId}/whatsapp_automations`

Observacao de seguranca:

- Dados de sessao e possiveis tokens do WhatsApp devem ser gravados apenas pelo servidor.
- O cliente pode ler estado resumido, mensagens, contatos e automacoes, mas nao deve escrever diretamente em dados de sessao.

## 5. Sistema atual de WhatsApp

Hoje existe apenas fluxo manual:

- `AlertService.createWhatsAppUrl(...)` gera link `https://wa.me/...`.
- `useWhatsAppReminderActions` abre o link em nova aba.
- `AlertService.registerManualReminderAttempt(...)` grava `message_logs`.
- `HistoryView` lista logs de avisos enviados.

Nao existe ainda:

- Sessao propria da oficina.
- QR Code de conexao.
- Recebimento de mensagens.
- Envio automatico sem abrir `wa.me`.
- Robos/IA por conversa.
- Persistencia de contatos WhatsApp.

## 6. Dashboard atual

O dashboard foi reposicionado para prioridades:

- Clientes para contatar hoje.
- Clientes pendentes.
- Agendamentos de hoje.
- Garantias proximas.

Ele usa:

- `dailyPendingAlerts`
- `overdueClients`
- `pendingPaymentCount`
- `appointments`
- `warranties`
- `cashFlowStats`

O modulo WhatsApp deve se integrar naturalmente ao card "Clientes para contatar hoje" e aos logs/historico sem substituir o fluxo manual no primeiro passo.

## 7. Riscos tecnicos do Open-WA

`@open-wa/wa-automate` roda WhatsApp Web por automacao de navegador. Isso exige ambiente Node com processo persistente, memoria suficiente e armazenamento de sessao. Nao e adequado para Firebase Hosting puro.

Riscos:

- Cada oficina conectada pode manter um navegador/sessao em memoria.
- Escala multiempresa exige limite de sessoes por instancia e estrategia de fila.
- Sessao pode cair, QR pode expirar e reconexao precisa ser monitorada.
- Automacao via WhatsApp Web pode ser menos estavel que WhatsApp Business Cloud API.
- Tokens/sessoes nunca devem ir para o frontend ou para o repositorio.

Decisao arquitetural:

- Criar interface/adapter para WhatsApp Provider.
- Implementar Open-WA como provider inicial.
- Deixar estrutura preparada para trocar por WhatsApp Business Cloud API no futuro.

## 8. Arquitetura proposta

Backend:

- `server/whatsapp/types.ts`
- `server/whatsapp/whatsappStore.ts`
- `server/whatsapp/WhatsAppSessionService.ts`
- `server/whatsapp/WhatsAppAiService.ts`
- `server/whatsapp/whatsappRoutes.ts`

Frontend:

- `src/modules/whatsapp/types/index.ts`
- `src/modules/whatsapp/interfaces/index.ts`
- `src/modules/whatsapp/services/whatsappApi.ts`
- `src/modules/whatsapp/hooks/useWhatsAppConnection.ts`
- `src/modules/whatsapp/controllers/.gitkeep`
- `src/modules/whatsapp/repositories/.gitkeep`
- `src/modules/whatsapp/routes/.gitkeep`
- `src/modules/whatsapp/utils/phone.ts`

Rotas novas:

- `POST /api/whatsapp/connect`
- `GET /api/whatsapp/status`
- `GET /api/whatsapp/qrcode`
- `POST /api/whatsapp/disconnect`
- `POST /api/whatsapp/send`
- `GET /api/whatsapp/messages`
- `GET /api/whatsapp/contacts`
- `POST /api/whatsapp/reconnect`

Tambem criar alias defensivo para o texto digitado na solicitacao:

- `POST /api/whatsapp/reconnectentado`

## 9. Estrategia de implementacao segura

Fase inicial recomendada:

1. Criar tipos, store e rotas backend com autenticacao Firebase.
2. Instalar `@open-wa/wa-automate`.
3. Implementar servico de sessao com Map em memoria por `userId`.
4. Persistir status/mensagens/contatos no Firestore Admin.
5. Criar API client e hook frontend.
6. Adicionar regras Firestore para leitura controlada.
7. Validar `npm run lint` e `npm run build`.

Fase posterior:

1. Tela visual de conexao WhatsApp em Configuracoes ou Mais Ferramentas.
2. Painel de conversas.
3. Automacoes por tipo de evento.
4. IA contextual usando dados do cliente, retornos, pendencias e agenda.
5. Queue/worker para envio automatico.
6. Deploy em Cloud Run ou outro host Node persistente.

## 10. Recomendacoes antes de producao

- Separar credenciais e sessoes em armazenamento privado.
- Adicionar rate limit especifico para envio WhatsApp.
- Registrar logs de envio/recebimento com redacao de dados sensiveis quando necessario.
- Criar politicas de consentimento do cliente.
- Preparar monitoramento de sessoes conectadas.
- Evitar iniciar centenas de sessoes Open-WA na mesma instancia.
- Documentar que Firebase Hosting sozinho nao executa o modulo Open-WA.

## 11. Implementacao realizada nesta rodada

- Dependencias instaladas: `@open-wa/wa-automate@4.76.0`, `qrcode` e `@types/qrcode`.
- Backend criado em `server/whatsapp` com:
  - `WhatsAppSessionService` para criar, encerrar, reconectar e monitorar sessoes por usuario.
  - `WhatsAppAiService` para respostas automaticas via endpoint compativel com Chat Completions quando `WHATSAPP_AI_API_KEY` ou `OPENAI_API_KEY` estiver configurada.
  - `whatsappStore` para gravar sessoes, mensagens, contatos e automacoes em subcolecoes do usuario.
  - `whatsappRoutes` com endpoints `/api/whatsapp/*` protegidos por Firebase Auth.
- Frontend criado em `src/modules/whatsapp` com tipos, cliente HTTP, hook, rotas e utilitarios.
- Regras Firestore atualizadas para leitura do proprio usuario e escrita de dados operacionais apenas pelo backend Admin.
- `.env.example` recebeu as variaveis do modulo WhatsApp/IA.
- `.gitignore` foi reforcado para impedir versionamento de sessoes/caches do Open-WA.

Observacao de risco: o `npm install` reportou vulnerabilidades vindas da arvore de dependencias, especialmente por causa do ecossistema de automacao de navegador. Antes de producao, rodar `npm audit`, avaliar mitigacoes e considerar isolar o processo WhatsApp em worker/servico separado.
