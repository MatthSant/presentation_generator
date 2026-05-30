/* blocks.ts — PATCH a section's widgets (flat model) + audit log in block_edits.
 *
 * Old model traversed row/g2/g3/g4 containers; the new view is a flat `widgets`
 * array (plus per-modal `widgets`), so we just scan those lists by id. */

import crypto from 'node:crypto';
import path from 'node:path';
import type { Express } from 'express';
import type { Ctx } from '../context.js';
import type { ColorToken, Section, Widget, WidgetType } from '../../shared/types.js';
import { analysisDir, isSafeSeg, readJson, writeJson } from '../fsutil.js';

/** Editable fields per widget type (everything else in the body is ignored). */
const ALLOWED: Partial<Record<WidgetType, string[]>> = {
  'find-block':  ['tag', 'tagColor', 'title', 'detail', 'modal'],
  'find-note':   ['text'],
  'request':     ['text', 'status'],
  'highlight':   ['text', 'label', 'color'],
  'ni':          ['n', 'title', 'why', 'action'],
  'ni-vertical': ['n', 'title', 'why', 'action'],
  'label-sec':   ['text', 'sub'],
  'xs':          ['text'],
  'chart':       ['title', 'height'],
  'table':       ['caption'],
  'heatmap':     ['caption'],
};

/** Widget types the editor can create from scratch. */
const CREATABLE: Record<string, { prefix: string; make: (c: Record<string, unknown>) => Widget }> = {
  'find-block': {
    prefix: 'fb-',
    make: (c): Widget => ({
      id: '', type: 'find-block',
      tag: String(c.tag ?? 'Achado'),
      tagColor: (typeof c.tagColor === 'string' ? c.tagColor : 'p') as ColorToken,
      title: String(c.title ?? ''),
      ...(c.detail != null ? { detail: String(c.detail) } : {}),
    }),
  },
  'request': {
    prefix: 'rq-',
    make: (c): Widget => ({
      id: '', type: 'request',
      text: String(c.text ?? ''),
      status: c.status != null ? String(c.status) : 'pending',
    }),
  },
};

function fnv36(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/** Flat list of every widget in a section (top-level + inside modals). */
function allWidgets(section: Section): Widget[] {
  const list = [...(section.widgets || [])];
  for (const m of section.modals || []) list.push(...(m.widgets || []));
  return list;
}

export function registerBlocks(app: Express, ctx: Ctx): void {
  const log = ctx.db.prepare(`
    INSERT INTO block_edits
      (id, client, slug, section_id, section_label, block_id, block_type, action, changes, snapshot, created_at)
    VALUES
      (@id, @client, @slug, @section_id, @section_label, @block_id, @block_type, @action, @changes, @snapshot, @created_at)
  `);

  app.patch('/api/:client/:slug/section/:secId', (req, res) => {
    const { client, slug, secId } = req.params;
    const dir = analysisDir(ctx.out, client, slug);
    if (!dir || !isSafeSeg(secId)) { res.status(400).json({ error: 'bad path' }); return; }

    const file = path.join(dir, `${secId}.json`);
    const section = readJson<Section>(file);
    if (!section) { res.status(404).json({ error: 'section not found' }); return; }

    const body = (req.body || {}) as Record<string, unknown>;
    const action = String(body.action || 'update');
    const changes = (body.changes && typeof body.changes === 'object'
      ? body.changes : {}) as Record<string, unknown>;
    const sectionLabel = section.header?.title || '';

    let blockId = typeof body.blockId === 'string' ? body.blockId : '';
    let blockType = '';
    let snapshot: unknown = {};

    if (action === 'create') {
      const type = String(body.blockType || '');
      const spec = CREATABLE[type];
      if (!spec) { res.status(400).json({ error: `cannot create widget of type "${type}"` }); return; }
      blockId = spec.prefix + fnv36(`${secId}|${type}|${Date.now()}|${Math.random()}`);
      const widget = { ...spec.make(changes), id: blockId };
      (section.widgets ||= []).push(widget);
      blockType = type;
      snapshot = widget;
    } else if (action === 'delete') {
      const before = section.widgets.length;
      const removed = section.widgets.find(w => w.id === blockId);
      section.widgets = section.widgets.filter(w => w.id !== blockId);
      for (const m of section.modals || []) {
        if (m.widgets) m.widgets = m.widgets.filter(w => w.id !== blockId);
      }
      const after = section.widgets.length;
      if (!removed && before === after) { res.status(404).json({ error: 'block not found' }); return; }
      blockType = removed?.type || '';
      snapshot = removed || {};
    } else { // update
      const widget = allWidgets(section).find(w => w.id === blockId);
      if (!widget) { res.status(404).json({ error: 'block not found' }); return; }
      blockType = widget.type;
      const allow = ALLOWED[widget.type] || [];
      const w = widget as unknown as Record<string, unknown>;
      for (const key of allow) {
        if (key in changes) {
          if (changes[key] === null) delete w[key];
          else w[key] = changes[key];
        }
      }
      snapshot = widget;
    }

    ctx.skipNextSSE.add(`${secId}.json`);
    writeJson(file, section);

    log.run({
      id: crypto.randomUUID(),
      client, slug,
      section_id: secId, section_label: sectionLabel,
      block_id: blockId, block_type: blockType,
      action,
      changes: JSON.stringify(changes),
      snapshot: JSON.stringify(snapshot),
      created_at: new Date().toISOString(),
    });

    res.json({ ok: true, blockId, section });
  });
}
