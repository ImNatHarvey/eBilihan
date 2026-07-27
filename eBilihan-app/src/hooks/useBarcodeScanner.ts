import { useCallback, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";

/**
 * Wraps @capacitor-mlkit/barcode-scanning (the maintained successor to the
 * deprecated @capacitor-community/barcode-scanner named in the original spec —
 * see CLAUDE.md > Deviations from the brief).
 */
export function useBarcodeScanner() {
  const [isScanning, setIsScanning] = useState(false);

  const scanOnce = useCallback(async (): Promise<string | null> => {
    // ML Kit is a native Android/iOS library — there's no real web implementation, so
    // in a plain browser tab this plugin call fails with an opaque "Failed to fetch
    // dynamically imported module" error. Fail with a clear, actionable message
    // instead of letting that raw error surface; use "Select Product" while testing
    // in a browser, and build to a device/emulator to test real scanning.
    if (!Capacitor.isNativePlatform()) {
      throw new Error("Camera barcode scanning needs a native app build — use Select Product instead while testing in a browser.");
    }

    const { camera } = await BarcodeScanner.requestPermissions();
    if (camera !== "granted" && camera !== "limited") {
      throw new Error("Camera permission was denied");
    }

    setIsScanning(true);
    try {
      const { barcodes } = await BarcodeScanner.scan();
      return barcodes[0]?.rawValue ?? null;
    } finally {
      setIsScanning(false);
    }
  }, []);

  return { scanOnce, isScanning };
}
