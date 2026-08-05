"""preserve — salvaguarda de regeneração: nada que o consultor criou se perde.

Regenerar uma análise reescreve data.json e as seções sXX.json. O que é MUTÁVEL
pós-geração e precisa sobreviver:
  • seções det-*.json (aprofundamentos seguidos) + a página "Aprofundamentos" (id detalhamentos) na nav;
  • a página "Perguntas norteadoras" (kind: perguntas) já criada;
  • as MODAIS de deepen anexadas dentro de cada sXX.json (section.modals +
    a ref `modal` no bloco de origem).

`preserve(out_dir, data, sections)` muta `data['pages']` e cada seção em
`sections` ANTES da gravação. Chamado pelos dois build_report (perfil e
histórico). Idempotente; análises novas (dir vazio) passam ilesas."""
import json
import os
import re
import time


def _load(path):
    """None só quando o arquivo NÃO EXISTE (análise nova). Arquivo presente mas
    ilegível é outra história: era engolido e o preserve seguia como se não
    houvesse nada a preservar — um rebuild concorrendo com uma escrita do deepen
    apagava TODAS as tabelas q-* e modais em silêncio. Escrita em andamento se
    resolve em instantes → retry curto; persistindo, aborta o build (perder a
    geração é recuperável, perder detalhamento pago não é)."""
    if not os.path.exists(path):
        return None
    err = None
    for _ in range(5):
        try:
            with open(path, encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            err = e
            time.sleep(0.2)
    raise RuntimeError(f'preserve: {os.path.basename(path)} existe mas está ilegível ({err}) — abortando para não descartar conteúdo pós-geração')


def write_json(path, obj):
    """Escrita atômica (tmp + os.replace): json.dump direto trunca o arquivo antes
    de escrever, e um leitor concorrente (deepen lendo dataset.json, SSE) via o
    JSON pela metade — a outra ponta do mesmo bug que o _load acima mitiga."""
    tmp = f'{path}.{os.getpid()}.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def preserve_dataset(out_dir, dataset):
    """Reanexa as tabelas de deep-query (`q-*`) do dataset anterior ao novo.

    Os detalhamentos (det-*.json / modais) fazem bind a tabelas `q-<modal>-<n>`
    que o deepen grava SÓ no dataset.json do output (não vêm do CSV). Uma
    regeneração reescreve o dataset a partir do CSV e, sem isso, apagaria essas
    tabelas — deixando todo detalhamento já feito com gráfico/tabela vazios.
    Mantém as chaves `q-*` antigas que o novo build não recriou. Idempotente."""
    prev = _load(os.path.join(out_dir, 'dataset.json')) or {}
    for k, v in prev.items():
        if k.startswith('q-') and k not in dataset:
            dataset[k] = v
    return dataset


def preserve(out_dir, data, sections):
    pages = data.setdefault('pages', [])

    # 1) Página "Aprofundamentos" (id detalhamentos) reconstruída a partir dos det-*.json no disco —
    #    labels limpos (título da pergunta) e sem órfãos.
    dets = sorted(f[:-5] for f in os.listdir(out_dir)
                  if f.startswith('det-') and f.endswith('.json')) if os.path.isdir(out_dir) else []
    if dets:
        detp = next((p for p in pages if p.get('id') == 'detalhamentos'), None)
        if detp is None:
            detp = {'id': 'detalhamentos', 'label': 'Aprofundamentos', 'sections': []}
            idx = next((i for i, p in enumerate(pages) if p.get('kind') == 'perguntas'), len(pages))
            pages.insert(idx, detp)
        detp['sections'] = []
        for sid in dets:
            sec = _load(os.path.join(out_dir, f'{sid}.json')) or {}
            # O título do detalhamento é a PERGUNTA feita — costuma passar do espaço da
            # sidebar. Corta com reticências: sem elas a frase morre no meio da palavra
            # e parece bug ("...maior oportunidade em cr").
            title = (sec.get('header', {}).get('title') or sid).strip()
            label = title if len(title) <= 42 else title[:41].rstrip() + '…'
            # `title` sempre, mesmo quando igual ao label: declarar o título separado diz
            # ao client que o `label` é abreviação de nav, e que o título de verdade é
            # conteúdo da página (aqui, a pergunta feita). Só emitir no caso truncado
            # deixaria a pergunta curta sem masthead — a MESMA página com cara diferente
            # por causa de 1 caractere.
            detp['sections'].append({'id': sid, 'label': label, 'title': title})

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


def preserve_layout(out_dir, layout):
    """Reanexa ao layout novo as entradas de seções que o build NÃO produz.

    A disposição de um aprofundamento (det-*) é escolhida pelo agente de layout no
    deepen e gravada só no layout.json — o build reescreve o arquivo inteiro com as
    seções sXX e a apagava em TODA regeneração. O det-*.json sobrevivia (preserve),
    mas sem coordenadas o client cai no fluxo default por tipo, uma coluna dupla que
    parece tabela. Mantém a entrada anterior de toda seção que o novo build não
    redefiniu e cujo arquivo ainda existe no disco. Idempotente."""
    prev = _load(os.path.join(out_dir, 'layout.json')) or {}
    secs = layout.setdefault('sections', {})
    for sid, items in (prev.get('sections') or {}).items():
        if sid not in secs and os.path.exists(os.path.join(out_dir, f'{sid}.json')):
            secs[sid] = items
    return layout


def prune_sections(out_dir, sections):
    """Apaga os `sXX.json` que a geração NÃO produziu mais.

    O build grava todas as seções do assemble, mas nunca removia as antigas: se a
    análise ENCOLHE (ex.: um filtro passa a recortar o dump, ou o CSV novo tem menos
    entidades), os arquivos sobram apontando para datasets que já não existem — o
    relatório não os mostra (data.json não os referencia), mas o validate acusa e o
    diretório vira lixo acumulado.

    Só mexe no padrão `s<dígitos>.json` — det-*.json (detalhamentos) e o resto ficam.
    """
    if not os.path.isdir(out_dir):
        return 0
    keep = set(sections or {})
    n = 0
    for f in os.listdir(out_dir):
        m = re.fullmatch(r'(s\d+)\.json', f)
        if m and m.group(1) not in keep:
            os.remove(os.path.join(out_dir, f))
            n += 1
    return n
