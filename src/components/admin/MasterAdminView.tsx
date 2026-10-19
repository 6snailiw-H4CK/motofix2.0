import { useEffect, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { Ban, CalendarClock, CheckCircle2, Clock3, RefreshCw, Shield, UserRoundCheck, UserRoundX, X } from "lucide-react";
import { toast } from "sonner";
import {
  getMasterAdminAccount,
  getMasterAdminUsers,
  MasterAdminRequestError,
  updateMasterAdminAccess,
  type MasterAdminAuditEvent,
  type MasterAdminAccountDetail,
  type MasterAdminListResponse,
} from "../../services/masterAdminService";

type MasterAdminViewProps = {
  currentUserId: string;
  onAuthorizationStateChange?: (state: "authorized" | "denied" | "expired" | "unavailable") => void;
};

type ManagedRole = "user" | "admin" | "master_admin";
const ACCESS_DAY_PRESETS = [30, 60, 120, 365] as const;

const dateLabel = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = parseISO(value);
  return isValid(date) ? format(date, "dd/MM/yyyy") : "—";
};

const statusLabel = (account: MasterAdminListResponse["users"][number]) => {
  if (!account.isActive) return "Suspensa";
  if (account.manualAccessState === "expired") return "Vencida";
  if (account.ownerAccess.permanent || account.accessAllowed || account.manualAccessState === "active") return "Ativa";
  return "Sem vigência";
};

const auditExpiry = (event: MasterAdminAuditEvent) => {
  const manualAccess = event.after?.manualAccess;
  if (manualAccess && typeof manualAccess === "object" && "expiresAt" in manualAccess) {
    const expiresAt = manualAccess.expiresAt;
    if (typeof expiresAt === "string") return expiresAt;
  }
  return null;
};

const roleLabel = (role: unknown) => {
  if (role === "master_admin") return "Master Admin";
  if (role === "admin") return "Administrador";
  if (role === "user") return "Usuário";
  return "—";
};

