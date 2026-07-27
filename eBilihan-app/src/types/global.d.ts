export {};

declare global {
  interface EverifyLivenessResult {
    status: string;
    result: {
      photo: string;
      session_id: string;
      photo_url: string;
    };
  }

  interface Window {
    eKYC?: () => {
      start: (options: { pubKey: string }) => Promise<EverifyLivenessResult>;
    };
  }
}
