import { useState, useEffect } from "react";
import { getProductPhoto } from "@/lib/clickupPhotosService";

interface UseProductPhotoReturn {
  url: string | null;
  loading: boolean;
  error: string | null;
}

export const useProductPhoto = (codigo: string): UseProductPhotoReturn => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchPhoto = async () => {
      if (!codigo) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const photoUrl = await getProductPhoto(codigo);
        
        if (isMounted) {
          setUrl(photoUrl);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error("❌ Erro no hook useProductPhoto:", err);
          setError(err.message || "Falha ao carregar foto");
          setLoading(false);
        }
      }
    };

    fetchPhoto();

    return () => {
      isMounted = false;
    };
  }, [codigo]);

  return { url, loading, error };
};