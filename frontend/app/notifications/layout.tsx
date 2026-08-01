import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "알림 | FindBid",
  description: "FindBid 서비스 알림과 주요 소식",
};

export default function NotificationsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
