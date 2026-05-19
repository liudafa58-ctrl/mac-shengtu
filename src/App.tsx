import {
  ArrowDownToLine,
  Brush,
  CheckCircle2,
  Copy,
  ExternalLink,
  ImagePlus,
  KeyRound,
  Languages,
  Layers,
  Loader2,
  Moon,
  Palette,
  RotateCcw,
  Settings2,
  Sparkles,
  Sun,
  Upload,
  X
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Mode = "text" | "image";
type Language = "zh" | "en";
type Theme = "light" | "dark";
type Clarity = "original" | "2k" | "4k";
type StatusKind =
  | "ready"
  | "serviceDisconnected"
  | "processingRefs"
  | "generatingImage"
  | "enhancingImage"
  | "completed"
  | "emptyResponse"
  | "generateFailed"
  | "promptCopied";

type StatusState = {
  kind: StatusKind;
  count?: number;
};

type OutputImage = {
  id: string;
  src: string;
  clarity: Clarity;
  revisedPrompt?: string;
};

type ApiImageItem = {
  b64Json?: string;
  url?: string;
  revisedPrompt?: string;
};

type ApiImagesResponse = {
  images?: ApiImageItem[];
  raw?: unknown;
};

type ServerConfig = {
  defaultBaseUrl: string;
  defaultModel: string;
  hasServerBaseUrl: boolean;
  hasServerKey: boolean;
};

type StoredSettings = {
  baseUrl: string;
  model: string;
  size: string;
  clarity: Clarity;
  quality: string;
  background: string;
  outputFormat: string;
  outputCompression: number;
  n: number;
  imageFieldName: string;
  rememberKey: boolean;
  apiKey?: string;
};

const SETTINGS_KEY = "gpt-image-studio-settings";
const LANGUAGE_KEY = "gpt-image-studio-language";
const THEME_KEY = "gpt-image-studio-theme";

const mimeByFormat: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp"
};

const FIXED_BASE_URL = "https://api.wenrugouai.cn/v1";
const FIXED_MODEL = "gpt-image-2";
const IS_NATIVE_APP = Capacitor.isNativePlatform();

