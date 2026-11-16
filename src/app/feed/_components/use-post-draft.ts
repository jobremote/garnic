'use client';

import { useState } from 'react';
import { feedMessages as t } from '@/lib/feed/messages';
import { mentionToken } from '@/lib/feed/mentions';
import { IMAGE_CONTENT_TYPES, IMAGE_MAX_BYTES, mediaUrl } from '@/lib/profile/images';
import { uploadImage, type UploadMode } from '@/app/perfil/_components/upload-image';
import type { MarkedGame } from './MarkGameModal';

/** Rascunho de um post (novo ou em edição): texto, imagem já enviada, jogos marcados (na ordem escolhida) e spoiler. */
export interface PostDraft {
  body: string;
  /** Referência da imagem no armazenamento, ou `null` se não há. */
  imageRef: string | null;
  spoiler: boolean;
  games: MarkedGame[];
}

export function usePostDraft(initial: PostDraft, uploadMode: UploadMode, userId: string) {
  const [draft, setDraft] = useState<PostDraft>(initial);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const patch = (changes: Partial<PostDraft>) => setDraft((current) => ({ ...current, ...changes }));

  /** Envia a imagem escolhida e guarda a referência. Confere formato e peso antes (o servidor confere de novo). */
  async function pickImage(file: File) {
    setImageError(null);
    if (uploadMode === 'unavailable') return setImageError(t.imageUnavailable);
    if (!IMAGE_CONTENT_TYPES.includes(file.type)) return setImageError(t.imageType);
    if (file.size > IMAGE_MAX_BYTES.post) return setImageError(t.imageSize);
    setUploading(true);
    try {
      patch({ imageRef: await uploadImage(uploadMode, 'post', file, userId) });
    } catch {
      setImageError(t.imageFailed);
    } finally {
      setUploading(false);
    }
  }

  return {
    draft,
    uploading,
    imageError,
    imageUrl: mediaUrl(draft.imageRef),
    /**
     * Muda o texto. Apagar o "@Nome" de um jogo tira o jogo da lista. Só sai da lista o jogo cuja menção estava no texto
     * antes e sumiu agora: um jogo de um post antigo (que nunca teve "@Nome" no texto) fica até a pessoa removê-lo.
     */
    setBody: (body: string) =>
      setDraft((current) => ({
        ...current,
        body,
        games: current.games.filter((game) => body.includes(mentionToken(game.name)) || !current.body.includes(mentionToken(game.name))),
      })),
    /** Marca o jogo (no fim da lista) e troca o texto de uma vez, para o "@Nome" e a lista andarem juntos. */
    addGame: (game: MarkedGame, body: string) =>
      setDraft((current) => ({
        ...current,
        body,
        games: current.games.some((item) => item.igdbId === game.igdbId) ? current.games : [...current.games, game],
      })),
    removeGame: (igdbId: number) => patch({ games: draft.games.filter((game) => game.igdbId !== igdbId) }),
    setSpoiler: (spoiler: boolean) => patch({ spoiler }),
    removeImage: () => {
      setImageError(null);
      patch({ imageRef: null });
    },
    pickImage,
    reset: (next: PostDraft) => {
      setDraft(next);
      setImageError(null);
    },
  };
}

export type PostDraftApi = ReturnType<typeof usePostDraft>;
