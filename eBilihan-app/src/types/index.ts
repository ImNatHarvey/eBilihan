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

export type StoreOwner = {
  id: string;
  egovphUniqid: string;
  email: string;
  mobile: string;
  fullName: string;
  storeName: string;
  location: StoreLocation;
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

export type EgovphProfile = {
  uniqid: string;
  email: string;
  mobile: string;
  first_name: string;
  last_name: string;
  photo?: string;
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