const translations = {
  zh: {
    appTitle: "稳如狗生图工作台V1.0",
    settingsAria: "生成设置",
    apiSection: "接口",
    relayBaseUrl: "中转站 Base URL",
    apiKey: "API Key",
    serverKey: "（已读服务端）",
    serverKeyPlaceholder: "服务端 .env 已配置",
    rememberKey: "本机记住密钥",
    params: "参数",
    model: "模型",
    size: "尺寸",
    clarity: "清晰度",
    quality: "质量",
    background: "背景",
    format: "格式",
    count: "数量",
    compression: "压缩",
    editImageField: "图生图字段",
    modeAria: "生成模式",
    textToImage: "文生图",
    imageToImage: "图生图",
    languageSwitch: "语言切换",
    darkBackground: "暗色背景",
    lightBackground: "白色背景",
    clear: "清空",
    generate: "生成",
    prompt: "提示词",
    promptSubImage: "基于参考图重绘或改图",
    promptSubText: "从文字描述生成新图",
    presetsAria: "提示词预设",
    promptPlaceholder: "例如：把参考图里的产品放进清晨厨房场景，保留外观和颜色，增加自然窗光、真实阴影、浅景深。",
    uploadRef: "上传参考图",
    refPreviewAria: "参考图预览",
    removeRef: "移除参考图",
    results: "生成结果",
    progressLabel: "生成进度",
    progressIdle: "准备生成",
    progressComplete: "生成完成",
    waiting: "等待生成",
    generatingShort: "生成中",
    download: "下载",
    copyRevised: "复制修订提示词",
    previewImage: "预览图片",
    closePreview: "关闭预览",
    backToOfficial: "返回官网",
    status: {
      ready: "链接成功",
      serviceDisconnected: "接口服务未连接",
      processingRefs: "正在处理参考图",
      generatingImage: "正在生成图片",
      enhancingImage: "正在优化清晰度",
      emptyResponse: "接口返回为空",
      generateFailed: "生成失败",
      promptCopied: "提示词已复制",
      completed: (count: number) => `完成 ${count} 张`
    },
    optionLabels: {
      auto: "自动",
      high: "高",
      medium: "中",
      low: "低",
      opaque: "不透明",
      transparent: "透明"
    },
    clarityLabels: {
      original: "原图",
      "2k": "2K 高清",
      "4k": "4K 超清"
    },
    refAlt: (index: number) => `参考图 ${index + 1}`,
    outputAlt: (index: number) => `生成图 ${index + 1}`
  },
  en: {
    appTitle: "Wenrugou Image Studio V1.0",
    settingsAria: "Generation settings",
    apiSection: "API",
    relayBaseUrl: "Relay Base URL",
    apiKey: "API Key",
    serverKey: "(server configured)",
    serverKeyPlaceholder: "Configured in server .env",
    rememberKey: "Remember key on this device",
    params: "Parameters",
    model: "Model",
    size: "Size",
    clarity: "Clarity",
    quality: "Quality",
    background: "Background",
    format: "Format",
    count: "Count",
    compression: "Compression",
    editImageField: "Image edit field",
    modeAria: "Generation mode",
    textToImage: "Text to Image",
    imageToImage: "Image to Image",
    languageSwitch: "Language switch",
    darkBackground: "Dark background",
    lightBackground: "White background",
    clear: "Clear",
    generate: "Generate",
    prompt: "Prompt",
    promptSubImage: "Redraw or edit from reference images",
    promptSubText: "Create a new image from text",
    presetsAria: "Prompt presets",
    promptPlaceholder:
      "Example: place the product from the reference image in a morning kitchen scene, preserving its look and colors, with natural window light, realistic shadows, and shallow depth of field.",
    uploadRef: "Upload references",
    refPreviewAria: "Reference preview",
    removeRef: "Remove reference",
    results: "Results",
    progressLabel: "Generation progress",
    progressIdle: "Ready to generate",
    progressComplete: "Generation complete",
    waiting: "Waiting",
    generatingShort: "Generating",
    download: "Download",
    copyRevised: "Copy revised prompt",
    previewImage: "Preview image",
    closePreview: "Close preview",
    backToOfficial: "Official site",
    status: {
      ready: "Connected",
      serviceDisconnected: "API service disconnected",
      processingRefs: "Processing reference images",
      generatingImage: "Generating image",
      enhancingImage: "Enhancing clarity",
      emptyResponse: "API returned no images",
      generateFailed: "Generation failed",
      promptCopied: "Prompt copied",
      completed: (count: number) => `Completed ${count} image${count === 1 ? "" : "s"}`
    },
    optionLabels: {
      auto: "Auto",
      high: "High",
      medium: "Medium",
      low: "Low",
      opaque: "Opaque",
      transparent: "Transparent"
    },
    clarityLabels: {
      original: "Original",
      "2k": "2K HD",
      "4k": "4K Ultra"
    },
    refAlt: (index: number) => `Reference ${index + 1}`,
    outputAlt: (index: number) => `Generated image ${index + 1}`
  }
} as const;

const promptPresets = [
  {
    label: { zh: "商品主图", en: "Product" },
    value: {
      zh: "干净电商棚拍，高级材质细节，柔和侧光，白色背景，主体居中，商业摄影质感",
      en: "clean e-commerce studio shot, premium material details, soft side lighting, white background, centered subject, commercial photography"
    }
  },
  {
    label: { zh: "头像", en: "Portrait" },
    value: {
      zh: "精致半身头像，自然肤色，电影级布光，背景干净，五官清晰，真实摄影风格",
      en: "polished half-body portrait, natural skin tone, cinematic lighting, clean background, clear facial features, realistic photography"
    }
  },
  {
    label: { zh: "海报", en: "Poster" },
    value: {
      zh: "竖版视觉海报，强烈主体层次，留出标题空间，高对比光影，现代设计感",
      en: "vertical visual poster, strong subject hierarchy, room for headline text, high-contrast lighting, modern design feel"
    }
  },
  {
    label: { zh: "国潮", en: "Guochao" },
    value: {
      zh: "现代国潮视觉，细腻纹样，醒目配色，干净构图，适合社媒传播",
      en: "modern guochao visual style, delicate patterns, bold colors, clean composition, suitable for social media"
    }
  }
];

