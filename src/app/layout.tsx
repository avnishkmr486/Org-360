import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/layout/providers";
import { AppShell } from "@/components/layout/app-shell";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Organization 360 · Altametrics Pvt Ltd.",
    template: "%s · Organization 360",
  },
  description: "Process. Performance. Accountability. — Enterprise process management & compliance platform for Altametrics Pvt Ltd.",
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/brand/altametrics-icon.svg` },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Static host only: restores the real address after a record created later was opened through its template page. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var s=sessionStorage.getItem("org360:spa");if(s&&location.pathname.indexOf("__ID__")>-1){sessionStorage.removeItem("org360:spa");history.replaceState(null,"",s)}}catch(e){}` }} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
