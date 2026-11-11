import { describe, expect, it } from 'vitest';
import { parseEntryInput } from './parse';

describe('parseEntryInput', () => {
  it('deixa passar os campos certos e mantém ausente o que não veio', () => {
    expect(parseEntryInput({ rating: 4, review: 'Bom', reviewSpoiler: true, started: { month: 3, year: 2025 }, playMinutes: 90 })).toEqual({
      rating: 4,
      review: 'Bom',
      reviewSpoiler: true,
      started: { month: 3, year: 2025 },
      playMinutes: 90,
    });
    expect(parseEntryInput({})).toEqual({});
  });

  it('null limpa o campo', () => {
    expect(parseEntryInput({ rating: null, platform: null, review: null, ended: { month: null, year: null }, playMinutes: null })).toEqual({
      rating: null,
      platform: null,
      review: null,
      ended: { month: null, year: null },
      playMinutes: null,
    });
  });

  it('tipo errado vira valor inválido, não é ignorado', () => {
    const input = parseEntryInput({ rating: '5', platform: 7, playMinutes: '10', started: 'março', ended: { month: '3', year: 2025 } });
    expect(Number.isNaN(input.rating)).toBe(true);
    expect(input.platform).toBe('\u0000');
    expect(Number.isNaN(input.playMinutes)).toBe(true);
    expect(Number.isNaN(input.started?.month)).toBe(true);
    expect(Number.isNaN(input.ended?.month)).toBe(true);
    expect(input.ended?.year).toBe(2025);
  });

  it('campos desconhecidos são descartados e lixo não quebra', () => {
    expect(parseEntryInput({ userId: 'outro', gameId: 'x', rating: 3 })).toEqual({ rating: 3 });
    expect(parseEntryInput(null)).toEqual({});
    expect(parseEntryInput('texto')).toEqual({});
    expect(parseEntryInput(undefined)).toEqual({});
  });

  it('a lista de tags passa adiante para ser conferida (inclusive o que não é lista)', () => {
    expect(parseEntryInput({ tagIds: ['a', 'b'] })).toEqual({ tagIds: ['a', 'b'] });
    expect(parseEntryInput({ tagIds: [] })).toEqual({ tagIds: [] });
    expect(parseEntryInput({ tagIds: 'texto' })).toEqual({ tagIds: 'texto' });
    expect(parseEntryInput({ rating: 3 })).not.toHaveProperty('tagIds'); // ausente continua ausente
  });

  it('reviewSpoiler só é verdadeiro com true de verdade', () => {
    expect(parseEntryInput({ reviewSpoiler: 'true' })).toEqual({ reviewSpoiler: false });
  });
});
