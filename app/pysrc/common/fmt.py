"""fmt — formatadores numéricos pt-BR compartilhados pelos geradores.

Movidos sem alteração de comportamento (output byte-idêntico):
  • do histórico:   money, pctf, xf, intf, safe, fmtval
  • do conv_calc:   fmtP, fmtPabs, fmt_pp
"""


def money(v):
    v = v or 0
    if abs(v) >= 1e6: return f'R$ {v / 1e6:.1f}M'
    if abs(v) >= 1e3: return f'R$ {v / 1e3:.0f}k'
    # Valores pequenos (custos unitários: CPM/CPL/CPC/CPMQL/CAC) precisam de 2 casas —
    # arredondar para inteiro (R$ 14) esconde a precisão que importa num custo por unidade.
    # Vírgula decimal pt-BR: "R$ 14,27" (ponto leria como milhar — R$ 1.427).
    return f'R$ {v:.2f}'.replace('.', ',')


def pctf(v): return '—' if v is None else f'{v:.1f}%'
def xf(v): return '—' if v is None else f'{v:.2f}×'
def intf(v): return f'{int(v or 0):,}'.replace(',', '.')
def safe(n, d): return (n / d) if d and d > 0 else None


def fmtval(fmt, x):
    if x is None: return '—'
    if fmt == 'money': return money(x)
    if fmt == 'int': return intf(x)
    if fmt == 'x': return xf(x)
    return pctf(x)


def fmtP(v, d=1):
    return '—' if v is None else (('+' if v >= 0 else '') + f'{v:.{d}f}%')


def fmtPabs(v, d=2):
    return '—' if v is None else f'{v:.{d}f}%'


def fmt_pp(v, d=2):
    return '—' if v is None else (('+' if v >= 0 else '') + f'{v:.{d}f}pp')
