import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChopeWash · RC4 laundry, without the guesswork",
  description: "Book a laundry slot, join the live queue, and know exactly when to head downstairs.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col selection:bg-lime selection:text-ink">{children}</body>
    </html>
  );
}