const qualityOptions = ["auto", "high", "medium", "low"] as const;
const backgroundOptions = ["auto", "opaque", "transparent"] as const;
const clarityOptions: Array<{ value: Clarity; maxSide: number | null }> = [
  { value: "original", maxSide: null },
  { value: "2k", maxSide: 2048 },
  { value: "4k", maxSide: 4096 }
];

const sizePresets = [
  {
    id: "auto",
    apiSize: "auto",
    label: { zh: "智能尺寸", en: "Auto size" }
  },
  {
    id: "square",
    apiSize: "1024x1024",
    label: { zh: "方图 1:1", en: "Square 1:1" }
  },
  {
    id: "product",
    apiSize: "1024x1024",
    label: { zh: "商品主图 1:1", en: "Product 1:1" }
  },
  {
    id: "landscape",
    apiSize: "1536x1024",
    label: { zh: "横屏 3:2", en: "Landscape 3:2" }
  },
  {
    id: "banner",
    apiSize: "1536x1024",
    label: { zh: "横幅海报", en: "Banner poster" }
  },
  {
    id: "cover",
    apiSize: "1536x1024",
    label: { zh: "封面横图", en: "Cover landscape" }
  },
  {
    id: "portrait",
    apiSize: "1024x1536",
    label: { zh: "竖屏 2:3", en: "Portrait 2:3" }
  },
  {
    id: "story",
    apiSize: "1024x1536",
    label: { zh: "手机竖图", en: "Mobile portrait" }
  },
  {
    id: "poster",
    apiSize: "1024x1536",
    label: { zh: "长图海报", en: "Tall poster" }
  }
] as const;

const defaultSettings: StoredSettings = {
  baseUrl: "https://api.wenrugouai.cn/v1",
  model: "gpt-image-2",
  size: "square",
  clarity: "original",
  quality: "auto",
  background: "auto",
  outputFormat: "png",
  outputCompression: 80,
  n: 1,
  imageFieldName: "image",
  rememberKey: false
};

function normalizeSettings(parsed: Partial<StoredSettings>): StoredSettings {
  const next = {
    ...defaultSettings,
    ...parsed,
    baseUrl: defaultSettings.baseUrl,
    apiKey: undefined
  };

  const legacySizeMap: Record<string, string> = {
    "1024x1024": "square",
    "1536x1024": "landscape",
    "1024x1536": "portrait"
  };
  const normalizedSize = legacySizeMap[next.size] || next.size;
  const sizeExists = sizePresets.some((preset) => preset.id === normalizedSize);
  const clarityExists = clarityOptions.some((option) => option.value === next.clarity);

  return {
    ...next,
    size: sizeExists ? normalizedSize : defaultSettings.size,
    clarity: clarityExists ? next.clarity : defaultSettings.clarity
  };
}

async function upscaleImageToClarity(
  src: string,
  clarity: Clarity,
  outputFormat: string,
  outputCompression: number
) {
  const clarityOption = clarityOptions.find((option) => option.value === clarity);
  if (!clarityOption?.maxSide) {
    return src;
  }

  try {
    const image = await loadImageElement(src);
    const currentMaxSide = Math.max(image.naturalWidth, image.naturalHeight);
    if (!currentMaxSide || currentMaxSide >= clarityOption.maxSide) {
      return src;
    }

    const scale = clarityOption.maxSide / currentMaxSide;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);

    const context = canvas.getContext("2d");
    if (!context) {
      return src;
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const mimeType = mimeByFormat[outputFormat] || "image/png";
    const quality = outputFormat === "png" ? undefined : Math.max(0, Math.min(outputCompression, 100)) / 100;
    return canvas.toDataURL(mimeType, quality);
  } catch {
    return src;
  }
}

