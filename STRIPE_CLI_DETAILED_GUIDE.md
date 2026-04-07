# 🎯 Guia SUPER Detalhado - Instalar e Usar Stripe CLI

## ⚠️ O que aconteceu?

Você tentou `choco install stripe` e teve erro. Isso é normal se você não tem **Chocolatey** instalado.

**Vamos usar a forma mais simples: Download direto!**

---

## 📥 PASSO 1: Baixar Stripe CLI

### A. Ir ao Site Oficial

1. Abra seu navegador
2. Acesse: **https://stripe.com/docs/stripe-cli**
3. Procure por **"Download"** na página
4. Veja um botão ou link para **"Windows"**

### B. Download Direto (Mais Fácil)

Clique aqui para baixar diretamente:
```
https://downloads.stripe.com/stripe_cli/releases/latest/stripe_cli_latest_windows_x86_64.zip
```

Um arquivo chamado `stripe_cli_latest_windows_x86_64.zip` vai baixar.

---

## 📂 PASSO 2: Extrair o Arquivo

### A. Procure o arquivo baixado
1. Vá para sua **pasta de Downloads** (geralmente `C:\Users\[seu-nome]\Downloads`)
2. Procure por: `stripe_cli_latest_windows_x86_64.zip`
3. **Clique com botão direito nele**

### B. Extrair
4. Selecione: **"Extrair tudo..."** (ou "Extract All")
5. Uma janela vai abrir perguntando aonde extrair
6. Deixe como está (Downloads) e clique **"Extrair"**

### C. Pronto!
Você verá uma pasta: `stripe_cli_latest_windows_x86_64` (ou similar) na sua pasta Downloads.

Dentro dela, procure por um arquivo chamado:
```
stripe.exe
```

---

## 🎯 PASSO 3: Mover stripe.exe para Local Acessível

### Opção A: Adicionar ao PATH (Mais Fácil)

**Vamos fazer Stripe estar disponível em qualquer terminal.**

#### 3A.1 - Criar pasta para Stripe

1. Abra **Explorador de Arquivos** (Windows Explorer)
2. Vá até: `C:\Program Files`
3. **Clique com botão direito** em um espaço vazio
4. Selecione: **"Novo"** → **"Pasta"**
5. Digite o nome: `stripe`
6. Pressione **Enter**

Pronto! Você criou: `C:\Program Files\stripe`

#### 3A.2 - Copiar stripe.exe para lá

1. Vá para sua pasta **Downloads**
2. Abra a pasta `stripe_cli_latest_windows_x86_64`
3. Procure por `stripe.exe` 
4. **Clique com botão direito** nele
5. Selecione: **"Copiar"** (Copy)
6. Vá até: `C:\Program Files\stripe`
7. **Clique com botão direito** em um espaço vazio
8. Selecione: **"Colar"** (Paste)

Pronto! `stripe.exe` está em: `C:\Program Files\stripe\stripe.exe`

#### 3A.3 - Adicionar ao PATH (Sistema)

Agora vamos avisar ao Windows aonde encontrar `stripe`:

1. Pressione **Windows + X** no seu teclado
2. Selecione: **"Sistema"** ou **"System"**
3. Vá até: **"Variáveis de ambiente"** (ou search para "environment variables")
4. Clique em: **"Variáveis de ambiente..."**
5. Uma janela escura vai abrir
6. Na parte inferior, veja **"Variáveis do sistema"** (System variables)
7. Procure por uma com nome: **"Path"**
8. **Clique nela uma vez** para selecionar
9. Clique em: **"Editar..."** (Edit)
10. Uma nova janela abre
11. Clique em: **"Novo"** (New)
12. Digite: `C:\Program Files\stripe`
13. Clique em **"OK"** em cada janela
14. **Feche e abra um terminal novo** (isso é importante!)

---

## 🔐 PASSO 4: Fazer Login no Stripe CLI

### A. Abra um Terminal NOVO

1. Pressione **Windows + R**
2. Digite: `powershell`
3. Pressione **Enter**

Um terminal preto vai abrir.

### B. Fazer Login

No terminal, digite:

```powershell
stripe login
```

Pressione **Enter**.

Você vai ver algo como:

```
Your pairing code is: pc_1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P

The Stripe CLI requires your permission to read API keys from your Stripe account.

Please log in to your Stripe account by visiting the following URL:
https://dashboard.stripe.com/stripecli/confirm_auth?t=...

Press Enter to open the browser login automatically.
```

### C. Abrir o Navegador

Pressione **Enter**.

Seu navegador vai abrir uma página do Stripe pedindo confirmação.

### D. Confirmar

1. Clique em **"Confirm"** (Confirmar) ou similar
2. Você volta ao terminal
3. Deve aparecer: ✅ `Done! Your API key...`

---

## 🎧 PASSO 5: Ouvir Webhooks Localmente

### A. Abra UM TERMINAL NOVO (não feche o anterior!)

1. Pressione **Windows + R**
2. Digite: `powershell`
3. Pressione **Enter**

Um **NOVO terminal** (segunda janela) vai abrir.

### B. Navegar para seu Projeto

No novo terminal, digite:

```powershell
cd "C:\M O T O F I X A P P\MotoFix-Manager-main"
```

Pressione **Enter**.

Você deve ver:
```
C:\M O T O F I X A P P\MotoFix-Manager-main>
```

### C. Iniciar o Listener

Agora digite:

