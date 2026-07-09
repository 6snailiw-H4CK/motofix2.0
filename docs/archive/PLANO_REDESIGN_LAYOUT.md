# Plano de redesign do MotoFix

Este documento descreve como eu migraria o MotoFix para um esqueleto visual mais proximo do print enviado: painel escuro profissional, sidebar fixa no desktop, area principal densa, cards analiticos, graficos, listas operacionais e navegacao mais parecida com SaaS de gestao.

A ideia principal e preservar a logica ja estabilizada e trocar a estrutura visual por etapas, sem fazer uma reescrita arriscada de uma vez.

## 1. Principio da migracao

O que deve ser preservado:

- Firebase Auth e fluxo de login.
- Listeners do Firestore em `useUserCollections`.
- Perfil de usuario em `useAuthProfile`.
- Repositories em `src/services/*Repository.ts`.
- Regras de salvamento em `clientSaveService`.
- Calculos de dashboard em `useMaintenanceStats`.
- Notificacoes em `useNotifications`.
- Tipos de servico normalizados em `src/lib/serviceTypes.ts`.
- Views ja extraidas, sempre que der para reaproveitar.

O que deve mudar:

- Estrutura de layout principal.
- Navegacao inferior como navegacao secundaria/mobile.
- Sidebar desktop com secoes fixas.
- Dashboard inicial com composicao de painel SaaS.
- Cards, tabelas, listas, filtros e densidade visual.
- Organizacao das telas em modulos mais claros.

O que nao fazer:

- Nao trocar Firestore, Auth ou regras de negocio junto com redesign.
- Nao refatorar todas as views em uma unica etapa.
- Nao criar layout bonito com dados mockados se os dados reais ja existem.
- Nao apagar historico nem alterar formato de dados para caber no visual.

## 2. Arquitetura visual alvo

### Estrutura geral

Criar um novo app shell:

- `src/components/layout/AppShell.tsx`
- `src/components/layout/SidebarNav.tsx`
- `src/components/layout/TopBar.tsx`
- `src/components/layout/MobileNav.tsx`
- `src/components/layout/PageHeader.tsx`

Layout desktop:

- Sidebar fixa a esquerda.
- Conteudo principal a direita.
- Header/topbar com acoes rapidas, notificacoes, tema, ajustes e logout.
- Dashboard com grid de cards e paineis.

Layout mobile:

- Sidebar vira drawer ou menu compacto.
- Bottom navigation pode continuar, mas com menos itens.
- Conteudo deve priorizar cards empilhados e tabelas com scroll horizontal.

### Navegacao sugerida

Sidebar desktop:

- Inicio
- Clientes
- Servicos
- Agenda
- Financeiro
- Garantias
- Relatorios
- Ajustes
- Admin, apenas para admin

Mapeamento com views atuais:

- Inicio -> `dashboard`
- Clientes -> `clients-schedule`
- Servicos -> `clients`
- Agenda -> `appointments`
- Financeiro -> `expenses` + atalhos de recebiveis
- Garantias -> `warranties`
- Relatorios -> `general-report`
- Ajustes -> `settings`
- Admin -> `admin`

## 3. Fase 1 - Preparar o esqueleto sem mudar telas

Objetivo:

Criar o novo shell visual e manter as views atuais funcionando dentro dele.

Status em 2026-05-28:

- Iniciado.
- `AppShell`, `SidebarNav` e `TopBar` criados.
- Desktop usa sidebar/topbar do novo layout.
- Mobile preserva o `AppHeader` antigo e `BottomNav`.
- Views atuais continuam dentro de `AppViewRenderer`.
- Proximo passo visual: lapidar dashboard e densidade dos paineis internos.

Passos:

1. Criar `AppShell`.
2. Mover `AppHeader` e `BottomNav` para dentro do shell.
3. Criar `SidebarNav` com os itens de navegacao.
4. Manter `BottomNav` para mobile.
5. Ajustar `src/App.tsx` para renderizar:

```tsx
<AppShell view={view} onViewChange={setView}>
  {view atual}
</AppShell>
```

Arquivos provaveis:

