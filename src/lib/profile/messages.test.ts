import { describe, expect, it } from 'vitest';
import { IMAGE_MAX_BYTES, IMAGE_RECOMMENDED_SIZE } from './images';
import { profileMessages } from './messages';

describe('dicas das imagens do perfil', () => {
  it('a dica da capa traz o tamanho recomendado e o peso máximo reais', () => {
    expect(IMAGE_RECOMMENDED_SIZE.cover).toEqual({ width: 1040, height: 200 });
    expect(profileMessages.coverHint).toContain('1040 × 200 px');
    expect(profileMessages.coverHint).toContain(`até ${IMAGE_MAX_BYTES.cover / 1024 / 1024} MB`);
    expect(profileMessages.coverHint).toContain('5 MB');
  });

  it('a dica da foto traz o tamanho recomendado e o peso máximo reais', () => {
    expect(profileMessages.avatarHint).toContain('400 × 400 px');
    expect(profileMessages.avatarHint).toContain('até 5 MB');
  });

  it('os avisos de peso usam os mesmos limites', () => {
    expect(profileMessages.avatarTooBig).toBe('A foto pode ter até 5 MB.');
    expect(profileMessages.coverTooBig).toBe('A capa pode ter até 5 MB.');
  });
});
