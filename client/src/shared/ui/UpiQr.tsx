import QRCode from "qrcode";
import { useEffect, useState } from "react";

function upiLink(vpa: string, payee: string, amount: number, note: string): string {
  const params = new URLSearchParams({ pa: vpa, pn: payee, am: amount.toFixed(2), cu: "INR", tn: note });
  return `upi://pay?${params.toString()}`;
}

export default function UpiQr({
  vpa,
  payee,
  amount,
  note,
}: {
  vpa: string;
  payee: string;
  amount: number;
  note: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(upiLink(vpa, payee, amount, note), { margin: 1, width: 220 })
      .then((url) => active && setSrc(url))
      .catch(() => active && setSrc(null));
    return () => {
      active = false;
    };
  }, [vpa, payee, amount, note]);
  if (!src) return null;
  return (
    <div className="flex flex-col items-center gap-1">
      <img src={src} alt={`UPI QR code to pay ₹${amount.toFixed(2)}`} className="h-44 w-44" />
      <p className="text-xs text-slate-500">
        Scan with any UPI app to pay ₹{amount.toFixed(2)} to {vpa}
      </p>
    </div>
  );
}
