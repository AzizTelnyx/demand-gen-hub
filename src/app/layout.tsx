import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Demand Gen Hub",
  description: "Unified operations platform for Demand Generation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50">
        {children}
      </body>
    </html>
  );
}
