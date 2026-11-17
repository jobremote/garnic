import { IMAGE_MAX_BYTES } from '@/lib/profile/images';
import { REPORT_DETAILS_MAX } from '@/lib/shelf/screenshot';
import { COMMENT_MAX, type CommentErrorCode } from './comments';
import { POST_GAMES_MAX, POST_MAX, type PostErrorCode } from './posts';

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
  gamesCount: (count: number) => `${count}/${POST_GAMES_MAX} jogos`, // novo
  gamesLimit: `Você já marcou ${POST_GAMES_MAX} jogos, o máximo por post.`, // novo
  mentionListLabel: 'Sugestões de jogos', // novo
  mentionHint: 'Digite pelo menos 2 letras do nome do jogo.', // novo
  mentionKeys: '↑ ↓ navegar · Enter escolher · Esc fechar', // novo
  mentionTooLong: `O nome do jogo não cabe: o texto passaria de ${POST_MAX.toLocaleString('pt-BR')} caracteres.`, // novo
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
  searchHint: `Digite pelo menos 2 letras. O jogo não precisa estar no seu Game Shelf; até ${POST_GAMES_MAX} jogos por post.`,
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

  // Curtir e comentar (entrega 2)
  backToFeed: 'Voltar ao feed', // novo
  like: 'Curtir', // novo
  unlike: 'Remover curtida', // novo
  comment: 'Comentar', // novo
  likeError: 'Não foi possível atualizar a curtida. Tente de novo.', // novo
  commentsTitle: 'Comentários', // novo
  commentsCount: (count: number) => `Comentários · ${count}`, // novo
  commentFieldLabel: 'Escrever um comentário', // novo
  commentPlaceholder: 'Escreva um comentário', // novo
  commentPublish: 'Comentar', // novo
  replyFieldLabel: 'Escrever uma resposta', // novo
  replyPlaceholder: 'Escreva uma resposta', // novo
  replyPublish: 'Responder', // novo
  reply: 'Responder', // novo
  cancelReply: 'Cancelar', // novo
  commentCounter: (count: number) => `${count}/${COMMENT_MAX}`, // novo
  commentsEmpty: 'Ainda não há comentários. Seja a primeira pessoa a comentar.', // novo
  commentsLoadMore: 'Ver mais comentários', // novo
  commentsLoadError: 'Não foi possível carregar os comentários. Tente de novo.', // novo
  commentMore: 'Mais opções do comentário', // novo
  commentEdit: 'Editar', // novo
  commentEditLabel: 'Editar comentário', // novo
  commentSave: 'Salvar', // novo
  commentDelete: 'Excluir', // novo
  commentDeleteTitle: 'Excluir este comentário?', // novo
  commentDeleteText: 'Se ele tiver respostas, elas continuam, e no lugar do texto fica "Comentário excluído". Isso não pode ser desfeito.', // novo
  commentHide: 'Ocultar', // novo
  commentShowAgain: 'Mostrar de novo', // novo
  commentHiddenNotice: 'Comentário oculto pelo autor do post.', // novo
  commentHiddenOwnerNotice: 'Oculto para os outros leitores. Só você e o autor do post veem o texto.', // novo
  commentDeletedNotice: 'Comentário excluído.', // novo
  commentEdited: 'editado', // novo
  commentErrors: {
    empty: 'Escreva algo para comentar.',
    'too-long': `O comentário passou de ${COMMENT_MAX} caracteres. Reduza para publicar.`,
  } satisfies Record<CommentErrorCode, string>,
  commentNotFound: 'Não encontramos esse comentário. Ele pode ter sido excluído.', // novo

  // Denúncias (entrega 3)
  report: 'Denunciar', // novo
  reportTitle: { post: 'Denunciar post', comment: 'Denunciar comentário', user: 'Denunciar usuário' }, // novo
  reportQuestion: {
    post: 'Por que você quer denunciar este post? A denúncia é anônima e será analisada.',
    comment: 'Por que você quer denunciar este comentário? A denúncia é anônima e será analisada.',
    user: 'Por que você quer denunciar este perfil, incluindo foto e capa? A denúncia é anônima e será analisada.',
  }, // novo
  reportReasonLegend: 'Motivo', // novo
  reportReasons: { inappropriate: 'Conteúdo inadequado', spam: 'Spam', spoiler: 'Spoiler sem aviso', other: 'Outro motivo' }, // novo
  reportDetails: 'Detalhes (opcional)', // novo
  reportDetailsPlaceholder: 'Conte o que aconteceu', // novo
  reportSend: 'Enviar denúncia', // novo
  reportSent: 'Denúncia enviada. Obrigado, vamos analisar.', // novo
  reportAlready: { post: 'Você já denunciou este post.', comment: 'Você já denunciou este comentário.', user: 'Você já denunciou este usuário.' }, // novo
  reportFailed: 'Não foi possível enviar a denúncia. Tente de novo.', // novo
  reportPickReason: 'Escolha um motivo.', // novo
  reportDetailsTooLong: `Os detalhes podem ter até ${REPORT_DETAILS_MAX} caracteres.`, // novo
  reportNotFound: 'Não encontramos o que você quer denunciar. Pode ter sido excluído.', // novo
  closeToast: 'Fechar aviso', // novo

  postErrors: {
    empty: 'Escreva algo ou adicione uma imagem para publicar.',
    'too-long': `O texto passou de ${POST_MAX.toLocaleString('pt-BR')} caracteres. Reduza para publicar.`,
    'too-many-games': `Um post marca no máximo ${POST_GAMES_MAX} jogos. Tire alguns para publicar.`,
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
