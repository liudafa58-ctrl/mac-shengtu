import "dotenv/config";

import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXED_BASE_URL = "https://api.wenrugouai.cn/";
const FIXED_MODEL = "gpt-image-2";
const PORT = Number(process.env.PORT || 8787);
const MAX_UPLOAD_MB = 25;

type UnknownRecord = Record<string, unknown>;

type NormalizedImage = {
  b64Json?: string;
  url?: string;
  revisedPrompt?: string;
};

type UpstreamRequest = {
  model: string;
  prompt: string;
  size?: string;
  quality?: string;
  background?: string;
  output_format?: string;
  output_compression?: number;
  n?: number;
};

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 8,
    fileSize: MAX_UPLOAD_MB * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      callback(new Error("只能上传图片文件"));
      return;
    }
    callback(null, true);
  }
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.get("/api/config", (_req, res) => {
  res.json({
    defaultBaseUrl: normalizeBaseUrl(FIXED_BASE_URL),
    defaultModel: FIXED_MODEL,
    hasServerBaseUrl: true,
    hasServerKey: Boolean(process.env.IMAGE_API_KEY)
  });
});

app.post("/api/images", upload.array("images", 8), async (req, res) => {
  try {
    const files = (req.files || []) as Express.Multer.File[];
    const fields = (req.body || {}) as UnknownRecord;
    const prompt = readField(fields.prompt);

    if (!prompt) {
      res.status(400).json({ message: "请填写提示词" });
      return;
    }

    const credentials = readCredentials(fields);
    const endpoint = files.length > 0 ? "/images/edits" : "/images/generations";
    const payload = buildPayload(fields, prompt);
    const upstreamUrl = `${credentials.baseUrl}${endpoint}`;

    const upstreamResponse =
      files.length > 0
        ? await forwardEditRequest(upstreamUrl, credentials.apiKey, payload, files, fields)
        : await forwardGenerationRequest(upstreamUrl, credentials.apiKey, payload);

    const text = await upstreamResponse.text();
    const data = parseJsonSafely(text);

    if (!upstreamResponse.ok) {
      res.status(upstreamResponse.status).json({
        message: extractErrorMessage(data) || text || "上游图片接口请求失败",
        upstreamStatus: upstreamResponse.status,
        upstream: data || text
      });
      return;
    }

    res.json({
      mode: files.length > 0 ? "image-to-image" : "text-to-image",
      images: normalizeImageResponse(data),
      raw: data
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器处理失败";
    res.status(500).json({ message });
  }
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../dist");

app.use(express.static(clientDist));
app.use((_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Image studio API listening on http://127.0.0.1:${PORT}`);
});

function readCredentials(fields: UnknownRecord) {
  const baseUrl = normalizeBaseUrl(FIXED_BASE_URL);
  const apiKey = process.env.IMAGE_API_KEY || readField(fields.apiKey);

  if (!apiKey) {
    throw new Error("缺少 API Key：请在界面填写，或在 .env 中配置 IMAGE_API_KEY");
  }

  return { baseUrl, apiKey };
}

function buildPayload(fields: UnknownRecord, prompt: string): UpstreamRequest {
  const outputFormat = readField(fields.outputFormat) || "png";
  const outputCompression = Number(readField(fields.outputCompression) || 80);
  const n = clampInt(Number(readField(fields.n) || 1), 1, 4);

  const payload: UpstreamRequest = {
    model: FIXED_MODEL,
    prompt,
    size: readField(fields.size) || "1024x1024",
    quality: readField(fields.quality) || "auto",
    background: readField(fields.background) || "auto",
    output_format: outputFormat,
    n
  };

  if ((outputFormat === "jpeg" || outputFormat === "webp") && Number.isFinite(outputCompression)) {
    payload.output_compression = clampInt(outputCompression, 0, 100);
  }

  return dropEmptyValues(payload);
}

async function forwardGenerationRequest(url: string, apiKey: string, payload: UpstreamRequest) {
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

async function forwardEditRequest(
  url: string,
  apiKey: string,
  payload: UpstreamRequest,
  files: Express.Multer.File[],
  fields: UnknownRecord
) {
  const form = new FormData();
  const imageFieldName = readField(fields.imageFieldName) || process.env.IMAGE_EDIT_IMAGE_FIELD || "image[]";

  Object.entries(payload).forEach(([key, value]) => {
    form.append(key, String(value));
  });

  files.forEach((file) => {
    const blob = new Blob([new Uint8Array(file.buffer)], {
      type: file.mimetype || "application/octet-stream"
    });
    form.append(imageFieldName, blob, file.originalname || "reference.png");
  });

  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });
}

function normalizeBaseUrl(value: string) {
  let next = value.trim();
  if (!next) {
    next = FIXED_BASE_URL;
  }

  if (!/^https?:\/\//i.test(next)) {
    next = `https://${next}`;
  }

  next = next.replace(/\/+$/, "");
  if (!/\/v\d+$/i.test(next)) {
    next = `${next}/v1`;
  }

  return next;
}

function normalizeImageResponse(data: unknown): NormalizedImage[] {
  if (!data || typeof data !== "object") {
    return [];
  }

  const record = data as UnknownRecord;
  const dataItems = Array.isArray(record.data) ? record.data : [];

  return dataItems
    .filter((item): item is UnknownRecord => Boolean(item) && typeof item === "object")
    .map((item) => ({
      b64Json: readField(item.b64_json),
      url: readField(item.url),
      revisedPrompt: readField(item.revised_prompt)
    }))
    .filter((item) => item.b64Json || item.url);
}

function parseJsonSafely(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function extractErrorMessage(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "";
  }

  const record = data as UnknownRecord;
  const error = record.error;
  if (typeof error === "object" && error !== null) {
    return readField((error as UnknownRecord).message);
  }

  return readField(record.message);
}

function readField(value: unknown): string {
  if (Array.isArray(value)) {
    return readField(value[0]);
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(Math.round(value), min), max);
}

function dropEmptyValues<T extends Record<string, unknown>>(record: T) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== "" && value !== undefined && value !== null)
  ) as T;
}