export const MasterAdminView = ({ currentUserId, onAuthorizationStateChange }: MasterAdminViewProps) => {
  const [list, setList] = useState<MasterAdminListResponse | null>(null);
  const [detail, setDetail] = useState<MasterAdminAccountDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "blocked" | "expiring">("all");
  const [pageCursors, setPageCursors] = useState<Array<string | null>>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [accessDays, setAccessDays] = useState("30");
  const [managedRole, setManagedRole] = useState<ManagedRole>("user");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const cursor = pageCursors[pageIndex] ?? null;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void getMasterAdminUsers({ search, status: filter, role: "all", pageSize: 50 }, cursor)
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
  }, [cursor, filter, onAuthorizationStateChange, refreshKey, search]);

  useEffect(() => {
    if (!selectedUid) {
      setDetail(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }
    let active = true;
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    void getMasterAdminAccount(selectedUid).then((value) => {
      if (!active) return;
      setDetail(value);
      setAccessDays("30");
      setManagedRole(value.account.role ?? "user");
    }).catch((loadError: unknown) => {
      if (active) {
        const message = loadError instanceof Error ? loadError.message : "Não foi possível carregar a conta.";
        setDetailError(message);
        toast.error(message);
      }
    }).finally(() => {
      if (active) setDetailLoading(false);
    });
    return () => { active = false; };
  }, [refreshKey, selectedUid]);

  const saveDecision = async (enabled: boolean) => {
    if (!detail || saving || detail.account.uid === currentUserId) return;
    if (!reason.trim()) {
      toast.error("Informe o motivo da decisão.");
      return;
    }
    const days = Number(accessDays);
    if (enabled && (!Number.isInteger(days) || days < 1 || days > 3650)) {
      toast.error("Informe uma vigência entre 1 e 3650 dias.");
      return;
    }
    const prompt = enabled
      ? `Conceder/renovar o acesso de ${detail.account.displayName || detail.account.uid} por ${days} dias?`
      : `Suspender o acesso de ${detail.account.displayName || detail.account.uid}?`;
    if (!window.confirm(prompt)) return;
    setSaving(true);
    try {
      await updateMasterAdminAccess(detail.account.uid, {
        isActive: enabled,
        days: enabled ? days : 0,
        reason,
      });
      toast.success(enabled ? `Acesso concedido por ${days} dias.` : "Acesso suspenso.");
      setReason("");
      setRefreshKey((value) => value + 1);
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "A decisão foi recusada.");
      if (saveError instanceof MasterAdminRequestError && saveError.persisted) {
        setReason("");
        setRefreshKey((value) => value + 1);
      }
    } finally {
      setSaving(false);
    }
  };

  const saveRole = async () => {
    if (!detail || saving || detail.account.uid === currentUserId || detail.account.ownerAccess.permanent) return;
    if (managedRole === detail.account.role) {
      toast.error("Selecione um nível de acesso diferente do atual.");
      return;
    }
    if (!reason.trim()) {
      toast.error("Informe o motivo da alteração de permissão.");
      return;
    }
    const targetName = detail.account.displayName || detail.account.uid;
    const prompt = `Alterar o perfil de ${targetName} de ${roleLabel(detail.account.role)} para ${roleLabel(managedRole)}?`;
    if (!window.confirm(prompt)) return;
    setSaving(true);
    try {
      await updateMasterAdminAccess(detail.account.uid, { role: managedRole, reason });
      toast.success(`Perfil atualizado para ${roleLabel(managedRole)}.`);
      setReason("");
      setRefreshKey((value) => value + 1);
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "A alteração de permissão foi recusada.");
      if (saveError instanceof MasterAdminRequestError && saveError.persisted) {
        setReason("");
        setRefreshKey((value) => value + 1);
      }
    } finally {
      setSaving(false);
    }
  };

  const parsedAccessDays = Number(accessDays);
  const previewExpiry = Number.isInteger(parsedAccessDays) && parsedAccessDays >= 1 && parsedAccessDays <= 3650
    ? format(new Date(Date.now() + parsedAccessDays * 86_400_000), "dd/MM/yyyy")
    : null;
  const updateStatusFilter = (status: typeof filter) => {
    setFilter(status);
    setPageCursors([null]);
    setPageIndex(0);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-violet-400/15 bg-gradient-to-br from-violet-500/10 via-slate-900/80 to-slate-950 p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl border border-violet-400/25 bg-violet-500/15 text-violet-200">
            <Shield className="h-6 w-6" />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Central de controle</p>
            <h1 className="mt-1 text-2xl font-black text-white">Master Admin</h1>
            <p className="mt-1 text-sm text-slate-400">Contas, permissões e vigência dos usuários em um só lugar.</p>
          </div>
        </div>
        <button type="button" onClick={() => {
          setPageCursors([null]);
          setPageIndex(0);
          setRefreshKey((value) => value + 1);
        }} disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-violet-400/40 hover:bg-slate-900 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar dados
        </button>
      </header>

      <section aria-label="Resumo das contas" className="grid gap-3 md:grid-cols-3">
        {[
          {
            label: "Ativos",
            detail: "Contas ativadas no cadastro",
            value: list?.metrics.active,
            status: "active" as const,
            Icon: CheckCircle2,
            tone: "emerald",
          },
          {
            label: "Cancelados",
            detail: "Contas desativadas ou bloqueadas",
            value: list?.metrics.blocked,
            status: "blocked" as const,
            Icon: Ban,
            tone: "rose",
          },
          {
            label: "Vencendo em 7 dias",
            detail: "Acessos que precisam de atenção",
            value: list?.metrics.expiringSoon,
            status: "expiring" as const,
            Icon: Clock3,
            tone: "amber",
          },
        ].map(({ label, detail: cardDetail, value, status, Icon, tone }) => {
          const tones = {
            emerald: {
              border: "border-emerald-400/20",
              active: "ring-2 ring-emerald-400/50",
              icon: "bg-emerald-400/10 text-emerald-300",
              number: "text-emerald-200",
              hover: "hover:border-emerald-400/40",
            },
            rose: {
              border: "border-rose-400/20",
              active: "ring-2 ring-rose-400/50",
              icon: "bg-rose-400/10 text-rose-300",
              number: "text-rose-200",
              hover: "hover:border-rose-400/40",
            },
            amber: {
              border: "border-amber-400/20",
              active: "ring-2 ring-amber-400/50",
              icon: "bg-amber-400/10 text-amber-300",
              number: "text-amber-100",
              hover: "hover:border-amber-400/40",
            },
          }[tone];
          return (
            <button key={status} type="button" onClick={() => updateStatusFilter(filter === status ? "all" : status)}
              aria-pressed={filter === status}
              className={`group flex min-h-32 items-center justify-between rounded-2xl border bg-slate-900/70 p-5 text-left shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:bg-slate-900 ${tones.border} ${tones.hover} ${filter === status ? tones.active : ""}`}>
              <div>
                <p className="text-sm font-bold text-slate-200">{label}</p>
                <p className="mt-1 text-xs text-slate-500">{cardDetail}</p>
                <p className={`mt-3 text-3xl font-black tracking-tight ${tones.number}`}>{value ?? "—"}</p>
              </div>
              <span className={`grid h-12 w-12 place-items-center rounded-2xl transition group-hover:scale-105 ${tones.icon}`}>
                <Icon className="h-6 w-6" />
              </span>
            </button>
          );
        })}
      </section>

      <div className="grid gap-4">
        <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <input value={search} onChange={(event) => {
              setSearch(event.target.value);
              setPageCursors([null]);
              setPageIndex(0);
            }} placeholder="UID ou e-mail exato"
              aria-label="Buscar usuário" className="min-w-48 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
            <select value={filter} onChange={(event) => {
              updateStatusFilter(event.target.value as typeof filter);
            }}
              aria-label="Filtrar situação da conta" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
              <option value="all">Todas as contas</option>
              <option value="active">Ativos</option>
              <option value="blocked">Cancelados / suspensos</option>
              <option value="expiring">Vencendo em 7 dias</option>
            </select>
          </div>
          {error && <p role="alert" className="mb-3 text-sm text-rose-300">{error}</p>}
          {loading ? <p className="p-6 text-sm text-slate-400">Carregando usuários…</p> : (
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
                  <td className="p-2"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                    account.isActive ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"
                  }`}>{statusLabel(account)}</span></td>
                  <td className="p-2 text-slate-300">{dateLabel(account.manualAccessExpiresAt)}</td>
                </tr>)}</tbody>
              </table>
              {!list?.users.length && <p className="p-6 text-sm text-slate-400">Nenhum usuário encontrado.</p>}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
            <button type="button" disabled={pageIndex === 0 || loading}
              onClick={() => setPageIndex((value) => Math.max(0, value - 1))}
              className="rounded-lg border border-slate-700 px-3 py-2 disabled:opacity-40">Anterior</button>
            <span>Página {pageIndex + 1} · {list?.total ?? 0} usuário(s)</span>
            <button type="button" disabled={!list?.hasMore || loading || !list.nextCursor}
              onClick={() => {
                if (!list?.nextCursor) return;
                setPageCursors((cursors) => [...cursors.slice(0, pageIndex + 1), list.nextCursor]);
                setPageIndex((value) => value + 1);
              }}
              className="rounded-lg border border-slate-700 px-3 py-2 disabled:opacity-40">Próxima</button>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">A listagem é autenticada e consulta os perfis de usuário pelo servidor.</p>
        </section>

      </div>
      {selectedUid && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setSelectedUid("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !saving) setSelectedUid("");
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="master-admin-account-title"
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black"
          >
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-700 px-4 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-300">
                  <Shield className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">Gerenciamento de conta</p>
                  <h2 id="master-admin-account-title" className="truncate text-lg font-black text-white">
                    {detail?.account.displayName || detail?.account.email || "Carregando conta…"}
                  </h2>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedUid("")} disabled={saving} autoFocus
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-800 text-slate-300 transition hover:text-white disabled:opacity-50"
                aria-label="Fechar gerenciamento da conta">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
              {detailLoading && <p className="py-8 text-center text-sm text-slate-400">Carregando dados e histórico da conta…</p>}
              {detailError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{detailError}</p>}
              {detail && <>
                <section className="grid gap-3 rounded-xl border border-slate-700 bg-slate-950/40 p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500">E-mail</p>
                    <p className="break-all text-sm text-slate-200">{detail.account.email || "Não informado"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Situação / perfil</p>
                    <p className="text-sm text-slate-200">{statusLabel(detail.account)} · {roleLabel(detail.account.role)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">UID</p>
                    <p className="break-all text-xs text-slate-400">{detail.account.uid}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Vigência manual atual</p>
                    <p className="text-sm text-slate-200">{dateLabel(detail.account.manualAccessExpiresAt)}</p>
                  </div>
                </section>

                {detail.account.uid === currentUserId
                  ? <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">Por segurança, não é permitido alterar o próprio acesso.</p>
                  : detail.account.ownerAccess.permanent
                    ? <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">A conta proprietária possui acesso permanente protegido.</p>
                    : <>
                      <section className="space-y-3 rounded-xl border border-slate-700 p-4">
                        <div>
                          <h3 className="font-bold text-white">Assinatura manual</h3>
                          <p className="mt-1 text-xs text-slate-400">Ao vencer a vigência, o sistema bloqueia automaticamente o acesso.</p>
                        </div>
                        <div className="flex flex-wrap gap-2" aria-label="Durações rápidas de acesso">
                          {ACCESS_DAY_PRESETS.map((days) => (
                            <button key={days} type="button" onClick={() => setAccessDays(String(days))}
                              aria-pressed={accessDays === String(days)}
                              className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                                accessDays === String(days)
                                  ? "border-violet-400 bg-violet-500/20 text-violet-100"
                                  : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500"
                              }`}>
                              {days === 365 ? "1 ano" : `${days} dias`}
                            </button>
                          ))}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[minmax(140px,0.5fr)_1fr] sm:items-end">
                          <label className="block text-xs text-slate-300">Duração personalizada (dias)
                            <input type="number" min="1" max="3650" step="1" value={accessDays}
                              onChange={(event) => setAccessDays(event.target.value)}
                              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
                          </label>
                          <p className="flex items-center gap-2 rounded-lg bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
                            <CalendarClock className="h-4 w-4 shrink-0 text-violet-300" />
                            {previewExpiry ? <>Acesso válido até <strong className="text-white">{previewExpiry}</strong></> : "Informe de 1 a 3650 dias"}
                          </p>
                        </div>
                        <label className="block text-xs text-slate-300">Motivo / observação (obrigatório)
                          <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={2}
                            placeholder="Ex.: plano de 60 dias confirmado"
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600" />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" disabled={saving || !previewExpiry} onClick={() => void saveDecision(true)}
                            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                            <UserRoundCheck className="h-4 w-4" /> Liberar / renovar acesso
                          </button>
                          <button type="button"
                            disabled={saving || (!detail.account.isActive && detail.account.manualAccessState !== "active")}
                            onClick={() => void saveDecision(false)}
                            className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 px-4 py-2.5 text-sm font-bold text-rose-300 disabled:opacity-50">
                            <UserRoundX className="h-4 w-4" /> Bloquear acesso
                          </button>
                        </div>
                      </section>

                      <section className="space-y-3 rounded-xl border border-slate-700 p-4">
                        <div>
                          <h3 className="font-bold text-white">Permissões do sistema</h3>
                          <p className="mt-1 text-xs text-slate-400">A troca de perfil atualiza as permissões e os claims de autenticação.</p>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="min-w-52 flex-1 text-xs text-slate-300">Perfil de acesso
                            <select value={managedRole} onChange={(event) => setManagedRole(event.target.value as ManagedRole)}
                              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
                              <option value="user">Usuário — acesso normal</option>
                              <option value="admin">Administrador — ferramentas administrativas</option>
                              <option value="master_admin">Master Admin — controle administrativo completo</option>
                            </select>
                          </label>
                          <button type="button" disabled={saving || managedRole === detail.account.role}
                            onClick={() => void saveRole()}
                            className="rounded-lg border border-violet-500/40 px-4 py-2.5 text-sm font-bold text-violet-200 disabled:opacity-50">
                            Salvar permissões
                          </button>
                        </div>
                      </section>
                    </>}

                <section className="border-t border-slate-700 pt-4">
                  <h3 className="mb-2 text-sm font-bold text-white">Histórico de acesso e permissões · 10 recentes</h3>
                  <div className="max-h-52 space-y-2 overflow-auto">
                    {detail.auditEvents.map((event) => <article key={event.id} className="rounded-lg bg-slate-950/70 p-3 text-xs">
                      <p className="font-semibold text-slate-200">{event.action} · {dateLabel(event.timestamp)}</p>
                      <p className="mt-1 text-slate-400">Administrador: {event.actor || "—"} · Perfil: {roleLabel(event.before?.role)} → {roleLabel(event.after?.role)}</p>
                      <p className="text-slate-400">Vigência: {dateLabel(auditExpiry(event))}</p>
                      {event.claimsSyncStatus === "failed" && <p className="text-rose-300">Sincronização das permissões falhou; confira o estado antes de repetir.</p>}
                      <p className="text-slate-500">{event.reason || "Sem motivo registrado"}</p>
                    </article>)}
                    {!detail.auditEvents.length && <p className="text-xs text-slate-500">Sem decisões registradas.</p>}
                  </div>
                </section>
              </>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
