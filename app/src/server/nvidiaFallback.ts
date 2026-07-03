/* nvidiaFallback.ts — fallback OpenAI-compatible (build.nvidia) quando a API da
 * Anthropic está SEM CRÉDITO.
 *
 * Todas as chamadas ao Claude passam por loggedCreate(); quando ela pega um erro
 * TERMINAL de crédito e há NVIDIA_API_KEY, traduzimos os params (formato Anthropic
 * Messages) para o /chat/completions da NVIDIA, tentamos uma lista de modelos em
 * ordem (melhor → pior) e devolvemos a resposta traduzida de volta ao formato
 * Anthropic.Message — então o resto do fluxo (gate, validação, reparo) não muda.
 *
 * Só um fetch — a NVIDIA é OpenAI-compatible, sem dependência nova. */

import type Anthropic from '@anthropic-ai/sdk';

const DEFAULT_BASE = 'https://integrate.api.nvidia.com/v1';
// Melhor → pior p/ o NOSSO caso (deepen = agentic tool-use multi-turn + JSON forçado),
// não raciocínio puro: lidera o GLM-5.2 (flagship agentic/coding). IDs exatos variam no
// build.nvidia; sobrescreva com NVIDIA_FALLBACK_MODELS="a,b,c" se preciso.
const DEFAULT_MODELS = 'z-ai/glm-5.2,deepseek-ai/deepseek-v4-pro,moonshotai/kimi-k2.6';

export function nvidiaConfigured(): boolean {
  return !!process.env.NVIDIA_API_KEY;
}
export function nvidiaModels(): string[] {
  return (process.env.NVIDIA_FALLBACK_MODELS || DEFAULT_MODELS).split(',').map((s) => s.trim()).filter(Boolean);
}

type AnyRec = Record<string, unknown>;

/** Achata `system` (string | array de blocos {type:text,text}) numa string. */
function systemText(sys: Anthropic.MessageCreateParamsNonStreaming['system']): string {
  if (!sys) return '';
  if (typeof sys === 'string') return sys;
  return sys.map((b) => (typeof b === 'string' ? b : b.type === 'text' ? b.text : '')).join('\n');
}

/** Anthropic Messages → corpo OpenAI /chat/completions p/ um modelo. Pura (testável). */
export function toOpenAIBody(params: Anthropic.MessageCreateParamsNonStreaming, model: string): AnyRec {
  const messages: AnyRec[] = [];
  const sys = systemText(params.system);
  if (sys) messages.push({ role: 'system', content: sys });

  for (const m of params.messages) {
    const content = m.content;
    if (typeof content === 'string') { messages.push({ role: m.role, content }); continue; }
    // Conteúdo em blocos: separa texto, tool_use (assistant) e tool_result (→ role 'tool').
    const texts: string[] = [];
    const toolCalls: AnyRec[] = [];
    const toolResults: AnyRec[] = [];
    for (const b of content as Anthropic.ContentBlockParam[]) {
      if (b.type === 'text') texts.push(b.text);
      else if (b.type === 'tool_use') toolCalls.push({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } });
      else if (b.type === 'tool_result') {
        const c = b.content;
        const txt = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (x.type === 'text' ? x.text : '')).join('') : '';
        toolResults.push({ role: 'tool', tool_call_id: b.tool_use_id, content: txt });
      }
    }
    if (toolResults.length) { for (const t of toolResults) messages.push(t); continue; }
    if (toolCalls.length) { messages.push({ role: 'assistant', content: texts.join('\n') || null, tool_calls: toolCalls }); continue; }
    messages.push({ role: m.role, content: texts.join('\n') });
  }

  const body: AnyRec = { model, messages, max_tokens: params.max_tokens, temperature: 0 };
  if (params.tools?.length) {
    body.tools = params.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: (t as { description?: string }).description, parameters: (t as { input_schema?: unknown }).input_schema },
    }));
    const tc = params.tool_choice;
    if (tc?.type === 'tool') body.tool_choice = { type: 'function', function: { name: tc.name } };
    else if (tc?.type === 'any') body.tool_choice = 'required';
    else body.tool_choice = 'auto';
  }
  return body;
}

/** Resposta OpenAI → Anthropic.Message (só os campos que o fluxo consome: content,
 *  usage, stop_reason). Pura (testável). */
export function fromOpenAI(json: AnyRec): Anthropic.Message {
  const choice = (json.choices as AnyRec[] | undefined)?.[0] as AnyRec | undefined;
  const msg = (choice?.message || {}) as AnyRec;
  const content: AnyRec[] = [];
  const toolCalls = (msg.tool_calls as AnyRec[] | undefined) || [];
  for (const tc of toolCalls) {
    const fn = (tc.function || {}) as AnyRec;
    let input: unknown = {};
    try { input = JSON.parse(String(fn.arguments || '{}')); } catch { input = {}; }
    content.push({ type: 'tool_use', id: String(tc.id || `tc_${content.length}`), name: String(fn.name || ''), input });
  }
  if (typeof msg.content === 'string' && msg.content.trim()) content.push({ type: 'text', text: msg.content });
  const usage = (json.usage || {}) as AnyRec;
  return {
    content,
    stop_reason: toolCalls.length ? 'tool_use' : 'end_turn',
    usage: { input_tokens: Number(usage.prompt_tokens || 0), output_tokens: Number(usage.completion_tokens || 0) },
  } as unknown as Anthropic.Message;
}

/** Traduz + tenta os modelos em ordem no build.nvidia; devolve a 1ª resposta OK
 *  como Anthropic.Message. `note` recebe qual modelo respondeu (p/ log). */
export async function nvidiaFallback(
  params: Anthropic.MessageCreateParamsNonStreaming,
  note?: (msg: string) => void,
): Promise<Anthropic.Message> {
  const apiKey = process.env.NVIDIA_API_KEY!;
  const base = process.env.NVIDIA_BASE_URL || DEFAULT_BASE;
  const models = nvidiaModels();
  let lastErr: unknown;
  for (const model of models) {
    try {
      const resp = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(toOpenAIBody(params, model)),
      });
      if (!resp.ok) { lastErr = new Error(`NVIDIA ${model}: HTTP ${resp.status} ${(await resp.text()).slice(0, 200)}`); continue; }
      const json = (await resp.json()) as AnyRec;
      const out = fromOpenAI(json);
      if (!out.content.length) { lastErr = new Error(`NVIDIA ${model}: resposta vazia`); continue; }
      note?.(`fallback NVIDIA: ${model}`);
      return out;
    } catch (e) { lastErr = e; }
  }
  throw lastErr instanceof Error ? lastErr : new Error('NVIDIA fallback falhou');
}
