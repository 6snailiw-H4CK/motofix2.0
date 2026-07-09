# Plano de vendas online do MotoFix

## 1. Diagnostico rapido do produto

O MotoFix e um SaaS para oficinas de motocicletas. A proposta principal nao deve ser "sistema de gestao" generico. A proposta de venda mais forte e:

> MotoFix ajuda oficinas de moto a organizar clientes, servicos, retornos e financeiro para vender mais recorrencia e parar de depender de agenda em papel ou planilha.

Principais beneficios vendaveis:

- Clientes voltam mais porque a oficina sabe quem precisa ser chamado.
- O dono enxerga receita, despesas, lucro e pendencias.
- Historico de cliente, moto, garantia e servicos fica centralizado.
- WhatsApp vira canal de retorno, cobranca e relacionamento.
- A oficina ganha organizacao sem precisar de ERP pesado.

Pontos de atencao antes de escalar anuncios:

- A landing foi ajustada para o `Plano Fundador R$ 49,90/mes`. Manter checkout, Payment Links, scripts de venda e anuncios com o mesmo preco enquanto a oferta estiver ativa.
- A landing usa provas como "500+ oficinas", "120 oficinas", "38%" e casos com nomes genericos. Se esses numeros nao forem reais, trocar por textos honestos: "em fase de implantacao", "feito para oficinas de moto", "consultoria gratuita".
- Confirmar se pagamento Stripe ativa usuario automaticamente em producao. Enquanto isso, vender por WhatsApp e ativar pelo painel admin.
- Trocar dominio `motofix-2-local.web.app` por dominio comercial proprio.

## 2. Oferta recomendada

Comecar com venda consultiva, nao self-service puro.

Oferta de entrada:

- "Implantacao guiada do MotoFix para oficinas de moto"
- 7 dias de teste com acompanhamento
- Configuracao inicial com servicos, precos e primeiros clientes
- Suporte por WhatsApp

Precos sugeridos para validar mercado:

- Plano Validacao: R$ 49,90/mes por 30 a 60 dias apenas para os primeiros clientes beta.
- Plano Essencial: R$ 97 ou R$ 149/mes, 1 usuario, clientes e servicos.
- Plano Pro: R$ 199 ou R$ 299/mes, financeiro, relatorios, garantias, importacao, suporte prioritario.

Regra pratica: se o app ainda exige ativacao manual, venda o "Plano Fundador" por WhatsApp. Quando o checkout estiver redondo, colocar checkout direto.

## 3. Infraestrutura comercial obrigatoria

### 3.1 Dominio e site

Comprar um dominio curto:

- `motofix.com.br`
- `motofixapp.com.br`
- `sistemamotofix.com.br`
- `oficinamotofix.com.br`

Onde comprar:

- Registro.br: https://registro.br
- GoDaddy: https://godaddy.com
- Cloudflare Registrar: https://cloudflare.com/products/registrar/

Conectar no Firebase:

1. Entrar em https://console.firebase.google.com
2. Abrir projeto `motofix-2-local`
3. Ir em Hosting
4. Clicar em "Adicionar dominio personalizado"
5. Informar `motofix.com.br` e `www.motofix.com.br`
6. Copiar os registros TXT/A/CNAME que o Firebase indicar
7. Entrar no painel DNS do dominio
8. Adicionar os registros
9. Esperar SSL ficar como conectado

Estrutura recomendada:

- `motofix.com.br`: landing publica
- `app.motofix.com.br`: login do sistema
- `motofix.com.br/demo`: pagina ou CTA direto para WhatsApp

### 3.2 E-mail profissional

Criar:

- `contato@motofix.com.br`
- `suporte@motofix.com.br`
- `vendas@motofix.com.br`

Opcoes:

- Google Workspace: https://workspace.google.com
- Zoho Mail: https://zoho.com/mail
- Cloudflare Email Routing: https://developers.cloudflare.com/email-routing/

