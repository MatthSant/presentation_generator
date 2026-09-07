-- Fase 2 — atividade, avaliações, templates pessoais, changelog (specs/002)

ALTER TABLE templates ADD COLUMN owner_email TEXT;                      -- NULL = organização
ALTER TABLE templates ADD COLUMN promoted_from TEXT;                    -- dono original quando promovido
ALTER TABLE templates ADD COLUMN notas TEXT NOT NULL DEFAULT '';
ALTER TABLE template_versions ADD COLUMN changelog TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS activity (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES orgs(id),
  email            TEXT NOT NULL,
  evento           TEXT NOT NULL CHECK (evento IN ('geracao', 'aprofundamento', 'edicao')),
  slug             TEXT NOT NULL,
  version_number   INTEGER,
  cliente          TEXT,
  pergunta_id      TEXT,
  dados_json       TEXT NOT NULL DEFAULT '{}',
  avaliacao        INTEGER,
  descartado       INTEGER NOT NULL DEFAULT 0,
  motivo           TEXT,
  editor_nota      INTEGER,
  editor_comentario TEXT,
  virou_exemplo    INTEGER NOT NULL DEFAULT 0,
  virou_regra      INTEGER NOT NULL DEFAULT 0,
  origem           TEXT NOT NULL DEFAULT 'mcp' CHECK (origem IN ('mcp', 'app')),
  at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS activity_slug_at ON activity(slug, at);
CREATE INDEX IF NOT EXISTS activity_email_at ON activity(email, at);

CREATE TABLE IF NOT EXISTS template_ratings (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES orgs(id),
  slug           TEXT NOT NULL,
  version_number INTEGER,
  email          TEXT NOT NULL,
  nota           INTEGER NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario     TEXT,
  at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS template_ratings_slug ON template_ratings(slug);
