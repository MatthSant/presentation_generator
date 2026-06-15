"""temp — classificação de temperatura por regras (pattern→label), stdlib pura.

Shape unificado (vindo do cliente/fallback geral via config):
    config['temp_rules'] = [{'contains': ['-frio-', 'cold'], 'label': 'Frio'}, ...]
    config['temp_overwrite'] = bool

Match = ILIKE (substring, case-insensitive) de qualquer termo no texto-fonte
(normalmente field_campaign_name); a 1ª regra que casar vence (ordem = prioridade).
Aceita também shapes legados {label: [kw, ...]} para compatibilidade.
"""


def _terms(kws):
    """Lista de termos minúsculos a partir de lista (chips) ou string com vírgulas."""
    if isinstance(kws, str):
        kws = kws.split(',')
    return [str(k).strip().lower() for k in (kws or []) if str(k).strip()]


def normalize_rules(raw):
    """-> [(label, [termo_lower, ...]), ...] preservando a ordem. Aceita:
       - lista [{'contains': [..]|str, 'label': str}, ...]
       - dict  {label: [kw, ...]}  (legado)
    Descarta regras sem label ou sem termos."""
    out = []
    if isinstance(raw, dict):
        for label, kws in raw.items():
            terms = _terms(kws)
            if str(label).strip() and terms:
                out.append((str(label).strip(), terms))
    elif isinstance(raw, list):
        for r in raw:
            if not isinstance(r, dict):
                continue
            label = str(r.get('label') or '').strip()
            terms = _terms(r.get('contains'))
            if label and terms:
                out.append((label, terms))
    return out


def rules_from_config(config, default=None, key='temp_rules'):
    """Resolve as regras: config[key] (shape novo ou legado) → `default`.
    `default` pode ser lista de regras ou dict legado."""
    rules = normalize_rules((config or {}).get(key))
    return rules or normalize_rules(default or [])


def classify(text, rules, fallback='N/C'):
    """Devolve o label da 1ª regra cujo termo for substring de `text` (case-insensitive)."""
    n = str(text or '').lower()
    for label, terms in rules:
        if any(t and t in n for t in terms):
            return label
    return fallback


def apply(rows, rules, src='field_campaign_name', dst='temperatura_lead',
          overwrite=False, fallback='N/C'):
    """Classifica linhas in-place: row[dst] = classify(row[src]). Sem `overwrite`,
    só preenche linhas cujo `dst` está vazio (preserva o que já vier). Nunca toca
    `src`. Devolve a mesma lista."""
    if not rules:
        return rows
    for r in rows:
        if not overwrite and str(r.get(dst) or '').strip():
            continue
        r[dst] = classify(r.get(src), rules, fallback)
    return rows
