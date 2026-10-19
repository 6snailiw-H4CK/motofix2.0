import { useEffect, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { RefreshCw, Shield, UserRoundCheck, UserRoundX } from "lucide-react";
import { toast } from "sonner";
import {
  getMasterAdminAccount,
  getMasterAdminUsers,
  updateMasterAdminAccess,
  type MasterAdminAccountDetail,
  type MasterAdminListResponse,
} from "../../services/masterAdminService";

type MasterAdminViewProps = {
  currentUserId: string;
  onAuthorizationStateChange?: (state: "authorized" | "denied" | "expired" | "unavailable") => void;
};

const dateLabel = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = parseISO(value);
  return isValid(date) ? format(date, "dd/MM/yyyy") : "—";
};

const statusLabel = (account: MasterAdminListResponse["users"][number]) => {
  if (account.requestStatus === "pending") return "Pendente";
  if (account.requestStatus === "blocked") return "Suspensa";
  if (account.manualAccessState === "expired") return "Vencida";
  return account.accessAllowed ? "Ativa" : "Aprovada — sem vigência";
};

export const MasterAdminView = ({ currentUserId, onAuthorizationStateChange }: MasterAdminViewProps) => {
  const [list, setList] = useState<MasterAdminListResponse | null>(null);
  const [detail, setDetail] = useState<MasterAdminAccountDetail | null>(null);
  const [selectedUid, setSelectedUid] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "blocked">("all");
  const [expiry, setExpiry] = useState("");
  const [plan, setPlan] = useState("Manual");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void getMasterAdminUsers({ search, status: filter, role: "all", pageSize: 50 }, null)
      .then((response) => {
        if (!active) return;
        setList(response);
        onAuthorizationStateChange?.("authorized");
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Não foi possível consultar as solicitações.");
        setList(null);
        onAuthorizationStateChange?.("unavailable");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filter, onAuthorizationStateChange, refreshKey, search]);

  useEffect(() => {
    if (!selectedUid) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetail(null);
    void getMasterAdminAccount(selectedUid).then((value) => {
      if (!active) return;
      setDetail(value);
      setExpiry(value.account.manualAccessExpiresAt?.slice(0, 10)
        ?? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
      setPlan(value.account.plan || "Manual");
      setAmount("");
      setPaymentConfirmed(false);
    }).catch((loadError: unknown) => {
      if (active) toast.error(loadError instanceof Error ? loadError.message : "Não foi possível carregar a conta.");
    });
    return () => { active = false; };
  }, [refreshKey, selectedUid]);

  const saveDecision = async (enabled: boolean) => {
    if (!detail || saving || detail.account.uid === currentUserId) return;
    const parsedAmount = Number(amount);
    if (!reason.trim()) {
      toast.error("Informe o motivo da decisão.");
      return;
    }
    if (enabled && (!plan.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !paymentConfirmed)) {
      toast.error("Para ativar, informe plano, valor e confirme o recebimento verificado.");
      return;
    }
    const newExpiry = enabled ? `${expiry}T23:59:59.000Z` : null;
    const prompt = enabled
      ? `${detail.account.requestStatus === "approved" ? "Conceder/renovar" : "Ativar"} acesso manual para ${detail.account.displayName || detail.account.uid} até ${dateLabel(newExpiry)}? Confirme somente após verificar o recebimento real.`
      : `Suspender o acesso de ${detail.account.displayName || detail.account.uid}?`;
    if (!window.confirm(prompt)) return;
    setSaving(true);
    try {
      await updateMasterAdminAccess(detail.account.uid, {
        isActive: enabled,
        manualAccess: { enabled, expiresAt: newExpiry },
        reason,
        plan: plan.trim(),
        amount: enabled ? parsedAmount : 0,
        paymentMethod: enabled ? "pix" : "none",
        paymentConfirmed: enabled,
      });
      toast.success(enabled ? "Acesso manual atualizado." : "Acesso suspenso.");
      setPaymentConfirmed(false);
      setRefreshKey((value) => value + 1);
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "A decisão foi recusada.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-violet-300" />
          <div>
            <h1 className="text-2xl font-black text-white">Master Admin</h1>
            <p className="text-sm text-slate-400">Acesso manual. A cobrança Stripe não concede nem revoga acesso.</p>
          </div>
        </div>
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 disabled:opacity-50">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Solicitações", list?.metrics.total ?? "—"],
          ["Ativas", list?.metrics.active ?? "—"],
          ["Suspensas", list?.metrics.blocked ?? "—"],
          ["Vencendo em 7 dias", list?.metrics.expiringSoon ?? "—"],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-2xl font-bold text-white">{value}</p>
        </div>)}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="UID ou e-mail exato"
              aria-label="Buscar solicitação" className="min-w-48 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
            <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}
              aria-label="Filtrar estado" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
              <option value="all">Todos</option><option value="active">Com acesso vigente</option><option value="blocked">Sem acesso vigente</option>
            </select>
          </div>
          {error && <p role="alert" className="mb-3 text-sm text-rose-300">{error}</p>}
          {loading ? <p className="p-6 text-sm text-slate-400">Carregando solicitações…</p> : (
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-slate-700 text-xs text-slate-400">
                  <th className="p-2">Conta</th><th className="p-2">Estado</th><th className="p-2">Vigência</th>
                </tr></thead>
                <tbody>{(list?.users ?? []).map((account) => <tr key={account.uid}
                  onClick={() => setSelectedUid(account.uid)}
                  className={`cursor-pointer border-b border-slate-800 hover:bg-slate-800/60 ${selectedUid === account.uid ? "bg-slate-800/60" : ""}`}>
                  <td className="p-2"><span className="block font-semibold text-slate-100">{account.displayName || "Sem nome"}</span>
                    <span className="block text-xs text-slate-400">{account.email}</span></td>
                  <td className="p-2 text-slate-300">{statusLabel(account)}</td>
                  <td className="p-2 text-slate-300">{dateLabel(account.manualAccessExpiresAt)}</td>
                </tr>)}</tbody>
              </table>
              {!list?.users.length && <p className="p-6 text-sm text-slate-400">Nenhuma solicitação encontrada.</p>}
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-500">A lista usa somente documentos mínimos de `access_requests`; não consulta nem lista `/users`.</p>
        </section>

        <aside className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          {!detail ? <p className="text-sm text-slate-400">Selecione uma conta para revisar o acesso e o histórico.</p> : <>
            <div>
              <h2 className="font-bold text-white">{detail.account.displayName || "Sem nome"}</h2>
              <p className="text-xs text-slate-400">{detail.account.email}</p>
              <p className="mt-2 text-sm text-slate-300">Estado: {statusLabel(detail.account)} · Cadastro {dateLabel(detail.account.createdAt)}</p>
              <p className="text-sm text-slate-300">Vigência: {dateLabel(detail.account.manualAccessExpiresAt)}</p>
            </div>
            {detail.account.uid === currentUserId ? <p className="text-xs text-amber-300">Não é permitido alterar o próprio acesso.</p> : <>
              <label className="block text-xs text-slate-300">Plano/descrição
                <input value={plan} onChange={(event) => setPlan(event.target.value)} maxLength={80}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
              </label>
              <label className="block text-xs text-slate-300">Valor confirmado (R$)
                <input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
              </label>
              <label className="block text-xs text-slate-300">Válido até
                <input type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
              </label>
              <label className="block text-xs text-slate-300">Motivo da decisão
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
              </label>
              <label className="flex gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={paymentConfirmed} onChange={(event) => setPaymentConfirmed(event.target.checked)} />
                Confirmei o recebimento diretamente; comprovante do cliente não é confirmação.
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={saving} onClick={() => void saveDecision(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                  <UserRoundCheck className="h-4 w-4" /> Ativar / renovar
                </button>
                <button type="button" disabled={saving || detail.account.requestStatus === "blocked"} onClick={() => void saveDecision(false)}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 px-3 py-2 text-xs font-bold text-rose-300 disabled:opacity-50">
                  <UserRoundX className="h-4 w-4" /> Suspender
                </button>
              </div>
            </>}
            <section className="border-t border-slate-700 pt-3">
              <h3 className="mb-2 text-sm font-bold text-white">Histórico imutável</h3>
              <div className="max-h-64 space-y-2 overflow-auto">
                {detail.auditEvents.map((event) => <article key={event.id} className="rounded-lg bg-slate-950/70 p-3 text-xs">
                  <p className="font-semibold text-slate-200">{event.action} · {dateLabel(event.timestamp)}</p>
                  <p className="mt-1 text-slate-400">Administrador: {event.actor || "—"} · Plano: {event.plan || "—"} · Valor: {event.amount ?? "—"}</p>
                  <p className="text-slate-400">Vigência: {dateLabel((event.after?.manualAccessExpiresAt as string | null) ?? null)} · PIX confirmado: {event.paymentConfirmed ? "Sim" : "Não"}</p>
                  <p className="text-slate-500">{event.reason || "Sem motivo registrado"}</p>
                </article>)}
                {!detail.auditEvents.length && <p className="text-xs text-slate-500">Sem decisões registradas.</p>}
              </div>
            </section>
          </>}
        </aside>
      </div>
    </div>
  );
};
