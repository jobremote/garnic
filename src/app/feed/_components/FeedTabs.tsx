'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Tabs } from 'nogasds';
import { feedMessages as t } from '@/lib/feed/messages';

export type FeedTab = 'seguindo' | 'meus-jogos';

/** Abas do feed (Figma: Barra de abas). A aba escolhida vai para o endereço (`/?aba=meus-jogos`). */
export function FeedTabs({ value }: { value: FeedTab }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (
    <Tabs
      label={t.tabsLabel}
      value={value}
      onChange={(next) => startTransition(() => router.replace(next === 'meus-jogos' ? '/?aba=meus-jogos' : '/'))}
      items={[
        { value: 'seguindo', label: t.tabFollowing, controls: 'feed-panel' },
        { value: 'meus-jogos', label: t.tabMyGames, controls: 'feed-panel' },
      ]}
    />
  );
}
