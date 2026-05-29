# Comandos Git rápidos — MotoFix

Este arquivo lista os comandos essenciais para adicionar, commitar e enviar mudanças ao GitHub sem precisar pedir ajuda toda hora.

> Observação: execute os comandos no diretório do projeto (`e:\app motofix\motofix2.0`).

1) Verificar status do repositório

```bash
git status
```

2) Adicionar todas as mudanças (staging)

```bash
git add .
```

3) Criar um commit com mensagem curta e descritiva

```bash
git commit -m "Mensagem clara sobre a mudança"
```

4) Enviar (push) para a branch remota atual

```bash
git push origin $(git rev-parse --abbrev-ref HEAD)
```

No PowerShell (Windows), use:

```powershell
git push origin (git rev-parse --abbrev-ref HEAD)
```

5) Se precisar criar e subir uma nova branch

```bash
git checkout -b minha-branch
git push -u origin minha-branch
```

6) Se houver conflitos ou o remoto tiver novos commits, traga as mudanças primeiro

```bash
git pull --rebase origin $(git rev-parse --abbrev-ref HEAD)
```

7) Configurar email e nome (local no repositório)

```bash
git config user.email "seu-email@example.com"
git config user.name "Seu Nome"
```

Para configurar globalmente (todas as máquinas/repos):

```bash
git config --global user.email "seu-email@example.com"
git config --global user.name "Seu Nome"
```

8) Se quiser guardar mudanças temporariamente

```bash
git stash push -m "WIP: descrição curta"
# recuperar
git stash pop
```

9) Ver histórico de commits recentes

```bash
git log --oneline --graph --decorate --all -n 30
```

10) Resumo rápido (passos que normalmente uso)

```bash
git status
# revisar
git add .
git commit -m "Resumo curto do que foi alterado"
git push origin $(git rev-parse --abbrev-ref HEAD)
```

Dica: se você usa HTTPS e pede credenciais com frequência, considere configurar um helper de credenciais ou usar SSH keys para autenticação sem prompts.

---
Arquivo gerado automaticamente para referência rápida.