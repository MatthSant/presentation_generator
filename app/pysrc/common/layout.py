"""layout — empacotador de grade 12 colunas compartilhado pelos geradores.

Versão única (superset): `newrow()` força quebra de linha (usado pelo perfil)."""


class Grid:
    def __init__(s): s.items, s.x, s.y, s.rowh = [], 0, 0, 0

    def add(s, wid, typ, w, h):
        if s.x + w > 12: s.x = 0; s.y += s.rowh; s.rowh = 0
        s.items.append({'id': wid, 'type': typ, 'x': s.x, 'y': s.y, 'w': w, 'h': h})
        s.x += w; s.rowh = max(s.rowh, h)

    def newrow(s):
        if s.x: s.x = 0; s.y += s.rowh; s.rowh = 0
