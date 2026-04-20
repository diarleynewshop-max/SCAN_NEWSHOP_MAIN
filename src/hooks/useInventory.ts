import { useState, useCallback, useEffect, useRef } from "react";
import { Product, ListData, ListFlag } from "@/components/ProductCard";
import { useToast } from "@/hooks/use-toast";
import {
  createRuntimePhoto,
  revokeRuntimePhoto,
  stripPhotoForPersistence,
  shouldPersistPhoto,
} from "@/lib/photoUtils";

interface OpenListParams {
  title: string;
  person: string;
  flag: ListFlag;
  empresa: string;
}

interface AddProductParams {
  barcode: string;
  sku: string;
  photoBlob?: Blob | null;
  quantity: number;
  removeTag?: boolean;
  description?: string;
  importedFromSpreadsheet?: boolean;
  qtdPlanilha?: number;
}

const STORAGE_KEY = "scan_newshop_lists";

type SaveListsResult = "ok" | "without-photos" | "failed";

function stripPhotosFromLists(lists: ListData[]): ListData[] {
  return lists.map((list) => ({
    ...list,
    products: list.products.map((product) => stripPhotoForPersistence(product)),
  }));
}

function hasNonPersistablePhotos(lists: ListData[]): boolean {
  return lists.some((list) =>
    list.products.some((product) => Boolean(product.photo) && !shouldPersistPhoto(product))
  );
}

function saveLists(lists: ListData[]): SaveListsResult {
  const serializableLists = stripPhotosFromLists(lists);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializableLists));
    return hasNonPersistablePhotos(lists) ? "without-photos" : "ok";
  } catch (err) {
    console.error("Erro ao salvar listas:", err);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializableLists.map((list) => ({
      ...list,
      products: list.products.map((product) => ({
        ...product,
        photo: null,
      })),
    }))));
    return "without-photos";
  } catch (fallbackErr) {
    console.error("Erro ao salvar listas sem fotos:", fallbackErr);
    return "failed";
  }
}

function loadLists(): ListData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ListData[];
    return parsed.map((l) => ({
      ...l,
      flag: l.flag ?? "loja",
      empresa: l.empresa ?? "",
      createdAt: new Date(l.createdAt),
      closedAt: l.closedAt ? new Date(l.closedAt) : undefined,
      products: l.products.map((p) => ({
        ...p,
        photoBlob: null,
        createdAt: new Date(p.createdAt),
      })),
    }));
  } catch {
    return [];
  }
}

