import { ImageIcon } from "lucide-react";
import { useProductPhoto } from "@/hooks/useProductPhoto";

interface ProductImageProps {
  codigo: string;
  sku?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  fallback?: React.ReactNode;
}

export const ProductImage = ({ 
  codigo, 
  sku = "",
  className = "", 
  size = "md", 
  fallback 
}: ProductImageProps) => {
  const { url, loading, error } = useProductPhoto(codigo);
  
  const sizeClasses = {
    sm: "w-12 h-12",
    md: "w-16 h-16", 
    lg: "w-24 h-24"
  };

  const defaultFallback = (
    <div className={`${sizeClasses[size]} bg-gray-100 rounded flex items-center justify-center ${className}`}>
      <ImageIcon className="w-6 h-6 text-gray-400" />
    </div>
  );

  if (loading) {
    return (
      <div className={`${sizeClasses[size]} bg-gray-100 rounded animate-pulse ${className}`}>
        <div className="w-full h-full bg-gray-200 rounded" />
      </div>
    );
  }

  if (error || !url) {
    return fallback || defaultFallback;
  }

  return (
    <img
      src={url}
      alt={`Imagem do produto ${codigo}`}
      className={`${sizeClasses[size]} object-cover rounded ${className}`}
      loading="lazy"
      onError={(e) => {
        // Fallback em caso de erro de carga da imagem
        e.currentTarget.style.display = 'none';
      }}
    />
  );
};