async function loadImageElement(src: string) {
  const objectUrl = await fetchImageObjectUrl(src);

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      resolve(image);
    };
    image.onerror = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      reject(new Error("Image loading failed"));
    };
    image.src = objectUrl || src;
  });
}

async function fetchImageObjectUrl(src: string) {
  if (src.startsWith("data:")) {
    return "";
  }

  try {
    const response = await fetch(src);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    return "";
  }
}

function getNativeServerConfig(): ServerConfig {
  return {
    defaultBaseUrl: FIXED_BASE_URL,
    defaultModel: FIXED_MODEL,
    hasServerBaseUrl: true,
    hasServerKey: false
  };
}

async function requestServerImages(form: FormData) {
  const response = await fetch("/api/images", {
    method: "POST",
    body: form
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "生成失败");
  }

  return data as ApiImagesResponse;
}

async function requestNativeImages(
  prompt: string,
  apiKey: string,
  settings: StoredSettings,
  size: string,
  files: File[]
) {
  const payload = buildNativePayload(prompt, settings, size);
  const endpoint = files.length > 0 ? "/images/edits" : "/images/generations";
  const url = `${FIXED_BASE_URL}${endpoint}`;

  if (files.length > 0) {
    return requestNativeEditImage(url, apiKey, payload, files, settings.imageFieldName);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await readApiResponse(response);

  if (!response.ok) {
    throw new Error(extractApiErrorMessage(data) || "生成失败");
  }

  return {
    images: normalizeApiImages(data),
    raw: data
  };
}

async function requestNativeEditImage(
  url: string,
  apiKey: string,
  payload: Record<string, string | number>,
  files: File[],
  preferredImageFieldName: string
) {
  const imageFieldNames = uniqueValues([preferredImageFieldName || "image", "image", "image[]"]);
  let lastMessage = "";

  for (const imageFieldName of imageFieldNames) {
    const form = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      form.append(key, String(value));
    });
    files.forEach((file, index) => {
      form.append(imageFieldName, file, safeImageFilename(file, index));
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: form
    });
    const data = await readApiResponse(response);

    if (response.ok) {
      return {
        images: normalizeApiImages(data),
        raw: data
      };
    }

    lastMessage = extractApiErrorMessage(data) || `图生图请求失败（${response.status}）`;
    if (!shouldRetryEditStatus(response.status)) {
      throw new Error(lastMessage);
    }
  }

  throw new Error(lastMessage || "图生图请求失败");
}

function buildNativePayload(prompt: string, settings: StoredSettings, size: string) {
  const payload: Record<string, string | number> = {
    model: FIXED_MODEL,
    prompt,
    size,
    quality: settings.quality || "auto",
    background: settings.background || "auto",
    output_format: settings.outputFormat || "png",
    n: Math.min(Math.max(Math.round(Number(settings.n) || 1), 1), 4)
  };

  if ((settings.outputFormat === "jpeg" || settings.outputFormat === "webp") && Number.isFinite(settings.outputCompression)) {
    payload.output_compression = Math.min(Math.max(Math.round(settings.outputCompression), 0), 100);
  }

  return dropEmptyNativeValues(payload);
}

async function readApiResponse(response: Response) {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function normalizeApiImages(data: unknown): ApiImageItem[] {
  if (!data || typeof data !== "object") {
    return [];
  }

  const record = data as Record<string, unknown>;
  const items = Array.isArray(record.data) ? record.data : [];
  return items
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      b64Json: readString(item.b64_json),
      url: readString(item.url),
      revisedPrompt: readString(item.revised_prompt)
    }))
    .filter((item) => item.b64Json || item.url);
}

function extractApiErrorMessage(data: unknown) {
  if (typeof data === "string") {
    return data;
  }
  if (!data || typeof data !== "object") {
    return "";
  }

  const record = data as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === "object") {
    return readString((error as Record<string, unknown>).message);
  }

  return readString(record.message);
}

