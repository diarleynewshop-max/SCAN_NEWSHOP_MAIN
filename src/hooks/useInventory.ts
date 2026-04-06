import { useState, useCallback, useEffect } from "react";
import { Product, ListData, ListFlag } from "@/components/ProductCard";
import { useToast } from "@/hooks/use-toast";

interface OpenListParams {
  title: string;
  person: string;
  flag: ListFlag;
  empresa: string;
}

interface AddProductParams {
  barcode: string;
  sku: string;
  photo: string | null;
  quantity: number;
  removeTag?: boolean;
}

const STORAGE_KEY = "scan_newshop_lists";

function saveLists(lists: ListData[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
  } catch {}
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
    saveLists(lists);
    if (activeListId) {
      localStorage.setItem("scan_newshop_active_list", activeListId);
    } else {
      localStorage.removeItem("scan_newshop_active_list");
    }
  }, [lists, activeListId]);

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
           const newProduct: Product = {
             id: crypto.randomUUID(),
             barcode,
             sku: params.sku.trim(),
             photo: params.photo,
             quantity,
             removeTag: params.removeTag ?? false,
             createdAt: new Date(),
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
      prev.map((l) =>
        l.id === activeListId
          ? { ...l, products: l.products.filter((p) => p.id !== productId) }
          : l
      )
    );
  }, [activeListId]);

  const updateList = useCallback((updated: ListData) => {
    setLists((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }, []);

  return { lists, activeList, openList, closeList, addProduct, deleteProduct, updateList };
}