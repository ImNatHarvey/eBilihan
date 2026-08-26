export type StoreLocation = {
  regionCode: string;
  regionName: string;
  provinceCode: string;
  provinceName: string;
  cityCode: string;
  cityName: string;
  barangayCode: string;
  barangayName: string;
};

/**
 * Mirrors server/src/store/db.ts. Everything from `egovphUniqid` down to `address` comes
 * verbatim from the eGov SSO profile and is read-only in eBilihan — eGovPH owns those
 * fields. `storeName` and `location` are ours, and are empty until onboarding completes.
 */
export type StoreOwner = {
  id: string;
  egovphUniqid: string;
  email: string;
  mobile: string;
  fullName: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  birthDate: string;
  gender: string;
  photo: string;
  address: string;
  storeName: string;
  location: StoreLocation | null;
  createdAt: string;
};

export type PsgcItem = { code: string; name: string };

export type Product = {
  id: string;
  ownerId: string;
  name: string;
  type: string;
  thumbnail: string;
  boughtPrice: number;
  sellingPrice: number;
  quantity: number;
  barcode: string;
  lowStockThreshold: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * A line in the local cart. `name`/`unitPrice` are carried for display only — the server
 * re-reads both from the stored product when the order is created, so what is shown here
 * and what is recorded can never diverge in the client's favour.
 */
export type CartLine = OrderItem;

export type OrderItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

export type Order = {
  id: string;
  ownerId: string;
  items: OrderItem[];
  total: number;
  paymentMethod: "cash" | "gcash";
  paymentStatus: "pending" | "paid" | "voided";
  egovpayTransactionUuid?: string;
  chainTxId?: string;
  createdAt: string;
};

export type Loan = {
  id: string;
  ownerId: string;
  borrowerEgovphUniqid: string;
  borrowerName: string;
  borrowerPhilsysNumber: string;
  principal: number;
  balance: number;
  termsOfPaymentText: string;
  status: "active" | "paid" | "defaulted";
  createdAt: string;
};

/**
 * Verdict from eVerify, via POST /loans/verify-borrower[/personal].
 *
 * A match returns an opaque `verificationId` — the identity itself stays on the server.
 * `borrowerName` is for display only; sending it back would not create a loan under that
 * name, because loan creation reads the name from the server-held record.
 */
export type BorrowerVerification =
  | { matched: true; verificationId: string; borrowerName: string }
  | {
      matched: false;
      reason: string;
      /**
       * Status values from eVerify's response, returned on rejection only so a refusal can
       * be diagnosed from the Network tab without re-running the flow at a credit a time.
       * No personal data. See recordVerification in server/src/routes/loans.ts.
       */
      diagnostics?: {
        code: string | null;
        codeExpectedByDocs: string;
        codeAccepted: boolean;
        verified: boolean | null;
        resultGrade: string | null;
        hasName: boolean;
      };
    };

/**
 * Server-side decision on a standalone Face Liveness session. The 95.0 threshold is
 * applied on the server (routes/liveness.ts), not here — a client that only ever sees
 * `passed` has no raw score left to reinterpret.
 */
export type LivenessVerdict = {
  passed: boolean;
  status: string;
  confidenceScore: number;
  referenceImageUrl?: string;
  threshold: number;
  /** Present only on a pass — proof to attach to a high-value loan. */
  livenessToken?: string;
  reason?: string;
};

export type WalletSummary = {
  assets: number;
  liabilities: number;
  equity: number;
  cashCollected: number;
  outstandingLoans: number;
  loanCount: number;
  chainEntryCount: number;
  salesRevenueEstimate: number;
};
