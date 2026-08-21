import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, X, ScanBarcode, Upload, Loader2, Zap, ZoomIn } from "lucide-react";

interface BarcodeScannerProps {
  onDetected: (code: string) => void;
  onClose: () => void;
  enableNumberTextScan?: boolean;
}

const NATIVE_BARCODE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "code_93",
  "itf",
  "qr_code",
] as const;

const ZXING_MAX_PHOTO_EDGE = 2200;
const ZXING_MAX_VIDEO_EDGE = 1920;
const ZXING_MIN_PHOTO_EDGE = 900;
const ZXING_MIN_VIDEO_EDGE = 760;
const ZXING_VIDEO_SCAN_INTERVAL_MS = 280;
const NATIVE_VIDEO_SCAN_INTERVAL_MS = 90;
const TEXT_VIDEO_SCAN_INTERVAL_MS = 720;
const SMALL_LABEL_ZOOM = 2.2;
const SMALL_LABEL_PREVIEW_ZOOM = 2.35;

type ImageScanVariant = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotate: number;
};

type CropScanVariant = Omit<ImageScanVariant, "rotate">;

const PHOTO_SCAN_VARIANTS = [
  { x: 0, y: 0, width: 1, height: 1, rotate: 0 },
  { x: 0.04, y: 0.18, width: 0.92, height: 0.64, rotate: 0 },
  { x: 0.08, y: 0.28, width: 0.84, height: 0.44, rotate: 0 },
  { x: 0.08, y: 0.42, width: 0.84, height: 0.34, rotate: 0 },
  { x: 0.16, y: 0.48, width: 0.68, height: 0.24, rotate: 0 },
  { x: 0.22, y: 0.54, width: 0.56, height: 0.2, rotate: 0 },
  { x: 0, y: 0, width: 1, height: 1, rotate: 90 },
  { x: 0.04, y: 0.18, width: 0.92, height: 0.64, rotate: 90 },
  { x: 0.08, y: 0.28, width: 0.84, height: 0.44, rotate: 90 },
  { x: 0.16, y: 0.48, width: 0.68, height: 0.24, rotate: 90 },
  { x: 0, y: 0, width: 1, height: 1, rotate: -90 },
  { x: 0.16, y: 0.48, width: 0.68, height: 0.24, rotate: -90 },
] as const;

const VIDEO_SCAN_VARIANTS = [
  { x: 0, y: 0, width: 1, height: 1 },
  { x: 0.04, y: 0.2, width: 0.92, height: 0.6 },
  { x: 0.08, y: 0.32, width: 0.84, height: 0.36 },
] as const;

const VIDEO_SMALL_LABEL_SCAN_VARIANTS = [
  ...VIDEO_SCAN_VARIANTS,
  { x: 0.08, y: 0.38, width: 0.84, height: 0.28 },
  { x: 0.14, y: 0.42, width: 0.72, height: 0.22 },
  { x: 0.2, y: 0.46, width: 0.6, height: 0.18 },
  { x: 0.08, y: 0.52, width: 0.84, height: 0.24 },
] as const;

const PHOTO_NUMBER_TEXT_SCAN_VARIANTS: readonly ImageScanVariant[] = [
  { x: 0.04, y: 0.34, width: 0.92, height: 0.36, rotate: 0 },
  { x: 0.08, y: 0.42, width: 0.84, height: 0.28, rotate: 0 },
  { x: 0.12, y: 0.48, width: 0.76, height: 0.18, rotate: 0 },
  { x: 0, y: 0, width: 1, height: 1, rotate: 0 },
] as const;

const VIDEO_NUMBER_TEXT_SCAN_VARIANTS: readonly CropScanVariant[] = [
  { x: 0.08, y: 0.48, width: 0.84, height: 0.2 },
  { x: 0.12, y: 0.55, width: 0.76, height: 0.14 },
  { x: 0.06, y: 0.4, width: 0.88, height: 0.3 },
] as const;

