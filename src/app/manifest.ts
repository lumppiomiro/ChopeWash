import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "ChopeWash", short_name: "ChopeWash",
    description: "Your RC4 laundry bookings, queue and cycle timers.",
    start_url: "/", scope: "/", display: "standalone",
    background_color: "#f4f6fb", theme_color: "#17203a",
    icons: [
      { src: "/icons/app-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/app-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
