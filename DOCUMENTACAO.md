# Documentacao MotoFix

Este arquivo serve como memoria tecnica viva do aplicativo MotoFix durante a estabilizacao e refatoracao em fases. Ele registra o que o app faz, como esta estruturado, o que ja foi corrigido, o que ainda falta e quais pontos nao podem ser esquecidos no caminho.

## 1. Objetivo do app

O MotoFix e uma aplicacao web para oficinas, reposicionada como CRM de recorrencia e controle rapido operacional. O foco principal agora e:

- Fazer clientes voltarem por retornos e recorrencia.
- Lembrar cobrancas e clientes pendentes.
- Controlar gastos rapidos com poucos toques.

O app ainda preserva as funcionalidades de gestao/ERP como apoio:

- Cadastro de clientes e motos.
- Registro de servicos e manutencoes recorrentes.
- Agenda de atendimentos.
- Controle de garantias.
- Controle de gastos/despesas.
- Indicadores financeiros no dashboard.
- Alertas e lembretes por WhatsApp.
- Configuracoes da oficina.
- Painel administrativo para usuarios.
- Login com Google via Firebase Auth.
- Persistencia de dados no Firestore.

## 2. Stack principal

- Frontend: React, TypeScript e Vite.
- UI: Tailwind CSS e lucide-react.
- Graficos: Recharts.
- Datas: date-fns.
- PDF: jsPDF e html2canvas.
- Backend auxiliar: `server.ts`.
- Autenticacao: Firebase Auth.
- Banco: Firestore.
- Pagamentos: Stripe parcialmente preparado, ainda nao integrado de ponta a ponta.

## 3. Estrutura atual importante

- `src/App.tsx`: ainda e o orquestrador principal do app. Mantem boa parte dos estados, handlers e views grandes.
- `src/firebase.ts`: inicializacao do Firebase/Auth e persistencia local da sessao.
- `src/types.ts`: tipos centrais como `Client`, `MaintenanceRecord`, `Settings`, `Warranty`, `UserProfile`, `Appointment` e `AppView`.
- `src/constants/appDefaults.ts`: constantes do app, versao e configuracoes padrao.
- `src/hooks/useAuthProfile.ts`: estado de autenticacao, perfil do usuario e criacao/leitura inicial do perfil.
- `src/hooks/useUserCollections.ts`: listeners das colecoes do usuario no Firestore.
- `src/hooks/useAdminActions.ts`: acoes administrativas de ativacao/bloqueio e ajuste de assinatura de usuarios.
- `src/hooks/useClientActions.ts`: acoes de salvar/excluir cliente, incluindo chamada ao `clientSaveService`, estado `isSaving` e exclusao em cascata de historicos.
- `src/hooks/useClientFormState.ts`: estado do formulario de cliente/servico, sugestoes por nome, cliente em edicao e tipo de servico selecionado.
- `src/hooks/useClientStatusSync.ts`: sincronizacao automatica de status dos clientes com base na proxima data de manutencao.
- `src/hooks/useServiceTypeActions.ts`: acao de criar categoria rapida de servico, persistir em settings e selecionar no formulario.
- `src/hooks/useSubscriptionExpiryGuard.ts`: verificacao de vencimento de assinatura e bloqueio automatico de usuario comum expirado.
- `src/hooks/useWhatsAppReminderActions.ts`: envio manual de lembrete por WhatsApp, com abertura imediata do link e registro do log em segundo plano.
- `src/hooks/useMaintenanceActions.ts`: acoes de manutencoes/pagamentos, incluindo servico rapido, confirmar pagamento, quitar saldo e excluir historico.
- `src/hooks/useWarrantyActions.ts`: estado e acoes de garantia, incluindo salvar, excluir, editar e gerar PDF.
- `src/hooks/useAppointmentActions.ts`: estado e acoes de agenda, incluindo formulario, calendario, concluir e excluir agendamentos.
- `src/services/firestoreError.ts`: padronizacao de erro Firestore.
- `src/services/clientRepository.ts`: persistencia Firestore de clientes.
- `src/services/maintenanceRepository.ts`: persistencia Firestore de manutencoes/servicos.

Componentes ja extraidos:

- `src/components/auth/AuthScreen.tsx`
- `src/components/auth/BlockedAccessScreen.tsx`
- `src/components/checkout/CheckoutScreen.tsx`
- `src/components/feedback/Toast.tsx`
- `src/components/layout/AppHeader.tsx`
- `src/components/layout/BottomNav.tsx`
- `src/components/layout/ErrorBoundary.tsx`
- `src/components/layout/LoadingScreen.tsx`
- `src/components/settings/ProfileSetupModal.tsx`
- `src/components/settings/SettingsView.tsx`
- `src/components/admin/AdminView.tsx`
- `src/components/expenses/ExpensesView.tsx`
- `src/components/appointments/AppointmentsView.tsx`
- `src/components/warranties/WarrantiesView.tsx`
- `src/components/history/HistoryView.tsx`
- `src/components/clients/ClientsView.tsx`
- `src/components/clients/ClientsScheduleView.tsx`
- `src/components/clients/ClientScheduleForm.tsx`
- `src/components/clients/ClientForm.tsx`
- `src/components/dashboard/DashboardView.tsx`
- `src/components/dashboard/DashboardDetailViews.tsx`
- `src/components/dashboard/ReportView.tsx`
- `src/components/reports/GeneralReportView.tsx`
- `src/components/returns/ReturnsView.tsx`
- `src/components/pendencies/PendenciesView.tsx`

## 4. Fluxo geral do app

1. `main.tsx` renderiza `App`.
2. `App` chama `useAuthProfile`.
3. Se estiver carregando, mostra `LoadingScreen`.
4. Se nao houver usuario, mostra `AuthScreen`.
5. Se o usuario existir mas estiver inativo, mostra `BlockedAccessScreen`.
6. Se estiver ativo, `useUserCollections` alimenta os dados principais.
7. `AppHeader`/`TopBar` controlam tema, notificacoes, ajustes e logout conforme mobile/desktop.
8. `BottomNav` prioriza a experiencia mobile com `Inicio`, `Oleo`, `Pendencias` e `Mais`.
9. `App` renderiza a view selecionada.
10. `ProfileSetupModal` aparece quando o perfil da empresa ainda nao foi concluido.

Na experiencia atual, o menu principal destaca:

- Inicio.
- Trocas de Oleo.
- Lancamentos Caixa.
- Pendencias.
- Relatorios.
- Clientes.
- Configuracoes.

Modulos de apoio e recursos mais avancados ficam em `Mais ferramentas`, incluindo Retornos, Gastos, Fiscal, Mercadorias, Agenda, Garantias, Historico e Admin quando aplicavel.

## 5. Colecoes Firestore usadas

Estrutura principal por usuario:

- `users/{uid}`
- `users/{uid}/clients`
- `users/{uid}/maintenances`
- `users/{uid}/warranties`
- `users/{uid}/appointments`
- `users/{uid}/expenses`
- `users/{uid}/products`
- `users/{uid}/cash_launches`
- `users/{uid}/message_logs`
- `users/{uid}/settings/config`

Observacao importante:

- Ainda existe uso legado de `settings/{uid}` em parte do salvamento de configuracoes. A leitura principal atual usa `users/{uid}/settings/config`. Isso deve ser normalizado em uma etapa futura para evitar divergencia de configuracoes.

## 6. O que ja foi feito nesta fase

### Estabilizacao

- Corrigido problema de `isNavOpen` para o lint passar.
- Menu inferior restaurado e depois extraido para `BottomNav`.
- `.gitignore` reconstruido para proteger `.env`, `.env.*`, `firebase-service-account.json` e arquivos de credenciais.
- Regras Firestore endurecidas para dono/admin em vez de acesso aberto.
- Regras Firestore agora validam schema dos documentos principais antes de permitir writes do cliente: clientes, manutencoes, garantias, agenda, gastos, mercadorias, lancamentos caixa, settings e logs de mensagem.
- Campos fiscais sensiveis em `cash_launches` continuam bloqueados para escrita direta pelo frontend; o preenchimento fiscal deve passar pelo backend/Admin SDK.
- Calculo de despesas do dashboard ajustado para usar `expenseEntries`.
- README atualizado para refletir melhor o estado real.
- Verificado que `firebase-service-account.json` nao deve ser versionado nem distribuido.

### Reposicionamento CRM de recorrencia

- Dashboard inicial reorganizado para comecar por acoes: clientes para contatar hoje, clientes pendentes e garantias proximas do vencimento.
- Botoes rapidos adicionados no topo do dashboard: `Novo retorno`, `Novo cliente` e `Novo gasto`.
- Modulo `Retornos` criado como fluxo principal de recorrencia, mostrando cliente, moto, servico, data do servico, retorno previsto, observacao e status.
- Status de retorno padronizado na tela em `Em dia`, `Proximo do vencimento` e `Atrasado`, reaproveitando a regra atual `OK`/`WARNING`/`OVERDUE`.
- Modulo `Pendencias` criado para listar clientes com saldo devedor, valor devido, data, status e acao rapida de registrar pagamento.
- Tela de `Gastos` simplificada para o uso operacional rapido com campos essenciais: fornecedor, valor, descricao e data.
- Menu mobile reorganizado para priorizar `Inicio`, `Recorrentes`, `Pendencias` e `Mais`; `Retornos` e recursos avancados foram deslocados para o menu de apoio.
- Sidebar desktop reorganizada para destacar a nova hierarquia do produto sem remover os modulos existentes.

