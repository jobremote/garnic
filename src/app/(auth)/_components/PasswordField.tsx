'use client';

import { useState } from 'react';
import { IconButton, TextField, type TextFieldProps } from 'nogasds';

/** Campo de senha com botão de mostrar e ocultar (Campo de texto com ícone trailing do NogasDS). */
export function PasswordField(props: Omit<TextFieldProps, 'type' | 'trailingIcon'>) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      trailingIcon={
        <IconButton
          size="sm"
          icon={visible ? 'visibility-off' : 'visibility'}
          label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        />
      }
    />
  );
}
