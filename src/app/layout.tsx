import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaProvider } from "@/components/install-app";

export const metadata: Metadata = {
  title: "ChopeWash · RC4 laundry, without the guesswork",
  description: "Book a laundry slot, join the live queue, and know exactly when to head downstairs.",
  icons: { icon: "/favicon.svg", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "ChopeWash", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#17203a" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col selection:bg-lime selection:text-ink"><PwaProvider>{children}</PwaProvider></body>
    </html>
  );
}
