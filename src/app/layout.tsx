import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { AccountProvider } from "@/lib/account/account-context";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: "RewApp",
    description: t("description"),
    applicationName: "RewApp",
    appleWebApp: { capable: true, title: "RewApp", statusBarStyle: "black" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d0820",
  colorScheme: "dark",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body className={`${plusJakartaSans.variable} font-sans antialiased`}>
        <NextIntlClientProvider>
          <AccountProvider>{children}</AccountProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
