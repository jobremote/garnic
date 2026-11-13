import { coverUrl } from '@/lib/igdb/igdb';
import { mediaUrl } from '@/lib/profile/images';
import type { ShelfStatus } from '@/lib/shelf/status';
import type { FeedPost } from './posts';
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
  game?: { name: string; coverUrl?: string };
  /** Status do jogo marcado no Game Shelf de quem postou (só quando o jogo está lá). */
  status?: ShelfStatus;
  /** É de quem está vendo: libera editar e excluir. */
  own: boolean;
  /** Só nos posts próprios: o estado atual, para a edição abrir preenchida. */
  edit?: { imageRef: string | null; gameIgdbId: number | null };
}

export function toPostView(post: FeedPost, viewerId: string, now: Date): PostView {
  const own = post.author.id === viewerId;
  return {
    id: post.id,
    authorName: post.author.name,
    username: post.author.username,
    avatarUrl: mediaUrl(post.author.avatarKey),
    time: timeAgo(post.createdAt, now),
    edited: post.editedAt !== null,
    body: post.body,
    imageUrl: mediaUrl(post.imageRef),
    spoiler: post.spoiler,
    game: post.game ? { name: post.game.name, coverUrl: coverUrl(post.game.coverImageId, 'cover_small') } : undefined,
    status: post.authorStatus ?? undefined,
    own,
    edit: own ? { imageRef: post.imageRef, gameIgdbId: post.game?.igdbId ?? null } : undefined,
  };
}
