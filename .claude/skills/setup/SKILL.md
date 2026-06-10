---
name: setup
description: "Deixa o app de visualização (analytics viewer) rodando do zero — checa pré-requisitos, instala dependências, builda, sobe o servidor na porta 3131 e abre o navegador. Pensada para o consultor não-técnico: um comando e o app está no ar. Use quando o usuário invocar /setup ou pedir para instalar, configurar, subir, rodar ou abrir o app/viewer/relatórios."
user-invocable: true
---

# setup

Deixa o **app atual** (o viewer em `app/`) no ar com o mínimo de fricção. O consultor digita `/setup` e, ao final, o navegador abre em `http://localhost:3131` com a lista de análises.

## Visão geral

| | |
|---|---|
| **O que faz** | Checa Node → instala deps → builda → libera a porta → sobe o servidor → abre o navegador → checa Python |
| **Pré-requisito** | **Node.js 18+** para o app (obrigatório). **Python 3.8+** só se o consultor for **gerar** análises (`/ltv-analysis`, `/conversao-perfil`) — e **sem nenhum `pip`**, os scripts usam só a biblioteca padrão |
| **Resultado** | `http://localhost:3131` no ar, servindo `output/[cliente]/[analise]` |
| **Onde roda** | Windows (PowerShell) · macOS/Linux (bash) — detecte o SO e use os comandos certos |

> Regra de ouro: **fale como para um leigo**. Nada de jargão. A cada passo, uma frase curta do que está acontecendo. Se algo falhar, diga em português claro o que fazer — nunca cole um stack trace cru.

---

## Processo

### Fase 0 — Detectar SO e checar o Node

1. Descubra o sistema operacional (Windows vs macOS/Linux) e use os comandos da coluna certa nas fases seguintes.
2. Cheque o Node e o npm:
   - Windows: `node --version; npm --version`
   - macOS/Linux: `node --version && npm --version`
3. Avalie a versão:
   - **Ausente** (comando não encontrado) → **pare** e oriente: "Falta o Node.js. Baixe a versão **LTS** em https://nodejs.org, instale com as opções padrão, feche e reabra o terminal/Claude Code, e rode `/setup` de novo." Não tente instalar o Node automaticamente.
   - **< 18** → peça para atualizar para a LTS pelo mesmo link.
   - **≥ 18** → siga.

### Fase 1 — Instalar dependências

Diga: "Instalando as dependências do app (pode levar 1–3 min na primeira vez)…"

- Windows: `cd app; npm install`
- macOS/Linux: `cd app && npm install`

Se `npm install` falhar no **better-sqlite3** (módulo nativo): quase sempre é versão de Node fora da LTS. Oriente a instalar o Node **LTS (18, 20 ou 22)** e rodar `/setup` de novo. Não tente compilar manualmente nem instalar build-tools sem necessidade.

### Fase 2 — Buildar

Diga: "Compilando o app…"

- `npm run build` (gera `app/dist/` — o `npm start` roda a partir daí)

### Fase 3 — Liberar a porta e subir o servidor

O app usa a porta **3131**. Se já houver algo nela (um servidor anterior), libere antes de subir — senão o start falha.

1. Liberar a porta 3131 (ignore se não houver nada):
   - Windows (PowerShell):
     ```
     Get-NetTCPConnection -LocalPort 3131 -State Listen -ErrorAction SilentlyContinue |
       Select-Object -ExpandProperty OwningProcess -Unique |
       ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
     ```
   - macOS/Linux: `lsof -ti tcp:3131 | xargs kill -9 2>/dev/null || true`
2. Subir o servidor **em segundo plano** (não bloqueie o terminal), a partir de `app/`:
   - Comando: `npm start` — rode como processo de fundo.
3. Aguarde alguns segundos e confirme que respondeu:
   - Tente abrir `http://localhost:3131/api/analyses` (ou a home) e verifique status 200.
   - Se não responder em ~10s, releia a saída do start: porta ocupada (repita o passo 1), ou build não feito (volte à Fase 2).

> Porta alternativa: se 3131 estiver tomada por algo que não dá para encerrar, suba com outra porta — Windows `$env:PORT=3142; npm start` · macOS/Linux `PORT=3142 npm start` — e use essa porta nos próximos passos.

### Fase 4 — Abrir o navegador e reportar

1. Abra a home:
   - Windows: `Start-Process http://localhost:3131`
   - macOS: `open http://localhost:3131` · Linux: `xdg-open http://localhost:3131`
2. Avise, em uma frase cada:
   - "✓ App no ar em **http://localhost:3131** — a home lista todas as análises em `output/`."
   - "Para uma análise específica: `http://localhost:3131/report/[cliente]/[analise]`."
   - "Para **parar** o app depois: feche este terminal, ou rode `/setup` de novo que ele reinicia limpo."
   - "Ainda não tem análise? Coloque um CSV em `input/[cliente]/` e rode `/ltv-analysis` ou `/conversao-perfil`."

### Fase 5 — Checar Python (para GERAR análises)

O app já está no ar — isso **não depende de Python**. Mas para *gerar* uma análise (`/ltv-analysis`, `/conversao-perfil`), as skills rodam scripts Python. Faça a checagem e deixe claro que é um passo separado.

1. Cheque a versão (precisa ser 3.8+):
   - Windows: `py -3 --version`  (as skills chamam o Python por `py -3`)
   - macOS/Linux: `python3 --version`
2. Avalie:
   - **Presente (≥ 3.8)** → diga: "✓ Python pronto — você já pode gerar análises com `/ltv-analysis` ou `/conversao-perfil`."
   - **Ausente ou < 3.8** → **não bloqueie o app** (ele já está no ar); só avise que análises ainda não vão rodar e oriente:
     - Windows: "Baixe o Python em https://python.org/downloads, e **no instalador marque a caixa 'Add Python to PATH'**. Isso já inclui o comando `py`. Depois feche e reabra o Claude Code."
     - macOS: "Instale o Python 3 de https://python.org/downloads (ou `brew install python`)."
     - Linux: "Instale pelo gerenciador da distro, ex.: `sudo apt install python3`."
3. **Importante:** os scripts usam só a biblioteca padrão do Python — **não rode `pip install` de nada**. Instalou o Python, acabou.

> Por que separado: o app (viewer) e a geração de análise são duas coisas. Um consultor que só vai **abrir/mostrar** relatórios já recebidos precisa apenas do Node. Python é para quem **produz** a análise a partir de um CSV.

---

## Modo "só subir" (já instalado antes)

Se `app/node_modules` e `app/dist` já existem (setup já feito antes), **pule as Fases 1 e 2** e vá direto para a Fase 3 (liberar porta + subir + abrir). Mais rápido para o uso do dia a dia.

## O que NÃO fazer

- Não instalar Node/Python automaticamente — só orientar com o link oficial.
- Não rodar o servidor em primeiro plano (trava a sessão); sempre em segundo plano.
- Não expor o servidor na rede — ele não tem autenticação e serve dado de cliente. É **local**, em `localhost`. (Entrega ao cliente é outro fluxo, ainda a construir.)
- Não colar erros crus para o usuário — traduza para "o que aconteceu" + "o que fazer".
