import type { MetadataRoute } from "next";

const baseUrl = "https://www.zingswap.org";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: baseUrl },
    { url: `${baseUrl}/portfolio` },
    { url: `${baseUrl}/analytics` },
    { url: `${baseUrl}/liquidity` },
    { url: `${baseUrl}/tokens` },
    { url: `${baseUrl}/settings` },
  ];
}
