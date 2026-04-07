import { getToken } from "./token.mjs";

export const COPILOT_API = "https://api.enterprise.githubcopilot.com/embeddings";
export const COPILOT_MODEL = "text-embedding-3-small";
export const DIMENSIONS = 1536;
export const BATCH_SIZE = 25;
export const DELAY_MS = 300;
export const MAX_RETRIES = 3;

const CHUNK_MAX_CHARS = 3600;
const CHUNK_OVERLAP_CHARS = 540;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractTitle(filePath) {
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1]?.replace(/\.\w+$/, "") || "untitled";
}

function buildHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Copilot-Integration-Id": "copilot-developer-cli",
  };
}

export function chunkDocument(text) {
  if (text.length <= CHUNK_MAX_CHARS) {
    return [{ text, pos: 0 }];
  }

  const chunks = [];
  let pos = 0;

  while (pos < text.length) {
    let end = Math.min(pos + CHUNK_MAX_CHARS, text.length);

    if (end < text.length) {
      const slice = text.slice(pos, end);
      const headingMatch = slice.lastIndexOf("\n#");
      if (headingMatch > CHUNK_MAX_CHARS * 0.4) {
        end = pos + headingMatch + 1;
      } else {
        const paraBreak = slice.lastIndexOf("\n\n");
        if (paraBreak > CHUNK_MAX_CHARS * 0.4) {
          end = pos + paraBreak + 2;
        } else {
          const newline = slice.lastIndexOf("\n");
          if (newline > CHUNK_MAX_CHARS * 0.4) {
            end = pos + newline + 1;
          }
        }
      }
    }

    chunks.push({ text: text.slice(pos, end).trim(), pos });
    if (end >= text.length) {
      break;
    }

    pos = Math.max(pos + 1, end - CHUNK_OVERLAP_CHARS);
  }

  return chunks.filter((chunk) => chunk.text.length > 0);
}

export async function embedQuery(text) {
  const token = getToken();
  const response = await fetch(COPILOT_API, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify({
      model: COPILOT_MODEL,
      input: [text],
      dimensions: DIMENSIONS,
    }),
  });

  if (!response.ok) {
    throw new Error(`Copilot embeddings API ${response.status}: ${await response.text()}`);
  }

  const { data } = await response.json();
  return data[0].embedding;
}

export async function embedBatch(texts, token) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const response = await fetch(COPILOT_API, {
      method: "POST",
      headers: buildHeaders(token),
      body: JSON.stringify({
        model: COPILOT_MODEL,
        input: texts,
        dimensions: DIMENSIONS,
      }),
    });

    if (response.status === 429) {
      await sleep((2 ** attempt) * 1000);
      continue;
    }

    if (!response.ok) {
      throw new Error(`Copilot embeddings API ${response.status}: ${await response.text()}`);
    }

    const { data } = await response.json();
    return data.map((item) => item.embedding);
  }

  throw new Error(`Copilot embeddings API failed after ${MAX_RETRIES} retries.`);
}

export async function embedPendingDocuments(store, options = {}) {
  const force = Boolean(options.force);
  if (force) {
    store.internal.clearAllEmbeddings();
  }

  store.internal.ensureVecTable(DIMENSIONS);

  const pending = store.internal.getHashesForEmbedding();
  if (pending.length === 0) {
    return {
      force,
      documents: 0,
      chunks: 0,
      elapsedSeconds: 0,
    };
  }

  const allChunks = [];
  for (const doc of pending) {
    const title = extractTitle(doc.path);
    const chunks = chunkDocument(doc.body);

    for (let index = 0; index < chunks.length; index += 1) {
      allChunks.push({
        hash: doc.hash,
        seq: index,
        pos: chunks[index].pos,
        text: `${title} | ${chunks[index].text}`,
      });
    }
  }

  const token = getToken();
  const startedAt = Date.now();
  let embedded = 0;

  for (let offset = 0; offset < allChunks.length; offset += BATCH_SIZE) {
    const batch = allChunks.slice(offset, offset + BATCH_SIZE);
    const embeddings = await embedBatch(
      batch.map((chunk) => chunk.text),
      token,
    );

    for (let index = 0; index < batch.length; index += 1) {
      store.internal.insertEmbedding(
        batch[index].hash,
        batch[index].seq,
        batch[index].pos,
        new Float32Array(embeddings[index]),
        COPILOT_MODEL,
        new Date().toISOString(),
      );
    }

    embedded += batch.length;
    if (offset + BATCH_SIZE < allChunks.length) {
      await sleep(DELAY_MS);
    }
  }

  return {
    force,
    documents: pending.length,
    chunks: embedded,
    elapsedSeconds: (Date.now() - startedAt) / 1000,
  };
}