### Auth

- Corrigido loop de login com Google.
- `src/firebase.ts` passou a configurar persistencia local com `browserLocalPersistence`.
- `AuthScreen` passou a tratar melhor popup, redirect e erros como `auth/popup-closed-by-user`.
- Usuario confirmou que o login voltou a funcionar.

### Modularizacao

- `AuthScreen` extraido.
- `Toast` extraido.
- `ErrorBoundary` extraido.
- `LoadingScreen` extraido.
- `CheckoutScreen` extraido, mas ainda nao e fluxo completo de pagamento.
- `useAuthProfile` extraido.
- `useUserCollections` extraido.
- `BlockedAccessScreen` extraido.
- `ProfileSetupModal` extraido.
- `AppHeader` extraido.
- `BottomNav` extraido.
- `SettingsView` extraido.
- `AdminView` extraido.
- `ExpensesView` extraido.
- `AppointmentsView` extraido.
- `WarrantiesView` extraido.
- `HistoryView` extraido.
- `ClientsView` extraido para a tela principal de servicos/clientes.
- `ClientsScheduleView` extraido para a lista de agenda/fichas de clientes.
- `ClientScheduleForm` extraido para a ficha de relacionamento do cliente.
- `ClientForm` extraido para o formulario principal de registro/edicao de servico.
- `DashboardView` extraido para a tela inicial principal do dashboard.
- Subviews `dashboard-revenue`, `dashboard-recurring` e `dashboard-services` extraidas para `DashboardDetailViews`.
- `ReportView` extraido para o relatorio mensal com grafico e rankings.
- `GeneralReportView` criado para o relatorio geral detalhado acessado por Ajustes, com filtros de periodo, cliente, tipo de servico e status de pagamento.
- `ReturnsView` criado para concentrar a experiencia principal de retornos/recorrencia.
- `PendenciesView` criado para concentrar a lista de saldos a receber e pagamentos pendentes.
- Ranking `Top Servicos` ajustado para usar apenas manutencoes pagas ligadas a clientes ainda existentes, evitando exibir valores antigos de clientes apagados.
- `clientRepository` criado e conectado aos writes/deletes de `users/{uid}/clients`.
- `maintenanceRepository` criado e conectado aos writes/deletes de `users/{uid}/maintenances`.
- `expenseRepository` criado e conectado aos writes/deletes de `users/{uid}/expenses`.
- `warrantyRepository` criado e conectado aos writes/deletes de `users/{uid}/warranties`.
- `appointmentRepository` criado e conectado aos writes/deletes de `users/{uid}/appointments`.
- `clientSaveService` criado para concentrar a regra de salvamento de cliente/servico que antes estava em `handleSaveClient`.
- `settingsRepository` criado e conectado ao salvamento de `users/{uid}/settings/config`.
- `userRepository` criado e conectado aos updates de assinatura/status de usuarios.
- `messageLogRepository` criado para suporte a logs de mensagem; no momento nao ha tela conectada para listar/excluir esses logs.
- `useMaintenanceStats` criado para concentrar metricas financeiras, ranking de servicos, saldos por cliente, filtros da aba Servicos e historicos validos para dashboard/relatorio.
- `useNotifications` criado para concentrar suporte a notificacoes do navegador, service worker, alertas sonoros e listas de lembretes pendentes.
- `useExpenseActions` criado para concentrar estado do formulario de gastos, salvamento, exclusao e reset de despesas.
- `useSettingsActions` criado para concentrar salvamento de perfil, template/configuracoes, patches de settings e mensagem de confirmacao.
- `useWarrantyActions` criado para concentrar fluxo de garantias, edicao, exclusao e geracao de PDF fora do `App.tsx`.
- `useAppointmentActions` criado para concentrar fluxo da agenda, formulario, calendario, conclusao e exclusao fora do `App.tsx`.
- `useAdminActions` criado para concentrar acoes do painel administrativo fora do `App.tsx`.
- `useMaintenanceActions` criado para concentrar registro rapido de servico, pagamentos, quitacao, exclusao e `processingId` fora do `App.tsx`.
- `useClientFormState` criado para concentrar estado/sugestoes do formulario de cliente/servico e enriquecimento do cliente em edicao com a ultima manutencao.
- `useClientActions` criado para concentrar salvamento/exclusao de clientes, `isSaving` e a exclusao em cascata de manutencoes do cliente fora do `App.tsx`.
- `useServiceTypeActions` criado para concentrar o cadastro rapido de categoria de servico fora do `App.tsx`.
- Correcao do autocomplete no registro de servico: selecionar um cliente existente no modo `Registrar Servico` agora cria uma nova manutencao/historico em vez de substituir a ultima manutencao do cliente.
- Aba `Servicos` ajustada para resumir os registros reais de `maintenances` por cliente; ao expandir o card do cliente, a tela mostra os servicos daquele cliente vindos do historico, incluindo novos servicos criados via autocomplete.

Observacao:

- A tela de clientes esta modularizada em componentes, a persistencia das colecoes principais ja passa por repositories e o fluxo principal de salvamento de cliente/servico ja saiu de `src/App.tsx`.
- O `src/App.tsx` nao faz mais chamadas diretas de escrita/exclusao com `doc`, `setDoc`, `updateDoc` ou `deleteDoc`; esses acessos ficam em repositories/services.
- Calculos de dashboard e listas financeiras principais ja sairam de `src/App.tsx` para hook dedicado.
- Ainda existem handlers no `App.tsx` para status automatico e WhatsApp; eles podem virar hooks em etapas futuras.

### Validacao recorrente

Depois das etapas recentes, foram executados:

```bash
npm run lint
npm run build
```

Ambos passaram. O build ainda mostra aviso de bundle grande, esperado ate aplicarmos code splitting.
O comando `npm run build` agora passa por `scripts/build.mjs`, que aplica `GOMAXPROCS=1` por padrao para reduzir falhas de memoria do esbuild em Windows/maquinas com pouca memoria livre.

## 7. Pontos conhecidos para corrigir

### Criticos / altos

- Regras Firestore revisadas com validacao de schema e compiladas em dry-run. Antes de producao real, ainda e recomendado executar testes de fluxo autenticado no emulador ou em projeto staging.
- Integrar Stripe de ponta a ponta ou esconder checkout real ate estar pronto.
- Normalizar encoding dos arquivos para UTF-8. Existem textos com mojibake em varios arquivos.
- Continuar separando `src/App.tsx` em views, hooks e services.

### Dashboard

- O card `Top servicos realizados` foi ajustado para considerar apenas manutencoes pagas ligadas a clientes ainda existentes.
- Os calculos do dashboard ja foram movidos para componentes extraidos, mas ainda podem virar hooks proprios em uma etapa futura.

### Qualidade

- Criar testes unitarios para datas, financeiro e lembretes.
- Criar testes de fluxo principal.
- Implementar code splitting.
- Revisar dependencias nao usadas.
- Padronizar toasts e mensagens de erro.
- Melhorar acessibilidade de formularios e botoes.
- Otimizar PDF de garantia para descricoes longas.
- Criar documentacao de fluxo por colecao.

## 8. Plano de refatoracao restante

### Fase 2 - Modularizacao em andamento

Views ainda candidatas para extrair:

- Nenhuma view grande principal pendente neste bloco de modularizacao visual.

Fluxos de clientes:

- Views e formularios principais ja extraidos.
- Persistencia de clientes, manutencoes, despesas, garantias e agendamentos ja passa por repositories.
- Regra de montagem/salvamento de cliente/servico separada em `clientSaveService`.

Hooks/services ainda candidatos:

- Refinar code splitting se novas telas ou dependencias pesadas forem adicionadas.

Importante:

- `DashboardView` principal e subviews ja foram extraidos; os calculos ainda podem virar hooks proprios.
- A cada extracao, rodar `npm run lint` e `npm run build`.
- Evitar misturar refatoracao com mudanca de regra de negocio na mesma etapa, exceto quando a correcao for pequena e diretamente relacionada.

## 9. Memoria da sessao

