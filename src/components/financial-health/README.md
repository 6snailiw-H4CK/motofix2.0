/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * FINANCIAL HEALTH MODULE DOCUMENTATION
 * =====================================
 * 
 * Este módulo foi criado como um painel isolado de "Saúde Financeira" para o MotoFix.
 * É um módulo separado que apenas consome dados, sem modificar nada no sistema existente.
 * 
 * ARQUITETURA
 * ===========
 * 
 * 1. Tipos de Dados (types.ts)
 *    - FinancialGoals: Metas financeiras do usuário
 *    - FinancialMetrics: Métricas calculadas do período
 *    - TargetMetrics: Comparação com metas (Meta por Moto)
 *    - ServiceRanking: Ranking de serviços por lucro
 *    - ProductRanking: Ranking de peças por lucro
 *    - FinancialHealthData: Estrutura completa dos dados
 * 
 * 2. Hook Principal (../../hooks/useFinancialHealth.ts)
 *    - Calcula todas as métricas financeiras
 *    - Suporta filtro por mês/ano
 *    - Retorna dados estruturados prontos para renderização
 *    - Usa useMemo para otimização de performance
 * 
 * 3. Componentes UI
 * 
 *    MetricCard.tsx
 *    - Componente reutilizável para exibir métricas principais
 *    - Suporta formatação: currency, number, percentage
 *    - Inclui tendências (up/down/neutral)
 *    - Componentes: MetricCard
 * 
 *    TargetMetricsCard.tsx
 *    - Seção dedicada à "Meta por Moto"
 *    - Exibe meta necessária vs atingida
 *    - Mostra progresso com barra visual
 *    - Inclui insights e alertas
 *    - Componentes: TargetMetricsCard
 * 
 *    RankingTable.tsx
 *    - Tabelas expansíveis de rankings
 *    - Top 3 destacados com medalhas
 *    - Mostra insight sobre concentração de lucros
 *    - Componentes: RankingTable
 *
 *    GoalsEditor.tsx ⭐ NEW
 *    - Permite editar metas financeiras customizáveis
 *    - Calcula faturamento necessário em tempo real
 *    - Salva goals em Settings.financialGoals
 *    - Modo edição/visualização alternável
 *    - Componentes: GoalsEditor
 *
 *    TrendChart.tsx ⭐ NEW
 *    - Gráfico de linhas com Recharts
 *    - Mostra Receita, Lucro e Despesas dos últimos 12 meses
 *    - Botões para mostrar/ocultar linhas
 *    - Tooltip com valores formatados
 *    - Análise de tendência
 *    - Componentes: TrendChart
 * 
 *    FinancialHealthView.tsx
 *    - View principal que agrupa todos os componentes
 *    - Navegação de mês/ano
 *    - Botão para voltar ao dashboard
 *    - Dicas de otimização
 * 
 * 4. Integração do Sistema
 * 
 *    types.ts
 *    - Adicionado 'financial-health' a AppView type
 *    - Adicionado FinancialGoals interface com:
 *      * desiredMonthlyProfit
 *      * estimatedMonthlyCosts
 *      * targetMotosPerMonth
 *    - Adicionado campo 'financialGoals?' em Settings
 * 
 *    AppViewRenderer.tsx
 *    - Import lazy da FinancialHealthView
 *    - Caso condicional para renderizar quando view === 'financial-health'
 *    - Props: maintenances, cashLaunches, expenses, clients, settings, onViewChange, onSaveGoals
 *    - onSaveGoals usa settingsActions.saveSettingsPatch
 * 
 *    BottomNav.tsx
 *    - Adicionado item no grupo "Financeiro"
 *    - Ícone: TrendingUp
 *    - Label curto: "Saúde Fin."
 *    - Match: ['financial-health']
 * 
 * MÉTRICAS CALCULADAS
 * ===================
 * 
 * 1. Faturamento do Mês
 *    - Soma de MaintenanceRecord.serviceValue
 *    - Soma de CashRegisterLaunch.total
 * 
 * 2. Lucro Bruto
 *    - Total de Faturamento - Custo de Peças
 *    - Custo estimado: merchandiseTotal / 2.5 (DEFAULT_MARKUP)
 * 
 * 3. Lucro Líquido
 *    - Lucro Bruto - Total de Despesas (ExpenseRecord)
 * 
 * 4. Ticket Médio
 *    - Total de Faturamento / Total de Serviços
 * 
 * 5. Motos Atendidas
 *    - Contagem de clientes únicos no período
 * 
 * 6. Lucro por Moto
 *    - Lucro Líquido / Motos Atendidas
 * 
 * 7. Meta por Moto (FEATURE PRINCIPAL)
 *    Fórmula:
 *    - Receita Necessária = Custos Estimados + Lucro Desejado
 *    - Meta por Moto = Receita Necessária / Número de Motos
 *    
 *    Exemplo:
 *    - Custos: R$9.000
 *    - Lucro Desejado: R$12.000
 *    - Receita Necessária: R$21.000
 *    - Meta de Motos: 40
 *    - Meta por Moto: R$525
 * 
 * 8. Rankings
 *    - Serviços: Agrupados por tipo, ordenados por lucro
 *    - Peças: Agrupadas por produto, ordenadas por lucro
 *    - Ambos incluem: revenue, cost, profit, margin%, quantidade
 * 
 * 9. Comparação Mensal ⭐ USADO PARA GRÁFICO
 *    - Últimos 12 meses
 *    - Revenue, Profit, Expenses por mês
 *    - Pronto para gráficos com Recharts
 * 
 * FUNCIONALIDADES IMPLEMENTADAS
 * =============================
 * 
 * ✅ 1. Painel Base com Métricas
 * ✅ 2. Meta por Moto (Essencial)
 * ✅ 3. Rankings de Serviços/Peças
 * ✅ 4. Goals Customizáveis (NOVO)
 *    - Usuário pode editar desiredMonthlyProfit, estimatedMonthlyCosts, targetMotosPerMonth
 *    - Goals são salvos em Settings.financialGoals
 *    - useFinancialHealth usa valores do Settings com fallback para padrões
 *    - Todos os cálculos utilizam goals customizáveis
 * 
 * ✅ 5. Gráfico de Tendência (NOVO)
 *    - Visualiza últimos 12 meses
 *    - Mostra Receita, Lucro e Despesas
 *    - Botões para mostrar/ocultar métricas
 *    - Tooltip com valores precisos
 *    - Análise de tendência incluída
 * 
 * DADOS FONTE
 * ===========
 * 
 * O módulo utiliza dados de:
 * 
 * 1. MaintenanceRecord[]
 *    - Serviços diretos (Troca de óleo, revisão, etc)
 *    - date: data do serviço
 *    - serviceValue: valor cobrado
 *    - serviceType: tipo de serviço
 *    - statusPagamento: status do pagamento
 *    - clientId: para contar motos únicas
 * 
 * 2. CashRegisterLaunch[]
 *    - Ordens de serviço com múltiplos itens
 *    - total: valor total da OS
 *    - merchandiseTotal: valor de peças
 *    - servicesTotal: valor de serviços
 *    - items[]: lista de produtos/serviços
 *    - status: para filtrar canceladas
 *    - statusPagamento: para separar receita paga/pendente
 *    - createdAt: data de criação
 * 
 * 3. ExpenseRecord[]
 *    - Despesas gerais
 *    - amount: valor
 *    - date: data da despesa
 * 
 * 4. Settings
 *    - financialGoals: goals customizáveis do usuário
 * 
 * 5. Client[]
 *    - Para identificar motos únicas
 * 
 * PONTOS IMPORTANTES
 * ==================
 * 
 * 1. Isolamento
 *    - Módulo NÃO modifica dados
 *    - Apenas leitura de dados existentes
 *    - Safe para usar sem medo de danificar dados
 * 
 * 2. Performance
 *    - useFinancialHealth utiliza useMemo
 *    - Recalcula apenas quando dependências mudam
 *    - Componentes são light e rápidos
 *    - Gráfico usa Recharts (dependência existente)
 * 
 * 3. Estimativas
 *    - DEFAULT_MARKUP = 2.5 (150% markup = 40% margin)
 *    - Usado para estimar custo quando não há dados reais
 *    - Pode ser refinado com dados de compra reais no futuro
 * 
 * 4. Goals Customizáveis (NOVO)
 *    - Usuário define suas próprias metas
 *    - Goals salvos em Settings.financialGoals
 *    - Padrões: Lucro R$12k, Custos R$9k, Motos 40
 *    - Todos os cálculos se atualizam ao mudar goals
 * 
 * FUNCIONALIDADES FUTURAS
 * =======================
 * 
 * 1. Lucro por Mecânico
 *    - Requer adicionar campo 'mechanic' em MaintenanceRecord
 *    - Rastrear qual mecânico realizou cada serviço
 * 
 * 2. Exportação de Relatórios
 *    - PDF/CSV com dados do período
 *    - Usar html2canvas/jspdf (já dependência)
 * 
 * 3. Alertas Automáticos
 *    - Notificar quando abaixo da meta por moto
 *    - Sugerir serviços complementares
 * 
 * 4. Segmentação por Cliente/Serviço
 *    - Análise mais detalhada por cliente
 *    - Lucro acumulado por cliente
 * 
 * 5. Previsões e Forecasting
 *    - Projetar lucro do mês baseado em tendências
 *    - Alertar se projeção está abaixo da meta
 * 
 * 6. Dados de Compra Reais
 *    - Integrar com fornecedores para custos reais
 *    - Cálculos de margem mais precisos
 * 
 * TESTING
 * =======
 * 
 * Para testar o módulo:
 * 
 * 1. Criar dados de teste com:
 *    - MaintenanceRecords com diferentes serviceTypes
 *    - CashRegisterLaunches com items
 *    - ExpenseRecords
 *    - Clients com IDs variados
 * 
 * 2. Acessar via menu: Financeiro > Saúde Financeira
 * 
 * 3. Testar Goals Customizáveis:
 *    - Clicar em "Editar" no card de metas
 *    - Modificar valores
 *    - Salvar e verificar se meta por moto atualiza
 * 
 * 4. Testar Gráfico de Tendência:
 *    - Verificar se últimos 12 meses aparecem
 *    - Clicar nos botões para mostrar/ocultar linhas
 *    - Pairar sobre pontos para ver tooltip
 * 
 * 5. Verificar:
 *    - Cálculos de receita/despesa
 *    - Meta por Moto apresentada corretamente
 *    - Rankings ordenados por lucro
 *    - Navegação de meses funciona
 */
