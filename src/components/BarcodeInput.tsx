import { useRef } from "react";
import { ScanBarcode, Camera } from "lucide-react";

interface BarcodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onScanPress: () => void;
}

const BarcodeInput = ({ value, onChange, onScanPress }: BarcodeInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{ flex: 1, position: "relative" }}>
        <ScanBarcode style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 18, height: 18, color: "hsl(var(--primary))" }} />
        <input ref={inputRef} type="text" inputMode="numeric" placeholder="000000000000"
          value={value} onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%", height: 48, paddingLeft: 40, paddingRight: 14,
            borderRadius: 10, border: "1.5px solid hsl(var(--border))",
            background: "hsl(var(--secondary))", color: "hsl(var(--foreground))",
            fontFamily: "var(--font-mono)", fontSize: 14, outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>
      <button onClick={onScanPress}
        style={{
          height: 48, padding: "0 16px", borderRadius: 10,
          background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))",
          border: "none", display: "flex", alignItems: "center", gap: 6,
          fontSize: 13, fontWeight: 700, cursor: "pointer",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <Camera style={{ width: 16, height: 16 }} /> Scan
      </button>
    </div>
  );
};

export default BarcodeInput;

