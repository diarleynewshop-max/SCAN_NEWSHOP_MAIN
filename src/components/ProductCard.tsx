import { Package, Trash2 } from "lucide-react";

export interface Product {
  id: string;
  barcode: string;
  sku: string;
  description?: string;
  photo: string | null;
  quantity: number;
  removeTag: boolean;
  createdAt: Date;
}

export interface ListData {
  id: string;
  title: string;
  person: string;
  products: Product[];
  createdAt: Date;
  closedAt?: Date;
  status: "open" | "yellow" | "green" | "red";
}

interface ProductCardProps {
  product: Product;
  onDelete: (id: string) => void;
}

const ProductCard = ({ product, onDelete }: ProductCardProps) => {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, border: "1px solid hsl(var(--border))",
      padding: "12px 14px", display: "flex", gap: 12, alignItems: "center",
      boxShadow: "var(--shadow-xs)",
    }}>
      {product.photo ? (
        <img src={product.photo} alt="Produto" style={{ width: 52, height: 52, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
      ) : (
        <div style={{ width: 52, height: 52, borderRadius: 8, background: "hsl(var(--muted))", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Package style={{ width: 20, height: 20, color: "hsl(var(--muted-foreground))" }} />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: "hsl(var(--foreground))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {product.barcode}
        </p>
        {product.sku && (
          <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 1 }}>SKU: {product.sku}</p>
        )}
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 2 }}>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 900, color: "hsl(var(--foreground))" }}>{product.quantity}</span>
          <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>unid. · {product.removeTag ? "Tira etiqueta" : "Não tira"}</span>
        </div>
      </div>

      <button onClick={() => onDelete(product.id)}
        style={{ padding: 8, borderRadius: 8, background: "transparent", border: "none", cursor: "pointer", color: "hsl(var(--destructive))", display: "flex" }}
      >
        <Trash2 style={{ width: 18, height: 18 }} />
      </button>
    </div>
  );
};

export default ProductCard;

