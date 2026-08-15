import type { Metadata } from "next";
import { PublicInfoPage } from "../_components/public-info-page";

export const metadata: Metadata = {
  title: "서비스 소개 | FindBid",
  description: "FindBid의 AI 입찰 탐색과 기업 맞춤 분석 서비스를 소개합니다.",
};

export default function AboutPage() {
  return (
    <PublicInfoPage
      kicker="ABOUT FINDBID"
      title="기업의 다음 입찰 기회를 더 빠르게"
      description="FindBid는 공공 입찰공고와 기업 역량을 연결해 검토할 공고를 빠르게 찾도록 돕습니다."
      video={{
        src: "/findbid-service-intro-30s.mp4",
        title: "30초로 만나는 FindBid",
        description: "자연어 검색부터 기업 역량 비교와 참가 가능성 분석까지, FindBid가 공공 입찰 기회를 찾는 과정을 영상으로 확인해 보세요.",
      }}
      sections={[
        {
          title: "FindBid가 하는 일",
          paragraphs: [
            "FindBid는 수집된 나라장터 입찰공고를 검색하고, 자연어로 입력한 조건과 기업 프로필을 바탕으로 공고별 적합도와 참가 가능성을 분석합니다.",
          ],
        },
        {
          title: "주요 기능",
          items: [
            "자연어 기반 AI 시맨틱 검색",
            "기업 보유 역량과 참가자격 비교",
            "공고별 적합도와 확인사항 분석",
            "입찰시장 동향과 참여 제한 요인 분석",
            "관심공고와 검색조건의 브라우저 저장",
          ],
        },
        {
          title: "데이터 안내",
          paragraphs: [
            "FindBid는 수집된 G2B 입찰공고를 기준으로 정보를 제공합니다. 모든 나라장터 공고의 포함과 분석 결과의 완전성을 보장하지 않으므로 실제 입찰 전에는 반드시 원문 공고와 첨부문서를 확인해야 합니다.",
          ],
        },
        {
          title: "운영 주체",
          paragraphs: ["FindBid는 INTERWEB이 소유하고 운영합니다."],
        },
      ]}
    />
  );
}
