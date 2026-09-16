import { useEffect } from "react";
import { api } from "./apiClient";

interface PublicRestaurant {
  name: string;
  siteTitle?: string;
  faviconUrl?: string;
}

function setFavicon(href: string) {
  // Replace rather than add, or the browser keeps showing the bundled default.
  document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]').forEach((el) => el.remove());
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = href;
  document.head.appendChild(link);
}

/**
 * Applies the restaurant's browser-tab title and favicon. Runs once for the whole
 * app so every page - landing, ordering, admin - carries the same branding rather
 * than the build-time placeholder in index.html.
 */
export function useSiteBranding() {
  useEffect(() => {
    api
      .get<PublicRestaurant>("/restaurant/public")
      .then(({ data }) => {
        const title = data.siteTitle?.trim() || data.name;
        if (title) document.title = title;
        if (data.faviconUrl) setFavicon(data.faviconUrl);
      })
      .catch(() => {
        // Branding is cosmetic - a failure here must not block the app.
      });
  }, []);
}
