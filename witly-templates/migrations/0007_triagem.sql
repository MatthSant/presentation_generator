-- Triagem dos aprofundamentos: o veredito do editor vira coluna própria.
-- NULL = sem veredito (entra na fila de revisão).
ALTER TABLE activity ADD COLUMN veredito TEXT;
ALTER TABLE activity ADD COLUMN veredito_por TEXT;
ALTER TABLE activity ADD COLUMN veredito_em TEXT;
CREATE INDEX IF NOT EXISTS activity_veredito ON activity(org_id, evento, veredito);

-- o que já foi triado antes desta coluna
UPDATE activity SET veredito = 'exemplo'  WHERE veredito IS NULL AND virou_exemplo = 1;
UPDATE activity SET veredito = 'regra'    WHERE veredito IS NULL AND virou_regra = 1;
UPDATE activity SET veredito = 'descarte' WHERE veredito IS NULL AND descartado = 1;
UPDATE activity SET veredito = 'ok'       WHERE veredito IS NULL AND editor_nota IS NOT NULL;
