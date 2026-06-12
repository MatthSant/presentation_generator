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
  /** meta.controls.kind emitido pelo gerador (dispatch no client). */
  controlsKind?: string;
  /** Metadados do deep deepen (tool `consultar`). `null` → só modo raso (catálogo). */
  buildDeepenMeta(config: unknown): DeepDeps['meta'] | null;
}

interface PerfilConfig { criterios?: Array<{ id: string; label?: string }>; channels?: string[] }

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
      return {
        criterios: (c?.criterios || []).map((x) => ({ id: x.id, label: x.label || x.id })),
        canais, metricas,
        consultar: {
          funcoes: [
            { id: 'cut_by_criterion', desc: 'uma métrica por grupo de um critério (criterio, metrica)' },
            { id: 'trend', desc: 'a métrica de cada grupo ao longo dos lançamentos (criterio, metrica)' },
            { id: 'crosstab', desc: 'cruzamento de um critério com outro (criterio, cruzar_com)' },
            { id: 'association', desc: 'força de associação entre dois critérios (criterio, cruzar_com)' },
          ],
          params: {
            criterio: { enum: ids, desc: 'critério principal' },
            cruzar_com: { enum: ids, desc: 'segundo critério (só crosstab/association)' },
            canal: { enum: canais },
            metrica: { enum: metricas },
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
      return {
        consultar: {
          funcoes: [
            { id: 'correlacao', desc: 'correlação (Pearson) entre duas métricas ao longo dos criativos válidos (metrica_x, metrica_y)' },
            { id: 'series', desc: 'VÁRIAS métricas por criativo numa tabela só (metrica_x, metrica_y, opcional metrica_z) — use para comparar indicadores lado a lado' },
            { id: 'por_temperatura', desc: 'uma métrica (metrica) agregada por temperatura do lead' },
            { id: 'saturacao_diaria', desc: 'ROAS e retorno por DIA (geral, ou de um criativo) para detectar saturação' },
            { id: 'ranking', desc: 'criativos ordenados por uma métrica (metrica), com as colunas principais' },
            { id: 'benchmark_gap', desc: 'distância média de cada indicador de anúncio (hook/hold/ctr/connect/conv_pagina) frente ao benchmark' },
          ],
          params: {
            metrica: { enum: M, desc: 'métrica do recorte (ranking/por_temperatura)' },
            metrica_x: { enum: M, desc: 'métrica X (correlacao/series)' },
            metrica_y: { enum: M, desc: 'métrica Y (correlacao/series)' },
            metrica_z: { enum: M, desc: 'métrica Z opcional (series — terceira coluna)' },
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
      return {
        consultar: {
          funcoes: [
            { id: 'trend', desc: 'uma métrica (metrica) ao longo dos lançamentos' },
            { id: 'series', desc: 'VÁRIAS métricas por lançamento numa tabela só (metrica_x, metrica_y, opcional metrica_z) — use para comparar evoluções, ex.: CPL, CPM e CTR juntos' },
            { id: 'correlacao', desc: 'correlação (Pearson) entre duas métricas ao longo dos lançamentos (metrica_x, metrica_y)' },
            { id: 'decomposicao', desc: 'decompõe o CPA (= CPL ÷ conversão paga): diz se a variação do CPA foi mais de CPL ou de conversão' },
            { id: 'por_dimensao', desc: 'uma métrica (metrica) por dimensão (canal/plataforma/temperatura) ao longo dos lançamentos' },
          ],
          params: {
            metrica: { enum: M, desc: 'métrica do recorte (trend/por_dimensao)' },
            metrica_x: { enum: M, desc: 'métrica X (correlacao/series)' },
            metrica_y: { enum: M, desc: 'métrica Y (correlacao/series)' },
            metrica_z: { enum: M, desc: 'métrica Z opcional (series — terceira coluna)' },
            dimensao: { enum: ['canal', 'plataforma', 'temperatura'], desc: 'dimensão (por_dimensao)' },
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
