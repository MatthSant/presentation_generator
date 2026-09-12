-- Spec 008: o conhecimento como entradas tipadas (uma tabela, três eixos, famílias/tipos),
-- histórico por trigger (nada se apaga), busca FTS5, relações tipadas, uso por entrada,
-- propostas com votos e a configuração da org (N de votos, limites).

CREATE TABLE IF NOT EXISTS conhecimento (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES orgs(id),
  familia         TEXT NOT NULL,
  tipo            TEXT NOT NULL,
  dominio         TEXT NOT NULL DEFAULT 'analise',
  escopo          TEXT NOT NULL DEFAULT 'geral',
  nivel           TEXT NOT NULL DEFAULT 'tatico' CHECK (nivel IN ('estrategico', 'tatico', 'operacional')),
  tags_json       TEXT NOT NULL DEFAULT '[]',
  titulo          TEXT NOT NULL,
  corpo_md        TEXT NOT NULL DEFAULT '',
  dados_json      TEXT NOT NULL DEFAULT '{}',
  confianca       TEXT NOT NULL DEFAULT 'media' CHECK (confianca IN ('alta', 'media', 'baixa')),
  fontes_json     TEXT NOT NULL DEFAULT '[]',
  status          TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'rascunho', 'supersedido')),
  supersedido_por TEXT,
  sempre          INTEGER NOT NULL DEFAULT 0,
  gatilho_json    TEXT NOT NULL DEFAULT '[]',
  verificado_por  TEXT,
  verificado_em   TEXT,
  verificar_ate   TEXT,
  autor           TEXT,
  versao          INTEGER NOT NULL DEFAULT 1,
  criado_em       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS conhecimento_org_status_tipo ON conhecimento(org_id, status, tipo);
CREATE INDEX IF NOT EXISTS conhecimento_org_escopo ON conhecimento(org_id, escopo);
CREATE INDEX IF NOT EXISTS conhecimento_org_sempre ON conhecimento(org_id, sempre);
CREATE INDEX IF NOT EXISTS conhecimento_org_nivel ON conhecimento(org_id, nivel);

-- Histórico: uma linha por versão gravada (o trigger cuida; restaurar = copiar o snapshot anterior).
CREATE TABLE IF NOT EXISTS conhecimento_hist (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entrada_id    TEXT NOT NULL,
  versao        INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  autor         TEXT,
  at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS conhecimento_hist_entrada ON conhecimento_hist(entrada_id, id);

-- Busca: título + corpo + tags, sem acento.
CREATE VIRTUAL TABLE IF NOT EXISTS conhecimento_fts USING fts5(id UNINDEXED, titulo, corpo_md, tags, tokenize = 'unicode61 remove_diacritics 2');

CREATE TRIGGER IF NOT EXISTS conhecimento_ai AFTER INSERT ON conhecimento BEGIN
  INSERT INTO conhecimento_fts (id, titulo, corpo_md, tags) VALUES (NEW.id, NEW.titulo, NEW.corpo_md, NEW.tags_json);
  INSERT INTO conhecimento_hist (entrada_id, versao, snapshot_json, autor)
    VALUES (NEW.id, NEW.versao, json_object('familia', NEW.familia, 'tipo', NEW.tipo, 'dominio', NEW.dominio, 'escopo', NEW.escopo, 'nivel', NEW.nivel, 'tags_json', NEW.tags_json,
      'titulo', NEW.titulo, 'corpo_md', NEW.corpo_md, 'dados_json', NEW.dados_json, 'confianca', NEW.confianca, 'fontes_json', NEW.fontes_json,
      'status', NEW.status, 'supersedido_por', NEW.supersedido_por, 'sempre', NEW.sempre, 'gatilho_json', NEW.gatilho_json), NEW.autor);
END;
CREATE TRIGGER IF NOT EXISTS conhecimento_au AFTER UPDATE ON conhecimento BEGIN
  DELETE FROM conhecimento_fts WHERE id = OLD.id;
  INSERT INTO conhecimento_fts (id, titulo, corpo_md, tags) VALUES (NEW.id, NEW.titulo, NEW.corpo_md, NEW.tags_json);
  INSERT INTO conhecimento_hist (entrada_id, versao, snapshot_json, autor)
    SELECT NEW.id, NEW.versao, json_object('familia', NEW.familia, 'tipo', NEW.tipo, 'dominio', NEW.dominio, 'escopo', NEW.escopo, 'nivel', NEW.nivel, 'tags_json', NEW.tags_json,
      'titulo', NEW.titulo, 'corpo_md', NEW.corpo_md, 'dados_json', NEW.dados_json, 'confianca', NEW.confianca, 'fontes_json', NEW.fontes_json,
      'status', NEW.status, 'supersedido_por', NEW.supersedido_por, 'sempre', NEW.sempre, 'gatilho_json', NEW.gatilho_json), NEW.autor
    WHERE NEW.versao != OLD.versao OR NEW.titulo != OLD.titulo OR NEW.corpo_md != OLD.corpo_md OR NEW.dados_json != OLD.dados_json OR NEW.status != OLD.status;
END;
CREATE TRIGGER IF NOT EXISTS conhecimento_ad AFTER DELETE ON conhecimento BEGIN
  DELETE FROM conhecimento_fts WHERE id = OLD.id;
END;

-- Relações tipadas, vocabulário fechado (lint sem LLM: `contradiz` aberta aparece na Saúde).
CREATE TABLE IF NOT EXISTS conhecimento_rel (
  de   TEXT NOT NULL,
  para TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('supersede', 'contradiz', 'corrige', 'sustenta')),
  at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (de, para, tipo)
);

