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

const SITE_TITLE = "Interview Prep — Practice like it's the real thing";
const SITE_DESCRIPTION =
  "Mock technical interviews with instant AI feedback. Pick a role, answer real questions, and get scored on clarity, structure, and content.";
const SITE_URL = "https://interview-prep-platform-xy36.vercel.app";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,

  // Open Graph tags control how the link looks when pasted into LinkedIn,
  // Slack, email clients, Discord, etc. Without these, most platforms fall
  // back to just showing the bare URL with no title or description at all.
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "Interview Prep",
    locale: "en_US",
    type: "website",
    // TODO: once a 1200x630 preview image exists (e.g. a screenshot of the
    // hero terminal mock), add it here as:
    // images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630 }],
  },

  // Twitter/X reads these specifically rather than falling back to Open
  // Graph tags in every case, so it's worth setting explicitly too.
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
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