### 3.3 WhatsApp Business

Entrar em:

- WhatsApp Business: https://www.whatsapp.com/business/

Configurar:

- Nome: MotoFix
- Categoria: Software / Servico comercial
- Descricao: "Sistema online para oficinas de moto controlarem clientes, servicos, retornos, garantias e financeiro."
- Link curto: `wa.me/556999944024`
- Catalogo com 2 produtos:
  - MotoFix Essencial
  - MotoFix Pro
- Mensagem de saudacao:
  - "Ola! Sou do MotoFix. Me diga o nome da sua oficina e qual hoje e sua maior dificuldade: agenda, clientes que nao voltam, financeiro ou cobrancas?"
- Respostas rapidas:
  - `/preco`: "O Plano Fundador MotoFix esta R$ 49,90/mes, com implantacao guiada e acompanhamento inicial. Antes de te passar o melhor caminho, quero entender o tamanho da sua oficina."
  - `/demo`: "Posso te mostrar uma demo rapida pelo WhatsApp. Voce prefere ver agora ou agendar um horario?"
  - `/implantacao`: "A implantacao e guiada: configuramos servicos, primeiros clientes e fluxo de retorno com voce."

### 3.4 Instagram e Facebook

Usar o Instagram atual:

- https://instagram.com/motofix_recorrentes

Criar ou revisar pagina no Facebook:

- https://www.facebook.com/pages/create

Entrar no Meta Business:

- https://business.facebook.com

Fazer:

1. Criar Business Manager
2. Adicionar pagina Facebook
3. Conectar Instagram
4. Adicionar WhatsApp
5. Criar conta de anuncios
6. Adicionar forma de pagamento
7. Instalar Pixel Meta na landing
8. Criar eventos: `ViewContent`, `Lead`, `Contact`, `CompleteRegistration`, `Purchase`

### 3.5 Google

Google Business Profile:

- https://www.google.com/business/

Mesmo sendo SaaS, criar perfil como empresa de software/servicos, com area de atendimento online. Usar fotos reais do app, logo, telefone, site, posts semanais e link para WhatsApp.

Google Analytics:

- https://analytics.google.com

Configurar:

- Propriedade GA4
- Fluxo Web para o dominio
- Eventos:
  - clique WhatsApp
  - clique demo
  - login
  - inicio checkout
  - pagamento aprovado

Google Tag Manager:

- https://tagmanager.google.com

Colocar no app para gerenciar:

- GA4
- Google Ads conversion tag
- Meta Pixel
- TikTok Pixel, se usar TikTok

Google Ads:

- https://ads.google.com

Comecar apenas depois que GA4 e conversoes estiverem funcionando.

### 3.6 Stripe e pagamento

Stripe:

- https://dashboard.stripe.com

Fazer:

1. Confirmar conta de producao verificada
2. Criar produtos e precos iguais aos da landing
3. Ativar metodos relevantes para Brasil: cartao, Pix se disponivel na conta, boleto se fizer sentido
4. Configurar webhook publico HTTPS:
   - `https://SEU_BACKEND/api/payments/webhook`
5. Testar evento `payment_intent.succeeded`
6. Confirmar se usuario fica ativo no Firestore por 30 dias
7. Testar renovacao e assinatura expirada

Atalho se o checkout do app ainda nao estiver pronto:

- Criar Stripe Payment Links e vender por WhatsApp.
- Depois do pagamento, ativar manualmente no admin.
- Isso permite vender enquanto a automacao e finalizada.

## 4. Funil de vendas recomendado

### Funil principal

1. Anuncio ou conteudo chama a dor:
   - "Sua oficina perde retorno porque nao lembra de chamar o cliente?"
2. Lead clica para WhatsApp.
3. Vendedor faz diagnostico em 4 perguntas.
4. Envia video curto ou faz demo ao vivo.
5. Oferece implantacao guiada.
6. Cliente paga ou entra em teste.
7. Time acompanha os primeiros 7 dias.
8. Depois cobra assinatura mensal.

