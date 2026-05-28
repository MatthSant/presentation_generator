# Setup — Analytics Workspace

Guia para configurar o workspace do zero em um computador novo.  
Feito para quem não tem experiência técnica — siga os passos na ordem.

---

## O que você vai instalar

| Ferramenta | Para que serve |
|---|---|
| **Git** | Baixar e atualizar o projeto do GitHub |
| **Node.js** | Rodar o app de relatórios |
| **Python 3** | Rodar as análises de LTV |
| **Claude Code** | A ferramenta que executa tudo |

---

## Passo 1 — Instalar o Git

1. Acesse: **https://git-scm.com/download/win**
2. Baixe o instalador (botão azul grande)
3. Execute o instalador com todas as opções padrão — só clique **Next** até o final
4. Ao terminar, abra o menu Iniciar e procure **"Git Bash"** — se aparecer, instalou certo

---

## Passo 2 — Instalar o Node.js

1. Acesse: **https://nodejs.org**
2. Baixe a versão **LTS** (lado esquerdo — é a mais estável)
3. Execute o instalador com todas as opções padrão
4. Para verificar: abra o **Prompt de Comando** (Win + R → `cmd` → Enter) e digite:
   ```
   node --version
   ```
   Deve aparecer algo como `v22.x.x`. Se aparecer, Node está instalado.

---

## Passo 3 — Instalar o Python

> Só necessário para usar a análise de LTV. Se for usar apenas as outras ferramentas, pode pular.

1. Acesse: **https://www.python.org/downloads**
2. Clique em **"Download Python 3.x.x"** (botão amarelo)
3. Execute o instalador — **IMPORTANTE:** na primeira tela, marque a opção **"Add Python to PATH"** antes de clicar em Install Now

   ![Marcar "Add Python to PATH"](https://www.python.org/static/img/python-logo.png)

   > Se esquecer de marcar essa opção, a análise de LTV não vai funcionar. Neste caso, desinstale o Python e reinstale marcando a opção.

4. Para verificar: abra o Prompt de Comando e digite:
   ```
   py --version
   ```
   Deve aparecer `Python 3.x.x`.

---

## Passo 4 — Instalar o Claude Code

1. Acesse: **https://claude.ai/download** e baixe o Claude para desktop
2. Faça login com sua conta Anthropic
3. Após instalar, abra o Claude e confirme que consegue usar normalmente

> Claude Code é a interface que executa as skills deste workspace (análises, apresentações, elementos visuais).

---

## Passo 5 — Baixar o projeto do GitHub

1. Abra o **Git Bash** (menu Iniciar → Git Bash)
2. Navegue até a pasta onde quer salvar o projeto. Exemplo para salvar em Documentos:
   ```bash
   cd ~/Documents
   ```
3. Clone o repositório:
   ```bash
   git clone https://github.com/[organização]/presentation_generator.git
   ```
   > Substitua `[organização]` pelo endereço real do repositório — peça para quem te convidou.

4. Entre na pasta:
   ```bash
   cd presentation_generator
   ```

---

## Passo 6 — Instalar dependências do app

Ainda no Git Bash, execute:

```bash
cd app
npm install
```

Aguarde terminar (pode levar 1 minuto). Aparecerá algo como `added 64 packages`.

---

## Passo 7 — Criar as pastas de trabalho

O projeto usa três pastas que não vêm no GitHub (por segurança — dados de clientes ficam só na sua máquina):

```bash
cd ..
mkdir input temp output
```

---

## Pronto! Verificação final

Para confirmar que tudo está correto, abra o Prompt de Comando, vá até a pasta do projeto e rode:

```
cd app
node server.js
```

Deve aparecer:

```
  ✓  Analytics App  →  http://localhost:3131
```

Abra **http://localhost:3131** no browser — você verá a homepage do app (sem análises ainda, isso é normal).

Para encerrar o servidor: `Ctrl + C` no Prompt de Comando.

---

## Como usar no dia a dia

### Abrir o workspace no Claude

1. Abra o **Claude** no seu computador
2. Abra a pasta `presentation_generator` como projeto
3. As skills ficam disponíveis automaticamente (`/ltv-analysis`, `/plan-slides`, `/make-design`)

### Antes de fazer uma análise de LTV

1. Coloque o CSV do cliente na pasta `input/`
2. Inicie o servidor do app em um terminal: `cd app && node server.js`
3. No Claude, rode `/ltv-analysis` e siga as instruções

### Ver os relatórios

Com o servidor rodando, acesse **http://localhost:3131** para ver todas as análises já feitas.

---

## Atualizar quando sair uma versão nova

Para pegar as últimas atualizações do GitHub:

```bash
# Dentro da pasta presentation_generator
git pull
cd app && npm install
```

---

## Dúvidas frequentes

**"node não é reconhecido como comando"**  
→ O Node.js não foi instalado corretamente ou o computador precisa ser reiniciado após a instalação.

**"py não é reconhecido como comando"**  
→ Python foi instalado sem marcar "Add to PATH". Desinstale pelo Painel de Controle e reinstale marcando a opção.

**O servidor do app não abre no browser**  
→ Verifique se o Prompt de Comando mostra o texto `✓ Analytics App → http://localhost:3131`. Se não, tem um erro — mande print da tela para o time técnico.

**"Permission denied" ao rodar o git clone**  
→ Você precisa de acesso ao repositório. Peça para quem te convidou adicionar seu usuário GitHub.
