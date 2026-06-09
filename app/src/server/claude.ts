/* claude.ts — Anthropic Messages API wrapper (NOT the Agent SDK).
 *
 * generateInsights() forces structured JSON via a single tool with tool_choice,
 * so there's no fragile parsing. The static system prompt + schema are marked for
 * prompt caching. Falls back to a deterministic MOCK when no API key is set (or
 * CLAUDE_MOCK=1), so the whole flow is testable offline. Claude only ever sees the
 * aggregated digest — never raw CSV rows. */

import Anthropic from '@anthropic-ai/sdk';
import type { Digest } from './datasetCatalog.js';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

const SYSTEM = `Você é um analista sênior de marketing/dados. A partir de um DIGEST de números
JÁ CALCULADOS (agregados, sem dados brutos) de uma análise de conversão por perfil,
escreva a prosa autoral de Insights — em português do Brasil, direto e acionável.

REGRAS:
- Use SOMENTE os números do digest. Nunca invente valores nem cite dados que não estão lá.
- Números aparecem só na prosa dos cards (campo "detail"); pode usar <strong> e <em>.
- 2 a 3 zonas: Conclusões (✓ verde), Aprofundamento (↗ âmbar), Atenção (! vermelho).
  Cada zona com 2 a 4 cards. Priorize fatores de ALTA amplitude e papel "qualificador";
  trate "proxy de X" e "baixo impacto" como ressalvas.
- "method" = uma frase curta sobre a metodologia (benchmark = respondentes da pesquisa).
- Responda exclusivamente chamando a ferramenta emit_content.`;

const CONTENT_SCHEMA = {
  type: 'object',
  required: ['insights'],
  properties: {
    insights: {
      type: 'object',
      required: ['header', 'zones', 'method'],
      properties: {
        header: {
          type: 'object', required: ['title'],
          properties: { badge: { type: 'string' }, title: { type: 'string' }, sub: { type: 'string' } },
        },
        zones: {
          type: 'array',
          items: {
            type: 'object', required: ['n', 'color', 'title', 'cards'],
            properties: {
              n: { type: 'string', description: 'um emoji curto: ✓, ↗ ou !' },
              color: { type: 'string', enum: ['green', 'amber', 'red', 'purple'] },
              title: { type: 'string' },
              caption: { type: 'string' },
              cards: {
                type: 'array', minItems: 1, maxItems: 4,
                items: {
                  type: 'object', required: ['tag', 'tagColor', 'title', 'detail'],
                  properties: {
                    tag: { type: 'string' },
                    tagColor: { type: 'string', enum: ['p', 'g', 'a', 'r', 'n'] },
                    title: { type: 'string' },
                    detail: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        method: { type: 'string' },
      },
    },
  },
} as const;

export interface InsightsResult { content: unknown; mocked: boolean }

export async function generateInsights(digest: Digest, opts?: { tone?: string }): Promise<InsightsResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || process.env.CLAUDE_MOCK === '1') return { content: mockContent(digest), mocked: true };

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [{
      name: 'emit_content',
      description: 'Emite o objeto content (insights) no formato de blocos do app.',
      input_schema: CONTENT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
      cache_control: { type: 'ephemeral' },
    }],
    tool_choice: { type: 'tool', name: 'emit_content' },
    messages: [{ role: 'user', content: JSON.stringify({ digest, tone: opts?.tone ?? 'executivo' }) }],
  });
  const tu = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!tu) throw new Error('Claude não retornou tool_use');
  return { content: tu.input, mocked: false };
}

const fmtDiff = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

/** Deterministic offline content — plausible insights straight from the digest.
 *  Replaced by the real model when ANTHROPIC_API_KEY is set. */
function mockContent(d: Digest): unknown {
  const withData = d.criterios.filter((c) => c.melhor && c.pior);
  const rank = [...withData].sort((a, b) => parseFloat(b.amplitude || '0') - parseFloat(a.amplitude || '0'));
  const conclus = rank.slice(0, 3).map((c) => ({
    tag: c.papel || 'Achado', tagColor: 'g',
    title: `${c.label}: "${c.melhor!.grupo}" puxa a conversão`,
    detail: `O grupo <strong>${c.melhor!.grupo}</strong> converte <strong>${fmtDiff(c.melhor!.diff_lcto)}</strong> vs. o benchmark, enquanto "${c.pior!.grupo}" fica em <strong>${fmtDiff(c.pior!.diff_lcto)}</strong>. Amplitude ${c.amplitude ?? '—'}, papel ${c.papel ?? '—'}. <em>[mock]</em>`,
  }));
  const atencao = rank.filter((c) => (c.papel || '').includes('proxy') || (c.papel || '').includes('baixo')).slice(0, 3).map((c) => ({
    tag: 'Ressalva', tagColor: 'a',
    title: `${c.label}: ${c.papel}`,
    detail: `Amplitude ${c.amplitude ?? '—'} e independência ${c.independencia ?? '—'} — priorize com cautela. <em>[mock]</em>`,
  }));
  const zones: unknown[] = [{ n: '✓', color: 'green', title: 'CONCLUSÕES', caption: 'principais achados', cards: conclus }];
  if (atencao.length) zones.push({ n: '!', color: 'red', title: 'ATENÇÃO', caption: 'ler com cuidado', cards: atencao });
  return {
    insights: {
      header: { badge: 'Insights', title: 'Insights Estratégicos', sub: 'Gerado automaticamente a partir dos números agregados.' },
      zones,
      method: 'Benchmark = respondentes da pesquisa. Insights gerados offline (mock); a geração real entra com ANTHROPIC_API_KEY.',
    },
    detalhamentos: {},
  };
}
