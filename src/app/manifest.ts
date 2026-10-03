import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RewApp",
    short_name: "RewApp",
    description: "Pagá con QR y ganá recompensas al instante, en tu moneda.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4f46e5",
    lang: "es",
  };
}
