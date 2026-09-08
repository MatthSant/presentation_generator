import { describe, expect, it } from 'vitest';
import { montarQuery, MontarQueryError, placeholdersIn, undeclaredParams, type ParamDef } from '../src/kit/montar-query.js';

const P: ParamDef[] = [
  { id: 'fc', type: 'string', required: true, task_id: 'lancamento' },
  { id: 'dia', type: 'date', required: false },
  { id: 'tipo', type: 'enum', enum: ['classico', 'pago'], required: true },
  { id: 'n', type: 'number', default: 5 },
  { id: 'tabela', type: 'identifier' },
];

describe('montarQuery (spec FR-005)', () => {
  it('substitui e escapa string com aspas e ponto-e-vírgula', () => {
    const sql = montarQuery("SELECT * FROM v WHERE fc = {{fc}} AND t = {{tipo}}", P, { fc: "lcto'; DROP TABLE x; --", tipo: 'pago' });
    expect(sql).toBe("SELECT * FROM v WHERE fc = 'lcto''; DROP TABLE x; --' AND t = 'pago'");
  });

  it('obrigatório ausente → erro cita a tarefa de contexto; nunca devolve {{ cru', () => {
    let err: MontarQueryError | null = null;
    try { montarQuery('SELECT {{fc}}, {{tipo}}', P, { tipo: 'pago' }); } catch (e) { err = e as MontarQueryError; }
    expect(err).toBeInstanceOf(MontarQueryError);
    expect(err!.message).toContain('fc (tarefa de contexto "lancamento")');
    expect(err!.detail.missing).toEqual(['fc']);
  });

  it('tipos: date, number (default), identifier; inválidos são recusados', () => {
    expect(montarQuery('{{dia}} {{n}} {{tabela}}', P, { dia: '2026-09-07', tabela: 'wtl_goals' })).toBe("'2026-09-07' 5 wtl_goals");
    expect(() => montarQuery('{{dia}}', P, { dia: "2026-09-07' OR 1=1" })).toThrow(/inválidos: dia \(date\)/);
    expect(() => montarQuery('{{n}}', P, { n: '5; DROP' })).toThrow(/inválidos: n \(number\)/);
    expect(() => montarQuery('{{tabela}}', P, { tabela: 'a b' })).toThrow(/inválidos: tabela/);
    expect(() => montarQuery('{{tipo}}', P, { tipo: 'outro' })).toThrow(/inválidos: tipo \(enum\)/);
  });

  it('placeholder não declarado no manifesto → erro (e undeclaredParams lista)', () => {
    expect(undeclaredParams('{{fc}} {{xyz}}', P)).toEqual(['xyz']);
    expect(() => montarQuery('SELECT {{xyz}}', P, {})).toThrow(/não declara: xyz/);
  });

  it('opcional ausente vira vazio sem quebrar; placeholdersIn dedup', () => {
    expect(placeholdersIn('{{a}} {{ a }} {{b}}')).toEqual(['a', 'b']);
    expect(montarQuery("x = {{dia}}", P, {})).toBe("x = ''");
  });
});
