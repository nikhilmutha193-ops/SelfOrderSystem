import { Schema, model, Types } from "mongoose";

/**
 * Editable copy for the public landing page - one document per restaurant.
 * Kept separate from Restaurant so the marketing copy can grow without
 * bloating the record every order lookup already loads.
 */
export interface ILandingLink {
  label: string;
  url: string;
}

export interface ILandingContent {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;

  hero: {
    eyebrow: string;
    headline: string;
    subtitle: string;
    showEyebrow: boolean;
    showHeadline: boolean;
    showSubtitle: boolean;
    primaryLabel: string;
    secondaryLabel: string;
    /** Blank means "use the design's own colour". */
    eyebrowColor: string;
    headlineColor: string;
    subtitleColor: string;
    /** Per-slide artwork. A portrait `mobileUrl` avoids cropping on phones. */
    slides: { desktopUrl: string; mobileUrl: string }[];
    /** "" keeps the design's own default for that tier (centered on phones,
     *  left on tablet/desktop) - each screen size is set independently. */
    textAlignMobile: "" | "left" | "center" | "right";
    textAlignDesktop: "" | "left" | "center" | "right";
    /** "" keeps the design's own default (bottom on phones, centered from
     *  tablet up) - set independently per screen size, like the horizontal one. */
    verticalAlignMobile: "" | "top" | "center" | "bottom";
    verticalAlignDesktop: "" | "top" | "center" | "bottom";
  };

  serve: {
    enabled: boolean;
    title: string;
    lead: string;
    hint: string;
    items: { title: string; text: string; imageUrl: string }[];
  };

  menu: {
    enabled: boolean;
    eyebrow: string;
    title: string;
    lead: string;
    ctaLabel: string;
  };

  story: {
    enabled: boolean;
    eyebrow: string;
    title: string;
    text: string;
    quote: string;
    quoteCite: string;
    imageUrl: string;
    caption: string;
  };

  outlets: {
    enabled: boolean;
    eyebrow: string;
    title: string;
    items: {
      city: string;
      area: string;
      address: string;
      hours: string;
      mapUrl: string;
      comingSoon: boolean;
    }[];
  };

  reels: {
    enabled: boolean;
    title: string;
    lead: string;
    followUrl: string;
    followLabel: string;
    items: { caption: string; url: string; imageUrl: string }[];
  };

  partnership: {
    enabled: boolean;
    title: string;
    text: string;
    ctaLabel: string;
    ctaUrl: string;
  };

  footer: {
    tagline: string;
    contacts: ILandingLink[];
    socials: ILandingLink[];
  };

  createdAt: Date;
  updatedAt: Date;
}

const linkSchema = new Schema<ILandingLink>({ label: String, url: String }, { _id: false });

const landingContentSchema = new Schema<ILandingContent>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, unique: true, index: true },

    hero: {
      eyebrow: { type: String, default: "Authentic South Indian Cafe" },
      headline: { type: String, default: "Taste of Bengaluru" },
      subtitle: { type: String, default: "" },
      showEyebrow: { type: Boolean, default: true },
      showHeadline: { type: Boolean, default: true },
      showSubtitle: { type: Boolean, default: true },
      primaryLabel: { type: String, default: "Order Now" },
      secondaryLabel: { type: String, default: "Explore Menu" },
      eyebrowColor: { type: String, default: "" },
      headlineColor: { type: String, default: "" },
      subtitleColor: { type: String, default: "" },
      slides: {
        type: [new Schema({ desktopUrl: String, mobileUrl: String }, { _id: false })],
        default: [],
      },
      textAlignMobile: { type: String, enum: ["", "left", "center", "right"], default: "" },
      textAlignDesktop: { type: String, enum: ["", "left", "center", "right"], default: "" },
      verticalAlignMobile: { type: String, enum: ["", "top", "center", "bottom"], default: "" },
      verticalAlignDesktop: { type: String, enum: ["", "top", "center", "bottom"], default: "" },
    },

    serve: {
      enabled: { type: Boolean, default: true },
      title: { type: String, default: "What We Serve" },
      lead: { type: String, default: "" },
      hint: { type: String, default: "Tap a dish to know more" },
      items: {
        type: [new Schema({ title: String, text: String, imageUrl: String }, { _id: false })],
        default: [],
      },
    },

    menu: {
      enabled: { type: Boolean, default: true },
      eyebrow: { type: String, default: "Menu Highlights" },
      title: { type: String, default: "Crowd favourites" },
      lead: { type: String, default: "A taste of what keeps our regulars coming back." },
      ctaLabel: { type: String, default: "See the full menu" },
    },

    story: {
      enabled: { type: Boolean, default: true },
      eyebrow: { type: String, default: "Our Story" },
      title: { type: String, default: "" },
      text: { type: String, default: "" },
      quote: { type: String, default: "" },
      quoteCite: { type: String, default: "" },
      imageUrl: { type: String, default: "" },
      caption: { type: String, default: "" },
    },

    outlets: {
      enabled: { type: Boolean, default: true },
      eyebrow: { type: String, default: "Visit Us" },
      title: { type: String, default: "Find us" },
      items: {
        type: [
          new Schema(
            {
              city: String,
              area: String,
              address: String,
              hours: String,
              mapUrl: String,
              comingSoon: { type: Boolean, default: false },
            },
            { _id: false },
          ),
        ],
        default: [],
      },
    },

    reels: {
      enabled: { type: Boolean, default: false },
      title: { type: String, default: "Catch Our Reels" },
      lead: { type: String, default: "" },
      followUrl: { type: String, default: "" },
      followLabel: { type: String, default: "Follow on Instagram" },
      items: {
        type: [new Schema({ caption: String, url: String, imageUrl: String }, { _id: false })],
        default: [],
      },
    },

    partnership: {
      enabled: { type: Boolean, default: true },
      title: { type: String, default: "Hungry already?" },
      text: { type: String, default: "Scan the QR code at your table, or tap below to start your order." },
      ctaLabel: { type: String, default: "Start Ordering" },
      ctaUrl: { type: String, default: "" },
    },

    footer: {
      tagline: { type: String, default: "" },
      contacts: { type: [linkSchema], default: [] },
      socials: { type: [linkSchema], default: [] },
    },
  },
  { timestamps: true },
);

export default model<ILandingContent>("LandingContent", landingContentSchema);
