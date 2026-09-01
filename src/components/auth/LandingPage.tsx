import { BarChart3, Calendar, Check, DollarSign, Users } from 'lucide-react';
import './LandingPage.css';

type LandingPageProps = {
  onLogin: () => void;
  onFounderPlan: () => void;
  onNavigate: (sectionId: string) => void;
  onOpenLegal: (kind: 'privacy' | 'terms') => void;
};

const whatsappUrl = 'https://wa.me/556999944024';
const founderWhatsAppUrl = `${whatsappUrl}?text=Ol%C3%A1%2C%20quero%20conhecer%20o%20Plano%20Fundador%20MotoFix.`;
const emailUrl = 'mailto:boxmotorsoficial@gmail.com';

const featureItems = [
  { icon: Calendar, title: 'Agenda Inteligente', description: 'Agendamentos, confirmações e lembretes por WhatsApp para reduzir faltas.' },
  { icon: DollarSign, title: 'Controle Financeiro', description: 'Receitas, despesas e fluxo de caixa em uma visão simples e atualizada.' },
  { icon: Users, title: 'Gestão de Clientes', description: 'Histórico de serviços, retornos, preferências e relacionamento com cada cliente.' },
  { icon: BarChart3, title: 'Relatórios Inteligentes', description: 'Informações objetivas para entender a operação e tomar decisões melhores.' },
];

const steps = [
  ['Cadastre sua oficina', 'Configure serviços, preços e equipe em poucos minutos.'],
  ['Organize sua agenda', 'Agende clientes e acompanhe confirmações e retornos.'],
  ['Controle o financeiro', 'Veja receitas, despesas e lucro sem depender de planilhas.'],
  ['Decida com dados', 'Acompanhe relatórios e encontre oportunidades de crescimento.'],
];

