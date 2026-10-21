import { useEffect } from 'react';
import { BarChart3, CalendarDays, Check, CircleDollarSign, Mail, MessageCircle, Moon, Sun, Users } from 'lucide-react';
import './LandingPage.css';
import type { ColorMode } from '../../types';

type LandingPageProps = {
  colorMode: ColorMode;
  onLogin: () => void;
  onColorModeChange: (mode: ColorMode) => void;
  onNavigate: (sectionId: string) => void;
  onOpenLegal: (kind: 'privacy' | 'terms') => void;
};

const whatsappUrl = 'https://wa.me/556999944024';
const demoUrl = `${whatsappUrl}?text=${encodeURIComponent('Olá, quero conhecer o MotoFix e agendar uma demonstração.')}`;
const emailUrl = 'mailto:boxmotorsoficial@gmail.com';

const featureItems = [
  { icon: CalendarDays, tone: 'blue', title: 'Agenda inteligente', description: 'Organize os horários, acompanhe os próximos atendimentos e reduza esquecimentos com lembretes.' },
  { icon: CircleDollarSign, tone: 'green', title: 'Controle financeiro', description: 'Registre receitas e despesas e tenha uma visão mais clara do movimento da oficina.' },
  { icon: Users, tone: 'purple', title: 'Clientes e motos', description: 'Consulte o histórico de serviços e saiba quais clientes precisam voltar à oficina.' },
  { icon: BarChart3, tone: 'orange', title: 'Relatórios úteis', description: 'Acompanhe os números principais para tomar decisões com mais segurança.' },
];

const steps = [
  ['Cadastre sua oficina', 'Configure sua oficina, serviços, preços e informações básicas.'],
  ['Organize os atendimentos', 'Registre clientes, motos, agenda e ordens de serviço.'],
  ['Acompanhe o financeiro', 'Registre entradas e saídas para entender o movimento.'],
  ['Traga o cliente de volta', 'Acompanhe o histórico e organize os próximos retornos.'],
];

const plans = [
  {
    name: 'Starter',
    price: 'R$ 149',
    description: 'Perfeito para iniciar sua transformação.',
    summary: 'Para organizar a rotina da oficina.',
    features: ['Agenda centralizada', 'Até 100 clientes', 'Controle financeiro básico', '1 usuário', 'Suporte por e-mail'],
    message: 'Olá, quero saber mais sobre o plano Starter do MotoFix.',
  },
  {
    name: 'Professional',
    price: 'R$ 299',
    description: 'Para oficinas que precisam de mais controle.',
    summary: 'Mais recursos para acompanhar a operação.',
    features: ['Tudo do Starter', 'Clientes ilimitados', 'Controle financeiro avançado', 'Até 5 usuários', 'Relatórios detalhados', 'Prioridade no suporte', 'Integração com WhatsApp Business'],
    message: 'Olá, quero saber mais sobre o plano Professional do MotoFix.',
    highlighted: true,
  },
];

const testimonials = [
  { initials: 'JS', name: 'João Silva', workshop: 'Centro Automotivo SP', result: 'Mais controle da rotina', detail: 'Agenda e histórico dos serviços organizados em um só lugar.' },
  { initials: 'MC', name: 'Maria Costa', workshop: 'Oficina Premium Brasília', result: 'Atendimentos organizados', detail: 'Fica mais fácil acompanhar os próximos serviços e retornos.' },
  { initials: 'CS', name: 'Carlos Santos', workshop: 'Auto Serviços RJ', result: 'Mais visão do negócio', detail: 'Os registros ajudam a entender melhor o movimento da oficina.' },
];

