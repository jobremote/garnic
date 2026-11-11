/** Textos do perfil. Vêm do protótipo do Figma ("Perfil do usuário", 10/11/2026); os marcados como "novo" precisam de revisão. */

import { IMAGE_MAX_BYTES, IMAGE_RECOMMENDED_SIZE } from './images';

const mb = (bytes: number) => `${bytes / 1024 / 1024} MB`;
const { cover, avatar } = IMAGE_RECOMMENDED_SIZE;

const dateFormat =new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' });

/** Data no formato dd/mm/aaaa, no horário de Brasília. */
export const formatDate = (date: Date) => dateFormat.format(date);

export const profileMessages = {
  title: 'Editar perfil',
  cover: 'Capa',
  avatar: 'Foto de perfil',
  coverHint: `Tamanho recomendado: ${cover.width} × ${cover.height} px (proporção 26:5). JPG, PNG ou WebP, até ${mb(IMAGE_MAX_BYTES.cover)}. O centro da imagem aparece em todas as telas.`,
  avatarHint: `Imagem quadrada de ${avatar.width} × ${avatar.height} px ou mais. JPG, PNG ou WebP, até ${mb(IMAGE_MAX_BYTES.avatar)}.`,
  changeCover: 'Trocar capa',
  coverPositionLabel: 'Enquadramento da capa', // novo
  coverPositionHint: 'Arraste a imagem para cima ou para baixo, ou use o controle, para escolher o que aparece na capa.', // novo
  coverPositionInvalid: 'O enquadramento da capa não é válido.', // novo
  coverPositionTop: 'Topo', // novo
  coverPositionBottom: 'Base', // novo
  removeCover: 'Remover capa',
  changePhoto: 'Trocar foto',
  removePhoto: 'Remover foto',
  nameLabel: 'Nome completo',
  nameHint: 'Nome e sobrenome. Você pode trocar o nome uma vez a cada 60 dias.',
  nameLocked: (date: Date) => `Você poderá trocar o nome de novo em ${formatDate(date)}.`,
  usernameLabel: '@usuário',
  usernameHint: 'Você pode trocar o @usuário uma vez a cada 30 dias.',
  usernameLocked: (date: Date) => `Você poderá trocar o @usuário de novo em ${formatDate(date)}.`,
  bioLabel: 'Bio',
  bioCounter: (count: number) => `${count}/160 caracteres.`,
  bioTooLong: (count: number) => `${count}/160 caracteres. Reduza o texto para salvar.`,
  save: 'Salvar',
  cancel: 'Cancelar',
  removeCoverTitle: 'Remover capa?', // novo
  removeCoverText: 'Sua capa volta à cor sólida padrão. Você pode enviar uma nova quando quiser.', // novo
  removePhotoTitle: 'Remover foto?',
  removePhotoText: 'Seu avatar volta ao padrão, com a inicial do seu nome. Você pode enviar uma nova foto quando quiser.',
  remove: 'Remover',
  imageType: 'Use uma imagem JPG, PNG ou WebP.', // novo
  avatarTooBig: `A foto pode ter até ${mb(IMAGE_MAX_BYTES.avatar)}.`, // novo
  coverTooBig: `A capa pode ter até ${mb(IMAGE_MAX_BYTES.cover)}.`, // novo
  uploading: 'Enviando imagem…', // novo
  uploadFailed: 'Não foi possível enviar a imagem. Tente de novo.', // novo
  uploadUnavailable: 'O envio de imagens ainda não está disponível neste ambiente.', // novo
  storageUnavailable:'Não foi possível guardar a imagem agora. Tente de novo mais tarde.', // novo
  saveFailed: 'Não foi possível salvar. Tente de novo.', // novo
  // Perfil
  edit: 'Editar perfil',
  follow: 'Seguir',
  report: 'Denunciar',
  followers: 'Seguidores',
  following: 'Seguindo',
  zeroedThisYear: 'Zerados no ano',
  backlog: 'Backlog',
  gameShelf: 'Game Shelf',
  gameShelfAdd: 'Adicionar jogo',
  shelfEmpty: 'Nenhum jogo aqui ainda.',
  posts: 'Posts',
  noPostsTitle: 'Ainda não há posts',
  noPostsTextOwn: 'Marque um jogo, escreva sobre ele e compartilhe com quem segue você.',
  noPostsTextOther: 'Quando essa pessoa publicar, os posts aparecem aqui.',
  statuses: ['Quero jogar', 'Parado', 'Jogando', 'Zerado'],
} as const;
