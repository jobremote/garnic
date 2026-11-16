/**
 * Marcar jogos com "@" (entrega B do Feed, `01_produto/regras-de-negocio/feed.md`): digitar "@" abre a busca de jogos; ao
 * escolher, o nome entra no texto como "@Nome do jogo" (texto comum) e o jogo entra na lista de marcados. Apagar o
 * "@Nome" do texto tira o jogo da lista. Funções puras, sem tela, para testar à parte.
 */

/** Quantos caracteres depois do "@" a busca acompanha (nomes de jogo têm espaços, então não para no primeiro). */
export const MENTION_QUERY_MAX = 40;

/** O texto que fica no post para um jogo marcado. */
export const mentionToken = (name: string): string => `@${name}`;

export interface MentionTrigger {
  /** Posição do "@" no texto. */
  start: number;
  /** O que foi digitado depois do "@" até o cursor. */
  query: string;
}

/**
 * Procura um "@" em edição logo antes do cursor: o "@" tem que estar no começo do texto ou depois de um espaço ou quebra
 * de linha, e o que vem depois dele até o cursor não pode ter quebra de linha nem passar de `MENTION_QUERY_MAX`. Um "@"
 * que já virou menção de um jogo marcado (`marked`) não abre a busca de novo quando a pessoa continua escrevendo depois dele.
 */
export function findMentionTrigger(text: string, caret: number, marked: readonly { name: string }[] = []): MentionTrigger | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf('@');
  if (start === -1) return null;
  if (start > 0 && !/\s/.test(before[start - 1])) return null;
  const query = before.slice(start + 1);
  if (query.includes('\n') || query.length > MENTION_QUERY_MAX) return null;
  const done = marked.some((game) => {
    const token = mentionToken(game.name);
    return text.startsWith(token, start) && caret >= start + token.length;
  });
  return done ? null : { start, query };
}

/**
 * Põe "@Nome" no texto no lugar de `range` (o "@consulta" que a pessoa digitava, ou o cursor, quando veio do botão
 * "Marcar jogo"). Garante um espaço antes (se houver texto colado) e um depois, e devolve onde fica o cursor.
 */
export function insertMention(text: string, name: string, range: { start: number; end: number }): { text: string; caret: number } {
  const before = text.slice(0, range.start);
  const after = text.slice(range.end);
  const lead = before !== '' && !/\s$/.test(before) ? ' ' : '';
  const trail = after !== '' && /^\s/.test(after) ? '' : ' ';
  const inserted = `${lead}${mentionToken(name)}${trail}`;
  return { text: `${before}${inserted}${after}`, caret: before.length + inserted.length };
}

/**
 * O texto sem as menções dos jogos marcados, com as pontas aparadas. Serve à regra "texto ou imagem é obrigatório; só
 * marcar o jogo não basta": um post só com "@Nome" não tem texto de verdade.
 */
export function withoutMentions(text: string, games: readonly { name: string }[]): string {
  return games.reduce((rest, game) => rest.split(mentionToken(game.name)).join(' '), text).trim();
}

/** Mantém só os jogos cujo "@Nome" ainda está no texto (apagar a menção tira o jogo da lista). */
export function syncMarkedGames<T extends { name: string }>(text: string, games: readonly T[]): T[] {
  return games.filter((game) => text.includes(mentionToken(game.name)));
}
