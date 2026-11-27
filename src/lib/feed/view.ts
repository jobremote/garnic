import { gamePath } from '@/lib/game/path';
import { coverUrl } from '@/lib/igdb/igdb';
import { mediaUrl } from '@/lib/profile/images';
import type { ShelfStatus } from '@/lib/shelf/status';
import { feedMessages } from './messages';
import type { FeedPost, PostActivity } from './posts';
import { timeAgo } from './time';

/** O que um post precisa para ser desenhado no navegador. Nada aqui é sensível: tudo já é público para quem está logado. */
export interface PostView {
  id: string;
  authorName: string;
  username: string;
  avatarUrl?: string;
  /** "há 2 h"; o indicador "editado" vem separado. */
  time: string;
  edited: boolean;
  body: string;
  imageUrl?: string;
  spoiler: boolean;
  /** Jogos marcados, na ordem em que foram escolhidos. `status` é o do jogo no Game Shelf de quem postou (só quando está lá). */
  games: { igdbId: number; name: string; coverUrl?: string; status?: ShelfStatus; /** Página do jogo. */ href?: string }[];
  /** É de quem está vendo: libera editar e excluir. */
  own: boolean;
  likeCount: number;
  liked: boolean;
  commentCount: number;
  /** Só nos posts próprios: o estado atual, para a edição abrir preenchida. */
  edit?: { imageRef: string | null };
  /** Post de atividade (Game Shelf compartilhado). Os textos já vêm prontos; o post conta o que aconteceu na hora. */
  activity?: ActivityView;
}

/** Post de atividade como a tela precisa (Figma: Post de atividade). */
export interface ActivityView {
  phrase: string;
  gameName: string;
  /** Página do jogo. */
  gameHref?: string;
  coverUrl?: string;
  /** "2022 · PC (Windows)". */
  meta: string;
  /** "38 h · Nota 5 de 5": só o que a pessoa informou. */
  detail?: string;
  status: ShelfStatus;
  /** Trecho da review (só em "Escreveu uma review"). */
  excerpt?: string;
  /** Screenshot (só em "Subiu uma screenshot"). */
  imageUrl?: string;
}

const EXCERPT_MAX = 200;

const formatMinutes = (total: number) => {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours > 0 ? (minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`) : `${minutes} min`;
};

/** Primeiras palavras da review, com reticências quando passa do limite. */
export function excerptOf(review: string, max = EXCERPT_MAX): string {
  const text = review.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

function toActivityView(activity: PostActivity): ActivityView {
  const m = feedMessages;
  const year = activity.game.releasedAt ? String(activity.game.releasedAt.getUTCFullYear()) : null;
  // Tempo e nota aparecem só quando a pessoa informou (o registro de Zerado não exige nenhum dos dois).
  const parts: string[] = [];
  if (activity.kind === 'finished' && activity.playMinutes) parts.push(formatMinutes(activity.playMinutes));
  if ((activity.kind === 'finished' || activity.kind === 'rated') && activity.rating) parts.push(m.activityRating(activity.rating));
  return {
    phrase: m.activityPhrase[activity.kind],
    gameName: activity.game.name,
    gameHref: gamePath(activity.game),
    coverUrl: coverUrl(activity.game.coverImageId, 'cover_small'),
    meta: [year, activity.platform].filter(Boolean).join(' · '),
    detail: parts.length > 0 ? parts.join(' · ') : undefined,
    status: activity.status,
    excerpt: activity.kind === 'review' && activity.review ? excerptOf(activity.review) : undefined,
    imageUrl: activity.kind === 'screenshot' ? mediaUrl(activity.screenshotRef) : undefined,
  };
}

export function toPostView(post: FeedPost, viewerId: string, now: Date): PostView {
  const own = post.author.id === viewerId;
  return {
    activity: post.activity ? toActivityView(post.activity) : undefined,
    id: post.id,
    authorName: post.author.name,
    username: post.author.username,
    avatarUrl: mediaUrl(post.author.avatarKey),
    time: timeAgo(post.createdAt, now),
    edited: post.editedAt !== null,
    body: post.body,
    imageUrl: mediaUrl(post.imageRef),
    spoiler: post.spoiler,
    games: post.games.map((game) => ({
      igdbId: game.igdbId,
      href: gamePath(game),
      name: game.name,
      coverUrl: coverUrl(game.coverImageId, 'cover_small'),
      status: game.status ?? undefined,
    })),
    likeCount: post.likeCount,
    liked: post.liked,
    commentCount: post.commentCount,
    own,
    edit: own ? { imageRef: post.imageRef } : undefined,
  };
}
