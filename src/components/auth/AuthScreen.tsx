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
      const errorCode = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : '';
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
            <button type="button" onClick={() => setAuthView('login')} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 transition hover:border-white/20">Login</button>
            <button type="button" onClick={() => setAuthView('sales')} className="rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-red-500/20 transition hover:opacity-95">Conheça o MotoFix</button>
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
            {/* HERO SECTION */}
            <section className="grid gap-12 xl:grid-cols-[1fr_1fr] items-center scroll-reveal pb-12 border-b border-white/10">
              <div className="space-y-8">
                {/* Badge */}
                <div className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300">
                  <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
                  Transformando oficinas desde 2023
                </div>

                {/* Headline */}
                <div className="space-y-6">
                  <h1 className="text-6xl font-black tracking-tight text-white leading-tight">
                    Sua oficina <span className="bg-gradient-to-r from-red-500 via-red-400 to-orange-500 bg-clip-text text-transparent">merece mais</span> que planilhas.
                  </h1>
                  <p className="text-xl text-slate-300 leading-relaxed max-w-xl">
                    MotoFix é a plataforma de gestão completa que transforma a forma como sua oficina trabalha. Agende com precisão, controle financeiro e fidelize clientes como nunca antes.
                  </p>
                </div>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <button 
                    onClick={() => setAuthView('login')}
                    className="px-8 py-4 rounded-full bg-white text-slate-950 font-bold shadow-xl shadow-white/20 transition hover:shadow-white/30 hover:scale-105"
                  >
                    Acessar minha conta
                  </button>
                  <button 
                    onClick={() => setAuthView('sales')} 
                    className="px-8 py-4 rounded-full border-2 border-red-500 text-white font-bold bg-red-500/10 transition hover:bg-red-500/20 hover:border-red-400"
                  >
                    Ver demonstração
                  </button>
                </div>

                {/* Trust Indicators */}
                <div className="grid grid-cols-3 gap-4 pt-4">
                  <div className="space-y-1">
                    <p className="text-3xl font-bold text-white">500+</p>
                    <p className="text-sm text-slate-400">Oficinas ativas</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-3xl font-bold text-white">99.8%</p>
                    <p className="text-sm text-slate-400">Disponibilidade</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-3xl font-bold text-white">4.9★</p>
                    <p className="text-sm text-slate-400">Avaliação média</p>
                  </div>
                </div>
              </div>

              {/* Hero Visual */}
              <div className="relative hidden xl:block">
                <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/50 to-slate-900/50 p-8 backdrop-blur-sm">
                  <div className="space-y-6">
                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-xl bg-slate-900/80 border border-white/10 p-4">
                        <p className="text-xs text-slate-400 uppercase tracking-wide">Agendamentos hoje</p>
                        <p className="text-2xl font-bold text-white mt-2">24</p>
                        <p className="text-xs text-green-400 mt-2">↑ 18% vs ontem</p>
                      </div>
                      <div className="rounded-xl bg-slate-900/80 border border-white/10 p-4">
                        <p className="text-xs text-slate-400 uppercase tracking-wide">Receita (mês)</p>
                        <p className="text-2xl font-bold text-white mt-2">R$ 52.6k</p>
                        <p className="text-xs text-green-400 mt-2">↑ 21% vs mês</p>
                      </div>
                      <div className="rounded-xl bg-slate-900/80 border border-white/10 p-4">
                        <p className="text-xs text-slate-400 uppercase tracking-wide">Clientes ativos</p>
                        <p className="text-2xl font-bold text-white mt-2">187</p>
                        <p className="text-xs text-blue-400 mt-2">↑ 14 novos</p>
                      </div>
                      <div className="rounded-xl bg-slate-900/80 border border-white/10 p-4">
                        <p className="text-xs text-slate-400 uppercase tracking-wide">Taxa de retorno</p>
                        <p className="text-2xl font-bold text-white mt-2">72%</p>
                        <p className="text-xs text-purple-400 mt-2">Excelente</p>
                      </div>
                    </div>

                    {/* Appointment Card */}
                    <div className="rounded-xl bg-slate-950/80 border border-white/10 p-4">
                      <p className="text-xs text-slate-400 uppercase tracking-wide mb-3">Próximos atendimentos</p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-white font-medium">João Silva - Revisão</span>
                          <span className="text-slate-400">14:30</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-white font-medium">Maria Costa - Alinhamento</span>
                          <span className="text-slate-400">15:45</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* CORE FEATURES */}
            <section id="resources" className="mt-20 space-y-12 scroll-reveal">
              <div className="text-center space-y-4">
                <h2 className="text-4xl font-bold text-white">Tudo que sua oficina precisa para crescer</h2>
                <p className="text-lg text-slate-400 max-w-2xl mx-auto">MotoFix centraliza agenda, financeiro, clientes e comunicação em uma plataforma única</p>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {[
                  { 
                    icon: Calendar, 
                    color: 'from-blue-500 to-blue-600',
                    title: 'Agenda Inteligente', 
                    description: 'Agendamentos automáticos, lembretes por WhatsApp e sincronização com seu time em tempo real.' 
                  },
                  { 
                    icon: DollarSign, 
                    color: 'from-green-500 to-emerald-600',
                    title: 'Controle Financeiro', 
                    description: 'Fluxo de caixa completo, receitas, despesas e lucro sempre atualizados no painel.' 
                  },
                  { 
                    icon: Users, 
                    color: 'from-purple-500 to-violet-600',
                    title: 'Gestão de Clientes', 
                    description: 'Histórico detalhado, clientes recorrentes, preferências e comportamento de compra.' 
                  },
                  { 
                    icon: BarChart3, 
                    color: 'from-orange-500 to-red-600',
                    title: 'Relatórios Inteligentes', 
                    description: 'Dashboard visual com métricas acionáveis para decisões de negócio mais rápidas.' 
                  },
                ].map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <div key={idx} className="group relative rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/50 to-slate-900/50 p-6 hover:border-red-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/10 hover:-translate-y-1">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} p-3 text-white mb-4 group-hover:scale-110 transition-transform`}>
                        <Icon className="w-full h-full" />
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                      <p className="text-sm text-slate-300">{item.description}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* HOW IT WORKS */}
            <section id="how" className="mt-20 space-y-12 scroll-reveal">
              <div className="text-center space-y-4">
                <h2 className="text-4xl font-bold text-white">Como MotoFix funciona</h2>
                <p className="text-lg text-slate-400 max-w-2xl mx-auto">4 passos simples para transformar sua oficina</p>
              </div>

              <div className="grid gap-6 md:grid-cols-4">
                {[
                  { 
                    step: '1',
                    title: 'Cadastre sua oficina',
                    description: 'Configure sua oficina, serviços, preços e equipe em menos de 5 minutos.' 
                  },
                  { 
                    step: '2',
                    title: 'Organize sua agenda',
                    description: 'Agende clientes com confirmação automática e lembretes por WhatsApp.' 
                  },
                  { 
                    step: '3',
                    title: 'Controle financeiro',
                    description: 'Acompanhe receitas, despesas e lucro em tempo real no dashboard.' 
                  },
                  { 
                    step: '4',
                    title: 'Decida com dados',
                    description: 'Acesse relatórios que mostram como crescer de forma consistente.' 
                  },
                ].map((item, idx) => (
                  <div key={idx} className="relative group">
                    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/50 to-slate-900/50 p-8 text-center hover:border-red-500/50 transition-all">
                      <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-gradient-to-br from-red-500 to-orange-600 text-white font-bold text-2xl mb-4 mx-auto">
                        {item.step}
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                      <p className="text-sm text-slate-300">{item.description}</p>
                    </div>
                    {idx < 3 && (
                      <div className="hidden md:flex absolute top-8 -right-3 w-6 justify-center">
                        <ArrowRight className="w-5 h-5 text-slate-600" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* PRICING */}
            <section id="plans" className="mt-20 space-y-12 scroll-reveal">
              <div className="text-center space-y-4">
                <h2 className="text-4xl font-bold text-white">Escolha o plano ideal para sua oficina</h2>
                <p className="text-lg text-slate-400 max-w-2xl mx-auto">Todos com suporte dedicado, atualizações contínuas e garantia de 30 dias</p>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                {[
                  { 
                    name: 'Starter',
                    price: 'R$ 149',
                    period: '/mês',
                    description: 'Perfeito para iniciar sua transformação',
                    features: [
                      '✓ Agenda centralizada',
                      '✓ Até 100 clientes',
                      '✓ Controle financeiro básico',
                      '✓ 1 usuário',
                      '✓ Suporte por email'
                    ],
                    highlighted: false
                  },
                  { 
                    name: 'Professional',
                    price: 'R$ 299',
                    period: '/mês',
                    description: 'Escale sua oficina com todas as funcionalidades',
                    features: [
                      '✓ Tudo do Starter +',
                      '✓ Clientes ilimitados',
                      '✓ Controle financeiro avançado',
                      '✓ 5 usuários',
                      '✓ Relatórios detalhados',
                      '✓ Prioridade 24/7',
                      '✓ Integração WhatsApp Business'
                    ],
                    highlighted: true
                  },
                ].map((plan, idx) => (
                  <div 
                    key={idx} 
                    className={`relative rounded-2xl border transition-all duration-300 ${
                      plan.highlighted 
                        ? 'border-red-500/50 bg-gradient-to-br from-red-500/20 to-orange-500/20 shadow-lg shadow-red-500/20 scale-105' 
                        : 'border-white/10 bg-gradient-to-br from-slate-800/50 to-slate-900/50 hover:border-white/20'
                    } p-8`}
                  >
                    {plan.highlighted && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-red-500 to-orange-500 text-white text-xs font-bold px-4 py-1 rounded-full">
                        MAIS POPULAR
                      </div>
                    )}
                    
                    <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                    <p className="text-slate-300 text-sm mb-6">{plan.description}</p>
                    
                    <div className="mb-6">
                      <span className="text-5xl font-black text-white">{plan.price}</span>
                      <span className="text-slate-400 text-sm">{plan.period}</span>
                    </div>

                    <ul className="space-y-3 mb-8">
                      {plan.features.map((feature, fidx) => (
                        <li key={fidx} className="text-sm text-slate-300 flex items-center gap-2">
                          <span className={plan.highlighted ? 'text-red-400' : 'text-emerald-400'}>•</span>
                          {feature.replace('✓ ', '')}
                        </li>
                      ))}
                    </ul>

                    <button 
                      onClick={() => setAuthView('login')}
                      className={`w-full py-3 rounded-full font-bold transition ${
                        plan.highlighted
                          ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white hover:opacity-90'
                          : 'border-2 border-white/20 text-white hover:border-white/40 bg-white/5'
                      }`}
                    >
                      Começar agora
                    </button>
                  </div>
                ))}
              </div>

              <div className="text-center">
                <p className="text-slate-300">Dúvidas sobre os planos? 
                  <button 
                    onClick={() => window.open(whatsappSalesUrl, '_blank')}
                    className="ml-2 text-red-400 hover:text-red-300 font-semibold underline"
                  >
                    Fale com nosso time
                  </button>
                </p>
              </div>
            </section>

            {/* SOCIAL PROOF & TESTIMONIALS */}
            <section className="mt-20 space-y-12 scroll-reveal">
              <div className="text-center space-y-4">
                <h2 className="text-4xl font-bold text-white">Oficinas que já crescem com MotoFix</h2>
                <p className="text-lg text-slate-400">Veja o que nossos clientes conquistaram</p>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                {[
                  {
                    name: 'João Silva',
                    workshop: 'Centro Automotivo SP',
                    result: '+67% receita em 4 meses',
                    detail: 'De R$ 15k para R$ 25k',
                    avatar: '👨‍💼'
                  },
                  {
                    name: 'Maria Costa',
                    workshop: 'Oficina Premium Brasília',
                    result: '120+ agendamentos/mês',
                    detail: '95% de retenção de clientes',
                    avatar: '👩‍💼'
                  },
                  {
                    name: 'Carlos Santos',
                    workshop: 'Auto Serviços RJ',
                    result: '-10h admin por semana',
                    detail: '+30% foco em vendas',
                    avatar: '👨‍🔧'
                  },
                ].map((testimonial, idx) => (
                  <div key={idx} className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/50 to-slate-900/50 p-6 hover:border-red-500/30 transition-all">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="text-4xl">{testimonial.avatar}</div>
                      <div>
                        <p className="font-bold text-white text-sm">{testimonial.name}</p>
                        <p className="text-xs text-slate-400">{testimonial.workshop}</p>
                      </div>
                    </div>
                    <p className="text-red-400 font-bold text-lg mb-2">{testimonial.result}</p>
                    <p className="text-sm text-slate-300">{testimonial.detail}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* FINAL CTA */}
            <section className="mt-20 space-y-8 scroll-reveal">
              <div className="rounded-3xl border-2 border-red-500/30 bg-gradient-to-br from-red-500/10 to-orange-500/10 p-12 text-center space-y-6">
                <h2 className="text-4xl font-bold text-white">Pronto para transformar sua oficina?</h2>
                <p className="text-lg text-slate-300 max-w-2xl mx-auto">Comece hoje com uma consultoria gratuita. Nosso time especializado está pronto para desenhar a solução perfeita para você.</p>
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button 
                    onClick={() => window.open(whatsappSalesUrl, '_blank')}
                    className="px-8 py-4 rounded-full bg-gradient-to-r from-red-500 to-orange-500 text-white font-bold shadow-lg shadow-red-500/30 transition hover:scale-105 hover:shadow-red-500/50"
                  >
                    Agende uma consultoria - Grátis
                  </button>
                  <button 
                    type="button"
                    onClick={() => setAuthView('login')}
                    className="px-8 py-4 rounded-full border-2 border-white/30 text-white font-bold transition hover:border-white/50 hover:bg-white/5"
                  >
                    Já tenho conta - Entrar
                  </button>
                </div>
              </div>

              {/* CONTACT INFO */}
              <div className="grid md:grid-cols-3 gap-6">
                <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/50 to-slate-900/50 p-6 text-center">
                  <div className="text-3xl mb-3">💬</div>
                  <p className="font-bold text-white mb-2">Chat via WhatsApp</p>
                  <p className="text-sm text-slate-400 mb-4">Fale com nosso time em tempo real</p>
                  <a 
                    href={whatsappSalesUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="inline-block px-4 py-2 rounded-full bg-white/10 text-red-400 hover:bg-white/20 transition text-sm font-semibold"
                  >
                    Abrir conversa
                  </a>
                </div>

                <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/50 to-slate-900/50 p-6 text-center">
                  <div className="text-3xl mb-3">📧</div>
                  <p className="font-bold text-white mb-2">E-mail de suporte</p>
                  <p className="text-sm text-slate-400 mb-4">boxmotorsoficial@gmail.com</p>
                  <a 
                    href="mailto:boxmotorsoficial@gmail.com"
                    className="inline-block px-4 py-2 rounded-full bg-white/10 text-red-400 hover:bg-white/20 transition text-sm font-semibold"
                  >
                    Enviar mensagem
                  </a>
                </div>

                <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/50 to-slate-900/50 p-6 text-center">
                  <div className="text-3xl mb-3">📱</div>
                  <p className="font-bold text-white mb-2">Telefone direto</p>
                  <p className="text-sm text-slate-400 mb-4">+55 69 99994-4024</p>
                  <a 
                    href="tel:+556999944024"
                    className="inline-block px-4 py-2 rounded-full bg-white/10 text-red-400 hover:bg-white/20 transition text-sm font-semibold"
                  >
                    Ligar agora
                  </a>
                </div>
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
              type="button"
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
