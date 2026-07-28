import { create } from "zustand";

type FaceCaptureState = {
  isOpen: boolean;
  resolve: ((photoDataUrl: string | null) => void) | null;
  /** Opens the front-camera capture overlay (FaceLivenessCaptureModal.tsx); resolves with a captured photo, or null if cancelled. */
  open: () => Promise<string | null>;
  /** Called by the modal itself — not meant to be called from feature code. */
  close: (photoDataUrl: string | null) => void;
};

export const useFaceCaptureStore = create<FaceCaptureState>((set, get) => ({
  isOpen: false,
  resolve: null,
  open: () =>
    new Promise<string | null>((resolve) => {
      set({ isOpen: true, resolve });
    }),
  close: (photoDataUrl) => {
    get().resolve?.(photoDataUrl);
    set({ isOpen: false, resolve: null });
  },
}));
