import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./features.css";

export const metadata: Metadata = {
  title: "RodoERP | Gestão de borracharia",
  description: "Gestão multifilial para borracharias e serviços automotivos.",
  applicationName: "RodoERP",
  icons: { icon: "/rodo-mark.svg" },
};

export const viewport: Viewport = { themeColor: "#17191c", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
