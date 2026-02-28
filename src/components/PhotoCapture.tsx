import { useState, useRef } from "react";
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
      reader.onloadend = () => {
        onCapture(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  if (photo) {
    return (
      <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border">
        <img src={photo} alt="Produto" className="w-full h-full object-cover" />
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1.5 shadow-lg"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full aspect-video rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/50 flex flex-col items-center justify-center gap-3 transition-colors active:bg-muted"
      >
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Camera className="w-7 h-7 text-primary" />
        </div>
        <span className="text-sm font-medium text-muted-foreground">Tirar foto do produto</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="hidden"
      />
    </>
  );
};

export default PhotoCapture;
