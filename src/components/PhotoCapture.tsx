import { Camera, X, Upload } from "lucide-react";

interface PhotoCaptureProps {
  photo: string | null;
  onCapture: (photo: string) => void;
  onRemove: () => void;
}

const PhotoCapture = ({ photo, onCapture, onRemove }: PhotoCaptureProps) => {
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => onCapture(reader.result as string);
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  if (photo) {
    return (
      <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", border: "1.5px solid hsl(var(--border))" }}>
        <img src={photo} alt="Produto" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <button onClick={onRemove}
          style={{ position: "absolute", top: 8, right: 8, background: "hsl(var(--destructive))", color: "#fff", border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "var(--shadow-sm)" }}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>
    );
  }

  return (
    <div style={{
      width: "100%", aspectRatio: "16/9", borderRadius: 10,
      border: "2px dashed hsl(var(--border))", background: "hsl(var(--secondary))",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 12, padding: "16px",
    }}>
      <p style={{ fontSize: 13, fontWeight: 500, color: "hsl(var(--muted-foreground))", marginBottom: 4 }}>
        Adicionar foto do produto
      </p>

      <div style={{ display: "flex", gap: 12, width: "100%" }}>

        {/* Tirar foto — label direto no input, único jeito confiável no Safari iOS */}
        <label style={{ flex: 1, display: "block", cursor: "pointer" }}>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            style={{ display: "none", position: "absolute", opacity: 0, pointerEvents: "none" }}
          />
          <span style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: 100, borderRadius: 10, gap: 8,
            background: "hsl(var(--primary) / 0.08)", border: "1.5px solid hsl(var(--primary) / 0.3)",
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "hsl(var(--primary) / 0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Camera style={{ width: 18, height: 18, color: "hsl(var(--primary))" }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "hsl(var(--primary))" }}>Tirar foto</span>
          </span>
        </label>

        {/* Galeria — label direto no input sem capture */}
        <label style={{ flex: 1, display: "block", cursor: "pointer" }}>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: "none", position: "absolute", opacity: 0, pointerEvents: "none" }}
          />
          <span style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: 100, borderRadius: 10, gap: 8,
            background: "hsl(var(--secondary))", border: "1.5px solid hsl(var(--border))",
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "hsl(var(--muted))", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Upload style={{ width: 18, height: 18, color: "hsl(var(--foreground))" }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "hsl(var(--foreground))" }}>Da galeria</span>
          </span>
        </label>

      </div>
    </div>
  );
};

export default PhotoCapture;