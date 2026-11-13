import { IMAGE_MAX_BYTES } from '@/lib/profile/images';
import { POST_MAX, type PostErrorCode } from './posts';

const mb = (bytes: number) => `${bytes / 1024 / 1024} MB`;

/** Textos do Feed. Vêm do protótipo do Figma ("Feed", 13/11/2026); os marcados como "novo" precisam de revisão. */
export const feedMessages = {
  composerLabel: 'Escrever um post',
  composerPlaceholder: 'O que você está jogando?',
  publish: 'Publicar',
  addImage: 'Adicionar imagem',
  removeImage: 'Remover imagem',
  imageAlt: 'Imagem do post',
  imageHint: `JPG, PNG ou WebP, até ${mb(IMAGE_MAX_BYTES.post)}.`,
  uploading: 'Enviando imagem…', // novo
  markGame: 'Marcar jogo',
  changeGame: 'Trocar jogo', // novo
  removeGame: 'Remover jogo marcado', // novo
  spoiler: 'Contém spoiler',
  published: 'Post publicado.', // novo
  saved: 'Post atualizado.', // novo
  deleted: 'Post excluído.', // novo

  tabsLabel: 'Feed',
  tabFollowing: 'Seguindo',
  tabMyGames: 'Meus jogos',
  loadMore: 'Ver mais',
  loadingMore: 'Carregando…', // novo
  loadMoreError: 'Não foi possível carregar mais posts. Tente de novo.', // novo

  // Cold start e listas vazias
  welcomeTitle: 'Bem-vindo ao Garnic',
  welcomeText: 'Siga pessoas e adicione jogos ao seu Game Shelf para montar o seu feed. Enquanto isso, veja o que a comunidade anda jogando.',
  communityTitle: 'Posts recentes da comunidade', // novo
  noGamesTitle: 'Nada por aqui ainda',
  noGamesText: 'Aqui aparecem os posts sobre os jogos do seu Game Shelf (Quero jogar, Jogando e Zerado). Adicione o seu primeiro jogo para começar.',
  addFirstGame: 'Adicionar um jogo',
  noMyGamesPostsTitle: 'Ainda não há posts sobre os seus jogos', // novo
  noMyGamesPostsText: 'Quando alguém postar sobre um jogo do seu Game Shelf, o post aparece aqui. Que tal ser a primeira pessoa?', // novo

  // Menu e janelas do post
  more: 'Mais opções',
  edit: 'Editar',
  remove: 'Excluir',
  editTitle: 'Editar post',
  save: 'Salvar',
  cancel: 'Cancelar',
  deleteTitle: 'Excluir este post?', // novo
  deleteText: 'O post será apagado de vez, junto com a imagem. Isso não pode ser desfeito.', // novo
  edited: 'editado',

  // Marcar jogo
  markGameTitle: 'Marcar um jogo',
  searchLabel: 'Buscar jogo',
  searchPlaceholder: 'Nome do jogo',
  searchHint: 'Digite pelo menos 2 letras. O jogo não precisa estar no seu Game Shelf; só 1 jogo por post.',
  searching: 'Buscando…',
  noResultsTitle: 'Nenhum jogo encontrado',
  noResultsText: 'Confira o nome e tente de novo.',
  notConfigured: 'A busca de jogos ainda não está configurada neste ambiente.',
  unavailable: 'Não foi possível buscar agora. Tente de novo em instantes.',
  pick: 'Marcar',

  // Quem seguir e seguir
  viewMyProfile: 'Ver meu perfil',
  viewProfileOf: (name: string) => `Ver perfil de ${name}`,
  whoToFollow: 'Quem seguir',
  noSuggestions: 'Ninguém novo por aqui por enquanto.', // novo
  follow: 'Seguir',
  following: 'Seguindo',
  unfollow: 'Deixar de seguir',
  followError: 'Não foi possível atualizar. Tente de novo.', // novo
  followersLabel: 'Seguidores',
  followingLabel: 'Seguindo',

  postErrors: {
    empty: 'Escreva algo ou adicione uma imagem para publicar.',
    'too-long': `O texto passou de ${POST_MAX.toLocaleString('pt-BR')} caracteres. Reduza para publicar.`,
  } satisfies Record<PostErrorCode, string>,
  imageType: 'Use uma imagem JPG, PNG ou WebP.',
  imageSize: `A imagem passou de ${mb(IMAGE_MAX_BYTES.post)}.`,
  imageUnavailable: 'O envio de imagens não está configurado neste ambiente.',
  imageFailed: 'Não foi possível enviar a imagem. Tente de novo.',
  invalidImage: 'A imagem enviada não é válida. Envie outra.',
  gameNotFound: 'Não encontramos esse jogo. Escolha outro.',
  notFound: 'Não encontramos esse post. Ele pode ter sido excluído.',
  generic: 'Algo deu errado. Tente de novo.',
  counter: (count: number) => `${count}/${POST_MAX}`,
} as const;
