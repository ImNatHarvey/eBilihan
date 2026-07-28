import { create } from "zustand";

/** Which family of codes to expect — restricting this materially improves scan
 * reliability (an unrestricted multi-format scan can misdetect noise as a random
 * 2D/1D code on a blurry frame). "barcode" = retail 1D formats, "qr" = QR only. */
export type ScanKind = "barcode" | "qr";

type ScannerState = {
  isOpen: boolean;
  kind: ScanKind;
  resolve: ((value: string | null) => void) | null;
  /** Opens the full-screen web camera scanner (see WebBarcodeScannerModal.tsx) and resolves once a code is found or the user cancels. */
  open: (kind: ScanKind) => Promise<string | null>;
  /** Called by the modal itself on success/cancel — not meant to be called from feature code. */
  close: (value: string | null) => void;
};

export const useScannerStore = create<ScannerState>((set, get) => ({
  isOpen: false,
  kind: "barcode",
  resolve: null,
  open: (kind) =>
    new Promise<string | null>((resolve) => {
      set({ isOpen: true, kind, resolve });
    }),
  close: (value) => {
    get().resolve?.(value);
    set({ isOpen: false, resolve: null });
  },
}));
