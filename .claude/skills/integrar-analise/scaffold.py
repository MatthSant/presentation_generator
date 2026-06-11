#!/usr/bin/env python3
"""scaffold — esqueleto de um TIPO de análise novo para o app (skill integrar-analise).

Cria pysrc/<tipo>/{calc.py, build_report.py} com o contrato já no lugar e imprime o
checklist dos pontos que precisam de edição manual (typeRegistry, index.html, perguntas).
NÃO toca em arquivos existentes — só cria a pasta do tipo se ela não existir.

Uso:
    py -3 scaffold.py <tipo> [--app DIR]
    # ex.: py -3 scaffold.py criativos --app app
"""
import os, sys, argparse

CALC = '''"""calc — motor descritivo do tipo "{tipo}" (stdlib pura, sem pandas)."""
import csv


def load_rows(path):
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        head = f.read(8192); f.seek(0)
        sep = max(",;\\t", key=lambda c: head.count(c))
        return list(csv.DictReader(f, delimiter=sep))


def fnum(v):
    if v is None:
        return 0.0
    s = str(v).strip()
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        try:
            return float(s.replace(".", "").replace(",", "."))
        except ValueError:
            return 0.0


def soma(rows, col):
    return sum(fnum(r.get(col)) for r in rows)


def pct(a, b):
    a, b = fnum(a), fnum(b)
    return round(a / b * 100, 4) if b > 0 else None


def build_series(rows, opts=None):
    """TODO: agregue por entidade e devolva as estruturas que o build_report serializa."""
    return {{"rows": rows}}
'''

BUILD = '''"""build_report — gerador da análise "{tipo}" (3 camadas do app).

`assemble(rows, config, content, opts)` (puro) -> {{dataset, data, layout, sections}}.
`build(csv, config, content, out_dir)` carrega o CSV, chama assemble e grava.
"""
import sys, os, json, datetime
_here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _here)
sys.path.insert(0, os.path.dirname(_here))   # pysrc/ -> pacote common
import calc
from common.layout import Grid
from common.fmt import money, pctf, xf, intf, safe, fmtval
from common.preserve import preserve


def assemble(rows, config, content, opts=None):
    opts = opts or {{}}
    S = calc.build_series(rows, opts)
    dataset, sections, layouts = {{}}, {{}}, {{}}

    # ── TODO: dataset (tabelas long-format) ──────────────────────────────────
    # dataset["<tabela>"] = {{"dims": ["<dim>"], "filters": [], "rows": [ {{...}} ]}}

    # ── TODO: seção s01 (widgets + grid) ─────────────────────────────────────
    pg = Grid()
    widgets = []
    # widgets.append({{"id": "w1", "type": "chart", ...}}); pg.add("w1", "chart", 12, 4)
    sections["s01"] = {{"id": "s01", "header": {{"badge": "Panorama", "title": "{Tipo}"}}, "widgets": widgets}}
    layouts["s01"] = pg.items

    pages = [{{"id": "p1", "label": "Panorama", "sections": [{{"id": "s01", "label": "Panorama"}}]}}]
    created = (config or {{}}).get("created_at") or datetime.date.today().isoformat()
    data_json = {{"meta": {{"client": config["client"], "title": config["title"], "type": "dashboard",
                          "theme": "light", "created_at": created, "filters": [],
                          "controls": {{"kind": "{tipo}", "pages": ["p1"]}},
                          "nav": "topnav"}},   # "sidebar" para nav lateral (recurso de plataforma)
                 "pages": pages}}
    return {{"dataset": dataset, "data": data_json,
            "layout": {{"sections": layouts, "updatedAt": f"{{created}}T00:00:00.000Z"}},
            "sections": sections}}


def build(csv_path, config, content, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    rows = calc.load_rows(csv_path)
    r = assemble(rows, config, content, {{}})
    preserve(out_dir, r["data"], r["sections"])
    def dump(name, obj):
        json.dump(obj, open(os.path.join(out_dir, name), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    dump("dataset.json", r["dataset"]); dump("data.json", r["data"]); dump("layout.json", r["layout"])
    for sid, sec in r["sections"].items():
        dump(f"{{sid}}.json", sec)
    return {{"tables": len(r["dataset"]), "sections": len(r["sections"]), "pages": len(r["data"]["pages"])}}


if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("uso: build_report.py <config.json> <content.json> <csv> <out_dir>"); sys.exit(1)
    cfg, content_path, csv_path, out = sys.argv[1:5]
    config = json.load(open(cfg, encoding="utf-8"))
    content = json.load(open(content_path, encoding="utf-8")) if os.path.exists(content_path) else {{}}
    print("OK ->", build(csv_path, config, content, out))
'''

CHECKLIST = """
Esqueleto criado em {dest}. Falta editar à mão (ver SKILL.md):
  1. typeRegistry.ts  -> adicionar TYPES['{tipo}'] (label, pysrcDir='{tipo}', controlsKind,
     gerarPage='gerar-{tipo}.html', montadorPage='montador-{tipo}.html', validateConfig, buildDeepenMeta).
  2. public/index.html -> link para /gerar-{tipo}.html
  3. public/gerar-{tipo}.html + montador-{tipo}.html (clonar dos *-historico).
  4. pysrc/perguntas/banks/{tipo}.py (+ registrar em banks/__init__.py) se houver perguntas.
  5. Preencher os TODOs de calc.py e build_report.py com a lógica da fonte.
  6. Feature nova? Generalize via meta (ex.: meta.nav='sidebar'), nunca por tipo.
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("tipo")
    ap.add_argument("--app", default="app")
    a = ap.parse_args()
    tipo = a.tipo.strip().lower()
    dest = os.path.join(a.app, "pysrc", tipo)
    if os.path.exists(dest):
        print(f"[abort] {dest} já existe — não vou sobrescrever."); sys.exit(1)
    os.makedirs(dest)
    cap = tipo.replace("-", " ").title()
    open(os.path.join(dest, "calc.py"), "w", encoding="utf-8").write(CALC.format(tipo=tipo))
    open(os.path.join(dest, "build_report.py"), "w", encoding="utf-8").write(BUILD.format(tipo=tipo, Tipo=cap))
    print(CHECKLIST.format(dest=dest, tipo=tipo))


if __name__ == "__main__":
    main()
