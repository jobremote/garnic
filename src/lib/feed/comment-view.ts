import { mediaUrl } from '@/lib/profile/images';
import type { CommentNode } from './comments';
import { timeAgo } from './time';

/** O que um comentário precisa para ser desenhado no navegador. O texto só vem quando a pessoa pode lê-lo. */
export interface CommentView {
  id: string;
  authorName: string;
  username: string;
  avatarUrl?: string;
  /** "há 2 h"; o indicador "editado" vem separado. */
  time: string;
  edited: boolean;
  status: CommentNode['status'];
  /** Nulo em `hidden` e `deleted`. */
  body: string | null;
  likeCount: number;
  liked: boolean;
  /** É de quem está vendo: libera editar e excluir. */
  own: boolean;
  /** Quem está vendo é o dono do post: libera ocultar e mostrar de novo. */
  canModerate: boolean;
  replies: CommentView[];
}

export function toCommentView(node: CommentNode, viewerId: string, postOwnerId: string, now: Date): CommentView {
  return {
    id: node.id,
    authorName: node.author.name,
    username: node.author.username,
    avatarUrl: mediaUrl(node.author.avatarKey),
    time: timeAgo(node.createdAt, now),
    edited: node.editedAt !== null,
    status: node.status,
    body: node.body,
    likeCount: node.likeCount,
    liked: node.liked,
    own: node.author.id === viewerId,
    canModerate: postOwnerId === viewerId && node.status !== 'deleted',
    replies: node.replies.map((reply) => toCommentView(reply, viewerId, postOwnerId, now)),
  };
}
