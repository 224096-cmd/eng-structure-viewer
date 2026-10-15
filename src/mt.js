// mt.js — ブラウザ内ニューラル翻訳（任意機能）
// モデル: FuguMT en→ja（staka/fugumt-en-ja、CC BY-SA 4.0）の ONNX 版（Kadonox/fugumt-en-ja-onnx）
// 実行: Transformers.js（CDN から読み込み）＋ ONNX Runtime Web（WebAssembly）。サーバ・API キー不要。
// モデル（量子化 q8、約 145 MB）は初回に Hugging Face から取得し、ブラウザのキャッシュに保存される（2 回目以降はオフラインでも動く）。
// GitHub Pages には置かない（1 ファイル 100 MB 制限のため）。

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
const MODEL_ID = 'Kadonox/fugumt-en-ja-onnx';
export const MODEL_INFO = { id: MODEL_ID, name: 'FuguMT en→ja (ONNX, q8)', license: 'CC BY-SA 4.0', sizeMB: 145, source: 'https://huggingface.co/' + MODEL_ID };

let translator = null, loading = null;
const cache = new Map();

export function isReady() { return !!translator; }

// onProgress({ status, file, progress, loaded, total })
export async function loadModel(onProgress) {
  if (translator) return translator;
  if (loading) return loading;
  loading = (async () => {
    const mod = await import(TRANSFORMERS_URL);
    const { pipeline, env } = mod;
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    translator = await pipeline('translation', MODEL_ID, {
      dtype: 'q8',
      progress_callback: p => { if (onProgress) onProgress(p); }
    });
    return translator;
  })();
  try { return await loading; } finally { loading = null; }
}

export async function translate(text) {
  if (!translator) throw new Error('model not loaded');
  const key = text.trim();
  if (cache.has(key)) return cache.get(key);
  const t0 = performance.now();
  const out = await translator(key, { max_new_tokens: 160 });
  const res = { ja: (out[0] && out[0].translation_text || '').trim(), ms: Math.round(performance.now() - t0) };
  cache.set(key, res);
  return res;
}
