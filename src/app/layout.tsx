import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
});

export const metadata: Metadata = {
  title: "Mini-planet Voxel",
  description:
    "Pequenos planetas de voxel gerados proceduralmente — edite bloco a bloco. Next.js + Supabase + Vercel.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={spaceGrotesk.variable}>
      <body className="bg-[#05070f] font-sans text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
