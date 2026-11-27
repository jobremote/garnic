/** Endereço da página do jogo: o slug do IGDB e, sem ele, o id do IGDB (por exemplo, `/jogo/celeste`). */
export const gamePath = (game: { slug: string | null; igdbId: number }) => `/jogo/${encodeURIComponent(game.slug ?? String(game.igdbId))}`;
