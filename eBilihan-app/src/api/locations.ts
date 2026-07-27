import { api } from "./client";
import type { PsgcItem } from "@/types";

/** Proxied via our backend (server/src/routes/locations.ts) -> PSGC Cloud (public, no auth). */
export async function listRegions() {
  const { data } = await api.get<PsgcItem[]>("/locations/regions");
  return data;
}

export async function listProvinces(regionCode: string) {
  const { data } = await api.get<PsgcItem[]>(`/locations/regions/${regionCode}/provinces`);
  return data;
}

export async function listCitiesMunicipalities(provinceCode: string) {
  const { data } = await api.get<PsgcItem[]>(`/locations/provinces/${provinceCode}/cities-municipalities`);
  return data;
}

export async function listBarangays(cityCode: string) {
  const { data } = await api.get<PsgcItem[]>(`/locations/cities-municipalities/${cityCode}/barangays`);
  return data;
}
