import { describe, expect, it, vi } from 'vitest';
import { createTranslator, deeplHost } from './deepl';

const ok = (text: string) => new Response(JSON.stringify({ translations: [{ detected_source_language: 'EN', text }] }), { status: 200 });

describe('DeepL', () => {
  it('chave do plano Free usa api-free; a paga, api', () => {
    expect(deeplHost('abc:fx')).toBe('https://api-free.deepl.com');
    expect(deeplHost('abc')).toBe('https://api.deepl.com');
  });

  it('pede a tradução para PT-BR com a chave no cabeçalho', async () => {
    const fetch = vi.fn().mockResolvedValue(ok('Olá, mundo!'));
    const translator = createTranslator({ apiKey: 'chave:fx', fetch });
    expect(await translator.toPortuguese('Hello, world!')).toBe('Olá, mundo!');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api-free.deepl.com/v2/translate');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'DeepL-Auth-Key chave:fx', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ text: ['Hello, world!'], target_lang: 'PT-BR' });
  });

  it('sem chave não chama a DeepL', async () => {
    const fetch = vi.fn();
    const translator = createTranslator({ apiKey: undefined, fetch });
    expect(translator.configured).toBe(false);
    expect(await translator.toPortuguese('Hello')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cota esgotada, erro ou falha de rede devolvem nulo', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await createTranslator({ apiKey: 'k', fetch: vi.fn().mockResolvedValue(new Response('{}', { status: 456 })) }).toPortuguese('a')).toBeNull();
    expect(await createTranslator({ apiKey: 'k', fetch: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })) }).toPortuguese('a')).toBeNull();
    expect(await createTranslator({ apiKey: 'k', fetch: vi.fn().mockRejectedValue(new Error('rede')) }).toPortuguese('a')).toBeNull();
    error.mockRestore();
  });
});
