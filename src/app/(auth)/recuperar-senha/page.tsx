import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DevMailboxHint } from '../_components/DevMailboxHint';
import { RequestResetForm } from '../_components/RequestResetForm';

export const metadata: Metadata = { title: 'Recuperar senha' };

export default function RecoverPasswordPage() {
  return (
    <>
      <RequestResetForm />
      <Suspense fallback={null}>
        <DevMailboxHint what="o link" />
      </Suspense>
    </>
  );
}
