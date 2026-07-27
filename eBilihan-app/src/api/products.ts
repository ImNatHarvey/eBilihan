import { api } from "./client";
import type { Product } from "@/types";

export async function listProducts() {
  const { data } = await api.get<{ data: Product[] }>("/products");
  return data.data;
}

export async function createProduct(input: Partial<Product>) {
  const { data } = await api.post<{ data: Product }>("/products", input);
  return data.data;
}

export async function updateProduct(id: string, input: Partial<Product>) {
  const { data } = await api.put<{ data: Product }>(`/products/${id}`, input);
  return data.data;
}

export async function deleteProduct(id: string) {
  await api.delete(`/products/${id}`);
}

export async function getProductByBarcode(barcode: string) {
  const { data } = await api.get<{ data: Product }>(`/products/by-barcode/${barcode}`);
  return data.data;
}