export function useInventory() {
  const { toast } = useToast();
  const [lists, setLists] = useState<ListData[]>(() => loadLists());
  const lastSaveResultRef = useRef<SaveListsResult>("ok");
  const listsRef = useRef<ListData[]>(lists);
  const [activeListId, setActiveListId] = useState<string | null>(() => {
    try {
      const savedId = localStorage.getItem("scan_newshop_active_list");
      if (!savedId) return null;
      const lists = loadLists();
      const exists = lists.find((l) => l.id === savedId && l.status === "open");
      return exists ? savedId : null;
    } catch {
      return null;
    }
  });

  const activeList = lists.find((l) => l.id === activeListId && l.status === "open") ?? null;

  useEffect(() => {
    listsRef.current = lists;
  }, [lists]);

  useEffect(() => {
    const saveResult = saveLists(lists);

    if (saveResult !== lastSaveResultRef.current) {
      if (saveResult === "without-photos") {
        toast({
          title: "Fotos removidas do armazenamento",
          description: "O app limpou as fotos locais para evitar travamento e perda total da lista.",
        });
      }

      if (saveResult === "failed") {
        toast({
          title: "Falha ao salvar localmente",
          description: "O app nao conseguiu persistir tudo no aparelho. Feche listas pesadas ou limpe fotos.",
          variant: "destructive",
        });
      }
    }

    lastSaveResultRef.current = saveResult;

    if (activeListId) {
      localStorage.setItem("scan_newshop_active_list", activeListId);
    } else {
      localStorage.removeItem("scan_newshop_active_list");
    }
  }, [lists, activeListId, toast]);

  useEffect(() => {
    return () => {
      listsRef.current.forEach((list) => {
        list.products.forEach((product) => revokeRuntimePhoto(product));
      });
    };
  }, []);

  const openList = useCallback(
    ({ title, person, flag, empresa }: OpenListParams): boolean => {
      if (!title.trim()) { toast({ title: "Informe a descrição", variant: "destructive" }); return false; }
      if (!person.trim()) { toast({ title: "Informe o nome", variant: "destructive" }); return false; }
      const newList: ListData = {
        id: crypto.randomUUID(),
        title: title.trim(),
        person: person.trim(),
        flag,
        empresa,
        products: [],
        createdAt: new Date(),
        status: "open",
      };
      setLists((prev) => [...prev, newList]);
      setActiveListId(newList.id);
      toast({ title: "Lista aberta!", description: `${newList.title} • ${newList.person} • ${flag.toUpperCase()}` });
      return true;
    },
    [toast]
  );

  const closeList = useCallback(() => {
    if (!activeListId) return;
    setLists((prev) =>
      prev.map((l) =>
        l.id === activeListId ? { ...l, status: "yellow" as const, closedAt: new Date() } : l
      )
    );
    setActiveListId(null);
    toast({ title: "Lista fechada!", description: "Disponível no histórico." });
  }, [activeListId, toast]);

  const addProduct = useCallback(
    (params: AddProductParams): boolean => {
      if (!activeList) { toast({ title: "Abra uma lista primeiro", variant: "destructive" }); return false; }
      if (!params.barcode.trim()) { toast({ title: "Preencha o código de barras", variant: "destructive" }); return false; }
      if (!params.quantity || params.quantity <= 0) { toast({ title: "Informe a quantidade", variant: "destructive" }); return false; }
      const barcode = params.barcode.trim();
      const quantity = params.quantity;
      let merged = false;

      setLists((prev) =>
        prev.map((l) => {
          if (l.id !== activeListId) return l;
          const existingIndex = l.products.findIndex((p) => p.barcode === barcode);
          if (existingIndex !== -1) {
            merged = true;
            const updatedProducts = [...l.products];
            const existing = updatedProducts[existingIndex];
            updatedProducts[existingIndex] = {
              ...existing,
              quantity: existing.quantity + quantity,
            };
            return { ...l, products: updatedProducts };
          }
          const runtimePhoto = params.photoBlob ? createRuntimePhoto(params.photoBlob) : null;
           const newProduct: Product = {
             id: crypto.randomUUID(),
             barcode,
             sku: params.sku.trim(),
             description: params.description?.trim() || undefined,
             photo: runtimePhoto?.photo ?? null,
             photoBlob: runtimePhoto?.photoBlob ?? null,
             quantity,
             removeTag: params.removeTag ?? false,
             createdAt: new Date(),
             importedFromSpreadsheet: params.importedFromSpreadsheet ?? false,
           };
          return { ...l, products: [...l.products, newProduct] };
        })
      );

      if (merged) {
        toast({ title: "Quantidade atualizada", description: barcode });
      } else {
        toast({ title: "Produto adicionado!", description: barcode });
      }
      return true;
    },
    [activeList, activeListId, toast]
  );

  const deleteProduct = useCallback((productId: string) => {
    if (!activeListId) return;
    setLists((prev) =>
      prev.map((l) => {
        if (l.id !== activeListId) return l;

        const product = l.products.find((p) => p.id === productId);
        if (product) {
          revokeRuntimePhoto(product);
        }

        return { ...l, products: l.products.filter((p) => p.id !== productId) };
      })
    );
  }, [activeListId]);

  const updateList = useCallback((updated: ListData) => {
    setLists((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }, []);

  const addProductsFromSpreadsheet = useCallback(
    (items: AddProductParams[]): boolean => {
      if (!activeList) { toast({ title: "Abra uma lista primeiro", variant: "destructive" }); return false; }
      if (items.length === 0) { toast({ title: "Nenhum item para importar", variant: "destructive" }); return false; }

      setLists((prev) =>
        prev.map((l) => {
          if (l.id !== activeListId) return l;
          const newProducts: Product[] = items.map((item) => ({
            id: crypto.randomUUID(),
            barcode: item.barcode.trim(),
            sku: item.sku?.trim() || "",
            description: item.description?.trim() || undefined,
            photo: null,
            photoBlob: null,
            quantity: 0,
            removeTag: false,
            createdAt: new Date(),
            importedFromSpreadsheet: true,
            qtdPlanilha: item.qtdPlanilha ?? 0,
          }));
          return { ...l, products: [...l.products, ...newProducts] };
        })
      );
      toast({ title: `${items.length} itens importados!`, description: "Preencha COD e QTD em cada item." });
      return true;
    },
    [activeList, activeListId, toast]
  );

  const updateProduct = useCallback((productId: string, updates: Partial<Product>) => {
    if (!activeListId) return;
    setLists((prev) =>
      prev.map((l) => {
        if (l.id !== activeListId) return l;
        return { ...l, products: l.products.map((p) => p.id === productId ? { ...p, ...updates } : p) };
      })
    );
  }, [activeListId]);

  const updateProductPhoto = useCallback((productId: string, photoBlob: Blob | null) => {
    if (!activeListId) return;

    setLists((prev) =>
      prev.map((list) => {
        if (list.id !== activeListId) return list;

        return {
          ...list,
          products: list.products.map((product) => {
            if (product.id !== productId) return product;

            revokeRuntimePhoto(product);

            if (!photoBlob) {
              return {
                ...product,
                photo: null,
                photoBlob: null,
              };
            }

            const runtimePhoto = createRuntimePhoto(photoBlob);
            return {
              ...product,
              photo: runtimePhoto.photo,
              photoBlob: runtimePhoto.photoBlob,
            };
          }),
        };
      })
    );
  }, [activeListId]);

  const moveProductToTop = useCallback((productId: string) => {
    if (!activeListId) return;
    setLists((prev) =>
      prev.map((l) => {
        if (l.id !== activeListId) return l;
        const productIndex = l.products.findIndex((p) => p.id === productId);
        if (productIndex <= 0) return l;
        const updatedProducts = [...l.products];
        const [product] = updatedProducts.splice(productIndex, 1);
        updatedProducts.unshift(product);
        return { ...l, products: updatedProducts };
      })
    );
  }, [activeListId]);

  const scrollToProduct = useCallback((productId: string) => {
    if (!activeListId) return;
    setLists((prev) => {
      const newLists = prev.map((l) => {
        if (l.id !== activeListId) return l;
        const productIndex = l.products.findIndex((p) => p.id === productId);
        if (productIndex <= 0) return l;
        const updatedProducts = [...l.products];
        const [product] = updatedProducts.splice(productIndex, 1);
        updatedProducts.unshift(product);
        return { ...l, products: updatedProducts };
      });
      setTimeout(() => window.scrollTo({ top: 0, behavior: "instant" }), 50);
      return newLists;
    });
  }, [activeListId]);

  return { lists, activeList, openList, closeList, addProduct, addProductsFromSpreadsheet, updateProduct, updateProductPhoto, deleteProduct, updateList, moveProductToTop, scrollToProduct };
}
