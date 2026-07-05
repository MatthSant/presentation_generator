/* deepenLoop.ts — gate de qualidade + reparo para a geração de detalhamentos.
 *
 * Um único orquestrador compartilhado pelos dois sítios de geração (seção via
 * detalhamento.ts e modal-por-card via routes/deepen.ts). A cada tentativa:
 *   1. gera (a thunk decide raso vs. fundo) com o feedback de reparo da anterior;
 *   2. valida o SCHEMA (renderável?) — falha dura, repara e tenta de novo;
 *   3. checa QUALIDADE determinística (tabela vazia, gráfico de 1 categoria,
 *      séries demais) + cheiro de metodologia;
 *   4. checa SEMÂNTICA via critic (responde à pergunta original? está claro?).
 * Máximo de 3 tentativas. Todo reparo REPINA a pergunta original (guardrail).
 * Após o teto, devolve a última versão renderável (não falha por imperfeição) com
 * as pendências em residualIssues; só devolve null se NUNCA passou no schema. */

import type { Bind, DataMap, Modal, Widget } from '../shared/types.js';
import { resolveBind } from '../shared/bind.js';
import { critiqueModal, sumUsage, type ModalUsage } from './claude.js';
import { qualityIssues, qualitySuggestions, missingAnswerWidget } from './deepenQuality.js';
import { methodologySmell } from './deepenHistory.js';

/** Forma frouxa do dataset (dims/filters opcionais) aceita pelos dois sítios de
 *  geração — convertida para o DataMap compartilhado ao resolver os binds. */
type LooseDataMap = Record<string, { dims?: string[]; filters?: string[]; rows: Array<Record<string, unknown>> }>;

export interface GateInput {
  /** Gera uma modal/seção candidata. `repair` é o feedback da tentativa anterior;
   *  `prev` é a candidata anterior (modal_anterior) para o modelo partir dela. */
  generate: (repair: string | undefined, prev: unknown) => Promise<{ modal: unknown; mocked: boolean; usage?: ModalUsage }>;
  /** Normaliza a saída crua numa Modal com ids (assignIds + id estável). */
  normalize: (modal: unknown) => Modal;
  /** Validação de schema (mesma do renderer). [] = renderável. */
  validateSchema: (modal: Modal) => string[];
  dataset: LooseDataMap;
  /** Pergunta original que a saída DEVE responder (guardrail). */
  objetivo?: string;
  /** Instrução/comentário sendo executado nesta rodada. */
  instrucao: string;
  /** Teto de tentativas (default 3). */
  maxAttempts?: number;
  /** Liga o critic semântico (default true; ignorado em mock). */
  runCritic?: boolean;
  /** Callback de progresso (estágio atual) — alimenta a tela de carregamento. */
  onProgress?: (msg: string) => void;
}

export interface GateResult {
  modal: Modal | null;
  mocked: boolean;
  usage?: ModalUsage;
  /** ERROS que reprovaram a entrega (vazio = passou). Só isto reprova um detalhamento. */
  residualBlocking: string[];
  /** Sugestões de forma NÃO acatadas na versão entregue — NUNCA reprovam; só registro/UI. */
  residualSuggestions: string[];
  /** União de TODAS as issues encontradas/reparadas ao longo das tentativas — para
   *  registrar no histórico e calibrar o motor depois. */
  issuesLog: string[];
  attempts: number;
}

const CAP = 60; // teto de linhas/categorias por widget no factsheet (controla tokens)

/** Resolve o bind de cada widget de dado num "factsheet": os números REAIS que ele
 *  mostra (categorias, séries, totais, linhas). É a verdade-base contra a qual o
 *  critic confere os números citados na prosa. */
/** Remove widgets-placeholder VAZIOS (texto/título/valor em branco) que modelos
 *  fracos às vezes emitem e nunca preenchem. Um bloco vazio é ruído — e um único
 *  `highlight text is required` reprovava o detalhamento inteiro. Poda o vazio e
 *  mantém o conteúdo real; NÃO baixa a qualidade (limpa, não fabrica). */
export function pruneEmptyWidgets(widgets: Widget[]): Widget[] {
  const blank = (v: unknown): boolean => v == null || String(v).trim() === '';
  return (widgets || []).filter((raw) => {
    const w = raw as { type?: string; text?: unknown; title?: unknown; value?: unknown; bind?: unknown };
    if (w.type === 'highlight' || w.type === 'find-note') return !blank(w.text);
    if (w.type === 'find-block' || w.type === 'ni' || w.type === 'ni-vertical') return !blank(w.title);
    if (w.type === 'kpi') return !blank(w.value);
    return true;   // chart/table validam por bind (schema/qualidade já pegam)
  });
}

