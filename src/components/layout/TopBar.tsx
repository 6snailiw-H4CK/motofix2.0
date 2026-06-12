import { Bell, LogOut, Moon, Search, Settings as SettingsIcon, Sun } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { AppView, ColorMode } from '../../types';

const viewTitles: Partial<Record<AppView, { title: string; subtitle: string }>> = {
  dashboard: {
    title: 'Inicio',
    subtitle: 'Prioridades de hoje para trazer clientes de volta',
  },
  returns: {
    title: 'Retornos',
    subtitle: 'Recorrencia e clientes para contatar',
  },
  pendencies: {
    title: 'Pendencias',
    subtitle: 'Clientes com valores a receber',
  },
  clients: {
    title: 'Servicos/Oleo',
    subtitle: 'Servicos rapidos, oleo e recorrencia',
  },
  'cash-register': {
    title: 'Lancamentos Caixa',
    subtitle: 'Venda rapida com mercadorias importadas',
  },
  products: {
    title: 'Mercadorias',
    subtitle: 'Cadastro e edicao do catalogo importado',
  },
  whatsapp: {
    title: 'WhatsApp IA',
    subtitle: 'Conexao, QR Code, mensagens e automacoes',
  },
  fiscal: {
    title: 'Fiscal',
    subtitle: 'NFS-e, XML, PDF e logs fiscais',
  },
  'clients-schedule': {
    title: 'Clientes',
    subtitle: 'Agenda de relacionamento e fichas',
  },
  appointments: {
    title: 'Agenda',
    subtitle: 'Agenda simples do dia da oficina',
  },
  expenses: {
    title: 'Gastos',
    subtitle: 'Controle rapido de despesas da oficina',
  },
  warranties: {
    title: 'Garantias',
    subtitle: 'Comprovantes e vencimentos',
  },
  history: {
    title: 'Historico',
    subtitle: 'Lancamentos, filtros e avisos',
  },
  settings: {
    title: 'Configuracoes',
    subtitle: 'Perfil, categorias e relatorios',
  },
  'general-report': {
    title: 'Relatorios',
    subtitle: 'Analise detalhada por periodo',
  },
  admin: {
    title: 'Admin',
    subtitle: 'Usuarios e assinaturas',
  },
};

type TopBarProps = {
  alertCount: number;
  businessName?: string;
  colorMode: ColorMode;
  view: AppView;
  onColorModeChange: (mode: ColorMode) => void;
  onRequestNotifications: () => void;
  onSettingsClick: () => void;
  onSignOut: () => void;
};

export const TopBar = ({
  alertCount,
  businessName,
  colorMode,
  view,
  onColorModeChange,
  onRequestNotifications,
  onSettingsClick,
  onSignOut,
}: TopBarProps) => {
  const meta = viewTitles[view] || viewTitles.dashboard;

  return (
    <header className="app-topbar sticky top-0 z-40 border-b border-slate-800/70 bg-[#0b0c10]/92 backdrop-blur-xl">
      <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 lg:px-6">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">{businessName || 'MotoFix Oficina'}</p>
          <h1 className="mt-0.5 truncate text-lg font-black tracking-tight text-white">{meta?.title}</h1>
          <p className="hidden text-xs text-slate-500 sm:block">{meta?.subtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden min-w-52 items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-slate-500 xl:flex">
            <Search className="h-4 w-4" />
            <span className="text-xs">Buscar no modulo atual</span>
          </div>

          <button
            type="button"
            onClick={() => onColorModeChange(colorMode === 'dark' ? 'light' : 'dark')}
            aria-label="Alternar tema"
            title="Alternar tema"
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-800 bg-slate-950/60 text-slate-400 transition-colors hover:border-primary/40 hover:text-white"
          >
            {colorMode === 'dark' ? <Moon className="h-4.5 w-4.5" /> : <Sun className="h-4.5 w-4.5" />}
          </button>

          <button
            type="button"
            onClick={onRequestNotifications}
            aria-label="Notificacoes"
            title="Notificacoes"
            className="relative grid h-9 w-9 place-items-center rounded-lg border border-slate-800 bg-slate-950/60 text-slate-400 transition-colors hover:border-primary/40 hover:text-white"
          >
            <Bell className="h-4.5 w-4.5" />
            {alertCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] font-black text-white">
                {alertCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onSettingsClick}
            aria-label="Configuracoes"
            title="Configuracoes"
            className={cn(
              'grid h-9 w-9 place-items-center rounded-lg border border-slate-800 bg-slate-950/60 text-slate-400 transition-colors hover:border-primary/40 hover:text-white',
              view === 'settings' && 'border-primary/40 text-primary'
            )}
          >
            <SettingsIcon className="h-4.5 w-4.5" />
          </button>

          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sair"
            title="Sair"
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-800 bg-slate-950/60 text-red-400 transition-colors hover:border-red-500/40 hover:bg-red-500/10"
          >
            <LogOut className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
