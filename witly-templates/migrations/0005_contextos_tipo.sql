-- Contextos gerais curtos e tipados: o título já diz a regra; `tipo` diz o peso.
--   regra         = o agente não pode descumprir (número, PII, método)
--   recomendacao  = boa prática de leitura/escrita; pode ser relaxada com motivo
--   definicao     = como um termo/métrica é entendido em toda análise
ALTER TABLE general_contexts ADD COLUMN tipo TEXT NOT NULL DEFAULT 'regra';