```powershell
stripe listen --forward-to localhost:3001/api/payments/webhook
```

Pressione **Enter**.

Você vai ver algo como:

```
> Getting ready...
> Ready! Your webhook signing secret is: whsec_test_1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P
>
> Forwarding to http://localhost:3001/api/payments/webhook
>
> Ready to receive Stripe events!
```

**🎉 PERFEITO!**

---

## 💾 PASSO 6: Copiar o Webhook Secret

### A. Copiar a Chave

Você vê a linha:
```
whsec_test_1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P
```

**Clique com o botão direito** nela no terminal e selecione **"Copiar"** (Copy).

Ou use Ctrl+C se conseguir selecionar no terminal.

### B. Guardar em Lugar Seguro

**Crie um arquivo de texto** (Notepad) e cole lá:
```
whsec_test_1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P
```

Salve como `webhook_secret.txt` temporariamente.

---

## 📝 PASSO 7: Adicionar ao `.env.local`

### A. Abrir VS Code

1. Abra **VS Code**
2. Abra a pasta do seu projeto
3. Procure por (ou crie) o arquivo: `.env.local`
4. Se não existir:
   - Clique com botão direito na pasta raiz
   - **"Novo Arquivo"**
   - Nomeie: `.env.local`

### B. Adicionar o Webhook Secret

Cole EXATAMENTE isto no arquivo:

```env
STRIPE_PUBLISHABLE_KEY=pk_test_seu_valor_aqui
STRIPE_SECRET_KEY=sk_test_seu_valor_aqui
STRIPE_WEBHOOK_SECRET=whsec_test_1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P
STRIPE_PRICE_ID=price_seu_valor_aqui
VITE_FIREBASE_API_KEY=sua_api_key
VITE_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu-projeto
VITE_FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=seu_numero
VITE_FIREBASE_APP_ID=seu_app_id
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
PORT=3001
VITE_STRIPE_API_URL=http://localhost:3001
NODE_ENV=development
```

(Substitua os valores com leurs, mantendo `whsec_test_...` do seu webhook)

### C. Salvar

Pressione **Ctrl+S** para salvar.

---

## 🚀 PASSO 8: Executar a Aplicação

### A. Terminal #3 (Novo)

1. Abra **UM TERCEIRO TERMINAL**
2. Digite:
```powershell
cd "C:\M O T O F I X A P P\MotoFix-Manager-main"
```
3. Pressione **Enter**

### B. Iniciar Servidor Local

Digite:

```powershell
npm run dev
```

Pressione **Enter**.

Você vai ver:
```
> VITE v6.4.1  ...
> ➜  Local:   http://localhost:5173/
```

---

## 📊 Checkup Final

Você deve ter **3 TERMINAIS ABERTOS**:

| Terminal | Comando | Status |
|----------|---------|--------|
| #1 | `stripe login` | ✅ Logado |
| #2 | `stripe listen --forward-to localhost:3001/api/payments/webhook` | ✅ Ouvindo webhooks |
| #3 | `npm run dev` | ✅ App rodando |

Se tudo está assim, você está pronto para testar!

---

## 🧪 PASSO 9: Testar Pagamento

### A. Abrir Aplicação

1. Abra seu navegador
2. Vá para: `http://localhost:5173`

### B. Fazer Login

1. Clique em **"Entrar com Google"**
2. Faça login com sua conta Google

### C. Clicar em "Pagar agora com PIX ou Cartão"

1. Você deve ver a **tela de Checkout**
2. Clique em **"Pagar agora com PIX ou Cartão"**

### D. Usar Cartão de Teste

Stripe vai mostrar um formulário:

```
Número: 4242 4242 4242 4242
Data: Qualquer data futura (ex: 12/25)
CVC: Qualquer 3 dígitos (ex: 123)
```

Clique em **"Pagar"** ou **"Complete Payment"**

---

## ✅ Se Tudo Funcionar

Você vai ver:
1. ✅ Pagamento processado no formulário Stripe
2. ✅ No Terminal #2, vê evento recebido
3. ✅ Firestore atualizado com `subscription.status = "active"`
4. ✅ Redirecionado para Dashboard

---

## 🆘 Se Algo Dar Erro

### ❌ "stripe is not recognized"
**Solução**: 
- Você adicionou ao PATH? 
- Fechou e abriu terminal novo?
- Reinicie o PC

### ❌ "Port 3001 already in use"
**Solução**:
- Mude a porta no `.env.local`: `PORT=3002`
- Ou mate o processo: dirija-se ao terminal e pressione Ctrl+C

### ❌ "Webhook not received"
**Solução**:
- Terminal #2 está rodando `stripe listen`?
- `STRIPE_WEBHOOK_SECRET` está correto em `.env.local`?
- Servidor (npm run dev) reiniciado após adicionar ao `.env`?

### ❌ "Cannot find module 'stripe'"
**Solução**:
```powershell
npm install stripe
```

---

## 📞 Próximo Passo

Quando conseguir fazer os 3 terminais rodar:

1. ✅ Terminal #1: `stripe login` (logado)
2. ✅ Terminal #2: `stripe listen` (ouvindo)
3. ✅ Terminal #3: `npm run dev` (app rodando)

**Me avisa que conseguiu!** Aí testamos o pagamento de verdade! 🎉

---

**Você consegue fazer todos esses passos? Se travar em algum, me avisa EXATAMENTE em qual!** 💪

