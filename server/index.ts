import "dotenv/config";

import express from "express";
import multer from "multer";
import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL = process.env.IMAGE_API_BASE_URL || "https://api.wenrugouai.cn/";
const DEFAULT_MODEL = "gpt-image-2";
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

type MultipartBody = {
  body: Buffer;
  contentType: string;
};

type ImageRequestResult = {
  images: NormalizedImage[];
  raw: unknown[];
};

class UpstreamHttpError extends Error {
  status: number;
  upstream: unknown;

  constructor(message: string, status: number, upstream: unknown) {
    super(message);
    this.status = status;
    this.upstream = upstream;
  }
}

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
    defaultBaseUrl: normalizeBaseUrl(DEFAULT_BASE_URL),
    defaultModel: DEFAULT_MODEL,
    hasServerBaseUrl: false,
    hasServerKey: Boolean(process.env.IMAGE_API_KEY)
  });
});

app.post("/api/models", async (req, res) => {
  try {
    const fields = (req.body || {}) as UnknownRecord;
    const credentials = readCredentials(fields);
    const response = await fetch(`${credentials.baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`
      }
    });
    const text = await response.text();
    const data = parseJsonSafely(text);
    const raw = data ?? text;

    if (!response.ok) {
      throw new UpstreamHttpError(
        extractErrorMessage(data) || text || "获取模型失败",
        response.status,
        raw
      );
    }

    const models = normalizeModelResponse(data);
    if (models.length === 0) {
      res.status(502).json({ message: "接口未返回可用模型" });
      return;
    }

    res.json({ models });
  } catch (error) {
    if (error instanceof UpstreamHttpError) {
      res.status(error.status).json({
        message: error.message,
        upstreamStatus: error.status,
        upstream: error.upstream
      });
      return;
    }

    const message = error instanceof Error ? error.message : "获取模型失败";
    res.status(500).json({ message });
  }
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
    const requestedCount = clampInt(Number(payload.n || 1), 1, 4);

    const result = await requestImagesWithCount(
      upstreamUrl,
      credentials.apiKey,
      payload,
      requestedCount,
      files,
      fields
    );

    res.json({
      mode: files.length > 0 ? "image-to-image" : "text-to-image",
      images: result.images,
      raw: result.raw
    });
  } catch (error) {
    if (error instanceof UpstreamHttpError) {
      res.status(error.status).json({
        message: error.message,
        upstreamStatus: error.status,
        upstream: error.upstream
      });
      return;
    }

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
  const baseUrl = normalizeBaseUrl(readField(fields.baseUrl) || process.env.IMAGE_API_BASE_URL || DEFAULT_BASE_URL);
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
    model: readField(fields.model) || DEFAULT_MODEL,
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

async function requestImagesWithCount(
  url: string,
  apiKey: string,
  payload: UpstreamRequest,
  requestedCount: number,
  files: Express.Multer.File[],
  fields: UnknownRecord
): Promise<ImageRequestResult> {
  const images: NormalizedImage[] = [];
  const raw: unknown[] = [];
  const maxAttempts = requestedCount + 2;
  let attempts = 0;
  let emptyResponses = 0;

  while (images.length < requestedCount && attempts < maxAttempts) {
    attempts += 1;
    const singlePayload: UpstreamRequest = { ...payload, n: 1 };
    const result = await requestOneImageBatch(url, apiKey, singlePayload, files, fields);

    raw.push(result.raw);

    if (result.images.length === 0) {
      emptyResponses += 1;
      if (emptyResponses >= 2) {
        break;
      }
      continue;
    }

    emptyResponses = 0;
    images.push(...result.images);
  }

  if (images.length < requestedCount) {
    throw new Error(`图片接口只返回 ${images.length} 张，未达到本次要求的 ${requestedCount} 张，请稍后重试`);
  }

  return {
    images: images.slice(0, requestedCount),
    raw
  };
}

async function requestOneImageBatch(
  url: string,
  apiKey: string,
  payload: UpstreamRequest,
  files: Express.Multer.File[],
  fields: UnknownRecord
) {
  const response =
    files.length > 0
      ? await forwardEditRequest(url, apiKey, payload, files, fields)
      : await forwardGenerationRequest(url, apiKey, payload);

  const text = await response.text();
  const data = parseJsonSafely(text);
  const raw = data ?? text;

  if (!response.ok) {
    throw new UpstreamHttpError(
      extractErrorMessage(data) || text || "上游图片接口请求失败",
      response.status,
      raw
    );
  }

  return {
    images: normalizeImageResponse(data),
    raw
  };
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
  const preferredImageFieldName = readField(fields.imageFieldName) || process.env.IMAGE_EDIT_IMAGE_FIELD || "image";
  const imageFieldNames = uniqueValues([preferredImageFieldName, "image", "image[]"]);
  let lastResponse: Response | null = null;
  let lastError: Error | null = null;

  for (const imageFieldName of imageFieldNames) {
    try {
      const response = await sendEditRequest(url, apiKey, payload, files, imageFieldName);

      if (response.ok || !shouldRetryEditRequest(response.status)) {
        return response;
      }

      lastResponse = response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw new Error(`图生图请求失败：无法连接中转站${lastError?.message ? `（${lastError.message}）` : ""}`);
}

async function sendEditRequest(
  url: string,
  apiKey: string,
  payload: UpstreamRequest,
  files: Express.Multer.File[],
  imageFieldName: string
) {
  const multipart = buildMultipartBody(payload, files, imageFieldName);
  let fetchError: Error | null = null;

  try {
    return await sendMultipartWithFetch(url, apiKey, multipart);
  } catch (error) {
    fetchError = normalizeError(error);
  }

  try {
    return await sendMultipartWithNodeRequest(url, apiKey, multipart);
  } catch (error) {
    const nodeRequestError = normalizeError(error);
    throw new Error(
      `fetch failed: ${describeError(fetchError)}; node https failed: ${describeError(nodeRequestError)}`
    );
  }
}

function sendMultipartWithFetch(url: string, apiKey: string, multipart: MultipartBody) {
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": multipart.contentType,
      "Content-Length": String(multipart.body.length)
    },
    body: new Uint8Array(multipart.body)
  });
}

