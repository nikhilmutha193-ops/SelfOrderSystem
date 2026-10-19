import { useEffect, useState } from "react";

import { api } from "../shared/api/client";
import type { GuestAccess, RequiredDetails, TableLoginSettings } from "./types";
import { useTableSession } from "./useTableSession";

const FULL_ACCESS: GuestAccess = { placeOrder: true, showMenu: true, showFeedback: true };
export const DEFAULT_REQUIRED: RequiredDetails = { name: true, phone: false, members: true, birthday: false };

/** What the admin allows this table guest to do, depending on whether they signed in by QR or by code. */
export function useGuestAccess(): GuestAccess & { required: RequiredDetails } {
  const { via } = useTableSession();
  const [access, setAccess] = useState<GuestAccess>(FULL_ACCESS);
  const [required, setRequired] = useState<RequiredDetails>(DEFAULT_REQUIRED);

  useEffect(() => {
    api
      .get<{ tableLoginSettings?: TableLoginSettings }>("/restaurant/public")
      .then((res) => {
        const settings = res.data.tableLoginSettings;
        setRequired(settings?.requiredDetails ?? DEFAULT_REQUIRED);
        setAccess((via === "code" ? settings?.manual : settings?.qr) ?? FULL_ACCESS);
      })
      .catch(() => {
        /* best effort - the server still refuses orders that aren't allowed */
      });
  }, [via]);

  return { ...access, required };
}