export function buildFactsheet(widgets: Widget[], dataset: DataMap): unknown[] {
  const sheet: unknown[] = [];
  for (const raw of widgets) {
    const w = raw as { type?: string; title?: string; label?: string; bind?: Bind };
    if (!w.bind || (w.type !== 'chart' && w.type !== 'table' && w.type !== 'kpi')) continue;
    try {
      const r = resolveBind(w.bind, dataset);
      sheet.push({
        widget: w.type,
        titulo: w.title || w.label,
        dataset: w.bind.dataset,
        categorias: r.categories.slice(0, CAP),
        series: r.series.slice(0, 12).map((s) => ({ nome: s.name, valores: s.data.slice(0, CAP) })),
        // `totais` = soma por coluna. Só faz sentido p/ SÉRIE/gráfico de volume; numa
        // TABELA de indicadores (custos por unidade, %, atingimento) somar colunas dá
        // número SEM SENTIDO (ex.: "atingimento total 608%") que fazia o critic reprovar
        // por "número não confere". Omitido p/ tabelas — o critic confere pelas `linhas`.
        totais: w.type === 'table' ? undefined : r.totals,
        linhas: r.rows.slice(0, CAP),
      });
    } catch { /* bind inválido já é pego pelo schema — ignora aqui */ }
  }
  return sheet;
}

function repairMessage(objetivo: string | undefined, issues: string[], factsheet?: unknown[]): string {
  const alvo = objetivo
    ? `A PERGUNTA ORIGINAL, que a saída DEVE responder, é: "${objetivo}". Não troque o alvo — ajuste a forma para respondê-la melhor.\n`
    : '';
  // DADOS REAIS resolvidos dos gráficos/tabelas da saída anterior: a prosa DEVE bater
  // com estes números (é a mesma fonte que o revisor usa). Sem isso, o modelo "corrige"
  // reescrevendo de memória e re-inventa a tendência → o critic reprova de novo.
  const dados = (factsheet && factsheet.length)
    ? `\n\nNÚMEROS REAIS que os gráficos/tabelas mostram — sua prosa tem que bater EXATAMENTE com eles; NÃO afirme tendência (queda/subida contínua, "despencou", "saturou") que a série NÃO mostra:\n${JSON.stringify(factsheet).slice(0, 2600)}`
    : '';
  return `${alvo}A saída anterior foi rejeitada por:\n- ${issues.join('\n- ')}\nCorrija TODOS esses pontos e reemita a saída final completa.${dados}`;
}

/** Reparo de POLIMENTO: a saída já passou (sem erro); só refina a FORMA. Tom suave
 *  p/ a IA não destruir o que já está bom nem trocar o conteúdo correto. */
function polishMessage(objetivo: string | undefined, issues: string[]): string {
  const alvo = objetivo ? `A pergunta original é: "${objetivo}". Mantenha a resposta a ela.\n` : '';
  return `${alvo}A saída está APROVADA, mas dá p/ melhorar a FORMA nestes pontos (opcionais — não reprovam):\n- ${issues.join('\n- ')}\nReemita aplicando o que fizer sentido, SEM perder o que já está bom nem trocar o conteúdo correto.`;
}