function sendMultipartWithNodeRequest(url: string, apiKey: string, multipart: MultipartBody) {
  return new Promise<Response>((resolve, reject) => {
    const endpoint = new URL(url);
    const client = endpoint.protocol === "http:" ? requestHttp : requestHttps;
    const request = client(
      endpoint,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": multipart.contentType,
          "Content-Length": String(multipart.body.length)
        },
        timeout: 180000
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on("end", () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode || 500,
              headers: response.headers as HeadersInit
            })
          );
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("request timeout"));
    });
    request.on("error", reject);
    request.end(multipart.body);
  });
}

function buildMultipartBody(payload: UpstreamRequest, files: Express.Multer.File[], imageFieldName: string): MultipartBody {
  const boundary = `----wenrugou-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];

  Object.entries(payload).forEach(([key, value]) => {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${escapeMultipartHeader(key)}"\r\n\r\n` +
          `${String(value)}\r\n`,
        "utf8"
      )
    );
  });

  files.forEach((file, index) => {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${escapeMultipartHeader(imageFieldName)}"; filename="${safeImageFilename(
            file,
            index
          )}"\r\n` +
          `Content-Type: ${file.mimetype || "application/octet-stream"}\r\n\r\n`,
        "utf8"
      )
    );
    chunks.push(file.buffer);
    chunks.push(Buffer.from("\r\n", "utf8"));
  });

  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

function escapeMultipartHeader(value: string) {
  return value.replace(/[\r\n"]/g, "_");
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function describeError(error: Error | null) {
  if (!error) {
    return "unknown";
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error && cause.message) {
    return `${error.message} (${cause.message})`;
  }

  return error.message;
}

function shouldRetryEditRequest(status: number) {
  return status === 400 || status === 404 || status === 415 || status === 422;
}

function safeImageFilename(file: Express.Multer.File, index: number) {
  const extensionByMime: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp"
  };
  const extension = extensionByMime[file.mimetype] || "png";
  return `reference-${index + 1}.${extension}`;
}

function uniqueValues(values: string[]) {
  return values.filter((value, index, array) => value && array.indexOf(value) === index);
}

function normalizeBaseUrl(value: string) {
  let next = value.trim();
  if (!next) {
    next = DEFAULT_BASE_URL;
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

function normalizeModelResponse(data: unknown): string[] {
  if (!data) {
    return [];
  }

  const record = typeof data === "object" && !Array.isArray(data) ? (data as UnknownRecord) : null;
  const candidates = Array.isArray(data)
    ? data
    : Array.isArray(record?.data)
      ? record.data
      : Array.isArray(record?.models)
        ? record.models
        : [];

  return candidates
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }
      if (!item || typeof item !== "object") {
        return "";
      }

      const model = item as UnknownRecord;
      return readField(model.id) || readField(model.model) || readField(model.name);
    })
    .filter((model, index, models) => Boolean(model) && models.indexOf(model) === index)
    .sort((left, right) => left.localeCompare(right));
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
