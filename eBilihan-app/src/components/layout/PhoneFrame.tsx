import { createContext, useContext, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { cn } from "@/lib/utils";

/**
 * The DOM node Dialogs/Sheets should portal into (see components/ui/dialog.tsx).
 * Radix portals to document.body by default, which escapes the phone bezel entirely —
 * on a wide desktop window a `fixed inset-0` overlay covers the whole browser, and
 * `w-[92vw]` sizes off the real viewport, not the ~448px frame. Rendering the portal
 * inside this node instead keeps every modal visually inside the phone.
 */
const PhoneFrameContainerContext = createContext<HTMLElement | null>(null);
export function usePhoneFrameContainer() {
  return useContext(PhoneFrameContainerContext);
}

/**
 * Device frame. On a real phone/emulator this is a plain full-bleed container.
 * In a desktop browser it draws a phone bezel so the layout is reviewed at the
 * size it will actually ship at, instead of stretching to a 1440px window.
 * (Ported from the ebilihan-hackathon prototype's PhoneFrame.tsx.)
 */
export function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  // A ref *callback* (not a ref object) so we re-render with the real node the moment
  // it mounts — reading `ref.current` during render would still be null on first paint.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  if (Capacitor.isNativePlatform()) {
    return <div className={cn("flex h-dvh flex-col bg-brand-surface", className)}>{children}</div>;
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-900 p-0 md:p-4">
      <div
        ref={setContainer}
        className={cn(
          "relative flex h-dvh w-full max-w-md flex-col overflow-hidden bg-brand-surface",
          // `transform` (even a no-op one) makes this the containing block for any
          // `position: fixed` descendant — i.e. Dialog overlays/content — instead of
          // the browser viewport. Only needed for the md+ bezel; native/full-bleed
          // mode has no viewport-vs-frame mismatch to begin with.
          "border-0 md:h-[844px] md:rounded-[40px] md:border-8 md:border-neutral-800 md:shadow-2xl md:[transform:translateZ(0)]",
          className,
        )}
      >
        <PhoneFrameContainerContext.Provider value={container}>
          {children}
        </PhoneFrameContainerContext.Provider>
      </div>
    </div>
  );
}
