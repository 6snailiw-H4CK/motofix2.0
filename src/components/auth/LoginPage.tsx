import { ArrowLeft, Moon, Sun } from 'lucide-react';
import type { ColorMode } from '../../types';
import './LoginPage.css';

type LoginPageProps = {
  authError: string | null;
  colorMode: ColorMode;
  isSigningIn: boolean;
  onBack: () => void;
  onColorModeChange: (mode: ColorMode) => void;
  onGoogleLogin: () => void;
  onRedirectLogin: () => void;
};

export const LoginPage = ({ authError, colorMode, isSigningIn, onBack, onColorModeChange, onGoogleLogin, onRedirectLogin }: LoginPageProps) => (
  <div className={`login-page${colorMode === 'light' ? ' login-light-theme' : ''}`}>
    <header className="login-nav">
      <div className="login-container">
        <button type="button" className="login-brand" onClick={onBack}>
          <span>MF</span>
          <strong>MotoFix<small>GESTÃO AUTOMOTIVA</small></strong>
        </button>
        <div className="login-nav-actions">
          <button
            type="button"
            className="login-theme-toggle"
            aria-label={colorMode === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
            title={colorMode === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
            onClick={() => onColorModeChange(colorMode === 'dark' ? 'light' : 'dark')}
          >
            {colorMode === 'dark' ? <Sun /> : <Moon />}
          </button>
          <button type="button" className="login-back" onClick={onBack}><ArrowLeft /> Voltar para a página inicial</button>
        </div>
      </div>
    </header>
    <main className="login-main">
      <section className="login-card">
        <p className="login-label">Área da oficina</p>
        <h1>Entrar no MotoFix</h1>
        <p className="login-description">Acesse sua conta para continuar acompanhando a operação da sua oficina.</p>
        {authError && <div className="login-error">{authError}</div>}
        <button type="button" className="login-google" onClick={onGoogleLogin} disabled={isSigningIn}>
          <span className="login-google-mark">G</span>
          {isSigningIn ? 'Entrando...' : 'Entrar com Google'}
        </button>
        <button type="button" className="login-redirect" onClick={onRedirectLogin} disabled={isSigningIn}>Entrar redirecionando</button>
        <p className="login-help">Ao entrar, você concorda com os termos de uso do MotoFix.</p>
      </section>
    </main>
    <footer className="login-footer">MotoFix - GESTÃO AUTOMOTIVA</footer>
  </div>
);
