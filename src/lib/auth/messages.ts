/**
 * Textos de cadastro, validação e login. Vêm do protótipo do Figma ("Login e cadastro");
 * os marcados como "novo" não existiam no protótipo e precisam de revisão.
 * O registro completo está em `04_conteudo/microcopy/login-e-cadastro.md`.
 */
export const messages = {
  signup: {
    nameRequired: 'Informe seu nome completo.', // novo
    nameNames: 'Informe nome e sobrenome.', // novo
    nameShort: 'Cada nome precisa de pelo menos 2 letras.', // novo
    nameChars: 'Use só letras, espaço, hífen e apóstrofo.', // novo
    nameLong: 'Use no máximo 100 caracteres.', // novo
    usernameRequired: 'Escolha um @usuário.', // novo
    usernameFormat: 'Use só letras minúsculas, números, ponto e underline.',
    usernameLength: 'Use de 3 a 20 caracteres.', // novo
    usernameReserved: 'Esse @usuário não está disponível.', // novo
    usernameTaken: 'Esse @usuário já está em uso. Tente outro.',
    usernameHint: '3 a 20 caracteres: letras minúsculas, números, ponto e underline.',
    emailRequired: 'Informe seu e-mail.', // novo
    emailInvalid: 'Digite um e-mail válido.',
    emailTaken: 'Esse e-mail já tem uma conta. Entre ou recupere a senha.',
    passwordRequired: 'Crie uma senha.', // novo
    passwordWeak: 'A senha precisa de 8 caracteres, com maiúscula, minúscula, número e caractere especial.',
    passwordCommon: 'Essa senha é muito comum. Escolha outra.', // novo
    passwordSameAsIdentity: 'A senha não pode ser igual ao @usuário nem ao e-mail.', // novo
    passwordHint: 'Mínimo de 8 caracteres, com maiúscula, minúscula, número e caractere especial.',
    confirmMismatch: 'As senhas não são iguais.',
    termsRequired: 'Aceite os termos para continuar.',
  },
  login: {
    badCredentialsTitle: 'E-mail ou senha incorretos',
    badCredentialsText: 'Confira os dados e tente de novo.',
    emailRequired: 'Informe seu e-mail.', // novo
    passwordRequired: 'Informe sua senha.', // novo
  },
  verify: {
    wrongCode: (remaining: number) =>
      `Código incorreto. Você ainda tem ${remaining} ${remaining === 1 ? 'tentativa' : 'tentativas'}.`,
    incomplete: 'Digite os 6 dígitos do código.', // novo
    expired: 'Esse código expirou. Peça um novo para continuar.',
    invalidatedTitle: 'Código invalidado',
    invalidatedText: 'Você errou o código 5 vezes. Peça um novo código para continuar.',
    limitTitle: 'Limite de reenvios atingido',
    limitText: 'Você pode pedir até 5 códigos por hora. Tente de novo mais tarde.',
    sentTitle: 'Enviamos um novo código', // novo
    sentText: 'Confira seu e-mail. O código anterior não vale mais.', // novo
  },
} as const;
