'use client';

import { useState } from 'react';
import { Button } from 'nogasds';
import { feedMessages as t } from '@/lib/feed/messages';
import { ReportDialog } from './ReportDialog';

/** "Denunciar" no perfil de outra pessoa: abre a denúncia do usuário (inclui foto e capa). */
export function ReportUserButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        {t.report}
      </Button>
      {open ? <ReportDialog kind="user" id={userId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
