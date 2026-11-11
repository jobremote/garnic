/**
 * Cliente do IGDB (https://api-docs.igdb.com). Só roda no servidor: a API não libera CORS e o segredo não pode ir
 * para o navegador.
 *
 * - Autenticação: Twitch, `client_credentials`. O token dura semanas (`expires_in`); fica em memória e é renovado
 *   um pouco antes de vencer, ou quando o IGDB responde 401.
 * - Pedidos: `POST https://api.igdb.com/v4/<endpoint>` com `Client-ID` e `Authorization: Bearer`, corpo em Apicalypse.
 * - Limite: 4 pedidos por segundo e 8 abertos ao mesmo tempo. Os pedidos desta instância saem espaçados em 250 ms.
 * - Imagens: `https://images.igdb.com/igdb/image/upload/t_<tamanho>/<image_id>.jpg` (`_2x` para telas retina).
 *   Imagens removidas ou trocadas no IGDB ficam disponíveis por 30 dias, então guardamos só o `image_id`.
 */

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const API_URL = 'https://api.igdb.com/v4';
const MIN_INTERVAL_MS = 250;
const GAME_FIELDS = 'name,slug,cover.image_id,first_release_date,platforms.name';

export interface IgdbCredentials {
  clientId: string;
  clientSecret: string;
}

