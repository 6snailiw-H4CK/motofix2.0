/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface FinancialGoals {
  desiredMonthlyProfit: number; // Lucro desejado por mês
  estimatedMonthlyCosts: number; // Custos estimados por mês
  targetMotosPerMonth: number; // Número de motos que pretende atender
}

export interface FinancialMetrics {
  totalRevenue: number; // Faturamento total do mês
  grossProfit: number; // Lucro bruto (faturamento - custo de peças)
  netProfit: number; // Lucro líquido (lucro bruto - despesas)
  averageTicket: number; // Ticket médio
  totalServices: number; // Total de ordens/serviços
  uniqueMotos: number; // Número de motos diferentes atendidas
  uniqueClients: number; // Número de clientes diferentes atendidas
  profitPerMoto: number; // Lucro por moto
  totalExpenses: number; // Total de despesas do mês
  paidRevenue: number; // Faturamento pago
  pendingRevenue: number; // Faturamento pendente
}

export interface TargetMetrics {
  requiredRevenue: number; // Faturamento necessário para atingir meta (custos + lucro desejado)
  revenueTarget: number; // Meta de faturamento do mês
  revenueDifference: number; // Quanto falta/sobra para atingir meta
  revenuePercentage: number; // Percentual de meta atingida
  revenuePerMoto: number; // Faturamento necessário por moto
  motosTarget: number; // Meta de motos a atender
  motosDifference: number; // Quantas motos faltam atender
  motosPercentage: number; // Percentual de motos atendidas
}

export interface ServiceRanking {
  serviceType: string;
  revenue: number;
  cost: number;
  profit: number;
  profitMargin: number; // Margem em %
  count: number; // Número de vezes realizado
}

export interface ProductRanking {
  productId: string;
  productDescription: string;
  sourceCode: string;
  quantity: number;
  revenue: number; // Valor de venda total
  cost: number; // Valor de compra total (estimado por markup)
  profit: number; // Lucro estimado
  profitMargin: number; // Margem em %
  averageProfit: number; // Lucro por unidade
}

export interface MechanicProfitability {
  mechanicName: string;
  totalRevenue: number;
  totalProfit: number;
  servicesCount: number;
  averageProfit: number;
}

export interface MonthlyComparisonData {
  month: string;
  revenue: number;
  profit: number;
  expenses: number;
}

export interface FinancialHealthData {
  period: {
    month: number;
    year: number;
    startDate: string;
    endDate: string;
  };
  goals: FinancialGoals;
  metrics: FinancialMetrics;
  targets: TargetMetrics;
  serviceRankings: ServiceRanking[];
  productRankings: ProductRanking[];
  monthlyComparison: MonthlyComparisonData[];
}
