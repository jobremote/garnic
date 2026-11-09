/**
 * Senhas muito comuns, em minúsculas. Entram aqui também as que passariam nas regras de composição
 * (maiúscula, minúscula, número e especial), como "Senha@123", porque são as mais testadas em ataques.
 * Lista inicial e curta; vale trocar por uma lista maior antes do lançamento.
 */
export const commonPasswords: ReadonlySet<string> = new Set([
  '12345678', '123456789', '1234567890', '123123123', '11111111', '00000000', '87654321', '12341234', '147258369',
  'password', 'password1', 'password12', 'password123', 'password1!', 'password@1', 'password@123', 'password!1',
  'passw0rd', 'p@ssw0rd', 'p@ssword', 'p@ssw0rd1', 'p@ssw0rd!', 'pa$$w0rd', 'pa$$word', 'passw0rd!',
  'senha123', 'senha1234', 'senha@123', 'senha@1234', 'senha#123', 'senha!123', 'senha123!', 'senha@2024', 'senha@2025',
  'minhasenha', 'minhasenha1', 'minhasenha123', 'minhasenha@123', 'mudar123', 'mudar@123', 'mudar@123!',
  'qwerty', 'qwerty123', 'qwerty1234', 'qwerty@123', 'qwerty123!', 'qwertyuiop', 'qwerty12', 'qwer1234', 'qwer@1234',
  'asdfghjkl', 'asdf1234', 'asdf@1234', 'zxcvbnm', 'zxcvbnm123', '1q2w3e4r', '1q2w3e4r5t', '1q2w3e4r!', '1qaz2wsx',
  'abc12345', 'abc123456', 'abc@1234', 'abcd1234', 'abcd@1234', 'abcd1234!', 'abc123!@#', 'abc@123456',
  'admin123', 'admin@123', 'admin1234', 'admin@1234', 'administrador', 'administrator', 'admin@2024', 'root1234',
  'welcome1', 'welcome123', 'welcome@123', 'welcome1!', 'letmein123', 'letmein@123', 'iloveyou', 'iloveyou1', 'iloveyou123',
  'brasil123', 'brasil@123', 'brasil2024', 'brasil@2024', 'brasil@2025', 'brasileiro', 'flamengo', 'flamengo123', 'corinthians',
  'corinthians1', 'palmeiras', 'palmeiras1', 'saopaulo', 'santos123', 'gremio123', 'internacional',
  'gamer123', 'gamer@123', 'gamer1234', 'gamer@1234', 'garnic123', 'garnic@123', 'garnic1234', 'garnic@1234', 'garnic2024',
  'jogos123', 'jogos@123', 'games123', 'games@123', 'playstation', 'playstation1', 'xbox1234', 'nintendo1', 'minecraft',
  'minecraft1', 'minecraft123', 'fortnite1', 'fortnite123', 'roblox123', 'pokemon123', 'pokemon1', 'zelda1234',
  'teste123', 'teste@123', 'teste1234', 'teste@1234', 'usuario123', 'usuario@123', 'user1234', 'user@1234',
  'changeme', 'changeme1', 'changeme123', 'change@123', 'trocar123', 'trocar@123',
  'a1b2c3d4', 'a1b2c3d4!', 'q1w2e3r4', 'q1w2e3r4!', 'q1w2e3r4t5', 'pass1234', 'pass@1234', 'pass1234!', 'test1234', 'test@1234',
  'football1', 'baseball1', 'superman1', 'batman123', 'starwars1', 'dragon123', 'monkey123', 'shadow123', 'master123', 'sunshine1',
  'princess1', 'princesa1', 'amor1234', 'te@mo1234', 'meuamor1', 'jesus1234', 'deus1234', 'deusefiel', 'felipe123', 'gabriel123',
]);
