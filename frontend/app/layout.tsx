import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

// Body text font — clean and readable
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Headline font — characterful serif, used sparingly
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Utility/label font — used for tags, terminal text, small caps labels
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Interview Prep — Practice like it's the real thing",
  description:
    "Mock technical interviews with instant AI feedback. Pick a role, answer real questions, and get scored on clarity, structure, and content.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
