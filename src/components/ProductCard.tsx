import { Package, Trash2 } from "lucide-react";

export interface Product {
  id: string;
  barcode: string;
  sku: string;
  description?: string;
  photo: string | null;
  quantity: number;
  removeTag: boolean; // "Tira etiqueta?"
  createdAt: Date;
}

export interface ListData {
  id: string;
  title: string;
  person: string;
  products: Product[];
  createdAt: Date;
  closedAt?: Date;
  status: "open" | "yellow" | "green" | "red"; // open, not downloaded, downloaded, deleted
}

interface ProductCardProps {
  product: Product;
  onDelete: (id: string) => void;
}

const ProductCard = ({ product, onDelete }: ProductCardProps) => {
  return (
    <div className="bg-card rounded-xl border border-border p-3 flex gap-3 items-center shadow-sm">
      {product.photo ? (
        <img
          src={product.photo}
          alt="Produto"
          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
          <Package className="w-6 h-6 text-muted-foreground" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono text-muted-foreground truncate">
          {product.barcode}
        </p>
        {product.sku && (
          <p className="text-xs text-muted-foreground truncate">SKU: {product.sku}</p>
        )}
        <p className="text-lg font-bold text-foreground">
          Qtd: {product.quantity}
        </p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{product.removeTag ? "Tira etiqueta" : "Não tira"}</span>
        </div>
      </div>

      <button
        onClick={() => onDelete(product.id)}
        className="p-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
      >
        <Trash2 className="w-5 h-5" />
      </button>
    </div>
  );
};

export default ProductCard;
