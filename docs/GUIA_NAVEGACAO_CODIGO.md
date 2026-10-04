# Guia de Navegacao do Codigo MotoFix

**Auditoria de codigo:** 2026-10-03  
**Escopo:** frontend React/TypeScript, API Express, Firebase/Firestore, Cloud Functions, scripts e fluxos operacionais.  
**Objetivo:** reduzir a busca inicial para manutencoes futuras, indicando o componente, o estado/rota, a cadeia de chamada e a camada que realmente decide ou persiste o comportamento.

> Fonte de verdade: o codigo atual e os testes ligados a ele. Este documento e um mapa de entrada, nao substitui a leitura da implementacao nem uma nova validacao depois de mudancas. Os arquivos de auditoria historicos na raiz podem descrever outro estado do projeto.

## Busca Rapida

1. Identifique a tela ou comportamento na tabela [Views da aplicacao](#views-da-aplicacao).
2. Siga a cadeia **tela -> callback -> hook -> servico/repositorio/API -> Firestore ou servidor**. `AppViewRenderer` conecta telas e callbacks; `App.tsx` cria hooks e injeta os dados.
3. Para dados sincronizados, confira o listener em `useUserCollections`, o repositorio que grava e a regra correspondente em `firestore.rules`.
4. Para uma chamada HTTP, confirme o cliente e o handler servidor: caminhos parecidos nao garantem que a rota exista nem que seja publicada no mesmo ambiente.
5. Procure teste/comando na secao [Validacao](#validacao) e rode o menor check relevante antes de ampliar a mudanca.

Busca recomendada no workspace:

```sh
rg -n "nomeDaView|nomeDoCallback|nomeDoCampo|/api/caminho" src server functions firestore.rules scripts
```

**Entrada do frontend:** [`src/main.tsx`](../src/main.tsx) monta React e registra o service worker; [`src/App.tsx`](../src/App.tsx) e o orquestrador autenticado; [`src/components/layout/AppViewRenderer.tsx`](../src/components/layout/AppViewRenderer.tsx) resolve a view interna.

## Arquitetura em Uma Passada

```text
src/main.tsx
  -> src/App.tsx
       -> useAuthProfile()                 Auth, perfil e billing
       -> useUserCollections()             listeners Firestore por usuario
       -> hooks de acoes                    callbacks de dominio
       -> gates de assinatura/modulos
       -> AppShell                          navegacao, header e layout
       -> AppViewRenderer                   view atual e injecao de callbacks/dados
            -> componente de tela lazy
                 -> hook de acao
                      -> repository/API
                           -> Firestore ou endpoint Express
```

- Nao existe React Router nem tabela de URLs por modulo. A navegacao principal usa `AppView` em estado React ([`types.ts`](../src/types.ts#L11), [`useAppShellState.ts`](../src/hooks/useAppShellState.ts#L14)). Links de tela sao valores como `cash-register`, nao URLs.
- `SidebarNav` e a navegacao desktop; `BottomNav` e a mobile. Ambos chamam `onViewChange` ([`SidebarNav.tsx`](../src/components/layout/SidebarNav.tsx#L28), [`BottomNav.tsx`](../src/components/layout/BottomNav.tsx#L34)).
- Os componentes de tela sao importados com `lazy()` pelo renderizador e mostram `ViewLoadingFallback` durante a carga ([`AppViewRenderer.tsx`](../src/components/layout/AppViewRenderer.tsx#L1)).
- Telas sem entrada no menu podem ser abertas por callbacks de outras telas: formularios, detalhe de dashboard, checkout e relatorios sao exemplos.
- A autenticacao e o bloqueio de assinatura acontecem antes do `AppShell`; `AuthScreen`, `LoadingScreen` e `BlockedAccessScreen` nao sao views comuns ([`App.tsx`](../src/App.tsx#L272)).

## Views da Aplicacao

Os IDs oficiais estao em [`AppView`](../src/types.ts#L11). A implementacao e a fonte final dos fluxos em [`AppViewRenderer`](../src/components/layout/AppViewRenderer.tsx#L303).

| `AppView` | Tela | O que procurar primeiro |
|---|---|---|
| `dashboard` | `DashboardView` | Resumo, prioridades e atalhos; fonte das metricas: `useMaintenanceStats` e `useAppDerivedData` ([render](../src/components/layout/AppViewRenderer.tsx#L303)). |
| `dashboard-revenue` | `DashboardRevenueView` | Detalhamento das metricas de receita ([render](../src/components/layout/AppViewRenderer.tsx#L374)). |
| `dashboard-recurring` | `DashboardRecurringView` | Receita recorrente e manutencoes ([render](../src/components/layout/AppViewRenderer.tsx#L384)). |
| `dashboard-services` | `DashboardServicesView` | Servicos e metricas ([render](../src/components/layout/AppViewRenderer.tsx#L394)). |
| `returns` | `ReturnsView` | Retornos, cliente vencido e registro de servico ([render](../src/components/layout/AppViewRenderer.tsx#L333)). |
| `pendencies` | `PendenciesView` | Saldos em aberto; pagamento de manutencao e abertura da O.S. ([render](../src/components/layout/AppViewRenderer.tsx#L358)). |
| `clients` | `ClientsView` | Servicos/oleo, pesquisa, filtros, cliente e manutencao ([render](../src/components/layout/AppViewRenderer.tsx#L404)). |
| `new-client` | `ClientForm` | Cadastro/edicao e fluxo de novo servico ([render](../src/components/layout/AppViewRenderer.tsx#L723)). |
| `clients-schedule` | `ClientsScheduleView` | Lista/cadastro de clientes e saldos ([render](../src/components/layout/AppViewRenderer.tsx#L538)). |
| `clients-schedule-add` | `ClientScheduleForm` | Formulario de cadastro/edicao iniciado pela agenda de clientes ([render](../src/components/layout/AppViewRenderer.tsx#L560)). |
| `appointments` | `AppointmentsView` | Calendario, formulario, concluir e excluir agendamento ([render](../src/components/layout/AppViewRenderer.tsx#L513)). |
| `cash-register` | `CashRegisterView` | O.S., pagamento, caixa, estoque e faturamento fiscal ([render](../src/components/layout/AppViewRenderer.tsx#L440)). |
| `products` | `ProductsView` | Catalogo, variacoes, importacao, exclusao e estoque ([render](../src/components/layout/AppViewRenderer.tsx#L474)). |
| `expenses` | `ExpensesView` | Lancamento e consulta de gastos ([render](../src/components/layout/AppViewRenderer.tsx#L601)). |
| `history` | `HistoryView` | Historico de manutencoes/O.S., cobranca e relatorios ([render](../src/components/layout/AppViewRenderer.tsx#L574)). |
| `report` | `ReportView` | Relatorio ligado ao dashboard, acessado pelo historico ([render](../src/components/layout/AppViewRenderer.tsx#L626)). |
| `general-report` | `GeneralReportView` | Relatorio geral, restrito a admin ([render e guarda](../src/components/layout/AppViewRenderer.tsx#L636)). |
| `warranties` | `WarrantiesView` | Consulta, emissao de PDF, abrir formulario e excluir ([render](../src/components/layout/AppViewRenderer.tsx#L656)). |
| `new-warranty` | `WarrantyForm` | Criar/editar garantia ([render](../src/components/layout/AppViewRenderer.tsx#L671)). |
| `settings` | `SettingsView` | Perfil da oficina, configuracao, backup/importacao e reset operacional ([render](../src/components/layout/AppViewRenderer.tsx#L685)). |
| `new-service` | Sem branch de view independente | Token legado do tipo; o fluxo atual usa `isNewService` junto de `new-client`/`ClientForm`, nao `setView('new-service')`. |
| `fiscal` | `FiscalView` | Configuracao fiscal e notas; depende de flag/email/admin ([render](../src/components/layout/AppViewRenderer.tsx#L493)). |
| `admin` | `AdminView` | Usuarios e assinatura; somente admin ([render](../src/components/layout/AppViewRenderer.tsx#L758)). |
| `financial-health` | `FinancialHealthView` | Indicadores financeiros e metas; somente admin ([render](../src/components/layout/AppViewRenderer.tsx#L772)). |
| `checkout` | `CheckoutScreen` | Checkout Stripe ([render](../src/components/layout/AppViewRenderer.tsx#L748)). |
| `whatsapp` | Sem branch atual no renderizador | O tipo existe, mas a busca no codigo atual nao encontrou `setView('whatsapp')` nem branch `view === 'whatsapp'`. A integracao WhatsApp atual e por servicos/endpoints e telas de outras views. |
| `subscription-expired` | Sem branch de view atual | O bloqueio e exibido por `BlockedAccessScreen` como retorno antecipado de `App.tsx`, nao por `AppViewRenderer`. |

### Guards e Navegacao

- `handleViewChange` barra `fiscal` sem acesso, `general-report` sem role admin e `admin` sem role admin ([`App.tsx`](../src/App.tsx#L98)). O renderizador tambem verifica role/flag em views sensiveis: manter ambos os lados consistentes.
- A flag fiscal e definida por `VITE_FISCAL_MODULE_ENABLED`, lista `VITE_FISCAL_BETA_EMAILS` e admin ([`src/config/fiscal.ts`](../src/config/fiscal.ts)).
- A assinatura e calculada por `getSubscriptionGateState` ([`useSubscriptionStatus.ts`](../src/hooks/useSubscriptionStatus.ts#L38)); `App.tsx` escolhe checkout/bloqueio antes de renderizar a shell.
- Os menus desktop e mobile nao listam todas as views. Ao criar uma tela, conferir o tipo `AppView`, o branch do renderizador e o ponto de entrada/retorno; adicionar menu somente se fizer parte da navegacao principal.

## Cadeias de Chamadas por Dominio

O padrao mais comum e `componente -> callback prop -> hook em App.tsx -> repository/service`. Para corrigir a regra, prefira a camada que calcula ou persiste o dado, nao apenas o botao.

| Dominio | UI / entrada | Coordenador e regra | Persistencia / integracao |
|---|---|---|---|
| Auth/perfil | `AuthScreen`, `BlockedAccessScreen` | [`useAuthProfile`](../src/hooks/useAuthProfile.ts#L67) carrega auth, claims e `users/{uid}`; [`App.tsx`](../src/App.tsx#L272) controla early returns | Firebase Auth/Firestore via [`firebase.ts`](../src/firebase.ts). |
| Clientes | `ClientsView`, `ClientForm`, `ClientsScheduleView`, `ClientScheduleForm` | [`useClientActions`](../src/hooks/useClientActions.ts#L100), [`useClientFormState`](../src/hooks/useClientFormState.ts#L21), [`useClientFlow`](../src/hooks/useClientFlow.ts#L12) | [`clientRepository`](../src/services/clientRepository.ts#L37), [`clientSaveService`](../src/services/clientSaveService.ts). Cadastro com manutencao pode gravar cliente e historico no fluxo especializado `saveWithMaintenance`. |
| Manutencoes/oleo | `ClientsView`, `ReturnsView`, `PendenciesView`, `HistoryView` | [`useMaintenanceActions`](../src/hooks/useMaintenanceActions.ts#L48): `addMaintenance`, `deleteMaintenance`, `confirmPayment`, `settleDebt`; status/recorrencia em [`maintenanceStatus`](../src/lib/maintenanceStatus.ts) e `useMaintenanceStats` | [`maintenanceRepository`](../src/services/maintenanceRepository.ts#L18); atualizacao derivada do cliente em `clientRepository`. |
| Agenda | `AppointmentsView` | [`useAppointmentActions`](../src/hooks/useAppointmentActions.ts#L24): salvar, concluir, excluir e manter rascunho | [`appointmentRepository`](../src/services/appointmentRepository.ts#L12). |
| Caixa/O.S. | `CashRegisterView`, `PendenciesView`, `HistoryView` | [`useCashRegisterActions`](../src/hooks/useCashRegisterActions.ts#L21): `saveLaunch`, importacao de produtos e exclusao; calculos de pagamento em [`cashPayments`](../src/lib/cashPayments.ts) | [`cashRegisterRepository`](../src/services/cashRegisterRepository.ts#L368), validacao em [`cashRegisterValidation`](../src/services/cashRegisterValidation.ts), transacoes/estoque no mesmo repositorio, estado local em [`localCashLaunchRepository`](../src/services/localCashLaunchRepository.ts). |
| Gastos | `ExpensesView` | [`useExpenseActions`](../src/hooks/useExpenseActions.ts#L17): `saveExpense`, `deleteExpense`, reset/form state | [`expenseRepository`](../src/services/expenseRepository.ts#L12); registra evento em `operationalLogRepository`. |
| Produtos/estoque | `ProductsView`, seletor do caixa | [`useProductActions`](../src/hooks/useProductActions.ts#L14): salvar/importar/excluir/restaurar | [`productRepository`](../src/services/productRepository.ts#L70); XLSX em [`productSpreadsheet`](../src/services/productSpreadsheet.ts); movimento de estoque associado a O.S. no cash repository. |
| Garantias | `WarrantiesView`, `WarrantyForm` | [`useWarrantyActions`](../src/hooks/useWarrantyActions.ts#L22): CRUD, calculo de vencimento, PDF e confirmacao remota para gerar PDF | [`warrantyRepository`](../src/services/warrantyRepository.ts#L17), guarda PDF em [`warrantyPdfGuard`](../src/services/warrantyPdfGuard.ts). |
| Configuracoes/reset | `SettingsView`, setup de perfil | [`useSettingsActions`](../src/hooks/useSettingsActions.ts#L24) | [`settingsRepository`](../src/services/settingsRepository.ts#L10); reset passa por [`operationalDataResetApi`](../src/services/operationalDataResetApi.ts) e backend. |
| Admin/assinatura | `AdminView`, `CheckoutScreen` | [`useAdminActions`](../src/hooks/useAdminActions.ts#L14), [`useSubscriptionStatus`](../src/hooks/useSubscriptionStatus.ts#L53) | `userRepository`; Stripe via [`stripeService`](../src/services/stripeService.ts). Campos de billing nao devem ser gravados pelo cliente sem revisar regras e webhook. |
| Fiscal | `FiscalView`, opcionalmente finalizacao da O.S. | [`useFiscalActions`](../src/hooks/useFiscalActions.ts#L28) | [`fiscalApi`](../src/services/fiscalApi.ts#L65) -> `server/fiscal/fiscalRoutes.ts` -> `focusClient.ts`/`fiscalStore.ts`; documentos e credenciais sao geridos no backend. |
| WhatsApp | Acoes/reminders em dashboard, retorno e cliente | [`useWhatsAppReminderActions`](../src/hooks/useWhatsAppReminderActions.ts#L19), cliente/API em [`src/modules/whatsapp`](../src/modules/whatsapp) | [`whatsappRoutes.ts`](../server/whatsapp/whatsappRoutes.ts#L365), `WhatsAppSessionService.ts`, `whatsappStore.ts`, `whatsappRemindersService.ts`. Rotas HTTP do WhatsApp so sao registradas no servidor quando `NODE_ENV !== production` no `server.ts`. |
| Relatorios/metricas | `DashboardView`, `GeneralReportView`, `FinancialHealthView` | [`useMaintenanceStats`](../src/hooks/useMaintenanceStats.ts#L57), [`useAppDerivedData`](../src/hooks/useAppDerivedData.ts#L15), [`useFinancialHealth`](../src/hooks/useFinancialHealth.ts#L38) | Em geral derivados em memoria dos listeners. Para alterar uma regra contabil, procurar todos os consumidores do campo, nao somente o card visivel. |

### Fluxos que merecem cuidado

- **O.S. e estoque:** finalizar uma O.S. pode alterar `cash_launches`, produto e `stock_movements` em transacao. Revisar `cashRegisterRepository.ts`, as regras Firestore e o teste `scripts/stock-flow-test.mjs` juntos.
- **Cliente + servico:** o formulario pode criar/editar perfil do cliente e manutencao no mesmo comando. O fluxo especializado esta em `clientSaveService.ts`/`clientRepository.ts`; nao substituir por dois writes avulsos sem entender as garantias atuais.
- **Pagamento de manutencao vs O.S.:** `MaintenanceRecord` e `CashRegisterLaunch` sao modelos separados, com formulas/atualizacao diferentes. Ver `useMaintenanceActions`, `cashPayments.ts`, `PendenciesView.tsx` e `GeneralReportView.tsx`.
- **Soft delete:** excluir significa atualizar metadados e ocultar no listener; o `deleteDoc` fisico e negado nas regras. A restauracao e um caminho separado.
- **Rascunhos:** `localDrafts.ts` usa `localStorage`; rascunho local nao equivale a documento salvo no Firestore.
- **Fiscal:** status, acesso e campos fiscais tem regras mais restritas que CRUD operacional. Seguir a cadeia completa UI -> `fiscalApi` -> handler -> store.

## Dados e Persistencia

### Listener principal

[`useUserCollections`](../src/hooks/useUserCollections.ts#L123) monta e desmonta listeners `onSnapshot` conforme usuario/perfil. A criacao dos listeners comeca proximo de [`useUserCollections.ts#L207`](../src/hooks/useUserCollections.ts#L207). `mapActiveDocuments` remove registros com `deletedAt`; `cash_launches` e mesclado com armazenamento local e ordenado por `updatedAt/createdAt`. Falhas ficam em `collectionListenerIssues` e aparecem no `AppShell`.

### Colecoes atuais

Todos os dados operacionais do usuario ficam sob `users/{uid}`. Veja a declaracao das regras em [`firestore.rules`](../firestore.rules#L1119), os listeners em [`useUserCollections.ts`](../src/hooks/useUserCollections.ts#L207) e os contratos em [`types.ts`](../src/types.ts).

| Caminho | Modelo / consumidor | Notas |
|---|---|---|
| `users/{uid}` | `UserProfile`; `useAuthProfile`, admin e billing | Perfil e assinatura. `role` em documento nao e prova suficiente de admin para regras; custom claim e validada. |
| `users/{uid}/clients` | `Client`; clientes, manutencoes e agenda | Inclui datas recorrentes, status e campos legados/espelhados de ultimo servico. |
| `users/{uid}/maintenances` | `MaintenanceRecord`; historico, retorno, financeiro | Servico/oleo e pagamento de manutencao. |
| `users/{uid}/appointments` | `Appointment`; agenda | Agendamentos e `completed`. |
| `users/{uid}/expenses` | `ExpenseRecord`; gastos e relatorios | `date` determina o periodo contabil de despesa; `createdAt` e auditoria de criacao. |
| `users/{uid}/cash_launches` | `CashRegisterLaunch`; caixa, pendencias, relatorios/fiscal | O.S., pagamento, fiscal, baixa de estoque; campo `paidAt` existe para data de recebimento. |
| `users/{uid}/products` | `ProductCatalogItem`; catalogo e estoque | Variacoes e quantidade de estoque. |
| `users/{uid}/stock_movements` | `StockMovement`; cash repository | Registro de baixa/estorno; escrita criada no fluxo transacional de caixa. |
| `users/{uid}/warranties` | `Warranty`; garantias/PDF | CRUD operacional e soft delete. |
| `users/{uid}/message_logs` | `MessageLog`; historico de lembretes | Log do envio/abertura, distinto das mensagens da integracao WhatsApp. |
| `users/{uid}/settings/config` | `Settings`; configuracao | Documento unico, com categorias, perfil, metas e preferencia operacional. |
| `users/{uid}/operational_logs` | `OperationalLog`; historico/auditoria | Criado por acoes selecionadas; nao e log completo de toda mutacao. |
| `users/{uid}/fiscal_companies`, `fiscal_invoices`, `fiscal_logs` | modelos fiscais | Leitura do cliente; escrita bloqueada por regras e feita pelo backend. |
| `users/{uid}/fiscal_private/**`, `fiscal_invoice_files/**` | segredos/artefatos fiscais | Acesso direto do cliente negado. |
| `users/{uid}/whatsapp_sessions`, `whatsapp_messages`, `whatsapp_contacts` | estado da integracao WhatsApp | Escrita direta bloqueada; backend e dono do fluxo. |
| `users/{uid}/whatsapp_automations` | automacoes | CRUD sujeito a allowlist da regra. |

Admins tambem instalam listener sobre a colecao raiz `users` para o painel administrativo, somente quando `role === 'admin'` e `isActive` ([`useUserCollections.ts`](../src/hooks/useUserCollections.ts#L377)).

### Auth, Firestore e Offline

- Firebase Auth usa persistencia local e Google provider; Firestore inicializa cache persistente IndexedDB quando possivel ([`firebase.ts`](../src/firebase.ts#L1)).
- [`firestoreOfflineQueue.ts`](../src/services/firestoreOfflineQueue.ts#L1) acompanha escritas, confirma pendencias, registra falhas e repete replay descriptors. Os destinos de replay sao validados para documento dentro de `users/...`.
- A fila de writes nao e a mesma coisa que o cache de leitura Firestore. `offlineDataPreload.ts` pre-carrega dados para cache e `useOfflineDataPreload.ts` reexecuta por online/visibilidade/tempo.
- [`localDrafts.ts`](../src/services/localDrafts.ts#L1) guarda formularios incompletos no `localStorage`; `localCashLaunchRepository.ts` guarda O.S. localmente. Cash merge e resolvido em `useUserCollections.ts`.
- O service worker e registrado por `main.tsx` via [`serviceWorkerRegistration.ts`](../src/services/serviceWorkerRegistration.ts#L55); o asset esta em `public/sw.js`, manifesto de precache e gerado no build por `vite.config.ts`.

## API HTTP do Servidor

O servidor inicia em [`server.ts`](../server.ts#L1). A ordem importa: request ID/security headers/CORS/limites primeiro; rotas Stripe antes do parser JSON para verificar assinatura raw; depois Fiscal, WhatsApp (apenas fora de producao), backup e reset; por fim 404/error handler e Vite middleware em desenvolvimento ou `dist` + fallback SPA em producao.

A maioria das rotas protegidas recebe `Authorization: Bearer <Firebase ID token>` e valida o usuario no handler. O webhook Stripe usa assinatura Stripe, nao o bearer do usuario.

| Metodo e caminho | Responsabilidade | Handler |
|---|---|---|
| `GET /api/health` | Health do Express | [`server.ts`](../server.ts#L42) |
| `POST /api/stripe/create-checkout-session` | Criar checkout | [`stripeBilling.ts`](../server/stripeBilling.ts#L263) |
| `GET /api/stripe/subscription` | Consultar assinatura | [`stripeBilling.ts`](../server/stripeBilling.ts#L349) |
| `POST /api/stripe/cancel-subscription` | Cancelar no fim do periodo | [`stripeBilling.ts`](../server/stripeBilling.ts#L373) |
| `POST /api/stripe/create-customer-portal-session` | Portal do cliente Stripe | [`stripeBilling.ts`](../server/stripeBilling.ts#L416) |
| `POST /api/stripe/webhook` | Atualizacao assincrona Stripe | [`stripeBilling.ts`](../server/stripeBilling.ts#L424) |
| `GET /api/fiscal/health` | Health fiscal | [`fiscalRoutes.ts`](../server/fiscal/fiscalRoutes.ts#L293) |
| `GET /api/fiscal/companies` | Listar empresas fiscais | [`fiscalRoutes.ts`](../server/fiscal/fiscalRoutes.ts#L303) |
| `POST /api/fiscal/companies` | Salvar empresa fiscal | [`fiscalRoutes.ts`](../server/fiscal/fiscalRoutes.ts#L313) |
| `POST /api/fiscal/companies/:companyId/certificate` | Enviar certificado/credenciais | [`fiscalRoutes.ts`](../server/fiscal/fiscalRoutes.ts#L349) |
| `POST /api/fiscal/nfse/manual` | Solicitar NFS-e manual | [`fiscalRoutes.ts`](../server/fiscal/fiscalRoutes.ts#L386) |
| `POST /api/fiscal/nfse/from-cash-launch` | Emitir a partir de O.S. | [`fiscalRoutes.ts`](../server/fiscal/fiscalRoutes.ts#L412) |
| `POST /api/fiscal/nfse/:invoiceId/sync` | Sincronizar status | [`fiscalRoutes.ts`](../server/fiscal/fiscalRoutes.ts#L463) |
| `POST /api/fiscal/nfse/:invoiceId/cancel` | Cancelar documento | [`fiscalRoutes.ts`](../server/fiscal/fiscalRoutes.ts#L490) |
| `GET /api/fiscal/invoices/:invoiceId/documents/:kind` | Baixar XML/PDF | [`fiscalRoutes.ts`](../server/fiscal/fiscalRoutes.ts#L520) |
| `GET /api/whatsapp/health` | Health WhatsApp | [`whatsappRoutes.ts`](../server/whatsapp/whatsappRoutes.ts#L368) |
| `POST /api/whatsapp/connect` | Conectar sessao | [`whatsappRoutes.ts`](../server/whatsapp/whatsappRoutes.ts#L377) |
| `GET /api/whatsapp/status` | Estado da sessao | [`whatsappRoutes.ts`](../server/whatsapp/whatsappRoutes.ts#L387) |
| `GET /api/whatsapp/qrcode` | QR de conexao | [`whatsappRoutes.ts`](../server/whatsapp/whatsappRoutes.ts#L398) |
| `POST /api/whatsapp/disconnect` | Encerrar sessao | [`whatsappRoutes.ts`](../server/whatsapp/whatsappRoutes.ts#L408) |
| `POST /api/whatsapp/reconnect` | Reconectar sessao | [`whatsappRoutes.ts`](../server/whatsapp/whatsappRoutes.ts#L419) |
| `POST /api/whatsapp/reconnectentado` | Compatibilidade legado/dev | [`whatsappRoutes.ts`](../server/whatsapp/whatsappRoutes.ts#L429) |
| `POST /api/whatsapp/send` | Enviar mensagem | [`whatsappRoutes.ts`](../server/whatsapp/whatsappRoutes.ts#L439) |
| `POST /api/whatsapp/reminders/send-due` | Processar lembretes vencidos | [`whatsappRoutes.ts`](../server/whatsapp/whatsappRoutes.ts#L451) |
| `GET /api/whatsapp/messages` | Consultar mensagens | [`whatsappRoutes.ts`](../server/whatsapp/whatsappRoutes.ts#L461) |
| `GET /api/whatsapp/contacts` | Consultar contatos | [`whatsappRoutes.ts`](../server/whatsapp/whatsappRoutes.ts#L471) |
| `GET /api/whatsapp/automations` | Consultar automacoes | [`whatsappRoutes.ts`](../server/whatsapp/whatsappRoutes.ts#L481) |
| `PUT /api/whatsapp/automations` | Salvar automacoes | [`whatsappRoutes.ts`](../server/whatsapp/whatsappRoutes.ts#L491) |
| `GET /api/backup/full` | Exportar backup completo | [`backupRoutes.ts`](../server/backupRoutes.ts#L216) |
| `POST /api/backup/full/restore` | Restaurar backup validado | [`backupRoutes.ts`](../server/backupRoutes.ts#L274) |
| `POST /api/data-reset/operational` | Arquivar/resetar dados operacionais | [`dataResetRoutes.ts`](../server/dataResetRoutes.ts#L199) |

**Clientes HTTP frontend:** [`stripeService.ts`](../src/services/stripeService.ts), [`fiscalApi.ts`](../src/services/fiscalApi.ts), [`systemBackupApi.ts`](../src/services/systemBackupApi.ts), [`operationalDataResetApi.ts`](../src/services/operationalDataResetApi.ts) e [`src/modules/whatsapp/services/whatsappApi.ts`](../src/modules/whatsapp/services/whatsappApi.ts).

## Seguranca e Integracoes

- Regras Firestore: [`firestore.rules`](../firestore.rules#L1119). Principios: negar por padrao; admin por custom claim `admin`; ownership por UID; schemas/allowlists por colecao; delete fisico negado; subcolecoes fiscais privadas sem acesso direto. Alterar um campo de modelo pode exigir atualizar tipos, shape/allowlist de regra e teste de regra juntos.
- [`functions/index.js`](../functions/index.js#L9) tem trigger Firestore `users/{uid}` onWrite para sincronizar custom claims `admin` e `isActive`; nao e API HTTP.
- O sync remove `admin`/`isActive` antigos antes de reconstruir claims; perfil desativado ou rebaixado nao preserva privileges gerenciados. Firestore e APIs conferem tambem o perfil atual para nao depender de token antigo.
- Rotas Stripe: consultar o [cliente Stripe](../src/services/stripeService.ts) e os handlers em [`server/stripeBilling.ts`](../server/stripeBilling.ts). O README ainda cita paths legados `/api/payments/...`; o codigo atual usa `/api/stripe/...`.
- Fiscal: frontend e backend exigem flags (`VITE_FISCAL_MODULE_ENABLED`/`FISCAL_MODULE_ENABLED`) e admin ativo ou email beta permitido (`VITE_FISCAL_BETA_EMAILS`/`FISCAL_BETA_EMAILS`); segredo Focus NFe/certificado fica no backend. Comecar em [`src/config/fiscal.ts`](../src/config/fiscal.ts), `fiscalApi.ts`, `server/fiscal/fiscalRoutes.ts`, `focusClient.ts` e `fiscalStore.ts`.
- WhatsApp: cliente/mapeamento de rotas em `src/modules/whatsapp`; handlers em `server/whatsapp`; sessao/store/scheduler separados. Confirmar condicao de ambiente antes de supor que os endpoints estejam montados em producao.
- Backup/reset: frontend chama API autenticada; revisar filtro de colecoes, validacao de confirmation e soft-delete em `server/backupRoutes.ts` e `server/dataResetRoutes.ts` antes de alterar escopo.
- Segredos nao sao fonte de codigo: nao abrir/copiar `.env`, `firebase-service-account.json`, chaves/certificados ou backups de usuario para produzir uma auditoria. Verificar `.gitignore` e a configuracao de deploy antes de compartilhar artefatos.

## Pastas por Responsabilidade

| Caminho | Responsabilidade |
|---|---|
| `src/components/<dominio>/` | Telas e formularios; UI recebe dados/acoes via props. |
| `src/components/layout/` | Shell, header, navegacao, error boundary e roteador de views. |
| `src/hooks/` | Estado, acoes, coordinacao de fluxo e dados derivados. |
| `src/services/` | Repositorios Firestore, APIs HTTP, offline queue, exportacao/importacao e persistencia local. |
| `src/lib/` | Regras puras reutilizaveis (pagamentos, status, moeda, servicos, utils). |
| `src/types.ts` | Contratos centrais do dominio e uniao `AppView`. |
| `src/constants/`, `src/config/` | Defaults e gates/configuracao por ambiente. |
| `src/modules/whatsapp/` | Cliente, tipos e organizacao modular da integracao WhatsApp. |
| `server/` | Handlers Express, Stripe, fiscal, WhatsApp, backup/reset, seguranca e Firebase Admin. |
| `functions/` | Cloud Functions; atualmente sincronizacao de custom claims. |
| `scripts/` | Testes operacionais, validadores, build wrappers e utilitarios manuais. |
| `public/` | Manifesto, robots e service worker. |
| `docs/archive/`, auditorias raiz | Material historico; confirmar data e validar alegacoes no codigo atual. |
| `dist/`, `dist-server/`, `backups/`, `node_modules/` | Artefatos/dependencias; nao sao a implementacao-fonte do modulo. |

## Por Onde Comecar por Tipo de Pedido

| Pedido/bug | Arquivos iniciais | Depois seguir para |
|---|---|---|
| Campo, texto ou layout de uma tela | Componente listado em [Views](#views-da-aplicacao) | props e callbacks em `AppViewRenderer` -> hook dono do estado. |
| Botao salva valor errado | Tela -> hook `use*Actions` | repository/service -> `types.ts` -> regra Firestore. |
| Lista nao atualiza ou esta vazia | `useUserCollections.ts` e componente | listener/error state -> regra Firestore -> filtros derivados. |
| Dados duplicados/stale offline | `firestoreOfflineQueue.ts`, `localCashLaunchRepository.ts`, `offlineDataPreload.ts` | replay descriptor, merge e eventos da colecao afetada. |
| Numero de dashboard/relatorio diverge | `useMaintenanceStats.ts`, `useFinancialHealth.ts`, `GeneralReportView.tsx` | helpers em `src/lib` e data de negocio usada em cada filtro. |
| Estoque/baixa ou estorno de O.S. | `cashRegisterRepository.ts` | `stock_movements`, `firestore.rules`, teste `test:stock`. |
| Acesso admin/assinatura | `App.tsx`, `useSubscriptionStatus.ts`, `useAdminActions.ts` | `firestore.rules`, `server/stripeBilling.ts`, Cloud Function custom claims. |
| NFS-e/certificado/documentos | `FiscalView.tsx`, `useFiscalActions.ts`, `fiscalApi.ts` | `server/fiscal/fiscalRoutes.ts`, `focusClient.ts`, `fiscalStore.ts`, regras privadas. |
| WhatsApp/session/scheduler | modulo cliente `src/modules/whatsapp` | `server/whatsapp/whatsappRoutes.ts`, `WhatsAppSessionService.ts`, scheduler/store. |
| Backup/reset de dados | `SettingsView.tsx` e `useSettingsActions.ts` | client API -> rotas server -> colecoes/soft delete e logs. |
| Teste/build/deploy | `package.json`, `firebase.json`, `vite.config.ts`, `scripts/build.mjs` | Comando exato em [Validacao](#validacao). |

## Validacao

Scripts atualmente declarados em [`package.json`](../package.json#L1):

| Comando | O que cobre | Requisito/observacao |
|---|---|---|
| `npm run lint` | `tsc --noEmit` (typecheck, nao ESLint) | Check rapido de tipos. |
| `npm run build:client` | Build Vite do frontend | Gera `dist/`. |
| `npm run build:server` | Bundle esbuild do Express | Gera `dist-server/server.js`. |
| `npm run build` | Wrapper Windows/memoria -> build cliente + servidor | Usa `scripts/build.mjs`. |
| `npm run test:offline` | Resiliencia offline | `scripts/offline-resilience-test.ts`. |
| `npm run test:backup` | Node test para backup automatico | `scripts/automatic-backup.test.ts`. |
| `npm run test:stock` | Fluxo de estoque | Firebase Emulator + `scripts/stock-flow-test.mjs`. |
| `npm run test:rules` | Validacao das regras no emulator | Requer Firebase CLI/emulator. |
| `npm run test:rules:static` | Assertions estaticas sobre regras | `scripts/validate-firestore-rules.mjs`. |
| `npm run test:rules:scenarios` | Cenarios documentais/estaticos de autorizacao | `scripts/firestore-rules-scenarios.mjs`. |
| `npm run test:stripe` | Testes Stripe node:test | `server/stripeBilling.test.ts`. |
| `npm run test:fiscal` | Smoke test fiscal | `scripts/fiscal-smoke-test.mjs`; confirmar env antes. |

Outros scripts sao ferramentas pontuais (normalizacao de clientes, validacao de cliente removido, WhatsApp, NCM, claim admin e verificacao JSX). Ler o script antes de rodar: alguns conectam em servicos reais, alteram dados ou dependem de credenciais. `firebase.json` define Hosting em `dist`, rewrite SPA para `index.html`, regras, indices e Functions.

## Documentacao Existente e Divergencias

- Este guia e o indice de navegacao atual. [`README.md`](../README.md) e o onboarding; [`DOCUMENTACAO.md`](../DOCUMENTACAO.md) e memoria/plano de trabalho; [`OFFLINE_SYNC.md`](../OFFLINE_SYNC.md) aprofunda sincronizacao.
- Auditorias existentes na raiz/docs podem ajudar no historico, mas confirmar cada finding. Exemplo verificado: `AUDITORIA_ESTRUTURAL_COMPLETA_2026.md` esta datada de 2026-08-12 e afirma que o typecheck falha e que delete fisico e permitido; no estado auditado, `npm run lint` passou e `firestore.rules` nega delete fisico. Nao tratar essa lista antiga como backlog atual sem reproduzir.
- README documenta rotas Stripe antigas `/api/payments/...`; cliente e servidor atuais declaram `/api/stripe/...`. Quando divergir, seguir `stripeService.ts`, `stripeBilling.ts` e `server.ts` ate atualizar a documentacao afetada.
- `AppView` inclui tokens sem branch independente encontrados na busca atual (`new-service`, `whatsapp`, `subscription-expired`); `new-service` e usado como modo do formulario, os outros nao devem ser tratados como views implementadas sem novo rastreamento.

## Manutencao Deste Guia

Ao adicionar uma funcionalidade transversal, atualizar a linha de view, cadeia de chamada, colecao/regra, endpoint e teste afetado. Manter links apontando para arquivos/funcoes donos do comportamento; se o codigo mudou, procurar novamente os anchors antes de confiar nos numeros. Registrar sempre se uma conclusao foi observada no codigo, em teste, em ambiente ou apenas em documento.
