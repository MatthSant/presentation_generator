/* typeRegistry.ts — registro central dos TIPOS de análise.
 *
 * Cada tipo declara onde vive seu pipeline Python, como validar o config de
 * criação, quais capacidades tem (insights, query de aprofundamento, recompute
 * de vista) e quais páginas de criação/montador usa. Adicionar um tipo novo =
 * uma entrada aqui + a pasta pysrc/<dir> — sem if/else espalhado. */

import type { DeepDeps } from './claude.js';

export interface AnalysisTypeDef {
  type: string;
  label: string;
  /** Pasta em pysrc/ com build_report.py (e scripts opcionais abaixo). */
  pysrcDir: string;
  /** Valida o config de criação; [] = ok. */
  validateConfig(config: Record<string, unknown> | null | undefined): string[];
  /** O bloco de insights (Layer B1) se aplica a este tipo? */
  supportsInsights: boolean;
  /** Script de query agregada sob demanda (deep deepen). Ausente = sem deep mode. */
  queryScript?: string;
  /** Script de recompute da vista filtrada (controles interativos). */
  renderScript?: string;
  gerarPage: string;
  montadorPage: string;
  /** Arquivos auxiliares obrigatórios no /generate além do `csv` (ex.: `goals`). */
  requiredFiles?: string[];
  /** Capacidades de auxiliares (fonte única p/ os forms de criação/atualização —
   *  evita Sets hardcoded por tipo no client/servidor). */
  supportsTemperature?: boolean;   // classifica temperatura por regras (field_campaign_name)
  supportsCampaignType?: boolean;  // tipo de campanha por regras + recorte OBRIGATÓRIO na criação
  supportsGoals?: boolean;         // aceita CSV de launch goals (metas por utm_source × dia)
  supportsDict?: boolean;          // aceita dicionário de criativos (field_ad_name → link)
  /** UI de metas nos forms: 'metas-toggle' = manuais × launch goals; 'upload' = só CSV. */
  goalsUi?: 'metas-toggle' | 'upload';
  /** meta.controls.kind emitido pelo gerador (dispatch no client). */
  controlsKind?: string;
  /** Metadados do deep deepen (tool `consultar`). `null` → só modo raso (catálogo). */
  buildDeepenMeta(config: unknown): DeepDeps['meta'] | null;
  /** Contexto de negócio do aprofundamento — vira `meta.contexto` no 1º turno do deep.
   *  `view` é o estado ATUAL dos controles do relatório (ex.: o modo resultado ×
   *  captação que o consultor está olhando ao perguntar); ausente → default do tipo.
   *  É aqui que o tipo declara a FASE da campanha, recortes fixos etc. */
  deepenContext?(config: unknown, view?: Record<string, unknown>): string | null;
}

interface PerfilConfig { criterios?: Array<{ id: string; label?: string }>; channels?: string[] }

type Funcao = { id: string; desc: string };
type Params = Record<string, { enum?: string[]; desc?: string }>;

/** Catálogo das consultas GENÉRICAS (common.query_core). Descritas UMA vez aqui;
 *  cada tipo escolhe quais expor passando o nome do seu eixo. Função genérica nova
 *  = adicionar aqui + em query_core.py — nunca por tipo. */
function genericFuncoes(eixo: string): Record<'series' | 'series_long' | 'tabela' | 'correlacao' | 'trend' | 'ranking' | 'variacao', Funcao> {
  return {
    tabela: { id: 'tabela', desc: `tabela COMPLETA por ${eixo}: TODAS as métricas como colunas (sem escolher) — use p/ um panorama por grupo; qualquer coluna que você citar na table existe` },
    series: { id: 'series', desc: `VÁRIAS métricas por ${eixo} numa tabela só (metrica_x, metrica_y, opcional metrica_z) — compare indicadores/evoluções lado a lado` },
    series_long: { id: 'series_long', desc: `VÁRIAS métricas por ${eixo} em formato LONGO (coluna "serie" + "valor") — para gráfico MULTI-LINHA / barra agrupada (bind series="serie", y="valor"); só com métricas de escala comparável (metrica_x, metrica_y, opcional metrica_z)` },
    correlacao: { id: 'correlacao', desc: `correlação de Pearson entre duas métricas ao longo dos ${eixo}s (metrica_x, metrica_y)` },
    trend: { id: 'trend', desc: `uma métrica (metrica) ao longo dos ${eixo}s — JÁ traz coluna "vs média %" por linha + resumo com início→fim, tendência e volatilidade (estrutural × oscilante)` },
    ranking: { id: 'ranking', desc: `${eixo}s ordenados por uma métrica (metrica), com as colunas principais` },
    variacao: { id: 'variacao', desc: `Δ% período-a-período (transições consecutivas) de 1–3 métricas lado a lado (metrica_x, opcional metrica_y/metrica_z) — para "como X variou entre ${eixo}s" e comparar crescimento (ex.: investimento × faturamento) com a coluna "Δ% ..." pronta` },
  };
}

