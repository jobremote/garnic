import { describe, expect, it, vi } from 'vitest';
import { apicalypseString, coverUrl, createIgdbClient, IgdbError, igdbCredentials, toIgdbGame } from './igdb';

const credentials = { clientId: 'id-teste', clientSecret: 'segredo-teste' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fakeFetch(handlers: { games?: () => Response; token?: () => Response } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.startsWith('https://id.twitch.tv/')) return handlers.token?.() ?? json({ access_token: 'tok', expires_in: 5_000_000 });
    return handlers.games?.() ?? json([]);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

describe('credenciais', () => {
  it('só existem com os dois valores', () => {
    expect(igdbCredentials({ IGDB_CLIENT_ID: 'a', IGDB_CLIENT_SECRET: 'b' })).toEqual({ clientId: 'a', clientSecret: 'b' });
    expect(igdbCredentials({ IGDB_CLIENT_ID: 'a' })).toBeNull();
    expect(igdbCredentials({})).toBeNull();
  });
});

describe('capa', () => {
  it('monta o endereço pelo tamanho e aceita retina', () => {
    expect(coverUrl('co1abc')).toBe('https://images.igdb.com/igdb/image/upload/t_cover_big/co1abc.jpg');
    expect(coverUrl('co1abc', 'thumb', true)).toBe('https://images.igdb.com/igdb/image/upload/t_thumb_2x/co1abc.jpg');
  });
  it('sem image_id, ou com algo estranho, não há capa', () => {
    expect(coverUrl(null)).toBeUndefined();
    expect(coverUrl('../x')).toBeUndefined();
  });
});

describe('toIgdbGame', () => {
  it('converte data, capa e plataformas', () => {
    expect(
      toIgdbGame({ id: 1, name: 'Celeste', slug: 'celeste', cover: { image_id: 'co1' }, first_release_date: 1516924800, platforms: [{ name: 'PC' }, { name: 'Switch' }] }),
    ).toEqual({ igdbId: 1, name: 'Celeste', slug: 'celeste', coverImageId: 'co1', releasedAt: new Date('2018-01-26T00:00:00.000Z'), platforms: ['PC', 'Switch'] });
  });
  it('campos ausentes viram nulo ou lista vazia; sem id ou nome, descarta', () => {
    expect(toIgdbGame({ id: 2, name: 'X' })).toEqual({ igdbId: 2, name: 'X', slug: null, coverImageId: null, releasedAt: null, platforms: [] });
    expect(toIgdbGame({ id: 3 })).toBeNull();
  });
});

describe('apicalypseString', () => {
  it('remove aspas e barras que escapariam do texto', () => {
    // As aspas viram espaço; o `;` que sobra fica dentro do texto entre aspas e não abre outra instrução.
    const safe = apicalypseString('Halo"; fields *; \\ x');
    expect(safe).toBe('Halo ; fields *; x');
    expect(safe).not.toMatch(/["\\]/);
  });
});

describe('searchGames', () => {
  const make = (fetchImpl: typeof fetch) => {
    let t = 1_000_000;
    return createIgdbClient({ credentials, fetch: fetchImpl, now: () => t, sleep: async (ms) => void (t += ms) });
  };

  it('autentica, manda a consulta e devolve os jogos limpos', async () => {
    const { fn, calls } = fakeFetch({ games: () => json([{ id: 7, name: 'Hades', cover: { image_id: 'co9' } }, { id: 8 }]) });
    const games = await make(fn).searchGames('Hades');
    expect(games).toEqual([{ igdbId: 7, name: 'Hades', slug: null, coverImageId: 'co9', releasedAt: null, platforms: [] }]);

    expect(calls[0].url).toContain('https://id.twitch.tv/oauth2/token');
    expect(calls[0].url).toContain('grant_type=client_credentials');
    const api = calls[1];
    expect(api.url).toBe('https://api.igdb.com/v4/games');
    expect(api.init?.method).toBe('POST');
    expect(api.init?.headers).toMatchObject({ 'Client-ID': 'id-teste', Authorization: 'Bearer tok' });
    expect(String(api.init?.body)).toContain('search "Hades";');
    expect(String(api.init?.body)).toContain('version_parent = null');
  });

  it('reaproveita o token entre as buscas', async () => {
    const { fn, calls } = fakeFetch();
    const client = make(fn);
    await client.searchGames('Hades');
    await client.searchGames('Celeste');
    expect(calls.filter((c) => c.url.startsWith('https://id.twitch.tv/'))).toHaveLength(1);
  });

  it('busca com menos de 2 letras não chama o IGDB', async () => {
    const { fn, calls } = fakeFetch();
    expect(await make(fn).searchGames(' a ')).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('limita o tamanho da lista', async () => {
    const { fn, calls } = fakeFetch();
    await make(fn).searchGames('Hades', 500);
    expect(String(calls[1].init?.body)).toContain('limit 20;');
  });

  it('token recusado (401) é renovado e o pedido tentado de novo', async () => {
    let first = true;
    const { fn, calls } = fakeFetch({
      games: () => {
        if (first) {
          first = false;
          return json({}, 401);
        }
        return json([{ id: 1, name: 'Celeste' }]);
      },
    });
    const games = await make(fn).searchGames('Celeste');
    expect(games).toHaveLength(1);
    expect(calls.filter((c) => c.url.startsWith('https://id.twitch.tv/'))).toHaveLength(2);
  });

  it('getGame busca um jogo pelo id e devolve nulo se não existe ou o id é inválido', async () => {
    const { fn, calls } = fakeFetch({ games: () => json([{ id: 9, name: 'Celeste' }]) });
    const client = make(fn);
    expect(await client.getGame(9)).toMatchObject({ igdbId: 9, name: 'Celeste' });
    expect(String(calls[1].init?.body)).toContain('where id = 9; limit 1;');
    expect(await client.getGame(-1)).toBeNull();
    expect(await client.getGame(1.5)).toBeNull();
    expect(calls).toHaveLength(2); // ids inválidos nem chegam ao IGDB

    const empty = fakeFetch({ games: () => json([]) });
    expect(await make(empty.fn).getGame(123)).toBeNull();
  });

  it('getTimeToBeat converte segundos em minutos e devolve nulo sem dado', async () => {
    const { fn, calls } = fakeFetch({ games: () => json([{ id: 1, hastily: 36000, normally: 54030, completely: 0 }]) });
    expect(await make(fn).getTimeToBeat(5)).toEqual({ hastily: 600, normally: 901, completely: null });
    expect(calls[1].url).toBe('https://api.igdb.com/v4/game_time_to_beats');
    expect(String(calls[1].init?.body)).toContain('where game_id = 5; limit 1;');

    const none = fakeFetch({ games: () => json([]) });
    expect(await make(none.fn).getTimeToBeat(5)).toBeNull();
    const empty = fakeFetch({ games: () => json([{ id: 2 }]) });
    expect(await make(empty.fn).getTimeToBeat(5)).toBeNull();
    expect(await make(empty.fn).getTimeToBeat(-3)).toBeNull();
  });

  it('sem credenciais: erro "not-configured"', async () => {
    const client = createIgdbClient({ credentials: null });
    await expect(client.searchGames('Hades')).rejects.toMatchObject({ name: 'IgdbError', reason: 'not-configured' });
  });

  it('IGDB fora do ar: erro "unavailable"', async () => {
    const { fn } = fakeFetch({ games: () => json({}, 500) });
    const error = await make(fn).searchGames('Hades').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IgdbError);
    expect(error).toMatchObject({ reason: 'unavailable' });
  });

  it('espaça os pedidos em 250 ms', async () => {
    const { fn } = fakeFetch();
    const sleeps: number[] = [];
    let t = 1_000_000;
    const client = createIgdbClient({
      credentials,
      fetch: fn,
      now: () => t,
      sleep: async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
    });
    await Promise.all([client.searchGames('Hades'), client.searchGames('Celeste')]);
    expect(sleeps).toEqual([250]);
  });
});