const VIDEO_NUMBER_TEXT_SMALL_LABEL_SCAN_VARIANTS: readonly CropScanVariant[] = [
  { x: 0.1, y: 0.48, width: 0.8, height: 0.22 },
  { x: 0.14, y: 0.54, width: 0.72, height: 0.16 },
  { x: 0.08, y: 0.42, width: 0.84, height: 0.3 },
] as const;

type NativeBarcode = {
  rawValue?: string;
};

type NativeBarcodeDetector = {
  detect: (source: CanvasImageSource) => Promise<NativeBarcode[]>;
};

type NativeBarcodeDetectorConstructor = new (options?: {
  formats?: readonly string[];
}) => NativeBarcodeDetector;

type NativeDetectedText = {
  rawValue?: string;
  text?: string;
};

type NativeTextDetector = {
  detect: (source: CanvasImageSource) => Promise<NativeDetectedText[]>;
};

type NativeTextDetectorConstructor = new () => NativeTextDetector;

function getNativeBarcodeDetector(): NativeBarcodeDetectorConstructor | null {
  if (typeof window === "undefined" || !("BarcodeDetector" in window)) {
    return null;
  }

  return (window as Window & { BarcodeDetector: NativeBarcodeDetectorConstructor }).BarcodeDetector;
}

const hasNativeBarcodeDetector = Boolean(getNativeBarcodeDetector());
let nativeBarcodeDetector: NativeBarcodeDetector | null = null;
let nativeTextDetector: NativeTextDetector | null = null;

async function detectWithNativeBarcodeDetector(source: CanvasImageSource): Promise<string | null> {
  const BarcodeDetectorClass = getNativeBarcodeDetector();
  if (!BarcodeDetectorClass) return null;

  try {
    nativeBarcodeDetector ??= new BarcodeDetectorClass({ formats: NATIVE_BARCODE_FORMATS });
    const barcodes = await nativeBarcodeDetector.detect(source);
    const detected = barcodes.find((barcode) => typeof barcode.rawValue === "string" && barcode.rawValue.trim());
    return detected?.rawValue?.trim() ?? null;
  } catch {
    return null;
  }
}

