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
} as const;