- O app esta funcional apos as extracoes recentes.
- O usuario confirmou que login Google voltou a funcionar.
- O usuario pediu para trabalhar aos poucos.
- O usuario pediu para manter o menu de itens na barra inferior.
- O usuario concordou em adiar `DashboardView`, mas deixou claro que ele precisa ser feito depois.
- O usuario observou bug visual/dado antigo no card `Top servicos realizados`; foi ajustado para ignorar manutencoes orfas de clientes apagados.
- Estrategia atual: extrair componentes isolados primeiro, validar, e so depois mexer em views grandes.
- `AdminView` ja foi extraido depois de `SettingsView`.
- `ExpensesView` ja foi extraido depois de `AdminView`.
- `AppointmentsView` ja foi extraido depois de `ExpensesView`.
- `WarrantiesView` ja foi extraido depois de `AppointmentsView`.
- `HistoryView` ja foi extraido depois de `WarrantiesView`.
- `ClientsView` ja foi extraido para a tela principal de servicos/clientes.
- `ClientsScheduleView` ja foi extraido para a lista de agenda/fichas de clientes.
- `ClientScheduleForm` ja foi extraido para a ficha de relacionamento do cliente.
- `ClientForm` ja foi extraido para o formulario principal de registro/edicao de servico.
- `DashboardView` ja foi extraido para a tela inicial principal.
- Subviews do dashboard ja foram extraidas para `DashboardDetailViews`.
- `ReportView` ja foi extraido para o relatorio mensal.
- `clientRepository` e `maintenanceRepository` ja foram criados e conectados ao `App`.
- `expenseRepository`, `warrantyRepository` e `appointmentRepository` ja foram criados e conectados ao `App`.
- `clientSaveService` ja foi criado e conectado ao `App`.
- `settingsRepository`, `userRepository` e `messageLogRepository` ja foram criados e conectados ao `App`.
- `useMaintenanceStats` ja foi criado e conectado ao `App`.
- `useNotifications` ja foi criado e conectado ao `App`.
- `useExpenseActions` ja foi criado e conectado ao `App`.
- `useSettingsActions` ja foi criado e conectado ao `App`.
- `useWarrantyActions` ja foi criado e conectado ao `App`.
- `useAppointmentActions` ja foi criado e conectado ao `App`.
- `useAdminActions` ja foi criado e conectado ao `App`.
- `useMaintenanceActions` ja foi criado e conectado ao `App`.
- `useClientFormState` ja foi criado e conectado ao `App` para o primeiro bloco do fluxo de cliente/servico.
- `useClientActions` ja foi criado e conectado ao `App` para salvar/excluir clientes e manter `isSaving` fora do componente principal.
- `useClientStatusSync` ja foi criado e conectado ao `App` para tirar a sincronizacao automatica de status do componente principal.
- `useServiceTypeActions` ja foi criado e conectado ao `App` para cadastrar rapidamente categorias de servico pelo formulario.
- `useSubscriptionExpiryGuard` ja foi criado e conectado ao `App` para tirar a verificacao de vencimento de assinatura do componente principal.
- `useWhatsAppReminderActions` ja foi criado e conectado ao `App` para tirar o envio manual de WhatsApp do componente principal.
- `useDeleteConfirmation` ja foi criado e conectado ao `App` para centralizar a regra de confirmacao em dois cliques das exclusoes de cliente, servico, garantia e agenda.
- `useAppShellState` ja foi criado para tirar do `App.tsx` o estado da casca do app: view atual, busca, toast, filtro da tela Servicos, grafico expandido, tema e efeitos de scroll.
- `useAppDerivedData` ja foi criado para tirar do `App.tsx` os dados derivados de tela: proximo agendamento, grafico mensal, opcoes de tipos de servico, filtros do historico e linhas recentes do cliente em edicao.
- `getMaintenanceStatus` foi extraido para `src/lib/maintenanceStatus.ts`, centralizando a regra `OK`/`WARNING`/`OVERDUE` usada por cliente, manutencao e sincronizacao automatica.
- `AppViewRenderer` agora recebe props agrupadas em `actions`, `data`, `session` e `ui`, reduzindo o contrato visual entre o `App.tsx` e o renderizador de telas.
- Inicio do redesign visual: criado `AppShell` com sidebar/topbar apenas no desktop e layout mobile preservando o `AppHeader` antigo com `BottomNav`. As views atuais continuam sendo renderizadas pelo `AppViewRenderer`, preservando a logica de negocio.
- Redesign visual incremental do `DashboardView`: no desktop, cards e paineis ganharam acabamento mais proximo de SaaS operacional, com radius menor, paineis mais densos e graficos mais altos; no mobile, a estrutura e a navegacao inferior permanecem preservadas.
- Navegacao mobile atual: a barra inferior mostra apenas `Inicio`, `Servicos`, `Agenda` e `Mais`. O menu `Mais` abre uma lista com `Garantias`, `Gastos`, `Clientes`, `Historico`, `Ajustes` e `Admin` quando aplicavel.
- A tela `Servicos` nao mostra mais o botao `Agenda de Clientes` no topo; o acesso a clientes/fichas foi movido para `Mais > Clientes`. O topo da tela fica focado no botao `Novo Registro` e na lista de servicos.
- `Agenda de Clientes` agora possui botao `Cadastrar cliente`, abrindo a ficha de cliente sem criar lancamento financeiro/servico. Cadastros feitos por esse caminho voltam para a propria agenda apos salvar.
- Atalho rapido no dashboard: a tela inicial ganhou um botao flutuante circular no estilo iOS, posicionado acima da barra inferior no mobile, que abre diretamente o formulario `Registrar Servico` usando o mesmo fluxo de `Novo Registro`.
- Refresh visual global: o fundo preto puro foi substituido por uma base azul-grafite com gradientes suaves, superficies translúcidas, bordas menos agressivas e campos/paineis com contraste mais uniforme. A mudanca foi feita em camada global para manter coerencia entre dashboard, servicos, agenda, garantias, gastos, historico e ajustes.
- Correcao do modo claro: cards com fundo fixo escuro (`#0b0f18`, `#0b0d12`) e superficies `slate-950/slate-900`, incluindo menu `Mais` e barra inferior, agora recebem fundo claro, texto escuro e bordas suaves no tema claro.
- Padrao de backup atualizado: proximos backups devem ter manifesto com a solicitacao original do usuario, facilitando voltar a um ponto especifico pelo pedido e nao apenas pelo timestamp.
- Primeira passada do dashboard mobile no estilo da referencia: os cards financeiros principais ganharam visual escuro com icones, mini grafico decorativo e o card de proximo agendamento foi remodelado, preservando a logica atual e o botao flutuante de cadastro rapido.
- Code splitting inicial implementado em `src/App.tsx` com `React.lazy`/`Suspense` para views grandes e `manualChunks` em `vite.config.ts` para separar vendors pesados.
- `AppViewRenderer` foi criado em `src/components/layout/AppViewRenderer.tsx` para concentrar a renderizacao das views e tirar do `App.tsx` o bloco grande de condicionais por tela.
- Logs de mensagem/aviso estao conectados ao `HistoryView` pelo card `Avisos enviados`, com listagem e exclusao para limpeza durante desenvolvimento.
- Validado novamente apos a extracao de agenda e limpeza de logs com `npm run lint` e `npm run build`.
- Validado novamente apos a extracao de admin e manutencoes/pagamentos com `npm run lint` e `npm run build`.
- Validado novamente apos a extracao do estado/sugestoes do formulario de cliente com `npm run lint` e `npm run build`.
- Validado com `npm run lint` e `npm run build` apos a extracao de salvar/excluir cliente para `useClientActions`.
- Validado com `npm run lint` e `npm run build` apos a extracao de categoria rapida para `useServiceTypeActions`.
- Validado com `npm run lint` e `npm run build` apos a correcao do autocomplete criando novo servico para cliente existente.
- Validado com `npm run lint` e `npm run build` apos ajustar a aba Servicos para agrupar e expandir os servicos por cliente com base no historico.
- Ajuste complementar da aba Servicos: o card do cliente agora sempre mostra quantidade/soma total de todos os historicos do cliente; ao expandir, existem abas internas `Todos`, `Recorrentes` e `Eventuais`, iniciando em `Todos`.
- Validado com `npm run lint` e `npm run build` apos extrair envio manual de WhatsApp para `useWhatsAppReminderActions`.
- Validado com `npm run lint` e `npm run build` apos extrair sincronizacao automatica de status para `useClientStatusSync`.
- Validado com `npm run lint` e `npm run build` apos extrair verificacao de assinatura expirada para `useSubscriptionExpiryGuard`.
- Validado com `npm run lint` e `npm run build` apos implementar code splitting. O aviso de chunk acima de 500 kB deixou de aparecer no build.
- Validado com `npm run lint` e `npm run build` apos extrair confirmacao de exclusao para `useDeleteConfirmation`.
- Validado com `npm run lint` e `npm run build` apos extrair a renderizacao das views para `AppViewRenderer`.
- O salvamento geral de configuracoes agora usa `users/{uid}/settings/config`, alinhado ao listener real do app.
- Correcao de persistencia: valor do servico tambem e gravado no campo legado `serviceValue` do cliente, alem de `lastServiceValue`, para evitar perda visual apos reload.
- Correcao de UX/persistencia: categorias de itens/servicos e garantias em Configuracoes agora sao salvas imediatamente ao adicionar/remover.
- Correcao de consistencia: excluir pela aba Servicos agora remove tambem as manutencoes/historicos vinculados ao cliente.
- Correcao de categorias: categorias criadas pelo cadastro rapido de `Tipo de Servico` agora sao gravadas em `settings.serviceTypes`, aparecem em Configuracoes na secao `Categorias de Servicos` e podem ser removidas de la.
- Relatorio geral: Historico agora possui o card `Relatorio detalhado`, ao lado de `Historico filtrado` e `Avisos enviados`, abrindo a view `general-report` com faturamento bruto, recebido, contas a receber, gastos, resultado liquido, servicos, ticket medio, resumo por servico, clientes, garantias e agenda filtraveis.
- Os cards principais do relatorio geral sao clicaveis e rolam para a secao detalhada correspondente.
- Planejamento visual: `PLANO_REDESIGN_LAYOUT.md` documenta como migrar o app para um layout SaaS com sidebar, topbar e dashboard mais parecido com o print enviado, preservando a logica atual.
- Backup local completo criado em `backups/motofix-full-sensitive-backup-20260527-192850.zip`, incluindo `.env` e `firebase-service-account.json` para recuperacao local. A pasta `backups/` foi adicionada ao `.gitignore` e nao deve ser versionada nem distribuida.
- Backup pre-refatoracao criado antes dos hooks de admin/manutencoes em `backups/motofix-pre-refactor-backup-20260527-201235.zip`, com manifesto em `backups/motofix-pre-refactor-backup-20260527-201235-manifest.txt`; foi verificado que contem `.env`, `firebase-service-account.json`, `src/App.tsx`, `src/hooks/useAppointmentActions.ts` e `DOCUMENTACAO.md`.
- Backup pre-refatoracao do fluxo cliente/servico criado em `backups/motofix-pre-client-flow-backup-20260527-223249.zip`, com manifesto em `backups/motofix-pre-client-flow-backup-20260527-223249-manifest.txt`; foi verificado que contem `.env`, `firebase-service-account.json`, `src/App.tsx`, hooks recentes e `DOCUMENTACAO.md`.
- Backup pre-refatoracao das acoes de cliente criado em `backups/motofix-pre-client-actions-backup-20260527-225003.zip`, com manifesto em `backups/motofix-pre-client-actions-backup-20260527-225003-manifest.txt`; foi verificado que contem `.env`, `firebase-service-account.json`, `src/App.tsx`, `src/hooks/useClientFormState.ts` e `DOCUMENTACAO.md`.
- Backup pre-refatoracao das categorias de servico criado em `backups/motofix-pre-service-type-actions-backup-20260528-062020.zip`, com manifesto em `backups/motofix-pre-service-type-actions-backup-20260528-062020-manifest.txt`; foi verificado que contem `.env`, `firebase-service-account.json`, `src/App.tsx`, `src/hooks/useClientActions.ts`, `src/hooks/useClientFormState.ts` e `DOCUMENTACAO.md`.
- Backup antes da correcao do autocomplete criado em `backups/motofix-pre-autocomplete-new-service-fix-backup-20260528-065515.zip`, com manifesto em `backups/motofix-pre-autocomplete-new-service-fix-backup-20260528-065515.manifest.txt`; inclui arquivos sensiveis locais por solicitacao anterior do usuario e nao deve ser versionado/distribuido.
- Backup antes do ajuste da aba Servicos criado em `backups/motofix-pre-services-list-by-history-backup-20260528-070959.zip`, com manifesto em `backups/motofix-pre-services-list-by-history-backup-20260528-070959.manifest.txt`; inclui arquivos sensiveis locais por solicitacao anterior do usuario e nao deve ser versionado/distribuido.
- Backup antes do novo bloco de refatoracao do `App.tsx` criado em `backups/motofix-pre-next-app-refactor-backup-20260528-075251.zip`, com manifesto em `backups/motofix-pre-next-app-refactor-backup-20260528-075251.manifest.txt`; inclui arquivos sensiveis locais por solicitacao anterior do usuario e nao deve ser versionado/distribuido.
- Backup antes da extracao de status automatico criado em `backups/motofix-pre-client-status-sync-backup-20260528-081625.zip`, com manifesto em `backups/motofix-pre-client-status-sync-backup-20260528-081625.manifest.txt`; inclui arquivos sensiveis locais por solicitacao anterior do usuario e nao deve ser versionado/distribuido.
- Backup antes da extracao da verificacao de assinatura criado em `backups/motofix-pre-subscription-guard-backup-20260528-083544.zip`, com manifesto em `backups/motofix-pre-subscription-guard-backup-20260528-083544.manifest.txt`; inclui arquivos sensiveis locais por solicitacao anterior do usuario e nao deve ser versionado/distribuido.
- Backup antes do code splitting criado em `backups/motofix-pre-code-splitting-backup-20260528-084905.zip`, com manifesto em `backups/motofix-pre-code-splitting-backup-20260528-084905.manifest.txt`; inclui arquivos sensiveis locais por solicitacao anterior do usuario e nao deve ser versionado/distribuido.
- Backup antes da correcao do CTA de vendas por WhatsApp criado em `backups/motofix-pre-whatsapp-sales-url-20260528-091901.zip`.
- Backup antes da correcao de exclusao/prioridade da tela de Servicos criado em `backups/motofix-pre-service-delete-priority-20260528-100248.zip`.
- Backup antes da extracao da confirmacao de exclusao criado em `backups/motofix-pre-delete-confirm-refactor-20260528-101308.zip`.
- Backup antes da extracao do renderizador de views criado em `backups/motofix-pre-view-renderer-refactor-20260528-102441.zip`.
- Backup antes do teste visual com graficos pizza no dashboard criado em `backups/motofix-pre-dashboard-pie-charts-20260528-104146.zip`.
- Backup antes de restaurar o Historico Mensal para barras criado em `backups/motofix-pre-monthly-history-bar-restore-20260528-105136.zip`.
- Backup antes da correcao do detalhe de Receita Recorrente e cards fantasmas em Servicos criado em `backups/motofix-pre-recurring-detail-service-ghost-fix-20260528-110341.zip`.
- Backup antes de expor logs de aviso no Historico criado em `backups/motofix-pre-history-message-logs-20260528-111629.zip`.
- Backup antes de reposicionar o card de avisos no topo do Historico criado em `backups/motofix-pre-history-log-top-card-20260528-112754.zip`.
- Backup antes de transformar cards do Historico em paineis e adicionar exclusao de logs criado em `backups/motofix-pre-history-panels-log-delete-20260528-113331.zip`.
- Backup antes de corrigir o pagamento do botao `Concluir` criado em `backups/motofix-pre-quick-maintenance-payment-fix-20260528-114150.zip`.
- Backup antes de extrair o estado da casca do app criado em `backups/motofix-pre-app-shell-state-refactor-20260528-122330.zip`.
- Backup antes de extrair dados derivados do app criado em `backups/motofix-pre-app-derived-data-refactor-20260528-123508.zip`.
- Backup antes de extrair o helper de status de manutencao criado em `backups/motofix-pre-maintenance-status-helper-20260528-124238.zip`.
- Backup antes de agrupar props do `AppViewRenderer` criado em `backups/motofix-pre-view-renderer-prop-groups-20260528-124731.zip`.
- Backup antes de criar o esqueleto SaaS com sidebar/topbar criado em `backups/motofix-pre-saas-shell-layout-20260528-125611.zip`.
- Backup antes de separar shell desktop/mobile criado em `backups/motofix-pre-responsive-shell-split-20260528-134200.zip`.
- Backup antes do polimento desktop do dashboard criado em `backups/DashboardView-pre-desktop-saas-polish-20260528-165814.tsx.bak`.
- Backup antes do teste de navegacao mobile por Lancamentos criado em `backups/BottomNav-pre-mobile-launches-nav-20260528-174203.tsx.bak` e `backups/ClientsView-pre-mobile-launches-nav-20260528-174203.tsx.bak`.
- Backup antes do botao flutuante de registro rapido no dashboard criado em `backups/DashboardView-pre-floating-quick-service-20260528-183919.tsx.bak` e `backups/AppViewRenderer-pre-floating-quick-service-20260528-183919.tsx.bak`.
- Backup antes da navegacao inferior `Mais` e do primeiro visual mobile inspirado na referencia criado em `backups/20260528-195319-bottom-nav-mais-dashboard-mobile-reference-*.bak`, com manifesto em `backups/20260528-195319-bottom-nav-mais-dashboard-mobile-reference-manifest.txt` contendo a solicitacao do usuario.
- Backup do estado antes de reverter os botoes criado em `backups/20260528-200711-rollback-buttons-before-launches-nav-current-state-*.bak`, com manifesto em `backups/20260528-200711-rollback-buttons-before-launches-nav-current-state-manifest.txt` contendo a solicitacao do usuario.
- Backup antes da navegacao mobile `Inicio/Servicos/Agenda/Mais` com `Clientes` dentro de `Mais` criado em `backups/20260528-201911-bottom-nav-mais-clientes-remove-service-agenda-button-*.bak`, com manifesto em `backups/20260528-201911-bottom-nav-mais-clientes-remove-service-agenda-button-manifest.txt` contendo a solicitacao do usuario.
- Backup antes do botao `Cadastrar cliente` dentro de `Agenda de Clientes` criado em `backups/20260528-203454-clients-schedule-add-client-button-*.bak`, com manifesto em `backups/20260528-203454-clients-schedule-add-client-button-manifest.txt` contendo a solicitacao do usuario.
- Backup antes do refresh visual global criado em `backups/20260528-210438-global-modern-visual-refresh-*.bak`, com manifesto em `backups/20260528-210438-global-modern-visual-refresh-manifest.txt` contendo a solicitacao do usuario.
- Backup antes da correcao das superficies escuras no modo claro criado em `backups/20260528-211701-light-mode-fixed-dark-surfaces-*.bak`, com manifesto em `backups/20260528-211701-light-mode-fixed-dark-surfaces-manifest.txt` contendo a solicitacao do usuario.
- Correcao de dashboard: calculos financeiros e ranking usam apenas manutencoes de clientes ainda existentes, ignorando historicos orfaos de clientes apagados.
- O ranking `Top Servicos` agora ignora manutencoes orfas de clientes apagados.
- O build agora usa `scripts/build.mjs` para aplicar `GOMAXPROCS=1` automaticamente e evitar falhas de memoria do esbuild no Windows.
- O servidor local foi testado em `http://localhost:3001`; o usuario confirmou que funcionou no navegador.
- Backup antes da blindagem de segredos/deploy criado em `backups/20260602-125230-secrets-deploy-hardening`, com manifesto contendo a solicitacao do usuario. Este backup nao inclui `.env` nem `firebase-service-account.json`.
- Blindagem de deploy: o backend Express passou a ser gerado em `dist-server/server.js`, deixando `dist/` exclusivo para o Firebase Hosting. `firebase.json`, `.gitignore`, README e memoria tecnica foram ajustados para reduzir risco de publicar backend, certificados, service accounts ou backups por acidente.
- Backup antes da blindagem do backend Express criado em `backups/20260602-131631-backend-express-hardening`, com manifesto contendo a solicitacao do usuario. Este backup nao inclui `.env` nem `firebase-service-account.json`.
- Blindagem do backend Express: criado `server/httpSecurity.ts` com request id, headers de seguranca, CORS por allowlist, rate limit simples em `/api`, limites de body por rota e handler de erro generico. O modulo fiscal ganhou validacao de IDs, tamanho/formato de certificado A1, limite para overrides Focus, status HTTP mais precisos e timeout nas chamadas Focus NFe.
- Backup antes da validacao de schema Firestore criado em `backups/20260602-145608-firestore-schema-validation`, com manifesto contendo a solicitacao do usuario. Este backup nao inclui `.env` nem `firebase-service-account.json`.
- Validacao de schema Firestore ativada para colecoes do usuario: `clients`, `maintenances`, `warranties`, `appointments`, `expenses`, `products`, `cash_launches`, `settings/config` e `message_logs`. O dry-run `firebase deploy --only firestore:rules --dry-run` compilou com sucesso.
- Backup antes do reposicionamento CRM/recorrencia criado em `backups/20260602-211035-crm-recorrencia-ux`, com manifesto contendo a solicitacao do usuario. Este backup nao inclui `.env` nem `firebase-service-account.json`.
- Reposicionamento de produto iniciado: MotoFix agora deve ser tratado primeiro como CRM de recorrencia e controle rapido operacional, com foco em retornos, pendencias/cobrancas e gastos rapidos. Modulos de ERP/apoio permanecem no app, mas foram deslocados na navegacao para reduzir ruido no uso diario em celular.
- Nova hierarquia de navegacao aplicada e depois ajustada: `Inicio`, `Recorrentes`, `Clientes`, `Pendencias`, `Gastos`, `Relatorios` e `Configuracoes` ficam no fluxo principal; Retornos, Fiscal, Mercadorias, Lancamentos Caixa, Agenda, Garantias, Historico e Admin ficam como ferramentas de apoio/avancadas.
- Backup antes de mover os cards financeiros do Inicio para Relatorios criado em `backups/20260603-090000-dashboard-cards-para-relatorios`, com manifesto contendo a solicitacao do usuario. Este backup nao inclui `.env` nem `firebase-service-account.json`.
- Inicio ficou mais focado em prioridades e acoes rapidas; o bloco de indicadores financeiros/operacionais do dashboard foi movido para o topo do Relatorio geral, reutilizando o mesmo componente de cards.
- Backup antes de incluir lancamentos caixa em Pendencias e trocar `Retornos`/`Ordens de Servico` na navegacao criado em `backups/20260603-091500-pendencias-caixa-swap-retornos-ordens`, com manifesto contendo a solicitacao do usuario. Este backup nao inclui `.env` nem `firebase-service-account.json`.
- Aba `Pendencias` agora une servicos/manutencoes com saldo e lancamentos caixa pendentes ou finalizados sem faturamento, evitando que valores a receber do caixa fiquem fora da tela de cobranca.
- Em `Pendencias`, lancamentos vindos do caixa exibem acao `Abrir caixa`, que leva ao `Lancamentos Caixa` ja carregando a O.S. selecionada para edicao/baixa.
- Navegacao ajustada: a antiga area `Ordens de Servico` voltou para o grupo principal no lugar de `Retornos` e depois foi renomeada visualmente para `Recorrentes`; `Retornos` foi movido para `Mais ferramentas`.
- Backup antes de renomear `Ordens de Servico` para `Recorrentes` e adicionar atalhos rapidos criado em `backups/20260603-151300-recorrentes-atalhos-clientes-pecas`, com manifesto contendo a solicitacao do usuario. Este backup nao inclui `.env` nem `firebase-service-account.json`.
- A view interna `clients` passou a aparecer no menu/topbar como `Recorrentes`; a tela ganhou atalhos `Novo Cliente` e `Nova Peca`, alem de manter `Novo Registro` e `Lancamentos Caixa`.
- Backup antes de adicionar feedback visual ao `Faturar`, reduzir o visual cyan/neon e detalhar a origem da receita criado em `backups/20260604-121415-feedback-faturar-tema-receita-origem`, com manifesto contendo a solicitacao do usuario. Este backup nao inclui `.env` nem `firebase-service-account.json`.
- Ao faturar um `Lancamento Caixa`, a tela exibe uma faixa de confirmacao com O.S. e valor faturado, alem do salvamento normal.
- O tema global trocou o primary cyan por um vermelho/coral MotoFix mais sobrio, com brilhos de fundo e foco visual menos neon.
- O detalhe `Receita (Este Mes)` passou a mostrar a origem dos valores por cliente, separando registros de servico/recorrentes e `Lancamentos Caixa` faturados.
- Lembrete pedido pelo usuario: depois de finalizar os blocos criticos, voltar ao ponto de Stripe/checkout para decidir integrar de ponta a ponta ou esconder o checkout real ate estar pronto.
- Proximo bloco natural sugerido: testar fluxo autenticado contra as regras novas e depois avancar para normalizacao de encoding ou testes criticos.

