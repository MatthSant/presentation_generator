"""layout — empacotador de grade 12 colunas compartilhado pelos geradores.

Versão única (superset): `newrow()` força quebra de linha (usado pelo perfil)."""


class Grid:
    def __init__(s): s.items, s.x, s.y, s.rowh = [], 0, 0, 0

    def add(s, wid, typ, w, h):
        if s.x + w > 12: s.x = 0; s.y += s.rowh; s.rowh = 0
        s.items.append({'id': wid, 'type': typ, 'x': s.x, 'y': s.y, 'w': w, 'h': h})
        s.x += w; s.rowh = max(s.rowh, h)

    def at(s, wid, typ, x, y, w, h):
        """Coloca um item em coordenada explícita (layout 2D). Não move o cursor —
        use cursor_to() depois do bloco para continuar o empacotamento automático."""
        s.items.append({'id': wid, 'type': typ, 'x': x, 'y': y, 'w': w, 'h': h})

    def cursor_to(s, y):
        s.x = 0; s.y = y; s.rowh = 0

    def newrow(s):
        if s.x: s.x = 0; s.y += s.rowh; s.rowh = 0
