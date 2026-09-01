import { ArrowLeft } from 'lucide-react';
import './LegalPage.css';

type LegalPageProps = {
  kind: 'privacy' | 'terms';
  onBack: () => void;
};

const content = {
  privacy: {
    eyebrow: 'Documento legal',
    title: 'Política de Privacidade',
    updated: 'Última atualização: 27 de agosto de 2026',
    sections: [
      ['1. Informações que coletamos', 'O MotoFix coleta as informações necessárias para oferecer seus recursos de gestão, como dados de cadastro da oficina, perfil do usuário, clientes, motos, serviços, agenda e registros financeiros inseridos pelo usuário. Também podemos coletar informações técnicas básicas para manter a segurança e o funcionamento da plataforma.'],
      ['2. Como usamos as informações', 'Usamos os dados para autenticar o acesso, disponibilizar as funcionalidades contratadas, salvar o histórico da oficina, melhorar a experiência, prestar suporte e enviar comunicações relacionadas ao serviço. Não vendemos dados pessoais.'],
      ['3. Compartilhamento e segurança', 'Os dados são armazenados em serviços de infraestrutura e autenticação com controles de acesso. O compartilhamento ocorre apenas quando necessário para operar a plataforma, cumprir obrigação legal ou proteger direitos. Nenhuma transmissão pela internet pode ser considerada absolutamente invulnerável.'],
      ['4. Dados de clientes da oficina', 'A oficina é responsável por inserir dados de seus próprios clientes e por utilizá-los de acordo com a legislação aplicável. O usuário deve ter uma base legal adequada para cadastrar e utilizar essas informações no MotoFix.'],
      ['5. Direitos do titular', 'O titular pode solicitar confirmação, acesso, correção, atualização ou exclusão de seus dados, observadas as obrigações legais e os registros necessários à segurança e à prestação do serviço.'],
      ['6. Contato', 'Para dúvidas ou solicitações sobre privacidade, fale conosco pelo e-mail boxmotorsoficial@gmail.com.'],
    ],
  },
  terms: {
    eyebrow: 'Documento legal',
    title: 'Termos de Uso',
    updated: 'Última atualização: 27 de agosto de 2026',
    sections: [
      ['1. Aceitação', 'Ao criar uma conta ou utilizar o MotoFix, você declara que leu e concorda com estes Termos de Uso. Caso não concorde com alguma condição, não utilize a plataforma.'],
      ['2. O serviço', 'O MotoFix oferece ferramentas para organização de oficinas de motos, incluindo clientes, serviços, agenda, retornos, financeiro, garantias e relatórios. Os recursos podem evoluir, ser ajustados ou receber atualizações para melhorar a plataforma.'],
      ['3. Conta e responsabilidade', 'O usuário deve fornecer informações verdadeiras, manter suas credenciais protegidas e utilizar a conta de acordo com a lei. Cada oficina é responsável pelos dados inseridos, pelos contatos realizados com seus clientes e pelas decisões tomadas a partir dos relatórios.'],
      ['4. Plano e pagamento', 'O Plano Fundador tem o preço e as condições apresentados no momento da contratação. Eventuais alterações futuras serão comunicadas previamente quando exigido. A implantação e o suporte seguem as condições informadas na oferta.'],
      ['5. Uso proibido', 'É proibido utilizar a plataforma para atividades ilegais, tentar acessar dados de terceiros, interferir no funcionamento do serviço, distribuir código malicioso ou violar direitos de outras pessoas.'],
      ['6. Suporte e contato', 'Para suporte, dúvidas ou solicitações comerciais, entre em contato pelo WhatsApp +55 69 9994-4024 ou pelo e-mail boxmotorsoficial@gmail.com.'],
    ],
  },
} as const;

export const LegalPage = ({ kind, onBack }: LegalPageProps) => {
  const page = content[kind];

  return (
    <div className="legal-page">
      <header className="legal-nav">
        <div className="legal-container">
          <button type="button" className="legal-back" onClick={onBack}><ArrowLeft /> Voltar para o MotoFix</button>
          <span className="legal-brand"><b>MF</b> MotoFix</span>
        </div>
      </header>
      <main className="legal-container legal-content">
        <p className="legal-eyebrow">{page.eyebrow}</p>
        <h1>{page.title}</h1>
        <p className="legal-updated">{page.updated}</p>
        <div className="legal-sections">
          {page.sections.map(([heading, text]) => <section key={heading}><h2>{heading}</h2><p>{text}</p></section>)}
        </div>
        <button type="button" className="legal-back legal-bottom-back" onClick={onBack}><ArrowLeft /> Voltar para a página inicial</button>
      </main>
    </div>
  );
};
