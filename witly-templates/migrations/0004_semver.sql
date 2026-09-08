-- Versionamento semântico dos templates: `number` continua como sequência interna
-- (URLs assinadas, logs de uso, diff), `semver` é o que as pessoas veem.
-- Backfill: a publicada de cada template vira 1.0.0 (linha de base); as publicadas
-- anteriores viram 0.<number>.0 (histórico pré-semântico); rascunhos ficam sem semver
-- até serem publicados (o tipo de mudança é escolhido na publicação).
ALTER TABLE template_versions ADD COLUMN semver TEXT;

UPDATE template_versions SET semver = '1.0.0'
 WHERE id IN (SELECT published_version_id FROM templates WHERE published_version_id IS NOT NULL);

UPDATE template_versions SET semver = '0.' || number || '.0'
 WHERE semver IS NULL AND state = 'published';
