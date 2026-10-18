import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "OAI-SearchBot",
      allow: "/",
    },
    sitemap: "https://www.zingswap.org/sitemap.xml",
  };
}