function clampBetweenZeroAndOne(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function resolveTargetScale(width: number, height: number, maxEdge: number, minEdge: number): number {
  const edge = Math.max(width, height);
  if (!edge) return 1;
  if (edge > maxEdge) return maxEdge / edge;
  if (edge < minEdge) return Math.min(maxEdge / edge, minEdge / edge);
  return 1;
}

function tuneCanvasDraw(ctx: CanvasRenderingContext2D, scale: number): void {
  ctx.imageSmoothingEnabled = scale < 1;
  if (scale < 1) {
    ctx.imageSmoothingQuality = "high";
  }
}

function getNativeTextDetector(): NativeTextDetectorConstructor | null {
  if (typeof window === "undefined" || !("TextDetector" in window)) {
    return null;
  }

  return (window as Window & { TextDetector: NativeTextDetectorConstructor }).TextDetector;
}

function cleanOcrDigitText(value: string): string {
  return value
    .replace(/[Oo]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[S]/g, "5")
    .replace(/[B]/g, "8");
}

function escolherMelhorNumeroLido(texts: string[]): string | null {
  const candidates: string[] = [];

  for (const text of texts) {
    const cleaned = cleanOcrDigitText(text);
    const matches = cleaned.match(/\d[\d\s.\-_/]{4,}\d/g) ?? [];

    for (const match of matches) {
      const digits = match.replace(/\D+/g, "");
      if (digits.length >= 8 && digits.length <= 14) {
        candidates.push(digits);
      }
    }
  }

  const unique = [...new Set(candidates)];
  if (!unique.length) return null;

  return unique.sort((a, b) => {
    const aBarcodeLike = a.length >= 12 ? 1 : 0;
    const bBarcodeLike = b.length >= 12 ? 1 : 0;
    if (aBarcodeLike !== bBarcodeLike) return bBarcodeLike - aBarcodeLike;
    return b.length - a.length;
  })[0] ?? null;
}

async function detectNumberTextWithNativeDetector(source: CanvasImageSource): Promise<string | null> {
  const TextDetectorClass = getNativeTextDetector();
  if (!TextDetectorClass) return null;

  try {
    nativeTextDetector ??= new TextDetectorClass();
    const texts = await nativeTextDetector.detect(source);
    const values = texts
      .map((item) => item.rawValue ?? item.text ?? "")
      .map((value) => value.trim())
      .filter(Boolean);
    return escolherMelhorNumeroLido(values);
  } catch {
    return null;
  }
}

function createCanvasVariant(
  image: HTMLImageElement,
  variant: ImageScanVariant
): HTMLCanvasElement {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  const cropX = Math.round(clampBetweenZeroAndOne(variant.x) * sourceWidth);
  const cropY = Math.round(clampBetweenZeroAndOne(variant.y) * sourceHeight);
  const cropWidth = Math.max(1, Math.round(clampBetweenZeroAndOne(variant.width) * sourceWidth));
  const cropHeight = Math.max(1, Math.round(clampBetweenZeroAndOne(variant.height) * sourceHeight));

  const safeCropWidth = Math.min(cropWidth, sourceWidth - cropX);
  const safeCropHeight = Math.min(cropHeight, sourceHeight - cropY);
  const scale = resolveTargetScale(safeCropWidth, safeCropHeight, ZXING_MAX_PHOTO_EDGE, ZXING_MIN_PHOTO_EDGE);
  const targetWidth = Math.max(1, Math.round(safeCropWidth * scale));
  const targetHeight = Math.max(1, Math.round(safeCropHeight * scale));

  const canvas = document.createElement("canvas");
  const isQuarterTurn = Math.abs(variant.rotate) === 90;

  canvas.width = isQuarterTurn ? targetHeight : targetWidth;
  canvas.height = isQuarterTurn ? targetWidth : targetHeight;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Falha ao preparar leitura da imagem");
  }

  tuneCanvasDraw(ctx, scale);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((variant.rotate * Math.PI) / 180);
  ctx.drawImage(
    image,
    cropX,
    cropY,
    safeCropWidth,
    safeCropHeight,
    -targetWidth / 2,
    -targetHeight / 2,
    targetWidth,
    targetHeight
  );

  return canvas;
}

function drawVideoCropToCanvas(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  variant: CropScanVariant,
  maxEdge: number,
  minEdge: number
): boolean {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;

  if (!sourceWidth || !sourceHeight) return false;

  const cropX = Math.round(clampBetweenZeroAndOne(variant.x) * sourceWidth);
  const cropY = Math.round(clampBetweenZeroAndOne(variant.y) * sourceHeight);
  const cropWidth = Math.max(1, Math.round(clampBetweenZeroAndOne(variant.width) * sourceWidth));
  const cropHeight = Math.max(1, Math.round(clampBetweenZeroAndOne(variant.height) * sourceHeight));
  const safeCropWidth = Math.min(cropWidth, sourceWidth - cropX);
  const safeCropHeight = Math.min(cropHeight, sourceHeight - cropY);
  const scale = resolveTargetScale(safeCropWidth, safeCropHeight, maxEdge, minEdge);
  const targetWidth = Math.max(1, Math.round(safeCropWidth * scale));
  const targetHeight = Math.max(1, Math.round(safeCropHeight * scale));

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;

  tuneCanvasDraw(ctx, scale);
  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(
    video,
    cropX,
    cropY,
    safeCropWidth,
    safeCropHeight,
    0,
    0,
    targetWidth,
    targetHeight
  );

  return true;
}

