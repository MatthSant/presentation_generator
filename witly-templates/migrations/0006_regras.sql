-- Regras da análise como ENTRADAS (não mais parágrafos soltos no guia.md).
-- Mesma taxonomia dos contextos gerais (regra | recomendacao | definicao) e o mesmo
-- princípio: o TÍTULO já é a regra. Versionadas junto com o template, como as tarefas.
CREATE TABLE IF NOT EXISTS template_rules (
  version_id TEXT NOT NULL REFERENCES template_versions(id) ON DELETE CASCADE,
  rule_id    TEXT NOT NULL,
  tipo       TEXT NOT NULL DEFAULT 'regra',
  title      TEXT NOT NULL,
  body_md    TEXT NOT NULL DEFAULT '',
  sort       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (version_id, rule_id)
);
