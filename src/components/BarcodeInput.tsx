import { useState, useRef } from "react";
import { ScanBarcode, Camera } from "lucide-react";

interface BarcodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onScanPress: () => void;
}

const BarcodeInput = ({ value, onChange, onScanPress }: BarcodeInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-primary">
          <ScanBarcode className="w-5 h-5" />
        </div>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          placeholder="Código de barras"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-12 pl-11 pr-4 rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground font-mono text-base focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
        />
      </div>
      <button
        onClick={onScanPress}
        className="h-12 px-4 rounded-xl bg-primary text-primary-foreground flex items-center justify-center gap-2 font-semibold text-sm active:scale-95 transition-transform"
      >
        <Camera className="w-5 h-5" />
        Scan
      </button>
    </div>
  );
};

export default BarcodeInput;
