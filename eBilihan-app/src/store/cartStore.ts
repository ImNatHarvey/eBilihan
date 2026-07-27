import { create } from "zustand";
import type { OrderItem, Product } from "@/types";

type CartState = {
  items: OrderItem[];
  addProduct: (product: Product, quantity?: number) => void;
  removeItem: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
  total: () => number;
};

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addProduct: (product, quantity = 1) =>
    set((state) => {
      const existing = state.items.find((i) => i.productId === product.id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.productId === product.id ? { ...i, quantity: i.quantity + quantity } : i,
          ),
        };
      }
      return {
        items: [...state.items, { productId: product.id, name: product.name, quantity, unitPrice: product.sellingPrice }],
      };
    }),

  removeItem: (productId) => set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),

  setQuantity: (productId, quantity) =>
    set((state) => ({
      items: quantity <= 0
        ? state.items.filter((i) => i.productId !== productId)
        : state.items.map((i) => (i.productId === productId ? { ...i, quantity } : i)),
    })),

  clear: () => set({ items: [] }),

  total: () => get().items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
}));