## 10. Como testar antes de continuar

Comandos basicos:

```bash
npm run lint
npm run build
```

Observacao: o build pode continuar mostrando aviso de chunk grande ate aplicarmos code splitting. Esse aviso nao impede deploy, mas segue como item de qualidade.

Teste manual recomendado:

- Login com Google.
- Troca de tema claro/escuro no header.
- Navegacao pela barra inferior.
- Tela de configuracoes.
- Salvamento do perfil da empresa.
- Cadastro/listagem de servicos.
- Dashboard financeiro.
- Agenda.
- Garantias.
- Gastos.
- Painel admin, quando usuario for admin.

## 11. Regras de cuidado

- Nunca versionar `.env`.
- Nunca versionar ou distribuir `firebase-service-account.json`.
- Nao reverter alteracoes existentes sem pedido explicito.
- Manter refatoracoes pequenas e validadas.
- Preservar comportamento antes de melhorar regra interna.
- Registrar novos pontos neste arquivo para nao perder contexto.

## 12. Documentos oficiais mantidos

Apos varredura dos documentos antigos, a documentacao oficial do projeto deve ficar concentrada nestes arquivos:

- `README.md`: entrada rapida do projeto, stack, comandos, variaveis e resumo de deploy.
- `DOCUMENTACAO.md`: memoria tecnica viva, plano de refatoracao, decisoes atuais e pendencias.
- `ANALISE_TECNICA_COMPLETA_APP.md`: analise tecnica ampla gerada antes da refatoracao atual, util como referencia historica.