/** Params das consultas genéricas (mesmo enum de métricas para todas). */
function genericParams(M: string[]): Params {
  return {
    metrica: { enum: M, desc: 'métrica (trend/ranking e recortes)' },
    metrica_x: { enum: M, desc: 'métrica X (correlacao/series)' },
    metrica_y: { enum: M, desc: 'métrica Y (correlacao/series)' },
    metrica_z: { enum: M, desc: 'métrica Z opcional (series — 3ª coluna)' },
  };
}

export const TYPES: Record<string, AnalysisTypeDef> = {
  'conversao-perfil': {
    type: 'conversao-perfil',
    label: 'Conversão por Perfil',
    pysrcDir: 'conversao-perfil',
    supportsInsights: true,
    queryScript: 'query_api.py',
    gerarPage: 'gerar.html',
    montadorPage: 'montador.html',
    validateConfig(config) {
      const c = config as PerfilConfig | null | undefined;
      if (!c || !Array.isArray(c.criterios) || c.criterios.length === 0) return ['config.criterios vazio'];
      return [];
    },
    buildDeepenMeta(config) {
      const c = config as PerfilConfig | null;
      const ids = (c?.criterios || []).map((x) => x.id);
      const canais = c?.channels || ['Geral'];
      const metricas = ['conv_lcto', 'conv_12m', 'diff', 'uplift', 'rep'];
      const G = genericFuncoes('grupo');
      return {
        criterios: (c?.criterios || []).map((x) => ({ id: x.id, label: x.label || x.id })),
        canais, metricas,
        consultar: {
          funcoes: [
            { id: 'cut_by_criterion', desc: 'uma métrica por grupo de um critério (criterio, metrica)' },
            { id: 'trend', desc: 'a métrica de cada grupo ao longo dos lançamentos (criterio, metrica)' },
            { id: 'crosstab', desc: 'cruzamento de um critério com outro (criterio, cruzar_com)' },
            { id: 'association', desc: 'força de associação entre dois critérios (criterio, cruzar_com)' },
            G.tabela, G.series, G.series_long, G.ranking,   // genéricas sobre os grupos do critério escolhido
          ],
          params: {
            criterio: { enum: ids, desc: 'critério principal (define os grupos do eixo)' },
            cruzar_com: { enum: ids, desc: 'segundo critério (só crosstab/association)' },
            canal: { enum: canais },
            ...genericParams(metricas),
          },
        },
      };
    },
  },
  'criativos': {
    type: 'criativos',
    label: 'Análise de Criativos',
    pysrcDir: 'criativos',
    supportsTemperature: true,
    supportsCampaignType: true,
    supportsDict: true,
    supportsInsights: false,
    renderScript: 'render_view.py',   // recompute do toggle de modo (resultado × captação)
    queryScript: 'query_api.py',      // modo FUNDO: consultas sob demanda (correlação, temperatura, saturação…)
    gerarPage: 'gerar-criativos.html',
    montadorPage: 'montador-criativos.html',
    controlsKind: 'criativos',
    validateConfig() { return []; },
    buildDeepenMeta() {
      const M = ['roas', 'retorno', 'cpl', 'cpmql', 'cpm', 'ctr', 'hook_rate', 'hold_rate',
                 'connect_rate', 'conv_pagina', 'qualidade', 'tx_resposta', 'conv', 'cac', 'leads', 'invest'];
      const G = genericFuncoes('criativo');
      return {
        consultar: {
          funcoes: [
            G.tabela, G.correlacao, G.series, G.series_long, G.ranking,
            { id: 'por_temperatura', desc: 'TODAS as métricas por temperatura do lead (uma coluna por métrica) — escolha as colunas no bind' },
            { id: 'saturacao_diaria', desc: 'ROAS e retorno por DIA (geral, ou de um criativo) para detectar saturação' },
            { id: 'benchmark_gap', desc: 'distância média de cada indicador de anúncio (hook/hold/ctr/connect/conv_pagina) frente ao benchmark' },
          ],
          params: {
            ...genericParams(M),
            temperatura: { desc: 'nome da temperatura (opcional; validado contra os dados)' },
            criativo: { desc: 'nome exato do criativo (opcional; saturacao_diaria)' },
          },
        },
      };
    },
    deepenContext(config, view) {
      // A FASE muda o que é veredito: em captação a venda ainda não fechou — julgar
      // ROAS/CAC ali é condenar uma campanha que ainda está correndo. O modo que o
      // consultor está OLHANDO ao perguntar (view.mode) é a fase; sem view, o default
      // do relatório.
      const cfg = (config ?? {}) as { tipo_campanha?: string };
      const mode = String(view?.mode ?? 'resultado');
      const fase = mode === 'captacao'
        ? 'FASE DA CAMPANHA: captação em andamento — a venda ainda NÃO fechou. O desfecho a julgar é o '
          + 'custo do lead qualificado (CPMQL projetado) e a qualidade da captação (CPL, CPM, CTR, hook/hold, '
          + 'taxa de resposta, qualificação). NÃO use ROAS/CAC/vendas como veredito: ou ainda não existem, ou '
          + 'estão incompletos — no máximo cite-os como sinal precoce, dizendo isso.'
        : 'FASE DA CAMPANHA: resultado final — a campanha fechou. O desfecho a julgar é ROAS líquido '
          + '(0 = empate, negativo = prejuízo), retorno e CAC; as métricas de captação explicam o COMO, '
          + 'não o veredito.';
      const tipo = (cfg.tipo_campanha || '').trim();
      return fase + (tipo ? `\nTIPO DE CAMPANHA: ${tipo} — a análise já está recortada para campanhas deste tipo; não compare com o outro tipo.` : '');
    },
  },
  'historico-lancamentos': {
    type: 'historico-lancamentos',
    label: 'Histórico de Lançamentos',
    pysrcDir: 'historico-lancamentos',
    supportsInsights: false,
    renderScript: 'render_view.py',
    queryScript: 'query_api.py',      // modo FUNDO: trend, correlação, decomposição CPA, por dimensão
    gerarPage: 'gerar-historico.html',
    montadorPage: 'montador-historico.html',
    controlsKind: 'historico-lancamentos',
    validateConfig() { return []; },
    buildDeepenMeta() {
      const M = ['conv_ger', 'qualificacao', 'taxa_qualidade', 'conv_mql', 'reembolso', 'roas', 'roi',
                 'ret', 'leads', 'invest', 'fat_liq', 'vendas', 'recap', 'cpm', 'ctr', 'cpc', 'cpl', 'conv_paga', 'cpa'];
      const G = genericFuncoes('lançamento');
      return {
        consultar: {
          funcoes: [
            G.tabela, G.trend, G.variacao, G.series, G.series_long, G.correlacao,
            { id: 'decomposicao', desc: 'decompõe o CPA (= CPL ÷ conversão paga): diz se a variação do CPA foi mais de CPL ou de conversão' },
            { id: 'por_dimensao', desc: 'TODAS as métricas por dimensão (canal/plataforma/temperatura) × lançamento (uma coluna por métrica) — escolha as colunas no bind' },
          ],
          params: {
            ...genericParams(M),
            dimensao: { enum: ['canal', 'plataforma', 'temperatura'], desc: 'dimensão (por_dimensao)' },
          },
        },
      };
    },
  },
  'acompanhamento-lancamento': {
    type: 'acompanhamento-lancamento',
    label: 'Acompanhamento de Campanha',
    pysrcDir: 'acompanhamento-lancamento',
    supportsTemperature: true,
    supportsGoals: true,
    supportsDict: true,
    goalsUi: 'metas-toggle',              // metas manuais × launch goals (CSV)
    supportsInsights: false,
    queryScript: 'query_api.py',          // modo FUNDO: séries/correlação/tendência por dia
    renderScript: 'render_view.py',       // FAB: filtro nível-relatório por data/origem/utms
    gerarPage: 'gerar-acompanhamento.html',
    montadorPage: 'montador-acompanhamento.html',
    controlsKind: 'acompanhamento-lancamento',
    validateConfig() { return []; },
    /** O lançamento PAGO inverte a lógica do acompanhamento: há caixa DURANTE a
     *  captação. Sem este contexto o modelo lê o relatório com a régua do clássico —
     *  trata ingresso como lead, ROAS como ROI e não sabe que exposição sem
     *  investimento é receita pura. */
    deepenContext(config) {
      const pago = String((config as { tipo_funil?: string } | null)?.tipo_funil || '')
        .toLowerCase() === 'lancamento-pago';
      if (!pago) return null;
      return [
        'MECÂNICA — LANÇAMENTO PAGO: o lead COMPRA um ingresso para entrar. A campanha tem',
        'receita e caixa já na captação, então a decisão do dia não é "quanto custa o lead"',
        'e sim "estou no verde, e o que muda isso hoje". Não existem CPL nem CPMQL aqui.',
        '',
        'EXPOSIÇÃO DE CAIXA = receita (ingresso + order bump) − reembolso − imposto sobre a',
        'venda − taxa do broker − investimento − imposto sobre a mídia (12% no Meta quando a',
        'coluna não vem preenchida). Positiva = o ingresso já pagou o tráfego antes de abrir',
        'o carrinho. É a métrica que comanda.',
        '',
        'DOIS PARES QUE NÃO SE MISTURAM, e trocá-los é o erro caro:',
        '· ROAS = receita SÓ das linhas com investimento ÷ investimento (eficiência isolada da mídia).',
        '· ROI  = receita TOTAL (pago + orgânico) ÷ investimento. Fica acima do ROAS porque o',
        '  orgânico entra sem custar mídia. ROI ≥ 1 com ROAS < 1 significa que o ORGÂNICO está',
        '  bancando o tráfego pago — escalar verba nesse estado piora o caixa.',
        '· CAC = investimento ÷ ingressos vindos de anúncio; é ele que vai contra a meta.',
        '· CUSTO POR INGRESSO = investimento ÷ TODOS os ingressos (diluído no orgânico), sempre menor.',
        '',
        'TICKET MÉDIO = receita total ÷ ingressos (com o order bump dentro). É o teto do que se',
        'pode pagar de CAC. O bench do ticket é o mesmo cálculo com o bump no benchmark — a',
        'distância entre os dois é, em R$ por ingresso, o que o order bump deixa na mesa.',
        '',
        'FUNIL: abre em INVESTIMENTO → Impressões (a "taxa" dessa transição é o CPM, comparado',
        'a um bench derivado do CAC-alvo), segue por CTR e clique→ingresso, e BIFURCA no fim:',
        'do ingresso saem MQLs (qualidade da base, via pesquisa) e ORDER BUMPS (receita',
        'incremental). Os dois ramos dividem o MESMO denominador e não somam 100%.',
        '',
        'CUIDADOS AO CRUZAR:',
        '· Exposição por CRIATIVO/PÚBLICO só é comparável entre itens com investimento > 0.',
        '  Linha orgânica não tem custo, então a exposição dela é receita pura e lidera qualquer',
        '  ranking sem significar eficiência. Sempre olhe a coluna Investimento junto.',
        '· Taxa de qualidade = MQLs ÷ RESPOSTAS da pesquisa (quem não respondeu não entra no',
        '  denominador); taxa de resposta tem o INGRESSO como base, não o lead.',
        '· "ingressos" é a contagem total; "ingressos_pago" é só a parte vinda de anúncio.',
      ].join('\n');
    },
    buildDeepenMeta(config) {
      // MECÂNICA: no lançamento pago o lead compra o ingresso. As métricas que a IA
      // pode pedir são OUTRAS — CPL e CPMQL nem existem lá, e caixa/ROAS/CAC/order
      // bump só existem lá. Anunciar a lista errada faz o modelo pedir função com
      // métrica que o motor rejeita (ou, pior, raciocinar sobre uma que não é a do
      // relatório). Espelha calc.FRAME_METRICS / FRAME_METRICS_PAGO.
      const pago = String((config as { tipo_funil?: string } | null)?.tipo_funil || '')
        .toLowerCase() === 'lancamento-pago';
      const M = pago
        ? ['ingressos', 'ingressos_pago', 'investimento', 'receita', 'exposicao',
           'custo_ing_pago', 'custo_ing_geral', 'roas_pago', 'roas_geral', 'ticket_medio',
           'bumps', 'taxa_bump', 'taxa_resp', 'taxa_qual', 'conv_pag', 'cpm', 'ctr',
           'hook', 'hold', 'connect']
        : ['leads', 'investimento', 'cpl', 'cpmql', 'taxa_resp', 'taxa_qual',
           'conv_pag', 'cpm', 'ctr', 'hook', 'hold', 'connect'];
      const G = genericFuncoes('recorte');
      return {
        consultar: {
          funcoes: [G.tabela, G.trend, G.variacao, G.series, G.series_long, G.correlacao, G.ranking,
            { id: 'cruzar_dia', desc: 'UMA métrica por DIA × dimensão (temperatura/canal/origem) em formato LONG (dia/serie/valor) → UM gráfico multi-linha comparando grupos no tempo (bind x="dia", series="serie", y="valor"). Use NO LUGAR de vários gráficos separados (ex.: "CPL por dia: Quente × Morno" = 1 gráfico).' },
            { id: 'decomposicao', desc: pago
              ? 'decompõe a VARIAÇÃO do CAC (início → últimos dias) nos fatores, com a CONTRIBUIÇÃO % de cada (CAC ← CPM/CTR/Connect/Conv.Página — mesma identidade do CPL, porque o ingresso é a conversão do funil de mídia). Use p/ "o custo de aquisição subiu por leilão ou por criativo?" — o motor calcula a atribuição, NÃO faça a álgebra na mão (param: metrica=custo_ing_pago).'
              : 'decompõe a VARIAÇÃO de cpl ou cpmql (início → últimos dias) nos fatores, com a CONTRIBUIÇÃO % de cada (CPL ← CPM/CTR/Connect/Conv.Página; CPMQL ← CPL/Qualidade). Use p/ "o custo subiu por mídia ou por qualificação?" — o motor calcula a atribuição, NÃO faça a álgebra na mão (param: metrica=cpl|cpmql).' },
            { id: 'onde_concentra', desc: 'DRILL-DOWN de atribuição p/ uma métrica que piorou (param metrica): varre criativo → publico → campanha → canal → temperatura e diz ONDE a piora se concentra (item que domina) ou se é AMPLA/uniforme → causa GLOBAL. Use p/ "qual criativo/público/campanha/canal/temperatura está puxando X p/ baixo, ou é geral?" — o motor decide o nível; a IA reporta e argumenta.' }],
          params: {
            ...genericParams(M),
            dimensao: { enum: ['dia', 'temperatura', 'canal', 'origem', 'criativo', 'publico', 'campanha'], desc: 'eixo do recorte (o que QUEBRA as métricas em linhas): dia = série temporal; temperatura = Quente/Morno/Frio (pago); canal = utm_source; origem = pago × orgânico; criativo = anúncio (field_ad_name, pago); publico = conjunto/adset (field_adset_name, pago); campanha = field_campaign_name (pago). P/ muitas linhas (criativo/publico/campanha) use ranking/tabela (default: dia)' },
            recorte_origem: { enum: ['Pago', 'Orgânico'], desc: 'filtra as linhas a uma origem antes de agregar (ex.: dia só do Pago)' },
            recorte_temperatura: { enum: ['Quente', 'Morno', 'Frio', 'Indefinido'], desc: 'filtra a uma temperatura (ex.: CPL por dia só do tráfego Quente)' },
            recorte_canal: { desc: 'filtra a um canal/utm_source específico (use um valor visto na dimensão canal)' },
            recorte_criativo: { desc: 'filtra a um criativo/anúncio específico (use um valor visto na dimensão criativo)' },
            recorte_publico: { desc: 'filtra a um público/adset específico (use um valor visto na dimensão publico)' },
            recorte_campanha: { desc: 'filtra a uma campanha específica (use um valor visto na dimensão campanha)' },
            incluir_geral: { enum: ['sim', 'nao'], desc: 'inclua a linha/série "Geral" com o valor GLOBAL CORRETO (o motor soma contagens e RECALCULA taxas ponderadas — num÷den). USE isto p/ um total/geral; NUNCA some os grupos você mesmo (somar taxa dá 113%).' },
            so_midia: { enum: ['sim', 'nao'], desc: 'poda os dias SEM mídia paga (investimento=0) — ex.: cauda pós-captação onde leads orgânicos residuais distorcem CPL/custo (evita "CPL +1714%" que é ruído de fim de campanha). USE em séries de custo no tempo.' },
          },
        },
      };
    },
  },
  'debriefing-lancamento': {
    type: 'debriefing-lancamento',
    label: 'Debriefing de Lançamento',
    pysrcDir: 'debriefing-lancamento',
    supportsTemperature: true,
    supportsGoals: true,
    goalsUi: 'upload',                    // launch goals via CSV (obrigatório na criação)
    supportsInsights: false,
    queryScript: 'query_api.py',          // modo FUNDO: frames + decomposição + drill-down por escopo/canal/temperatura/campanha/criativo/publico/semana
    renderScript: 'render_view.py',       // FAB: filtro nível-relatório por tipo/canal/temp/campanha/publico/criativo
    gerarPage: 'gerar-debriefing.html',
    montadorPage: 'montador-debriefing.html',
    requiredFiles: ['goals'],             // metas são obrigatórias (atingimento, comparativo, Δ vs meta)
    controlsKind: 'debriefing-lancamento',
    validateConfig() { return []; },
    buildDeepenMeta() {
      const M = ['leads', 'vendas', 'conv', 'qual', 'fat', 'invest', 'roas', 'cpl', 'cpmql', 'fpl',
        'cpm', 'ctr', 'connect', 'conv_pag', 'taxa_resp'];
      const G = genericFuncoes('grupo');
      return {
        consultar: {
          funcoes: [
            G.tabela, G.ranking, G.series, G.series_long, G.correlacao, G.trend, G.variacao,
            { id: 'atingimento', desc: 'realizado × META × gap × atingimento% por indicador GLOBAL (vendas/leads/fat/qualif/CPL/CPMQL) — use para "a meta foi atingida? onde ficou o gap?"' },
            { id: 'cruzar_dia', desc: 'UMA métrica por DIA × dimensão (escopo/canal/temperatura/criativo/publico/campanha) em formato LONG (dia/serie/valor) → UM gráfico multi-linha comparando grupos no tempo (bind x="dia", series="serie", y="valor"). Use p/ saturação/evolução (ex.: "CPL por dia por temperatura" = 1 gráfico).' },
            { id: 'decomposicao', desc: 'decompõe a VARIAÇÃO de cpl ou cpmql (início → fim do lançamento) nos fatores, com a CONTRIBUIÇÃO % de cada (CPL ← CPM/CTR/Connect/Conv.Página; CPMQL ← CPL/Qualidade paga). Use p/ "o custo subiu por mídia (leilão) ou por queda de qualificação?" — o motor calcula a atribuição, NÃO faça a álgebra na mão (param: metrica=cpl|cpmql).' },
            { id: 'onde_concentra', desc: 'DRILL-DOWN de atribuição p/ uma métrica que piorou ao longo do lançamento (param metrica): varre criativo → publico → campanha → canal → temperatura e diz ONDE a piora se concentra (item que domina) ou se é AMPLA/uniforme → causa GLOBAL (leilão/sazonalidade). Reporta pausados/novos por nível. Use p/ "onde o CPL/custo piorou: um recorte ou geral?" — o motor decide o nível; a IA reporta e argumenta.' },
            { id: 'variacao_hist', desc: 'compara o lançamento ATUAL × ANTERIOR (requer hist_csv). Sem dimensao: Δ% dos KPIs globais (vendas/leads/fat/qualif/CPL/CPMQL/ROAS/invest). Com dimensao (canal/temperatura/escopo recorrem entre lançamentos; criativo/campanha geralmente não): atual × anterior × Δ% de uma métrica por grupo (+ novos/sumiram). Use p/ "o que mudou vs o lançamento anterior? a receita cresceu mais que o investimento? ROAS melhorou?". Em custos, Δ% + = piora.' },
            { id: 'impacto_receita', desc: 'PONTE DE FATURAMENTO: decompõe a variação de RECEITA (atual × baseline) em fatores MEDÍVEIS, em % e em R$ — Faturamento = Volume(leads) × Conversão(vendas/leads) × Ticket. Responde "o gap de receita veio de menos volume, pior conversão ou ticket menor — quanto em R$ cada?". NÃO inclui qualificação/MQL (o dado não mede conversão de MQL×não-MQL — seria atribuição inventada); custo/qualidade do lead → decomposicao(cpmql). param base=meta|historico|janela (default meta se houver metas); recorte_* p/ um segmento (ex.: só o Pago). O fator de maior |R$| é a alavanca.' },
          ],
          params: {
            dimensao: { enum: ['escopo', 'canal', 'temperatura', 'campanha', 'criativo', 'publico', 'semana', 'dia'], desc: 'eixo do recorte (o que QUEBRA as métricas em linhas): escopo = pago × orgânico; canal = utm_source; temperatura = quente/frio/remarketing/advantage (pago); campanha = field_campaign_name (← utm_campaign no orgânico); criativo = anúncio (field_ad_name ← utm_content no orgânico); publico = conjunto/adset (field_adset_name, pago); semana/dia = série temporal (use com `trend`/`series` p/ a CURVA de uma métrica — semana p/ visão do lançamento, dia p/ granularidade fina; sem dimensao o eixo cai no default canal). P/ muitas linhas (criativo/publico/campanha) use ranking/tabela' },
            ...genericParams(M),
            recorte_escopo: { enum: ['Pago', 'Orgânico'], desc: 'filtra as linhas a um escopo antes de agregar (ex.: canal só do Pago)' },
            recorte_temperatura: { desc: 'filtra a uma temperatura (use um valor visto na dimensão temperatura, ex.: quente)' },
            recorte_canal: { desc: 'filtra a um canal/utm_source específico (use um valor visto na dimensão canal)' },
            recorte_criativo: { desc: 'filtra a um criativo/anúncio específico (use um valor visto na dimensão criativo)' },
            recorte_publico: { desc: 'filtra a um público/adset específico (use um valor visto na dimensão publico)' },
            recorte_campanha: { desc: 'filtra a uma campanha específica (use um valor visto na dimensão campanha)' },
            incluir_geral: { enum: ['sim', 'nao'], desc: 'inclua a linha "Geral" com o valor GLOBAL CORRETO (o motor soma contagens e RECALCULA taxas/custos ponderados — num÷den). USE isto p/ um total/geral; NUNCA some os grupos você mesmo (somar taxa/ROAS dá número errado).' },
            so_midia: { enum: ['sim', 'nao'], desc: 'só p/ dimensao=dia|semana (e cruzar_dia): poda a cauda pós-lançamento (dias SEM mídia paga de captação). USE p/ custo/saturação no tempo (CPL/CPMQL/leads por semana) — senão os dias finais com mídia desligada distorcem a série (ex.: leads "−100%").' },
            base: { enum: ['meta', 'historico', 'janela'], desc: 'só p/ impacto_receita: baseline da ponte de faturamento (meta = vs metas; historico = vs lançamento anterior; janela = início × fim do lançamento). Default: meta se houver metas.' },
          },
        },
      };
    },
  },
};

/** Resolve o tipo a partir de uma string ou de um config ({type}). Fallback:
 *  conversao-perfil (configs antigos sem `type`). */
export function typeOf(t: unknown): AnalysisTypeDef {
  const key = typeof t === 'string' ? t : (t as { type?: string } | null | undefined)?.type;
  return TYPES[key ?? ''] ?? TYPES['conversao-perfil'];
}

// Assinatura do dataset → tipo. O dataset é AUTORITATIVO (foi gerado pelo build_report
// do tipo); usado p/ não cair no fallback errado quando meta.type falta (o deepen rodava
// com domínio conversao-perfil em relatórios de debriefing/acompanhamento).
const DATASET_SIGNATURE: ReadonlyArray<readonly [string, string]> = [
  ['deb_kpis', 'debriefing-lancamento'],
  ['acom_kpis', 'acompanhamento-lancamento'],
];

/** Infere o tipo pelas tabelas presentes no dataset; null se nenhuma assinatura casar
 *  (ex.: conversao-perfil/historico/criativos → resolve pelo config). */
export function inferType(dataset: Record<string, unknown> | null | undefined): string | null {
  if (!dataset) return null;
  for (const [tbl, type] of DATASET_SIGNATURE) if (tbl in dataset) return type;
  return null;
}
