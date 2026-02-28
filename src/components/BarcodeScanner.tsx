import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, X, ScanBarcode, Upload } from "lucide-react";

interface BarcodeScannerProps {
  onDetected: (code: string) => void;
  onClose: () => void;
}

const hasBarcodeDetector = typeof window !== "undefined" && "BarcodeDetector" in window;

const BarcodeScanner = ({ onDetected, onClose }: BarcodeScannerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useFileMode, setUseFileMode] = useState(!hasBarcodeDetector);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detectedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Video stream mode (Android/Desktop with BarcodeDetector)
  useEffect(() => {
    if (useFileMode) return;
    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // @ts-ignore - BarcodeDetector exists on supported browsers
        const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "qr_code"] });

        const scan = async () => {
          if (cancelled || detectedRef.current || !videoRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0 && !detectedRef.current) {
              detectedRef.current = true;
              cleanup();
              onDetected(barcodes[0].rawValue);
              return;
            }
          } catch {}
          animFrameRef.current = requestAnimationFrame(scan);
        };
        scan();
      } catch {
        if (!cancelled) setError("Não foi possível acessar a câmera. Verifique as permissões.");
      }
    };

    start();
    return () => { cancelled = true; cleanup(); };
  }, [useFileMode, onDetected, cleanup]);

  // File/image mode (iOS Safari fallback)
  const handleFileCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    img.onload = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);

      if (hasBarcodeDetector) {
        try {
          // @ts-ignore
          const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "qr_code"] });
          const barcodes = await detector.detect(canvas);
          if (barcodes.length > 0) {
            onDetected(barcodes[0].rawValue);
            return;
          }
        } catch {}
      }
      setError("Nenhum código encontrado na imagem. Tente novamente com uma foto mais nítida.");
    };
    img.src = URL.createObjectURL(file);
    e.target.value = "";
  };

  return (
    <div className="fixed inset-0 z-50 bg-foreground/90 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-primary-foreground">
          <ScanBarcode className="w-5 h-5" />
          <span className="font-semibold text-sm">
            {useFileMode ? "Capturar código" : "Escaneando..."}
          </span>
        </div>
        <button
          onClick={() => { cleanup(); onClose(); }}
          className="w-9 h-9 rounded-full bg-card/20 flex items-center justify-center"
        >
          <X className="w-5 h-5 text-primary-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          {error ? (
            <div className="text-center text-destructive-foreground bg-destructive/80 rounded-xl p-4">
              <p className="font-medium">{error}</p>
              <div className="flex gap-2 mt-3 justify-center">
                <button
                  onClick={() => { setError(null); if (useFileMode) fileInputRef.current?.click(); }}
                  className="px-4 py-2 bg-card text-foreground rounded-lg text-sm font-semibold"
                >
                  Tentar novamente
                </button>
                <button
                  onClick={() => { cleanup(); onClose(); }}
                  className="px-4 py-2 bg-card text-foreground rounded-lg text-sm font-semibold"
                >
                  Fechar
                </button>
              </div>
            </div>
          ) : useFileMode ? (
            <div className="text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-card/20 flex items-center justify-center mx-auto">
                <Camera className="w-10 h-10 text-primary-foreground" />
              </div>
              <p className="text-primary-foreground font-semibold">
                Tire uma foto do código de barras
              </p>
              <p className="text-primary-foreground/70 text-sm">
                A câmera do seu dispositivo será aberta para capturar a imagem
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileCapture}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-14 bg-primary text-primary-foreground rounded-xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg"
              >
                <Camera className="w-5 h-5" /> Abrir Câmera
              </button>
              <button
                onClick={() => {
                  // Also allow picking from gallery
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.onchange = (ev) => handleFileCapture(ev as any);
                  input.click();
                }}
                className="w-full h-12 bg-card/20 text-primary-foreground rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <Upload className="w-4 h-4" /> Escolher da Galeria
              </button>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden">
              <video ref={videoRef} className="w-full rounded-2xl" playsInline muted />
            </div>
          )}
        </div>
      </div>

      {/* Hint */}
      <div className="pb-8 pt-4 text-center">
        <p className="text-primary-foreground/70 text-sm">
          {useFileMode
            ? "Posicione o código de barras no centro da foto"
            : "Aponte a câmera para o código de barras"}
        </p>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default BarcodeScanner;