Os demais arquivos Markdown antigos eram snapshots, guias duplicados ou diagnosticos de sessoes anteriores. O conteudo util foi consolidado abaixo para reduzir ruido na raiz do projeto.

## 13. Conteudo util consolidado da varredura

### Setup local

- Criar `.env` a partir de `.env.example`.
- Preencher credenciais Firebase, Stripe e porta local.
- Manter `firebase-service-account.json` fora do Git.
- Rodar `npm install`, `npm run dev`, `npm run lint` e `npm run build`.
- Usar `PORT=3001` e `VITE_STRIPE_API_URL=http://localhost:3001` no ambiente local quando o backend estiver ativo.

### Deploy

- O build gera frontend em `dist` e servidor Express em `dist-server`.
- Firebase Hosting serve apenas `dist` e usa rewrite para `index.html`.
- O bundle `dist-server/server.js` nao deve ser publicado no Hosting.
- Deploy recomendado de producao: `npm run deploy:prod`, que publica Hosting e Firestore Rules juntos.
- Se publicar separadamente, usar `npm run deploy:hosting` e depois `npm run deploy:rules` quando houver mudanca de regras.
- Antes de publicar, validar:
  - `npm run lint`
  - `npm run build`
  - regras Firestore
  - segredos fora do repositorio
  - backend com variaveis Stripe/Firebase configuradas no ambiente.

### Fluxo de dados

- Dados financeiros e rankings devem vir de `users/{uid}/maintenances`.
- Logs de WhatsApp devem ficar apenas em `users/{uid}/message_logs` e nao devem alimentar receita.
- A tela `Historico` agora exibe `Historico filtrado`, `Avisos enviados` e `Relatorio detalhado` lado a lado no topo; os avisos leem `message_logs` e filtram por periodo/cliente para registrar quando o botao `Avisar` abriu o WhatsApp.
- O card `Historico filtrado` virou painel clicavel; ao abrir, mostra os filtros de periodo, cliente, servico e recorrencia.
- O card `Avisos enviados` virou painel clicavel; ao abrir, lista destinatario, moto, telefone, mensagem, data/hora, status e botao para excluir logs em ambiente de desenvolvimento.
- Gastos/despesas devem vir de `users/{uid}/expenses`.
- Garantias devem vir de `users/{uid}/warranties`.
- Configuracoes devem ser normalizadas para `users/{uid}/settings/config`.

### Pagamentos internos de servicos

