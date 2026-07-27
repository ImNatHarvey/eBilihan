import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ph.gov.egov.ebilihan",
  appName: "eBilihan",
  webDir: "dist",
  plugins: {
    BarcodeScanning: {
      // ML Kit ships as a Google Play Services module on Android; installing it can be
      // triggered eagerly on first app open instead of on first scan if desired.
    },
  },
};

export default config;
