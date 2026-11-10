/**
 * `/imagen` — genera imágenes con el Alibaba Token Plan (qwen-image-3.0-pro).
 *
 * El modelo no está disponible en /images/generations de ese host (404); se sirve
 * por /chat/completions exigiendo `messages[0].role === "user"` y `content` como
 * lista de partes. De ahí que no funcione como modelo de chat normal en DSH.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, extname } from 'node:path';

export const name = 'qwen-image-command';
export const inject = ['commands'];

const BASE_URL = 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = 'qwen-image-3.0-pro';
const DEFAULT_KEY_ENV = 'QWEN_TOKEN_PLAN_INDIVIDUAL_API_KEY';

/** Divide el input en prompt y flags (`--model`, `--size`, `--out`, `--edit`). */
export function parseInput(rawInput) {
  const tokens = String(rawInput ?? '').trim().split(/\s+/).filter(Boolean);
  const prompt = [];
  const flags = {};
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '--model' || token === '--size' || token === '--out' || token === '--edit') {
      flags[token.slice(2)] = tokens[++i];
    } else {
      prompt.push(token);
    }
  }
  return { prompt: prompt.join(' ').trim(), flags };
}

/** Nombre de archivo legible derivado del prompt. */
export function slugify(prompt, maxLength = 60) {
  const slug = prompt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : 'imagen';
}

async function uniquePath(directory, base, ext) {
  let candidate = join(directory, `${base}${ext}`);
  let n = 2;
  while (existsSync(candidate)) candidate = join(directory, `${base}-${n++}${ext}`);
  return candidate;
}

/** Lee la API key del entorno o del almacén de credenciales de dsh. */
export async function readApiKey(keyEnv) {
  if (process.env[keyEnv]) return process.env[keyEnv];
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh');
  const file = join(dshHome, '.credentials.yaml');
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    throw new Error(`No encontré ${keyEnv} en el entorno ni en ${file}`);
  }
  const refsStart = text.indexOf('\nrefs:');
  const scope = refsStart === -1 ? text : text.slice(refsStart);
  const match = scope.match(new RegExp(`^\\s*${keyEnv}:\\s*(.+)$`, 'm'));
  if (!match) throw new Error(`No encontré ${keyEnv} en ${file}`);
  return match[1].trim().split(/\s+#/)[0].trim().replace(/^["']|["']$/g, '');
}

async function toDataUrl(path) {
  const buffer = await readFile(path);
  const ext = extname(path).toLowerCase().replace('.', '') || 'png';
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  return `data:image/${mime};base64,${buffer.toString('base64')}`;
}

/** Llama al endpoint y devuelve las URLs de las imágenes generadas. */
export async function requestImages({ apiKey, model, prompt, size, image, signal }) {
  const parts = [];
  if (image) parts.push({ type: 'image_url', image_url: { url: await toDataUrl(image) } });
  parts.push({ type: 'text', text: prompt });

  const body = { model, messages: [{ role: 'user', content: parts }], stream: false };
  if (size) body.size = size;

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`);

  const json = JSON.parse(text);
  const content = json?.output?.choices?.[0]?.message?.content;
  const urls = [];
  for (const block of Array.isArray(content) ? content : []) {
    const url = block?.image ?? block?.image_url?.url ?? block?.image_url;
    if (typeof url === 'string') urls.push(url);
  }
  if (urls.length === 0) throw new Error(`La respuesta no contiene imágenes: ${text.slice(0, 400)}`);
  return { urls, usage: json.usage };
}

export function apply(ctx, config = {}) {
  const model = config.model ?? DEFAULT_MODEL;
  const keyEnv = config.apiKeyEnv ?? DEFAULT_KEY_ENV;
  const outputDir = resolve(config.outputDir ?? 'out');

  return ctx.commands.register({
    definitionId: 'qwen-image',
    name: 'imagen',
    description: 'Genera una imagen con qwen-image (Alibaba Token Plan)',
    input: { hint: '<prompt> [--model <id>] [--size <WxH>] [--out <ruta>] [--edit <imagen>]' },
    handler: async (invocation) => {
      const { prompt, flags } = parseInput(invocation.rawInput);
      if (prompt.length === 0) {
        return { kind: 'error', text: 'Uso: /imagen <prompt> [--model <id>] [--size 1024x1024] [--out <ruta>] [--edit <imagen>]' };
      }
      try {
        const apiKey = await readApiKey(keyEnv);
        const result = await requestImages({
          apiKey,
          model: flags.model ?? model,
          prompt,
          size: flags.size,
          image: flags.edit ? resolve(flags.edit) : undefined,
          signal: invocation.signal,
        });

        await mkdir(outputDir, { recursive: true });
        const target = flags.out
          ? resolve(flags.out)
          : await uniquePath(outputDir, slugify(prompt), '.png');

        const image = await fetch(result.urls[0], ...(invocation.signal ? [{ signal: invocation.signal }] : []));
        if (!image.ok) throw new Error(`No pude descargar la imagen: HTTP ${image.status}`);
        await writeFile(target, Buffer.from(await image.arrayBuffer()));

        const size = result.usage?.output_width && result.usage?.output_height
          ? `${result.usage.output_width}x${result.usage.output_height}`
          : 'desconocido';
        return {
          kind: 'success',
          text: `Imagen generada (${size}): ${target}\n![${prompt}](${target})`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { kind: 'error', text: `No pude generar la imagen: ${message}` };
      }
    },
  });
}