- `MaintenanceRecord` concentra o historico financeiro de servicos realizados.
- Status esperados: `Pago`, `Pendente`, `Parcial`.
- Para pagamento parcial, `valorPago` representa o valor recebido e `saldoDevedor` representa o restante.
- Dashboard e historico nao devem somar valores duplicados entre `clients` e `maintenances`.
- O botao `Concluir` da tela `Servicos` cria uma nova manutencao recorrente ja marcada como paga: `statusPagamento: Pago`, `valorPago` igual ao valor do servico e `saldoDevedor: 0`.
- Lancamentos antigos sem `statusPagamento`/`valorPago` explicito sao tratados como pagos, pois a interface ja exibia esses registros como `Pago`.
- Saldos devedores so devem influenciar prioridade e totais a receber quando o status financeiro for `Pendente` ou `Parcial`.

### Stripe

- O backend possui endpoints de pagamento, mas o frontend ainda nao esta integrado de ponta a ponta.
- Enquanto o checkout real nao estiver pronto, o fluxo de pagamento deve ficar claramente marcado como pendente ou ser ocultado do usuario final.
- Webhook precisa validar assinatura Stripe e garantir Firebase inicializado antes de gravar no banco.

### Ranking e dashboard

- Rankings devem ser calculados a partir de dados atuais de `maintenances`.
- O card `Top Servicos` foi revisado para considerar apenas manutencoes pagas associadas a clientes ativos.
- O card `Top Servicos (pagos)` do dashboard foi convertido para grafico pizza/donut com legenda clicavel, mantendo o detalhamento por tipo/oleo.
- O teste de pizza no card `Historico Mensal` foi revertido porque perdeu clareza temporal; o card voltou para grafico de barras, agora com resumo de total do periodo, mes atual e melhor mes.
- O detalhe `Receita Recorrente` agora lista clientes a partir dos lancamentos recorrentes reais do mes, com nome, moto, quantidade, data do ultimo servico e valor total.
- Ainda vale revisar em etapa futura se a exclusao de cliente deve apagar historico em cascata ou manter historico apenas fora dos rankings.

### Normalizacao de tipos de servico

- `DEFAULT_SERVICE_TYPES` foi corrigido para nao nascer com textos quebrados por encoding.
- O dropdown de `Registrar Servico` agora passa por `src/lib/serviceTypes.ts`, que repara mojibake de acentos e deduplica nomes equivalentes.
- Valores antigos vindos de `settings.serviceTypes`, `maintenances.serviceType` ou `clients.lastServiceType` como `Troca de Ã“leo`, `Troca de Ãƒâ€œleo`, `RevisÃ£o` e `RevisÃƒÂ£o` sao exibidos com os nomes canonicos corretos na interface.
- Novos cadastros e atualizacoes passam a salvar o tipo de servico canonico, evitando que o erro se espalhe para novos registros.
- Validado em 2026-05-27 com `npm run lint` e `npm run build`.

### Ajustes de dashboard e loading

- Backup antes do ajuste de notificacoes e compactacao do dashboard criado em `backups/20260528-213544-notification-feedback-dashboard-compact-layout-manifest.txt`.
- O botao de notificacoes passou a dar retorno em todos os estados principais: navegador sem suporte, permissao negada, permissao pendente e permissao concedida.
- Quando as notificacoes estao ativas, o clique no sino toca um som curto, mostra toast e tenta enviar uma notificacao de teste `MotoFix`, permitindo validar rapidamente se o navegador esta recebendo alertas.
- Os cards financeiros principais da tela inicial foram compactados para ocupar menos altura, mantendo cliques, valores e micrografico visual.
- `Historico Mensal` e `Top Servicos (pagos)` passaram a ficar lado a lado em desktop, cada um em seu proprio quadro; no mobile continuam empilhados.
- Backup antes do ajuste mobile dos cards destacados e graficos lado a lado criado em `backups/20260528-214541-mobile-dashboard-compact-cards-side-by-side-charts-manifest.txt`.
- No mobile, os cards `Receita (Mes)`, `Recorrente`, `Servicos` e `Garantias` foram reduzidos para ocupar cerca de 30% menos altura.
- Backup antes de restaurar `Historico Mensal` e `Top Servicos (pagos)` ao layout anterior criado em `backups/20260528-215537-restore-mobile-history-top-services-previous-layout-manifest.txt`.
- `Historico Mensal` e `Top Servicos (pagos)` voltaram ao estado anterior no mobile: empilhados, com textos auxiliares e detalhes visiveis; no desktop seguem lado a lado.
- Backup antes do redesign premium do dashboard inspirado na referencia mobile criado em `backups/20260529-063117-dashboard-redesign-reference-premium-mobile-manifest.txt`.
- O dashboard inicial ganhou cards com fundo azul-grafite, icones circulares, linhas sparkline por card, painel de proximo agendamento com botao rapido no mobile, `Historico mensal` com barras e labels e `Top Servicos (pagos)` em lista ranqueada.
- O novo fundo `bg-[#0d1626]` foi incluido nas regras de tema claro para evitar que os cards fiquem escuros quando o usuario alternar para modo claro.
- Backup antes de compactar novamente os cards do dashboard e remover o botao rapido embutido no agendamento criado em `backups/20260529-064918-compact-dashboard-cards-remove-inline-quick-button-manifest.txt`.
- Os cards principais do dashboard foram reduzidos no mobile com menos altura, padding, icones e sparklines mais baixos; o botao de cadastro rapido dentro do card `Proximo agendamento` foi removido, mantendo apenas o botao flutuante global.
- Backup antes do botao flutuante condicional de agendamento e grafico mensal minimalista criado em `backups/20260529-071132-floating-appointment-button-compact-monthly-chart-manifest.txt`.
- Quando existe `nextAppointment`, o dashboard mostra um segundo botao flutuante com icone de calendario que abre a Agenda; sem agendamento futuro, esse botao nao aparece.
- O grafico `Historico mensal` ficou mais compacto e minimalista, com menor altura, barras mais finas, grid menos intenso e cards de resumo reduzidos.
- Backup antes de remover o card fixo de agendamento e mover o relatorio detalhado para o Historico criado em `backups/20260529-072347-remove-dashboard-appointment-card-move-report-to-history/manifest.txt`.
- O card fixo `Proximo agendamento` saiu do dashboard; agora o aviso de agenda futura fica apenas no botao flutuante condicional com icone de calendario, reduzindo a area ocupada no inicio.
- O botao `Relatorio geral detalhado` saiu de Ajustes e foi movido para o topo do Historico como terceiro card ao lado de `Historico filtrado` e `Avisos enviados`; ao voltar do relatorio, o app retorna para `Historico`.
- Backup antes de compactar `Gastos`, `Agenda de Clientes` e `Top Servicos` criado em `backups/20260529-081356-compact-expenses-clients-agenda-top-services/manifest.txt`.
- A tela `Gastos` agora tem registro rapido no topo, com botao `Registrar` junto ao formulario compacto; cards de resumo, pizza por metodo, grafico mensal e lista de gastos foram reduzidos para uso mais rapido.
- A `Agenda de Clientes` ficou mais compacta, com cards menores, grid mais denso e acoes reduzidas sem remover edicao/exclusao.
- O card `Top Servicos (pagos)` da tela inicial foi reduzido para um ranking mais minimalista, mostrando ate 3 linhas principais e detalhes menores ao expandir.
- Backup antes de corrigir formulario de gastos, overflow mobile do Admin/Relatorio, categorias padrao removiveis e contraste do modo claro criado em `backups/20260529-092054-expense-form-mobile-overflow-removable-default-services-light-contrast/manifest.txt`.
- Em `Gastos`, o botao `Registrar gasto` agora abre os campos de descricao, valor, pagamento, data e observacao; o salvamento fica no botao `Salvar gasto` dentro do formulario aberto.
- A tela `Admin` foi ajustada para mobile com cards empilhados, textos truncados, controles de assinatura dentro da largura e campo `Vencimento` com contraste correto.
- O `Relatorio detalhado` ganhou protecoes contra overflow no mobile em filtros, paineis e tabelas; campos de data agora respeitam o contraste do tema.
- Categorias padrao de servico agora podem ser removidas em `Ajustes`; o app salva essas remocoes em `settings.disabledDefaultServiceTypes` e usa apenas categorias padrao ativas nos cadastros e filtros.
- O modo claro recebeu ajustes de contraste para textos coloridos dos cards e campos de formulario, evitando letras claras demais sobre superficies claras.
- Marco de venda salvo antes de iniciar ajustes especificos para desktop em `backups/20260529-105740-versao-venda-local/manifest.txt` e `backups/20260529-105740-versao-venda-local.zip`; inclui build atual, codigo, configs e arquivos sensiveis locais para recuperacao, nao devendo ser distribuido.
- Backup antes do recurso desktop de backup/importacao/exportacao de clientes em XLSX criado em `backups/20260529-110233-desktop-client-xlsx-backup-import-export/manifest.txt`.
- `Ajustes` agora exibe no desktop uma area `Backup de clientes` para exportar clientes em `.xlsx` e importar planilhas `.xlsx`; a area fica oculta no mobile para preservar a experiencia atual.
- A exportacao gera uma planilha `motofix-clientes-AAAA-MM-DD.xlsx` com ID, nome, WhatsApp, moto, email, placa, km, oleo, recorrencia, datas, status, receita recorrente, ultimo servico, valor e observacoes.
- A importacao faz upsert de clientes: atualiza quando encontra o mesmo ID/contato/identidade e cria quando nao encontra correspondente; os dados sao gravados em `users/{uid}/clients`.
- Backup antes dos ajustes desktop de formulario, agenda e fornecedor em gastos criado em `backups/20260529-111907-desktop-forms-agenda-supplier-report/manifest.txt` e `backups/20260529-111907-desktop-forms-agenda-supplier-report.zip`; o manifesto registra a solicitacao completa para facilitar rollback.
- No desktop, os formularios `Novo cliente` e `Registrar Servico` ganharam largura maior (`lg/xl`) sem alterar a base mobile.
- Na Agenda, os controles de mes passam a virar botoes circulares com setas no desktop, mantendo texto no mobile.
- Em `Gastos`, o cadastro ganhou campo `Fornecedor`; o valor e salvo junto ao gasto e aparece na lista de gastos recentes.
- O `Relatorio geral detalhado` agora inclui `Fornecedores mais comprados`, agrupando gastos por fornecedor e mostrando valor total/quantidade no periodo filtrado.
- A tabela `Gastos no periodo` do relatorio tambem exibe a coluna `Fornecedor` e a busca considera descricao, fornecedor, observacao e forma de pagamento.
- A tela de carregamento removeu qualquer icone/texto antes do Instagram; o link aparece somente como `@motofix_recorrentes` para evitar caracteres quebrados no boot.
- O favicon e o apple-touch-icon agora usam `/motofix-logo.svg`, removendo a data URL com emoji que podia aparecer quebrada antes do app iniciar.
- O service worker usa texto ASCII e `/motofix-logo.svg` nas notificacoes, evitando mojibake fora do bundle principal.
- `useNotifications` tambem foi limpo para usar textos escapados e `/motofix-logo.svg` nas notificacoes locais.
- O link de ativacao por WhatsApp no loading agora monta a mensagem com `encodeURIComponent`, evitando mojibake em `Ola/ID e`.
- O CTA `Falar com vendas` da tela publica agora monta a mensagem a partir do texto normal e aplica `encodeURIComponent` uma unica vez, evitando envio literal de `Ol%C3%A1%2C...` ao WhatsApp.
- O card `Servicos` do dashboard agora abre uma lista de manutencoes realizadas no mes, com cliente, moto, tipo de servico, data, valor e status.
- A contagem de `Servicos` no dashboard agora usa `maintenances` atuais do mes, preservando o filtro de clientes ativos ja aplicado no painel.
- O card `Garantias` do dashboard virou botao e leva para a lista de garantias salvas, onde aparecem os clientes com garantia registrada.
- `WarrantiesView` ganhou estado vazio para explicar quando ainda nao ha garantias salvas.
- Validado em 2026-05-27 com `npm run lint` e `npm run build`.

