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
    /** eVerify's embedded Face Liveness Web SDK — see src/lib/everifyFaceLiveness.ts. */
    eKYC?: () => {
      start: (options: { pubKey: string }) => Promise<EverifyLivenessResult>;
    };

    /** eGovPH's "Login as eGov" widget — see src/lib/egovLoginWidget.ts. */
    EgovLogin?: {
      render: (options: {
        target: string;
        partnerCode: string;
        host: string;
        partnerName?: string;
        onSuccess: (result: { exchangeCode: string }) => void;
        onError?: (error: unknown) => void;
      }) => void;
    };
  }
}
