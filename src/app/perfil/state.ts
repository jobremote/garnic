/** Estado que a ação de salvar o perfil devolve ao formulário (useActionState). */
export interface EditProfileState {
  /** Texto devolvido para o formulário não perder o que a pessoa digitou depois de um erro. */
  values: { name: string; username: string; bio: string };
  errors: Partial<Record<'name' | 'username' | 'bio' | 'avatar' | 'cover' | 'form', string>>;
}

export const initialEditProfileState = (values: EditProfileState['values']): EditProfileState => ({ values, errors: {} });
