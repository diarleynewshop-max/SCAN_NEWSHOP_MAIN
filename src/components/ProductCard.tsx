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

export type ListFlag = "loja";

export interface ListData {
  id: string;
  title: string;
  person: string;
  empresa: string;  // "NEWSHOP" | "SOYE" | "FACIL ATACADO"
  products: Product[];
  createdAt: Date;
  closedAt?: Date;
  status: "open" | "yellow" | "green" | "red";
  flag: ListFlag; // "loja"
  sentToClickUp?: boolean; // true depois do primeiro envio bem-sucedido
}

interface ProductCardProps {
  product: Product;
  onDelete: (id: string) => void;
  modoDesktop?: boolean;
}

const ProductCard = ({ product, onDelete, modoDesktop = false }: ProductCardProps) => {
  return (
    <div style={{
      background: "#fff", 
      borderRadius: modoDesktop ? 14 : 12, 
      border: "1px solid hsl(var(--border))",
      padding: modoDesktop ? "16px 18px" : "12px 14px", 
      display: "flex", 
      gap: modoDesktop ? 16 : 12, 
      alignItems: "center",
      boxShadow: modoDesktop ? "var(--shadow-sm)" : "var(--shadow-xs)",
    }}>
      {product.photo ? (
        <img src={product.photo} alt="Produto" style={{ 
          width: modoDesktop ? 60 : 52, 
          height: modoDesktop ? 60 : 52, 
          borderRadius: modoDesktop ? 10 : 8, 
          objectFit: "cover", 
          flexShrink: 0 
        }} />
      ) : (
        <div style={{ 
          width: modoDesktop ? 60 : 52, 
          height: modoDesktop ? 60 : 52, 
          borderRadius: modoDesktop ? 10 : 8, 
          background: "hsl(var(--muted))", 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center", 
          flexShrink: 0 
        }}>
          <Package style={{ 
            width: modoDesktop ? 22 : 20, 
            height: modoDesktop ? 22 : 20, 
            color: "hsl(var(--muted-foreground))" 
          }} />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ 
          fontFamily: "var(--font-mono)", 
          fontSize: modoDesktop ? 13 : 12, 
          fontWeight: 500, 
          color: "hsl(var(--foreground))", 
          overflow: "hidden", 
          textOverflow: "ellipsis", 
          whiteSpace: "nowrap" 
        }}>
          {product.barcode}
        </p>
        <p style={{ 
          fontSize: modoDesktop ? 14 : 13, 
          fontWeight: 600, 
          color: "hsl(var(--foreground))", 
          marginTop: 2, 
          overflow: "hidden", 
          textOverflow: "ellipsis", 
          whiteSpace: modoDesktop ? "normal" : "nowrap",
          lineHeight: 1.4
        }}>
          {product.description || product.sku || "Produto sem descrição"}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <span style={{ 
            fontSize: modoDesktop ? 13 : 12, 
            fontWeight: 700, 
            color: "hsl(var(--primary))" 
          }}>
            Qtd: {product.quantity}
          </span>
          {product.removeTag && (
            <span style={{ 
              fontSize: modoDesktop ? 11 : 10, 
              fontWeight: 700, 
              color: "hsl(var(--destructive))", 
              background: "hsl(var(--destructive) / 0.1)", 
              padding: modoDesktop ? "3px 8px" : "2px 6px", 
              borderRadius: 4 
            }}>
              REMOVER TAG
            </span>
          )}
        </div>
      </div>

      <button onClick={() => onDelete(product.id)} style={{ 
        background: "none", 
        border: "none", 
        cursor: "pointer", 
        color: "hsl(var(--destructive))", 
        padding: 4, 
        display: "flex" 
      }}>
        <Trash2 style={{ width: modoDesktop ? 18 : 16, height: modoDesktop ? 18 : 16 }} />
      </button>
    </div>
  );
};

export default ProductCard;

