export type Eligibility = "참가 가능" | "확인 필요" | "참가 어려움";

export type Bid = {
  id: string;
  noticeNo: string;
  category: "용역" | "물품" | "공사";
  title: string;
  agency: string;
  demandAgency: string;
  region: string;
  budget: number;
  budgetLabel: string;
  contractMethod: string;
  awardMethod: string;
  closeAt: string;
  daysLeft: number;
  score: number;
  scoreConfidence?: number;
  scoreBreakdown?: Record<string, number>;
  scoreReasons?: string[];
  unresolvedRequirements?: string[];
  eligibility: Eligibility;
  summary: string;
  matched: string[];
  requirements: string[];
  risks: string[];
  tags: string[];
  isNew?: boolean;
  sourceUrl?: string | null;
};

export const bids: Bid[] = [
  {
    id: "R26BK01528421",
    noticeNo: "R26BK01528421-000",
    category: "용역",
    title: "생성형 AI 기반 지능형 행정업무 지원 플랫폼 구축",
    agency: "한국지능정보사회진흥원",
    demandAgency: "디지털플랫폼정부위원회",
    region: "전국",
    budget: 480000000,
    budgetLabel: "4억 8,000만원",
    contractMethod: "제한경쟁",
    awardMethod: "협상에 의한 계약",
    closeAt: "2026.08.07 10:00",
    daysLeft: 18,
    score: 96,
    eligibility: "참가 가능",
    summary: "공공업무 문서 검색과 답변 생성을 위한 RAG 기반 행정지원 플랫폼을 구축하고 운영체계를 수립하는 사업입니다.",
    matched: ["생성형 AI 구축 경험", "Java·React 기술", "정보통신공사업"],
    requirements: ["소프트웨어사업자 신고", "중소기업 확인서", "최근 3년 유사사업 실적"],
    risks: ["기술평가 90점 이상 필요"],
    tags: ["생성형 AI", "RAG", "플랫폼 구축"],
    isNew: true,
  },
  {
    id: "R26BK01519037",
    noticeNo: "R26BK01519037-001",
    category: "용역",
    title: "2026년 공공데이터 통합관리시스템 고도화 및 운영",
    agency: "행정안전부",
    demandAgency: "행정안전부",
    region: "전국",
    budget: 390000000,
    budgetLabel: "3억 9,000만원",
    contractMethod: "일반경쟁",
    awardMethod: "협상에 의한 계약",
    closeAt: "2026.08.02 14:00",
    daysLeft: 13,
    score: 91,
    eligibility: "확인 필요",
    summary: "공공데이터 품질관리, 메타데이터 연계, 통합검색 기능을 개선하고 연간 유지관리 서비스를 수행합니다.",
    matched: ["데이터 플랫폼 경험", "React 프론트엔드", "공공 SI 실적"],
    requirements: ["소프트웨어사업자 신고", "기술인력 5인 이상", "공공기관 실적증명"],
    risks: ["상주인력 2명 조건 확인", "실적증명서 원본 필요"],
    tags: ["공공데이터", "통합검색", "고도화"],
    isNew: true,
  },
  {
    id: "R26BK01510398",
    noticeNo: "R26BK01510398-000",
    category: "용역",
    title: "AI 민원상담 서비스 구축 및 기존 시스템 연계",
    agency: "경기도 성남시",
    demandAgency: "경기도 성남시",
    region: "경기",
    budget: 245000000,
    budgetLabel: "2억 4,500만원",
    contractMethod: "제한경쟁",
    awardMethod: "협상에 의한 계약",
    closeAt: "2026.07.29 10:00",
    daysLeft: 9,
    score: 87,
    eligibility: "참가 가능",
    summary: "민원 지식베이스와 LLM을 연계해 상담 답변을 생성하고 상담 이력 분석 대시보드를 제공하는 사업입니다.",
    matched: ["AI 챗봇", "Python API", "경기도 소재지"],
    requirements: ["경기도 소재 중소기업", "직접생산확인증명", "개인정보보호 체계"],
    risks: ["납품기한 120일"],
    tags: ["AI 상담", "LLM", "대시보드"],
  },
  {
    id: "R26BK01499871",
    noticeNo: "R26BK01499871-000",
    category: "물품",
    title: "교육용 GPU 서버 및 AI 개발환경 도입",
    agency: "서울특별시교육청",
    demandAgency: "서울인공지능고등학교",
    region: "서울",
    budget: 176000000,
    budgetLabel: "1억 7,600만원",
    contractMethod: "제한경쟁",
    awardMethod: "적격심사",
    closeAt: "2026.07.25 12:00",
    daysLeft: 5,
    score: 64,
    eligibility: "참가 어려움",
    summary: "GPU 서버와 네트워크 장비를 구매하고 교내 AI 실습환경을 구성하는 물품 납품 중심 사업입니다.",
    matched: ["AI 개발환경"],
    requirements: ["컴퓨터서버 직접생산확인", "제조사 공급확약서"],
    risks: ["장비 납품 중심", "직접생산확인 미보유"],
    tags: ["GPU", "서버", "물품구매"],
  },
  {
    id: "R26BK01486140",
    noticeNo: "R26BK01486140-002",
    category: "용역",
    title: "공간정보 기반 재난안전 통합상황판 구축",
    agency: "부산광역시",
    demandAgency: "부산광역시 시민안전실",
    region: "부산",
    budget: 620000000,
    budgetLabel: "6억 2,000만원",
    contractMethod: "제한경쟁",
    awardMethod: "협상에 의한 계약",
    closeAt: "2026.08.12 16:00",
    daysLeft: 23,
    score: 79,
    eligibility: "확인 필요",
    summary: "GIS 기반 재난정보를 통합하고 실시간 관제와 상황전파 기능을 제공하는 통합상황판 구축 사업입니다.",
    matched: ["웹 시스템 구축", "통합 대시보드", "공공 SI"],
    requirements: ["정보통신공사업", "GIS 기술인력", "부산 소재 공동수급체"],
    risks: ["희망금액 5억원 초과", "지역업체 공동수급 필요"],
    tags: ["GIS", "재난안전", "상황판"],
  },
  {
    id: "R26BK01474418",
    noticeNo: "R26BK01474418-000",
    category: "공사",
    title: "공공청사 정보통신망 개선공사",
    agency: "인천광역시",
    demandAgency: "인천광역시 종합건설본부",
    region: "인천",
    budget: 128000000,
    budgetLabel: "1억 2,800만원",
    contractMethod: "지역제한",
    awardMethod: "적격심사",
    closeAt: "2026.07.24 10:00",
    daysLeft: 4,
    score: 58,
    eligibility: "참가 어려움",
    summary: "공공청사 내 네트워크 케이블과 통신설비를 교체하는 정보통신 공사입니다.",
    matched: ["정보통신공사업"],
    requirements: ["인천 소재 업체", "정보통신공사업"],
    risks: ["지역제한 불충족", "공사 실적 필요"],
    tags: ["정보통신", "네트워크", "공사"],
  },
];

export const companyProfile = {
  name: "아이비즈토피아",
  location: "경기도 성남시",
  size: "중소기업",
  licenses: ["소프트웨어사업자", "정보통신공사업"],
  technologies: ["생성형 AI", "Java", "React", "Python", "데이터 플랫폼"],
  completion: 86,
};
