import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import StoreProvider from "@/components/StoreProvider";
import Nav from "@/components/Nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Diamond Draft",
  description: "Youth baseball lineup manager",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-950 text-white">
        <StoreProvider>
          <Nav />
          <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
            {children}
          </main>
        </StoreProvider>
      </body>
    </html>
  );
}
