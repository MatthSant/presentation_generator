"""preserve — salvaguarda de regeneração: nada que o consultor criou se perde.

Regenerar uma análise reescreve data.json e as seções sXX.json. O que é MUTÁVEL
pós-geração e precisa sobreviver:
  • seções det-*.json (detalhamentos seguidos) + a página "Detalhamentos" na nav;
  • a página "Perguntas norteadoras" (kind: perguntas) já criada;
  • as MODAIS de deepen anexadas dentro de cada sXX.json (section.modals +
    a ref `modal` no bloco de origem).

`preserve(out_dir, data, sections)` muta `data['pages']` e cada seção em
`sections` ANTES da gravação. Chamado pelos dois build_report (perfil e
histórico). Idempotente; análises novas (dir vazio) passam ilesas."""
import json
import os


def _load(path):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None


def preserve(out_dir, data, sections):
    pages = data.setdefault('pages', [])

    # 1) Página "Detalhamentos" reconstruída a partir dos det-*.json no disco —
    #    labels limpos (título da pergunta) e sem órfãos.
    dets = sorted(f[:-5] for f in os.listdir(out_dir)
                  if f.startswith('det-') and f.endswith('.json')) if os.path.isdir(out_dir) else []
    if dets:
        detp = next((p for p in pages if p.get('id') == 'detalhamentos'), None)
        if detp is None:
            detp = {'id': 'detalhamentos', 'label': 'Detalhamentos', 'sections': []}
            idx = next((i for i, p in enumerate(pages) if p.get('kind') == 'perguntas'), len(pages))
            pages.insert(idx, detp)
        detp['sections'] = []
        for sid in dets:
            sec = _load(os.path.join(out_dir, f'{sid}.json')) or {}
            label = (sec.get('header', {}).get('title') or sid)[:42]
            detp['sections'].append({'id': sid, 'label': label})

    # 2) Página de perguntas preservada do data.json anterior (recriada sob
    #    demanda pela rota, mas não deve sumir entre regenerações).
    if not any(p.get('kind') == 'perguntas' for p in pages):
        prev = _load(os.path.join(out_dir, 'data.json'))
        pp = next((p for p in (prev or {}).get('pages', []) if p.get('kind') == 'perguntas'), None)
        if pp:
            pages.append(pp)

    # 3) Modais de deepen: re-anexa section.modals + a ref `modal` dos blocos da
    #    versão anterior de cada seção regenerada. Modais cujo bloco de origem
    #    sumiu ficam em section.modals sem ref (não se apaga trabalho de IA pago).
    for sid, sec in (sections or {}).items():
        prev = _load(os.path.join(out_dir, f'{sid}.json'))
        prev_modals = (prev or {}).get('modals') or []
        if not prev_modals:
            continue
        sec['modals'] = prev_modals
        new_by_id = {w.get('id'): w for w in sec.get('widgets', [])}
        for w in (prev or {}).get('widgets', []):
            mid = w.get('modal')
            tgt = new_by_id.get(w.get('id'))
            if mid and tgt is not None and not tgt.get('modal'):
                tgt['modal'] = mid
        if prev.get('historyId') and not sec.get('historyId'):
            sec['historyId'] = prev['historyId']

    return data
