/* nvidiaFallback.test.ts — tradução Anthropic ⇄ OpenAI (build.nvidia). Pura, sem
 * rede: garante que o corpo enviado e a resposta lida mantêm o contrato que o
 * fluxo de deepen espera (tool_use / tool_result / usage / tool_choice). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Anthropic from '@anthropic-ai/sdk';
import { toOpenAIBody, fromOpenAI, nvidiaModels } from '../../src/server/nvidiaFallback.ts';

test('toOpenAIBody: system + user string + tool_choice=tool', () => {
  const params = {
    model: 'claude', max_tokens: 100,
    system: [{ type: 'text', text: 'sistema' }],
    tools: [{ name: 'emit', description: 'd', input_schema: { type: 'object', properties: {} } }],
    tool_choice: { type: 'tool', name: 'emit' },
    messages: [{ role: 'user', content: '{"x":1}' }],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming;
  const body = toOpenAIBody(params, 'deepseek');
  assert.equal(body.model, 'deepseek');
  const msgs = body.messages as Array<Record<string, unknown>>;
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[0].content, 'sistema');
  assert.equal(msgs[1].role, 'user');
  assert.deepEqual(body.tool_choice, { type: 'function', function: { name: 'emit' } });
  const tools = body.tools as Array<Record<string, unknown>>;
  assert.equal((tools[0].function as Record<string, unknown>).name, 'emit');
});

test('toOpenAIBody: tool_choice=any → required', () => {
  const params = {
    model: 'c', max_tokens: 10, tools: [{ name: 't', input_schema: {} }],
    tool_choice: { type: 'any' }, messages: [{ role: 'user', content: 'oi' }],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming;
  assert.equal(toOpenAIBody(params, 'm').tool_choice, 'required');
});

test('toOpenAIBody: assistant tool_use + user tool_result → tool_calls + role tool', () => {
  const params = {
    model: 'c', max_tokens: 10,
    messages: [
      { role: 'user', content: 'pergunta' },
      { role: 'assistant', content: [
        { type: 'text', text: 'penso' },
        { type: 'tool_use', id: 'tu_1', name: 'consultar', input: { funcao: 'series' } },
      ] },
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'tu_1', content: '{"status":"ok"}' },
      ] },
    ],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming;
  const msgs = toOpenAIBody(params, 'm').messages as Array<Record<string, unknown>>;
  // [user, assistant(tool_calls), tool]
  const asst = msgs[1];
  assert.equal(asst.role, 'assistant');
  const calls = asst.tool_calls as Array<Record<string, unknown>>;
  assert.equal(calls[0].id, 'tu_1');
  assert.equal((calls[0].function as Record<string, unknown>).name, 'consultar');
  assert.equal(JSON.parse((calls[0].function as Record<string, string>).arguments).funcao, 'series');
  const tool = msgs[2];
  assert.equal(tool.role, 'tool');
  assert.equal(tool.tool_call_id, 'tu_1');
});

test('fromOpenAI: tool_calls → tool_use, texto → text, usage e stop_reason', () => {
  const json = {
    choices: [{ message: { content: '', tool_calls: [
      { id: 'call_9', function: { name: 'emit_modal', arguments: '{"widgets":[]}' } },
    ] } }],
    usage: { prompt_tokens: 12, completion_tokens: 7 },
  };
  const msg = fromOpenAI(json);
  const tu = msg.content.find((b) => b.type === 'tool_use') as { name: string; input: { widgets: unknown[] }; id: string };
  assert.equal(tu.name, 'emit_modal');
  assert.deepEqual(tu.input.widgets, []);
  assert.equal(tu.id, 'call_9');
  assert.equal(msg.stop_reason, 'tool_use');
  assert.equal(msg.usage.input_tokens, 12);
  assert.equal(msg.usage.output_tokens, 7);
});

test('fromOpenAI: só texto → bloco text + end_turn', () => {
  const msg = fromOpenAI({ choices: [{ message: { content: 'resposta reescrita' } }], usage: {} });
  assert.equal(msg.stop_reason, 'end_turn');
  const t = msg.content.find((b) => b.type === 'text') as { text: string };
  assert.equal(t.text, 'resposta reescrita');
});

test('nvidiaModels: usa env override quando presente', () => {
  const prev = process.env.NVIDIA_FALLBACK_MODELS;
  process.env.NVIDIA_FALLBACK_MODELS = ' a/b , c/d ';
  try { assert.deepEqual(nvidiaModels(), ['a/b', 'c/d']); }
  finally { if (prev === undefined) delete process.env.NVIDIA_FALLBACK_MODELS; else process.env.NVIDIA_FALLBACK_MODELS = prev; }
});