-- Evidência de uso por entrada: quando foi puxada/usada, em que atividade, e se ajudou.
CREATE TABLE IF NOT EXISTS conhecimento_uso (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  entrada_id   TEXT NOT NULL,
  atividade_id TEXT,
  email        TEXT NOT NULL,
  ajudou       INTEGER,
  at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS conhecimento_uso_entrada ON conhecimento_uso(entrada_id, at);

-- Propostas: toda mudança (nova, edição, substituta, fechar resultado, superseder) passa por aqui.
CREATE TABLE IF NOT EXISTS proposta (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES orgs(id),
  entrada_id      TEXT,
  modo            TEXT NOT NULL CHECK (modo IN ('nova', 'edicao', 'substituta', 'fechar_resultado', 'superseder')),
  urgencia        TEXT NOT NULL DEFAULT 'normal' CHECK (urgencia IN ('urgente', 'normal', 'baixa')),
  conteudo_json   TEXT NOT NULL DEFAULT '{}',
  motivo          TEXT NOT NULL DEFAULT '',
  evidencia_json  TEXT NOT NULL DEFAULT '[]',
  origem          TEXT NOT NULL DEFAULT 'ui',
  autor           TEXT NOT NULL,
  ocorrencias     INTEGER NOT NULL DEFAULT 1,
  hash            TEXT,
  estado          TEXT NOT NULL DEFAULT 'aberta' CHECK (estado IN ('aberta', 'aprovada', 'recusada', 'fundida', 'revertida')),
  aprovada_por    TEXT,
  decidido_por    TEXT,
  decidido_em     TEXT,
  motivo_decisao  TEXT,
  versao_anterior INTEGER,
  criado_em       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS proposta_org_estado ON proposta(org_id, estado, urgencia);
CREATE INDEX IF NOT EXISTS proposta_org_hash ON proposta(org_id, hash);
CREATE INDEX IF NOT EXISTS proposta_entrada ON proposta(entrada_id);

CREATE TABLE IF NOT EXISTS voto (
  proposta_id TEXT NOT NULL REFERENCES proposta(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  valor       INTEGER NOT NULL CHECK (valor IN (-1, 1)),
  comentario  TEXT,
  at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (proposta_id, email)
);

-- Configuração da org: {"votos": 2, "limites": {...}}
ALTER TABLE orgs ADD COLUMN config_json TEXT NOT NULL DEFAULT '{}';

-- Os contextos gerais de hoje viram entradas `sempre`; o seed refina família/tipo/domínio.
INSERT OR IGNORE INTO conhecimento (id, org_id, familia, tipo, dominio, escopo, titulo, corpo_md, dados_json, sempre, gatilho_json, autor, criado_em, atualizado_em)
  SELECT slug, org_id,
         CASE tipo WHEN 'definicao' THEN 'saber' ELSE 'fazer' END,
         CASE tipo WHEN 'definicao' THEN 'definicao' ELSE 'regra' END,
         'analise', 'geral', title, body_md,
         CASE tipo WHEN 'recomendacao' THEN '{"forca":"geralmente"}' WHEN 'regra' THEN '{"forca":"sempre"}' ELSE '{}' END,
         1, '["sempre"]', author_email, updated_at, updated_at
    FROM general_contexts;
