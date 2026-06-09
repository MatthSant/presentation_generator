#!/usr/bin/env python3
"""perguntas_calc.py — cálculo FIXO da relevância das perguntas norteadoras.

Determinístico, stdlib pura. Lê um JSON de entrada com as perguntas e seus
sinais quantitativos; devolve as mesmas perguntas com `relevancia` (0–100) e
`nivel` (banda), ordenadas da mais relevante para a menos.

A relevância é uma combinação ponderada de quatro sinais, todos normalizados
para 0–1:

  efeito       amplitude do efeito que a pergunta descreve, em % vs. referência
               (quanto a métrica se move). Normalizado por `efeito_ref` (default 60).
  consistencia 0–1, quão estável é o padrão entre lançamentos/períodos.
  cobertura    representatividade do recorte, em % (peso na base). /100.
  confianca    0–1, adequação estatística (tamanho de amostra, força da associação).

  relevancia = 100 * Σ(peso_i * sinal_i)

Os pesos vêm do bloco `pesos` da entrada (ou um default). A banda `nivel` separa
em alta / media / baixa. O LLM só escreve a prosa das perguntas; os números aqui
nunca são inventados — entram pelos sinais.

Uso:
  python3 perguntas_calc.py <input.json> <output.json>
"""

import json
import sys

DEFAULT_PESOS = {"efeito": 0.45, "consistencia": 0.25, "cobertura": 0.15, "confianca": 0.15}
DEFAULT_EFEITO_REF = 60.0  # % de movimento que satura o sinal de efeito
BANDAS = (("alta", 66.0), ("media", 40.0), ("baixa", 0.0))


def _clamp01(x):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def _normaliza(sinais, efeito_ref):
    efeito = abs(float(sinais.get("efeito", 0) or 0)) / (efeito_ref or DEFAULT_EFEITO_REF)
    cobertura = abs(float(sinais.get("cobertura", 0) or 0)) / 100.0
    return {
        "efeito": _clamp01(efeito),
        "consistencia": _clamp01(sinais.get("consistencia", 0)),
        "cobertura": _clamp01(cobertura),
        "confianca": _clamp01(sinais.get("confianca", 0)),
    }


def _banda(rel):
    for nome, piso in BANDAS:
        if rel >= piso:
            return nome
    return "baixa"


def score(sinais, pesos=None, efeito_ref=DEFAULT_EFEITO_REF):
    """Relevância 0–100 de uma pergunta a partir dos seus sinais. Função pura."""
    pesos = pesos or DEFAULT_PESOS
    norm = _normaliza(sinais, efeito_ref)
    total_peso = sum(pesos.get(k, 0) for k in norm) or 1.0
    rel = sum(pesos.get(k, 0) * norm[k] for k in norm) / total_peso * 100.0
    return round(rel, 1)


def calcula(entrada):
    pesos = entrada.get("pesos") or DEFAULT_PESOS
    efeito_ref = float(entrada.get("efeito_ref") or DEFAULT_EFEITO_REF)
    out = []
    for p in entrada.get("perguntas", []):
        rel = score(p.get("sinais", {}), pesos, efeito_ref)
        out.append({
            "id": p.get("id"),
            "pergunta": p.get("pergunta", ""),
            "justificativa": p.get("justificativa", ""),
            "kpis": p.get("kpis", []),
            "relevancia": rel,
            "nivel": _banda(rel),
            "deepen": p.get("deepen", {}),
        })
    out.sort(key=lambda x: x["relevancia"], reverse=True)
    return {"pesos": pesos, "efeito_ref": efeito_ref, "perguntas": out}


def main(argv):
    if len(argv) < 3:
        sys.stderr.write("uso: perguntas_calc.py <input.json> <output.json>\n")
        return 2
    with open(argv[1], "r", encoding="utf-8") as f:
        entrada = json.load(f)
    resultado = calcula(entrada)
    with open(argv[2], "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)
    print(json.dumps({"status": "ok", "perguntas": len(resultado["perguntas"])}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
