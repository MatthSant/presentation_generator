-- Uso do conhecimento: de ONDE veio o contato com a entrada.
--
-- Sem isto o painel não distingue duas coisas opostas. As entradas `sempre` já eram
-- entregues embutidas no topo de todo obter_template (8,8 KB, 32 entradas) — chegavam
-- ao agente e nada gravava, porque embutir não é chamada de ferramenta. O painel lia
-- "0 consultadas" e não dava para saber se o conhecimento não estava chegando ou se
-- só não estava sendo medido. Eram coisas diferentes com o mesmo número.
--
--   entregue  — foi junto no documento (nível 0), o agente recebeu sem pedir
--   consulta  — o agente chamou conhecimento(detalhe:"completo") de propósito
--   registro  — o agente declarou em registrar(usadas:[…]) que entrou na análise
--
-- 'consulta' é o default porque toda linha que já existe veio da tool de consulta.
ALTER TABLE conhecimento_uso ADD COLUMN origem TEXT NOT NULL DEFAULT 'consulta';

CREATE INDEX IF NOT EXISTS conhecimento_uso_origem ON conhecimento_uso(origem, at);
