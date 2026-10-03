import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";

import { extractErrorMessage } from "../api/client";
import { downloadExcel, excelFileName, type AnySheet } from "../export/excel";
import { Button, ErrorText } from "./ui";

export function ExcelButton({
  fileName,
  sheets,
  label = "Excel",
  size = "md",
  disabled,
}: {
  fileName: string;
  sheets: () => AnySheet[] | Promise<AnySheet[]>;
  label?: string;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        variant="secondary"
        size={size}
        icon={FileSpreadsheet}
        loading={busy}
        disabled={disabled || busy}
        onClick={async () => {
          setError(null);
          setBusy(true);
          try {
            await downloadExcel(excelFileName(fileName), await sheets());
          } catch (err) {
            setError(extractErrorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {label}
      </Button>
      <ErrorText>{error}</ErrorText>
    </span>
  );
}
