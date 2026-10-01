// Sepet: tek işletme kuralı. Fiyatlar yalnız gösterim içindir; sunucu siparişte yeniden hesaplar.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SubstitutionPreference } from "@kapinda/shared-contracts";

export interface CartLine {
  productId: string;
  name: string;
  unitPrice: number;
  unit: string;
  quantity: number;
  substitution: SubstitutionPreference;
  imagePath: string | null;
  maxQuantity: number | null;
}

export interface CartState {
  vendorId: string | null;
  vendorName: string | null;
  vendorSlug: string | null;
  lines: CartLine[];
}

interface CartApi extends CartState {
  subtotal: number;
  itemCount: number;
  /** Farklı işletmeden ekleme: "conflict" döner; onaydan sonra replaceVendor=true ile çağrılır. */
  add: (vendor: { id: string; name: string; slug: string }, line: Omit<CartLine, "quantity" | "substitution">, replaceVendor?: boolean) => "added" | "conflict";
  setQuantity: (productId: string, quantity: number) => void;
  setSubstitution: (productId: string, s: SubstitutionPreference) => void;
  remove: (productId: string) => void;
  clear: () => void;
  syncPrices: (prices: Record<string, { price: number; available: boolean; maxQuantity: number | null }>) => string[];
}

const KEY = "kapinda.cart.v1";
const EMPTY: CartState = { vendorId: null, vendorName: null, vendorSlug: null, lines: [] };
const CartContext = createContext<CartApi | null>(null);

function load(): CartState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as CartState;
    return Array.isArray(parsed.lines) ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>(load);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* depolama kullanılamıyor */
    }
  }, [state]);

  const add: CartApi["add"] = useCallback(
    (vendor, line, replaceVendor = false) => {
      if (state.vendorId && state.vendorId !== vendor.id && state.lines.length > 0 && !replaceVendor) return "conflict";
      setState((prev) => {
        const base = prev.vendorId === vendor.id ? prev : { vendorId: vendor.id, vendorName: vendor.name, vendorSlug: vendor.slug, lines: [] };
        const existing = base.lines.find((l) => l.productId === line.productId);
        const lines = existing
          ? base.lines.map((l) =>
              l.productId === line.productId ? { ...l, quantity: Math.min(l.quantity + 1, line.maxQuantity ?? 99, 99), unitPrice: line.unitPrice } : l,
            )
          : [...base.lines, { ...line, quantity: 1, substitution: "remove" as SubstitutionPreference }];
        return { ...base, vendorId: vendor.id, vendorName: vendor.name, vendorSlug: vendor.slug, lines };
      });
      return "added";
    },
    [state.vendorId, state.lines.length],
  );

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setState((prev) => {
      const lines = prev.lines
        .map((l) => (l.productId === productId ? { ...l, quantity: Math.max(0, Math.min(quantity, l.maxQuantity ?? 99, 99)) } : l))
        .filter((l) => l.quantity > 0);
      return lines.length ? { ...prev, lines } : EMPTY;
    });
  }, []);

  const setSubstitution = useCallback((productId: string, s: SubstitutionPreference) => {
    setState((prev) => ({ ...prev, lines: prev.lines.map((l) => (l.productId === productId ? { ...l, substitution: s } : l)) }));
  }, []);

  const remove = useCallback((productId: string) => setQuantity(productId, 0), [setQuantity]);
  const clear = useCallback(() => setState(EMPTY), []);

  const syncPrices: CartApi["syncPrices"] = useCallback((prices) => {
    const changed: string[] = [];
    setState((prev) => {
      const lines = prev.lines
        .filter((l) => {
          const p = prices[l.productId];
          if (!p || !p.available) {
            changed.push(l.name);
            return false;
          }
          return true;
        })
        .map((l) => {
          const p = prices[l.productId]!;
          const quantity = p.maxQuantity !== null ? Math.min(l.quantity, p.maxQuantity) : l.quantity;
          if (p.price !== l.unitPrice || quantity !== l.quantity) changed.push(l.name);
          return { ...l, unitPrice: p.price, maxQuantity: p.maxQuantity, quantity };
        })
        .filter((l) => l.quantity > 0);
      return lines.length ? { ...prev, lines } : EMPTY;
    });
    return changed;
  }, []);

  const value = useMemo<CartApi>(() => {
    const subtotal = Math.round(state.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0) * 100) / 100;
    const itemCount = state.lines.reduce((s, l) => s + l.quantity, 0);
    return { ...state, subtotal, itemCount, add, setQuantity, setSubstitution, remove, clear, syncPrices };
  }, [state, add, setQuantity, setSubstitution, remove, clear, syncPrices]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("CartProvider eksik");
  return ctx;
}
