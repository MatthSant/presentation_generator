#!/usr/bin/env python3
"""perguntas_calc.py — gera o perguntas.json ranqueado de uma análise.

Dois modos, escolhidos automaticamente:

  • BANCO (análises padrão): se o dataset.json casa com um banco de perguntas
    (banks/), cada pergunta pontua a própria relevância sobre os números já
    calculados. É o caminho das análises padrão (ex.: conversão por perfil).

  • LEGADO (ad-hoc / demo): se nenhum banco casa, usa um perguntas_input.json
    irmão com sinais informados à mão (efeito/consistência/cobertura/confiança)
    e a combinação ponderada fixa abaixo.

Tudo determinístico, stdlib pura. O LLM só escreve a prosa do detalhamento; os
números entram pelos cálculos ou pelos sinais — nunca inventados.

Uso:
  perguntas_calc.py <dataset.json> <out perguntas.json>   # auto (banco → legado)
  perguntas_calc.py --input <input.json> <out.json>        # força o modo legado
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from banks import pick_bank   # noqa: E402

# ── modo legado (sinais à mão) ──────────────────────────────────────────────

DEFAULT_PESOS = {"efeito": 0.45, "consistencia": 0.25, "cobertura": 0.15, "confianca": 0.15}
DEFAULT_EFEITO_REF = 60.0
BANDAS = (("alta", 66.0), ("media", 40.0), ("baixa", 0.0))


def _clamp01(x):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def _banda(rel):
    for nome, piso in BANDAS:
        if rel >= piso:
            return nome
    return "baixa"


def score(sinais, pesos=None, efeito_ref=DEFAULT_EFEITO_REF):
    """Relevância 0–100 de uma pergunta a partir de sinais informados. Função pura."""
    pesos = pesos or DEFAULT_PESOS
    norm = {
        "efeito": _clamp01(abs(float(sinais.get("efeito", 0) or 0)) / (efeito_ref or DEFAULT_EFEITO_REF)),
        "consistencia": _clamp01(sinais.get("consistencia", 0)),
        "cobertura": _clamp01(abs(float(sinais.get("cobertura", 0) or 0)) / 100.0),
        "confianca": _clamp01(sinais.get("confianca", 0)),
    }
    total = sum(pesos.get(k, 0) for k in norm) or 1.0
    return round(sum(pesos.get(k, 0) * norm[k] for k in norm) / total * 100.0, 1)


def legacy_from_input(entrada):
    pesos = entrada.get("pesos") or DEFAULT_PESOS
    efeito_ref = float(entrada.get("efeito_ref") or DEFAULT_EFEITO_REF)
    out = []
    for p in entrada.get("perguntas", []):
        rel = score(p.get("sinais", {}), pesos, efeito_ref)
        out.append({
            "id": p.get("id"), "pergunta": p.get("pergunta", ""),
            "justificativa": p.get("justificativa", ""), "kpis": p.get("kpis", []),
            "relevancia": rel, "nivel": _banda(rel), "deepen": p.get("deepen", {}),
        })
    out.sort(key=lambda x: x["relevancia"], reverse=True)
    return {"pesos": pesos, "efeito_ref": efeito_ref, "perguntas": out}


# ── driver ──────────────────────────────────────────────────────────────────

def _load(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def run(dataset_path, out_path):
    """Banco (se casar) ou legado (perguntas_input.json irmão do out)."""
    dataset = _load(dataset_path) if dataset_path and os.path.exists(dataset_path) else {}
    bank = pick_bank(dataset)
    if bank:
        return {"tipo": bank.TYPE, "perguntas": bank.evaluate_all(dataset)}
    inp = os.path.join(os.path.dirname(out_path), "perguntas_input.json")
    if os.path.exists(inp):
        return legacy_from_input(_load(inp))
    return {"perguntas": []}


def main(argv):
    if len(argv) >= 4 and argv[1] == "--input":
        result = legacy_from_input(_load(argv[2]))
        out_path = argv[3]
    elif len(argv) >= 3:
        result = run(argv[1], argv[2])
        out_path = argv[2]
    else:
        sys.stderr.write("uso: perguntas_calc.py <dataset.json> <out.json>\n")
        return 2
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(json.dumps({"status": "ok", "tipo": result.get("tipo", "custom"),
                      "perguntas": len(result["perguntas"])}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
