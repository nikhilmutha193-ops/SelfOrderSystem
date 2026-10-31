import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useTableSession } from "../lib/useTableSession";
import {
  api,
  extractErrorMessage,
  setActiveAuth,
  storeToken,
} from "../shared/api/client";
import { Dialog } from "../shared/ui/Dialog";
import { Button, ErrorText, Input } from "../shared/ui/ui";

const ASKED_KEY = "selforder_token_prompt_done";

function alreadyAsked(): boolean {
  try {
    return sessionStorage.getItem(ASKED_KEY) === "1";
  } catch {
    return false;
  }
}

function markAsked() {
  try {
    sessionStorage.setItem(ASKED_KEY, "1");
  } catch {
    /* the popup may simply show again */
  }
}

/** Whether the admin allows following an order by token number (unset: cafe flow only). */
export function useTokenTrackAllowed(): boolean {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api
      .get<{
        serviceFlow?: string;
        tableLoginSettings?: { allowTokenLogin?: boolean };
      }>("/restaurant/public")
      .then((res) => {
        if (!cancelled)
          setAllowed(
            res.data.tableLoginSettings?.allowTokenLogin ??
              res.data.serviceFlow === "cafe",
          );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return allowed;
}

/**
 * Shown once after a guest signs in to a table, when the admin allows token tracking: the guest can enter the
 * token number on their receipt to follow that order, or skip it.
 */
export function TokenTrackDialog({
  forceOpen = false,
  onForceClose,
}: {
  forceOpen?: boolean;
  onForceClose?: () => void;
}) {
  const navigate = useNavigate();
  const { tableId, via, orderId } = useTableSession();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tableId || via === "token" || orderId || alreadyAsked()) return;
    let cancelled = false;
    api
      .get<{
        serviceFlow?: string;
        tableLoginSettings?: { allowTokenLogin?: boolean };
      }>("/restaurant/public")
      .then((res) => {
        const allowed =
          res.data.tableLoginSettings?.allowTokenLogin ??
          res.data.serviceFlow === "cafe";
        if (allowed && !cancelled) setOpen(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tableId, via, orderId]);

  function skip() {
    markAsked();
    setOpen(false);
    onForceClose?.();
  }

  async function track(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ token: string }>("/auth/table/token-link", {
        token: Number(token),
      });
      storeToken("table", res.data.token);
      setActiveAuth({ role: "table", token: res.data.token });
      markAsked();
      setOpen(false);
      onForceClose?.();
      navigate("/order/invoice");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open || forceOpen}
      onClose={skip}
      title="Have a token number?"
      description="Enter the token on your receipt to follow that order from your table. You can skip this."
      onSubmit={track}
      size="sm"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={skip}>
            Skip
          </Button>
          <Button type="submit" loading={busy} disabled={!token}>
            Track my order
          </Button>
        </>
      }
    >
      {error && <ErrorText>{error}</ErrorText>}
      <Input
        aria-label="Token number"
        inputMode="numeric"
        autoComplete="off"
        placeholder="e.g. 12"
        value={token}
        onChange={(e) =>
          setToken(e.target.value.replace(/\D/g, "").slice(0, 5))
        }
      />
    </Dialog>
  );
}