export const LandingPage = ({ onLogin, onFounderPlan, onNavigate, onOpenLegal }: LandingPageProps) => (
  <div className="landing-page">
    <header className="landing-nav">
      <div className="landing-container landing-nav-inner">
        <button type="button" className="landing-brand" onClick={() => onNavigate('top')}>
          <span className="landing-brand-mark">MF</span>
          <span>MotoFix<small>GESTÃO AUTOMOTIVA</small></span>
        </button>
        <nav className="landing-links" aria-label="Navegação principal">
          <button type="button" onClick={() => onNavigate('recursos')}>Recursos</button>
          <button type="button" onClick={() => onNavigate('como')}>Como funciona</button>
          <button type="button" onClick={() => onNavigate('planos')}>Planos</button>
          <button type="button" onClick={() => onNavigate('contato')}>Contato</button>
        </nav>
        <div className="landing-nav-actions">
          <button type="button" className="landing-login" onClick={onLogin}>Login</button>
          <button type="button" className="landing-primary" onClick={onFounderPlan}>Conheça o MotoFix</button>
        </div>
      </div>
    </header>

    <main id="top">
      <section className="landing-hero landing-container">
        <div className="landing-hero-grid">
          <div className="landing-fade">
            <p className="landing-label">Gestão para oficinas de motos</p>
            <h1>Sua oficina merece <em>mais</em> que planilhas.</h1>
            <p className="landing-lead">O MotoFix coloca agenda, clientes, serviços e financeiro no mesmo lugar — com uma rotina simples para você cuidar da oficina, não da papelada.</p>
            <div className="landing-actions">
              <button type="button" className="landing-primary landing-red" onClick={onFounderPlan}>Quero o Plano Fundador</button>
              <button type="button" className="landing-outline" onClick={onLogin}>Entrar no sistema</button>
            </div>
            <div className="landing-proof"><span><Check /> Dados seguros</span><span><Check /> Tudo em um só lugar</span><span><Check /> Mais tempo para você</span></div>
          </div>
          <DashboardPreview />
        </div>
      </section>

      <section className="landing-section landing-light" id="recursos">
        <div className="landing-container">
          <div className="landing-section-intro landing-fade"><p className="landing-label">O essencial, bem feito</p><h2>Tudo que sua oficina precisa para crescer.</h2><p>Sem dezenas de telas desnecessárias. O MotoFix concentra o que realmente importa para a operação diária.</p></div>
          <div className="landing-feature-grid">{featureItems.map(({ icon: Icon, title, description }, index) => <article className="landing-feature landing-fade" key={title}><span className="landing-number">0{index + 1}</span><Icon className="landing-feature-icon" /><h3>{title}</h3><p>{description}</p></article>)}</div>
        </div>
      </section>

      <section className="landing-section landing-dark" id="como">
        <div className="landing-container"><div className="landing-section-intro landing-fade"><p className="landing-label">Uma rotina mais simples</p><h2>Como o MotoFix funciona.</h2><p>Quatro etapas para colocar sua oficina em ordem sem complicar o trabalho da equipe.</p></div><div className="landing-steps">{steps.map(([title, description], index) => <article className="landing-step landing-fade" key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{description}</p></article>)}</div></div>
      </section>

      <section className="landing-section landing-light" id="planos"><div className="landing-container landing-pricing"><div className="landing-price-intro landing-fade"><p className="landing-price-note">Condição de lançamento</p><h2>Plano Fundador MotoFix.</h2><p>Entre como cliente fundador por <strong>R$ 49,90/mês</strong>, com implantação guiada, suporte pelo WhatsApp e acompanhamento nos primeiros 7 dias.</p><p>É a forma mais simples de começar a profissionalizar a gestão da sua oficina.</p></div><div className="landing-price-card landing-fade"><div className="landing-card-top"><span>PLANO FUNDADOR</span><b>LANÇAMENTO</b></div><div className="landing-price">R$ 49,90<small>/mês</small></div><p className="landing-price-desc">Tudo que você precisa para começar com o pé direito.</p><ul>{['Implantação guiada para sua oficina', 'Suporte pelo WhatsApp', 'Acompanhamento nos primeiros 7 dias', 'Controle de clientes, serviços, retornos e financeiro', 'Registro de garantias e histórico de motos'].map(item => <li key={item}><Check />{item}</li>)}</ul><button type="button" className="landing-primary landing-red landing-full" onClick={onFounderPlan}>Quero o Plano Fundador</button></div></div></section>

      <section className="landing-section"><div className="landing-container"><div className="landing-section-intro landing-fade"><p className="landing-label">Acompanhamento humano</p><h2>Você recebe o sistema. E ajuda para usar.</h2><p>O objetivo é fazer a plataforma se encaixar na rotina real da sua oficina.</p></div><div className="landing-support"><article className="landing-fade"><small>01 / Implantação</small><h3>Implantação guiada</h3><p>Configuramos o MotoFix com seus serviços, preços e primeiro fluxo de trabalho.</p></article><article className="landing-fade"><small>02 / Suporte</small><h3>Suporte pelo WhatsApp</h3><p>Fale com nossa equipe para tirar dúvidas e ajustar o sistema à rotina da oficina.</p></article></div></div></section>

      <section className="landing-cta" id="contato"><div className="landing-container"><div className="landing-cta-box landing-fade"><div><h2>Pronto para transformar sua oficina?</h2><p>Comece com uma consultoria gratuita. Nosso time está pronto para entender sua operação e mostrar como o MotoFix pode ajudar.</p></div><div className="landing-cta-actions"><button type="button" className="landing-primary landing-red" onClick={onFounderPlan}>Quero o Plano Fundador</button><button type="button" className="landing-outline" onClick={onLogin}>Já tenho conta - Entrar</button></div></div><div className="landing-contacts"><a className="landing-contact landing-fade" href={whatsappUrl}><small>WhatsApp</small><strong>+55 69 9994-4024</strong><span>Fale conosco em tempo real</span></a><a className="landing-contact landing-fade" href={emailUrl}><small>E-mail</small><strong>boxmotorsoficial@gmail.com</strong><span>Envie sua mensagem</span></a></div></div></section>
    </main>

    <footer className="landing-footer"><div className="landing-container"><span>MotoFix - GESTÃO AUTOMOTIVA</span><span>© 2026 MotoFix. Todos os direitos reservados.</span><span><button type="button" onClick={() => onOpenLegal('privacy')}>Privacidade</button> · <button type="button" onClick={() => onOpenLegal('terms')}>Termos de uso</button></span></div></footer>
    <a className="landing-whatsapp" href={founderWhatsAppUrl} aria-label="Falar com o MotoFix pelo WhatsApp">WhatsApp</a>
  </div>
);

const DashboardPreview = () => (
  <div className="landing-preview landing-fade"><div className="landing-browser"><div className="landing-browserbar"><i /><i /><i /><span>app.motofix.com.br / dashboard</span></div><div className="landing-app"><aside><strong>MotoFix</strong><span className="active">Visão geral</span><span>Agenda</span><span>Clientes</span><span>Serviços</span><span>Financeiro</span><span>Relatórios</span></aside><div className="landing-mainapp"><div className="landing-app-title"><h3>Visão geral</h3><span>quinta, 27 ago</span></div><div className="landing-stats"><div><small>Atendimentos hoje</small><strong>18</strong><em>+12%</em></div><div><small>Faturamento</small><strong>R$ 3.840</strong></div><div><small>Clientes ativos</small><strong>246</strong></div></div><div className="landing-panel"><b>Serviços da semana</b>{['Revisão', 'Óleo', 'Freios', 'Elétrica'].map((label, index) => <span key={label}><small>{label}</small><i><em style={{ width: `${82 - index * 16}%` }} /></i></span>)}</div><div className="landing-panel"><b>Próximos atendimentos</b>{['João Silva - Revisão 14:30', 'Maria Costa - Alinhamento 15:45', 'Carlos Lima - Troca de óleo 16:30'].map(item => <span className="landing-appointment" key={item}>{item}</span>)}</div></div></div></div></div>
);

export { whatsappUrl, emailUrl };
