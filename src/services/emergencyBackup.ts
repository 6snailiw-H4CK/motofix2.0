import type {
  Appointment,
  CashRegisterLaunch,
  Client,
  ExpenseRecord,
  FiscalInvoice,
  FiscalLog,
  MaintenanceRecord,
  MessageLog,
  Warranty,
} from '../types';

type CsvRow = Record<string, unknown>;

const csvEscape = (value: unknown) => {
  const raw = String(value ?? '');
  return `"${raw.replace(/"/g, '""')}"`;
};

const downloadCsv = (filename: string, rows: CsvRow[]) => {
  const columns = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>()));

  const csv = [
    columns.map(csvEscape).join(','),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')),
  ].join('\n');

  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const backupDate = () => new Date().toISOString().slice(0, 10);

type OperationalBackupData = {
  appointments: Appointment[];
  cashLaunches: CashRegisterLaunch[];
  clients: Client[];
  expenses: ExpenseRecord[];
  fiscalInvoices: FiscalInvoice[];
  fiscalLogs: FiscalLog[];
  maintenances: MaintenanceRecord[];
  messageLogs: MessageLog[];
  warranties: Warranty[];
};

export const exportOperationalBackupJson = (data: OperationalBackupData) => {
  const payload = JSON.stringify({
    format: 'motofix-operational-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    ...data,
  }, null, 2);
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `motofix-backup-operacional-${backupDate()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const exportClientsCsv = (clients: Client[]) => {
  downloadCsv(`motofix-clientes-${backupDate()}.csv`, clients.map((client) => ({
    id: client.id,
    nome: client.name,
    contato: client.contact,
    email: client.email,
    moto: client.bikeModel,
    placa: client.vehiclePlate,
    km: client.mileageKm,
    ultimoServico: client.lastServiceType,
    valorUltimoServico: client.lastServiceValue ?? client.serviceValue,
    statusPagamento: client.statusPagamento,
    valorPago: client.valorPago,
    saldoDevedor: client.saldoDevedor,
    criadoEm: client.createdAt,
  })));
};

export const exportMotorcyclesCsv = (clients: Client[]) => {
  downloadCsv(`motofix-motos-${backupDate()}.csv`, clients.map((client) => ({
    clienteId: client.id,
    cliente: client.name,
    contato: client.contact,
    moto: client.bikeModel,
    placa: client.vehiclePlate,
    km: client.mileageKm,
    ultimoServicoEm: client.lastMaintenanceDate,
    proximoServicoEm: client.nextMaintenanceDate,
    recorrenciaDias: client.recurrenceDays,
    status: client.status,
  })));
};

export const exportCashLaunchesCsv = (cashLaunches: CashRegisterLaunch[]) => {
  downloadCsv(`motofix-os-${backupDate()}.csv`, cashLaunches.map((launch) => ({
    id: launch.id,
    numero: launch.orderNumber,
    cliente: launch.clientName,
    moto: launch.bikeModel,
    status: launch.status,
    abertura: launch.openingDate,
    previsao: launch.expectedDate,
    solicitado: launch.request,
    executado: launch.servicesExecuted,
    observacao: launch.observation,
    itens: launch.items?.length || 0,
    mercadorias: launch.merchandiseTotal,
    descontos: launch.discountTotal,
    total: launch.total,
    faturada: launch.invoiced ? 'sim' : 'nao',
    criadaEm: launch.createdAt,
    atualizadaEm: launch.updatedAt,
  })));
};

export const exportWarrantiesCsv = (warranties: Warranty[]) => {
  downloadCsv(`motofix-garantias-${backupDate()}.csv`, warranties.map((warranty) => ({
    id: warranty.id,
    numero: warranty.warrantyNumber,
    cliente: warranty.clientName,
    telefone: warranty.clientPhone,
    servico: warranty.serviceType,
    descricao: warranty.serviceDescription,
    valor: warranty.serviceValue,
    dataServico: warranty.serviceDate,
    duracaoMeses: warranty.durationMonths,
    vencimento: warranty.expiryDate,
    criadaEm: warranty.createdAt,
  })));
};