function readString(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function shouldRetryEditStatus(status: number) {
  return status === 400 || status === 404 || status === 415 || status === 422;
}

function safeImageFilename(file: File, index: number) {
  const extensionByMime: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp"
  };
  return `reference-${index + 1}.${extensionByMime[file.type] || "png"}`;
}

function uniqueValues(values: string[]) {
  return values.filter((value, index, array) => value && array.indexOf(value) === index);
}

function dropEmptyNativeValues<T extends Record<string, unknown>>(record: T) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== "" && value !== undefined && value !== null)
  ) as T;
}

function App() {
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [language, setLanguage] = useState<Language>(() => {
    const storedLanguage = localStorage.getItem(LANGUAGE_KEY);
    return storedLanguage === "en" ? "en" : "zh";
  });
  const [theme, setTheme] = useState<Theme>(() => {
    const storedTheme = localStorage.getItem(THEME_KEY);
    return storedTheme === "dark" ? "dark" : "light";
  });
  const [mode, setMode] = useState<Mode>("image");
  const [prompt, setPrompt] = useState("");
  const [settings, setSettings] = useState<StoredSettings>(defaultSettings);
  const [apiKey, setApiKey] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [outputs, setOutputs] = useState<OutputImage[]>([]);
  const [previewImage, setPreviewImage] = useState<OutputImage | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<StatusState>({ kind: "ready" });
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const text = translations[language];
  const statusText =
    status.kind === "completed" ? text.status.completed(status.count || 0) : text.status[status.kind];
  const selectedSizePreset =
    sizePresets.find((preset) => preset.id === settings.size) || sizePresets.find((preset) => preset.id === "square")!;

  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    document.title = text.appTitle;
  }, [text.appTitle]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!isGenerating) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setProgress((current) => {
        if (current < 45) {
          return Math.min(current + 7, 45);
        }
        if (current < 75) {
          return Math.min(current + 4, 75);
        }
        if (current < 92) {
          return Math.min(current + 2, 92);
        }
        return current;
      });
    }, 650);

    return () => window.clearInterval(intervalId);
  }, [isGenerating]);

  useEffect(() => {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as StoredSettings;
        setSettings(normalizeSettings(parsed));
        if (parsed.rememberKey && parsed.apiKey) {
          setApiKey(parsed.apiKey);
        }
      } catch {
        localStorage.removeItem(SETTINGS_KEY);
      }
    }

    if (IS_NATIVE_APP) {
      const config = getNativeServerConfig();
      setServerConfig(config);
      setSettings((current) => ({
        ...current,
        baseUrl: config.defaultBaseUrl,
        model: config.defaultModel
      }));
      setStatus({ kind: "ready" });
      return;
    }

    fetch("/api/config")
      .then((response) => response.json())
      .then((config: ServerConfig) => {
        setServerConfig(config);
        setSettings((current) => ({
          ...current,
          baseUrl: config.defaultBaseUrl,
          model: current.model || config.defaultModel
        }));
      })
      .catch(() => {
        setStatus({ kind: "serviceDisconnected" });
      });
  }, []);

  useEffect(() => {
    const next: StoredSettings = {
      ...settings,
      apiKey: settings.rememberKey ? apiKey : undefined
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }, [settings, apiKey]);

  const previews = useMemo(
    () =>
      files.map((file) => ({
        file,
        url: URL.createObjectURL(file)
      })),
    [files]
  );

  useEffect(() => {
    return () => previews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [previews]);

  const usesServerKey = Boolean(serverConfig?.hasServerKey);
  const canSubmit =
    prompt.trim().length > 0 &&
    !isGenerating &&
    (usesServerKey || apiKey.trim().length > 0) &&
    (mode === "text" || files.length > 0);

  function updateSetting<Key extends keyof StoredSettings>(key: Key, value: StoredSettings[Key]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    setFiles((current) => {
      const merged = [...current, ...incoming].slice(0, 8);
      return merged;
    });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      addFiles(event.target.files);
      event.target.value = "";
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setIsGenerating(true);
    setProgress(8);
    setError("");
    setStatus({ kind: mode === "image" ? "processingRefs" : "generatingImage" });

    const form = new FormData();
    form.set("prompt", prompt.trim());
    form.set("apiKey", apiKey.trim());
    form.set("size", selectedSizePreset.apiSize);
    form.set("quality", settings.quality);
    form.set("background", settings.background);
    form.set("outputFormat", settings.outputFormat);
    form.set("outputCompression", String(settings.outputCompression));
    form.set("n", String(settings.n));
    form.set("imageFieldName", settings.imageFieldName);

    if (mode === "image") {
      files.forEach((file) => form.append("images", file));
    }

    try {
      const data = IS_NATIVE_APP
        ? await requestNativeImages(prompt.trim(), apiKey.trim(), settings, selectedSizePreset.apiSize, files)
        : await requestServerImages(form);

      const rawOutputs = (data.images || []).map((image: ApiImageItem) => {
        const src = image.b64Json
          ? `data:${mimeByFormat[settings.outputFormat] || "image/png"};base64,${image.b64Json}`
          : image.url || "";

        return {
          id: crypto.randomUUID(),
          src,
          clarity: settings.clarity,
          revisedPrompt: image.revisedPrompt
        };
      });

      if (rawOutputs.length > 0 && settings.clarity !== "original") {
        setStatus({ kind: "enhancingImage" });
        setProgress(96);
      }

      const nextOutputs = await Promise.all(
        rawOutputs.map(async (image: OutputImage) => ({
          ...image,
          src: await upscaleImageToClarity(
            image.src,
            settings.clarity,
            settings.outputFormat,
            settings.outputCompression
          )
        }))
      );

      setOutputs(nextOutputs);
      setProgress(100);
      setStatus(nextOutputs.length ? { kind: "completed", count: nextOutputs.length } : { kind: "emptyResponse" });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : text.status.generateFailed;
      setError(message);
      setProgress(0);
      setStatus({ kind: "generateFailed" });
    } finally {
      setIsGenerating(false);
    }
  }

  async function downloadImage(image: OutputImage, index: number) {
    const extension = settings.outputFormat === "jpeg" ? "jpg" : settings.outputFormat;
    const response = await fetch(image.src);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wenrugou-image-${image.clarity}-${index + 1}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyPrompt(value: string) {
    await navigator.clipboard.writeText(value);
    setStatus({ kind: "promptCopied" });
  }

  function appendPreset(value: string) {
    const separator = language === "zh" ? "，" : ", ";
    setPrompt((current) => [current.trim(), value].filter(Boolean).join(separator));
  }

  return (
    <main className="app-shell">
      <aside className="control-rail" aria-label={text.settingsAria}>
        <div className="brand">
          <div className="brand-mark">
            <img src="/wenrugou-icon.png" alt="" aria-hidden="true" />
          </div>
          <div>
            <h1>{text.appTitle}</h1>
            <p className={`status-line ${status.kind}`}>
              <span className="status-dot" />
              {statusText}
            </p>
          </div>
        </div>

        <section className="panel">
          <div className="panel-title">
            <KeyRound size={18} />
            <h2>{text.apiSection}</h2>
          </div>

          <label className="field">
            <span>{text.relayBaseUrl}</span>
            <input
              value={settings.baseUrl}
              readOnly
              disabled
              placeholder="https://api.wenrugouai.cn/v1"
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span>
              {text.apiKey} {usesServerKey ? text.serverKey : ""}
            </span>
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={usesServerKey ? text.serverKeyPlaceholder : "sk-..."}
              type="password"
              autoComplete="off"
              disabled={usesServerKey}
            />
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.rememberKey}
              onChange={(event) => updateSetting("rememberKey", event.target.checked)}
              disabled={usesServerKey}
            />
            <span>{text.rememberKey}</span>
          </label>
        </section>

        <section className="panel">
          <div className="panel-title">
            <Settings2 size={18} />
            <h2>{text.params}</h2>
          </div>

          <label className="field">
            <span>{text.model}</span>
            <input
              value={settings.model}
              readOnly
              disabled
              placeholder="gpt-image-2"
            />
          </label>

          <div className="grid-two">
            <label className="field">
              <span>{text.size}</span>
              <select value={settings.size} onChange={(event) => updateSetting("size", event.target.value)}>
                {sizePresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label[language]} · {preset.apiSize}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>{text.clarity}</span>
              <select value={settings.clarity} onChange={(event) => updateSetting("clarity", event.target.value as Clarity)}>
                {clarityOptions.map((clarity) => (
                  <option key={clarity.value} value={clarity.value}>
                    {text.clarityLabels[clarity.value]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid-two">
            <label className="field">
              <span>{text.quality}</span>
              <select value={settings.quality} onChange={(event) => updateSetting("quality", event.target.value)}>
                {qualityOptions.map((quality) => (
                  <option key={quality} value={quality}>
                    {text.optionLabels[quality]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid-two">
            <label className="field">
              <span>{text.background}</span>
              <select
                value={settings.background}
                onChange={(event) => updateSetting("background", event.target.value)}
              >
                {backgroundOptions.map((background) => (
                  <option key={background} value={background}>
                    {text.optionLabels[background]}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>{text.format}</span>
              <select
                value={settings.outputFormat}
                onChange={(event) => updateSetting("outputFormat", event.target.value)}
              >
                <option value="png">png</option>
                <option value="jpeg">jpeg</option>
                <option value="webp">webp</option>
              </select>
            </label>
          </div>

          <div className="grid-two">
            <label className="field">
              <span>{text.count}</span>
              <input
                type="number"
                min={1}
                max={4}
                value={settings.n}
                onChange={(event) => updateSetting("n", Number(event.target.value))}
              />
            </label>

            <label className="field">
              <span>{text.compression}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={settings.outputCompression}
                onChange={(event) => updateSetting("outputCompression", Number(event.target.value))}
                disabled={settings.outputFormat === "png"}
              />
            </label>
          </div>

          <label className="field">
            <span>{text.editImageField}</span>
            <select
              value={settings.imageFieldName}
              onChange={(event) => updateSetting("imageFieldName", event.target.value)}
            >
              <option value="image[]">image[]</option>
              <option value="image">image</option>
            </select>
          </label>
        </section>
      </aside>

      <form className="workspace" onSubmit={handleSubmit}>
        <header className="topbar">
          <div className="segmented" role="tablist" aria-label={text.modeAria}>
            <button
              type="button"
              className={mode === "text" ? "active" : ""}
              onClick={() => setMode("text")}
              role="tab"
              aria-selected={mode === "text"}
            >
              <Sparkles size={18} />
              {text.textToImage}
            </button>
            <button
              type="button"
              className={mode === "image" ? "active" : ""}
              onClick={() => setMode("image")}
              role="tab"
              aria-selected={mode === "image"}
            >
              <ImagePlus size={18} />
              {text.imageToImage}
            </button>
          </div>

          <div className="actions">
            <a
              className="official-link"
              href="https://api.wenrugouai.cn/"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={16} />
              {text.backToOfficial}
            </a>
            <div className="language-switch" role="group" aria-label={text.languageSwitch}>
              <Languages size={16} />
              <button
                type="button"
                className={language === "zh" ? "active" : ""}
                aria-pressed={language === "zh"}
                onClick={() => setLanguage("zh")}
              >
                中
              </button>
              <button
                type="button"
                className={language === "en" ? "active" : ""}
                aria-pressed={language === "en"}
                onClick={() => setLanguage("en")}
              >
                EN
              </button>
            </div>
            <button
              type="button"
              className="icon-button"
              title={theme === "dark" ? text.lightBackground : text.darkBackground}
              aria-label={theme === "dark" ? text.lightBackground : text.darkBackground}
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              type="button"
              className="icon-button"
              title={text.clear}
              aria-label={text.clear}
              onClick={() => {
                setPrompt("");
                setFiles([]);
                setOutputs([]);
                setPreviewImage(null);
                setError("");
                setProgress(0);
                setStatus({ kind: "ready" });
              }}
            >
              <RotateCcw size={18} />
            </button>
            <button type="submit" className="primary-button" disabled={!canSubmit}>
              {isGenerating ? <Loader2 className="spin" size={18} /> : <Brush size={18} />}
              {text.generate}
            </button>
          </div>
        </header>

        <section className="prompt-zone">
          <div className="prompt-header">
            <div>
              <h2>{text.prompt}</h2>
              <p>{mode === "image" ? text.promptSubImage : text.promptSubText}</p>
            </div>
            <div className="preset-row" aria-label={text.presetsAria}>
              {promptPresets.map((preset) => (
                <button type="button" key={preset.label.zh} onClick={() => appendPreset(preset.value[language])}>
                  {preset.label[language]}
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={text.promptPlaceholder}
          />
        </section>

        {mode === "image" && (
          <section className="upload-section">
            <div
              className={`dropzone ${isDragging ? "dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  fileInputRef.current?.click();
                }
              }}
            >
              <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handleFileChange} />
              <Upload size={22} />
              <span>{text.uploadRef}</span>
              <small>{files.length}/8</small>
            </div>

            <div className="preview-strip" aria-label={text.refPreviewAria}>
              {previews.length === 0 ? (
                <div className="empty-preview">
                  <Layers size={22} />
                </div>
              ) : (
                previews.map((preview, index) => (
                  <div className="preview-card" key={`${preview.file.name}-${preview.file.lastModified}`}>
                    <img src={preview.url} alt={text.refAlt(index)} />
                    <button
                      type="button"
                      className="remove-button"
                      aria-label={text.removeRef}
                      onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}

        <section className="result-section">
          <div className="section-title">
            <Palette size={18} />
            <h2>{text.results}</h2>
          </div>

          <div className={`progress-panel ${isGenerating ? "active" : ""}`}>
            <div className="progress-copy">
              <span>{text.progressLabel}</span>
              <strong>{progress}%</strong>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-label={text.progressLabel}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <div style={{ width: `${progress}%` }} />
            </div>
            <small>{status.kind === "ready" ? text.progressIdle : statusText}</small>
          </div>

          <div className="result-grid">
            {outputs.length === 0 ? (
              <div className="result-empty">
                <CheckCircle2 size={24} />
                <span>{isGenerating ? text.generatingShort : text.waiting}</span>
              </div>
            ) : (
              outputs.map((image, index) => (
                <article className="result-card" key={image.id}>
                  <button
                    type="button"
                    className="image-preview-trigger"
                    aria-label={text.previewImage}
                    onClick={() => setPreviewImage(image)}
                  >
                    <img src={image.src} alt={text.outputAlt(index)} />
                  </button>
                  <div className="result-tools">
                    <button type="button" title={text.download} aria-label={text.download} onClick={() => downloadImage(image, index)}>
                      <ArrowDownToLine size={17} />
                    </button>
                    {image.revisedPrompt && (
                      <button
                        type="button"
                        title={text.copyRevised}
                        aria-label={text.copyRevised}
                        onClick={() => copyPrompt(image.revisedPrompt || "")}
                      >
                        <Copy size={17} />
                      </button>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </form>

      {previewImage && (
        <div className="preview-modal" role="dialog" aria-modal="true" aria-label={text.previewImage}>
          <button
            type="button"
            className="preview-backdrop"
            aria-label={text.closePreview}
            onClick={() => setPreviewImage(null)}
          />
          <div className="preview-window">
            <div className="preview-toolbar">
              <span>{text.previewImage}</span>
              <div>
                <button type="button" title={text.download} aria-label={text.download} onClick={() => downloadImage(previewImage, 0)}>
                  <ArrowDownToLine size={18} />
                </button>
                <button type="button" title={text.closePreview} aria-label={text.closePreview} onClick={() => setPreviewImage(null)}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <img src={previewImage.src} alt={text.previewImage} />
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
