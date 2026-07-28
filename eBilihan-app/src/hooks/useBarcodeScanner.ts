import { useCallback, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { BarcodeScanner, BarcodeFormat } from "@capacitor-mlkit/barcode-scanning";
import { useScannerStore, type ScanKind } from "@/store/scannerStore";

const NATIVE_FORMATS: Record<ScanKind, BarcodeFormat[]> = {
  barcode: [BarcodeFormat.Ean13, BarcodeFormat.Ean8, BarcodeFormat.UpcA, BarcodeFormat.UpcE, BarcodeFormat.Code128, BarcodeFormat.Code39, BarcodeFormat.Code93, BarcodeFormat.Itf],
  qr: [BarcodeFormat.QrCode],
};

/**
 * Native builds: @capacitor-mlkit/barcode-scanning (the maintained successor to the
 * deprecated @capacitor-community/barcode-scanner named in the original spec — see
 * CLAUDE.md > Deviations from the brief). ML Kit is native-only, so in a browser tab
 * this instead opens WebBarcodeScannerModal.tsx (getUserMedia + ZXing), rendered once
 * in AppShell.tsx — callers don't need to know or care which path ran.
 *
 * `kind` restricts which code families are matched — "barcode" (retail EAN/UPC/CODE
 * formats) for products, "qr" for the eGovPH QR in the loan flow. Leaving this
 * unrestricted (matching every format ZXing/ML Kit know) measurably increases
 * misreads on a blurry/partial frame, which is why a scanned code could come back
 * different between two attempts of the same physical barcode.
 */
export function useBarcodeScanner() {
  const [isScanning, setIsScanning] = useState(false);
  const openWebScanner = useScannerStore((s) => s.open);

  const scanOnce = useCallback(
    async (kind: ScanKind = "barcode"): Promise<string | null> => {
      if (!Capacitor.isNativePlatform()) {
        setIsScanning(true);
        try {
          const value = await openWebScanner(kind);
          return value?.trim() || null;
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
        const { barcodes } = await BarcodeScanner.scan({ formats: NATIVE_FORMATS[kind] });
        return barcodes[0]?.rawValue?.trim() || null;
      } finally {
        setIsScanning(false);
      }
    },
    [openWebScanner],
  );

  return { scanOnce, isScanning };
}
