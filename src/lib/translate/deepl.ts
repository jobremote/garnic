/**
 * Tradução para o português com a DeepL (https://developers.deepl.com/docs/api-reference/translate). Só roda no
 * servidor: a chave nunca vai para o navegador.
 *
 * - Chave em `DEEPL_API_KEY`. As do plano Free terminam em ":fx" e usam `api-free.deepl.com`; as pagas, `api.deepl.com`.
 * - `POST /v2/translate` com `Authorization: DeepL-Auth-Key <chave>` e JSON `{ text: [...], target_lang: "PT-BR" }`.
 * - Resposta: `{ translations: [{ detected_source_language, text }] }`, na ordem pedida.
 * - 456 = cota do mês esgotada; 429 = muitos pedidos. Nos dois casos (e em qualquer erro) devolvemos `null` e a página
 *   mostra o original; a próxima visita tenta de novo.
 */

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface TranslatorOptions {
  apiKey: string | null | undefined;
  fetch?: Fetch;
  /** Tempo máximo de espera, para a página não travar se a DeepL demorar. */
  timeoutMs?: number;
}

export const deeplHost = (apiKey: string) => (apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com');

export function createTranslator(options: TranslatorOptions) {
  const doFetch: Fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const apiKey = options.apiKey?.trim() || null;
  return {
    configured: apiKey !== null,
    /** Traduz para o português do Brasil. `null` se não há chave, se o texto é vazio ou se a DeepL falhou. */
    async toPortuguese(text: string): Promise<string | null> {
      if (!apiKey || text.trim() === '') return null;
      try {
        const response = await doFetch(`${deeplHost(apiKey)}/v2/translate`, {
          method: 'POST',
          headers: { Authorization: `DeepL-Auth-Key ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: [text], target_lang: 'PT-BR' }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
        });
        if (!response.ok) {
          console.error(`DeepL respondeu ${response.status}${response.status === 456 ? ' (cota do mês esgotada)' : ''}.`);
          return null;
        }
        const body = (await response.json()) as { translations?: { text?: string }[] };
        const translated = body.translations?.[0]?.text?.trim();
        return translated ? translated : null;
      } catch (error) {
        console.error('DeepL:', error instanceof Error ? error.message : error);
        return null;
      }
    },
  };
}

export type Translator = ReturnType<typeof createTranslator>;

export function getTranslator(): Translator {
  return createTranslator({ apiKey: process.env.DEEPL_API_KEY });
}
