import { describe, expect, it } from 'vitest';
import { checkPii, scanPii } from '../src/kit/pii.js';

describe('pii — gate de dado pessoal (spec 002 FR-002)', () => {
  it('detecta e-mail, telefone BR e CPF válido, mascarados', () => {
    const r = checkPii('contato: fulano.silva@gmail.com, tel (11) 99999-8888, CPF 529.982.247-25');
    expect(r.ok).toBe(false);
    expect(r.achados.map((a) => a.tipo).sort()).toEqual(['cpf', 'email', 'telefone']);
    for (const a of r.achados) { expect(a.trecho).toContain('*'); expect(a.trecho).not.toContain('fulano.silva'); }
  });

  it('ignora CPF com dígito verificador inválido e números de métricas', () => {
    expect(scanPii('CPF 123.456.789-00')).toEqual([]);              // DV inválido
    expect(scanPii('leads 1250, invest 12500.50, impressões 1000000')).toEqual([]);
    expect(scanPii('2026-09-07 ROAS 1,42x CPL 7.1429')).toEqual([]);
    expect(scanPii('CNPJ 12.345.678/0001-90')).toEqual([]);
  });

  it('e-mails da lista de ignorados (ex.: o autor) não contam', () => {
    const r = checkPii({ autor: 'projetos@witly.digital', texto: 'ok' }, ['projetos@witly.digital']);
    expect(r.ok).toBe(true);
    const r2 = checkPii({ autor: 'projetos@witly.digital', texto: 'lead: joao@x.com' }, ['projetos@witly.digital']);
    expect(r2.ok).toBe(false);
    expect(r2.achados).toHaveLength(1);
  });

  it('varre objetos (JSON serializado) e telefone sem DDD entre parênteses', () => {
    expect(checkPii({ resposta: { tabela: [{ nome: 'x', fone: '11 98888-7777' }] } }).ok).toBe(false);
    expect(checkPii({ resposta: 'CPL subiu 12% no dia 05/09' }).ok).toBe(true);
  });
});
