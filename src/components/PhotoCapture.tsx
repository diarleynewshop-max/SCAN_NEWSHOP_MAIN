import { useRef } from "react";
import { Camera, X } from "lucide-react";

interface PhotoCaptureProps {
  photo: string | null;
  onCapture: (photo: string) => void;
  onRemove: () => void;
}

const PhotoCapture = ({ photo, onCapture, onRemove }: PhotoCaptureProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => onCapture(reader.result as string);
      reader.readAsDataURL(file);
    }
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
    <>
      <button onClick={() => fileInputRef.current?.click()}
        style={{
          width: "100%", aspectRatio: "16/9", borderRadius: 10,
          border: "2px dashed hsl(var(--border))", background: "hsl(var(--secondary))",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 10, cursor: "pointer", transition: "all 0.18s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "hsl(var(--muted))"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "hsl(var(--secondary))"; }}
      >
        <div style={{ width: 48, height: 48, borderRadius: 14, background: "hsl(var(--primary) / 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Camera style={{ width: 22, height: 22, color: "hsl(var(--primary))" }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: "hsl(var(--muted-foreground))" }}>Tirar foto do produto</span>
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleCapture} style={{ display: "none" }} />
    </>
  );
};

export default PhotoCapture;

