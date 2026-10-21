import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { ArrowRight, LoaderCircle, LogOut, ShieldCheck } from "lucide-react";
import { MasterAdminView } from "./components/admin/MasterAdminView";
import { auth, authPersistenceReady, googleProvider } from "./firebase";

type AuthorizationState = "checking" | "authorized" | "denied" | "expired" | "unavailable";

const getAuthErrorMessage = (error: unknown) => {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  if (code === "auth/popup-closed-by-user") return "O login foi cancelado antes de ser concluído.";
  if (code === "auth/popup-blocked") return "O navegador bloqueou o popup. Tente entrar por redirecionamento.";
  if (code === "auth/unauthorized-domain") return "Este domínio não está autorizado no Firebase Authentication.";
  return error instanceof Error ? error.message : "Não foi possível concluir a autenticação.";
};

const PageFrame = ({ children }: { children: ReactNode }) => (
  <main className="min-h-screen px-4 py-6 text-slate-100 sm:px-8 sm:py-10">
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex items-center gap-3 border-b border-slate-700/70 pb-5">
        <span className="grid h-11 w-11 place-items-center rounded-xl border border-violet-400/20 bg-violet-400/10 text-violet-300">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Control plane</p>
          <h1 className="text-lg font-bold text-white">MotoFix Master Admin</h1>
        </div>
      </header>
      {children}
    </div>
  </main>
);

export const MasterAdminApp = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authorization, setAuthorization] = useState<AuthorizationState>("checking");
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => undefined;

    const initialize = async () => {
      try {
        await authPersistenceReady;
        if (!active) return;
        unsubscribe = onAuthStateChanged(auth, (nextUser) => {
          setUser(nextUser);
          setAuthorization("checking");
          setAuthLoading(false);
          if (nextUser) setSessionExpired(false);
        });
        try {
          await getRedirectResult(auth);
        } catch (error) {
          if (active) setAuthError(getAuthErrorMessage(error));
        }
      } catch (error) {
        if (active) {
          setAuthError(getAuthErrorMessage(error));
          setAuthLoading(false);
        }
      }
    };

    void initialize();
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleAuthorizationStateChange = useCallback((nextState: Exclude<AuthorizationState, "checking">) => {
    setAuthorization(nextState);
    if (nextState !== "expired") return;
    setSessionExpired(true);
    void signOut(auth).catch((error: unknown) => {
      setAuthError(error instanceof Error ? error.message : "Não foi possível encerrar a sessão expirada.");
    });
  }, []);

  const handleSignIn = async (redirect = false) => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    setAuthError(null);
    setSessionExpired(false);
    try {
      if (redirect) await signInWithRedirect(auth, googleProvider);
      else await signInWithPopup(auth, googleProvider);
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    setAuthError(null);
    try {
      await signOut(auth);
      setAuthorization("checking");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Não foi possível encerrar a sessão.");
    }
  };

  if (authLoading) {
    return (
      <PageFrame>
        <div role="status" className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-5 text-sm text-slate-300">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Verificando sessão...
        </div>
      </PageFrame>
    );
  }

  if (!user) {
    return (
      <PageFrame>
        <section className="mx-auto max-w-md rounded-2xl border border-slate-700/70 bg-slate-900/60 p-6 shadow-xl sm:p-8">
          <h2 className="text-xl font-bold text-white">Acesso administrativo</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Entre com sua conta Google. As regras do Firestore verificam a autorização Master Admin antes de liberar os dados.
          </p>
          {sessionExpired && (
            <p role="status" className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">
              Sua sessão expirou. Entre novamente para continuar.
            </p>
          )}
          {authError && <p role="alert" className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{authError}</p>}
          <button
            type="button"
            disabled={isSigningIn}
            onClick={() => void handleSignIn()}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-violet-400 disabled:cursor-wait disabled:opacity-60"
          >
            {isSigningIn ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Entrar com Google
          </button>
          <button
            type="button"
            disabled={isSigningIn}
            onClick={() => void handleSignIn(true)}
            className="mt-3 w-full rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-60"
          >
            Entrar por redirecionamento
          </button>
        </section>
      </PageFrame>
    );
  }

  if (authorization === "expired") {
    return (
      <PageFrame>
        <section className="mx-auto max-w-lg rounded-2xl border border-amber-400/20 bg-slate-900/60 p-6">
          <h2 className="text-lg font-bold text-white">Sessão expirada</h2>
          <p role="status" className="mt-2 text-sm leading-6 text-slate-400">
            O Firebase Auth rejeitou a sessão. O painel está bloqueado e a sessão está sendo encerrada; entre novamente para continuar.
          </p>
          {authError && <p role="alert" className="mt-4 text-sm text-rose-300">{authError}</p>}
          <button type="button" onClick={() => void handleSignOut()} className="mt-6 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800">
            Encerrar sessão
          </button>
        </section>
      </PageFrame>
    );
  }

  if (authorization === "denied" || authorization === "unavailable") {
    const denied = authorization === "denied";
    return (
      <PageFrame>
        <section className="mx-auto max-w-lg rounded-2xl border border-slate-700/70 bg-slate-900/60 p-6">
          <h2 className="text-lg font-bold text-white">{denied ? "Acesso não autorizado" : "Não foi possível validar o acesso"}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {denied
              ? "O Firestore não reconheceu esta conta como Master Admin ativo. A role local da interface não concede autorização."
              : "Não foi possível consultar o Firestore. Nenhum dado de contas foi liberado."}
          </p>
          <p className="mt-4 break-all text-xs text-slate-500">Sessão: {user.email || user.uid}</p>
          {authError && <p role="alert" className="mt-4 text-sm text-rose-300">{authError}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            {!denied && (
              <button
                type="button"
                onClick={() => {
                  setAuthorization("checking");
                  setRetryKey((value) => value + 1);
                }}
                className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-400"
              >
                Tentar novamente
              </button>
            )}
            <button type="button" onClick={() => void handleSignOut()} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800">
              Sair / trocar conta
            </button>
          </div>
        </section>
      </PageFrame>
    );
  }

  return (
    <div className="min-h-screen px-3 py-4 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/70 pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-violet-400/20 bg-violet-400/10 text-violet-300">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">Control plane</p>
              <h1 className="text-base font-bold text-white">MotoFix Master Admin</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="max-w-56 truncate text-xs text-slate-400">{user.email || user.uid}</span>
            <button type="button" onClick={() => void handleSignOut()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800">
              <LogOut className="h-3.5 w-3.5" /> Sair
            </button>
          </div>
        </header>
        <MasterAdminView key={retryKey} currentUserId={user.uid} onAuthorizationStateChange={handleAuthorizationStateChange} />
      </div>
    </div>
  );
};
