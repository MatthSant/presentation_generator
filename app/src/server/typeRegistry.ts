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
  /** meta.controls.kind emitido pelo gerador (dispatch no client). */
  controlsKind?: string;
  /** Metadados do deep deepen (tool `consultar`). `null` → só modo raso (catálogo). */
  buildDeepenMeta(config: unknown): DeepDeps['meta'] | null;
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
    supportsInsights: false,
    queryScript: 'query_api.py',          // modo FUNDO: séries/correlação/tendência por dia
    gerarPage: 'gerar-acompanhamento.html',
    montadorPage: 'montador-acompanhamento.html',
    controlsKind: 'acompanhamento-lancamento',
    validateConfig() { return []; },
    buildDeepenMeta() {
      const M = ['leads', 'investimento', 'cpl', 'cpmql', 'taxa_resp', 'taxa_qual',
                 'conv_pag', 'cpm', 'ctr', 'hook', 'hold', 'connect'];
      const G = genericFuncoes('recorte');
      return {
        consultar: {
          funcoes: [G.tabela, G.trend, G.variacao, G.series, G.series_long, G.correlacao, G.ranking,
            { id: 'cruzar_dia', desc: 'UMA métrica por DIA × dimensão (temperatura/canal/origem) em formato LONG (dia/serie/valor) → UM gráfico multi-linha comparando grupos no tempo (bind x="dia", series="serie", y="valor"). Use NO LUGAR de vários gráficos separados (ex.: "CPL por dia: Quente × Morno" = 1 gráfico).' },
            { id: 'decomposicao', desc: 'decompõe a VARIAÇÃO de cpl ou cpmql (início → últimos dias) nos fatores, com a CONTRIBUIÇÃO % de cada (CPL ← CPM/CTR/Connect/Conv.Página; CPMQL ← CPL/Qualidade). Use p/ "o custo subiu por mídia ou por qualificação?" — o motor calcula a atribuição, NÃO faça a álgebra na mão (param: metrica=cpl|cpmql).' },
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
          },
        },
      };
    },
  },
  'debriefing-lancamento': {
    type: 'debriefing-lancamento',
    label: 'Debriefing de Lançamento',
    pysrcDir: 'debriefing-lancamento',
    supportsInsights: false,
    queryScript: 'query_api.py',          // modo FUNDO: frames + decomposição + drill-down por escopo/canal/temperatura/campanha/criativo/publico/semana
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
