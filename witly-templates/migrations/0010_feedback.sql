-- Feedback de uso do kit (o agente avalia o trabalho ao terminar): evento 'feedback' na atividade.
-- SQLite não altera CHECK: recria a tabela (mesmo padrão da 0008).
CREATE TABLE activity_new (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES orgs(id),
  email            TEXT NOT NULL,
  evento           TEXT NOT NULL CHECK (evento IN ('geracao', 'aprofundamento', 'edicao', 'sugestao', 'feedback')),
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
  at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  veredito         TEXT,
  veredito_por     TEXT,
  veredito_em      TEXT
);
INSERT INTO activity_new (id, org_id, email, evento, slug, version_number, cliente, pergunta_id, dados_json, avaliacao, descartado, motivo,
                          editor_nota, editor_comentario, virou_exemplo, virou_regra, origem, at, veredito, veredito_por, veredito_em)
  SELECT id, org_id, email, evento, slug, version_number, cliente, pergunta_id, dados_json, avaliacao, descartado, motivo,
         editor_nota, editor_comentario, virou_exemplo, virou_regra, origem, at, veredito, veredito_por, veredito_em
    FROM activity;
DROP TABLE activity;
ALTER TABLE activity_new RENAME TO activity;
CREATE INDEX IF NOT EXISTS activity_slug_at ON activity(slug, at);
CREATE INDEX IF NOT EXISTS activity_email_at ON activity(email, at);
CREATE INDEX IF NOT EXISTS activity_veredito ON activity(org_id, evento, veredito);
