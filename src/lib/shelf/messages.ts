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
  // Cadastro rápido de vários jogos (botão + de cada coluna)
  quickAddLabel: (status: ShelfStatus) => `Adicionar jogos em ${STATUS_LABEL[status]}`, // novo
  quickAddTitle: (status: ShelfStatus) => `Adicionar em ${STATUS_LABEL[status]}`, // novo
  quickAddHint: (max: number) => `Escolha quantos jogos quiser (até ${max} por vez). Todos entram nesta coluna.`, // novo
  quickChosen: 'Jogos escolhidos', // novo
  quickNone: 'Nenhum jogo escolhido ainda.', // novo
  quickInclude: 'Incluir', // novo
  quickIncluded: 'Incluído', // novo
  quickRemoveChip: 'Tirar da lista', // novo
  quickFull: (max: number) => `Você chegou a ${max} jogos. Adicione estes e depois escolha mais.`, // novo
  quickConfirm: (count: number) => (count === 1 ? 'Adicionar 1 jogo' : `Adicionar ${count} jogos`), // novo
  quickAdded: (count: number) => (count === 1 ? '1 jogo adicionado' : `${count} jogos adicionados`), // novo
  quickAddedText: (status: ShelfStatus, skipped: number) =>
    `Entraram em ${STATUS_LABEL[status]}.${skipped > 0 ? ` ${skipped === 1 ? '1 já estava' : `${skipped} já estavam`} na sua Game Shelf e não mudou de coluna.` : ''}`, // novo
  quickAllExisting: 'Esses jogos já estão na sua Game Shelf', // novo
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
  reviewSpoiler: 'A review contém spoiler', // novo
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
  'invalid-tags': 'Escolha tags que existam na sua conta.', // novo
  'too-many-tags': 'Cada jogo pode ter até 5 tags.', // novo
  'invalid-screenshot': 'Não foi possível usar essa imagem. Envie outra.', // novo
} as const;

/** Screenshot da entrada e denúncia (decisões de 11/11/2026: até 5 MB, JPG, PNG ou WebP; a denúncia só registra). */
export const screenshotMessages = {
  label: 'Screenshot', // novo
  help: (max: string) => `JPG, PNG ou WebP, até ${max}. Uma por jogo, visível para quem vê seu perfil.`, // novo
  alt: (game: string) => `Screenshot de ${game}`, // novo
  spoiler: 'Contém spoiler',
  spoilerCheckbox: 'A screenshot contém spoiler', // novo
  spoilerHint: 'A imagem fica desfocada até alguém clicar em Mostrar.', // novo
  tooBig: (max: string) => `A imagem pode ter até ${max}.`, // novo
  wrongType: 'Use uma imagem JPG, PNG ou WebP.', // novo
  uploadFailed: 'Não foi possível enviar a imagem. Tente de novo.', // novo
  uploadUnavailable: 'O envio de imagens ainda não está disponível neste ambiente.', // novo
  // Ver a entrada de um jogo
  viewEntry: 'Ver entrada', // novo
  viewTitle: 'Entrada', // novo
  noDetails: 'Nenhum detalhe preenchido ainda.', // novo
  reviewTitle: 'Review', // novo
  platform: 'Plataforma', // novo
  period: 'Período', // novo
  playTime: 'Tempo de jogo', // novo
  rating: 'Nota', // novo
  // Denúncia
  report: 'Denunciar screenshot', // novo
  reportTitle: 'Denunciar screenshot', // novo
  reportText: 'Conte o motivo. A denúncia é registrada para revisão; a imagem continua visível até lá.', // novo
  reasonLabel: 'Motivo', // novo
  reasons: { inappropriate: 'Conteúdo inadequado', spam: 'Spam', spoiler: 'Spoiler sem aviso', other: 'Outro motivo' }, // novo
  detailsLabel: 'Detalhes (opcional)', // novo
  send: 'Enviar denúncia', // novo
  reported: 'Denúncia enviada', // novo
  reportedText: 'Obrigado. Vamos analisar.', // novo
  alreadyReported: 'Você já denunciou essa imagem.', // novo
  reportFailed: 'Não foi possível enviar a denúncia. Tente de novo.', // novo
} as const;

/** Textos de tags (decisão de 11/11/2026: nome até 24 caracteres, 30 tags por pessoa, 5 por jogo). */
export const tagMessages = {
  tagsLabel: 'Tags',
  tagsNone: 'Nenhuma tag neste jogo.', // novo
  newTag: 'Nova tag',
  newTagPlus: '+ Nova tag',
  tagNameLabel: 'Nome da tag', // novo
  tagNameHint: (count: number, max: number) => `${count}/${max} caracteres.`, // novo
  tagColorLabel: 'Cor',
  tagPreview: 'Pré-visualização', // novo
  create: 'Criar tag', // novo
  saveTag: 'Salvar tag', // novo
  editTag: 'Editar tag',
  deleteTag: 'Excluir tag',
  manageTags: 'Gerenciar tags',
  manageTagsEmpty: 'Você ainda não criou nenhuma tag.', // novo
  tagGames: (count: number) => (count === 1 ? '1 jogo' : `${count} jogos`),
  tagsCounter: (count: number, max: number) => `${count} de ${max} tags.`, // novo
  filterLabel: 'Filtrar por tag', // novo
  filterAll: 'Todos os jogos', // novo
  filterEmpty: 'Nenhum jogo com essa tag.',
  deleteTitle: 'Excluir tag?', // novo
  deleteText: (name: string, games: number) =>
    games > 0
      ? `A tag ${name} sai de ${games === 1 ? '1 jogo' : `${games} jogos`}. Os jogos continuam na sua Game Shelf.`
      : `A tag ${name} será excluída.`, // novo
  tagCreated: 'Tag criada', // novo
  tagCreatedText: (name: string) => `A tag ${name} está pronta para usar.`, // novo
  tagSaved: 'Tag salva', // novo
  tagDeleted: 'Tag excluída', // novo
  tagDeletedText: (name: string) => `A tag ${name} foi excluída. Os jogos continuam na Game Shelf.`, // novo
  maxPerEntry: (max: number) => `Até ${max} tags por jogo.`, // novo
  closeManage: 'Fechar', // novo
} as const;

/** Mensagem de cada erro de validação de tag (`src/lib/shelf/tags.ts`). */
export const tagErrorMessages = {
  'name-required': 'Dê um nome à tag.', // novo
  'name-too-long': (max: number) => `O nome pode ter até ${max} caracteres.`, // novo
  'name-taken': 'Você já tem uma tag com esse nome.', // novo
  'invalid-color': 'Escolha uma das cores.', // novo
  'too-many-tags': (max: number) => `Você já tem ${max} tags. Exclua uma para criar outra.`, // novo
} as const;