### Perguntas de qualificacao

1. Qual o nome da oficina e cidade?
2. Quantos servicos voces fazem por semana?
3. Hoje voces controlam clientes e retornos onde: caderno, planilha, WhatsApp ou sistema?
4. O que mais doi hoje: agenda, cobranca, cliente que some, financeiro ou garantia?
5. Quem decide contratar o sistema?

### Script de fechamento

"Pelo que voce me falou, o maior ganho do MotoFix para sua oficina e nao deixar cliente sumir depois do servico. A gente configura seus servicos, cadastra os primeiros clientes e te mostra como chamar retorno pelo WhatsApp. Posso liberar seu acesso hoje no Plano Fundador por R$ 49,90/mes e acompanhar sua primeira semana."

## 5. Canais para vender

### Canal 1: WhatsApp direto

Prioridade maxima. E o canal natural para dono de oficina.

Fazer todos os dias:

- Montar lista de 30 oficinas por cidade pelo Google Maps e Instagram.
- Mandar mensagem curta, sem parecer spam.
- Oferecer demo, nao preco direto.

Mensagem fria:

"Ola, tudo bem? Vi a oficina de voces aqui no Instagram/Google. Eu sou do MotoFix, um sistema simples para oficina de moto controlar clientes, servicos, retornos e financeiro. Hoje voces controlam os retornos dos clientes por caderno, planilha ou WhatsApp?"

Se responder:

"Entendi. O ponto que mais ajudamos e lembrar quais clientes precisam voltar e organizar o financeiro do servico. Posso te mandar um video de 40 segundos mostrando como funciona?"

### Canal 2: Instagram Reels

Postar 1 a 2 videos por dia por 30 dias.

Temas:

- "3 sinais de que sua oficina esta perdendo dinheiro sem perceber"
- "Como chamar cliente para retorno sem parecer insistente"
- "Caderno de oficina funciona ate o dia que o cliente some"
- "Voce sabe quanto sua oficina lucrou este mes?"
- "Como organizar garantia de servico de moto"

Formato:

- 7 a 20 segundos
- Mostrar tela real do app
- Narração direta
- CTA: "Comente MOTO que eu te mando a demo"

### Canal 3: Meta Ads

Objetivo inicial:

- Campanha de mensagens para WhatsApp

Publico:

- Brasil, depois testar por estados
- Interesses: motocicletas, oficina mecanica, mecanico de moto, pecas de moto, Honda, Yamaha, delivery, motoboy, empreendedorismo, pequenas empresas
- Idade: 24 a 55
- Posicionamentos: Instagram Reels, Stories, Feed, Facebook Feed

Orcamento:

- Teste: R$ 30/dia por 7 dias
- 3 conjuntos de anuncios
- 3 criativos por conjunto
- Pausar criativos com custo por conversa muito alto

### Canal 4: Google Ads

Usar quando a landing e conversoes estiverem prontas.

Campanha Search:

- "sistema para oficina de moto"
- "software para oficina mecanica"
- "sistema para oficina"
- "controle de oficina de moto"
- "programa para oficina mecanica"
- "agenda para oficina mecanica"
- "sistema ordem de servico oficina"

Anuncio:

Titulo 1: Sistema para Oficina de Moto
Titulo 2: Controle Clientes e Servicos
Titulo 3: Teste o MotoFix Online
Descricao: Organize agenda, clientes, retornos, garantias e financeiro da sua oficina. Fale no WhatsApp e veja uma demo gratuita.

### Canal 5: Google Maps e prospeccao local

Entrar em https://maps.google.com e pesquisar:

- "oficina de moto Manaus"
- "oficina de moto Porto Velho"
- "oficina de moto Rio Branco"
- "oficina de moto Boa Vista"
- "mecanica de motos"

