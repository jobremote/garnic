/** Textos da Game Shelf. Vêm do protótipo do Figma ("Game Shelf", 10/11/2026); os marcados como "novo" precisam de revisão. */

import { STATUS_LABEL, type ShelfStatus } from './status';

export const STATUS_QUESTION: Record<ShelfStatus, string> = {
  'quero-jogar': 'Está na minha lista de desejos.', // novo
  parado: 'Comecei e deixei de lado.', // novo
  jogando: 'Estou jogando agora.', // novo
  zerado: 'Já terminei.', // novo
};

export const shelfMessages = {
  addGame: 'Adicionar jogo',
  searchLabel: 'Buscar jogo',
  searchPlaceholder: 'Digite o nome do jogo',
  searchHint: 'Digite pelo menos 2 letras.', // novo
  searching: 'Buscando…', // novo
  noResultsTitle: 'Nenhum jogo encontrado', // novo
  noResultsText: 'Confira o nome ou tente outro termo.', // novo
  unavailable: 'A busca de jogos está fora do ar agora. Tente de novo em instantes.', // novo
  notConfigured: 'A busca de jogos ainda não está configurada neste ambiente.', // novo
  add: 'Adicionar',
  back: 'Voltar',
  chooseStatus: 'Em que coluna esse jogo entra?', // novo
  chooseStatusHint: 'Você pode mudar depois e preencher os detalhes quando quiser.', // novo
  added: 'Jogo adicionado',
  addedText: (name: string, status: ShelfStatus) => `${name} entrou em ${STATUS_LABEL[status]}.`,
  alreadyOnShelf: 'Esse jogo já está na sua Game Shelf', // novo
  alreadyOnShelfText: (name: string, status: ShelfStatus) => `${name} está em ${STATUS_LABEL[status]}.`, // novo
  moved: 'Jogo movido', // novo
  movedText: (name: string, status: ShelfStatus) => `${name} agora está em ${STATUS_LABEL[status]}.`, // novo
  closeToast: 'Fechar aviso',
  actionsLabel: (name: string) => `Ações de ${name}`, // novo
  moveTo: (status: ShelfStatus) => `Mover para ${STATUS_LABEL[status]}`,
  dropHere: 'Solte aqui', // novo
  failed: 'Não foi possível concluir. Tente de novo.', // novo
  alreadyHere: 'Esse jogo já está nessa coluna.', // novo
  empty: 'Nenhum jogo aqui ainda.',
  // Adicionar e detalhar
  addAndDetail: 'Adicionar e detalhar', // novo
  // Menu do card
  editEntry: 'Editar entrada',
  removeEntry: 'Remover da Game Shelf',
  // Editar entrada
  editTitle: 'Editar entrada', // novo
  tabsLabel: 'Seções da entrada', // novo
  tabEssential: 'Essencial',
  tabPlaythrough: 'Jogatina',
  tabReview: 'Review',
  filledTab: 'preenchida',
  statusLabel: 'Status',
  ratingLabel: 'Nota',
  clearRating: 'Limpar nota', // novo
  platformLabel: 'Plataforma',
  platformNone: 'Sem plataforma', // novo
  startLabel: 'Início',
  endLabel: 'Fim',
  timeLabel: 'Tempo de jogo',
  timeOnlyZeroed: 'O tempo de jogo aparece quando o jogo está em Zerado.', // novo
  igdbTimes: 'Estimativas do IGDB', // novo
  igdbTimesHint: 'Referência para informar o seu tempo.', // novo
  timeFast: 'Rápido', // novo
  timeNormal: 'Normal', // novo
  timeComplete: '100%', // novo
  reviewLabel: 'Review',
  reviewCounter: (count: number, max: number) => `${count}/${max} caracteres.`, // novo
  reviewSpoiler: 'Contém spoiler', // novo
  reviewSpoilerHint: 'O texto fica escondido atrás de um clique.', // novo
  save: 'Salvar',
  cancel: 'Cancelar',
  saved: 'Entrada salva', // novo
  savedText: (name: string) => `Os detalhes de ${name} foram atualizados.`, // novo
  loading: 'Carregando…', // novo
  loadFailed: 'Não foi possível abrir a entrada. Tente de novo.', // novo
  // Pop-up do Zerado
  zeroedTitle: 'Jogo zerado!', // novo
  zeroedBanner: (name: string) => `${name} está em Zerado.`, // novo
  zeroedText: 'Quer contar mais? Nota, data de fim e tempo de jogo ajudam a comunidade e facilitam conexões. Tudo aqui é opcional.', // novo
  zeroedSkip: 'Agora não', // novo
  // Remover
  removeTitle: 'Remover da Game Shelf?', // novo
  removeText: (name: string) => `${name} sai da sua Game Shelf, junto com a nota, a review e as datas. Os posts que marcaram o jogo continuam existindo. Não dá para desfazer.`, // novo
  remove: 'Remover',
  removed: 'Jogo removido', // novo
  removedText: (name: string) => `${name} saiu da sua Game Shelf.`, // novo
} as const;

/** Mensagem de cada erro de validação da entrada (`src/lib/shelf/entry.ts`). */
export const entryErrorMessages = {
  'invalid-status': 'Escolha um status válido.',
  'invalid-rating': 'A nota vai de 1 a 5 estrelas.',
  'invalid-platform': 'Escolha uma das plataformas do jogo.',
  'review-too-long': (max: number) => `A review pode ter até ${max} caracteres.`,
  'date-incomplete': 'Informe o mês e o ano.',
  'date-invalid': 'Essa data não é válida.',
  'date-future': 'Essa data ainda não chegou.',
  'end-before-start': 'O fim não pode ser antes do início.',
  'invalid-time': 'Informe um tempo maior que zero.',
} as const;
