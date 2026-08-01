import type { Metadata } from "next";
import { PublicInfoPage } from "../_components/public-info-page";

export const metadata: Metadata = {
  title: "이용약관 | FindBid",
  description: "FindBid 서비스 이용약관을 안내합니다.",
};

export default function TermsPage() {
  return (
    <PublicInfoPage
      kicker="TERMS OF SERVICE"
      title="이용약관"
      description="FindBid를 이용하기 전에 서비스의 제공 범위와 이용 기준을 확인해 주세요."
      sections={[
        {
          title: "1. 목적",
          paragraphs: [
            "이 약관은 INTERWEB이 제공하는 FindBid 서비스의 이용 조건과 이용자 및 운영자의 권리와 의무를 정하는 것을 목적으로 합니다.",
          ],
        },
        {
          title: "2. 서비스의 내용",
          items: [
            "공공 입찰공고 검색과 조건 해석",
            "기업 프로필 기반 적합도 및 참가 가능성 분석",
            "입찰시장 인사이트와 관심공고 관리",
            "기타 입찰 탐색을 지원하는 부가 기능",
          ],
        },
        {
          title: "3. 이용자의 의무",
          paragraphs: [
            "이용자는 서비스를 관계 법령과 본 약관에 맞게 이용해야 하며, 서비스 운영을 방해하거나 타인의 권리를 침해해서는 안 됩니다.",
          ],
        },
        {
          title: "4. 정보의 확인과 책임",
          paragraphs: [
            "FindBid의 검색 및 AI 분석 결과는 입찰 검토를 돕기 위한 참고 정보입니다. 실제 참가 여부와 계약 조건은 나라장터 원문 공고 및 첨부문서를 기준으로 이용자가 최종 확인해야 합니다.",
          ],
        },
        {
          title: "5. 지식재산권",
          paragraphs: [
            "FindBid의 서비스 화면, 소프트웨어, 디자인과 자체 제작 콘텐츠에 관한 권리는 INTERWEB 또는 정당한 권리자에게 있습니다.",
          ],
        },
        {
          title: "6. 서비스 변경",
          paragraphs: [
            "서비스 개선이나 운영상 필요한 경우 기능과 제공 범위가 변경될 수 있으며, 중요한 변경 사항은 서비스 화면을 통해 안내합니다.",
          ],
        },
        {
          title: "7. 시행일",
          paragraphs: ["이 이용약관은 2026년 8월 1일부터 적용됩니다."],
        },
      ]}
    />
  );
}