Criar planilha com:

- nome
- cidade
- WhatsApp
- Instagram
- responsavel
- status
- data do contato
- retorno

Meta diaria:

- 30 novos contatos
- 10 respostas
- 3 demos
- 1 fechamento ou teste iniciado

### Canal 6: Marketplaces e diretorios SaaS

Depois de ter 3 a 5 clientes reais e depoimentos:

- Capterra: https://www.capterra.com/vendors/
- Product Hunt: https://www.producthunt.com/launch
- AlternativeTo: https://alternativeto.net
- SaaSHub: https://www.saashub.com
- BetaList: https://betalist.com

Objetivo aqui nao e vender oficina pequena imediatamente. E gerar autoridade, backlink e prova.

### Canal 7: Parcerias

Procurar:

- lojas de pecas de moto
- distribuidores
- consultores de oficina
- contadores que atendem oficinas
- cursos de mecanica de moto
- influenciadores pequenos do nicho moto/oficina

Oferta para parceiro:

- 20% da primeira mensalidade por indicacao
- ou 10% recorrente por 6 meses

## 6. Ideias de anuncios

### Anuncio 1: Dor do retorno

Video:

- Cena: tela do app mostrando clientes para contatar hoje.
- Texto na tela: "Quantos clientes sua oficina esqueceu de chamar esse mes?"
- Narração: "Troca de oleo, revisao, garantia, retorno. Se esta tudo no caderno, dinheiro esta ficando pra tras. O MotoFix mostra quem precisa voltar e abre o WhatsApp do cliente em segundos."
- CTA: "Veja a demo no WhatsApp"

### Anuncio 2: Financeiro

Texto:

"Sua oficina vende, mas voce nao sabe quanto sobrou?"

Descricao:

"O MotoFix organiza servicos, gastos, pendencias e lucro em um painel simples. Feito para oficina de moto que quer parar de depender de planilha."

CTA:

"Falar com especialista"

### Anuncio 3: Antes e depois

Criativo dividido:

- Antes: caderno, WhatsApp perdido, cliente sem retorno.
- Depois: agenda, clientes, financeiro e alertas.

Copy:

"Nao e falta de cliente. E falta de controle para trazer o cliente de volta."

### Anuncio 4: Oferta direta

Copy:

"Sistema online para oficina de moto. Controle clientes, motos, servicos, garantias, retornos e financeiro em um so lugar. Implantacao guiada e suporte por WhatsApp."

CTA:

"Agendar demo gratuita"

### Anuncio 5: Dono sem tempo

Copy:

"Dono de oficina nao tem tempo para preencher sistema complicado. O MotoFix foi feito para registrar servico rapido e mostrar o que precisa ser feito hoje."

CTA:

"Quero ver funcionando"

### Anuncio 6: Garantia e OS

Copy:

"Pare de perder historico de servico. Gere garantia, registre manutencoes e encontre tudo pelo cliente ou pela moto."

CTA:

"Receber demo"

## 7. Conteudo organico para 30 dias

Semana 1: dores

- Dia 1: "Cliente nao volta porque voce nao chama"
- Dia 2: "O perigo de controlar oficina so no WhatsApp"
- Dia 3: "Como saber quem esta devendo"
- Dia 4: "Quanto custa esquecer um retorno?"
- Dia 5: "Agenda em papel vs agenda online"

Semana 2: demonstracao

- Dia 6: cadastrar cliente
- Dia 7: registrar servico
- Dia 8: ver retorno previsto
- Dia 9: abrir WhatsApp do cliente
- Dia 10: ver dashboard financeiro

Semana 3: autoridade

- Dia 11: dicas para oficina vender mais retorno
- Dia 12: como organizar garantia
- Dia 13: como cobrar pendencia sem constrangimento
- Dia 14: como medir lucro real
- Dia 15: erros que fazem oficina perder cliente

