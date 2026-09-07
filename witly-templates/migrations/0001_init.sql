-- witly-templates — modelo D3 do plano (specs/001-fase1-mcp-templates/plan.md)

CREATE TABLE IF NOT EXISTS orgs (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  email      TEXT PRIMARY KEY,
  name       TEXT,
  org_id     TEXT NOT NULL REFERENCES orgs(id),
  role       TEXT NOT NULL CHECK (role IN ('editor', 'leitor')),
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS templates (
  slug                 TEXT PRIMARY KEY,
  org_id               TEXT NOT NULL REFERENCES orgs(id),
  name                 TEXT NOT NULL,
  objective            TEXT NOT NULL DEFAULT '',
  when_to_use          TEXT NOT NULL DEFAULT '',
  published_version_id TEXT,
  draft_version_id     TEXT
);

CREATE TABLE IF NOT EXISTS template_versions (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL REFERENCES templates(slug),
  number        INTEGER NOT NULL,
  state         TEXT NOT NULL CHECK (state IN ('draft', 'published')),
  author_email  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  published_at  TEXT,
  manifest_json TEXT NOT NULL,
  UNIQUE (slug, number)
);

-- Cada arquivo do kit é uma linha (limite de 1 MB por linha no D1).
-- path: queries/*.sql · python/**/*.py · documento.md · guia.md · exemplo.html
CREATE TABLE IF NOT EXISTS template_files (
  version_id TEXT NOT NULL REFERENCES template_versions(id) ON DELETE CASCADE,
  path       TEXT NOT NULL,
  content    TEXT NOT NULL,
  PRIMARY KEY (version_id, path)
);

-- A página detalhável de cada tarefa de contexto (o manifesto só tem o índice).
CREATE TABLE IF NOT EXISTS context_tasks (
  version_id TEXT NOT NULL REFERENCES template_versions(id) ON DELETE CASCADE,
  task_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  body_md    TEXT NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (version_id, task_id)
);

-- Poucos e curados; valem para todo template (constituição IV).
CREATE TABLE IF NOT EXISTS general_contexts (
  slug         TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES orgs(id),
  title        TEXT NOT NULL,
  body_md      TEXT NOT NULL,
  author_email TEXT,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS usage_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT NOT NULL,
  tool           TEXT NOT NULL,
  slug           TEXT,
  version_number INTEGER,
  at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS usage_log_at ON usage_log(at);

INSERT OR IGNORE INTO orgs (id, name) VALUES ('witly', 'Witly');