/** Credenciais do ambiente, ou `null` se o IGDB não está configurado. */
export function igdbCredentials(env: Record<string, string | undefined> = process.env): IgdbCredentials | null {
  const clientId = env.IGDB_CLIENT_ID?.trim();
  const clientSecret = env.IGDB_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Jogo no formato que o Garnic usa, já limpo da resposta do IGDB. */
export interface IgdbGame {
  igdbId: number;
  name: string;
  slug: string | null;
  coverImageId: string | null;
  releasedAt: Date | null;
  platforms: string[];
}

interface RawGame {
  id: number;
  name?: string;
  slug?: string;
  cover?: { image_id?: string };
  first_release_date?: number;
  platforms?: { name?: string }[];
}

/** Converte um jogo cru do IGDB. Devolve `null` se faltar o essencial (id e nome). */
export function toIgdbGame(raw: RawGame): IgdbGame | null {
  if (typeof raw?.id !== 'number' || !raw.name) return null;
  return {
    igdbId: raw.id,
    name: raw.name,
    slug: raw.slug ?? null,
    coverImageId: raw.cover?.image_id ?? null,
    releasedAt: typeof raw.first_release_date === 'number' ? new Date(raw.first_release_date * 1000) : null,
    platforms: (raw.platforms ?? []).map((p) => p.name).filter((name): name is string => Boolean(name)),
  };
}

interface RawTimeToBeat {
  hastily?: number;
  normally?: number;
  completely?: number;
}

/** Estimativas de tempo para zerar, em minutos. Cada uma pode faltar. */
export interface TimeToBeat {
  /** Só a história principal, sem extras. */
  hastily: number | null;
  /** História com alguns extras. */
  normally: number | null;
  /** 100%. */
  completely: number | null;
}

const toMinutes = (seconds: unknown): number | null =>
  typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : null;

/** O IGDB manda segundos; a tela usa minutos. Sem nenhuma das três, não há dado (`null`). */
export function toTimeToBeat(raw: RawTimeToBeat | undefined): TimeToBeat | null {
  if (!raw) return null;
  const time = { hastily: toMinutes(raw.hastily), normally: toMinutes(raw.normally), completely: toMinutes(raw.completely) };
  return time.hastily || time.normally || time.completely ? time : null;
}

export type CoverSize = 'cover_small' | 'cover_big' | 'thumb' | 'micro';

/** Endereço da capa. Use `retina` para o dobro de resolução (telas com DPR 2). */
export function coverUrl(imageId: string | null | undefined, size: CoverSize = 'cover_big', retina = false): string | undefined {
  if (!imageId || !/^[a-z0-9]+$/i.test(imageId)) return undefined;
  return `https://images.igdb.com/igdb/image/upload/t_${size}${retina ? '_2x' : ''}/${imageId}.jpg`;
}

/** Texto do usuário vira texto Apicalypse seguro: sem aspas nem barras que abririam outro trecho da consulta. */
export function apicalypseString(text: string): string {
  return text.replace(/[\\"\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export class IgdbError extends Error {
  constructor(
    readonly reason: 'not-configured' | 'unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'IgdbError';
  }
}

type Fetch = typeof fetch;

export interface IgdbClientOptions {
  credentials: IgdbCredentials | null;
  fetch?: Fetch;
  now?: () => number;
  /** Espera entre pedidos; trocável nos testes. */
  sleep?: (ms: number) => Promise<void>;
}

export function createIgdbClient(options: IgdbClientOptions) {
  const doFetch: Fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let token: { value: string; expiresAt: number } | null = null;
  let lastRequestAt = 0;
  // Pedidos em fila: cada um espera o anterior sair e depois o intervalo mínimo.
  let queue: Promise<unknown> = Promise.resolve();

  async function authenticate(credentials: IgdbCredentials): Promise<string> {
    if (token && token.expiresAt > now()) return token.value;
    const url = new URL(TOKEN_URL);
    url.searchParams.set('client_id', credentials.clientId);
    url.searchParams.set('client_secret', credentials.clientSecret);
    url.searchParams.set('grant_type', 'client_credentials');
    const response = await doFetch(url, { method: 'POST' });
    if (!response.ok) throw new IgdbError('unavailable', `Twitch recusou a autenticação (${response.status}).`);
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new IgdbError('unavailable', 'Resposta da Twitch sem token.');
    // Renova com uma hora de folga.
    token = { value: body.access_token, expiresAt: now() + Math.max(0, (body.expires_in ?? 0) - 3600) * 1000 };
    return token.value;
  }

  async function post(endpoint: string, body: string): Promise<unknown> {
    const credentials = options.credentials;
    if (!credentials) throw new IgdbError('not-configured', 'IGDB_CLIENT_ID e IGDB_CLIENT_SECRET não estão configurados.');

    const run = async () => {
      const wait = lastRequestAt + MIN_INTERVAL_MS - now();
      if (wait > 0) await sleep(wait);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const bearer = await authenticate(credentials);
        lastRequestAt = now();
        const response = await doFetch(`${API_URL}/${endpoint}`, {
          method: 'POST',
          headers: { 'Client-ID': credentials.clientId, Authorization: `Bearer ${bearer}`, Accept: 'application/json' },
          body,
        });
        if (response.status === 401 && attempt === 0) {
          token = null; // token revogado ou vencido: pede outro e tenta uma vez mais
          continue;
        }
        if (!response.ok) throw new IgdbError('unavailable', `IGDB respondeu ${response.status}.`);
        return response.json();
      }
      throw new IgdbError('unavailable', 'IGDB recusou o token.');
    };

    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  }

  return {
    /** Busca jogos pelo nome. Edições (versões) ficam de fora, como o IGDB recomenda para listas de busca. */
    async searchGames(query: string, limit = 10): Promise<IgdbGame[]> {
      const text = apicalypseString(query);
      if (text.length < 2) return [];
      const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 20);
      const raw = (await post(
        'games',
        `search "${text}"; fields ${GAME_FIELDS}; where version_parent = null; limit ${safeLimit};`,
      )) as RawGame[];
      return raw.map(toIgdbGame).filter((game): game is IgdbGame => game !== null);
    },

    /**
     * Um jogo pelo id do IGDB. Quem grava um jogo na Game Shelf busca aqui os dados em vez de confiar no que o navegador
     * mandou (nome e capa vêm sempre do IGDB).
     */
    async getGame(igdbId: number): Promise<IgdbGame | null> {
      if (!Number.isSafeInteger(igdbId) || igdbId <= 0) return null;
      const raw = (await post('games', `fields ${GAME_FIELDS}; where id = ${igdbId}; limit 1;`)) as RawGame[];
      return raw[0] ? toIgdbGame(raw[0]) : null;
    },

    /**
     * As 3 estimativas de tempo do IGDB (`game_time_to_beats`), em minutos. Devolve `null` quando o jogo não tem dado
     * (a cobertura é irregular): nesse caso a tela não mostra nada, nem zero.
     */
    async getTimeToBeat(igdbId: number): Promise<TimeToBeat | null> {
      if (!Number.isSafeInteger(igdbId) || igdbId <= 0) return null;
      const raw = (await post('game_time_to_beats', `fields hastily,normally,completely; where game_id = ${igdbId}; limit 1;`)) as RawTimeToBeat[];
      return toTimeToBeat(raw[0]);
    },
  };
}

export type IgdbClient = ReturnType<typeof createIgdbClient>;

let shared: IgdbClient | null = null;
/** Cliente compartilhado do processo (o token e o espaçamento dos pedidos valem para todos). */
export function getIgdbClient(): IgdbClient {
  shared ??= createIgdbClient({ credentials: igdbCredentials() });
  return shared;
}