async function decodeCanvasWithZxing(canvas: HTMLCanvasElement): Promise<string | null> {
  const {
    BarcodeFormat,
    BinaryBitmap,
    DecodeHintType,
    GlobalHistogramBinarizer,
    HTMLCanvasElementLuminanceSource,
    HybridBinarizer,
    MultiFormatReader,
  } = await import("@zxing/library");

  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODE_93,
    BarcodeFormat.ITF,
    BarcodeFormat.QR_CODE,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);

  const attempts = [
    () => new BinaryBitmap(new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas))),
    () => new BinaryBitmap(new GlobalHistogramBinarizer(new HTMLCanvasElementLuminanceSource(canvas))),
    () => new BinaryBitmap(new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas, true))),
    () => new BinaryBitmap(new GlobalHistogramBinarizer(new HTMLCanvasElementLuminanceSource(canvas, true))),
  ];

  for (const createBitmap of attempts) {
    try {
      const reader = new MultiFormatReader();
      const result = reader.decode(createBitmap(), hints);
      const value = result.getText().trim();
      if (value) {
        return value;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function detectWithZxing(image: HTMLImageElement): Promise<string | null> {
  for (const variant of PHOTO_SCAN_VARIANTS) {
    const canvas = createCanvasVariant(image, variant);

    try {
      const code = await decodeCanvasWithZxing(canvas);
      if (code) {
        return code;
      }
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  return null;
}

async function detectNumberTextFromImage(image: HTMLImageElement): Promise<string | null> {
  for (const variant of PHOTO_NUMBER_TEXT_SCAN_VARIANTS) {
    const canvas = createCanvasVariant(image, variant);

    try {
      const code = await detectNumberTextWithNativeDetector(canvas);
      if (code) {
        return code;
      }
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  return null;
}

async function detectVideoNumberText(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  smallLabelMode: boolean
): Promise<string | null> {
  const variants = smallLabelMode ? VIDEO_NUMBER_TEXT_SMALL_LABEL_SCAN_VARIANTS : VIDEO_NUMBER_TEXT_SCAN_VARIANTS;

  for (const variant of variants) {
    const drawn = drawVideoCropToCanvas(video, canvas, variant, 1600, 760);
    if (!drawn) return null;

    const code = await detectNumberTextWithNativeDetector(canvas);
    if (code) return code;
  }

  return null;
}

async function detectVideoFrameWithZxing(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  smallLabelMode: boolean
): Promise<string | null> {
  const variants = smallLabelMode ? VIDEO_SMALL_LABEL_SCAN_VARIANTS : VIDEO_SCAN_VARIANTS;

  for (const variant of variants) {
    const drawn = drawVideoCropToCanvas(video, canvas, variant, ZXING_MAX_VIDEO_EDGE, ZXING_MIN_VIDEO_EDGE);
    if (!drawn) return null;

    const code = await decodeCanvasWithZxing(canvas);
    if (code) return code;
  }

  return null;
}

type TrackNumberCapability = {
  min?: number;
  max?: number;
  step?: number;
};

type BarcodeCameraCapabilities = MediaTrackCapabilities & {
  exposureMode?: string[];
  focusMode?: string[];
  torch?: boolean;
  whiteBalanceMode?: string[];
  zoom?: TrackNumberCapability;
};

type BarcodeCameraOptions = {
  smallLabelMode: boolean;
  torchOn: boolean;
};

function roundTrackValue(value: number, step?: number): number {
  if (!step || step <= 0) return value;
  return Math.round(value / step) * step;
}

async function tryApplyVideoConstraint(track: MediaStreamTrack, constraint: Record<string, unknown>): Promise<void> {
  try {
    await track.applyConstraints({ advanced: [constraint] } as MediaTrackConstraints);
  } catch {
    // Browser support varies a lot here; unsupported camera tweaks should not break scanning.
  }
}

function getCameraSupport(track: MediaStreamTrack): { supportsTorch: boolean; supportsZoom: boolean } {
  const capabilities = (track.getCapabilities?.() ?? {}) as BarcodeCameraCapabilities;
  return {
    supportsTorch: Boolean(capabilities.torch),
    supportsZoom: Boolean(capabilities.zoom),
  };
}

async function applyTorch(track: MediaStreamTrack, torchOn: boolean): Promise<boolean> {
  const capabilities = (track.getCapabilities?.() ?? {}) as BarcodeCameraCapabilities;
  if (!capabilities.torch) return false;
  await tryApplyVideoConstraint(track, { torch: torchOn });
  return true;
}

async function applyCameraEnhancements(
  track: MediaStreamTrack,
  options: BarcodeCameraOptions
): Promise<{ supportsTorch: boolean; supportsZoom: boolean }> {
  const capabilities = (track.getCapabilities?.() ?? {}) as BarcodeCameraCapabilities;
  const focusModes = capabilities.focusMode ?? [];
  const exposureModes = capabilities.exposureMode ?? [];
  const whiteBalanceModes = capabilities.whiteBalanceMode ?? [];

  if (focusModes.includes("continuous")) {
    await tryApplyVideoConstraint(track, { focusMode: "continuous" });
  }

  if (exposureModes.includes("continuous")) {
    await tryApplyVideoConstraint(track, { exposureMode: "continuous" });
  }

  if (whiteBalanceModes.includes("continuous")) {
    await tryApplyVideoConstraint(track, { whiteBalanceMode: "continuous" });
  }

  if (capabilities.zoom && typeof capabilities.zoom.max === "number") {
    const min = typeof capabilities.zoom.min === "number" ? capabilities.zoom.min : 1;
    const max = capabilities.zoom.max;
    const step = capabilities.zoom.step;
    const desired = options.smallLabelMode ? SMALL_LABEL_ZOOM : min;
    const zoom = Math.min(max, Math.max(min, roundTrackValue(desired, step)));
    await tryApplyVideoConstraint(track, { zoom });
  }

  if (capabilities.torch) {
    void applyTorch(track, options.torchOn);
  }

  return {
    supportsTorch: Boolean(capabilities.torch),
    supportsZoom: Boolean(capabilities.zoom),
  };
}

function loadImageFromFile(file: File): Promise<{ image: HTMLImageElement; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Falha ao carregar imagem"));
    };
    image.src = objectUrl;
  });
}

const BarcodeScanner = ({ onDetected, onClose, enableNumberTextScan = false }: BarcodeScannerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const detectedRef = useRef(false);
  const processingRef = useRef(false);
  const smallLabelModeRef = useRef(false);
  const torchOnRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [fileModeOnly, setFileModeOnly] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(true);
  const [smallLabelMode, setSmallLabelMode] = useState(false);
  const [supportsTorch, setSupportsTorch] = useState(false);
  const [supportsZoom, setSupportsZoom] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchBusy, setTorchBusy] = useState(false);

  const supportsLiveCamera = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  const useFileMode = fileModeOnly || !supportsLiveCamera;

  const cleanup = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    smallLabelModeRef.current = smallLabelMode;

    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;

    void applyCameraEnhancements(track, { smallLabelMode, torchOn: torchOnRef.current }).then((support) => {
      setSupportsTorch(support.supportsTorch);
      setSupportsZoom(support.supportsZoom);
    });
  }, [smallLabelMode]);

  useEffect(() => {
    if (useFileMode) {
      setCameraStarting(false);
      return;
    }

    let cancelled = false;
    detectedRef.current = false;
    setCameraStarting(true);
    setError(null);

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        if (track) {
          const support = getCameraSupport(track);
          setSupportsTorch(support.supportsTorch);
          setSupportsZoom(support.supportsZoom);
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (track) {
          void applyCameraEnhancements(track, {
            smallLabelMode: smallLabelModeRef.current,
            torchOn: torchOnRef.current,
          }).then((support) => {
            if (!cancelled) {
              setSupportsTorch(support.supportsTorch);
              setSupportsZoom(support.supportsZoom);
            }
          });
        }

        setCameraStarting(false);

        let lastScanAt = 0;
        let lastTextScanAt = 0;
        const scanInterval = hasNativeBarcodeDetector ? NATIVE_VIDEO_SCAN_INTERVAL_MS : ZXING_VIDEO_SCAN_INTERVAL_MS;

        const scan = async (timestamp = 0) => {
          if (cancelled || detectedRef.current || !videoRef.current) return;

          if (processingRef.current || videoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            animFrameRef.current = requestAnimationFrame(scan);
            return;
          }

          if (timestamp - lastScanAt < scanInterval) {
            animFrameRef.current = requestAnimationFrame(scan);
            return;
          }

          lastScanAt = timestamp;

          const canvas = canvasRef.current;
          const nativeCode = hasNativeBarcodeDetector
            ? await detectWithNativeBarcodeDetector(videoRef.current)
            : null;
          let code = nativeCode || (canvas ? await detectVideoFrameWithZxing(videoRef.current, canvas, smallLabelModeRef.current) : null);

          if (!code && enableNumberTextScan && canvas && timestamp - lastTextScanAt >= TEXT_VIDEO_SCAN_INTERVAL_MS) {
            lastTextScanAt = timestamp;
            code = await detectVideoNumberText(videoRef.current, canvas, smallLabelModeRef.current);
          }

          if (code && !detectedRef.current) {
            detectedRef.current = true;
            cleanup();
            onDetected(code);
            return;
          }

          animFrameRef.current = requestAnimationFrame(scan);
        };

        animFrameRef.current = requestAnimationFrame(scan);
      } catch {
        if (!cancelled) {
          setFileModeOnly(true);
          setCameraStarting(false);
          setError("Nao foi possivel abrir a camera ao vivo. Permita a camera no navegador ou use foto.");
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [cleanup, enableNumberTextScan, onDetected, useFileMode]);

  const handleFileCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    processingRef.current = true;
    setProcessing(true);

    try {
      const { image, objectUrl } = await loadImageFromFile(file);

      try {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = image.naturalWidth || image.width;
          canvas.height = image.naturalHeight || image.height;

          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0);
          }
        }

        const nativeCode = canvas ? await detectWithNativeBarcodeDetector(canvas) : null;
        const fallbackCode = nativeCode
          || await detectWithZxing(image)
          || (enableNumberTextScan ? await detectNumberTextFromImage(image) : null);

        if (fallbackCode) {
          onDetected(fallbackCode);
          return;
        }

        setError(
          enableNumberTextScan
            ? "Nenhum codigo foi identificado. Tente enquadrar a barra na mira e os numeros na faixa menor."
            : "Nenhum codigo de barras foi identificado. Tente novamente com uma foto mais nitida e o codigo ocupando mais espaco."
        );
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      setError("Nao foi possivel ler a imagem. Tente novamente.");
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  };

  const handleClose = () => {
    cleanup();
    onClose();
  };

  const handleRetry = () => {
    setError(null);

    if (useFileMode) {
      cameraInputRef.current?.click();
    }
  };

  const handleTorchToggle = async () => {
    if (torchBusy) return;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;

    const next = !torchOnRef.current;
    torchOnRef.current = next;
    setTorchOn(next);
    setTorchBusy(true);

    try {
      const supported = await applyTorch(track, next);
      if (!supported) {
        setSupportsTorch(false);
        torchOnRef.current = false;
        setTorchOn(false);
      }
    } finally {
      setTorchBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-foreground/90 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-primary-foreground">
          <ScanBarcode className="w-5 h-5" />
          <span className="font-semibold text-sm">
            {useFileMode ? "Capturar codigo" : cameraStarting ? "Abrindo camera..." : "Escaneando..."}
          </span>
        </div>

        <button
          onClick={handleClose}
          className="w-9 h-9 rounded-full bg-card/20 flex items-center justify-center"
        >
          <X className="w-5 h-5 text-primary-foreground" />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          {processing ? (
            <div className="text-center text-primary-foreground bg-card/20 rounded-xl p-5">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
              <p className="font-medium">Lendo codigo da imagem...</p>
            </div>
          ) : error && !useFileMode ? (
            <div className="text-center text-destructive-foreground bg-destructive/80 rounded-xl p-4">
              <p className="font-medium">{error}</p>
              <div className="flex gap-2 mt-3 justify-center">
                <button
                  onClick={handleRetry}
                  className="px-4 py-2 bg-card text-foreground rounded-lg text-sm font-semibold"
                >
                  Tentar novamente
                </button>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-card text-foreground rounded-lg text-sm font-semibold"
                >
                  Fechar
                </button>
              </div>
            </div>
          ) : useFileMode ? (
            <div className="text-center space-y-4">
              {error && (
                <div className="text-destructive-foreground bg-destructive/80 rounded-xl p-3 text-sm font-semibold">
                  {error}
                </div>
              )}

              <div className="w-20 h-20 rounded-full bg-card/20 flex items-center justify-center mx-auto">
                <Camera className="w-10 h-10 text-primary-foreground" />
              </div>

              <p className="text-primary-foreground font-semibold">
                Tire uma foto do codigo de barras
              </p>

              <p className="text-primary-foreground/70 text-sm">
                No iPhone, o codigo sera lido direto da imagem capturada
              </p>

              <label style={{ display: "block", width: "100%" }}>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileCapture}
                  style={{ display: "none", position: "absolute", opacity: 0, pointerEvents: "none" }}
                />
                <span
                  className="w-full h-14 bg-primary text-primary-foreground rounded-xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg"
                  style={{ cursor: "pointer" }}
                >
                  <Camera className="w-5 h-5" /> Abrir Camera
                </span>
              </label>

              <label style={{ display: "block", width: "100%" }}>
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileCapture}
                  style={{ display: "none", position: "absolute", opacity: 0, pointerEvents: "none" }}
                />
                <span
                  className="w-full h-12 bg-card/20 text-primary-foreground rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  style={{ cursor: "pointer" }}
                >
                  <Upload className="w-4 h-4" /> Escolher da Galeria
                </span>
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4]">
                <video
                  ref={videoRef}
                  className="h-full w-full rounded-2xl object-cover transition-transform duration-200"
                  style={{ transform: smallLabelMode ? `scale(${SMALL_LABEL_PREVIEW_ZOOM})` : "scale(1)" }}
                  playsInline
                  muted
                  autoPlay
                />
                <div
                  className={`pointer-events-none absolute left-1/2 top-1/2 h-[18%] w-[76%] -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 ${
                    smallLabelMode ? "border-primary shadow-[0_0_0_999px_rgba(0,0,0,0.30)]" : "border-white/65"
                  }`}
                />
                {enableNumberTextScan && (
                  <div className="pointer-events-none absolute left-1/2 top-[62%] h-[9%] w-[70%] -translate-x-1/2 rounded-md border-2 border-amber-300/90 bg-black/10">
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/55 px-2 py-0.5 text-[11px] font-bold text-amber-100">
                      Numeros do codigo
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSmallLabelMode((value) => !value)}
                  className={`h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform border ${
                    smallLabelMode
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card/20 text-primary-foreground border-white/20"
                  }`}
                >
                  <ZoomIn className="w-4 h-4" /> Zoom etiqueta
                </button>

                <button
                  type="button"
                  onClick={() => void handleTorchToggle()}
                  disabled={!supportsTorch || torchBusy}
                  className={`h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform border ${
                    torchOn && supportsTorch
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card/20 text-primary-foreground border-white/20"
                  } ${supportsTorch && !torchBusy ? "" : "opacity-45"}`}
                >
                  {torchBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Luz
                </button>
              </div>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileCapture}
                className="hidden"
              />

              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileCapture}
                className="hidden"
              />

              <button
                onClick={() => cameraInputRef.current?.click()}
                className="w-full h-11 bg-primary text-primary-foreground rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <Camera className="w-4 h-4" /> Foto nitida
              </button>

              <button
                onClick={() => galleryInputRef.current?.click()}
                className="w-full h-11 bg-card/20 text-primary-foreground rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform border border-white/20"
              >
                <Upload className="w-4 h-4" /> Escolher da Galeria
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="pb-8 pt-4 text-center">
        <p className="text-primary-foreground/70 text-sm">
          {useFileMode
            ? enableNumberTextScan
              ? "Na foto, deixe a barra e os numeros impressos bem nitidos"
              : "Aproxime bem o codigo e evite sombras na foto"
            : enableNumberTextScan
              ? "Barra na mira maior, numeros impressos na faixa menor"
              : supportsZoom || smallLabelMode
                ? "Aproxime a etiqueta ate ocupar a mira da camera"
                : "Aponte a camera para o codigo de barras"}
        </p>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default BarcodeScanner;