Semana 4: venda

- Dia 16: convite para demo
- Dia 17: oferta plano fundador
- Dia 18: bastidores do app
- Dia 19: depoimento/print autorizado
- Dia 20: comparativo caderno x MotoFix

Repetir os melhores temas com novos ganchos.

## 8. Pagina de vendas: ajustes recomendados

Hero:

- Titulo: "Sistema online para oficina de moto vender mais retornos e controlar o financeiro"
- Subtitulo: "Organize clientes, servicos, garantias, agenda e cobrancas em um painel simples, com atendimento pelo WhatsApp."
- CTA principal: "Ver demo no WhatsApp"
- CTA secundario: "Acessar minha conta"

Secoes essenciais:

- Dor: "Sua oficina esta perdendo retorno?"
- Solucao: clientes, servicos, financeiro, garantias, WhatsApp
- Como funciona: cadastrar, registrar, acompanhar, chamar cliente
- Demo visual: prints reais do app
- Planos: preco consistente com checkout
- FAQ:
  - Precisa instalar?
  - Funciona no celular?
  - Tem suporte?
  - Da para importar clientes?
  - Como cancela?
  - Como funciona pagamento?
- CTA final para WhatsApp

Remover ou ajustar:

- Numeros que nao forem comprovados
- Depoimentos ficticios
- Promessas percentuais sem base real
- "Prioridade 24/7" se nao houver suporte 24/7

## 9. Metas e indicadores

Primeiros 30 dias:

- 600 oficinas prospectadas manualmente
- 60 conversas qualificadas
- 20 demos
- 5 clientes beta pagos ou pilotos
- Custo por conversa Meta Ads abaixo de R$ 12
- Taxa de demo para teste acima de 30%
- Taxa de teste para pagamento acima de 25%

Indicadores semanais:

- visitas na landing
- cliques no WhatsApp
- conversas iniciadas
- demos agendadas
- demos realizadas
- testes iniciados
- pagamentos
- cancelamentos
- motivos de perda

## 10. Plano de acao de 30 dias

### Dias 1 a 3

- Definir preco unico.
- Corrigir landing.
- Comprar dominio.
- Conectar dominio ao Firebase.
- Criar e-mails profissionais.
- Configurar WhatsApp Business.
- Criar planilha CRM simples.

### Dias 4 a 7

- Configurar GA4, Tag Manager e Pixel.
- Testar todos os CTAs.
- Testar pagamento ou Payment Link.
- Gravar 5 videos curtos mostrando o app.
- Montar lista inicial de 150 oficinas.

### Semana 2

- Fazer 30 contatos por dia.
- Postar 1 Reel por dia.
- Fazer 5 a 10 demos.
- Coletar objecoes reais.
- Ajustar copy da landing com base nas conversas.

### Semana 3

- Iniciar Meta Ads com R$ 30/dia.
- Testar 6 criativos.
- Continuar prospeccao manual.
- Fechar 2 a 3 clientes piloto.
- Pedir depoimento dos primeiros usuarios.

### Semana 4

- Pausar anuncios ruins.
- Duplicar os melhores.
- Criar campanha Google Search pequena.
- Criar pagina de caso/depoimento.
- Listar MotoFix em diretorios.
- Criar programa de indicacao.

## 11. Ordem de prioridade

1. Corrigir preco e promessa da landing.
2. Garantir pagamento/ativacao.
3. Configurar WhatsApp Business.
4. Conectar dominio profissional.
5. Instalar tracking.
6. Prospectar manualmente.
7. Rodar Meta Ads para WhatsApp.
8. Rodar Google Ads Search.
9. Buscar parcerias.
10. Entrar em diretorios/marketplaces.

## 12. Frase central da marca

"MotoFix e o sistema simples para oficina de moto controlar servicos, clientes e retornos sem depender de caderno, planilha ou mensagens perdidas no WhatsApp."
