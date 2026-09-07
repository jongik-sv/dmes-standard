import type { Metadata, Viewport } from "next";
import { mantineHtmlProps } from "@mantine/core";
import { ColorSchemeScript, DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "DK Oasis Portal",
  description: "Portal host for Oasis micro frontend shell",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [{ rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#0d2f5b" }],
  },
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
    <html lang="ko" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
      </head>
      <body className="m-0">
        <DmesUiProvider>{children}</DmesUiProvider>
      </body>
    </html>
  );
}