const DashboardPreview = () => (
  <div className="lp-preview" aria-label="Prévia ilustrativa do painel MotoFix">
    <div className="lp-browser">
      <div className="lp-browser-bar"><i /><i /><i /><span>app.motofix.com.br / painel</span></div>
      <div className="lp-app">
        <aside>
          <strong>MotoFix</strong>
          <span className="lp-selected">Visão geral</span>
          <span>Agenda</span>
          <span>Ordens de serviço</span>
          <span>Clientes e motos</span>
          <span>Financeiro</span>
          <span>Relatórios</span>
        </aside>
        <div className="lp-dashboard">
          <div className="lp-dashboard-heading"><strong>Visão geral</strong><span>Resumo da oficina</span></div>
          <div className="lp-stats">
            <div><small>OS em andamento</small><strong>08</strong><em>Serviços em execução</em></div>
            <div><small>Receita do mês</small><strong>R$ 12,6 mil</strong><em>Resumo financeiro</em></div>
            <div><small>Agendamentos</small><strong>14</strong><em>Próximos atendimentos</em></div>
            <div><small>Retornos pendentes</small><strong>06</strong><em>Clientes para contatar</em></div>
          </div>
          <div className="lp-panel">
            <b>Próximos atendimentos</b>
            <div className="lp-data-row"><strong>João Silva</strong><span>Revisão</span><span>14:30</span></div>
            <div className="lp-data-row"><strong>Maria Costa</strong><span>Alinhamento</span><span>15:45</span></div>
            <div className="lp-data-row"><strong>Carlos Lima</strong><span>Troca de óleo</span><span>16:30</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export const LandingPage = ({ colorMode, onLogin, onColorModeChange, onNavigate, onOpenLegal }: LandingPageProps) => (
  <div className={`landing-page${colorMode === 'light' ? ' lp-light-theme' : ''}`} id="inicio">
    <ScrollReveal />
    <header className="lp-header">
      <nav className="lp-container lp-nav" aria-label="Navegação principal">
        <a className="lp-brand" href="#inicio" onClick={(event) => { event.preventDefault(); onNavigate('inicio'); }}>
          <span className="lp-logo">MF</span>
          <span>MotoFix<small>GESTÃO PARA OFICINAS</small></span>
        </a>
        <div className="lp-nav-links">
          <button type="button" onClick={() => onNavigate('recursos')}>Recursos</button>
          <button type="button" onClick={() => onNavigate('como')}>Como funciona</button>
          <button type="button" onClick={() => onNavigate('planos')}>Planos</button>
          <button type="button" onClick={() => onNavigate('contato')}>Contato</button>
        </div>
        <div className="lp-nav-actions">
          <button
            type="button"
            className="lp-theme-toggle"
            aria-label={colorMode === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
            title={colorMode === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
            onClick={() => onColorModeChange(colorMode === 'dark' ? 'light' : 'dark')}
          >
            {colorMode === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
          <button type="button" className="lp-login" onClick={onLogin}>Entrar</button>
          <a className="lp-button lp-dark-button" href="#planos" onClick={(event) => { event.preventDefault(); onNavigate('planos'); }}>Conheça o MotoFix</a>
        </div>
      </nav>
    </header>

    <main>
      <section className="lp-hero lp-container">
        <div className="lp-hero-grid">
          <div className="lp-hero-copy lp-reveal">
            <span className="lp-eyebrow"><i />Gestão feita para oficina de motos</span>
            <h1>Sua oficina merece <em>mais</em> que planilhas.</h1>
            <p className="lp-lead">Organize agenda, clientes, serviços e financeiro em um só lugar. O MotoFix ajuda você a acompanhar a rotina da oficina e manter o relacionamento com seus clientes — sem complicar o trabalho.</p>
            <div className="lp-actions">
              <a className="lp-button lp-red-button" href={demoUrl} target="_blank" rel="noreferrer">Agendar uma demonstração ↗</a>
              <a className="lp-button lp-outline-button" href="#recursos" onClick={(event) => { event.preventDefault(); onNavigate('recursos'); }}>Conhecer recursos</a>
            </div>
            <div className="lp-proof">
              <div><b>Mais organização</b><span>na rotina da oficina</span></div>
              <div><b>Mais controle</b><span>dos serviços e do caixa</span></div>
              <div><b>Mais retornos</b><span>de clientes</span></div>
            </div>
          </div>
          <div className="lp-reveal"><DashboardPreview /></div>
        </div>
      </section>

      <section className="lp-section lp-light" id="recursos">
        <div className="lp-container">
          <div className="lp-heading lp-reveal">
            <p className="lp-kicker">Feito para o dia a dia</p>
            <h2>O que sua oficina precisa, sem complicação.</h2>
            <p>Menos tempo procurando informação. Mais clareza para cuidar dos serviços, dos clientes e do caixa.</p>
          </div>
          <div className="lp-features">
            {featureItems.map(({ icon: Icon, tone, title, description }) => (
              <article className="lp-feature lp-reveal" key={title}>
                <div className={`lp-feature-icon ${tone}`}><Icon aria-hidden="true" /></div>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section lp-workflow" id="como">
        <div className="lp-container">
          <div className="lp-heading lp-reveal">
            <p className="lp-kicker">Comece com o essencial</p>
            <h2>Uma rotina mais organizada, passo a passo.</h2>
            <p>O MotoFix reúne as tarefas do dia a dia em um fluxo simples.</p>
          </div>
          <div className="lp-steps">
            {steps.map(([title, description], index) => (
              <article className="lp-step lp-reveal" key={title}>
                <span>{index + 1}</span><h3>{title}</h3><p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section lp-light" id="planos">
        <div className="lp-container">
          <div className="lp-heading lp-reveal">
            <p className="lp-kicker">Planos</p>
            <h2>Escolha o plano ideal para sua oficina.</h2>
            <p>Comece com o essencial e evolua conforme a necessidade da sua operação.</p>
          </div>
          <div className="lp-plans">
            {plans.map((plan) => (
              <article className={`lp-plan lp-reveal${plan.highlighted ? ' lp-plan-featured' : ''}`} key={plan.name}>
                {plan.highlighted && <span className="lp-plan-tag">MAIS COMPLETO</span>}
                <h3>{plan.name}</h3>
                <p className="lp-plan-description">{plan.description}</p>
                <div className="lp-price">{plan.price}<small>/mês</small></div>
                <p className="lp-plan-summary">{plan.summary}</p>
                <ul>{plan.features.map((feature) => <li key={feature}><Check aria-hidden="true" />{feature}</li>)}</ul>
                <a className={`lp-button lp-full-button${plan.highlighted ? ' lp-red-button' : ' lp-outline-button'}`} href={`${whatsappUrl}?text=${encodeURIComponent(plan.message)}`} target="_blank" rel="noreferrer">Tenho interesse</a>
              </article>
            ))}
          </div>
          <p className="lp-plan-help">Dúvidas sobre os planos? <a href={`${whatsappUrl}?text=${encodeURIComponent('Olá, tenho dúvidas sobre os planos do MotoFix.')}`} target="_blank" rel="noreferrer">Fale com nossa equipe</a></p>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-container">
          <div className="lp-heading lp-reveal">
            <p className="lp-kicker">Mais clareza na gestão</p>
            <h2>Feito para acompanhar a evolução da sua oficina.</h2>
            <p>Tenha uma visão mais clara dos atendimentos, do financeiro e dos clientes que podem voltar.</p>
          </div>
          <div className="lp-testimonials">
            {testimonials.map((testimonial) => (
              <article className="lp-testimonial lp-reveal" key={testimonial.initials}>
                <div className="lp-person">
                  <span className="lp-avatar">{testimonial.initials}</span>
                  <span><b>{testimonial.name}</b><small>{testimonial.workshop}</small></span>
                </div>
                <strong>{testimonial.result}</strong>
                <p>{testimonial.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-contact-section" id="contato">
        <div className="lp-container">
          <div className="lp-cta lp-reveal">
            <div><h2>Vamos organizar sua oficina?</h2><p>Converse com a equipe MotoFix, tire suas dúvidas e veja qual plano combina com a rotina do seu negócio.</p></div>
            <div className="lp-cta-actions">
              <a className="lp-button lp-red-button" href={demoUrl} target="_blank" rel="noreferrer">Falar com a equipe ↗</a>
              <button type="button" className="lp-button lp-outline-button" onClick={onLogin}>Já tenho conta</button>
            </div>
          </div>
          <div className="lp-contacts">
            <a className="lp-contact lp-reveal" href={`${whatsappUrl}?text=${encodeURIComponent('Olá, vim pela página do MotoFix.')}`} target="_blank" rel="noreferrer">
              <span className="lp-contact-icon"><MessageCircle aria-hidden="true" /></span>
              <span><small>WhatsApp</small><strong>+55 69 9994-4024</strong><span>Fale diretamente com nossa equipe</span></span>
            </a>
            <a className="lp-contact lp-reveal" href={emailUrl}>
              <span className="lp-contact-icon"><Mail aria-hidden="true" /></span>
              <span><small>E-mail</small><strong>boxmotorsoficial@gmail.com</strong><span>Envie sua dúvida por e-mail</span></span>
            </a>
          </div>
        </div>
      </section>
    </main>

    <footer className="lp-footer">
      <div className="lp-container lp-footer-inner">
        <a className="lp-brand" href="#inicio" onClick={(event) => { event.preventDefault(); onNavigate('inicio'); }}>
          <span className="lp-logo">MF</span><span>MotoFix<small>GESTÃO PARA OFICINAS</small></span>
        </a>
        <span>© 2026 MotoFix. Todos os direitos reservados.</span>
        <span className="lp-legal-links">
          <button type="button" onClick={() => onOpenLegal('privacy')}>Privacidade</button>
          <button type="button" onClick={() => onOpenLegal('terms')}>Termos de uso</button>
        </span>
      </div>
    </footer>
  </div>
);

const ScrollReveal = () => {
  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>('.landing-page .lp-reveal');
    if (!('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('lp-revealed'));
      return;
    }

    const observer = new IntersectionObserver((entries, activeObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('lp-revealed');
        activeObserver.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return null;
};

export { whatsappUrl, emailUrl };