- `src/App.tsx`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/SidebarNav.tsx`
- `src/components/layout/TopBar.tsx`
- `src/components/layout/MobileNav.tsx`
- `src/components/layout/BottomNav.tsx`

Validacao:

- Login continua funcionando.
- Todas as views ainda abrem.
- Menu mobile continua usavel.
- `npm run lint`
- `npm run build`

## 4. Fase 2 - Redesenhar dashboard inicial

Objetivo:

Transformar a tela inicial em painel operacional parecido com o print, usando dados reais.

Status atual:

- Iniciado em 2026-05-28 com polimento visual incremental do `DashboardView`.
- Desktop ganhou paineis mais densos, radius menor, cards com mais peso visual e graficos com mais altura.
- Mobile foi preservado com a navegacao inferior antiga e a mesma ordem principal de conteudo.
- Ainda falta reorganizar a composicao do dashboard para ficar mais proxima do print completo, com grafico principal e painel lateral operacional.

Blocos sugeridos:

- Cards superiores:
  - Receita recebida no mes.
  - Contas a receber.
  - Gastos do mes.
  - Resultado liquido.
  - Servicos realizados.
  - Garantias ativas.
- Grafico principal:
  - Receitas x despesas por dia ou por semana.
- Painel lateral:
  - Status de servicos/clientes.
  - Alertas criticos.
  - Proximos agendamentos.
- Lista inferior:
  - Servicos recentes.
  - Clientes com saldo.

Componentes a criar:

- `src/components/dashboard/KpiCard.tsx`
- `src/components/dashboard/FinanceTrendChart.tsx`
- `src/components/dashboard/RecentServicesPanel.tsx`
- `src/components/dashboard/CriticalActivitiesPanel.tsx`
- `src/components/dashboard/StatusOverviewPanel.tsx`

Logica a reaproveitar:

- `useMaintenanceStats`
- `dashboardStats`
- `cashFlowStats`
- `topServicesData`
- `overdueClients`
- `activeWarrantiesCount`
- `nextAppointment`

Validacao:

- Cards batem com o dashboard atual.
- Valores de despesas usam `expenseEntries`.
- Exclusao de cliente/servico continua refletindo no dashboard.
- Sem mock fixo quando houver dado real.

## 5. Fase 3 - Criar area Financeiro

Objetivo:

Separar o financeiro em uma area forte, em vez de deixar gastos e relatorio espalhados.

Views possiveis:

- `finance-overview`
- `expenses`
- `general-report`
- `receivables`

O que entra:

- Contas a receber.
- Contas recebidas.
- Gastos.
- Resultado liquido.
- Filtro por periodo.
- Filtro por cliente.
- Filtro por status de pagamento.

Componentes a criar ou adaptar:

- `FinanceView`
- `ReceivablesView`
- reaproveitar `ExpensesView`
- reaproveitar `GeneralReportView`

Observacao:

O relatorio geral que ja criamos pode ser a base do financeiro. Depois ele pode virar subview de `Financeiro` em vez de ficar apenas dentro de Ajustes.

## 6. Fase 4 - Reorganizar Servicos e Clientes

Objetivo:

Separar melhor cadastro de cliente, historico de servicos e ordem/registro de servico.

Proposta:

- Clientes:
  - lista de clientes;
  - ficha do cliente;
  - historico do cliente;
  - saldo do cliente;
  - garantias associadas.
- Servicos:
  - registrar servico;
  - servicos recentes;
  - filtros por status/pagamento/categoria;
  - acao rapida de receber/quitar.

Componentes atuais a reaproveitar:

- `ClientsView`
- `ClientsScheduleView`
- `ClientForm`
- `ClientScheduleForm`
- `HistoryView`

Possiveis novos componentes:

- `ClientProfileView`
- `ServiceOrdersView`
- `ServiceRecordDrawer`

Importante:

Apesar do print usar "Ordens de Servico", no MotoFix hoje o conceito real mais proximo e `maintenances`. Podemos renomear visualmente para "Servicos" ou "Ordens de Servico" sem mudar a colecao imediatamente.

## 7. Fase 5 - Agenda e Garantias no novo padrao

Agenda:

- Calendario mais compacto.
- Lista lateral de proximos agendamentos.
- Formulario em painel/modal.
- Status visual de concluido/pendente.

Garantias:

- Lista em tabela/card compacto.
- Filtro por vencimento.
- Destaque para garantias vencendo.
- Botao de gerar PDF.

Arquivos:

- `AppointmentsView`
- `WarrantiesView`
- `WarrantyForm`

## 8. Fase 6 - Ajustes, Admin e institucional

Ajustes:

- Perfil da empresa.
- Categorias de servico.
- Tipos de oleo/itens.
- Categorias de garantia.
- Template WhatsApp.
- Aparencia/tema.

Admin:

- Usuarios.
- Status de assinatura.
- Bloqueio/desbloqueio.
- Datas de vencimento.

Melhoria visual:

- Menos cards empilhados.
- Mais secoes com cabecalho curto.
- Formularios mais densos e alinhados.

## 9. Fase 7 - Design system interno

Criar pequenos componentes padrao para evitar duplicacao:

- `Button`
- `IconButton`
- `Card`
- `StatCard`
- `DataTable`
- `EmptyState`
- `Toolbar`
- `FilterBar`
- `StatusBadge`
- `SectionPanel`

Local sugerido:

- `src/components/ui/`

Regras:

- Usar `lucide-react` para icones.
- Evitar cards dentro de cards.
- Usar radius mais controlado.
- Preferir UI densa e operacional.
- Garantir responsividade antes de concluir cada bloco.

## 10. Fase 8 - Performance e code splitting

Depois da troca visual:

- Aplicar `React.lazy` nas views grandes.
- Separar rotas/views por chunks.
- Isolar PDF/relatorios pesados.
- Verificar bundle do `jsPDF`, `html2canvas` e graficos.

Objetivo:

Reduzir o aviso atual de bundle grande no build.

## 11. Checklist de validacao por fase

Depois de cada fase:

- `npm run lint`
- `npm run build`
- Login com Google.
- Recarregar pagina e confirmar persistencia.
- Criar servico.
- Criar categoria de servico e verificar Ajustes.
- Excluir servico/cliente e verificar dashboard.
- Criar gasto e verificar financeiro/dashboard.
- Criar garantia e gerar PDF.
- Testar mobile.
- Testar tema claro/escuro se a fase tocar layout global.

## 12. Riscos conhecidos

- O `src/App.tsx` ainda concentra muitos handlers; o redesign pode ficar mais facil se antes extrairmos hooks de fluxo.
- O build ja avisa bundle grande; novas telas podem piorar ate aplicarmos code splitting.
- Alguns textos antigos ainda podem ter encoding irregular fora dos arquivos ja corrigidos.
- Mudancas de layout grandes podem quebrar mobile se nao forem testadas fase a fase.
- Renomear visualmente "servicos" para "ordens de servico" pode confundir se nao documentarmos bem.

## 13. Ordem recomendada para continuar

Minha recomendacao de proximo passo:

1. Criar `AppShell`, `SidebarNav` e `TopBar`.
2. Manter todas as views atuais, so mudando a casca.
3. Validar navegacao desktop/mobile.
4. Redesenhar somente o Dashboard.
5. Depois migrar Financeiro/Relatorios.
6. Depois Servicos/Clientes.
7. Depois Agenda/Garantias/Ajustes/Admin.

Isso permite chegar ao visual do print sem perder a estabilidade que ja conquistamos.

## 14. Memoria para retomada

Antes de iniciar o redesign:

- O app esta funcional.
- A modularizacao principal ja avancou bastante.
- O relatorio geral detalhado ja existe em `src/components/reports/GeneralReportView.tsx`.
- Os cards principais do relatorio geral ja sao clicaveis.
- Categorias criadas no cadastro rapido de servico ja aparecem em Ajustes.
- O menu inferior esta ativo e deve continuar existindo no mobile.
- A proxima etapa visual deve comecar pelo shell, nao pelo dashboard inteiro.
- O shell ja foi iniciado; a proxima etapa visual pode continuar no dashboard, mas em blocos pequenos para nao quebrar mobile.
