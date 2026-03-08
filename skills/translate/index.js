/**
 * Translate Skill
 * MyMemory (free, no key) or DeepL (better quality).
 */
import axios from 'axios';

const LANG_MAP = {
  english: 'en', french: 'fr', spanish: 'es', german: 'de', italian: 'it',
  portuguese: 'pt', dutch: 'nl', russian: 'ru', japanese: 'ja', chinese: 'zh',
  korean: 'ko', arabic: 'ar', hindi: 'hi', turkish: 'tr', polish: 'pl',
  swedish: 'sv', norwegian: 'no', danish: 'da', finnish: 'fi', greek: 'el',
};

function resolveCode(lang) {
  if (!lang) return 'en';
  const lower = lang.toLowerCase();
  return LANG_MAP[lower] || lower.slice(0, 2);
}

export default async function execute({ text, target, source = 'auto' }, context = {}) {
  const deeplKey = process.env.DEEPL_API_KEY || context.config?.skills?.deeplApiKey;
  const targetCode = resolveCode(target);

  if (deeplKey) return deepl(text, targetCode, source === 'auto' ? null : resolveCode(source), deeplKey);
  return myMemory(text, targetCode, source === 'auto' ? null : resolveCode(source));
}

async function myMemory(text, target, source) {
  const langpair = `${source || 'autodetect'}|${target}`;
  const res = await axios.get('https://api.mymemory.translated.net/get', {
    params: { q: text.substring(0, 500), langpair },
    timeout: 8000,
  });
  const match = res.data.responseData;
  if (!match?.translatedText) throw new Error('Translation failed');
  return `Translated (→ ${target.toUpperCase()}):\n\n${match.translatedText}`;
}

async function deepl(text, target, source, apiKey) {
  const isFree = apiKey.endsWith(':fx');
  const baseUrl = isFree ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
  const res = await axios.post(`${baseUrl}/v2/translate`, null, {
    params: {
      auth_key: apiKey,
      text,
      target_lang: target.toUpperCase(),
      ...(source && { source_lang: source.toUpperCase() }),
    },
    timeout: 8000,
  });
  const result = res.data.translations?.[0];
  if (!result) throw new Error('DeepL translation failed');
  return `Translated (${result.detected_source_language} → ${target.toUpperCase()}):\n\n${result.text}`;
}
