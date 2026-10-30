import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudDownload, LogIn, LogOut, ShieldCheck } from 'lucide-react';
import { createPortableImportPlan, type PortableImportPlan } from '../../services/portableImportPlan';
import type { DestinationImportPreflight, DestinationImportResult } from '../../services/backupDestinationAdapter';
import { signInToFirebaseBackupDestination, type FirebaseBackupDestinationConfig, type FirebaseBackupDestinationSession } from '../../services/firebaseBackupDestinationSession';
import { systemBackupApi, type BackupProgress } from '../../services/systemBackupApi';
import type { PortableBackupSummary } from '../../services/portableBackup';

const defaultConfig = (): FirebaseBackupDestinationConfig => ({ projectId: '', apiKey: '', authDomain: '', appId: '' });

const formatCount = (count: number) => new Intl.NumberFormat('pt-BR').format(count);

export const CrossProjectBackupRestore = () => {
  const [config, setConfig] = useState(defaultConfig);
  const [session, setSession] = useState<FirebaseBackupDestinationSession | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [password, setPassword] = useState('');
  const [plan, setPlan] = useState<PortableImportPlan | null>(null);
  const [summary, setSummary] = useState<PortableBackupSummary | null>(null);
  const [preflight, setPreflight] = useState<DestinationImportPreflight | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return undefined;
    return () => { void session.close(); };
  }, [session]);

  const updateConfig = (key: keyof FirebaseBackupDestinationConfig, value: string) => {
    setConfig((current) => ({ ...current, [key]: value }));
    setPlan(null);
    setSummary(null);
    setPreflight(null);
    setMessage('');
  };

  const connectDestination = async () => {
    setBusy(true);
    setMessage('');
    setPlan(null);
    setSummary(null);
    setPreflight(null);
    try {
      await session?.close();
      const next = await signInToFirebaseBackupDestination(config);
      setSession(next);
      setMessage(`Conta autenticada no destino: ${next.user.email || 'conta Google'} · aguardando validação de administrador.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível entrar no projeto de destino.');
    } finally {
      setBusy(false);
    }
  };

  const disconnectDestination = async () => {
    const current = session;
    setSession(null);
    setPlan(null);
    setSummary(null);
    setPreflight(null);
    setConfirmation('');
    await current?.close();
    setMessage('Sessão do projeto de destino encerrada.');
  };

  const preparePlan = async () => {
    if (!session || !file || password.length < 12) return;
    setBusy(true);
    setMessage('');
    setProgress({ stage: 'Descriptografando o arquivo e analisando referências localmente.' });
    setPlan(null);
    setSummary(null);
    setPreflight(null);
    try {
      const inspected = await systemBackupApi.inspectFullBackup(file, password);
      const nextPlan = await createPortableImportPlan(inspected.payload, {
        projectId: session.projectId,
        uid: session.user.uid,
      });
      setPlan(nextPlan);
      setSummary(inspected.summary);
      if (!nextPlan.canImport) {
        setMessage('O arquivo foi lido, mas o plano encontrou bloqueios. Nenhum dado foi gravado.');
        return;
      }
      setProgress({ stage: 'Consultando somente a autorização e o estado vazio do destino.' });
      const destinationCheck = await session.adapter.inspect(nextPlan);
      setPreflight(destinationCheck);
      setMessage(destinationCheck.importable
        ? 'Plano pronto. A pré-validação não gravou dados.'
        : destinationCheck.recoveryMessage || 'O destino não está autorizado ou contém dados operacionais; a importação foi bloqueada sem gravar dados.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível preparar a restauração.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const runImport = async () => {
    if (!session || !plan || !preflight?.importable || confirmation !== 'IMPORTAR NO DESTINO') return;
    setBusy(true);
    setMessage('');
    try {
      const result: DestinationImportResult = await session.adapter.import(
        plan,
        confirmation,
        (next) => setProgress(next),
      );
      if (!result.verified || result.status !== 'completed' || result.documentsVerified !== plan.totalDocuments) {
        throw new Error('A conferência final não confirmou todos os documentos; não considere esta recuperação concluída.');
      }
      setMessage(`Restauração concluída e conferida no projeto ${session.projectId}: ${formatCount(result.documentsVerified)} documento(s). IDs e vínculos foram relidos no destino.`);
      setConfirmation('');
      setPlan(null);
      setPreflight(null);
      setSummary(null);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setPassword('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'A restauração foi interrompida. Reabra o mesmo arquivo e retome no mesmo destino.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const hasPlanErrors = Boolean(plan?.issues.some((issue) => issue.severity === 'error'));

  return (
    <section className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-300">
          <CloudDownload className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-sky-100">Recuperar em outro projeto Firebase</h4>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">
            O arquivo pode ser reutilizado em oficinas de destino vazias diferentes. A pré-validação só consulta o destino. A gravação exige uma oficina vazia, administrador autorizado e confirmação explícita. A mesma sessão e o mesmo arquivo podem retomar uma interrupção; perfil, privilégios, credenciais e cobrança do arquivo nunca são importados.
          </p>
          <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-amber-100/90">
            Configure previamente o projeto de destino: habilite Google Authentication, cadastre o domínio atual em Authorized domains, publique nele as regras do MotoFix e a Function <code>backupApi</code>, e prepare uma conta com perfil administrativo ativo, claim <code>admin</code> e acesso manual válido. Este fluxo não cria contas nem concede permissões. Não use chave de serviço ou JSON de credenciais aqui.
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input value={config.projectId} onChange={(event) => updateConfig('projectId', event.target.value)} placeholder="ID do projeto de destino" disabled={Boolean(session) || busy} className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-white outline-none focus:border-sky-400 disabled:opacity-60" />
            <input value={config.apiKey} onChange={(event) => updateConfig('apiKey', event.target.value)} placeholder="Chave de API web (Firebase config)" disabled={Boolean(session) || busy} className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-white outline-none focus:border-sky-400 disabled:opacity-60" />
            <input value={config.authDomain} onChange={(event) => updateConfig('authDomain', event.target.value)} placeholder="Auth domain, ex.: projeto.firebaseapp.com" disabled={Boolean(session) || busy} className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-white outline-none focus:border-sky-400 disabled:opacity-60" />
            <input value={config.appId} onChange={(event) => updateConfig('appId', event.target.value)} placeholder="App ID web, ex.: 1:123:web:abc" disabled={Boolean(session) || busy} className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-white outline-none focus:border-sky-400 disabled:opacity-60" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!session ? (
              <button type="button" disabled={busy || !config.projectId || !config.apiKey || !config.authDomain || !config.appId} onClick={() => void connectDestination()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 text-xs font-bold text-sky-100 hover:bg-sky-500/15 disabled:opacity-50">
                <LogIn className="h-4 w-4" /> Entrar como administrador no destino
              </button>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-100"><ShieldCheck className="h-3.5 w-3.5" /> {session.user.email || session.user.uid} · {session.projectId}</span>
                <button type="button" disabled={busy} onClick={() => void disconnectDestination()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-50"><LogOut className="h-3.5 w-3.5" /> Sair do destino</button>
              </>
            )}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input ref={fileInputRef} type="file" accept=".motofix,application/vnd.motofix.backup+json,application/json" onChange={(event) => { setFile(event.target.files?.[0] || null); setPlan(null); setSummary(null); setPreflight(null); setMessage(''); }} disabled={busy} className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300 file:mr-2 file:rounded file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-[11px] file:text-white disabled:opacity-60" />
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setPlan(null); setSummary(null); setPreflight(null); }} placeholder="Senha do arquivo .motofix" disabled={busy} className="h-10 min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-white outline-none focus:border-sky-400 disabled:opacity-60" />
            <button type="button" disabled={busy || !session || !file || password.length < 12} onClick={() => void preparePlan()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-sky-500/30 px-3 text-xs font-bold text-sky-100 hover:bg-sky-500/10 disabled:opacity-50">{busy ? 'Processando...' : 'Criar plano e conferir destino'}</button>
          </div>

          {(progress || message) && <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-xs text-slate-200">{progress && <p className="font-semibold">{progress.stage}{typeof progress.completed === 'number' && typeof progress.total === 'number' ? ` · ${progress.completed}/${progress.total}` : ''}</p>}{message && <p className={progress ? 'mt-1' : ''}>{message}</p>}</div>}

          {plan && summary && <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-white">Plano: {summary.workshopName || 'oficina sem nome'} · {formatCount(plan.totalDocuments)} documento(s)</p>
              {preflight && <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${preflight.importable ? 'bg-emerald-500/10 text-emerald-200' : 'bg-amber-500/10 text-amber-200'}`}>{preflight.recoveryRequired ? 'Recuperação requerida' : preflight.importable ? (preflight.resumable ? 'Sessão retomável' : 'Destino autorizado e vazio') : 'Gravação bloqueada'}</span>}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Origem: {plan.sourceProjectId || 'projeto não registrado em backup antigo'} · destino: {plan.destinationProjectId}. IDs de negócio mantidos; propriedade e referências de documento remapeadas para a conta autenticada do destino.</p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(plan.counts).filter(([, count]) => count > 0).map(([collection, count]) => <p key={collection} className="rounded border border-slate-800 px-2 py-1 text-[10px] text-slate-300">{collection}: <strong className="text-white">{formatCount(count)}</strong></p>)}</div>
            {plan.issues.length > 0 && <ul className="mt-2 space-y-1 text-[11px] text-amber-200">{plan.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.severity === 'error' ? 'Bloqueio' : 'Aviso'}: {issue.message}</li>)}</ul>}
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-emerald-200"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Perfil da origem e dados locais de recuperação excluídos; autenticação, permissões e cobrança do destino permanecem intactas.</p>
            {preflight && !preflight.importable && <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-200"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{!preflight.destinationAuthorized ? 'A conta do destino não passou na validação de administrador ativo. Nenhuma gravação foi feita.' : preflight.recoveryRequired ? preflight.recoveryMessage || 'Há uma sessão parcial protegida. Retome o mesmo arquivo antes de iniciar outra importação.' : preflight.activeImportId ? 'Outra sessão detém o bloqueio desta oficina. Nenhuma gravação foi feita.' : 'O destino contém ' + formatCount(preflight.totalExisting) + ' registro(s) operacional(is) e não pode receber este arquivo. Nenhuma gravação foi feita.'}</p>}
            {preflight?.importable && !hasPlanErrors && <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input value={confirmation} onChange={(event) => setConfirmation(event.target.value.trim().toUpperCase())} placeholder="Digite IMPORTAR NO DESTINO" disabled={busy} className="h-10 rounded-lg border border-amber-500/30 bg-slate-950 px-3 text-xs text-white outline-none focus:border-amber-400 disabled:opacity-60" />
              <button type="button" disabled={busy || confirmation !== 'IMPORTAR NO DESTINO'} onClick={() => void runImport()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 text-xs font-bold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"><CloudDownload className="h-4 w-4" />{busy ? 'Importando e verificando...' : 'IMPORTAR NO DESTINO'}</button>
            </div>}
          </div>}
        </div>
      </div>
    </section>
  );
};
