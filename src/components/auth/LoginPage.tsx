import { ArrowLeft } from 'lucide-react';
import './LoginPage.css';

type LoginPageProps = {
  authError: string | null;
  isSigningIn: boolean;
  onBack: () => void;
  onGoogleLogin: () => void;
  onRedirectLogin: () => void;
};

export const LoginPage = ({ authError, isSigningIn, onBack, onGoogleLogin, onRedirectLogin }: LoginPageProps) => (
  <div className="login-page">
    <header className="login-nav">
      <div className="login-container">
        <button type="button" className="login-brand" onClick={onBack}>
          <span>MF</span>
          <strong>MotoFix<small>GESTÃO AUTOMOTIVA</small></strong>
        </button>
        <button type="button" className="login-back" onClick={onBack}><ArrowLeft /> Voltar para a página inicial</button>
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

