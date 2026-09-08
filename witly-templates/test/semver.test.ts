import { describe, it, expect } from 'vitest';
import { nextSemver, parseBump, versionLabel } from '../src/db/semver.js';

describe('semver (versão visível)', () => {
  it('bump: patch por padrão; minor e major zeram o que vem depois', () => {
    expect(nextSemver('1.0.2')).toBe('1.0.3');
    expect(nextSemver('1.0.2', 'minor')).toBe('1.1.0');
    expect(nextSemver('1.4.7', 'major')).toBe('2.0.0');
  });
  it('sem publicada ou histórico 0.x → 1.0.0 (linha de base)', () => {
    expect(nextSemver(null)).toBe('1.0.0');
    expect(nextSemver('0.12.0', 'minor')).toBe('1.0.0');
    expect(nextSemver('lixo')).toBe('1.0.0');
  });
  it('parseBump aceita os nomes da UI e cai em patch', () => {
    expect(parseBump('melhoria')).toBe('minor');
    expect(parseBump('grande')).toBe('major');
    expect(parseBump('MAJOR')).toBe('major');
    expect(parseBump(undefined)).toBe('patch');
    expect(parseBump('qualquer')).toBe('patch');
  });
  it('versionLabel prefere o semver e cai no inteiro', () => {
    expect(versionLabel({ semver: '1.2.0', number: 9 })).toBe('v1.2.0');
    expect(versionLabel({ semver: null, number: 9 })).toBe('v9');
    expect(versionLabel(null)).toBe('v?');
  });
});
