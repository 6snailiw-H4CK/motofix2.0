import React, { useEffect, useState } from 'react';
import { ArrowRight, BarChart3, Calendar, DollarSign, ShieldCheck, TrendingUp, Users } from 'lucide-react';
import { getRedirectResult, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { auth, googleProvider } from '../../firebase';

export const AuthScreen = () => {
  const salesMessage = 'Olá, gostaria de receber uma proposta do MotoFix para minha oficina.';
  const whatsappSalesUrl = `https://wa.me/556999944024?text=${encodeURIComponent(salesMessage)}`;
  const [authView, setAuthView] = useState<'landing' | 'login' | 'sales'>('landing');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const navigateToSection = (sectionId: string) => {
    setAuthView('landing');
    window.setTimeout(() => {
      const section = document.getElementById(sectionId);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    document.querySelectorAll('.scroll-reveal').forEach((element) => {
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, [authView]);

  const getAuthErrorMessage = (error: unknown) => {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : '';

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
      console.error('Erro no login com Google:', error);
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

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-950 text-slate-100">
      <div className="parallax-layer pointer-events-none absolute left-1/2 top-0 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[#f97316]/20 blur-3xl" style={{ '--parallax-speed': '0.14' } as React.CSSProperties} />
      <div className="parallax-layer pointer-events-none absolute right-0 top-24 h-[28rem] w-[28rem] rounded-full bg-[#8b5cf6]/20 blur-3xl" style={{ '--parallax-speed': '0.08' } as React.CSSProperties} />
      <div className="parallax-layer pointer-events-none absolute left-0 bottom-0 h-[24rem] w-[24rem] rounded-full bg-[#22c55e]/20 blur-3xl" style={{ '--parallax-speed': '0.18' } as React.CSSProperties} />

      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-slate-950/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setAuthView('landing')}>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-600 text-base font-bold text-white shadow-lg shadow-red-600/20">MF</div>
            <div>
              <p className="text-sm font-semibold tracking-wide text-white">MotoFix</p>
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Gestão automotiva</p>
            </div>
          </div>

          <div className="hidden items-center gap-8 md:flex">
            <nav className="flex items-center gap-6 text-sm text-slate-300">
              <button onClick={() => navigateToSection('resources')} className="transition hover:text-white">Recursos</button>
              <button onClick={() => navigateToSection('how')} className="transition hover:text-white">Como funciona</button>
              <button onClick={() => navigateToSection('plans')} className="transition hover:text-white">Planos</button>
              <button onClick={() => navigateToSection('contact')} className="transition hover:text-white">Contato</button>
            </nav>
            <button onClick={() => setAuthView('login')} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 transition hover:border-white/20">Login</button>
            <button onClick={() => setAuthView('sales')} className="rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-red-500/20 transition hover:opacity-95">Conheça o MotoFix</button>
          </div>
        </div>
      </header>

      <div className="md:hidden fixed bottom-4 left-0 right-0 z-40 px-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-3xl bg-slate-900/90 p-3 shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
          <button onClick={() => setAuthView('login')} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10">Login</button>
          <button onClick={() => setAuthView('sales')} className="w-full rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-500">Demo</button>
        </div>
      </div>

      <main className="relative z-10 mx-auto max-w-7xl px-6 py-12 pt-28 pb-28 sm:px-8 lg:px-10">
        {authView === 'landing' && (
          <>
            <section className="grid gap-10 xl:grid-cols-[1.2fr_0.8fr] items-start scroll-reveal">
              <div className="space-y-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 ring-1 ring-white/5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Plataforma completa para oficinas modernas
                </div>
                <div className="parallax-layer space-y-5" style={{ '--parallax-speed': '0.05' } as React.CSSProperties}>
                  <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl">Um só lugar para <span className="bg-gradient-to-r from-red-500 via-fuchsia-400 to-white bg-clip-text text-transparent">entrar, conhecer</span> e acelerar sua oficina.</h1>
                  <p className="max-w-2xl text-lg leading-8 text-slate-300">Entre no app e descubra como o MotoFix transforma a gestão da sua oficina, aumenta vendas e fideliza clientes com um painel moderno e seguro.</p>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <button onClick={() => setAuthView('login')} className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 shadow-xl shadow-white/10 transition hover:scale-[1.01]">Login</button>
                  <button onClick={() => setAuthView('sales')} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-red-500/20 transition hover:opacity-95">Conheça o MotoFix <ArrowRight className="h-4 w-4" /></button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-center">
                    <p className="text-2xl font-bold text-white">+38%</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">agendamentos</p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-center">
                    <p className="text-2xl font-bold text-white">95%</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">retenção</p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-center">
                    <p className="text-2xl font-bold text-white">15 min</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">para começar</p>
                  </div>
                </div>
              </div>

              <aside className="rounded-[32px] border border-white/10 bg-slate-900/90 p-6 shadow-2xl shadow-slate-950/50 ring-1 ring-white/5 parallax-layer" style={{ '--parallax-speed': '-0.03' } as React.CSSProperties}>
                <div className="mb-6 flex items-center justify-between rounded-3xl bg-slate-800/80 px-5 py-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Escolha seu caminho</p>
                    <p className="mt-2 text-sm text-slate-300">Acesse sua oficina ou conheça o MotoFix agora.</p>
                  </div>
                  <div className="rounded-2xl bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-200">Rápido</div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-3xl border border-white/10 bg-slate-950/90 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm text-emerald-400">Já sou cliente</p>
                        <h3 className="mt-2 text-xl font-semibold text-white">Acesse sua oficina</h3>
                      </div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
                        <Users className="h-6 w-6" />
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-400">Acesse agenda, financeiro e clientes em segundos.</p>
                    <button onClick={() => setAuthView('login')} className="mt-5 w-full rounded-full bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400">Login →</button>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-slate-950/90 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm text-sky-400">Quero conhecer</p>
                        <h3 className="mt-2 text-xl font-semibold text-white">Veja como o MotoFix ajuda sua oficina</h3>
                      </div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300">
                        <TrendingUp className="h-6 w-6" />
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-400">Organize atendimentos, controle receitas e venda mais.</p>
                    <button onClick={() => setAuthView('sales')} className="mt-5 w-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95">Conheça →</button>
                  </div>
                </div>
              </aside>
            </section>

            <section id="resources" className="mt-16 space-y-10 scroll-reveal delay-200">
              <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-8 shadow-2xl shadow-slate-950/30">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Recursos</p>
                    <h2 className="mt-4 text-3xl font-bold text-white">Tudo para transformar sua oficina em um centro de performance.</h2>
                  </div>
                  <div className="rounded-3xl bg-white/5 p-3 text-red-400"><BarChart3 className="h-5 w-5" /></div>
                </div>
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  {[
                    { title: 'Agenda inteligente', description: 'Agende serviços com confirmações e lembretes automáticos por WhatsApp.' },
                    { title: 'Controle financeiro', description: 'Fluxo de caixa, receitas e despesas sempre atualizados em um painel único.' },
                    { title: 'Gestão de clientes', description: 'Histórico completo com clientes recorrentes, fidelização e vendas extras.' },
                    { title: 'Relatórios acionáveis', description: 'Dados claros para decisões rápidas e crescimento mais previsível.' }
                  ].map((item, idx) => (
                    <div key={idx} className="rounded-3xl border border-white/5 bg-slate-950/70 p-5">
                      <p className="text-lg font-semibold text-white">{item.title}</p>
                      <p className="mt-3 text-sm text-slate-400">{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div id="how" className="rounded-3xl border border-white/10 bg-slate-900/90 p-8 shadow-2xl shadow-slate-950/30 scroll-reveal delay-300">
                <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Como funciona</p>
                <h2 className="mt-4 text-3xl font-bold text-white">Seu fluxo de trabalho, agora com resultado previsível.</h2>
                <div className="mt-8 space-y-5">
                  {[
                    { title: '1. Conecte sua oficina', detail: 'Cadastre sua equipe, serviços e estoque em poucos minutos.' },
                    { title: '2. Organize atendimentos', detail: 'Venda serviços com agenda automática e evite perdas de horário.' },
                    { title: '3. Fidelize clientes', detail: 'Envie lembretes e promoções diretamente por WhatsApp.' },
                    { title: '4. Decida com dados', detail: 'Relatórios financeiros e de retenção para impulsionar crescimento.' }
                  ].map((item, idx) => (
                    <div key={idx} className="rounded-3xl border border-white/5 bg-slate-950/80 p-5">
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{item.title}</p>
                      <p className="mt-3 text-sm leading-6 text-slate-300">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div id="plans" className="rounded-3xl border border-white/10 bg-slate-900/90 p-8 shadow-2xl shadow-slate-950/30 scroll-reveal delay-300">
                <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Planos</p>
                <h2 className="mt-4 text-3xl font-bold text-white">Opções que cabem em qualquer tamanho de oficina.</h2>
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  {[
                    { title: 'Plano Starter', price: 'R$ 149/mês', description: 'Ideal para oficinas que querem começar com controle total.' },
                    { title: 'Plano Pro', price: 'R$ 249/mês', description: 'Perfeito para oficinas que buscam escalar vendas e fidelização.' }
                  ].map((plan, idx) => (
                    <div key={idx} className="rounded-3xl border border-white/5 bg-slate-950/80 p-6">
                      <p className="text-base font-semibold text-slate-300">{plan.title}</p>
                      <p className="mt-4 text-4xl font-bold text-white">{plan.price}</p>
                      <p className="mt-4 text-sm leading-6 text-slate-400">{plan.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div id="contact" className="rounded-3xl border border-white/10 bg-slate-900/90 p-8 shadow-2xl shadow-slate-950/30 scroll-reveal delay-300">
                <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Contato</p>
                <h2 className="mt-4 text-3xl font-bold text-white">Fale com nosso time e conquiste mais resultados.</h2>
                <p className="mt-4 text-slate-300">Agende uma demonstração personalizada, tire dúvidas e descubra como sua oficina pode vender mais com MotoFix.</p>
                <div className="mt-8 space-y-4">
                  <div className="rounded-3xl border border-white/5 bg-slate-950/80 p-5">
                    <p className="text-sm font-semibold text-slate-400">Chat comercial</p>
                    <p className="mt-2 text-sm text-slate-300">WhatsApp: <a href="https://wa.me/556999944024" target="_blank" rel="noreferrer" className="text-red-400">+55 69 99994-4024</a></p>
                  </div>
                  <div className="rounded-3xl border border-white/5 bg-slate-950/80 p-5">
                    <p className="text-sm font-semibold text-slate-400">E-mail</p>
                    <p className="mt-2 text-sm text-slate-300">boxmotorsoficial@gmail.com</p>
                  </div>
                </div>
                <button onClick={() => window.open(whatsappSalesUrl, '_blank')} className="mt-6 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition hover:opacity-95">Falar com vendas</button>
              </div>
            </section>

            <section className="mt-14 grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 scroll-reveal delay-200">
              <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Agendamentos</p>
                    <p className="mt-3 text-3xl font-bold text-white">127</p>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-3 text-red-400"><Calendar className="h-5 w-5" /></div>
                </div>
                <p className="mt-4 text-sm text-slate-400">+18% vs. mês anterior</p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Financeiro</p>
                    <p className="mt-3 text-3xl font-bold text-white">R$ 52.680,00</p>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-3 text-emerald-400"><DollarSign className="h-5 w-5" /></div>
                </div>
                <p className="mt-4 text-sm text-slate-400">+21% vs. mês anterior</p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Clientes recorrentes</p>
                    <p className="mt-3 text-3xl font-bold text-white">72%</p>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-3 text-sky-400"><Users className="h-5 w-5" /></div>
                </div>
                <p className="mt-4 text-sm text-slate-400">+14% vs. mês anterior</p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Fluxo de caixa</p>
                    <p className="mt-3 text-3xl font-bold text-white">R$ 48.920,40</p>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-3 text-amber-400"><DollarSign className="h-5 w-5" /></div>
                </div>
                <p className="mt-4 text-sm text-slate-400">+23% vs. mês anterior</p>
              </div>
            </section>

            <section className="mt-10 grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 scroll-reveal delay-300">
              <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-5 text-sm text-slate-300 shadow-lg shadow-slate-950/20">
                <div className="flex items-center gap-3 text-emerald-400"><ShieldCheck className="h-5 w-5" /><span>Apoio humano</span></div>
                <p className="mt-4 text-white font-semibold">Suporte dedicado para sua equipe</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-5 text-sm text-slate-300 shadow-lg shadow-slate-950/20">
                <div className="flex items-center gap-3 text-sky-400"><Calendar className="h-5 w-5" /><span>Agenda centralizada</span></div>
                <p className="mt-4 text-white font-semibold">Reduza falhas e aumente a produtividade</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-5 text-sm text-slate-300 shadow-lg shadow-slate-950/20">
                <div className="flex items-center gap-3 text-violet-400"><BarChart3 className="h-5 w-5" /><span>Controle financeiro</span></div>
                <p className="mt-4 text-white font-semibold">Veja entradas, saídas e lucro com clareza</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-5 text-sm text-slate-300 shadow-lg shadow-slate-950/20">
                <div className="flex items-center gap-3 text-red-400"><Users className="h-5 w-5" /><span>Clientes fidelizados</span></div>
                <p className="mt-4 text-white font-semibold">Atendimento personalizado e histórico completo</p>
              </div>
            </section>
          </>
        )}

        {authView === 'login' && (
          <section className="max-w-md rounded-3xl border border-white/10 bg-slate-900/90 p-8 shadow-2xl shadow-slate-950/40">
            <button onClick={() => setAuthView('landing')} className="mb-6 text-sm text-slate-400 transition hover:text-white">← Voltar</button>
            <h2 className="text-3xl font-bold text-white">Entrar no MotoFix</h2>
            <p className="mt-3 text-slate-400">Faça login com sua conta Google para acessar sua oficina.</p>

            {authError && (
              <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
                {authError}
              </div>
            )}

            <button
              onClick={handleGoogleLogin}
              disabled={isSigningIn}
              className="mt-8 flex w-full items-center justify-center gap-3 rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5"><path fill="#EA4335" d="M24 9.5c3.9 0 7.1 1.4 9.8 3.8l7.3-7.3C36.5 2.4 30.7 0 24 0 14 0 5.3 5.2 1.6 12.8l8.9 6.9C12.9 14.2 17.9 9.5 24 9.5z"/></svg>
              {isSigningIn ? 'Entrando...' : 'Entrar com Google'}
            </button>

            {authError && (
              <button
                onClick={handleRedirectLogin}
                disabled={isSigningIn}
                className="mt-3 w-full rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Entrar redirecionando
              </button>
            )}
          </section>
        )}

        {authView === 'sales' && (
          <div className="space-y-16">
            {/* Hero Section */}
            <section className="space-y-8">
              <div className="space-y-6 text-center">
                <h1 className="animate-fade-up text-4xl sm:text-6xl font-extrabold tracking-tight text-white">
                  Aumente suas vendas em
                  <span className="block bg-gradient-to-r from-red-500 via-fuchsia-400 to-white bg-clip-text text-transparent">38% em 3 meses</span>
                </h1>
                <p className="max-w-2xl mx-auto text-lg text-slate-300 animate-fade-up animation-delay-200">
                  Mais de 120 oficinas já transformaram seus resultados com MotoFix. Gestão simples que gera impacto real.
                </p>
                <button 
                  onClick={() => window.open(whatsappSalesUrl, '_blank')}
                  className="mx-auto flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-8 py-4 text-lg font-bold text-white shadow-2xl shadow-red-500/40 transition hover:scale-105 animate-fade-up animation-delay-300"
                >
                  Falar com especialista agora
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            </section>

            {/* Results Grid */}
            <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { value: '+38%', label: 'Aumento de agendamentos', icon: '📅' },
                { value: '+89%', label: 'ROI nos primeiros meses', icon: '📈' },
                { value: '120+', label: 'Oficinas em crescimento', icon: '🏪' },
                { value: '95%', label: 'Taxa de retenção', icon: '✅' }
              ].map((item, idx) => (
                <div 
                  key={idx}
                  className="group rounded-3xl border border-white/10 bg-gradient-to-br from-slate-800 to-slate-900 p-6 shadow-lg shadow-slate-950/30 transition-all duration-300 hover:border-red-500/50 hover:shadow-red-500/20 animate-fade-up"
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <p className="text-4xl font-black text-white group-hover:text-red-400 transition-colors">{item.value}</p>
                  <p className="mt-3 text-sm text-slate-400">{item.label}</p>
                </div>
              ))}
            </section>

            {/* Antes e Depois */}
            <section className="space-y-8">
              <h2 className="text-3xl font-bold text-white text-center">Veja a transformação</h2>
              <div className="grid gap-8 lg:grid-cols-2">
                {/* Antes */}
                <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-8 space-y-6 hover:shadow-lg hover:shadow-slate-950/50 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">❌</div>
                    <h3 className="text-xl font-bold text-slate-300">Antes do MotoFix</h3>
                  </div>
                  <ul className="space-y-4 text-slate-400">
                    <li className="flex gap-3">
                      <span>•</span>
                      <span>Agenda em papel ou planilha desorganizada</span>
                    </li>
                    <li className="flex gap-3">
                      <span>•</span>
                      <span>Dificuldade em rastrear clientes recorrentes</span>
                    </li>
                    <li className="flex gap-3">
                      <span>•</span>
                      <span>Financeiro confuso e sem controle real</span>
                    </li>
                    <li className="flex gap-3">
                      <span>•</span>
                      <span>Perda de clientes por falta de lembretes</span>
                    </li>
                    <li className="flex gap-3">
                      <span>•</span>
                      <span>Sem dados para tomar decisões</span>
                    </li>
                  </ul>
                </div>

                {/* Depois */}
                <div className="rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-slate-900 to-slate-800 p-8 space-y-6 shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">✅</div>
                    <h3 className="text-xl font-bold text-emerald-400">Com MotoFix</h3>
                  </div>
                  <ul className="space-y-4 text-slate-300">
                    <li className="flex gap-3">
                      <span className="text-emerald-400">•</span>
                      <span>Agenda centralizada e automática</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-emerald-400">•</span>
                      <span>Sistemas automáticos de lembretes por WhatsApp</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-emerald-400">•</span>
                      <span>Dashboard financeiro completo em tempo real</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-emerald-400">•</span>
                      <span>Aumento automático de 38% em clientes recorrentes</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-emerald-400">•</span>
                      <span>Relatórios inteligentes para crescimento direcionado</span>
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Case Studies */}
            <section className="space-y-8">
              <h2 className="text-3xl font-bold text-white text-center">Histórias de sucesso reais</h2>
              <div className="grid gap-6 lg:grid-cols-3">
                {[
                  { 
                    name: 'João - Oficina em São Paulo',
                    achievement: 'De R$ 15mil para R$ 25mil de receita mensal',
                    detail: '+67% em 4 meses'
                  },
                  { 
                    name: 'Maria - Oficina em Brasília',
                    achievement: '120+ agendamentos mensais gerenciados automaticamente',
                    detail: '95% de satisfação com controle financeiro'
                  },
                  { 
                    name: 'Carlos - Oficina no RJ',
                    achievement: 'Economizou 10 horas/semana em administrativo',
                    detail: '+30% de tempo para vendas'
                  }
                ].map((cs, idx) => (
                  <div
                    key={idx}
                    className="group rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-lg transition-all duration-300 hover:border-red-500/50 hover:shadow-red-500/20 hover:-translate-y-2 animate-fade-up"
                    style={{ animationDelay: `${idx * 150}ms` }}
                  >
                    <h4 className="font-bold text-white group-hover:text-red-400 transition-colors">{cs.name}</h4>
                    <p className="mt-3 text-sm text-slate-300">{cs.achievement}</p>
                    <p className="mt-2 text-xs text-red-400 font-semibold">{cs.detail}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Features */}
            <section className="space-y-8">
              <h2 className="text-3xl font-bold text-white text-center">Tudo que sua oficina precisa</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { icon: '📅', title: 'Agenda Inteligente', desc: 'Otimize horários e reduza cancelamentos' },
                  { icon: '💰', title: 'Controle Financeiro', desc: 'Receitas, despesas e lucro em tempo real' },
                  { icon: '👥', title: 'Gestão de Clientes', desc: 'Histórico completo e comportamento de compra' },
                  { icon: '🔔', title: 'Lembretes Automáticos', desc: 'WhatsApp automático para manutenção' },
                  { icon: '📊', title: 'Relatórios Detalhados', desc: 'Decisões baseadas em dados reais' },
                  { icon: '⚡', title: 'Integração Total', desc: 'Tudo conectado e sincronizado' }
                ].map((feature, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-white/10 bg-slate-900/50 p-5 text-center hover:border-red-500/30 transition-all group"
                  >
                    <p className="text-4xl mb-3">{feature.icon}</p>
                    <h4 className="font-bold text-white group-hover:text-red-400 transition-colors">{feature.title}</h4>
                    <p className="mt-2 text-xs text-slate-400">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* CTA Final */}
            <section className="space-y-6 rounded-3xl border border-red-500/30 bg-gradient-to-r from-red-500/10 to-orange-500/10 p-8 sm:p-12 text-center scroll-reveal delay-400">
              <h2 className="text-3xl sm:text-4xl font-bold text-white">Pronto para multiplicar seus resultados?</h2>
              <p className="max-w-2xl mx-auto text-slate-300">Comece agora com uma consultoria gratuita. Nosso time está pronto para desenhar a solução perfeita para sua oficina.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button 
                  onClick={() => window.open(whatsappSalesUrl, '_blank')}
                  className="rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-8 py-4 font-bold text-white shadow-lg shadow-red-500/40 transition hover:scale-105"
                >
                  Agende sua consultoria - É grátis
                </button>
                <button 
                  onClick={() => setAuthView('login')}
                  className="rounded-full border border-white/20 bg-white/5 px-8 py-4 font-bold text-white transition hover:bg-white/10"
                >
                  Ver demo do sistema
                </button>
              </div>
            </section>

            {/* Footer Link */}
            <div className="text-center">
              <button onClick={() => setAuthView('landing')} className="text-sm text-slate-400 transition hover:text-white">
                ← Voltar para home
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