### Exclusao e prioridade na tela de Servicos

- A tela `Servicos` deixou de chamar exclusao de cliente. O botao de lixeira nessa tela remove apenas o lancamento de manutencao selecionado.
- O cadastro base do cliente permanece salvo em `Agenda de Clientes`.
- Quando um lancamento e excluido, o cadastro do cliente e recalculado para apontar para o servico anterior; se nao houver servicos restantes, os campos de ultimo servico, proximo alerta e saldo sao limpos, mas nome, contato e dados da moto continuam na agenda.
- A exclusao definitiva do cadastro do cliente continua restrita a `Agenda de Clientes`.
- A ordenacao da tela `Servicos` prioriza clientes com saldo devedor e clientes com alerta vencido (`OVERDUE`). Clientes proximos do prazo (`WARNING`) tambem sobem antes dos registros normais.
- Os cards da tela `Servicos` agora exibem etiquetas visuais como `Vencido`, `Proximo` e `Saldo devedor`.
- A tela `Servicos` passou a listar somente clientes com manutencoes/lancamentos reais vinculados. Se todos os lancamentos de um cliente forem apagados, ele deixa de aparecer em `Servicos` e permanece apenas em `Agenda de Clientes`.
- Validado em 2026-05-28 com `npm run lint` e `npm run build`.

### Lancamentos Caixa e catalogo de mercadorias

- Backup antes do modulo teste `Lancamentos Caixa` criado em `backups/20260529-123711-cash-register-product-xlsx-modal/manifest.txt` e `backups/20260529-123711-cash-register-product-xlsx-modal.zip`; o manifesto registra a solicitacao completa para facilitar rollback.
- O app ganhou a view `cash-register`, acessivel no desktop pela lateral e pelo botao `Lancamentos Caixa` dentro de `Servicos`.
- A importacao de mercadorias aceita `.xlsx` e le somente as colunas selecionadas na planilha de referencia: `Descricao`, `NCM` e `Venda R$`.
- As mercadorias importadas sao gravadas em `users/{uid}/products` e ficam disponiveis para pesquisa por codigo, descricao ou NCM.
- Em 2026-06-01 foi adicionada a tela desktop `Mercadorias`, acessivel pelo menu lateral, para cadastrar novas mercadorias e editar/excluir as ja importadas em `users/{uid}/products`.
- O cadastro de mercadorias usa os mesmos campos do catalogo importado: `sourceCode`/codigo, `description`, `ncm` e `salePrice`; alteracoes feitas ali passam a valer nas proximas inclusoes do `Lancamentos Caixa`.
- A tela `Mercadorias` tambem permite importar XLSX, pesquisar por codigo/descricao/NCM e usa confirmacao em dois cliques para exclusao.
- `Lancamentos Caixa` tem abas `Controle`, `Historico` e `Monitoramento`; em `Controle`, a subaba `Mercadorias / Servicos` permite clicar em `Incluir`, pesquisar mercadoria e adiciona-la ao lancamento.
- Os lancamentos salvos ficam em `users/{uid}/cash_launches`, com cliente, status, datas, itens, descontos, totais e flag de faturamento.
- Este modulo ainda e experimental e separado dos lancamentos tradicionais de manutencao; ele nao altera os totais do dashboard ate definirmos a regra de integracao com receitas/OS oficiais.
- Backup antes de ajustar edicao/status do `Lancamentos Caixa` criado em `backups/20260529-133157-cash-register-edit-status-monitoring/manifest.txt`.
- Na tabela de mercadorias do lancamento, `Qtd` e `Unit. Liquido R$` ficaram visualmente editaveis; alterar `Unit. Liquido R$` redefine o valor final daquele item para o cliente especifico.
- As abas `Funcionarios` e `Alocacao` foram removidas do modulo por nao fazerem parte do fluxo atual.
- No `Historico`, clicar em uma ordem carrega o lancamento no modo edicao para ajustar itens, status e salvar/atualizar; o botao `Finalizar` salva a ordem como `Finalizado`.
- Em `Monitoramento`, o usuario pode filtrar as ordens por `Todas`, `Em lancamento`, `Pendente` e `Finalizada`, e tambem clicar em uma ordem para edita-la.
- Backup antes de adicionar impressao de OS, backup do modulo e remover botoes nao usados criado em `backups/20260529-135101-cash-register-print-backup-button/manifest.txt`.
- O arquivo `bkp sistema nootec 290526.backup` foi identificado pelo cabecalho `PGDMP`, ou seja, parece ser um dump custom do PostgreSQL 9.6; pode ser util para uma futura migracao/importacao de dados do sistema antigo.
- O topo do `Lancamentos Caixa` agora tem botao `Backup`, exportando catalogo de mercadorias e lancamentos caixa em `.json`.
- Os botoes `Email Tecnico` e `Imprimir Fatura` foram removidos do rodape do modulo.
- O botao `Imprimir` agora abre a impressao de uma ordem de servico com numero do lancamento, cliente, moto/placa, datas, status, itens, quantidades e totais.
- Backup antes de ajustar descricao editavel, regra de faturamento no historico e colunas do lancamento criado em `backups/20260529-141311-cash-register-editable-description-invoice-rules/manifest.txt`.
- Na tabela de mercadorias, a descricao/nome do item agora e editavel diretamente no lancamento.
- As colunas de desconto e `Unit. Liquido R$` foram removidas da tabela para simplificar a operacao; o valor especifico do cliente passa a ser ajustado em `Unitario R$`.
- A quantidade agora usa incremento inteiro (`step=1`) e arredonda para numero inteiro, evitando saltos indevidos ao usar as setas do campo.
- Backup antes de ajustar exclusao de O.S. e layout desktop criado em `backups/20260529-183742-cash-register-delete-sidebar-layout/manifest.txt`; o manifesto registra a solicitacao completa para facilitar rollback.
- No `Historico`, o botao `Faturar` foi removido. A coluna de acao agora mostra `Excluir`, com confirmacao em dois cliques (`Excluir` e depois `Confirmar`), alem do acesso visual `Editar` pela propria linha.
- A exclusao de uma O.S. remove o documento correspondente em `users/{uid}/cash_launches`; os produtos importados e demais lancamentos permanecem intactos.
- A lateral desktop foi ampliada visualmente com itens em formato de card, icones maiores e destaque mais claro para a secao ativa, mantendo nomes e paleta do MotoFix.
- A casca desktop passou a usar mais largura util em 100% de zoom, reduzindo padding horizontal e removendo o limite fixo de 1600px no conteudo principal.
- Backup antes de tornar o botao `Faturar` condicional criado em `backups/20260529-200306-cash-register-conditional-invoice-button/manifest.txt`; o manifesto registra a solicitacao completa para facilitar rollback.
- No rodape do `Lancamentos Caixa`, o botao deixou de aparecer como `Finalizar` e passou a aparecer como `Faturar` somente quando o status atual do lancamento estiver em `Finalizado`.
- Backup antes de integrar `Lancamentos Caixa` ao dashboard criado em `backups/20260601-201804-dashboard-integra-lancamentos-caixa/manifest.txt`.
- O dashboard passou a somar `cash_launches` de forma paralela, sem transformar O.S. de caixa em manutencao tradicional.
- Lancamentos Caixa entram em `Total Recebido`, `Receita (Mes)` e no contador de `Servicos` somente quando estiverem com status `Finalizado` e `invoiced=true` (`Faturado`).
- Lancamentos Caixa com status `Pendente`, ou `Finalizado` ainda sem faturamento, entram em `A Receber`; registros `Em Lancamento` ficam fora do financeiro do dashboard ate virarem pendentes, finalizados sem faturar ou finalizados faturados.
- Backup antes de mover o acesso desktop de `Ordens de Servico` para dentro de `Lancamentos Caixa` e corrigir status/faturamento criado em `backups/20260601-210938-desktop-recorrencia-faturado-status/MANIFESTO.txt`.
- No desktop, a antiga area `Ordens de Servico` havia sido movida para dentro de `Lancamentos Caixa`, mas voltou ao menu principal em `20260603-091500`; em `20260603-151300` ela passou a se chamar `Recorrentes`, e `Retornos` permaneceu no grupo de ferramentas de apoio.
- Ao editar um lancamento ja faturado e mudar o status para `Pendente` ou `Em Lancamento`, a flag `invoiced` e limpa no rascunho salvo. O historico tambem so mostra o check de `Faturado` quando o status esta `Finalizado` e `invoiced=true`.
- O `tsconfig.json` passou a excluir `backups`, `backup-current`, `dist` e `node_modules` da checagem TypeScript para que backups locais nao entrem em `npm run lint`.

