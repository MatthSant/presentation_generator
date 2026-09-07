-- Documentos da PLATAFORMA (valem para todo template): design system dos aprofundamentos etc.
-- Entram em todo kit (zip) e como resource do MCP; editáveis na UI por editores.
CREATE TABLE IF NOT EXISTS platform_docs (
  slug         TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES orgs(id),
  title        TEXT NOT NULL,
  body_md      TEXT NOT NULL,
  -- nome do arquivo com que entra no zip do kit (NULL = não entra no zip)
  kit_file     TEXT,
  author_email TEXT,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
