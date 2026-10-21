import { useEffect, useState } from 'react';
import { getRedirectResult, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { auth, googleProvider } from '../../firebase';
import type { ColorMode } from '../../types';
import { LandingPage } from './LandingPage';
import { LegalPage } from './LegalPage';
import { LoginPage } from './LoginPage';

type AuthScreenProps = {
  initialAuthError?: string | null;
};

type AuthView = 'landing' | 'login' | 'legal';
type LegalKind = 'privacy' | 'terms';

const getSavedColorMode = (): ColorMode => {
  if (typeof window === 'undefined') return 'dark';
  try {
    return window.localStorage.getItem('motofix-theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
};

export const AuthScreen = ({ initialAuthError }: AuthScreenProps) => {
  const [authView, setAuthView] = useState<AuthView>('landing');
  const [legalKind, setLegalKind] = useState<LegalKind>('privacy');
  const [colorMode, setColorMode] = useState<ColorMode>(getSavedColorMode);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(initialAuthError ?? null);

  useEffect(() => {
    document.documentElement.classList.toggle('light', colorMode === 'light');
    try {
      window.localStorage.setItem('motofix-theme', colorMode);
    } catch {
      // The page can still use the selected theme if storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent<ColorMode>('motofix-theme-change', { detail: colorMode }));
  }, [colorMode]);

  const navigateToSection = (sectionId: string) => {
    setAuthView('landing');
    window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const getAuthErrorMessage = (error: unknown) => {
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: string }).code)
      : '';

    if (code === 'auth/popup-closed-by-user') {
      return 'A janela do Google foi fechada antes de concluir o login. Tente novamente ou use a entrada por redirecionamento.';
    }
    if (code === 'auth/popup-blocked') {
      return 'O navegador bloqueou o popup de login. Libere popups para este site ou use a entrada por redirecionamento.';
    }
    if (code === 'auth/cancelled-popup-request') {
      return 'Ja existe uma tentativa de login em andamento. Aguarde alguns segundos e tente novamente.';
    }
    if (code === 'auth/unauthorized-domain') {
      return 'Este dominio ainda nao esta autorizado no Firebase Authentication.';
    }

    return 'Nao foi possivel concluir o login com Google. Tente novamente.';
  };

  const handleGoogleLogin = async () => {
    if (isSigningIn) return;
    setAuthError(null);
    setIsSigningIn(true);

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const errorCode = typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: string }).code)
        : '';
      console.error('Erro no login com Google:', error);

      if (
        errorCode === 'auth/popup-blocked' ||
        errorCode === 'auth/cancelled-popup-request' ||
        errorCode === 'auth/operation-not-supported-in-this-environment'
      ) {
        setAuthError('Popup de login não está disponível. Clique em "Entrar redirecionando" para continuar.');
        return;
      }

      setAuthError(getAuthErrorMessage(error));
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleRedirectLogin = async () => {
    if (isSigningIn) return;
    setAuthError(null);
    setIsSigningIn(true);

    try {
      sessionStorage.setItem('motofix-auth-redirect-started', '1');
      await signInWithRedirect(auth, googleProvider);
    } catch (error) {
      console.error('Erro no login por redirecionamento:', error);
      setAuthError(getAuthErrorMessage(error));
      setIsSigningIn(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const finishRedirectLogin = async () => {
      const hadRedirectAttempt = sessionStorage.getItem('motofix-auth-redirect-started') === '1';

      try {
        const result = await getRedirectResult(auth);
        if (cancelled) return;

        if (result?.user) {
          sessionStorage.removeItem('motofix-auth-redirect-started');
          setAuthError(null);
          setIsSigningIn(false);
          return;
        }

        if (hadRedirectAttempt) {
          setAuthError(
            'O Google retornou para o app, mas o Firebase nao confirmou a sessao. Verifique dominios autorizados, cookies/persistencia do navegador e a configuracao do Firebase Auth.'
          );
          setIsSigningIn(false);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Erro ao finalizar login por redirecionamento:', error);
        sessionStorage.removeItem('motofix-auth-redirect-started');
        setAuthError(getAuthErrorMessage(error));
        setIsSigningIn(false);
      }
    };

    finishRedirectLogin();

    return () => {
      cancelled = true;
    };
  }, []);

  if (authView === 'legal') {
    return <LegalPage kind={legalKind} onBack={() => setAuthView('landing')} />;
  }

  if (authView === 'login') {
    return (
      <LoginPage
        authError={authError}
        colorMode={colorMode}
        isSigningIn={isSigningIn}
        onBack={() => setAuthView('landing')}
        onColorModeChange={setColorMode}
        onGoogleLogin={handleGoogleLogin}
        onRedirectLogin={handleRedirectLogin}
      />
    );
  }

  return (
    <LandingPage
      colorMode={colorMode}
      onLogin={() => setAuthView('login')}
      onColorModeChange={setColorMode}
      onNavigate={navigateToSection}
      onOpenLegal={(kind) => {
        setLegalKind(kind);
        setAuthView('legal');
      }}
    />
  );
};
