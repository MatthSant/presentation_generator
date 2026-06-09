/* api.ts — typed fetch wrappers around the server routes. */

import type { ReportData, DataMap, Section, Layout, LayoutItem } from '../shared/types.js';

export class Api {
  constructor(private client: string, private slug: string) {}

  private base(): string { return `/api/${encodeURIComponent(this.client)}/${encodeURIComponent(this.slug)}`; }

  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`${init?.method || 'GET'} ${url} → ${res.status}`);
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

  deepen(secId: string, blockId: string, prompt: string, prev?: unknown): Promise<{ ok: boolean; modal: { id: string }; mocked: boolean; datasetChanged?: boolean }> {
    return this.json(`${this.base()}/section/${encodeURIComponent(secId)}/deepen`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockId, prompt, prev }),
    });
  }

  watch(onSection: (id: string) => void): () => void {
    // Static mode (?static): skip the live-reload SSE so headless tooling
    // (screenshots/print) can reach network-idle.
    if (new URLSearchParams(location.search).has('static')) return () => {};
    const es = new EventSource(`${this.base()}/watch`);
    es.onmessage = ({ data }) => { if (data && data !== 'connected') onSection(data); };
    let closed = false;
    es.onerror = () => { if (!closed) { /* browser auto-reconnects */ } };
    return () => { closed = true; es.close(); };
  }
}
