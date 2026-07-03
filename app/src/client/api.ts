/* api.ts — typed fetch wrappers around the server routes. */

import type { ReportData, DataMap, Section, Layout, LayoutItem, Pergunta } from '../shared/types.js';

export interface HistoricoView { dataset: DataMap; sections: Record<string, Section>; layout: Record<string, LayoutItem[]>; }

export class Api {
  constructor(private client: string, private slug: string) {}

  private base(): string { return `/api/${encodeURIComponent(this.client)}/${encodeURIComponent(this.slug)}`; }

  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    if (!res.ok) {
      // O corpo do erro carrega o motivo real (ex.: erros de validação do deepen
      // num 422) — sem lê-lo, o toast só mostraria o status.
      let detail = '';
      let blocking: string[] = [];
      let suggestions: string[] = [];
      let code = '';
      try {
        const body = await res.json() as { error?: string; detail?: unknown; suggestions?: unknown; code?: string };
        blocking = Array.isArray(body.detail) ? body.detail.map(String) : (body.detail ? [String(body.detail)] : []);
        suggestions = Array.isArray(body.suggestions) ? body.suggestions.map(String) : [];
        code = body.code || '';
        detail = [body.error, blocking.join('; ')].filter(Boolean).join(' — ');
      } catch { /* corpo não-JSON: fica só o status */ }
      // anexa as listas estruturadas (erros × sugestões) + code (ex.: 'no_credit') p/ a tela
      const err = new Error(detail || `${init?.method || 'GET'} ${url} → ${res.status}`) as Error & { blocking?: string[]; suggestions?: string[]; code?: string };
      err.blocking = blocking; err.suggestions = suggestions; err.code = code;
      throw err;
    }
    return res.json() as Promise<T>;
  }

  getData(): Promise<ReportData> { return this.json(`${this.base()}/data`); }
  getDataset(): Promise<DataMap> { return this.json(`${this.base()}/dataset`); }
  getSection(id: string): Promise<Section> { return this.json(`${this.base()}/section/${encodeURIComponent(id)}`); }
  getLayout(): Promise<Layout> { return this.json(`${this.base()}/layout`); }

  putLayout(sectionId: string, items: LayoutItem[]): Promise<{ ok: boolean; layout: Layout }> {
    return this.json(`${this.base()}/layout`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionId, items }),
    });
  }

  patchBlock(secId: string, payload: Record<string, unknown>): Promise<{ ok: boolean; blockId: string; section: Section }> {
    return this.json(`${this.base()}/section/${encodeURIComponent(secId)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  deepen(secId: string, blockId: string, prompt: string, prev?: unknown): Promise<{ ok: boolean; modal: { id: string }; mocked: boolean; datasetChanged?: boolean; historyId?: string }> {
    return this.json(`${this.base()}/section/${encodeURIComponent(secId)}/deepen`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockId, prompt, prev }),
    });
  }

  /** Camada barata: reescreve a pergunta solta, ancorada no bloco (se informado). */
  rewriteDeepen(prompt: string, secId?: string, blockId?: string): Promise<{ ok: boolean; rewritten: string; mocked: boolean }> {
    return this.json(`${this.base()}/deepen/rewrite`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, secId, blockId }),
    });
  }

  getPerguntas(): Promise<{ perguntas: Pergunta[] }> { return this.json(`${this.base()}/perguntas`); }

  seguirPergunta(pid: string): Promise<{ ok: boolean; pageId: string; sectionId: string; mocked: boolean; historyId?: string }> {
    return this.json(`${this.base()}/perguntas/${encodeURIComponent(pid)}/seguir`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
  }
  ignorarPergunta(pid: string): Promise<{ ok: boolean }> {
    return this.json(`${this.base()}/perguntas/${encodeURIComponent(pid)}/ignorar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
  }
  addCustomPergunta(pergunta: string): Promise<{ ok: boolean; pageId: string; sectionId: string; mocked: boolean; historyId?: string }> {
    return this.json(`${this.base()}/perguntas/custom`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pergunta }),
    });
  }

  rateDeepen(historyId: string, rating: number, feedback?: string): Promise<{ ok: boolean; rating: number }> {
    return this.json(`${this.base()}/deepen/${encodeURIComponent(historyId)}/rate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, feedback }),
    });
  }

  getDeepenRatings(ids: string[]): Promise<{ entries: Array<{ id: string; rating: number | null; status?: string }> }> {
    return this.json(`/api/deepen-history?ids=${encodeURIComponent(ids.join(','))}&limit=${ids.length}`);
  }

  approveDeepen(historyId: string): Promise<{ ok: boolean; status: string }> {
    return this.json(`${this.base()}/deepen/${encodeURIComponent(historyId)}/aprovar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  }

  revisarDet(sectionId: string, comentario: string): Promise<{ ok: boolean; sectionId: string; historyId: string; mocked: boolean }> {
    return this.json(`${this.base()}/det/${encodeURIComponent(sectionId)}/revisar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comentario }),
    });
  }

  descartarDet(sectionId: string): Promise<{ ok: boolean; sectionId: string; pageRemoved: boolean }> {
    return this.json(`${this.base()}/det/${encodeURIComponent(sectionId)}/descartar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
  }

  historicoRender(launches: string[] | null, metric: string, mode?: string): Promise<HistoricoView> {
    return this.json(`${this.base()}/render`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ launches, metric, mode }),
    });
  }

  /** Recompute genérico da vista — o corpo varia por tipo (criativos: mode/min_invest/temp). */
  renderView(body: Record<string, unknown>): Promise<HistoricoView> {
    return this.json(`${this.base()}/render`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  watch(onSection: (id: string) => void, onProgress?: (msg: string) => void): () => void {
    // Static mode (?static): skip the live-reload SSE so headless tooling
    // (screenshots/print) can reach network-idle.
    if (new URLSearchParams(location.search).has('static')) return () => {};
    const es = new EventSource(`${this.base()}/watch`);
    es.onmessage = ({ data }) => {
      if (!data || data === 'connected') return;
      if (data.startsWith('progress:')) { onProgress?.(data.slice(9)); return; }
      onSection(data);
    };
    let closed = false;
    es.onerror = () => { if (!closed) { /* browser auto-reconnects */ } };
    return () => { closed = true; es.close(); };
  }
}
