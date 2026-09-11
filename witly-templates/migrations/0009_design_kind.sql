-- Spec 006: o design system vira um template versionado (kind = 'design'), fora do catálogo
-- e do MCP como template. Os templates de análise têm kind = 'analise'.
ALTER TABLE templates ADD COLUMN kind TEXT NOT NULL DEFAULT 'analise';
