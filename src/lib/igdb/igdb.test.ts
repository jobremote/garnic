import { describe, expect, it, vi } from 'vitest';
import { apicalypseString, coverUrl, createIgdbClient, HIDDEN_GAME_TYPES, IgdbError, igdbCredentials, normalizeTitle, rankSearchResults, SEARCH_RESULTS, toIgdbGame, type IgdbGame, type SearchCandidate } from './igdb';

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

const candidate = (igdbId: number, name: string, ratingCount = 0, follows = 0): SearchCandidate => ({
  game: { igdbId, name, slug: null, coverImageId: null, releasedAt: null, platforms: [] } satisfies IgdbGame,
  ratingCount,
  follows,
});

describe('normalizeTitle', () => {
  it('ignora maiúsculas, acentos e pontuação', () => {
    expect(normalizeTitle('  Pokémon: Edição Vermelha! ')).toBe('pokemon edicao vermelha');
    expect(normalizeTitle('Mega-Man X')).toBe(normalizeTitle('mega man x'));
  });
});

describe('rankSearchResults', () => {
  it('mais avaliações vêm primeiro; follows ajuda no empate de avaliações', () => {
    const ranked = rankSearchResults([candidate(1, 'A', 5), candidate(2, 'B', 500), candidate(3, 'C', 5, 400)], 'x');
    expect(ranked.map((g) => g.igdbId)).toEqual([2, 3, 1]);
  });

  it('o nome igual ao digitado ganha um empurrão, mas não passa um jogo muito mais popular', () => {
    // Sem avaliações, o nome exato sobe acima de outro sem avaliações...
    expect(rankSearchResults([candidate(1, 'Hades Dive'), candidate(2, 'Hades')], 'hades').map((g) => g.igdbId)).toEqual([2, 1]);
    // ...e entre dois com poucas avaliações, o exato vence...
    expect(rankSearchResults([candidate(1, 'Hades II', 3), candidate(2, 'Hades', 3)], 'hades').map((g) => g.igdbId)).toEqual([2, 1]);
    // ...mas um jogo gigante que só contém o termo ainda passa um exato obscuro.
    expect(rankSearchResults([candidate(1, 'Super Mario Bros.', 900), candidate(2, 'Mario')], 'mario').map((g) => g.igdbId)).toEqual([1, 2]);
  });

  it('empate total mantém a ordem original do IGDB (ordenação estável)', () => {
    const ranked = rankSearchResults([candidate(1, 'A'), candidate(2, 'B'), candidate(3, 'C')], 'z');
    expect(ranked.map((g) => g.igdbId)).toEqual([1, 2, 3]);
  });

  it('lista vazia devolve lista vazia', () => {
    expect(rankSearchResults([], 'qualquer')).toEqual([]);
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

  it('pede candidatos de sobra ao IGDB (para ordenar aqui) e nunca devolve mais que o limite', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, name: `Jogo ${i + 1}`, total_rating_count: i }));
    const { fn, calls } = fakeFetch({ games: () => json(many) });
    const games = await make(fn).searchGames('Jogo');
    expect(String(calls[1].init?.body)).toContain('limit 80;');
    expect(games).toHaveLength(SEARCH_RESULTS);
    expect((await make(fakeFetch({ games: () => json(many) }).fn).searchGames('Jogo', 500)).length).toBeLessThanOrEqual(20);
  });

  it('a busca esconde mods, pacotes, pacotes/complementos, forks e atualizações, mas não DLC, remake, remaster nem port', async () => {
    const { fn, calls } = fakeFetch();
    await make(fn).searchGames('Hades');
    const body = String(calls[1].init?.body);
    expect(HIDDEN_GAME_TYPES).toEqual([5, 3, 13, 12, 14]);
    expect(body).toContain('game_type != (5,3,13,12,14)');
    expect(body).toContain('game_type = null'); // jogo sem tipo continua aparecendo
    for (const keptType of [0, 1, 2, 4, 8, 9, 11]) expect(HIDDEN_GAME_TYPES).not.toContain(keptType);
  });

  it('devolve o mais relevante primeiro (a versão famosa antes das desconhecidas)', async () => {
    const raw = [
      { id: 1, name: 'Mega Man X', total_rating_count: 0 },
      { id: 2, name: 'Mega Man X', total_rating_count: 299 },
      { id: 3, name: 'Mega Man X Dive', total_rating_count: 0 },
      { id: 4, name: 'Mega Man 10', total_rating_count: 44 },
    ];
    const { fn } = fakeFetch({ games: () => json(raw) });
    const games = await make(fn).searchGames('mega man x');
    expect(games.map((g) => g.igdbId)).toEqual([2, 4, 1, 3]);
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

  it('getGames busca vários jogos numa só consulta, sem repetidos nem ids inválidos', async () => {
    const { fn, calls } = fakeFetch({ games: () => json([{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 9 }]) });
    const games = await make(fn).getGames([1, 2, 2, -4, 1.5, 3]);
    expect(games.map((g) => g.name)).toEqual(['A', 'B']);
    expect(calls.filter((c) => c.url.endsWith('/games'))).toHaveLength(1);
    expect(String(calls[1].init?.body)).toContain('where id = (1,2,3); limit 3;');
    expect(await make(fakeFetch().fn).getGames([])).toEqual([]);
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
