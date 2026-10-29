import { useEffect } from "react";

import { api } from "../shared/api/client";
import { applyBrandColor } from "../shared/brand";

interface PublicRestaurant {
  name: string;
  siteTitle?: string;
  faviconUrl?: string;
  brandColor?: string;
}

function setFavicon(href: string) {
  // Replace rather than add, or the browser keeps showing the bundled default.
  document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]').forEach((el) => el.remove());
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = href;
  document.head.appendChild(link);
}

export function useSiteBranding() {
  useEffect(() => {
    api
      .get<PublicRestaurant>("/restaurant/public")
      .then(({ data }) => {
        const title = data.siteTitle?.trim() || data.name;
        if (title) document.title = title;
        if (data.faviconUrl) setFavicon(data.faviconUrl);
        applyBrandColor(data.brandColor);
      })
      .catch(() => {
        // Branding is cosmetic - a failure here must not block the app.
      });
  }, []);
}
