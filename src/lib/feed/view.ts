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
  /** Jogos marcados, na ordem em que foram escolhidos. `status` é o do jogo no Game Shelf de quem postou (só quando está lá). */
  games: { igdbId: number; name: string; coverUrl?: string; status?: ShelfStatus }[];
  /** É de quem está vendo: libera editar e excluir. */
  own: boolean;
  /** Só nos posts próprios: o estado atual, para a edição abrir preenchida. */
  edit?: { imageRef: string | null };
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
    games: post.games.map((game) => ({
      igdbId: game.igdbId,
      name: game.name,
      coverUrl: coverUrl(game.coverImageId, 'cover_small'),
      status: game.status ?? undefined,
    })),
    own,
    edit: own ? { imageRef: post.imageRef } : undefined,
  };
}
