import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { listReportRegions, listReportProvinces, listReportMunicipalities, listReportBarangays } from "@/api/reports";
import type { PsgcItem } from "@/types";

export type ReportLocation = {
  regionCode: string;
  regionName: string;
  provinceCode: string;
  provinceName: string;
  municipalityCode: string;
  municipalityName: string;
  barangayCode: string;
  barangayName: string;
};

type Props = {
  value: ReportLocation | null;
  onChange: (location: ReportLocation | null) => void;
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
 * Region -> Province -> Municipality -> Barangay picker backed by eReport's OWN
 * dataset endpoints (server/src/routes/reports.ts `/datasets/*`) — a different code
 * system from PSGC Cloud (see components/shared/LocationPicker.tsx, used for
 * registration). Using the wrong one is exactly why report submission was failing
 * with "Region code does not exist" etc.
 */
export function ReportLocationPicker({ value, onChange }: Props) {
  const [region, setRegion] = useState<PsgcItem | null>(null);
  const [province, setProvince] = useState<PsgcItem | null>(null);
  const [municipality, setMunicipality] = useState<PsgcItem | null>(null);

  const { data: regions = [] } = useQuery({ queryKey: ["ereport-regions"], queryFn: listReportRegions });
  const { data: provinces = [] } = useQuery({
    queryKey: ["ereport-provinces", region?.code],
    queryFn: () => listReportProvinces(region!.code),
    enabled: !!region,
  });
  const { data: municipalities = [] } = useQuery({
    queryKey: ["ereport-municipalities", province?.code],
    queryFn: () => listReportMunicipalities(province!.code),
    enabled: !!province,
  });
  const { data: barangays = [] } = useQuery({
    queryKey: ["ereport-barangays", municipality?.code],
    queryFn: () => listReportBarangays(municipality!.code),
    enabled: !!municipality,
  });

  /** Barangay is optional — Region+Province+Municipality alone is enough to submit (see LocationPicker.tsx for the same reasoning). */
  function emitLocation(selectedMunicipality: PsgcItem | null, barangay?: PsgcItem) {
    if (!region || !province || !selectedMunicipality) {
      onChange(null);
      return;
    }
    onChange({
      regionCode: region.code,
      regionName: region.name,
      provinceCode: province.code,
      provinceName: province.name,
      municipalityCode: selectedMunicipality.code,
      municipalityName: selectedMunicipality.name,
      barangayCode: barangay?.code ?? "",
      barangayName: barangay?.name ?? "",
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
          setMunicipality(null);
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
          setMunicipality(null);
          onChange(null);
        }}
      />
      <Select
        label="Municipality / City"
        items={municipalities}
        value={municipality?.code ?? ""}
        disabled={!province}
        onChange={(item) => {
          setMunicipality(item ?? null);
          emitLocation(item ?? null);
        }}
      />
      <Select
        label="Barangay (optional)"
        items={barangays}
        value={value?.barangayCode ?? ""}
        disabled={!municipality}
        onChange={(barangay) => emitLocation(municipality, barangay)}
      />
    </div>
  );
}
