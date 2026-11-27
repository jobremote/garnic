/** Textos da página do jogo (Figma: Página do jogo, arquivo Feed). */

export const formatMinutes = (total: number) => {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours > 0 ? (minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`) : `${minutes} min`;
};

/** Nota com uma casa decimal e vírgula (3,8). */
export const formatRating = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const gameMessages = {
  about: 'Sobre',
  summaryTranslated: 'Resumo do IGDB, traduzido automaticamente.',
  summaryOriginal: 'Resumo do IGDB, em inglês.',
  noSummary: 'O IGDB ainda não tem um resumo deste jogo.',
  community: 'Na comunidade',
  ratingLabel: (count: number) => `Nota média (${count} ${count === 1 ? 'nota' : 'notas'})`,
  ownersLabel: (count: number) => (count === 1 ? 'Tem o jogo' : 'Têm o jogo'),
  times: 'Tempo para zerar',
  igdbEstimate: 'Estimativa do IGDB',
  hastily: 'Rápido',
  normally: 'Normal',
  completely: '100%',
  communityTime: 'Comunidade Garnic',
  communityTimeLabel: (count: number) => `Média de ${count} pessoas`,
  timesNote: 'Tempos informados por quem zerou o jogo. A média aparece a partir de 5 pessoas.',
  screenshots: 'Screenshots da comunidade',
  screenshotsCount: (total: number) => `Screenshots da comunidade (${total})`,
  noScreenshots: 'Ninguém compartilhou screenshots deste jogo ainda.',
  moreScreenshots: 'Ver mais screenshots',
  loadingMore: 'Carregando...',
  loadFailed: 'Não deu para carregar. Tente de novo.',
  screenshotAlt: (game: string, username: string) => `Screenshot de ${game} enviada por @${username}`,
  screenshotTitle: (game: string) => `Screenshot de ${game}`,
  sentBy: 'Enviada por',
  report: 'Denunciar',
  close: 'Fechar',
  posts: 'Posts sobre o jogo',
  noPosts: 'Nenhum post sobre este jogo ainda. Que tal escrever o primeiro?',
  developer: 'Desenvolvedora',
  publisher: 'Publicadora',
  developerAndPublisher: 'Desenvolvedora e publicadora',
  coverAlt: (game: string) => `Capa de ${game}`,
  edit: 'Editar',
  add: 'Adicionar ao Game Shelf',
  addTitle: 'Adicionar ao Game Shelf',
  cancel: 'Cancelar',
  confirmAdd: 'Adicionar',
  added: (game: string, status: string) => `${game} entrou em ${status}.`,
  addFailed: 'Não deu para adicionar agora. Tente de novo.',
  closeToast: 'Fechar aviso',
} as const;

/** "Desenvolvedora: A · Publicadora: B", juntando quando as duas listas são iguais. */
export function creditsLine(developers: string[], publishers: string[]): string | null {
  const m = gameMessages;
  const dev = developers.join(', ');
  const pub = publishers.join(', ');
  if (dev && dev === pub) return `${m.developerAndPublisher}: ${dev}`;
  const parts = [dev ? `${m.developer}: ${dev}` : null, pub ? `${m.publisher}: ${pub}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}