export async function gateAndRepair(inp: GateInput): Promise<GateResult> {
  const max = inp.maxAttempts ?? 5;
  const runCritic = inp.runCritic ?? true;
  let prev: unknown;
  let usage: ModalUsage | undefined;
  let mocked = false;
  let lastValid: Modal | null = null;
  let issues: string[] = [];
  let lastBlocking: string[] = [];      // bloqueante/sugestão da última tentativa (p/ o residual final)
  let lastSuggestions: string[] = [];
  let lastFactsheet: unknown[] = [];    // números REAIS da última saída válida → grounding do reparo
  // melhor versão SEM erro já obtida (e suas sugestões de forma pendentes). Protege a
  // entrega: se uma passada de polimento introduzir erro, devolvemos esta.
  let accepted: Modal | null = null;
  let acceptedResidual: string[] = [];
  let polishing = false;   // a tentativa atual é só polimento (saída anterior já passou)?
  const seen = new Set<string>();
  const issuesLog: string[] = [];
  const log = (xs: string[]): void => { for (const x of xs) if (!seen.has(x)) { seen.add(x); issuesLog.push(x); } };

  for (let attempt = 0; attempt < max; attempt++) {
    inp.onProgress?.(attempt === 0
      ? 'Analisando os dados e escrevendo o detalhamento…'
      : polishing
        ? `Refinando o detalhamento (tentativa ${attempt + 1} de ${max})…`
        : `Revisando o detalhamento (tentativa ${attempt + 1} de ${max})…`);
    const repair = attempt === 0 ? undefined
      : polishing ? polishMessage(inp.objetivo, issues)
      : repairMessage(inp.objetivo, issues, lastFactsheet);
    polishing = false;
    const r = await inp.generate(repair, prev);
    mocked = r.mocked;
    if (r.usage) usage = sumUsage(usage, r.usage);
    const cand = inp.normalize(r.modal);
    prev = cand;

    const schemaErrs = inp.validateSchema(cand);
    if (schemaErrs.length) { issues = schemaErrs; lastBlocking = schemaErrs; lastSuggestions = []; log(issues); if (mocked) break; continue; }
    lastValid = cand; // renderável a partir daqui

    const widgets = (cand.widgets as Widget[]) ?? [];
    // Factsheet (números REAIS dos binds) desta saída — usado pelo critic E injetado no
    // próximo reparo p/ a prosa ficar grounded (mesma fonte que o revisor confere).
    const factsheet = buildFactsheet(widgets, inp.dataset as unknown as DataMap);
    lastFactsheet = factsheet;
    // Defeitos determinísticos (tabela vazia, gráfico ilegível, coluna inexistente) são
    // sempre BLOQUEANTES. O critic acrescenta o juízo semântico, já separado em
    // bloqueante × polimento. Só o bloqueante reprova; polimento entra no reparo mas
    // não trava a entrega — depois de N tentativas, nitpick de estilo não pode falhar.
    const answerGap = missingAnswerWidget(widgets);
    let blocking = [...qualityIssues(widgets, inp.dataset as unknown as DataMap), ...methodologySmell(cand),
      ...(answerGap ? [answerGap] : [])];
    // Preferências de forma (ex.: excesso de gráficos) entram como SUGESTÃO: o reparo
    // tenta acatar, mas nunca reprovam — só erro bloqueia.
    let suggestions: string[] = qualitySuggestions(widgets);
    if (blocking.length === 0 && runCritic && !mocked) {
      inp.onProgress?.('Verificando a qualidade…');
      const crit = await critiqueModal(cand, inp.objetivo, inp.instrucao, factsheet);
      if (crit.usage) usage = sumUsage(usage, crit.usage);
      if (!crit.ok) blocking = crit.blocking.length ? crit.blocking : ['o revisor concluiu que a saída não responde à pergunta original'];
      suggestions = [...suggestions, ...crit.suggestions];
    }
    issues = [...blocking, ...suggestions];   // próximo reparo tenta corrigir ambos
    lastBlocking = blocking; lastSuggestions = suggestions;
    log(issues);
    if (blocking.length === 0) {
      // passou (sem erro). Guarda como entregável. Se sobraram só SUGESTÕES de forma e
      // ainda há tentativa, faz UMA passada extra de polimento (nunca reprova por isso).
      accepted = cand; acceptedResidual = suggestions;
      if (suggestions.length === 0 || mocked || attempt >= max - 1) {
        return { modal: cand, mocked, usage, residualBlocking: [], residualSuggestions: suggestions, issuesLog, attempts: attempt + 1 };
      }
      polishing = true;
      continue;
    }
    // houve ERRO. Se já temos uma versão limpa aceita (um polimento piorou a saída),
    // entrega a limpa em vez de arriscar — polimento não pode degradar a entrega.
    if (accepted) {
      return { modal: accepted, mocked, usage, residualBlocking: [], residualSuggestions: acceptedResidual, issuesLog, attempts: attempt + 1 };
    }
    if (mocked) break;
  }

  // esgotou as tentativas: prefere a melhor versão SEM erro (se houve), senão a última válida (com os erros).
  return accepted
    ? { modal: accepted, mocked, usage, residualBlocking: [], residualSuggestions: acceptedResidual, issuesLog, attempts: max }
    : { modal: lastValid, mocked, usage, residualBlocking: lastBlocking, residualSuggestions: lastSuggestions, issuesLog, attempts: max };
}
