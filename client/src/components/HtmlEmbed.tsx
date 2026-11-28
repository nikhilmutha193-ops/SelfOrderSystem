import { useEffect, useRef } from "react";

/** Copies an element so a <script> in it runs (scripts made from HTML text never run on their own). */
function live(node: Node): Node {
  if (node instanceof HTMLScriptElement) {
    const script = document.createElement("script");
    for (const attr of Array.from(node.attributes)) script.setAttribute(attr.name, attr.value);
    script.text = node.text;
    return script;
  }
  return node.cloneNode(true);
}

function parse(html: string): Node[] {
  const template = document.createElement("template");
  template.innerHTML = html;
  return Array.from(template.content.childNodes).map(live);
}

/**
 * Puts HTML the owner pasted in Landing page settings (a Google Map, a booking widget, a social feed ...) on the page.
 * Only the owner can write it, so scripts in it are allowed to run.
 */
export function HtmlEmbed({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    box.replaceChildren(...parse(html));
    return () => box.replaceChildren();
  }, [html]);
  return <div ref={ref} className={className} />;
}

/** Puts pasted HTML (analytics, site verification, meta tags) into the document head while the page is open. */
export function useHeadEmbeds(codes: string[]) {
  const key = codes.join("\u0000");
  useEffect(() => {
    const added: Node[] = [];
    for (const code of key ? key.split("\u0000") : []) {
      for (const node of parse(code)) {
        document.head.appendChild(node);
        added.push(node);
      }
    }
    return () => added.forEach((node) => node.parentNode?.removeChild(node));
  }, [key]);
}

function setTag(selector: string, create: () => HTMLElement, content: string) {
  let el = document.head.querySelector<HTMLElement>(selector);
  const made = !el;
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  const previous = el.getAttribute("content");
  el.setAttribute("content", content);
  return () => {
    if (made) el?.remove();
    else if (previous !== null) el?.setAttribute("content", previous);
  };
}

function metaTag(attr: "name" | "property", key: string, content: string) {
  return setTag(
    `meta[${attr}="${key}"]`,
    () => {
      const el = document.createElement("meta");
      el.setAttribute(attr, key);
      return el;
    },
    content
  );
}

/** The title, description and keywords Google and social apps read, plus Restaurant data for rich results. */
export function useSearchTags(seo: {
  title?: string;
  description?: string;
  keywords?: string;
  imageUrl?: string;
  structuredData?: boolean;
} | undefined, restaurant: { name: string; address?: string; phone?: string; logoUrl?: string } | undefined) {
  const { title = "", description = "", keywords = "", imageUrl = "", structuredData = true } = seo ?? {};
  const name = restaurant?.name ?? "";
  const address = restaurant?.address ?? "";
  const phone = restaurant?.phone ?? "";
  const logo = restaurant?.logoUrl ?? "";
  useEffect(() => {
    const undo: (() => void)[] = [];
    const oldTitle = document.title;
    if (title) {
      document.title = title;
      undo.push(() => (document.title = oldTitle));
      undo.push(metaTag("property", "og:title", title));
    }
    if (description) {
      undo.push(metaTag("name", "description", description));
      undo.push(metaTag("property", "og:description", description));
    }
    if (keywords) undo.push(metaTag("name", "keywords", keywords));
    if (imageUrl) undo.push(metaTag("property", "og:image", new URL(imageUrl, window.location.origin).href));
    if (title || description) undo.push(metaTag("property", "og:type", "restaurant"));
    // The server already puts this into the page's first HTML; add it only when it is missing.
    if (structuredData && name && !document.head.querySelector('script[type="application/ld+json"]')) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.text = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Restaurant",
        name: name.replace(/\s+/g, " "),
        url: window.location.origin,
        ...(description && { description }),
        ...(keywords && { keywords }),
        ...(address && { address }),
        ...(phone && { telephone: phone }),
        ...((imageUrl || logo) && { image: new URL(imageUrl || logo, window.location.origin).href }),
      });
      document.head.appendChild(script);
      undo.push(() => script.remove());
    }
    return () => undo.reverse().forEach((fn) => fn());
  }, [title, description, keywords, imageUrl, structuredData, name, address, phone, logo]);
}
