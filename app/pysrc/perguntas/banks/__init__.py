"""Registry dos bancos de perguntas por tipo de análise.

Cada banco é um módulo com:
  TYPE          -> str identificador do tipo de análise
  detect(ds)    -> bool: reconhece o dataset.json daquela análise
  evaluate_all(ds) -> list[pergunta]: perguntas já com relevância/nível/kpis/prompt

Para adicionar uma análise padrão, importe o módulo e inclua em BANKS.
A ordem importa: o primeiro `detect` verdadeiro vence.
"""
from . import conversao_perfil
from . import historico_lancamentos
from . import criativos
from . import acompanhamento_lancamento

BANKS = [conversao_perfil, historico_lancamentos, criativos, acompanhamento_lancamento]


def pick_bank(dataset):
    for b in BANKS:
        try:
            if b.detect(dataset):
                return b
        except Exception:
            continue
    return None
