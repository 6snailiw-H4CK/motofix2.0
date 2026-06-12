import { ArrowLeft, BarChart3, CalendarDays, Download, Filter, WalletCards } from 'lucide-react';
import { endOfDay, format, isAfter, isBefore, parseISO, startOfDay, startOfMonth, subDays } from 'date-fns';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { DEFAULT_SERVICE_TYPES } from '../../constants/appDefaults';
import { getServiceTypeKey, getServiceTypeLabel, normalizeServiceTypeOptions } from '../../lib/serviceTypes';
import type { AppView, Appointment, CashRegisterLaunch, Client, ExpenseRecord, MaintenanceRecord, Settings, Warranty } from '../../types';

type PaymentStatusFilter = 'all' | 'Pago' | 'Pendente' | 'Parcial';

type GeneralReportViewProps = {
  cashLaunches: CashRegisterLaunch[];
  clients: Client[];
  maintenances: MaintenanceRecord[];
  expenses: ExpenseRecord[];
  warranties: Warranty[];
  appointments: Appointment[];
  settings: Settings;
  onBack: () => void;
  onViewChange: (view: AppView) => void;
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR');

const toCurrency = (value: number) => currencyFormatter.format(Number.isFinite(value) ? value : 0);

const toNumber = (value?: number | string | null) => {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value?: string | null) => {
  const parsed = parseDate(value);
  return parsed ? dateFormatter.format(parsed) : '-';
};

const isDateInRange = (value: string | undefined, startDate: string, endDate: string) => {
  const parsed = parseDate(value);
  const start = startOfDay(parseISO(startDate));
  const end = endOfDay(parseISO(endDate));

  if (!parsed || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return !isBefore(parsed, start) && !isAfter(parsed, end);
};

const getPaymentStatus = (maintenance: MaintenanceRecord): 'Pago' | 'Pendente' | 'Parcial' =>
  maintenance.statusPagamento || 'Pago';

const getPaidAmount = (maintenance: MaintenanceRecord) => {
  const total = toNumber(maintenance.serviceValue);
  const status = getPaymentStatus(maintenance);

  if (status === 'Pago') return total;
  if (status === 'Parcial') return Math.min(total, toNumber(maintenance.valorPago));
  return 0;
};

const getReceivableAmount = (maintenance: MaintenanceRecord) => {
  const total = toNumber(maintenance.serviceValue);
  const paid = getPaidAmount(maintenance);
  const explicitBalance = toNumber(maintenance.saldoDevedor);

  if (getPaymentStatus(maintenance) === 'Pago') return 0;
  return explicitBalance > 0 ? explicitBalance : Math.max(0, total - paid);
};

const isCashLaunchPaid = (launch: CashRegisterLaunch) => launch.status === 'Finalizado' && Boolean(launch.invoiced);

const isCashLaunchReceivable = (launch: CashRegisterLaunch) => (
  launch.status === 'Pendente' ||
  launch.status === 'Em Lancamento' ||
  (launch.status === 'Finalizado' && !launch.invoiced)
);

const getCashLaunchDate = (launch: CashRegisterLaunch) => launch.openingDate || launch.createdAt;

const getClientSearchText = (client?: Client) => `${client?.name || ''} ${client?.bikeModel || ''} ${client?.contact || ''}`.toLowerCase();

const reportControlClass =
  'w-full min-w-0 rounded-xl border-slate-700 bg-slate-900/70 p-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-1 focus:ring-primary';

export const GeneralReportView = ({
  cashLaunches,
  clients,
  maintenances,
  expenses,
  warranties,
  appointments,
  settings,
  onBack,
  onViewChange,
}: GeneralReportViewProps) => {
  const [startDate, setStartDate] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [clientQuery, setClientQuery] = useState('');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusFilter>('all');

  const clientsById = useMemo(() => new Map(clients.map(client => [client.id, client])), [clients]);
  const normalizedClientQuery = clientQuery.trim().toLowerCase();

  const serviceTypeOptions = useMemo(() => {
    const disabledDefaultKeys = new Set((settings.disabledDefaultServiceTypes || []).map(getServiceTypeKey));
    const activeDefaults = DEFAULT_SERVICE_TYPES.filter(type => !disabledDefaultKeys.has(getServiceTypeKey(type)));
    return normalizeServiceTypeOptions([
      ...activeDefaults,
      ...(settings.serviceTypes || []),
      ...maintenances.map(maintenance => maintenance.serviceType),
    ]);
  }, [maintenances, settings.disabledDefaultServiceTypes, settings.serviceTypes]);

  const filteredMaintenances = useMemo(() => {
    return maintenances.filter((maintenance) => {
      if (!isDateInRange(maintenance.date, startDate, endDate)) return false;
      if (paymentStatus !== 'all' && getPaymentStatus(maintenance) !== paymentStatus) return false;

      const serviceLabel = getServiceTypeLabel(maintenance.serviceType);
      if (serviceTypeFilter !== 'all' && serviceLabel !== getServiceTypeLabel(serviceTypeFilter)) return false;

      if (normalizedClientQuery) {
        const client = clientsById.get(maintenance.clientId);
        const text = `${maintenance.clientName || ''} ${maintenance.bikeModel || ''} ${getClientSearchText(client)}`.toLowerCase();
        if (!text.includes(normalizedClientQuery)) return false;
      }

      return true;
    });
  }, [clientsById, endDate, maintenances, normalizedClientQuery, paymentStatus, serviceTypeFilter, startDate]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      if (!isDateInRange(expense.date, startDate, endDate)) return false;
      if (!normalizedClientQuery) return true;
      return `${expense.description} ${expense.supplier || ''} ${expense.note || ''} ${expense.paymentMethod}`.toLowerCase().includes(normalizedClientQuery);
    });
  }, [endDate, expenses, normalizedClientQuery, startDate]);

  const filteredWarranties = useMemo(() => {
    return warranties.filter((warranty) => {
      const inServiceDate = isDateInRange(warranty.serviceDate, startDate, endDate);
      const inExpiryDate = isDateInRange(warranty.expiryDate, startDate, endDate);
      const matchesClient = !normalizedClientQuery || `${warranty.clientName} ${warranty.clientPhone} ${warranty.serviceType}`.toLowerCase().includes(normalizedClientQuery);
      return matchesClient && (inServiceDate || inExpiryDate);
    });
  }, [endDate, normalizedClientQuery, startDate, warranties]);

  const filteredAppointments = useMemo(() => {
    return appointments.filter((appointment) => {
      if (!isDateInRange(appointment.scheduledDate, startDate, endDate)) return false;
      if (!normalizedClientQuery) return true;
      return `${appointment.clientName} ${appointment.bikeModel} ${appointment.serviceRequested}`.toLowerCase().includes(normalizedClientQuery);
    });
  }, [appointments, endDate, normalizedClientQuery, startDate]);

  const filteredCashLaunches = useMemo(() => {
    return cashLaunches.filter((launch) => {
      if (!isDateInRange(getCashLaunchDate(launch), startDate, endDate)) return false;
      if (serviceTypeFilter !== 'all') return false;
      if (paymentStatus === 'Pago' && !isCashLaunchPaid(launch)) return false;
      if (paymentStatus === 'Pendente' && !isCashLaunchReceivable(launch)) return false;
      if (paymentStatus === 'Parcial') return false;

      if (!normalizedClientQuery) return true;
      return `${launch.orderNumber} ${launch.clientName} ${launch.bikeModel || ''} ${launch.status}`.toLowerCase().includes(normalizedClientQuery);
    });
  }, [cashLaunches, endDate, normalizedClientQuery, paymentStatus, serviceTypeFilter, startDate]);

  const summary = useMemo(() => {
    const serviceGrossRevenue = filteredMaintenances.reduce((sum, maintenance) => sum + toNumber(maintenance.serviceValue), 0);
    const serviceReceived = filteredMaintenances.reduce((sum, maintenance) => sum + getPaidAmount(maintenance), 0);
    const serviceReceivable = filteredMaintenances.reduce((sum, maintenance) => sum + getReceivableAmount(maintenance), 0);
    const cashGrossRevenue = filteredCashLaunches.reduce((sum, launch) => sum + toNumber(launch.total), 0);
    const cashReceived = filteredCashLaunches
      .filter(isCashLaunchPaid)
      .reduce((sum, launch) => sum + toNumber(launch.total), 0);
    const cashReceivable = filteredCashLaunches
      .filter(isCashLaunchReceivable)
      .reduce((sum, launch) => sum + toNumber(launch.total), 0);
    const grossRevenue = serviceGrossRevenue + cashGrossRevenue;
    const received = serviceReceived + cashReceived;
    const receivable = serviceReceivable + cashReceivable;
    const recurringRevenue = filteredMaintenances
      .filter(maintenance => maintenance.isRecurringRevenue)
      .reduce((sum, maintenance) => sum + toNumber(maintenance.serviceValue), 0);
    const expenseTotal = filteredExpenses.reduce((sum, expense) => sum + toNumber(expense.amount), 0);
    const appointmentValue = filteredAppointments.reduce((sum, appointment) => sum + toNumber(appointment.value), 0);
    const activeWarrantyCount = filteredWarranties.filter((warranty) => {
      const expiryDate = parseDate(warranty.expiryDate);
      return expiryDate ? isAfter(expiryDate, new Date()) : false;
    }).length;

    return {
      cashGrossRevenue,
      cashReceived,
      cashReceivable,
      grossRevenue,
      received,
      receivable,
      recurringRevenue,
      expenseTotal,
      netResult: received - expenseTotal,
      projectedResult: grossRevenue - expenseTotal,
      serviceGrossRevenue,
      serviceReceived,
      serviceReceivable,
      servicesCount: filteredMaintenances.length,
      cashLaunchesCount: filteredCashLaunches.length,
      operationsCount: filteredMaintenances.length + filteredCashLaunches.length,
      averageTicket: (filteredMaintenances.length + filteredCashLaunches.length)
        ? grossRevenue / (filteredMaintenances.length + filteredCashLaunches.length)
        : 0,
      appointmentValue,
      activeWarrantyCount,
    };
  }, [filteredAppointments, filteredCashLaunches, filteredExpenses, filteredMaintenances, filteredWarranties]);

  const receivableRows = useMemo(() => {
    return filteredMaintenances
      .map(maintenance => ({
        maintenance,
        paid: getPaidAmount(maintenance),
        receivable: getReceivableAmount(maintenance),
      }))
      .filter(row => row.receivable > 0)
      .sort((a, b) => b.receivable - a.receivable);
  }, [filteredMaintenances]);

  const cashReceivableRows = useMemo(() => {
    return filteredCashLaunches
      .filter(isCashLaunchReceivable)
      .map(launch => ({
        launch,
        receivable: toNumber(launch.total),
      }))
      .filter(row => row.receivable > 0)
      .sort((a, b) => b.receivable - a.receivable);
  }, [filteredCashLaunches]);

  const serviceBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; gross: number; received: number; receivable: number }>();

    filteredMaintenances.forEach((maintenance) => {
      const label = getServiceTypeLabel(maintenance.serviceType);
      const current = map.get(label) || { count: 0, gross: 0, received: 0, receivable: 0 };
      current.count += 1;
      current.gross += toNumber(maintenance.serviceValue);
      current.received += getPaidAmount(maintenance);
      current.receivable += getReceivableAmount(maintenance);
      map.set(label, current);
    });

    return Array.from(map.entries())
      .map(([label, values]) => ({ label, ...values }))
      .sort((a, b) => b.gross - a.gross);
  }, [filteredMaintenances]);

  const clientBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; gross: number; received: number; receivable: number; bikeModel: string }>();

    const addClientMovement = (
      key: string,
      values: {
        bikeModel?: string;
        gross: number;
        received: number;
        receivable: number;
      },
    ) => {
      const current = map.get(key) || {
        count: 0,
        gross: 0,
        received: 0,
        receivable: 0,
        bikeModel: values.bikeModel || '-',
      };
      current.count += 1;
      current.gross += values.gross;
      current.received += values.received;
      current.receivable += values.receivable;
      if (current.bikeModel === '-' && values.bikeModel) current.bikeModel = values.bikeModel;
      map.set(key, current);
    };

    filteredMaintenances.forEach((maintenance) => {
      const key = maintenance.clientId || maintenance.clientName || 'Sem cliente';
      addClientMovement(key, {
        bikeModel: maintenance.bikeModel || '-',
        gross: toNumber(maintenance.serviceValue),
        received: getPaidAmount(maintenance),
        receivable: getReceivableAmount(maintenance),
      });
    });

    filteredCashLaunches.forEach((launch) => {
      const key = launch.clientId || launch.clientName || 'Consumidor final';
      addClientMovement(key, {
        bikeModel: launch.bikeModel || '-',
        gross: toNumber(launch.total),
        received: isCashLaunchPaid(launch) ? toNumber(launch.total) : 0,
        receivable: isCashLaunchReceivable(launch) ? toNumber(launch.total) : 0,
      });
    });

    return Array.from(map.entries())
      .map(([clientKey, values]) => ({
        name: clientsById.get(clientKey)?.name || filteredMaintenances.find(item => item.clientId === clientKey)?.clientName || clientKey,
        ...values,
      }))
      .sort((a, b) => b.gross - a.gross)
      .slice(0, 12);
  }, [clientsById, filteredCashLaunches, filteredMaintenances]);

  const supplierBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();

    filteredExpenses.forEach((expense) => {
      const supplier = (expense.supplier || '').trim() || 'Sem fornecedor';
      const current = map.get(supplier) || { count: 0, total: 0 };
      current.count += 1;
      current.total += toNumber(expense.amount);
      map.set(supplier, current);
    });

    return Array.from(map.entries())
      .map(([supplier, values]) => ({ supplier, ...values }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [filteredExpenses]);

  const setCurrentMonth = () => {
    setStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    setEndDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const setLastThirtyDays = () => {
    setStartDate(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
    setEndDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const clearFilters = () => {
    setCurrentMonth();
    setClientQuery('');
    setServiceTypeFilter('all');
    setPaymentStatus('all');
  };

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="p-1.5 rounded-full hover:bg-slate-800 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Relatorio geral</p>
            <h2 className="text-xl font-bold">{settings.businessName || 'MotoFix'}</h2>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onViewChange('expenses')}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-2 text-xs font-bold text-slate-200 hover:border-primary/50 hover:bg-slate-700"
          >
            <WalletCards className="h-4 w-4" />
            Abrir gastos
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700"
          >
            <Download className="h-4 w-4" />
            Imprimir / PDF
          </button>
        </div>
      </div>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-800/40 p-4">
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Resumo financeiro</p>
          <h3 className="text-lg font-black text-white">Leitura simples do periodo</h3>
          <p className="text-xs text-slate-400">
            Siga a ordem: vendido, recebido, falta receber e gastos. O resultado aparece logo abaixo.
          </p>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OperationCard
            label="1. Total vendido"
            value={toCurrency(summary.grossRevenue)}
            detail="Tudo que foi lancado no periodo."
            explanation={`Servicos/Oleo: ${toCurrency(summary.serviceGrossRevenue)} | Caixa: ${toCurrency(summary.cashGrossRevenue)}`}
            tone="sky"
            onClick={() => scrollToSection('report-services-detail')}
          />
          <OperationCard
            label="2. Ja recebido"
            value={toCurrency(summary.received)}
            detail="Dinheiro que ja entrou no caixa."
            explanation="Considera servicos pagos e OS faturadas."
            onClick={() => scrollToSection('report-cash-detail')}
            tone="green"
          />
          <OperationCard
            label="3. Falta receber"
            value={toCurrency(summary.receivable)}
            detail="Clientes e ordens ainda em aberto."
            explanation={`${receivableRows.length + cashReceivableRows.length} pendencia(s) encontradas no filtro.`}
            tone="amber"
            onClick={() => scrollToSection('report-receivables')}
          />
          <OperationCard
            label="4. Gastos"
            value={toCurrency(summary.expenseTotal)}
            detail="Saidas registradas no periodo."
            explanation={`${filteredExpenses.length} lancamento(s) de despesa no filtro atual.`}
            tone="red"
            onClick={() => scrollToSection('report-expenses')}
          />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <button
            type="button"
            onClick={() => scrollToSection('report-raw-result')}
            className={`rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary/40 ${summary.netResult >= 0 ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10'}`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Resultado do caixa</p>
            <p className={`mt-1 text-2xl font-black ${summary.netResult >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {toCurrency(summary.netResult)}
            </p>
            <p className="mt-1 text-xs text-slate-400">Recebido - gastos. Mostra o dinheiro que sobrou agora.</p>
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('report-raw-result')}
            className={`rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary/40 ${summary.projectedResult >= 0 ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10'}`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Resultado previsto</p>
            <p className={`mt-1 text-2xl font-black ${summary.projectedResult >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {toCurrency(summary.projectedResult)}
            </p>
            <p className="mt-1 text-xs text-slate-400">Total vendido - gastos. Mostra o cenario se tudo for recebido.</p>
          </button>
        </div>
      </section>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-800/40 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold">Filtros</h3>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-1">
            <span className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Inicio</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className={reportControlClass}
            />
          </label>
          <label className="space-y-1">
            <span className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Fim</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className={reportControlClass}
            />
          </label>
          <label className="space-y-1">
            <span className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Cliente</span>
            <input
              value={clientQuery}
              onChange={(event) => setClientQuery(event.target.value)}
              placeholder="Nome, moto ou telefone"
              className={reportControlClass}
            />
          </label>
          <label className="space-y-1">
            <span className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Servico</span>
            <select
              value={serviceTypeFilter}
              onChange={(event) => setServiceTypeFilter(event.target.value)}
              className={reportControlClass}
            >
              <option value="all">Todos</option>
              {serviceTypeOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Pagamento</span>
            <select
              value={paymentStatus}
              onChange={(event) => setPaymentStatus(event.target.value as PaymentStatusFilter)}
              className={reportControlClass}
            >
              <option value="all">Todos</option>
              <option value="Pago">Pago</option>
              <option value="Pendente">Pendente</option>
              <option value="Parcial">Parcial</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={setCurrentMonth} className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold hover:bg-slate-600">
            Mes atual
          </button>
          <button type="button" onClick={setLastThirtyDays} className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold hover:bg-slate-600">
            Ultimos 30 dias
          </button>
          <button type="button" onClick={clearFilters} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800">
            Limpar
          </button>
        </div>
      </section>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-800/40 p-4">
        <div className="mb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Complementos</p>
          <h3 className="text-sm font-black text-white">Dados de apoio para entender o movimento</h3>
        </div>
        <div className="grid min-w-0 gap-3 md:grid-cols-4">
          <Metric title="Ticket medio" value={toCurrency(summary.averageTicket)} tone="text-white" compact onClick={() => scrollToSection('report-clients')} />
          <Metric title="Atendimentos" value={String(summary.operationsCount)} tone="text-white" compact onClick={() => scrollToSection('report-services-detail')} />
          <Metric title="Receita recorrente" value={toCurrency(summary.recurringRevenue)} tone="text-sky-400" compact onClick={() => scrollToSection('report-services-summary')} />
          <Metric title="Agenda / garantias" value={`${filteredAppointments.length} / ${filteredWarranties.length}`} tone="text-white" compact onClick={() => scrollToSection('report-appointments')} />
        </div>
      </section>

      <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Panel id="report-receivables" title="Contas a receber" icon={WalletCards}>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="py-2">Cliente</th>
                  <th>Servico</th>
                  <th>Data</th>
                  <th>Status</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Pago</th>
                  <th className="text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {receivableRows.map(({ maintenance, paid, receivable }) => (
                  <tr key={maintenance.id} className="text-slate-300">
                    <td className="py-2 font-semibold text-white">{maintenance.clientName || '-'}</td>
                    <td>{getServiceTypeLabel(maintenance.serviceType)}</td>
                    <td>{formatDate(maintenance.date)}</td>
                    <td>{getPaymentStatus(maintenance)}</td>
                    <td className="text-right">{toCurrency(toNumber(maintenance.serviceValue))}</td>
                    <td className="text-right">{toCurrency(paid)}</td>
                    <td className="text-right font-bold text-amber-400">{toCurrency(receivable)}</td>
                  </tr>
                ))}
                {cashReceivableRows.map(({ launch, receivable }) => (
                  <tr key={launch.id} className="text-slate-300">
                    <td className="py-2 font-semibold text-white">{launch.clientName || 'Consumidor final'}</td>
                    <td>{launch.orderNumber || 'Lancamento caixa'}</td>
                    <td>{formatDate(getCashLaunchDate(launch))}</td>
                    <td>{launch.status}</td>
                    <td className="text-right">{toCurrency(toNumber(launch.total))}</td>
                    <td className="text-right">{toCurrency(0)}</td>
                    <td className="text-right font-bold text-amber-400">{toCurrency(receivable)}</td>
                  </tr>
                ))}
                {receivableRows.length === 0 && cashReceivableRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500">Nenhuma conta a receber no filtro atual.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel id="report-services-summary" title="Resumo por servico" icon={BarChart3}>
          <div className="space-y-3">
            {serviceBreakdown.map((service) => {
              const percentage = summary.grossRevenue ? (service.gross / summary.grossRevenue) * 100 : 0;
              return (
                <div key={service.label} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-bold text-slate-200">{service.label}</span>
                    <span className="text-slate-400">{service.count} serv.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-900">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, percentage)}%` }} />
                    </div>
                    <span className="w-24 text-right text-xs font-bold text-emerald-400">{toCurrency(service.gross)}</span>
                  </div>
                </div>
              );
            })}
            {serviceBreakdown.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Sem servicos no filtro atual.</p>}
          </div>
        </Panel>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-3">
        <Panel id="report-clients" title="Clientes com maior movimento" icon={BarChart3}>
          <CompactTable
            headers={['Cliente', 'Moto', 'Servicos', 'Recebido', 'Saldo']}
            rows={clientBreakdown.map(client => [
              client.name,
              client.bikeModel,
              String(client.count),
              toCurrency(client.received),
              toCurrency(client.receivable),
            ])}
          />
        </Panel>

        <Panel id="report-suppliers" title="Fornecedores mais comprados" icon={WalletCards}>
          <div className="space-y-3">
            {supplierBreakdown.map((supplier) => {
              const percentage = summary.expenseTotal ? (supplier.total / summary.expenseTotal) * 100 : 0;
              return (
                <div key={supplier.supplier} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-bold text-slate-200">{supplier.supplier}</span>
                    <span className="text-slate-400">{supplier.count} gasto(s)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-900">
                      <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.min(100, percentage)}%` }} />
                    </div>
                    <span className="w-24 text-right text-xs font-bold text-red-300">{toCurrency(supplier.total)}</span>
                  </div>
                </div>
              );
            })}
            {supplierBreakdown.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Sem fornecedores no filtro atual.</p>}
          </div>
        </Panel>

        <Panel id="report-expenses" title="Gastos no periodo" icon={WalletCards}>
          <CompactTable
            headers={['Descricao', 'Fornecedor', 'Data', 'Forma', 'Valor']}
            rows={filteredExpenses.map(expense => [
              expense.description,
              expense.supplier || '-',
              formatDate(expense.date),
              expense.paymentMethod,
              toCurrency(toNumber(expense.amount)),
            ])}
            emptyMessage="Sem gastos no filtro atual."
          />
        </Panel>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Panel id="report-warranties" title="Garantias no periodo" icon={CalendarDays}>
          <CompactTable
            headers={['Cliente', 'Servico', 'Emissao', 'Vencimento', 'Status']}
            rows={filteredWarranties.map((warranty) => {
              const expiryDate = parseDate(warranty.expiryDate);
              const active = expiryDate ? isAfter(expiryDate, new Date()) : false;
              return [
                warranty.clientName,
                warranty.serviceType,
                formatDate(warranty.serviceDate),
                formatDate(warranty.expiryDate),
                active ? 'Ativa' : 'Vencida',
              ];
            })}
            emptyMessage="Sem garantias no filtro atual."
          />
        </Panel>

        <Panel id="report-appointments" title="Agenda no periodo" icon={CalendarDays}>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Metric title="Valor previsto" value={toCurrency(summary.appointmentValue)} tone="text-sky-400" compact />
            <Metric title="Garantias ativas" value={String(summary.activeWarrantyCount)} tone="text-emerald-400" compact />
          </div>
          <CompactTable
            headers={['Cliente', 'Data', 'Servico', 'Status']}
            rows={filteredAppointments.map(appointment => [
              appointment.clientName,
              formatDate(appointment.scheduledDate),
              appointment.serviceRequested,
              appointment.completed ? 'Concluido' : 'Pendente',
            ])}
            emptyMessage="Sem agendamentos no filtro atual."
          />
        </Panel>
      </section>

      <Panel id="report-services-detail" title="Servicos detalhados" icon={BarChart3}>
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="py-2">Data</th>
                <th>Cliente</th>
                <th>Moto</th>
                <th>Servico</th>
                <th>Status</th>
                <th className="text-right">Total</th>
                <th className="text-right">Recebido</th>
                <th className="text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredMaintenances.map((maintenance) => (
                <tr key={maintenance.id} className="text-slate-300">
                  <td className="py-2">{formatDate(maintenance.date)}</td>
                  <td className="font-semibold text-white">{maintenance.clientName || '-'}</td>
                  <td>{maintenance.bikeModel || '-'}</td>
                  <td>{getServiceTypeLabel(maintenance.serviceType)}</td>
                  <td>{getPaymentStatus(maintenance)}</td>
                  <td className="text-right">{toCurrency(toNumber(maintenance.serviceValue))}</td>
                  <td className="text-right text-emerald-400">{toCurrency(getPaidAmount(maintenance))}</td>
                  <td className="text-right text-amber-400">{toCurrency(getReceivableAmount(maintenance))}</td>
                </tr>
              ))}
              {filteredMaintenances.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500">Nenhum servico encontrado no filtro atual.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel id="report-cash-detail" title="Lancamentos caixa detalhados" icon={WalletCards}>
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="py-2">O.S.</th>
                <th>Cliente</th>
                <th>Moto</th>
                <th>Abertura</th>
                <th>Status</th>
                <th>Faturado</th>
                <th className="text-right">Total</th>
                <th className="text-right">Recebido</th>
                <th className="text-right">Aberto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredCashLaunches.map((launch) => {
                const total = toNumber(launch.total);
                const received = isCashLaunchPaid(launch) ? total : 0;
                const receivable = isCashLaunchReceivable(launch) ? total : 0;

                return (
                  <tr key={launch.id} className="text-slate-300">
                    <td className="py-2 font-semibold text-primary">{launch.orderNumber || '-'}</td>
                    <td className="font-semibold text-white">{launch.clientName || 'Consumidor final'}</td>
                    <td>{launch.bikeModel || '-'}</td>
                    <td>{formatDate(getCashLaunchDate(launch))}</td>
                    <td>{launch.status}</td>
                    <td>{launch.invoiced ? 'Sim' : 'Nao'}</td>
                    <td className="text-right">{toCurrency(total)}</td>
                    <td className="text-right text-emerald-400">{toCurrency(received)}</td>
                    <td className="text-right text-amber-400">{toCurrency(receivable)}</td>
                  </tr>
                );
              })}
              {filteredCashLaunches.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-slate-500">Nenhum lancamento caixa no filtro atual.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel id="report-raw-result" title="Demonstrativo bruto da operacao" icon={WalletCards}>
        <div className="grid gap-3 md:grid-cols-2">
          <ResultLine label="Servicos / oleo lancados" value={summary.serviceGrossRevenue} tone="text-slate-100" />
          <ResultLine label="Lancamentos caixa lancados" value={summary.cashGrossRevenue} tone="text-slate-100" />
          <ResultLine label="Faturamento bruto" value={summary.grossRevenue} tone="text-white" strong />
          <ResultLine label="Total recebido" value={summary.received} tone="text-emerald-400" strong />
          <ResultLine label="A receber" value={summary.receivable} tone="text-amber-400" />
          <ResultLine label="Gastos / custos registrados" value={summary.expenseTotal} tone="text-red-400" />
          <ResultLine label="Resultado de caixa" value={summary.netResult} tone={summary.netResult >= 0 ? 'text-emerald-400' : 'text-red-400'} strong />
          <ResultLine label="Resultado projetado" value={summary.projectedResult} tone={summary.projectedResult >= 0 ? 'text-emerald-400' : 'text-red-400'} strong />
        </div>
        <p className="mt-4 rounded-xl border border-slate-700/60 bg-slate-900/50 p-3 text-xs text-slate-400">
          Base simples do periodo filtrado: resultado de caixa = recebido menos gastos. Resultado projetado = faturamento bruto menos gastos.
          Impostos, taxas de cartao e custos de mercadoria sem cadastro de custo ainda nao entram nesta conta.
        </p>
      </Panel>
    </div>
  );
};

type MetricProps = {
  title: string;
  value: string;
  tone: string;
  compact?: boolean;
  onClick?: () => void;
};

type OperationCardProps = {
  label: string;
  value: string;
  detail: string;
  explanation?: string;
  tone: 'primary' | 'sky' | 'amber' | 'red' | 'violet' | 'slate' | 'green';
  onClick: () => void;
};

const operationToneClasses: Record<OperationCardProps['tone'], string> = {
  primary: 'border-primary/30 bg-primary/10 text-primary',
  sky: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  red: 'border-red-500/30 bg-red-500/10 text-red-300',
  violet: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  slate: 'border-slate-600 bg-slate-900/60 text-slate-200',
  green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
};

const OperationCard = ({ label, value, detail, explanation, tone, onClick }: OperationCardProps) => (
  <button
    type="button"
    onClick={onClick}
    className={`min-w-0 rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/40 ${operationToneClasses[tone]}`}
  >
    <p className="text-[10px] font-black uppercase tracking-widest opacity-90">{label}</p>
    <p className="mt-2 break-words text-2xl font-black text-white">{value}</p>
    <p className="mt-1 text-xs font-semibold text-slate-300">{detail}</p>
    {explanation && <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{explanation}</p>}
    <p className="mt-3 text-[10px] font-bold uppercase tracking-widest">Abrir origem</p>
  </button>
);

const Metric = ({ title, value, tone, compact = false, onClick }: MetricProps) => {
  const content = (
    <>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">{title}</p>
      <p className={`${compact ? 'text-lg' : 'text-2xl'} font-black ${tone}`}>{value}</p>
      {onClick && <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-primary">Ver detalhes</p>}
    </>
  );
  const className = `min-w-0 rounded-2xl border border-slate-700/60 bg-slate-800/40 ${compact ? 'p-3' : 'p-4'}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${className} w-full text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/40`}
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
};

type ResultLineProps = {
  label: string;
  value: number;
  tone: string;
  strong?: boolean;
};

const ResultLine = ({ label, value, tone, strong = false }: ResultLineProps) => (
  <div className={`rounded-xl border border-slate-700/60 bg-slate-900/50 p-3 ${strong ? 'ring-1 ring-slate-600/70' : ''}`}>
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
    <p className={`mt-1 text-xl font-black ${tone}`}>{toCurrency(value)}</p>
  </div>
);

type PanelProps = {
  id?: string;
  title: string;
  icon: typeof BarChart3;
  children: ReactNode;
};

const Panel = ({ id, title, icon: Icon, children }: PanelProps) => (
  <section id={id} className="min-w-0 overflow-hidden scroll-mt-24 rounded-2xl border border-slate-700/60 bg-slate-800/40 p-4">
    <div className="mb-4 flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <h3 className="text-sm font-bold">{title}</h3>
    </div>
    {children}
  </section>
);

type CompactTableProps = {
  headers: string[];
  rows: string[][];
  emptyMessage?: string;
};

const CompactTable = ({ headers, rows, emptyMessage = 'Sem dados no filtro atual.' }: CompactTableProps) => (
  <div className="max-w-full overflow-x-auto">
    <table className="w-full min-w-[480px] text-left text-xs">
      <thead className="text-[10px] uppercase tracking-widest text-slate-500">
        <tr>
          {headers.map(header => <th key={header} className="py-2">{header}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {rows.map((row, rowIndex) => (
          <tr key={`${row[0]}-${rowIndex}`} className="text-slate-300">
            {row.map((cell, cellIndex) => (
              <td key={`${cell}-${cellIndex}`} className={cellIndex === 0 ? 'py-2 font-semibold text-white' : 'py-2'}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={headers.length} className="py-6 text-center text-slate-500">{emptyMessage}</td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);
