import type { Metadata, Viewport } from "next";
import "./globals.css";

const themeInitializationScript = `
  try {
    var storedTheme = window.localStorage.getItem("findbid.color-theme.v1");
    if (storedTheme === "dark" || storedTheme === "light") {
      document.documentElement.dataset.findbidTheme = storedTheme;
    }
  } catch (error) {}
`;

export const metadata: Metadata = {
  title: "FindBid | AI 입찰공고 탐색",
  description: "나라장터 공고를 분석해 우리 회사에 적합한 입찰사업을 추천하는 AI 조달 인텔리전스 서비스",
  icons: {
    icon: "/findbid-b-icon-3x.png",
    shortcut: "/findbid-b-icon-3x.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#212121" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
