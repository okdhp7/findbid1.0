import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FindBid 추천 운영관리",
  description: "FindBid 세션 피드백과 추천 버전을 확인하는 관리자 페이지",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
