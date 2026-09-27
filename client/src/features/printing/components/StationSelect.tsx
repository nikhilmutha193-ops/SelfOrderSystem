import { Field, Select } from "../../../shared/ui/ui";
import { useStationList } from "../queries";

export function StationSelect({
  id,
  label,
  value,
  onChange,
  emptyLabel,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (stationId: string) => void;
  emptyLabel: string;
}) {
  const stations = useStationList();
  if (stations.length === 0) return null;
  return (
    <Field label={label} htmlFor={id}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{emptyLabel}</option>
        {stations.map((station) => (
          <option key={station._id} value={station._id}>
            {station.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
