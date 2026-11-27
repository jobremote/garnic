'use client';

import { useActionState } from 'react';
import { Button, DateField } from 'nogasds';
import { messages } from '@/lib/auth/messages';
import { saveBirthDateAction, type BirthDateState } from '../actions';
import styles from '../auth.module.css';
import { AuthHeader } from './auth-parts';

const initial: BirthDateState = { birthDate: '' };

/** "Falta um dado": a data de nascimento das contas antigas (Figma: Login e cadastro, seção 7). */
export function BirthDateForm() {
  const [state, formAction, pending] = useActionState(saveBirthDateAction, initial);
  return (
    <form action={formAction} noValidate className={styles.form} aria-busy={pending}>
      <AuthHeader
        title="Falta um dado"
        description="Para continuar no Garnic, informe sua data de nascimento. A lei pede que a gente confirme que você tem 16 anos ou mais."
      />
      <DateField
        name="birthDate"
        label="Data de nascimento"
        autoComplete="bday"
        helpText={messages.signup.birthDateHint}
        error={state.error}
      />
      <Button type="submit" disabled={pending}>
        Continuar
      </Button>
    </form>
  );
}
