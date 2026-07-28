import { create } from "zustand";

type ScannerState = {
  isOpen: boolean;
  resolve: ((value: string | null) => void) | null;
  /** Opens the full-screen web camera scanner (see WebBarcodeScannerModal.tsx) and resolves once a code is found or the user cancels. */
  open: () => Promise<string | null>;
  /** Called by the modal itself on success/cancel — not meant to be called from feature code. */
  close: (value: string | null) => void;
};

export const useScannerStore = create<ScannerState>((set, get) => ({
  isOpen: false,
  resolve: null,
  open: () =>
    new Promise<string | null>((resolve) => {
      set({ isOpen: true, resolve });
    }),
  close: (value) => {
    get().resolve?.(value);
    set({ isOpen: false, resolve: null });
  },
}));
