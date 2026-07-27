import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { listRegions, listProvinces, listCitiesMunicipalities, listBarangays } from "@/api/locations";
import type { PsgcItem, StoreLocation } from "@/types";

type LocationPickerProps = {
  value: StoreLocation | null;
  onChange: (location: StoreLocation | null) => void;
};

function Select({
  label,
  items,
  value,
  onChange,
  disabled,
}: {
  label: string;
  items: PsgcItem[];
  value: string;
  onChange: (item: PsgcItem | undefined) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        className="flex h-11 w-full rounded-lg border border-brand-ink/20 bg-white px-3 py-2 text-sm text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
        value={value}
        disabled={disabled || items.length === 0}
        onChange={(e) => onChange(items.find((i) => i.code === e.target.value))}
      >
        <option value="">{disabled ? "Select above first" : `Select ${label.toLowerCase()}`}</option>
        {items.map((item) => (
          <option key={item.code} value={item.code}>
            {item.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Cascading Region -> Province -> City/Municipality -> Barangay picker, backed by PSGC
 * Cloud (see src/api/locations.ts). Used on the registration "Location" step.
 */
export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const [region, setRegion] = useState<PsgcItem | null>(null);
  const [province, setProvince] = useState<PsgcItem | null>(null);
  const [city, setCity] = useState<PsgcItem | null>(null);

  const { data: regions = [] } = useQuery({ queryKey: ["psgc-regions"], queryFn: listRegions });
  const { data: provinces = [] } = useQuery({
    queryKey: ["psgc-provinces", region?.code],
    queryFn: () => listProvinces(region!.code),
    enabled: !!region,
  });
  const { data: cities = [] } = useQuery({
    queryKey: ["psgc-cities", province?.code],
    queryFn: () => listCitiesMunicipalities(province!.code),
    enabled: !!province,
  });
  const { data: barangays = [] } = useQuery({
    queryKey: ["psgc-barangays", city?.code],
    queryFn: () => listBarangays(city!.code),
    enabled: !!city,
  });

  function handleBarangayChange(barangay: PsgcItem | undefined) {
    if (!barangay || !region || !province || !city) {
      onChange(null);
      return;
    }
    onChange({
      regionCode: region.code,
      regionName: region.name,
      provinceCode: province.code,
      provinceName: province.name,
      cityCode: city.code,
      cityName: city.name,
      barangayCode: barangay.code,
      barangayName: barangay.name,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Select
        label="Region"
        items={regions}
        value={region?.code ?? ""}
        onChange={(item) => {
          setRegion(item ?? null);
          setProvince(null);
          setCity(null);
          onChange(null);
        }}
      />
      <Select
        label="Province"
        items={provinces}
        value={province?.code ?? ""}
        disabled={!region}
        onChange={(item) => {
          setProvince(item ?? null);
          setCity(null);
          onChange(null);
        }}
      />
      <Select
        label="City / Municipality"
        items={cities}
        value={city?.code ?? ""}
        disabled={!province}
        onChange={(item) => {
          setCity(item ?? null);
          onChange(null);
        }}
      />
      <Select
        label="Barangay"
        items={barangays}
        value={value?.barangayCode ?? ""}
        disabled={!city}
        onChange={handleBarangayChange}
      />
    </div>
  );
}
