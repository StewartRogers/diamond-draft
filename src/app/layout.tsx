import type { Metadata } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import StoreProvider from "@/components/StoreProvider";
import Nav from "@/components/Nav";

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const ibmMono = IBM_Plex_Mono({
  variable: "--font-ibm-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Diamond Draft",
  description: "Youth baseball lineup manager",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${hanken.variable} ${ibmMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#efece6] text-[#211f1b]">
        <StoreProvider>
          <Nav />
          <main className="flex-1 w-full">
            {children}
          </main>
        </StoreProvider>
      </body>
    </html>
  );
}
