import { useCallback, useState } from "react";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";

/**
 * Wraps @capacitor-mlkit/barcode-scanning (the maintained successor to the
 * deprecated @capacitor-community/barcode-scanner named in the original spec —
 * see CLAUDE.md > Deviations from the brief).
 */
export function useBarcodeScanner() {
  const [isScanning, setIsScanning] = useState(false);

  const scanOnce = useCallback(async (): Promise<string | null> => {
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
