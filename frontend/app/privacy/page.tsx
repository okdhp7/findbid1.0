import type { Metadata } from "next";
import { PublicInfoPage } from "../_components/public-info-page";

export const metadata: Metadata = {
  title: "개인정보처리방침 | FindBid",
  description: "FindBid 개인정보처리방침을 안내합니다.",
};

export default function PrivacyPage() {
  return (
    <PublicInfoPage
      kicker="PRIVACY POLICY"
      title="개인정보처리방침"
      description="FindBid는 서비스 제공에 필요한 범위에서 정보를 처리하고 안전하게 보호합니다."
      sections={[
        {
          title: "1. 처리하는 정보",
          paragraphs: [
            "서비스 이용 과정에서 검색조건, 기업 프로필, 관심공고와 같은 사용자가 입력한 정보가 브라우저 저장소에 보관될 수 있습니다. 서비스 안정성과 보안을 위해 접속 기록, 기기 및 브라우저 정보가 자동으로 생성될 수 있습니다.",
          ],
        },
        {
          title: "2. 이용 목적",
          items: [
            "입찰공고 검색과 기업 맞춤 분석 제공",
            "사용자 설정과 관심공고 유지",
            "서비스 오류 확인과 보안 대응",
            "이메일로 접수된 고객 의견 처리",
          ],
        },
        {
          title: "3. 보유 및 파기",
          paragraphs: [
            "브라우저에 저장된 정보는 사용자가 직접 삭제하거나 브라우저 데이터를 초기화할 때 제거됩니다. 별도로 수집한 정보는 이용 목적이 달성되면 지체 없이 파기하며, 관계 법령에 보관 의무가 있는 경우 해당 기간 동안 보관합니다.",
          ],
        },
        {
          title: "4. 제3자 제공",
          paragraphs: [
            "INTERWEB은 법령에 근거가 있거나 사용자의 동의를 받은 경우를 제외하고 개인정보를 제3자에게 제공하지 않습니다.",
          ],
        },
        {
          title: "5. 이용자의 권리",
          paragraphs: [
            "이용자는 자신의 정보에 대한 열람, 정정, 삭제 및 처리 정지를 요청할 수 있습니다. 관련 요청은 help_findbid@interweb.co.kr로 접수할 수 있습니다.",
          ],
        },
        {
          title: "6. 시행일",
          paragraphs: ["이 개인정보처리방침은 2026년 8월 1일부터 적용됩니다."],
        },
      ]}
    />
  );
}
