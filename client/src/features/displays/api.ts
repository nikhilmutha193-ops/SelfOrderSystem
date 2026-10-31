import { api } from "../../shared/api/client";

export type DisplayTransition = "fade" | "slide" | "zoom";
export type DisplayFit = "cover" | "contain";

export interface DisplaySlide {
  url: string;
  caption?: string;
  /** Seconds this image stays up; the display's own interval applies when it is not set. */
  seconds?: number;
}

export interface Display {
  _id: string;
  name: string;
  code: string;
  active: boolean;
  slides: DisplaySlide[];
  intervalSeconds: number;
  transition: DisplayTransition;
  fit: DisplayFit;
  showCaptions: boolean;
}

export type DisplayInput = Partial<Omit<Display, "_id" | "code">> & {
  name: string;
};

/** What a screen receives for its code: images and settings only. */
export interface PublicDisplay {
  name: string;
  intervalSeconds: number;
  transition: DisplayTransition;
  fit: DisplayFit;
  showCaptions: boolean;
  updatedAt: string;
  slides: { url: string; caption: string; seconds: number }[];
}

export const displaysApi = {
  list: () => api.get<Display[]>("/displays").then((r) => r.data),
  create: (input: DisplayInput) =>
    api.post<Display>("/displays", input).then((r) => r.data),
  update: (id: string, input: Partial<DisplayInput>) =>
    api.put<Display>(`/displays/${id}`, input).then((r) => r.data),
  renew: (id: string) =>
    api.post<Display>(`/displays/${id}/renew`).then((r) => r.data),
  remove: (id: string) => api.delete(`/displays/${id}`).then((r) => r.data),
  publicView: (code: string) =>
    api.get<PublicDisplay>(`/displays/public/${code}`).then((r) => r.data),
};

/** The address a screen is opened with. */
export const displayUrl = (code: string) =>
  `${window.location.origin}/display/${code}`;
