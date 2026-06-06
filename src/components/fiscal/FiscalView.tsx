import { useMemo, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  Building2,
  Download,
  FileCheck2,
  FileText,
  RefreshCw,
  Save,
  Send,
  Upload,
} from 'lucide-react';
import { cn, safeFormat } from '../../lib/utils';
import type {
  CashRegisterLaunch,
  FiscalCompany,
  FiscalCompanyFormInput,
  FiscalInvoice,
  FiscalLog,
} from '../../types';

type FiscalViewProps = {
  cashLaunches: CashRegisterLaunch[];
  fiscalCompanies: FiscalCompany[];
  fiscalInvoices: FiscalInvoice[];
  fiscalLogs: FiscalLog[];
  isIssuingInvoice: boolean;
  isSavingCompany: boolean;
  processingInvoiceId?: string | null;
  onCancelInvoice: (invoice: FiscalInvoice) => void;
  onDownloadDocument: (invoice: FiscalInvoice, kind: 'xml' | 'pdf') => void;
  onIssueFromCashLaunch: (cashLaunch: CashRegisterLaunch, companyId?: string) => void;
  onIssueManualNfse: (payload: {
    companyId: string;
    customer: {
      name: string;
      document?: string;
      email?: string;
      phone?: string;
    };
    service: {
      description: string;
      serviceCode?: string;
      municipalTaxCode?: string;
      cityCode?: string;
      amount: number;
      issRate?: number;
    };
    focusOverrides?: Record<string, unknown>;
  }) => void;
  onSaveCompany: (input: FiscalCompanyFormInput, certificateFile?: File | null) => void;
  onSyncInvoice: (invoice: FiscalInvoice) => void;
};

type FiscalTab = 'companies' | 'issue' | 'invoices' | 'logs';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const inputClass = 'w-full rounded-xl border border-slate-700/60 bg-slate-950/50 px-3 py-2 text-xs text-slate-100 outline-none transition focus:border-primary/60 focus:ring-1 focus:ring-primary/50';
const labelClass = 'text-[10px] font-bold uppercase tracking-widest text-slate-500';

const initialCompanyForm: FiscalCompanyFormInput = {
  focusEnvironment: 'homologation',
  legalName: '',
  tradeName: '',
  document: '',
  municipalRegistration: '',
  taxRegime: 'simples_nacional',
  cnae: '',
  serviceCityCode: '',
  serviceCityName: '',
  city: '',
  state: '',
  zipCode: '',
  email: '',
  phone: '',
  nfseEnabled: true,
  nfeEnabled: false,
  nfceEnabled: false,
  autoIssueFromCashLaunch: false,
};

const statusBadge: Record<string, string> = {
  authorized: 'bg-emerald-500/15 text-emerald-300',
  queued: 'bg-blue-500/15 text-blue-300',
  processing: 'bg-blue-500/15 text-blue-300',
  rejected: 'bg-red-500/15 text-red-300',
  error: 'bg-red-500/15 text-red-300',
  cancelled: 'bg-amber-500/15 text-amber-300',
  draft: 'bg-slate-700 text-slate-300',
};

const parseJsonOrUndefined = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return JSON.parse(trimmed) as Record<string, unknown>;
};

