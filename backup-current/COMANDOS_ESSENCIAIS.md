# 📋 Comandos Essenciais para os Projetos

## 🚀 **Inicialização e Setup**

### Instalar dependências
```bash
npm install
```
**O que faz:** Instala todos os pacotes do `package.json` baseado no `package-lock.json`

### Forçar reinstalação completa (sem cache)
```bash
npm install --force
```
**O que faz:** Ignora versões do `package-lock.json` e instala tudo do zero. Use quando há conflitos de dependências.

### Limpar cache do npm
```bash
npm cache clean --force
```
**O que faz:** Remove todo o cache local do npm. Use antes de reinstalar se tiver problemas de pacotes corrompidos.

---

## 🔧 **Desenvolvimento Local**

### Rodar servidor de desenvolvimento
```bash
npm run dev
```
**O que faz:** Inicia Vite em modo de desenvolvimento local (geralmente http://localhost:5173)

### Parar o servidor
```
Pressione Ctrl + C no terminal
```

### Abrir em nova aba do navegador
```bash
npm run dev -- --open
```
**O que faz:** Inicia o servidor e abre automaticamente no navegador padrão

---

## 🏗️ **Build e Produção**

### Gerar build otimizado
```bash
npm run build
```
**O que faz:** Compila código TypeScript/React para pasta `dist/` pronta para deploy

### Verificar erros de build sem gerar dist
```bash
npm run build 2>&1 | tee build.log
```
**O que faz:** Executa build e salva output em arquivo `build.log` para análise

---

## 🔥 **Firebase Hosting**

### Login no Firebase
```bash
firebase login
```
**O que faz:** Autentica sua conta Google para usar CLI do Firebase

### Reautenticar (se expirou)
```bash
firebase login --reauth
```
**O que faz:** Força nova autenticação mesmo se já estiver logado

### Ver projetos disponíveis
```bash
firebase projects:list
```
**O que faz:** Lista todos os projetos Firebase na sua conta Google

### Usar projeto específico como padrão
```bash
firebase use <project-id>
```
**Exemplo:**
```bash
firebase use motofix-ypoc
```

### Deploy para Hosting
```bash
firebase deploy --only hosting
```
**O que faz:** Faz deploy apenas da pasta `dist/` para Hosting

### Deploy para site específico (multi-site)
```bash
firebase deploy --only hosting:motofix-ypoc
```
**O que faz:** Faz deploy para o site nomeado `motofix-ypoc`

### Deploy com debug (mostra detalhes)
```bash
firebase deploy --only hosting --debug
```
**O que faz:** Deploy com logs detalhados - use se algo der errado

### Criar novo site no Hosting
```bash
firebase hosting:sites:create <site-id>
```
**Exemplo:**
```bash
firebase hosting:sites:create motofix-ypoc
```

### Aplicar alias a um site (para deploy seletivo)
```bash
firebase target:apply hosting <alias> <site-id>
```
**Exemplo:**
```bash
firebase target:apply hosting motofix-ypoc motofix-ypoc
```

### Ver status de deployments
```bash
firebase hosting:channels:list
```
**O que faz:** Mostra versões publicadas e datas dos deployments

---

## 🧹 **Limpeza e Troubleshooting**

### Limpar node_modules completamente
```bash
rmdir /s /q node_modules
del package-lock.json
npm install
```
**O que faz:** Remove tudo e reinstala do zero (Windows)

**Para Mac/Linux:**
```bash
rm -rf node_modules
rm package-lock.json
npm install
```

### Limpar cache do Vite
```bash
rmdir /s /q .vite
```
**O que faz:** Remove cache de build do Vite (Windows)

**Para Mac/Linux:**
```bash
rm -rf .vite
```

### Limpar dist e reconstruir
```bash
rmdir /s /q dist
npm run build
```
**O que faz:** Remove build anterior e cria nova (Windows)

**Para Mac/Linux:**
```bash
rm -rf dist
npm run build
```

---

## 📂 **Navegação entre Projetos**

### Ir para pasta do Gestor de Despesas
```bash
cd "c:\Controle finnanceiro app\gestor-de-despesas-recorrentes"
```

### Ir para pasta do MotoFix
```bash
cd "c:\M O T O F I X A P P\MotoFix-CORP"
```

### Abrir pasta no VS Code
```bash
code .
```
**O que faz:** Abre a pasta atual no VS Code

---

## 📊 **Verificações e Info**

### Ver versão do npm
```bash
npm --version
```
ou
```bash
npm -v
```

### Ver versão do Node.js
```bash
node --version
```
ou
```bash
node -v
```

### Ver configuração do npm
```bash
npm config list
```

### Ver qual projeto Firebase está ativo
```bash
firebase use
```
**O que faz:** Mostra qual projeto está configurado em `.firebaserc`

### Verificar se login Firebase está válido
```bash
firebase projects:list
```
**Se listar projetos = você está autenticado**

---

## 🔗 **Git (se converter para repositório)**

### Inicializar Git no projeto
```bash
git init
```

### Adicionar todos os arquivos
```bash
git add .
```

### Fazer commit
```bash
git commit -m "Mensagem descritiva"
```

### Ver status
```bash
git status
```

---

## ⚡ **Atalhos Rápidos (Combine comandos)**

### Build e Deploy (tudo junto)
```bash
npm run build && firebase deploy --only hosting
```
**O que faz:** Compila código e faz deploy em um comando só

### Limpar cache, instalar e rodar
```bash
npm cache clean --force && npm install && npm run dev
```
**O que faz:** Limpa cache, reinstala dependências e inicia servidor

### Limpar tudo e reconstruir do zero
```bash
rmdir /s /q node_modules dist .vite && del package-lock.json && npm install && npm run build
```
**O que faz:** Remove tudo que pode estar corrompido e reconstrói (Windows)

---

## 📌 **Ordem Recomendada quando há Problemas**

### 1️⃣ Problema leve (app não carrega)
```bash
npm cache clean --force
npm install
npm run dev
```

### 2️⃣ Problema médio (erros na build)
```bash
rmdir /s /q .vite dist
npm install
npm run build
```

### 3️⃣ Problema severo (nada funciona)
```bash
rmdir /s /q node_modules
del package-lock.json
npm cache clean --force
npm install
npm run build
firebase deploy --only hosting
```

### 4️⃣ Problema no Firebase
```bash
firebase logout
firebase login --reauth
firebase use motofix-ypoc
firebase deploy --only hosting --debug
```

---

## 🎯 **Checklist antes de Deploy**

- [ ] Rode `npm run build` e verifique se não há erros
- [ ] Verifique se `dist/` foi criado com arquivos
- [ ] Rode `firebase projects:list` e confirme projeto correto
- [ ] Rode `firebase deploy --only hosting --debug` para deploy com detalhes
- [ ] Acesse a URL publicada e teste funcionalidades principais

---

## 💡 **Dicas Importantes**

⚠️ **Nunca delete `package-lock.json` a menos que soubesse o que está fazendo** (lock file garante versões consistentes)

⚠️ **Se vir erro `module not found`, execute `npm install` novamente**

⚠️ **Se a build falhar mas o `npm run dev` funciona, pode ser problema de tipagem TypeScript - verifique erros em `src/`**

⚠️ **Para multi-site Firebase, SEMPRE use `firebase target:apply` antes do deploy com alias**

✅ **Sempre faça `npm run build` localmente antes de fazer deploy - assim você vê erros antes de publicar**
