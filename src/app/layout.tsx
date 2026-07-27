import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cadence — Timeline & Tracker",
  description:
    "Sprint planning with a Gantt timeline and a task tracker in one place",
};

/**
 * Applies the stored theme before first paint so the page never flashes the
 * wrong palette. A raw tag rather than `next/script`: it has to run before
 * anything else, and it carries the request's nonce so the content security
 * policy lets this one inline script through.
 */
const themeBoot = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t}}catch(e){}})()`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The content security policy allows scripts by nonce, and the proxy passes
  // the one it minted for this request along. Handing it to the tag explicitly
  // keeps the rendered markup and the client's idea of it in agreement.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="h-screen flex flex-col overflow-hidden">
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeBoot }}
        />
        {children}
      </body>
    </html>
  );
}