export const FiscalView = ({
  cashLaunches,
  fiscalCompanies,
  fiscalInvoices,
  fiscalLogs,
  isIssuingInvoice,
  isSavingCompany,
  processingInvoiceId,
  onCancelInvoice,
  onDownloadDocument,
  onIssueFromCashLaunch,
  onIssueManualNfse,
  onSaveCompany,
  onSyncInvoice,
}: FiscalViewProps) => {
  const [tab, setTab] = useState<FiscalTab>('companies');
  const [companyForm, setCompanyForm] = useState<FiscalCompanyFormInput>(initialCompanyForm);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [manualCompanyId, setManualCompanyId] = useState('');
  const [cashCompanyId, setCashCompanyId] = useState('');
  const [manualCustomerName, setManualCustomerName] = useState('');
  const [manualCustomerDocument, setManualCustomerDocument] = useState('');
  const [manualCustomerEmail, setManualCustomerEmail] = useState('');
  const [manualCustomerPhone, setManualCustomerPhone] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualServiceCode, setManualServiceCode] = useState('');
  const [manualMunicipalCode, setManualMunicipalCode] = useState('');
  const [manualCityCode, setManualCityCode] = useState('');
  const [manualIssRate, setManualIssRate] = useState('');
  const [manualOverrides, setManualOverrides] = useState('');
  const [manualJsonError, setManualJsonError] = useState('');

  const nfseCompanies = fiscalCompanies.filter((company) => company.nfseEnabled);
  const selectedCompanyId = manualCompanyId || nfseCompanies[0]?.id || '';
  const selectedCashCompanyId = cashCompanyId || nfseCompanies.find((company) => company.autoIssueFromCashLaunch)?.id || nfseCompanies[0]?.id || '';

  const eligibleCashLaunches = useMemo(() => (
    cashLaunches
      .filter((launch) => launch.status === 'Finalizado')
      .slice(0, 12)
  ), [cashLaunches]);

  const updateCompany = (patch: FiscalCompanyFormInput) => {
    setCompanyForm((current) => ({ ...current, ...patch }));
  };

  const editCompany = (company: FiscalCompany) => {
    setCompanyForm({
      ...company,
      focusApiToken: '',
      certificatePassword: '',
    });
    setCertificateFile(null);
    setTab('companies');
  };

  const handleCertificate = (event: ChangeEvent<HTMLInputElement>) => {
    setCertificateFile(event.target.files?.[0] || null);
  };

  const submitCompany = () => {
    onSaveCompany(companyForm, certificateFile);
  };

  const submitManual = () => {
    let focusOverrides: Record<string, unknown> | undefined;

    try {
      focusOverrides = parseJsonOrUndefined(manualOverrides);
      setManualJsonError('');
    } catch {
      setManualJsonError('JSON opcional invalido. Revise o texto antes de emitir.');
      return;
    }

    onIssueManualNfse({
      companyId: selectedCompanyId,
      customer: {
        name: manualCustomerName,
        document: manualCustomerDocument,
        email: manualCustomerEmail,
        phone: manualCustomerPhone,
      },
      service: {
        description: manualDescription,
        amount: Number(manualAmount.replace(/\./g, '').replace(',', '.')) || 0,
        serviceCode: manualServiceCode,
        municipalTaxCode: manualMunicipalCode,
        cityCode: manualCityCode,
        issRate: Number(manualIssRate.replace(',', '.')) || 0,
      },
      focusOverrides,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Modulo fiscal</p>
          <h2 className="text-2xl font-black text-white">NFS-e Focus NFe</h2>
          <p className="text-sm text-slate-400">Arquitetura multiempresa para NFS-e, preparada para NF-e e NFC-e.</p>
        </div>
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 px-4 py-3 text-xs text-slate-300">
          <span className="font-black text-white">{fiscalCompanies.length}</span> empresa(s) fiscal(is) |
          {' '}<span className="font-black text-white">{fiscalInvoices.length}</span> nota(s)
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/55">
        <div className="flex flex-wrap border-b border-slate-700/60 bg-slate-950/50">
          {[
            { id: 'companies' as FiscalTab, label: 'Configuracoes fiscais', icon: Building2 },
            { id: 'issue' as FiscalTab, label: 'Emitir NFS-e', icon: Send },
            { id: 'invoices' as FiscalTab, label: 'Notas', icon: FileCheck2 },
            { id: 'logs' as FiscalTab, label: 'Logs fiscais', icon: AlertTriangle },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  'inline-flex min-h-12 items-center gap-2 border-b-2 px-5 text-xs font-black uppercase tracking-wide transition',
                  tab === item.id ? 'border-primary bg-primary/10 text-white' : 'border-transparent text-slate-400 hover:bg-slate-900 hover:text-white'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>

        {tab === 'companies' && (
          <div className="grid gap-5 p-4 xl:grid-cols-[1fr_0.8fr]">
            <div className="space-y-4 rounded-2xl border border-slate-700/50 bg-slate-950/30 p-4">
              <div>
                <p className={labelClass}>Empresa fiscal</p>
                <h3 className="text-lg font-black text-white">Configuracao Focus NFe</h3>
                <p className="text-xs text-slate-500">Token e senha ficam somente no servidor. O certificado A1 nao fica salvo no app.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className={labelClass}>Ambiente</span>
                  <select value={companyForm.focusEnvironment} onChange={(event) => updateCompany({ focusEnvironment: event.target.value as 'homologation' | 'production' })} className={inputClass}>
                    <option value="homologation">Homologacao</option>
                    <option value="production">Producao</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className={labelClass}>CNPJ</span>
                  <input value={companyForm.document || ''} onChange={(event) => updateCompany({ document: event.target.value })} className={inputClass} placeholder="00.000.000/0000-00" />
                </label>
                <label className="space-y-1">
                  <span className={labelClass}>Razao social</span>
                  <input value={companyForm.legalName || ''} onChange={(event) => updateCompany({ legalName: event.target.value })} className={inputClass} placeholder="MotoFix Oficina LTDA" />
                </label>
                <label className="space-y-1">
                  <span className={labelClass}>Nome fantasia</span>
                  <input value={companyForm.tradeName || ''} onChange={(event) => updateCompany({ tradeName: event.target.value })} className={inputClass} placeholder="Box Motors" />
                </label>
                <label className="space-y-1">
                  <span className={labelClass}>Inscricao municipal</span>
                  <input value={companyForm.municipalRegistration || ''} onChange={(event) => updateCompany({ municipalRegistration: event.target.value })} className={inputClass} />
                </label>
                <label className="space-y-1">
                  <span className={labelClass}>Codigo municipio servico</span>
                  <input value={companyForm.serviceCityCode || ''} onChange={(event) => updateCompany({ serviceCityCode: event.target.value })} className={inputClass} placeholder="IBGE" />
                </label>
                <label className="space-y-1">
                  <span className={labelClass}>Cidade</span>
                  <input value={companyForm.city || ''} onChange={(event) => updateCompany({ city: event.target.value })} className={inputClass} />
                </label>
                <label className="space-y-1">
                  <span className={labelClass}>UF</span>
                  <input value={companyForm.state || ''} onChange={(event) => updateCompany({ state: event.target.value })} className={inputClass} maxLength={2} />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className={labelClass}>Token Focus NFe</span>
                  <input type="password" value={companyForm.focusApiToken || ''} onChange={(event) => updateCompany({ focusApiToken: event.target.value })} className={inputClass} placeholder="Cole o token da Focus para esta empresa" />
                </label>
                <label className="space-y-1">
                  <span className={labelClass}>Certificado A1 (.pfx/.p12)</span>
                  <input type="file" accept=".pfx,.p12" onChange={handleCertificate} className={inputClass} />
                </label>
                <label className="space-y-1">
                  <span className={labelClass}>Senha certificado</span>
                  <input type="password" value={companyForm.certificatePassword || ''} onChange={(event) => updateCompany({ certificatePassword: event.target.value })} className={inputClass} />
                </label>
              </div>

              <div className="flex flex-wrap gap-3">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-300">
                  <input type="checkbox" checked={Boolean(companyForm.nfseEnabled)} onChange={(event) => updateCompany({ nfseEnabled: event.target.checked })} />
                  NFS-e ativa
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-300">
                  <input type="checkbox" checked={Boolean(companyForm.autoIssueFromCashLaunch)} onChange={(event) => updateCompany({ autoIssueFromCashLaunch: event.target.checked })} />
                  Emitir automaticamente ao faturar O.S.
                </label>
              </div>

              <button type="button" onClick={submitCompany} disabled={isSavingCompany} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-primary/20 disabled:opacity-60">
                <Save className="h-4 w-4" />
                {isSavingCompany ? 'Salvando...' : 'Salvar configuracao fiscal'}
              </button>
            </div>

            <div className="space-y-3">
              {fiscalCompanies.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700/60 p-6 text-center text-sm text-slate-500">Nenhuma empresa fiscal cadastrada.</div>
              ) : fiscalCompanies.map((company) => (
                <button key={company.id} type="button" onClick={() => editCompany(company)} className="w-full rounded-2xl border border-slate-700/60 bg-slate-950/40 p-4 text-left transition hover:border-primary/50">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-white">{company.tradeName || company.legalName}</p>
                      <p className="text-xs text-slate-500">{company.document} | {company.focusEnvironment === 'production' ? 'Producao' : 'Homologacao'}</p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-black text-primary">NFS-e</span>
                  </div>
                  <p className="mt-3 text-xs text-slate-400">Certificado: {company.certificateUploadedAt ? safeFormat(company.certificateUploadedAt, 'dd/MM/yyyy HH:mm') : 'nao enviado'}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'issue' && (
          <div className="grid gap-5 p-4 xl:grid-cols-[1fr_0.9fr]">
            <div className="space-y-4 rounded-2xl border border-slate-700/50 bg-slate-950/30 p-4">
              <div>
                <p className={labelClass}>Emissao manual</p>
                <h3 className="text-lg font-black text-white">Nova NFS-e</h3>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 md:col-span-2">
                  <span className={labelClass}>Empresa</span>
                  <select value={selectedCompanyId} onChange={(event) => setManualCompanyId(event.target.value)} className={inputClass}>
                    {nfseCompanies.map((company) => <option key={company.id} value={company.id}>{company.tradeName || company.legalName}</option>)}
                  </select>
                </label>
                <input value={manualCustomerName} onChange={(event) => setManualCustomerName(event.target.value)} className={inputClass} placeholder="Cliente / tomador" />
                <input value={manualCustomerDocument} onChange={(event) => setManualCustomerDocument(event.target.value)} className={inputClass} placeholder="CPF/CNPJ tomador" />
                <input value={manualCustomerEmail} onChange={(event) => setManualCustomerEmail(event.target.value)} className={inputClass} placeholder="E-mail" />
                <input value={manualCustomerPhone} onChange={(event) => setManualCustomerPhone(event.target.value)} className={inputClass} placeholder="Telefone" />
                <input value={manualDescription} onChange={(event) => setManualDescription(event.target.value)} className={cn(inputClass, 'md:col-span-2')} placeholder="Descricao do servico" />
                <input value={manualAmount} onChange={(event) => setManualAmount(event.target.value)} className={inputClass} placeholder="Valor R$" />
                <input value={manualIssRate} onChange={(event) => setManualIssRate(event.target.value)} className={inputClass} placeholder="Aliquota ISS" />
                <input value={manualServiceCode} onChange={(event) => setManualServiceCode(event.target.value)} className={inputClass} placeholder="Item lista servico" />
                <input value={manualMunicipalCode} onChange={(event) => setManualMunicipalCode(event.target.value)} className={inputClass} placeholder="Codigo tributario municipal" />
                <input value={manualCityCode} onChange={(event) => setManualCityCode(event.target.value)} className={inputClass} placeholder="Codigo municipio" />
                <textarea value={manualOverrides} onChange={(event) => setManualOverrides(event.target.value)} rows={4} className={cn(inputClass, 'md:col-span-2 resize-none')} placeholder="JSON opcional de campos especificos da prefeitura/Focus" />
                {manualJsonError && <p className="md:col-span-2 text-xs font-bold text-red-300">{manualJsonError}</p>}
              </div>

              <button type="button" onClick={submitManual} disabled={isIssuingInvoice || !selectedCompanyId} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">
                <Send className="h-4 w-4" />
                {isIssuingInvoice ? 'Emitindo...' : 'Emitir NFS-e manual'}
              </button>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-700/50 bg-slate-950/30 p-4">
              <div>
                <p className={labelClass}>Emissao por O.S.</p>
                <h3 className="text-lg font-black text-white">Ordens finalizadas</h3>
              </div>
              <select value={selectedCashCompanyId} onChange={(event) => setCashCompanyId(event.target.value)} className={inputClass}>
                {nfseCompanies.map((company) => <option key={company.id} value={company.id}>{company.tradeName || company.legalName}</option>)}
              </select>
              {eligibleCashLaunches.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-700/50 p-4 text-center text-xs text-slate-500">Nenhuma O.S. finalizada para emissao.</p>
              ) : eligibleCashLaunches.map((launch) => (
                <div key={launch.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-900/70 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-white">{launch.clientName}</p>
                    <p className="text-[10px] text-slate-500">{launch.orderNumber} | {currency.format(launch.total)}</p>
                  </div>
                  <button type="button" onClick={() => onIssueFromCashLaunch(launch, selectedCashCompanyId)} disabled={isIssuingInvoice} className="rounded-xl bg-primary/15 px-3 py-2 text-[10px] font-black uppercase text-primary hover:bg-primary/25 disabled:opacity-50">
                    Emitir
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'invoices' && (
          <div className="space-y-4 p-4">
            <div className="overflow-x-auto rounded-2xl border border-slate-700/50">
              <table className="min-w-[980px] w-full text-left text-xs">
                <thead className="bg-primary/90 text-white">
                  <tr>
                    <th className="px-3 py-2">Referencia</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Origem</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2">Criada em</th>
                    <th className="px-3 py-2 text-right">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                  {fiscalInvoices.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-500">Nenhuma nota emitida ainda.</td></tr>
                  ) : fiscalInvoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="px-3 py-2 font-black text-primary">{invoice.reference}</td>
                      <td className="px-3 py-2 font-bold text-white">{invoice.customer?.name}</td>
                      <td className="px-3 py-2 text-slate-400">{invoice.source === 'cash_register' ? 'O.S.' : 'Manual'}</td>
                      <td className="px-3 py-2"><span className={cn('rounded-full px-2 py-1 text-[10px] font-black uppercase', statusBadge[invoice.status] || statusBadge.draft)}>{invoice.status}</span></td>
                      <td className="px-3 py-2 text-right font-black text-white">{currency.format(invoice.total)}</td>
                      <td className="px-3 py-2 text-slate-400">{safeFormat(invoice.createdAt, 'dd/MM/yyyy HH:mm')}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => onSyncInvoice(invoice)} disabled={processingInvoiceId === invoice.id} className="rounded-lg bg-slate-800 px-2 py-1.5 text-slate-200"><RefreshCw className="h-4 w-4" /></button>
                          <button type="button" onClick={() => onDownloadDocument(invoice, 'xml')} className="rounded-lg bg-slate-800 px-2 py-1.5 text-slate-200"><FileText className="h-4 w-4" /></button>
                          <button type="button" onClick={() => onDownloadDocument(invoice, 'pdf')} className="rounded-lg bg-slate-800 px-2 py-1.5 text-slate-200"><Download className="h-4 w-4" /></button>
                          <button type="button" onClick={() => onCancelInvoice(invoice)} className="rounded-lg bg-red-500/10 px-2 py-1.5 text-red-300">Cancelar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'logs' && (
          <div className="space-y-3 p-4">
            {fiscalLogs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700/60 p-8 text-center text-sm text-slate-500">Nenhum log fiscal registrado.</div>
            ) : fiscalLogs.slice(0, 80).map((log) => (
              <div key={log.id} className="rounded-2xl border border-slate-700/50 bg-slate-950/40 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-white">{log.event}</p>
                    <p className="text-xs text-slate-400">{log.message}</p>
                  </div>
                  <span className="text-[10px] font-bold uppercase text-slate-500">{safeFormat(log.createdAt, 'dd/MM/yyyy HH:mm')}</span>
                </div>
                {log.reference && <p className="mt-2 text-[10px] text-primary">{log.reference}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-100">
        A NFS-e varia por prefeitura. Use os campos de codigo municipal, item de servico e JSON opcional para complementar regras locais antes de ir para producao.
      </div>
    </div>
  );
};

export default FiscalView;