### Modulo fiscal NFS-e Focus NFe

- Backup antes do modulo fiscal criado em `backups/20260529-212426-fiscal-nfse-focus-module/manifest.txt`; o manifesto registra a solicitacao completa para facilitar rollback.
- O backend ganhou uma camada isolada em `server/fiscal/`, separando tipos, cliente Focus NFe, persistencia Firestore e rotas Express.
- Rotas criadas:
  - `GET /api/fiscal/health`
  - `GET /api/fiscal/companies`
  - `POST /api/fiscal/companies`
  - `POST /api/fiscal/companies/:companyId/certificate`
  - `POST /api/fiscal/nfse/manual`
  - `POST /api/fiscal/nfse/from-cash-launch`
  - `POST /api/fiscal/nfse/:invoiceId/sync`
  - `POST /api/fiscal/nfse/:invoiceId/cancel`
  - `GET /api/fiscal/invoices/:invoiceId/documents/:kind`
- Todas as rotas fiscais exigem token Firebase (`Authorization: Bearer <idToken>`) e usam Firebase Admin no servidor.
- A integracao Focus NFe usa Basic Auth com token da empresa fiscal e endpoints configuraveis por ambiente (`FOCUS_NFE_HOMOLOGATION_URL` e `FOCUS_NFE_PRODUCTION_URL`).
- O certificado A1 e lido no frontend como base64, enviado ao Express, repassado para a Focus NFe e descartado; o app salva apenas metadados publicos como `certificateUploadedAt`.
- Dados privados como token Focus e arquivos XML/PDF persistidos ficam em subcolecoes bloqueadas para o cliente por regra Firestore: `fiscal_private` e `fiscal_invoice_files`.
- O frontend ganhou `src/components/fiscal/FiscalView.tsx`, com abas `Configuracoes fiscais`, `Emitir NFS-e`, `Notas` e `Logs fiscais`.
- A tela Fiscal permite cadastrar empresas multiempresa, selecionar homologacao/producao, enviar certificado A1, emitir NFS-e manual, emitir por O.S. finalizada, sincronizar status, cancelar e baixar XML/PDF.
- O `Lancamentos Caixa` agora pode emitir NFS-e automaticamente ao faturar uma O.S. quando existir empresa fiscal com `autoIssueFromCashLaunch` ativo.
- Novas colecoes de usuario:
  - `fiscal_companies`: configuracao publica/sanitizada da empresa fiscal.
  - `fiscal_invoices`: notas emitidas e status Focus.
  - `fiscal_logs`: eventos, erros e auditoria fiscal.
  - `fiscal_private`: token Focus por empresa, bloqueado para cliente.
  - `fiscal_invoice_files`: XML/PDF persistidos quando couberem no limite seguro do Firestore, bloqueado para cliente.
- A arquitetura foi preparada com tipos `FiscalDocumentModel = nfse | nfe | nfce`, mantendo NFS-e implementada agora e espaco claro para NF-e/NFC-e futuramente.
- Observacao importante: NFS-e varia por prefeitura. O modulo aceita `focusOverrides`/JSON opcional para complementar campos municipais especificos antes de producao.

### Ajuste de navegacao desktop em 2026-06-04

- Backup antes da reorganizacao criado em `backups/20260604-124522-navegacao-trocas-caixa-relatorios/MANIFEST.md`, com a solicitacao do usuario registrada para rollback.
- No desktop, a view interna `clients` passou a aparecer como `Trocas de Oleo`.
- `Lancamentos Caixa` foi movido para o fluxo principal logo abaixo de `Trocas de Oleo`.
- `Clientes` foi movido para o final do fluxo principal, proximo de `Relatorios`.
- `Gastos` saiu do fluxo principal do desktop e ficou concentrado em `Relatorios`, que agora tambem possui botao `Abrir gastos` para acessar o cadastro rapido quando necessario.
- O menu mobile manteve a estrutura reduzida com acesso por `Mais`, recebendo apenas o novo nome curto `Oleo` para a antiga entrada de recorrentes.

### Variacao de mercadoria e cadastro rapido no caixa em 2026-06-05

- Backup antes da alteracao criado em `backups/20260605-variacao-mercadoria-cadastro-rapido-caixa/MANIFEST.md`, registrando a solicitacao de variacao de mercadoria e botao `+` no lancamento.
- O catalogo de `Mercadorias` ganhou variacoes por item em `variations[]`, cada uma com nome e preco proprio. O campo so aparece quando o usuario clica em `+ Variacao`.
- O campo legado `variation` foi mantido apenas para compatibilidade com mercadorias antigas/importadas antes desta mudanca.
- A busca do catalogo e a busca do seletor de mercadorias no `Lancamentos Caixa` agora consideram tambem nome e preco das variacoes.
- Ao selecionar uma mercadoria no caixa, cada variacao aparece como uma opcao separada. O item entra no lancamento com o preco especifico da variacao selecionada, aparece no resumo, na tabela editavel e na impressao da O.S.
- O `Lancamentos Caixa` ganhou um botao `+` ao lado do seletor de cliente para cadastro rapido de cliente sem sair do lancamento; o cliente criado ja preenche o lancamento atual.
- As regras Firestore de `products` foram atualizadas para permitir `variation` e `variations[]` sem invalidar mercadorias antigas.

### Descontos no Lancamentos Caixa em 2026-06-05

- Backup antes da alteracao criado em `backups/20260605-131846-descontos-lancamentos-caixa/MANIFEST.md`, registrando a solicitacao de descontos no `Lancamentos Caixa`.
- O `Lancamentos Caixa` ganhou desconto geral do lancamento com campos `Valor R$` e `Percentual`.
- O desconto geral nao altera a mercadoria cadastrada nem o preco base do item; ele e aplicado somente sobre o total do lancamento atual.
- O calculo ficou: subtotal dos itens menos desconto geral, limitado para nunca deixar total negativo.
- Os campos persistidos no documento sao `orderDiscountValue`, `orderDiscountPercent`, `discountTotal` e `total`.
- As regras Firestore de `cash_launches` foram atualizadas para permitir e validar `orderDiscountValue` e `orderDiscountPercent`.

### UX de prioridades e fluxo uau em 2026-06-05

- Backup antes da alteracao criado em `backups/20260605-201256-ux-prioridades-fluxo-uau/MANIFEST.md`, registrando a solicitacao completa para rollback.
- A barra inferior mobile foi reorganizada para `Inicio`, `Servicos/Oleo`, `Agenda`, `Pendencias` e `Mais`.
- O menu `Mais` mobile passou a ser agrupado por `Atendimento`, `Financeiro` e `Configuracoes`, escondendo ferramentas de apoio fora do fluxo principal.
- A tela inicial deixou de exibir graficos e rankings; agora mostra apenas as quatro prioridades do dia: clientes para contatar, clientes pendentes, agendamentos de hoje e garantias proximas.
- A frase principal da home foi ajustada para `Prioridades de hoje` e `Faca clientes voltarem para a oficina.`
- A home ganhou acao principal `Novo Servico`, reforcando o fluxo central: cadastrar cliente/moto/servico/valor, marcar recorrencia e calcular a proxima data.
- O formulario vivo `ClientForm` passou a mostrar a proxima data de contato calculada quando o servico e recorrente, alem de deixar claro que o lembrete por WhatsApp fica disponivel no fluxo de contato.
- O card `Clientes para contatar hoje` passou a considerar clientes vencidos (`overdueClients`) junto com os alertas do dia, sem duplicar cliente. Assim um retorno vencido aparece no topo para aviso rapido pelo WhatsApp.
- Validado em 2026-06-05 com `npm run lint` e `npm run build`.
