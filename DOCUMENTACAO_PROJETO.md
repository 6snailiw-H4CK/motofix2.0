# Documentação do Projeto MotoFix-CORP

## Visão Geral
MotoFix-CORP é um aplicativo web de gestão automotiva para oficinas, construído com React, TypeScript, Vite e Firebase. A interface atual inclui uma landing page com parallax e animações de rolagem, uma área de login, e uma página de vendas / apresentação do produto.

## Objetivo do Projeto
- Criar um landing page moderno e atraente para o MotoFix.
- Destacar recursos, planos e contatos com animações e conteúdo de marketing.
- Manter o menu de login e demo sempre visível e acessível.
- Implementar efeitos de parallax e revelação de seções no scroll.
- Integrar com Firebase para autenticação e controle de dados.

## Estrutura Principal
- `src/App.tsx`: componente principal da aplicação, incluindo o AuthScreen, navegação e seções do landing page.
- `src/index.css`: estilos globais e regras CSS para parallax, animações e tema escuro/claro.
- `src/main.tsx`: ponto de entrada do React.
- `src/firebase.ts`: configuração do Firebase.
- `src/types.ts`: tipagens TypeScript.
- `src/components/`: componentes reutilizáveis como `OilSelector` e formulários.
- `src/services/`: serviços auxiliares, incluindo `alertService.ts` e `stripeService.ts`.
- `public/`: ativos públicos como `manifest.json`, `robots.txt` e `sw.js`.

## Dependências Principais
- React
- TypeScript
- Vite
- Tailwind CSS
- Firebase
- Phosphor React Icons

## Como Executar Localmente
1. Instale as dependências:
   ```bash
   npm install
   ```
2. Inicie a aplicação:
   ```bash
   npm run dev
   ```
3. Abra `http://localhost:5173` no navegador.

## Estado Atual do Projeto
- A interface de landing page foi atualizada com:
  - hero dark com texto chamativo.
  - CTA de `Login` e `Conheça o MotoFix`.
  - cartões de métricas e seções descritivas.
  - parallax de camadas e animações de revelação ao scroll.
- Menu fixo no topo e barra inferior móvel com ações de login/demo.
- O backup atual do projeto foi criado em `backup-current/`.

## Backups e Cópias
- Backup atual criado em `backup-current/` na raiz do projeto.
- A cópia exclui pastas geradas/desnecessárias: `node_modules`, `dist`, `.git` e `.firebase`.

## Pontos Importantes para Continuação
- Refine as animações de scroll para ficar mais próximo do site de referência `drakedesign.work`.
- Ajustar responsividade mobile para garantir fidelidade ao layout do print.
- Melhorar a transição e profundidade das camadas de parallax.
- Expandir o conteúdo de vendas nas seções principais com textos e títulos otimizados.

## Observações de Implementação
- A classe `.parallax-layer` em `src/index.css` controla a transformação com `--scroll-offset`.
- O `IntersectionObserver` aplica `.revealed` nos elementos com `.scroll-reveal`.
- `AuthScreen` contém a lógica de navegação entre landing, login e sales.

## Próximos Passos Recomendados
1. Validar visualmente o comportamento de parallax em desktop e mobile.
2. Ajustar a velocidade de cada camada de parallax (`--parallax-speed`).
3. Refinar as animações de entrada nas seções com delays mais graduais.
4. Consolidar copy e layout para espelhar a referência de design.

---

## Contato e Links Úteis
- WhatsApp de vendas atual: `https://wa.me/556999944024`
- Email comercial: `boxmotorsoficial@gmail.com`
