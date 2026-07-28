import { useCallback, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import { useScannerStore } from "@/store/scannerStore";

/**
 * Native builds: @capacitor-mlkit/barcode-scanning (the maintained successor to the
 * deprecated @capacitor-community/barcode-scanner named in the original spec — see
 * CLAUDE.md > Deviations from the brief). ML Kit is native-only, so in a browser tab
 * this instead opens WebBarcodeScannerModal.tsx (getUserMedia + ZXing), rendered once
 * in AppShell.tsx — callers don't need to know or care which path ran.
 */
export function useBarcodeScanner() {
  const [isScanning, setIsScanning] = useState(false);
  const openWebScanner = useScannerStore((s) => s.open);

  const scanOnce = useCallback(async (): Promise<string | null> => {
    if (!Capacitor.isNativePlatform()) {
      setIsScanning(true);
      try {
        return await openWebScanner();
      } finally {
        setIsScanning(false);
      }
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
  }, [openWebScanner]);

  return { scanOnce, isScanning };
}
