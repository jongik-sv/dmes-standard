import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DK Oasis Portal",
  description: "Portal host for Oasis micro frontend shell",
};

export const viewport: Viewport = {
  themeColor: "#0d2f5b",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
