/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { getMonth, getYear, isWithinInterval, parseISO, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import type {
  Client,
  CashRegisterLaunch,
  ExpenseRecord,
  MaintenanceRecord,
  Settings,
} from '../types';
import type {
  FinancialHealthData,
  FinancialGoals,
  FinancialMetrics,
  TargetMetrics,
  ServiceRanking,
  ProductRanking,
  MonthlyComparisonData,
} from '../components/financial-health/types';

interface UseFinancialHealthProps {
  maintenances: MaintenanceRecord[];
  cashLaunches: CashRegisterLaunch[];
  expenses: ExpenseRecord[];
  clients: Client[];
  settings: Settings;
  month?: number; // 0-11, defaults to current month
  year?: number; // defaults to current year
}

// Marca fictícia padrão (usado quando não há dados de compra)
const DEFAULT_MARKUP = 2.5; // 150% de markup = 40% de margem

export function useFinancialHealth({
  maintenances,
  cashLaunches,
  expenses,
  clients,
  settings,
  month = new Date().getMonth(),
  year = new Date().getFullYear(),
}: UseFinancialHealthProps): FinancialHealthData {
  return useMemo(() => {
    const startDate = startOfMonth(new Date(year, month, 1));
    const endDate = endOfMonth(new Date(year, month, 1));

    // Filtrar dados do mês
    const monthMaintenances = maintenances.filter(m => {
      const recordDate = parseISO(m.date);
      return isWithinInterval(recordDate, { start: startDate, end: endDate }) && !m.deletedAt;
    });

    const monthCashLaunches = cashLaunches.filter(cl => {
      const launchDate = parseISO(cl.createdAt);
      return isWithinInterval(launchDate, { start: startDate, end: endDate }) && 
             !cl.deletedAt &&
             cl.status !== 'Cancelado';
    });

    const monthExpenses = expenses.filter(e => {
      const expenseDate = parseISO(e.date);
      return isWithinInterval(expenseDate, { start: startDate, end: endDate }) && !e.deletedAt;
    });

    // ==================== Cálculos de Receita ====================
    const maintenanceRevenue = monthMaintenances.reduce((sum, m) => sum + (m.serviceValue || 0), 0);
    const cashLaunchRevenue = monthCashLaunches.reduce((sum, cl) => sum + (cl.total || 0), 0);
    const totalRevenue = maintenanceRevenue + cashLaunchRevenue;

    // Receita paga vs pendente
    const paidMaintenances = monthMaintenances.filter(m => m.statusPagamento === 'Pago' || !m.statusPagamento).reduce((sum, m) => sum + (m.serviceValue || 0), 0);
    const paidCashLaunches = monthCashLaunches.filter(cl => cl.statusPagamento === 'Pago' || !cl.statusPagamento).reduce((sum, cl) => sum + (cl.total || 0), 0);
    const paidRevenue = paidMaintenances + paidCashLaunches;
    const pendingRevenue = totalRevenue - paidRevenue;

    // ==================== Cálculos de Custo e Lucro ====================
    // Custo das peças vendidas em CashRegisterLaunches
    // Como não temos preço de compra, estimamos usando markup
    const productsCost = monthCashLaunches.reduce((sum, cl) => {
      const merchandiseCost = (cl.merchandiseTotal || 0) / DEFAULT_MARKUP;
      return sum + merchandiseCost;
    }, 0);

    const totalExpenses = monthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const grossProfit = totalRevenue - productsCost;
    const netProfit = grossProfit - totalExpenses;

    // ==================== Cálculos de Ticket Médio ====================
    const totalServices = monthMaintenances.length + monthCashLaunches.length;
    const averageTicket = totalServices > 0 ? totalRevenue / totalServices : 0;

    // ==================== Cálculos de Motos Atendidas ====================
    const uniqueClientIds = new Set<string>();
    monthMaintenances.forEach(m => uniqueClientIds.add(m.clientId));
    monthCashLaunches.forEach(cl => {
      if (cl.clientId) uniqueClientIds.add(cl.clientId);
    });

    const uniqueMotos = uniqueClientIds.size;
    const uniqueClients = uniqueClientIds.size; // No contexto do MotoFix, 1 cliente = 1 moto
    const profitPerMoto = uniqueMotos > 0 ? netProfit / uniqueMotos : 0;

    // ==================== Goals e Targets ====================
    const goals: FinancialGoals = settings.financialGoals || {
      desiredMonthlyProfit: 12000, // Padrão
      estimatedMonthlyCosts: 9000, // Padrão
      targetMotosPerMonth: 40, // Padrão
    };

    const requiredRevenue = goals.estimatedMonthlyCosts + goals.desiredMonthlyProfit;
    const revenueTarget = requiredRevenue;
    const revenueDifference = totalRevenue - revenueTarget;
    const revenuePercentage = (totalRevenue / revenueTarget) * 100;
    const revenuePerMoto = goals.targetMotosPerMonth > 0 ? revenueTarget / goals.targetMotosPerMonth : 0;

    const targets: TargetMetrics = {
      requiredRevenue,
      revenueTarget,
      revenueDifference,
      revenuePercentage,
      revenuePerMoto,
      motosTarget: goals.targetMotosPerMonth,
      motosDifference: goals.targetMotosPerMonth - uniqueMotos,
      motosPercentage: (uniqueMotos / goals.targetMotosPerMonth) * 100,
    };

    // ==================== Rankings de Serviços ====================
    const serviceMap = new Map<string, { revenue: number; count: number; cost: number }>();

    monthMaintenances.forEach(m => {
      const serviceType = m.serviceType || 'Sem tipo';
      const existing = serviceMap.get(serviceType) || { revenue: 0, count: 0, cost: 0 };
      // Estimamos custo como 30% da receita para serviços (sem produtos)
      existing.revenue += m.serviceValue || 0;
      existing.count += 1;
      existing.cost += (m.serviceValue || 0) * 0.3;
      serviceMap.set(serviceType, existing);
    });

    monthCashLaunches.forEach(cl => {
      // Incluir serviços de CashRegister
      if (cl.servicesExecuted) {
        const existing = serviceMap.get(cl.servicesExecuted) || { revenue: 0, count: 0, cost: 0 };
        existing.revenue += cl.servicesTotal || 0;
        existing.count += 1;
        existing.cost += (cl.servicesTotal || 0) * 0.3;
        serviceMap.set(cl.servicesExecuted, existing);
      }
    });

    const serviceRankings: ServiceRanking[] = Array.from(serviceMap.entries())
      .map(([serviceType, data]) => ({
        serviceType,
        revenue: data.revenue,
        cost: data.cost,
        profit: data.revenue - data.cost,
        profitMargin: data.revenue > 0 ? ((data.revenue - data.cost) / data.revenue) * 100 : 0,
        count: data.count,
      }))
      .sort((a, b) => b.profit - a.profit);

    // ==================== Rankings de Produtos/Peças ====================
    const productMap = new Map<string, {
      productId: string;
      productDescription: string;
      sourceCode: string;
      quantity: number;
      revenue: number;
    }>();

    monthCashLaunches.forEach(cl => {
      cl.items?.forEach(item => {
        const key = item.productId || item.sourceCode;
        if (!key) return;

        const existing = productMap.get(key) || {
          productId: item.productId || '',
          productDescription: item.description,
          sourceCode: item.sourceCode,
          quantity: 0,
          revenue: 0,
        };
        existing.quantity += item.quantity || 0;
        existing.revenue += item.total || 0;
        productMap.set(key, existing);
      });
    });

    const productRankings: ProductRanking[] = Array.from(productMap.values())
      .map(product => {
        const cost = product.revenue / DEFAULT_MARKUP;
        const profit = product.revenue - cost;
        return {
          ...product,
          cost,
          profit,
          profitMargin: (profit / product.revenue) * 100,
          averageProfit: product.quantity > 0 ? profit / product.quantity : 0,
        };
      })
      .sort((a, b) => b.profit - a.profit);

    // ==================== Comparação Mensal ====================
    const monthlyComparison: MonthlyComparisonData[] = [];
    for (let i = 11; i >= 0; i--) {
      const compareMonth = new Date(year, month - i, 1);
      const compareStart = startOfMonth(compareMonth);
      const compareEnd = endOfMonth(compareMonth);

      const compareMaintenances = maintenances.filter(m => {
        const recordDate = parseISO(m.date);
        return isWithinInterval(recordDate, { start: compareStart, end: compareEnd }) && !m.deletedAt;
      });

      const compareCashLaunches = cashLaunches.filter(cl => {
        const launchDate = parseISO(cl.createdAt);
        return isWithinInterval(launchDate, { start: compareStart, end: compareEnd }) && 
               !cl.deletedAt &&
               cl.status !== 'Cancelado';
      });

      const compareExpenses = expenses.filter(e => {
        const expenseDate = parseISO(e.date);
        return isWithinInterval(expenseDate, { start: compareStart, end: compareEnd }) && !e.deletedAt;
      });

      const compareRevenue = compareMaintenances.reduce((sum, m) => sum + (m.serviceValue || 0), 0) +
                            compareCashLaunches.reduce((sum, cl) => sum + (cl.total || 0), 0);
      const compareExpensesTotal = compareExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
      const compareGrossProfit = compareRevenue - (compareCashLaunches.reduce((sum, cl) => sum + ((cl.merchandiseTotal || 0) / DEFAULT_MARKUP), 0));
      const compareProfit = compareGrossProfit - compareExpensesTotal;

      monthlyComparison.push({
        month: compareMonth.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
        revenue: compareRevenue,
        profit: compareProfit,
        expenses: compareExpensesTotal,
      });
    }

    const metrics: FinancialMetrics = {
      totalRevenue,
      grossProfit,
      netProfit,
      averageTicket,
      totalServices,
      uniqueMotos,
      uniqueClients,
      profitPerMoto,
      totalExpenses,
      paidRevenue,
      pendingRevenue,
    };

    return {
      period: {
        month,
        year,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      goals,
      metrics,
      targets,
      serviceRankings,
      productRankings,
      monthlyComparison,
    };
  }, [maintenances, cashLaunches, expenses, clients, settings, month, year]);
}
