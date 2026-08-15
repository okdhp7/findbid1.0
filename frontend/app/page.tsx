"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  companyProfile as DEFAULT_COMPANY_PROFILE,
  type Bid,
  type BidAttachment,
  type CompanyProfile,
} from "../lib/bids";
import { SiteFooter } from "./_components/site-footer";
import { NotificationPopup } from "./_components/notification-popup";
import { useSharedTheme } from "./_components/use-shared-theme";

const categories = ["전체", "용역", "물품", "공사"] as const;
const regions = [
  "전체 지역",
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
];
type AgencyTypeDetail = {
  name: string;
  topLevelAgencyNames: string[];
  topLevelAgencyCount: number;
};

type AgencyTypeOption = {
  name: string;
  details: AgencyTypeDetail[];
};

type AgencySuggestion = {
  agencyCode: string;
  agencyName: string;
  topLevelAgencyCode: string;
  topLevelAgencyName: string;
  agencyCount: number;
  bidCount: number;
  isTopLevel: boolean;
};

const agencyTypeOptions: AgencyTypeOption[] = [
  {
    name: "공기업",
    details: ["산하기관", "정부출자기관", "정부출연기관", "정부투자기관", "출자·출연·투자기관의 자회사"],
  },
  {
    name: "교육기관",
    details: ["교육행정조직", "유치원", "초등학교", "중학교", "고등학교", "고등교육기관", "특수학교", "평생교육기관"],
  },
  {
    name: "국가기관",
    details: ["중앙행정기관", "소속기관", "특별지방행정기관", "사법조직", "입법조직", "헌법조직", "국군조직"],
  },
  {
    name: "기타공공기관",
    details: ["기금관리기관", "정부출연·보조기관", "행정사무대행단체", "기타 산하기관"],
  },
  {
    name: "기타기관",
    details: ["금융기관", "민간단체", "평생교육기관", "기타 산하기관"],
  },
  {
    name: "정부투자기관",
    details: ["정부투자기관", "정부투자기관 및 기타 기관"],
  },
  {
    name: "준정부기관",
    details: ["기금관리기관", "정부출연·보조기관", "정부투자기관", "기타 산하기관"],
  },
  {
    name: "지방공기업",
    details: ["지방 공사·공단", "지방자치단체 산하기관", "행정사무대행단체"],
  },
  {
    name: "지방자치단체",
    details: ["광역자치단체", "기초자치단체", "본청", "직속기관", "사업소", "하부행정기구", "지방의회"],
  },
  {
    name: "지자체 출자출연기관",
    details: ["지방 출자기관", "지방 출연기관", "재출연기관", "일부투자기관", "출자·출연기관의 자회사"],
  },
].map((option) => ({
  name: option.name,
  details: option.details.map((detail) => ({
    name: detail,
    topLevelAgencyNames: [],
    topLevelAgencyCount: 0,
  })),
}));
const agencyTypeNames = agencyTypeOptions.map((option) => option.name);
const budgetOptions = [
  { label: "금액 전체", value: 0 },
  { label: "1억원 이하", value: 100_000_000 },
  { label: "3억원 이하", value: 300_000_000 },
  { label: "5억원 이하", value: 500_000_000 },
  { label: "10억원 이하", value: 1_000_000_000 },
  { label: "20억원 이하", value: 2_000_000_000 },
  { label: "30억원 이하", value: 3_000_000_000 },
  { label: "50억원 이하", value: 5_000_000_000 },
  { label: "100억원 이하", value: 10_000_000_000 },
  { label: "300억원 이하", value: 30_000_000_000 },
  { label: "500억원 이하", value: 50_000_000_000 },
  { label: "1,000억원 이하", value: 100_000_000_000 },
];

type SearchSnapshot = {
  category: (typeof categories)[number];
  region: string;
  maxBudget: number;
  includeKeyword: string;
  excludeKeyword: string;
  demandAgencyInput: string;
  semanticQuery: string;
  onlyEligible: boolean;
  closingSoon: boolean;
  closingWithinDays?: number | null;
  sortMode?: "opportunity" | null;
};

type SearchTrigger = "filter_auto" | "ai_button" | "pagination";

const DEFAULT_SEARCH: SearchSnapshot = {
  category: "전체",
  region: "전체 지역",
  maxBudget: 0,
  includeKeyword: "",
  excludeKeyword: "",
  demandAgencyInput: "",
  semanticQuery: "",
  onlyEligible: false,
  closingSoon: false,
};

const INSIGHTS_OPPORTUNITY_SEARCH: SearchSnapshot = {
  ...DEFAULT_SEARCH,
  onlyEligible: true,
  closingSoon: true,
  closingWithinDays: 14,
  sortMode: "opportunity",
};

const PAGE_SIZE = 20;
const PAGE_JUMP = 5;
const AGENCY_SUGGESTION_PAGE_SIZE = 20;
const AGENCY_SUGGESTION_MAX = 100;

type SavedSearch = {
  id: string;
  name: string;
  createdAt: string;
  filters: SearchSnapshot;
};

const SAVED_SEARCHES_KEY = "findbid.saved-searches.v1";
const SEMANTIC_HISTORY_KEY = "findbid.semantic-history.v1";
const SEMANTIC_HISTORY_LIMIT = 10;
const INCLUDE_KEYWORD_HISTORY_KEY = "findbid.include-keyword-history.v1";
const EXCLUDE_KEYWORD_HISTORY_KEY = "findbid.exclude-keyword-history.v1";
const DEMAND_AGENCY_HISTORY_KEY = "findbid.demand-agency-history.v1";
const KEYWORD_HISTORY_LIMIT = 5;

function splitDemandAgencies(value: string): string[] {
  return Array.from(new Set(
    value
      .split(/[,，\n]/)
      .map((agency) => agency.trim())
      .filter(Boolean),
  )).slice(0, 20);
}

function activeDemandAgencyFragment(value: string): string {
  return value.split(/[,，\n]/).at(-1)?.trim() ?? "";
}

function replaceDemandAgencyFragment(value: string, agencyName: string): string {
  const completed = value.split(/[,，\n]/).slice(0, -1).map((agency) => agency.trim()).filter(Boolean);
  return `${[...completed, agencyName].join(", ")}, `;
}
const COMPANY_PROFILE_KEY = "findbid.company-profile.v1";
const SAVED_BIDS_KEY = "findbid.saved-bids.v1";
const SAVED_BIDS_LIMIT = 50;
const feedbackReasons = [
  "검색 주제와 다름",
  "업무 구분이 다름",
  "지역이 맞지 않음",
  "사업금액이 맞지 않음",
  "계약방법이 맞지 않음",
  "수요기관이 맞지 않음",
  "회사 역량과 맞지 않음",
  "이미 확인한 공고",
  "기타",
];

type SemanticCondition = {
  id: string;
  role: string;
  mode: "must" | "should" | "boost" | "must_not" | "filter";
  kind: string;
  value: string;
  variants: string[];
  confidence: number;
  source: string;
};

type CompanyProfileDraft = {
  name: string;
  location: string;
  size: string;
  licenses: string;
  technologies: string;
  businessAreas: string;
  experiences: string;
  preferredMaxBudget: string;
  serviceRegions: string[];
  serviceAgencyTypes: string[];
  excludedBusinessAreas: string;
};

function normalizeProfileList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function normalizeServiceRegions(values: unknown): string[] {
  const normalized = Array.from(
    new Set(
      normalizeProfileList(values)
        .map((value) => value === "전국" ? "전체 지역" : value)
        .filter((value) => regions.includes(value)),
    ),
  );

  return normalized.includes("전체 지역") ? ["전체 지역"] : normalized;
}

function normalizeServiceAgencyTypes(values: unknown): string[] {
  const normalized = Array.from(
    new Set(
      normalizeProfileList(values).filter((value) =>
        value === "전체 기관" || agencyTypeNames.includes(value as (typeof agencyTypeNames)[number])),
    ),
  );
  return normalized.includes("전체 기관") ? ["전체 기관"] : normalized;
}

function normalizeSavedBid(value: unknown): Bid | null {
  if (!value || typeof value !== "object") return null;
  const bid = value as Partial<Bid>;
  const id = typeof bid.id === "string" ? bid.id.trim() : "";
  const title = typeof bid.title === "string" ? bid.title.trim() : "";
  if (!id || !title) return null;

  const category = ["용역", "물품", "공사"].includes(String(bid.category))
    ? bid.category as Bid["category"]
    : "용역";
  const eligibility = ["참가 가능", "확인 필요", "참가 어려움"].includes(
    String(bid.eligibility),
  )
    ? bid.eligibility as Bid["eligibility"]
    : "확인 필요";

  return {
    id,
    noticeNo: typeof bid.noticeNo === "string" && bid.noticeNo.trim()
      ? bid.noticeNo.trim()
      : id,
    category,
    title,
    agency: typeof bid.agency === "string" ? bid.agency : "기관 미정",
    demandAgency: typeof bid.demandAgency === "string" ? bid.demandAgency : "기관 미정",
    region: typeof bid.region === "string" ? bid.region : "전국",
    budget: Number.isFinite(Number(bid.budget)) ? Number(bid.budget) : 0,
    budgetLabel: typeof bid.budgetLabel === "string" ? bid.budgetLabel : "금액 미정",
    contractMethod: typeof bid.contractMethod === "string"
      ? bid.contractMethod
      : "확인 필요",
    awardMethod: typeof bid.awardMethod === "string" ? bid.awardMethod : "확인 필요",
    closeAt: typeof bid.closeAt === "string" ? bid.closeAt : "마감일 미정",
    daysLeft: Number.isFinite(Number(bid.daysLeft)) ? Number(bid.daysLeft) : 0,
    score: Number.isFinite(Number(bid.score)) ? Number(bid.score) : 0,
    favoriteSearchId: typeof bid.favoriteSearchId === "string"
      ? bid.favoriteSearchId
      : "",
    scoreConfidence: Number.isFinite(Number(bid.scoreConfidence))
      ? Number(bid.scoreConfidence)
      : 0,
    scoreBreakdown: bid.scoreBreakdown && typeof bid.scoreBreakdown === "object"
      ? bid.scoreBreakdown
      : {},
    scoreReasons: normalizeProfileList(bid.scoreReasons),
    unresolvedRequirements: normalizeProfileList(bid.unresolvedRequirements),
    eligibility,
    summary: typeof bid.summary === "string" ? bid.summary : "",
    matched: normalizeProfileList(bid.matched),
    matchedConditions: normalizeProfileList(bid.matchedConditions),
    requirements: normalizeProfileList(bid.requirements),
    risks: normalizeProfileList(bid.risks),
    tags: normalizeProfileList(bid.tags),
    isNew: Boolean(bid.isNew),
    sourceUrl: typeof bid.sourceUrl === "string"
      && /^https?:\/\//i.test(bid.sourceUrl)
      ? bid.sourceUrl
      : null,
    attachments: [],
  };
}

function normalizeSavedBids(value: unknown): Bid[] {
  if (!Array.isArray(value)) return [];
  const uniqueBids = new Map<string, Bid>();
  value.forEach((item) => {
    const bid = normalizeSavedBid(item);
    if (bid) uniqueBids.set(bid.id, bid);
  });
  return Array.from(uniqueBids.values()).slice(-SAVED_BIDS_LIMIT);
}

function normalizeCompanyProfile(value: unknown): CompanyProfile {
  if (!value || typeof value !== "object") return { ...DEFAULT_COMPANY_PROFILE };
  const profile = value as Partial<CompanyProfile>;
  const preferredMaxBudget = Number(profile.preferredMaxBudget);
  return {
    name: typeof profile.name === "string" && profile.name.trim()
      ? profile.name.trim().slice(0, 120)
      : DEFAULT_COMPANY_PROFILE.name,
    location: typeof profile.location === "string"
      ? profile.location.trim().slice(0, 120)
      : DEFAULT_COMPANY_PROFILE.location,
    size: typeof profile.size === "string" && profile.size.trim()
      ? profile.size.trim().slice(0, 40)
      : DEFAULT_COMPANY_PROFILE.size,
    licenses: normalizeProfileList(profile.licenses),
    technologies: normalizeProfileList(profile.technologies),
    businessAreas: normalizeProfileList(profile.businessAreas),
    experiences: normalizeProfileList(profile.experiences),
    preferredMaxBudget: Number.isFinite(preferredMaxBudget) && preferredMaxBudget > 0
      ? Math.round(preferredMaxBudget)
      : null,
    serviceRegions: normalizeServiceRegions(profile.serviceRegions),
    serviceAgencyTypes: normalizeServiceAgencyTypes(
      profile.serviceAgencyTypes ?? DEFAULT_COMPANY_PROFILE.serviceAgencyTypes,
    ),
    excludedBusinessAreas: normalizeProfileList(profile.excludedBusinessAreas),
    completion: typeof profile.completion === "number"
      ? Math.max(0, Math.min(100, Math.round(profile.completion)))
      : DEFAULT_COMPANY_PROFILE.completion,
  };
}

function profileToDraft(profile: CompanyProfile): CompanyProfileDraft {
  return {
    name: profile.name,
    location: profile.location,
    size: profile.size,
    licenses: profile.licenses.join(", "),
    technologies: profile.technologies.join(", "),
    businessAreas: profile.businessAreas.join(", "),
    experiences: profile.experiences.join(", "),
    preferredMaxBudget: profile.preferredMaxBudget
      ? String(profile.preferredMaxBudget / 100_000_000)
      : "",
    serviceRegions: normalizeServiceRegions(profile.serviceRegions),
    serviceAgencyTypes: normalizeServiceAgencyTypes(profile.serviceAgencyTypes),
    excludedBusinessAreas: profile.excludedBusinessAreas.join(", "),
  };
}

function splitProfileValues(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,，\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 50);
}

function profileCompletion(profile: Omit<CompanyProfile, "completion">): number {
  let completion = 0;
  if (profile.name) completion += 14;
  if (profile.location) completion += 12;
  if (profile.size) completion += 10;
  if (profile.licenses.length) completion += 14;
  if (profile.technologies.length) completion += 10;
  if (profile.businessAreas.length) completion += 10;
  if (profile.serviceRegions.length) completion += 10;
  if (profile.serviceAgencyTypes.length) completion += 8;
  if (profile.experiences.length) completion += 6;
  if (profile.preferredMaxBudget) completion += 3;
  if (profile.excludedBusinessAreas.length) completion += 3;
  return Math.min(100, completion);
}

function normalizeRegionFilter(region: string) {
  return region === "전국" ? "전체 지역" : region;
}

function companyProfileInitials(name: string): string {
  const normalized = name
    .trim()
    .replace(/^(?:주식회사|유한회사|합자회사|합명회사|㈜|\(주\)|（주）)\s*/, "")
    .trim();
  const words = (normalized.match(/[A-Za-z0-9가-힣]+/g) ?? []) as string[];
  if (words.length === 0) return "기업";

  const firstWord = words[0];
  if (/^[A-Za-z]/.test(firstWord)) {
    if (words.length > 1 && /^[A-Za-z0-9]/.test(words[1])) {
      return `${firstWord[0]}${words[1][0]}`.toUpperCase();
    }
    return firstWord.slice(0, 2).toUpperCase();
  }
  return Array.from(firstWord).slice(0, 2).join("");
}

function Mark({ children }: { children: React.ReactNode }) {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span className="profile-initials">{children}</span>
    </span>
  );
}

function StatusBadge({ value }: { value: Bid["eligibility"] }) {
  const className =
    value === "참가 가능"
      ? "status status-good"
      : value === "확인 필요"
        ? "status status-check"
        : "status status-bad";
  return <span className={className}>{value}</span>;
}

function AgencyName({ bidId, name }: { bidId: string; name: string }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const tooltipId = `agency-tooltip-${bidId}`;

  useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const measure = () => {
      setIsTruncated(
        trigger.scrollHeight > trigger.clientHeight + 1
        || trigger.scrollWidth > trigger.clientWidth + 1,
      );
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [name]);

  return (
    <div className="agency-tooltip">
      <button
        ref={triggerRef}
        type="button"
        className={`agency-tooltip-trigger${isTruncated ? " is-truncated" : ""}`}
        aria-describedby={isTruncated ? tooltipId : undefined}
      >
        {name}
      </button>
      {isTruncated && (
        <span
          id={tooltipId}
          className="agency-tooltip-content"
          role="tooltip"
        >
          {name}
        </span>
      )}
    </div>
  );
}

function BidTitle({ bid, onOpen }: { bid: Bid; onOpen: () => void }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const tooltipId = `bid-title-tooltip-${bid.id}`;

  useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const measure = () => {
      setIsTruncated(
        trigger.scrollWidth > trigger.clientWidth + 1
        || trigger.scrollHeight > trigger.clientHeight + 1,
      );
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [bid.title]);

  return (
    <div className="bid-title-tooltip">
      <button
        ref={triggerRef}
        className={`bid-title${isTruncated ? " is-truncated" : ""}`}
        type="button"
        onClick={onOpen}
        aria-describedby={isTruncated ? tooltipId : undefined}
      >
        {bid.title}
      </button>
      {isTruncated && (
        <span
          id={tooltipId}
          className="bid-title-tooltip-content"
          role="tooltip"
        >
          {bid.title}
        </span>
      )}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  return (
    <div
      className="score-ring"
      style={{ "--score": score } as React.CSSProperties}
      aria-label={`AI 적합도 ${score}점`}
    >
      <div>
        <strong>{score}</strong>
        <span>적합도</span>
      </div>
    </div>
  );
}

function OriginalNoticeAction({ bid }: { bid: Bid }) {
  if (!bid.sourceUrl) {
    return (
      <button className="primary-action" type="button" disabled>
        원문 주소 없음
      </button>
    );
  }
  return (
    <a
      className="primary-action"
      href={bid.sourceUrl}
      target="_blank"
      rel="noreferrer"
    >
      나라장터 원문 보기 →
    </a>
  );
}

const attachmentTypeOrder = [
  "PDF",
  "한글",
  "엑셀",
  "워드",
  "파워포인트",
  "이미지",
  "압축파일",
  "텍스트",
  "바로가기",
  "기타",
];

function attachmentTypeClass(fileType: string) {
  return {
    PDF: "pdf",
    한글: "hwp",
    엑셀: "excel",
    워드: "word",
    파워포인트: "powerpoint",
    이미지: "image",
    압축파일: "archive",
    텍스트: "text",
    바로가기: "link",
  }[fileType] ?? "other";
}

function AttachmentDocuments({
  attachments,
  loading,
  error,
}: {
  attachments: BidAttachment[];
  loading: boolean;
  error: string;
}) {
  if (loading) {
    return (
      <section className="notice-attachments" aria-busy="true">
        <div className="notice-attachments-head">
          <h3>첨부문서</h3>
        </div>
        <p className="attachment-state" role="status">
          첨부문서를 불러오는 중입니다.
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="notice-attachments">
        <div className="notice-attachments-head">
          <h3>첨부문서</h3>
        </div>
        <p className="attachment-state attachment-error">{error}</p>
      </section>
    );
  }

  if (attachments.length === 0) {
    return (
      <section className="notice-attachments">
        <div className="notice-attachments-head">
          <h3>첨부문서</h3>
          <span>0건</span>
        </div>
        <p className="attachment-state">등록된 첨부문서가 없습니다.</p>
      </section>
    );
  }

  const grouped = attachmentTypeOrder
    .map((fileType) => ({
      fileType,
      items: attachments.filter((attachment) => attachment.fileType === fileType),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <section className="notice-attachments">
      <div className="notice-attachments-head">
        <h3>첨부문서</h3>
        <span>{attachments.length}건</span>
      </div>
      <div className="attachment-groups">
        {grouped.map((group) => (
          <div className="attachment-group" key={group.fileType}>
            <h4>{group.fileType} 문서 <span>{group.items.length}</span></h4>
            <div className="attachment-list">
              {group.items.map((attachment) => (
                <a
                  key={attachment.url}
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${attachment.name} 열기`}
                  title={attachment.name}
                >
                  <span
                    className={`attachment-icon attachment-${attachmentTypeClass(attachment.fileType)}`}
                    aria-hidden="true"
                  >
                    {attachment.extension?.toUpperCase() || "↗"}
                  </span>
                  <span className="attachment-name">
                    <strong>{attachment.name}</strong>
                    <small>
                      {attachment.size && attachment.size !== "보기"
                        ? attachment.size
                        : `${group.fileType} 문서`}
                    </small>
                  </span>
                  <span className="attachment-open" aria-hidden="true">
                    열기 ↗
                  </span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`toggle-row ${checked ? "is-on" : ""}`}
      onClick={onChange}
      aria-pressed={checked}
    >
      <span className="toggle-track">
        <span />
      </span>
      <span>{label}</span>
    </button>
  );
}

export default function Home() {
  const footerBottomRef = useRef<HTMLDivElement>(null);
  const semanticHistoryRef = useRef<HTMLDivElement>(null);
  const autoSearchTimerRef = useRef<number | null>(null);
  const searchAbortControllerRef = useRef<AbortController | null>(null);
  const searchRequestIdRef = useRef(0);
  const [category, setCategory] = useState<(typeof categories)[number]>(DEFAULT_SEARCH.category);
  const [region, setRegion] = useState(DEFAULT_SEARCH.region);
  const [maxBudget, setMaxBudget] = useState(DEFAULT_SEARCH.maxBudget);
  const [includeKeyword, setIncludeKeyword] = useState(DEFAULT_SEARCH.includeKeyword);
  const includeKeywordInputRef = useRef<HTMLInputElement>(null);
  const [includeKeywordOverflowing, setIncludeKeywordOverflowing] = useState(false);
  const [includeKeywordHistory, setIncludeKeywordHistory] = useState<string[]>([]);
  const [excludeKeyword, setExcludeKeyword] = useState(DEFAULT_SEARCH.excludeKeyword);
  const excludeKeywordInputRef = useRef<HTMLInputElement>(null);
  const [excludeKeywordOverflowing, setExcludeKeywordOverflowing] = useState(false);
  const [excludeKeywordHistory, setExcludeKeywordHistory] = useState<string[]>([]);
  const [keywordHistoryOpen, setKeywordHistoryOpen] = useState<
    "include" | "exclude" | "demandAgency" | null
  >(null);
  const [demandAgencyInput, setDemandAgencyInput] = useState(
    DEFAULT_SEARCH.demandAgencyInput,
  );
  const demandAgencyInputRef = useRef<HTMLInputElement>(null);
  const [demandAgencyInputOverflowing, setDemandAgencyInputOverflowing] = useState(false);
  const [demandAgencyHistory, setDemandAgencyHistory] = useState<string[]>([]);
  const [agencySuggestions, setAgencySuggestions] = useState<AgencySuggestion[]>([]);
  const [agencySuggestionsOpen, setAgencySuggestionsOpen] = useState(false);
  const [agencySuggestionLimit, setAgencySuggestionLimit] = useState(
    AGENCY_SUGGESTION_PAGE_SIZE,
  );
  const [agencySuggestionsHasMore, setAgencySuggestionsHasMore] = useState(false);
  const [semanticQuery, setSemanticQuery] = useState(DEFAULT_SEARCH.semanticQuery);
  const [semanticQueryActive, setSemanticQueryActive] = useState(false);
  const [semanticHistoryOpen, setSemanticHistoryOpen] = useState(false);
  const [semanticHistory, setSemanticHistory] = useState<string[]>([]);
  const [onlyEligible, setOnlyEligible] = useState(DEFAULT_SEARCH.onlyEligible);
  const [closingSoon, setClosingSoon] = useState(DEFAULT_SEARCH.closingSoon);
  const [closingWithinDays, setClosingWithinDays] = useState<number | null>(
    DEFAULT_SEARCH.closingWithinDays ?? null,
  );
  const [searchSortMode, setSearchSortMode] = useState<SearchSnapshot["sortMode"]>(
    DEFAULT_SEARCH.sortMode ?? null,
  );
  const [sort, setSort] = useState("score");
  const [searched, setSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [resultBids, setResultBids] = useState<Bid[]>([]);
  const [databaseTotal, setDatabaseTotal] = useState(0);
  const [searchTotal, setSearchTotal] = useState(0);
  const [eligibleTotal, setEligibleTotal] = useState(0);
  const [closingSoonTotal, setClosingSoonTotal] = useState(0);
  const [averageScore, setAverageScore] = useState(0);
  const [interpretedConditions, setInterpretedConditions] = useState<string[]>([]);
  const [semanticConditions, setSemanticConditions] = useState<SemanticCondition[]>([]);
  const [searchTrace, setSearchTrace] = useState<string[]>([]);
  const [searchTraceId, setSearchTraceId] = useState("");
  const [searchElapsedMs, setSearchElapsedMs] = useState(0);
  const [searchTraceOpen, setSearchTraceOpen] = useState(false);
  const [recommendationNoticeOpen, setRecommendationNoticeOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchError, setSearchError] = useState("");
  const [selected, setSelected] = useState<Bid | null>(null);
  const [noticeDetail, setNoticeDetail] = useState<Bid | null>(null);
  const [noticeDetailLoading, setNoticeDetailLoading] = useState(false);
  const [noticeDetailError, setNoticeDetailError] = useState("");
  const [savedBids, setSavedBids] = useState<Bid[]>([]);
  const [savedBidsOpen, setSavedBidsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [clearingSavedBids, setClearingSavedBids] = useState(false);
  const [feedbackBidId, setFeedbackBidId] = useState("");
  const [selectedFeedbackReasons, setSelectedFeedbackReasons] = useState<string[]>([]);
  const [excludeConfirmOpen, setExcludeConfirmOpen] = useState(false);
  const [feedbackSubmittingId, setFeedbackSubmittingId] = useState("");
  const [feedbackEnabled, setFeedbackEnabled] = useState(false);
  const [agencyTypeDetails, setAgencyTypeDetails] = useState<AgencyTypeOption[]>(
    agencyTypeOptions,
  );
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>({
    ...DEFAULT_COMPANY_PROFILE,
  });
  const companyProfileRef = useRef(companyProfile);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<CompanyProfileDraft>(() =>
    profileToDraft(companyProfile),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [saveSearchOpen, setSaveSearchOpen] = useState(false);
  const closeNotifications = useCallback(() => setNotificationsOpen(false), []);
  const [savedSearchName, setSavedSearchName] = useState("");
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = window.localStorage.getItem(SAVED_SEARCHES_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored) as SavedSearch[];
      return Array.isArray(parsed)
        ? parsed.map((savedSearch) => {
            const filters = {
              ...DEFAULT_SEARCH,
              ...savedSearch.filters,
            };
            return {
              ...savedSearch,
              filters: {
                ...filters,
                region: normalizeRegionFilter(filters.region),
              },
            };
          })
        : [];
    } catch {
      return [];
    }
  });
  const [saveNotice, setSaveNotice] = useState("");
  const { theme, toggleTheme } = useSharedTheme();
  const saved = useMemo(
    () => savedBids.map((bid) => bid.id),
    [savedBids],
  );

  useEffect(() => {
    let active = true;
    void fetch("/api/feedback/settings", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return false;
        const data = await response.json() as { feedbackEnabled?: boolean };
        return data.feedbackEnabled === true;
      })
      .then((enabled) => {
        if (active) setFeedbackEnabled(enabled);
      })
      .catch(() => {
        if (active) setFeedbackEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/company/agency-types", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return [];
        const data = await response.json() as { types?: AgencyTypeOption[] };
        return Array.isArray(data.types) ? data.types : [];
      })
      .then((types) => {
        if (active && types.length) {
          setAgencyTypeDetails(agencyTypeOptions.map((fallback) => (
            types.find((option) => option.name === fallback.name) ?? fallback
          )));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const query = activeDemandAgencyFragment(demandAgencyInput);
    if (query.length < 2) {
      setAgencySuggestions([]);
      setAgencySuggestionsHasMore(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(
        `/api/company/agency-suggestions?q=${encodeURIComponent(query)}&limit=${agencySuggestionLimit}`,
        { cache: "no-store", signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok) return { items: [], hasMore: false };
          const data = await response.json() as {
            items?: AgencySuggestion[];
            hasMore?: boolean;
          };
          return {
            items: Array.isArray(data.items) ? data.items : [],
            hasMore: data.hasMore === true,
          };
        })
        .then(({ items, hasMore }) => {
          setAgencySuggestions(items);
          setAgencySuggestionsHasMore(hasMore);
        })
        .catch((error: unknown) => {
          if (!(error instanceof Error && error.name === "AbortError")) {
            setAgencySuggestions([]);
            setAgencySuggestionsHasMore(false);
          }
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [demandAgencyInput, agencySuggestionLimit]);

  useEffect(() => {
    const input = demandAgencyInputRef.current;
    if (!input) return;

    const measure = () => {
      setDemandAgencyInputOverflowing(
        input.scrollWidth > input.clientWidth + 1,
      );
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(input);
    return () => observer.disconnect();
  }, [demandAgencyInput]);

  useEffect(() => {
    const input = includeKeywordInputRef.current;
    if (!input) return;

    const measure = () => {
      setIncludeKeywordOverflowing(
        input.scrollWidth > input.clientWidth + 1,
      );
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(input);
    return () => observer.disconnect();
  }, [includeKeyword]);

  useEffect(() => {
    const input = excludeKeywordInputRef.current;
    if (!input) return;

    const measure = () => {
      setExcludeKeywordOverflowing(
        input.scrollWidth > input.clientWidth + 1,
      );
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(input);
    return () => observer.disconnect();
  }, [excludeKeyword]);

  useEffect(() => {
    const restoreKeywordHistory = (key: string) => {
      try {
        const stored = window.localStorage.getItem(key);
        if (!stored) return [];
        const parsed = JSON.parse(stored) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
          .filter((value): value is string =>
            typeof value === "string" && Boolean(value.trim()),
          )
          .map((value) => value.trim())
          .slice(0, KEYWORD_HISTORY_LIMIT);
      } catch {
        window.localStorage.removeItem(key);
        return [];
      }
    };

    setIncludeKeywordHistory(restoreKeywordHistory(INCLUDE_KEYWORD_HISTORY_KEY));
    setExcludeKeywordHistory(restoreKeywordHistory(EXCLUDE_KEYWORD_HISTORY_KEY));
    setDemandAgencyHistory(restoreKeywordHistory(DEMAND_AGENCY_HISTORY_KEY));
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SEMANTIC_HISTORY_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as unknown;
      if (!Array.isArray(parsed)) {
        window.localStorage.removeItem(SEMANTIC_HISTORY_KEY);
        return;
      }
      const restoredHistory = parsed
        .filter((query): query is string =>
          typeof query === "string" && Boolean(query.trim()),
        )
        .map((query) => query.trim())
        .slice(0, SEMANTIC_HISTORY_LIMIT);
      setSemanticHistory(restoredHistory);
    } catch {
      window.localStorage.removeItem(SEMANTIC_HISTORY_KEY);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SAVED_BIDS_KEY);
      if (!stored) return;
      setSavedBids(normalizeSavedBids(JSON.parse(stored)));
    } catch {
      window.localStorage.removeItem(SAVED_BIDS_KEY);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COMPANY_PROFILE_KEY);
      if (!stored) return;
      const restoredProfile = normalizeCompanyProfile(JSON.parse(stored));
      companyProfileRef.current = restoredProfile;
      setCompanyProfile(restoredProfile);
      setProfileDraft(profileToDraft(restoredProfile));
    } catch {
      window.localStorage.removeItem(COMPANY_PROFILE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!filtersOpen || !window.matchMedia("(max-width: 960px)").matches) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [filtersOpen]);

  useEffect(() => {
    if (!selected && !noticeDetail) return;
    const closeDrawerOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (excludeConfirmOpen) {
        setExcludeConfirmOpen(false);
        return;
      }
      setSelected(null);
      setNoticeDetail(null);
    };
    window.addEventListener("keydown", closeDrawerOnEscape);
    return () => window.removeEventListener("keydown", closeDrawerOnEscape);
  }, [selected, noticeDetail, excludeConfirmOpen]);

  useEffect(() => {
    if (!semanticHistoryOpen) return;

    const closeHistory = (event: PointerEvent) => {
      if (
        semanticHistoryRef.current
        && !semanticHistoryRef.current.contains(event.target as Node)
      ) {
        setSemanticHistoryOpen(false);
      }
    };
    const closeHistoryOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSemanticHistoryOpen(false);
    };

    window.addEventListener("pointerdown", closeHistory);
    window.addEventListener("keydown", closeHistoryOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeHistory);
      window.removeEventListener("keydown", closeHistoryOnEscape);
    };
  }, [semanticHistoryOpen]);

  const filteredBids = useMemo(() => {
    return [...resultBids].sort((a, b) => {
        if (sort === "closing") return a.daysLeft - b.daysLeft;
        if (sort === "budget") return b.budget - a.budget;
        return b.score - a.score;
      });
  }, [resultBids, sort]);

  const totalPages = Math.ceil(searchTotal / PAGE_SIZE);
  const pageWindowStart = Math.max(
    1,
    Math.min(currentPage - 2, Math.max(1, totalPages - 4)),
  );
  const pageWindowEnd = Math.min(totalPages, pageWindowStart + 4);
  const pageNumbers = Array.from(
    { length: Math.max(0, pageWindowEnd - pageWindowStart + 1) },
    (_, index) => pageWindowStart + index,
  );

  const currentSearchSnapshot = (): SearchSnapshot => ({
    category,
    region,
    maxBudget,
    includeKeyword,
    excludeKeyword,
    demandAgencyInput,
    semanticQuery,
    onlyEligible,
    closingSoon,
    closingWithinDays,
    sortMode: searchSortMode,
  });

  const runSearch = useCallback(async (
    snapshot: SearchSnapshot,
    page = 1,
    searchTrigger: SearchTrigger = "filter_auto",
  ) => {
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    searchAbortControllerRef.current?.abort();
    const controller = new AbortController();
    searchAbortControllerRef.current = controller;
    setIsSearching(true);
    setSearchError("");
    setCurrentPage(page);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        signal: controller.signal,
        body: JSON.stringify({
          category: snapshot.category,
          region: snapshot.region,
          maxBudget: snapshot.maxBudget,
          includeKeywords: snapshot.includeKeyword.split(/[,，]/).map((word) => word.trim()).filter(Boolean),
          excludeKeywords: snapshot.excludeKeyword.split(/[,，]/).map((word) => word.trim()).filter(Boolean),
          demandAgencies: splitDemandAgencies(snapshot.demandAgencyInput),
          onlyEligible: snapshot.onlyEligible,
          closingWithinDays: snapshot.closingWithinDays
            ?? (snapshot.closingSoon ? 7 : null),
          sortMode: snapshot.sortMode ?? null,
          semanticQuery: snapshot.semanticQuery,
          companyProfile: companyProfileRef.current,
          searchTrigger,
          page,
          limit: PAGE_SIZE,
        }),
      });
      if (!response.ok) {
        throw new Error("검색 서비스 응답 오류");
      }
      const data = (await response.json()) as {
        databaseTotal: number;
        total: number;
        eligibleTotal: number;
        closingSoonTotal: number;
        averageScore: number;
        queryPlan?: {
          interpretedConditions?: string[];
          semanticConditions?: SemanticCondition[];
          searchId?: string;
          searchTrace?: string[];
          elapsedMs?: number;
          feedbackEnabled?: boolean;
        };
        items: Bid[];
      };
      if (
        !Array.isArray(data.items)
        || typeof data.databaseTotal !== "number"
        || typeof data.total !== "number"
        || typeof data.eligibleTotal !== "number"
        || typeof data.closingSoonTotal !== "number"
        || typeof data.averageScore !== "number"
      ) {
        throw new Error("검색 결과 형식 오류");
      }
      if (requestId !== searchRequestIdRef.current) return;
      setResultBids(data.items);
      setDatabaseTotal(data.databaseTotal);
      setSearchTotal(data.total);
      setEligibleTotal(data.eligibleTotal);
      setClosingSoonTotal(data.closingSoonTotal);
      setAverageScore(data.averageScore);
      setInterpretedConditions(data.queryPlan?.interpretedConditions ?? []);
      setSemanticConditions(
        Array.isArray(data.queryPlan?.semanticConditions)
          ? data.queryPlan.semanticConditions
          : [],
      );
      setSearchTrace(data.queryPlan?.searchTrace ?? []);
      setSearchTraceId(data.queryPlan?.searchId ?? "");
      setSearchElapsedMs(data.queryPlan?.elapsedMs ?? 0);
      setFeedbackEnabled(data.queryPlan?.feedbackEnabled === true);
      setSearchTraceOpen(false);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (requestId !== searchRequestIdRef.current) return;
      setSearchError("검색 서비스에 연결할 수 없습니다. 잠시 후 다시 검색해 주세요.");
      setResultBids([]);
      setDatabaseTotal(0);
      setSearchTotal(0);
      setEligibleTotal(0);
      setClosingSoonTotal(0);
      setAverageScore(0);
      setInterpretedConditions([]);
      setSemanticConditions([]);
      setSearchTrace([]);
      setSearchTraceId("");
      setSearchElapsedMs(0);
      setFeedbackEnabled(false);
      setSearchTraceOpen(false);
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setSearched(true);
        setIsSearching(false);
      }
    }
  }, []);

  const cancelScheduledSearch = () => {
    if (autoSearchTimerRef.current === null) return;
    window.clearTimeout(autoSearchTimerRef.current);
    autoSearchTimerRef.current = null;
  };

  const runSearchNow = (
    snapshot: SearchSnapshot,
    page = 1,
    searchTrigger: SearchTrigger = "filter_auto",
  ) => {
    cancelScheduledSearch();
    void runSearch(snapshot, page, searchTrigger);
  };

  const postRecommendationFeedback = async (
    bid: Bid,
    feedbackType: "positive" | "negative" | "exclude" | "clear",
    reasons: string[] = [],
    source: "favorite" | "detail" = "detail",
    searchId = searchTraceId,
    conditionIds: string[] = [],
  ) => {
    if (!feedbackEnabled) {
      throw new Error("추천 피드백 수집이 현재 비활성화되어 있습니다.");
    }
    if (!searchId) {
      throw new Error("검색 결과를 다시 불러온 후 피드백해 주세요.");
    }
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        searchId,
        bidId: bid.id,
        feedbackType,
        reason: reasons[0] ?? "",
        reasons,
        conditionIds,
        source,
      }),
    });
    const data = await response.json() as { message?: string; detail?: string };
    if (!response.ok) {
      throw new Error(data.detail ?? "피드백 처리 오류");
    }
    return data;
  };

  const submitRecommendationFeedback = async (
    bid: Bid,
    feedbackType: "positive" | "negative" | "exclude" | "clear",
    reasons: string[] = [],
  ) => {
    setFeedbackSubmittingId(bid.id);
    try {
      const data = await postRecommendationFeedback(
        bid,
        feedbackType,
        reasons,
        "detail",
        searchTraceId,
        semanticConditions
          .filter((condition) => {
            if (feedbackType === "positive") {
              return ["target", "action", "intent"].includes(condition.role);
            }
            return reasons.some((reason) => {
              const rolesByReason: Record<string, string[]> = {
                "검색 주제와 다름": ["target", "action", "intent"],
                "업무 구분이 다름": ["category"],
                "지역이 맞지 않음": ["region"],
                "사업금액이 맞지 않음": ["budget"],
                "계약방법이 맞지 않음": ["contract_method"],
                "수요기관이 맞지 않음": ["demand_agency"],
              };
              return (rolesByReason[reason] ?? []).includes(condition.role);
            });
          })
          .map((condition) => condition.id),
      );
      let nextFeedback: Bid["sessionFeedback"] = (
        feedbackType === "positive" || feedbackType === "negative"
          ? feedbackType
          : null
      );
      let nextSource: Bid["sessionFeedbackSource"] = (
        feedbackType === "clear" ? null : "detail"
      );
      let nextAdjustment = (
        feedbackType === "positive"
          ? 5
          : feedbackType === "negative" || feedbackType === "exclude"
          ? -6
          : 0
      );
      if (feedbackType === "clear" && saved.includes(bid.id)) {
        await postRecommendationFeedback(
          bid,
          "positive",
          [],
          "favorite",
          savedBids.find((item) => item.id === bid.id)?.favoriteSearchId
            || searchTraceId,
        );
        nextFeedback = "positive";
        nextSource = "favorite";
        nextAdjustment = 3;
      }
      setFeedbackBidId("");
      setSelectedFeedbackReasons([]);
      showSaveNotice(data.message ?? "추천 피드백을 반영했습니다.");
      setSelected((current) => current?.id === bid.id
        ? {
            ...current,
            sessionFeedback: nextFeedback,
            sessionFeedbackSource: nextSource,
            feedbackAdjustment: nextAdjustment,
          }
        : current);
      if (feedbackType === "exclude") {
        setSelected(null);
      }
      await runSearch(currentSearchSnapshot(), currentPage, "pagination");
    } catch (error) {
      showSaveNotice(
        error instanceof Error
          ? error.message
          : "피드백을 처리하지 못했습니다.",
      );
    } finally {
      setFeedbackSubmittingId("");
    }
  };

  const rememberSemanticQuery = (query: string) => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;

    setSemanticHistory((current) => {
      const comparisonQuery = normalizedQuery.toLocaleLowerCase("ko-KR");
      const next = [
        normalizedQuery,
        ...current.filter(
          (savedQuery) => savedQuery.toLocaleLowerCase("ko-KR") !== comparisonQuery,
        ),
      ].slice(0, SEMANTIC_HISTORY_LIMIT);
      window.localStorage.setItem(SEMANTIC_HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  };

  const runSemanticSearchNow = (snapshot: SearchSnapshot) => {
    const normalizedQuery = snapshot.semanticQuery.trim();
    rememberSemanticQuery(normalizedQuery);
    setSemanticQueryActive(Boolean(normalizedQuery));
    setSemanticHistoryOpen(false);
    runSearchNow(
      {
        ...snapshot,
        semanticQuery: normalizedQuery,
      },
      1,
      "ai_button",
    );
  };

  const selectSemanticHistory = (query: string) => {
    setSemanticQuery(query);
    setSemanticQueryActive(false);
    setInterpretedConditions([]);
    setSearchTrace([]);
    setSearchTraceId("");
    setSearchElapsedMs(0);
    setSearchTraceOpen(false);
    setSemanticHistoryOpen(false);
  };

  const deleteSemanticHistory = (query: string) => {
    setSemanticHistory((current) => {
      const next = current.filter((savedQuery) => savedQuery !== query);
      window.localStorage.setItem(SEMANTIC_HISTORY_KEY, JSON.stringify(next));
      return next;
    });
    showSaveNotice("저장된 AI 검색어를 삭제했습니다.");
  };

  const clearSemanticHistory = () => {
    setSemanticHistory([]);
    window.localStorage.removeItem(SEMANTIC_HISTORY_KEY);
    setSemanticHistoryOpen(false);
    showSaveNotice("저장된 AI 검색어를 모두 삭제했습니다.");
  };

  const prepareSemanticAnalysisState = (nextSemanticQuery: string) => {
    searchRequestIdRef.current += 1;
    searchAbortControllerRef.current?.abort();
    setSemanticQueryActive(Boolean(nextSemanticQuery.trim()));
    setInterpretedConditions([]);
    setSearchTrace([]);
    setSearchTraceId("");
    setSearchElapsedMs(0);
    setSearchTraceOpen(false);
  };

  const rememberKeywordHistory = (
    kind: "include" | "exclude" | "demandAgency",
    value: string,
  ) => {
    const normalizedValue = kind === "demandAgency"
      ? value.trim().replace(/[,，]+$/, "").trim()
      : value.trim();
    if (!normalizedValue) return;

    const storageKey = kind === "include"
      ? INCLUDE_KEYWORD_HISTORY_KEY
      : kind === "exclude"
      ? EXCLUDE_KEYWORD_HISTORY_KEY
      : DEMAND_AGENCY_HISTORY_KEY;
    const setHistory = kind === "include"
      ? setIncludeKeywordHistory
      : kind === "exclude"
      ? setExcludeKeywordHistory
      : setDemandAgencyHistory;
    setHistory((current) => {
      const comparisonValue = normalizedValue.toLocaleLowerCase("ko-KR");
      const next = [
        normalizedValue,
        ...current.filter(
          (savedValue) =>
            savedValue.toLocaleLowerCase("ko-KR") !== comparisonValue,
        ),
      ].slice(0, KEYWORD_HISTORY_LIMIT);
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  const selectKeywordHistory = (
    kind: "include" | "exclude" | "demandAgency",
    value: string,
  ) => {
    const snapshot = currentSearchSnapshot();
    if (kind === "include") {
      setIncludeKeyword(value);
      scheduleDetailSearch({ ...snapshot, includeKeyword: value }, 0);
    } else if (kind === "exclude") {
      setExcludeKeyword(value);
      scheduleDetailSearch({ ...snapshot, excludeKeyword: value }, 0);
    } else {
      setDemandAgencyInput(value);
      setAgencySuggestions([]);
      setAgencySuggestionsHasMore(false);
      setAgencySuggestionsOpen(false);
      setAgencySuggestionLimit(AGENCY_SUGGESTION_PAGE_SIZE);
      scheduleDetailSearch({ ...snapshot, demandAgencyInput: value }, 0);
    }
    setKeywordHistoryOpen(null);
  };

  const deleteKeywordHistory = (
    kind: "include" | "exclude" | "demandAgency",
    value: string,
  ) => {
    const storageKey = kind === "include"
      ? INCLUDE_KEYWORD_HISTORY_KEY
      : kind === "exclude"
      ? EXCLUDE_KEYWORD_HISTORY_KEY
      : DEMAND_AGENCY_HISTORY_KEY;
    const setHistory = kind === "include"
      ? setIncludeKeywordHistory
      : kind === "exclude"
      ? setExcludeKeywordHistory
      : setDemandAgencyHistory;
    setHistory((current) => {
      const next = current.filter((savedValue) => savedValue !== value);
      if (next.length > 0) {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } else {
        window.localStorage.removeItem(storageKey);
      }
      return next;
    });
  };

  const scheduleDetailSearch = (snapshot: SearchSnapshot, delay: number) => {
    const detailSnapshot = { ...snapshot };
    prepareSemanticAnalysisState(detailSnapshot.semanticQuery);
    cancelScheduledSearch();
    autoSearchTimerRef.current = window.setTimeout(() => {
      autoSearchTimerRef.current = null;
      rememberKeywordHistory("include", detailSnapshot.includeKeyword);
      rememberKeywordHistory("exclude", detailSnapshot.excludeKeyword);
      rememberKeywordHistory("demandAgency", detailSnapshot.demandAgencyInput);
      void runSearch(detailSnapshot, 1);
    }, delay);
  };

  const scrollToPageTop = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      behavior: reduceMotion ? "auto" : "smooth",
      left: 0,
      top: 0,
    });
  };

  const scrollToResultBottom = () => {
    if (!footerBottomRef.current) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    footerBottomRef.current.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "end",
    });
  };

  useEffect(() => {
    const initialSearch = window.setTimeout(() => {
      const isInsightsOpportunitySearch = new URLSearchParams(window.location.search)
        .get("source") === "insights";
      if (isInsightsOpportunitySearch) {
        setOnlyEligible(true);
        setClosingSoon(true);
        setClosingWithinDays(14);
        setSearchSortMode("opportunity");
        setSort("closing");
        void runSearch(INSIGHTS_OPPORTUNITY_SEARCH);
        return;
      }
      void runSearch(DEFAULT_SEARCH);
    }, 0);
    return () => {
      window.clearTimeout(initialSearch);
      if (autoSearchTimerRef.current !== null) {
        window.clearTimeout(autoSearchTimerRef.current);
      }
      searchAbortControllerRef.current?.abort();
    };
  }, [runSearch]);

  useEffect(() => {
    if (!savedBidsOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSavedBidsOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [savedBidsOpen]);

  const showSaveNotice = (message: string) => {
    setSaveNotice(message);
    window.setTimeout(() => setSaveNotice(""), 2400);
  };

  const openCompanyProfile = () => {
    setProfileDraft(profileToDraft(companyProfile));
    setProfileOpen(true);
  };

  const toggleProfileServiceRegion = (selectedRegion: string) => {
    setProfileDraft((current) => {
      if (selectedRegion === "전체 지역") {
        return {
          ...current,
          serviceRegions: current.serviceRegions.includes("전체 지역")
            ? []
            : ["전체 지역"],
        };
      }

      const individualRegions = current.serviceRegions.filter(
        (region) => region !== "전체 지역" && region !== "전국",
      );
      const serviceRegions = individualRegions.includes(selectedRegion)
        ? individualRegions.filter((region) => region !== selectedRegion)
        : [...individualRegions, selectedRegion];

      return { ...current, serviceRegions };
    });
  };

  const toggleProfileServiceAgencyType = (selectedAgencyType: string) => {
    setProfileDraft((current) => {
      if (selectedAgencyType === "전체 기관") {
        return {
          ...current,
          serviceAgencyTypes: current.serviceAgencyTypes.includes("전체 기관")
            ? []
            : ["전체 기관"],
        };
      }

      const individualTypes = current.serviceAgencyTypes.filter(
        (agencyType) => agencyType !== "전체 기관",
      );
      const serviceAgencyTypes = individualTypes.includes(selectedAgencyType)
        ? individualTypes.filter((agencyType) => agencyType !== selectedAgencyType)
        : [...individualTypes, selectedAgencyType];

      return { ...current, serviceAgencyTypes };
    });
  };

  const saveCompanyProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const budgetEok = Number(profileDraft.preferredMaxBudget);
    const profileWithoutCompletion: Omit<CompanyProfile, "completion"> = {
      name: profileDraft.name.trim().slice(0, 120),
      location: profileDraft.location.trim().slice(0, 120),
      size: profileDraft.size.trim().slice(0, 40),
      licenses: splitProfileValues(profileDraft.licenses),
      technologies: splitProfileValues(profileDraft.technologies),
      businessAreas: splitProfileValues(profileDraft.businessAreas),
      experiences: splitProfileValues(profileDraft.experiences),
      preferredMaxBudget: Number.isFinite(budgetEok) && budgetEok > 0
        ? Math.min(Math.round(budgetEok * 100_000_000), 100_000_000_000_000)
        : null,
      serviceRegions: normalizeServiceRegions(profileDraft.serviceRegions),
      serviceAgencyTypes: normalizeServiceAgencyTypes(profileDraft.serviceAgencyTypes),
      excludedBusinessAreas: splitProfileValues(profileDraft.excludedBusinessAreas),
    };
    const nextProfile: CompanyProfile = {
      ...profileWithoutCompletion,
      completion: profileCompletion(profileWithoutCompletion),
    };

    try {
      window.localStorage.setItem(COMPANY_PROFILE_KEY, JSON.stringify(nextProfile));
    } catch {
      showSaveNotice("기업 프로필을 브라우저에 저장하지 못했습니다.");
      return;
    }

    void fetch("/api/company/profile", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(nextProfile),
    }).catch(() => undefined);

    companyProfileRef.current = nextProfile;
    setCompanyProfile(nextProfile);
    setProfileDraft(profileToDraft(nextProfile));
    setProfileOpen(false);
    showSaveNotice("기업 프로필을 저장하고 검색에 반영했습니다.");
    runSearchNow(currentSearchSnapshot());
  };

  const restoreDefaultCompanyProfile = () => {
    setProfileDraft(profileToDraft(DEFAULT_COMPANY_PROFILE));
  };

  const persistSavedSearches = (next: SavedSearch[]) => {
    setSavedSearches(next);
    window.localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(next));
  };

  const openSaveSearch = () => {
    const keyword = includeKeyword.split(/[,，]/).map((word) => word.trim()).find(Boolean);
    const location = region === "전체 지역" ? "전체 지역" : region;
    setSavedSearchName(`${location} ${keyword || category} 검색`);
    setSaveSearchOpen(true);
  };

  const saveCurrentSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = savedSearchName.trim();
    if (!name) return;
    const next: SavedSearch[] = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        createdAt: new Date().toISOString(),
        filters: {
          ...currentSearchSnapshot(),
          semanticQuery: "",
        },
      },
      ...savedSearches,
    ].slice(0, 20);
    persistSavedSearches(next);
    setSaveSearchOpen(false);
    showSaveNotice("검색조건을 저장했습니다.");
  };

  const applySavedSearch = (savedSearch: SavedSearch) => {
    const snapshot = {
      ...savedSearch.filters,
      region: normalizeRegionFilter(savedSearch.filters.region),
      semanticQuery,
    };
    setCategory(snapshot.category);
    setRegion(snapshot.region);
    setMaxBudget(snapshot.maxBudget);
    setIncludeKeyword(snapshot.includeKeyword);
    setExcludeKeyword(snapshot.excludeKeyword);
    setDemandAgencyInput(snapshot.demandAgencyInput);
    setAgencySuggestions([]);
    setAgencySuggestionsHasMore(false);
    setAgencySuggestionLimit(AGENCY_SUGGESTION_PAGE_SIZE);
    prepareSemanticAnalysisState(snapshot.semanticQuery);
    setOnlyEligible(snapshot.onlyEligible);
    setClosingSoon(snapshot.closingSoon);
    setClosingWithinDays(
      snapshot.closingWithinDays ?? (snapshot.closingSoon ? 7 : null),
    );
    setSearchSortMode(snapshot.sortMode ?? null);
    setSaveSearchOpen(false);
    showSaveNotice(`‘${savedSearch.name}’ 조건을 적용했습니다.`);
    runSearchNow(snapshot);
  };

  const deleteSavedSearch = (id: string) => {
    persistSavedSearches(savedSearches.filter((savedSearch) => savedSearch.id !== id));
    showSaveNotice("저장한 검색조건을 삭제했습니다.");
  };

  const toggleSaved = async (bid: Bid) => {
    const alreadySaved = saved.includes(bid.id);
    const savedBid = savedBids.find((item) => item.id === bid.id);
    const favoriteSearchId = (
      savedBid?.favoriteSearchId
      || bid.favoriteSearchId
      || searchTraceId
    );
    const nextSavedBids = alreadySaved
      ? savedBids.filter((savedBid) => savedBid.id !== bid.id)
      : [
          ...savedBids.filter((savedBid) => savedBid.id !== bid.id),
          {
            ...bid,
            attachments: [],
            favoriteSearchId,
          },
        ].slice(-SAVED_BIDS_LIMIT);

    try {
      window.localStorage.setItem(SAVED_BIDS_KEY, JSON.stringify(nextSavedBids));
      setSavedBids(nextSavedBids);
    } catch {
      showSaveNotice("관심공고를 브라우저에 저장하지 못했습니다.");
      return;
    }

    if (!feedbackEnabled || !favoriteSearchId) {
      showSaveNotice(
        alreadySaved
          ? "관심공고에서 해제했습니다."
          : "관심공고에 저장했습니다.",
      );
      return;
    }

    setFeedbackSubmittingId(bid.id);
    try {
      const data = await postRecommendationFeedback(
        bid,
        alreadySaved ? "clear" : "positive",
        [],
        "favorite",
        favoriteSearchId,
      );
      const currentFeedbackSource = (
        resultBids.find((item) => item.id === bid.id)?.sessionFeedbackSource
        || (selected?.id === bid.id ? selected.sessionFeedbackSource : null)
        || bid.sessionFeedbackSource
      );
      if (currentFeedbackSource !== "detail") {
        const nextFeedback = alreadySaved ? null : "positive";
        const nextAdjustment = alreadySaved ? 0 : 3;
        setResultBids((current) => current.map((item) => item.id === bid.id
          ? {
              ...item,
              sessionFeedback: nextFeedback,
              sessionFeedbackSource: alreadySaved ? null : "favorite",
              feedbackAdjustment: nextAdjustment,
            }
          : item));
        setSelected((current) => current?.id === bid.id
          ? {
              ...current,
              sessionFeedback: nextFeedback,
              sessionFeedbackSource: alreadySaved ? null : "favorite",
              feedbackAdjustment: nextAdjustment,
            }
          : current);
      }
      showSaveNotice(
        data.message
        ?? (alreadySaved
          ? "관심공고에서 해제했습니다."
          : "관심공고에 저장하고 추천 가산점을 반영했습니다."),
      );
    } catch {
      showSaveNotice(
        alreadySaved
          ? "관심공고는 해제했으며 추천 가산점은 세션 만료 후 사라집니다."
          : "관심공고는 저장했지만 추천 가산점은 반영하지 못했습니다.",
      );
    } finally {
      setFeedbackSubmittingId("");
    }
  };

  const clearSavedBids = async () => {
    if (savedBids.length === 0 || clearingSavedBids) return;

    const confirmed = window.confirm(
      `관심공고 ${savedBids.length.toLocaleString("ko-KR")}건을 모두 삭제할까요?\n삭제한 관심공고는 복구할 수 없습니다.`,
    );
    if (!confirmed) return;

    const bidsToClear = [...savedBids];
    const savedBidIds = new Set(bidsToClear.map((bid) => bid.id));
    const clearFavoriteFeedback = (bid: Bid): Bid => (
      savedBidIds.has(bid.id) && bid.sessionFeedbackSource === "favorite"
        ? {
            ...bid,
            sessionFeedback: null,
            sessionFeedbackSource: null,
            feedbackAdjustment: 0,
          }
        : bid
    );

    setClearingSavedBids(true);
    try {
      window.localStorage.removeItem(SAVED_BIDS_KEY);
      setSavedBids([]);
      setResultBids((current) => current.map(clearFavoriteFeedback));
      setSelected((current) => current ? clearFavoriteFeedback(current) : current);
      setNoticeDetail((current) => current ? clearFavoriteFeedback(current) : current);
    } catch {
      setClearingSavedBids(false);
      showSaveNotice("관심공고 전체 삭제에 실패했습니다.");
      return;
    }

    const feedbackTargets = feedbackEnabled
      ? bidsToClear.filter((bid) => Boolean(bid.favoriteSearchId))
      : [];

    if (feedbackTargets.length === 0) {
      setClearingSavedBids(false);
      showSaveNotice("관심공고를 모두 삭제했습니다.");
      return;
    }

    const results = await Promise.allSettled(
      feedbackTargets.map((bid) => postRecommendationFeedback(
        bid,
        "clear",
        [],
        "favorite",
        bid.favoriteSearchId,
      )),
    );
    const failedCount = results.filter((result) => result.status === "rejected").length;

    setClearingSavedBids(false);
    showSaveNotice(
      failedCount > 0
        ? `관심공고는 모두 삭제했으며 추천 가산점 ${failedCount}건은 세션 만료 후 사라집니다.`
        : "관심공고를 모두 삭제하고 추천 가산점을 해제했습니다.",
    );
  };

  const openNoticeDetail = async (bid: Bid) => {
    setNoticeDetail(bid);
    setNoticeDetailLoading(true);
    setNoticeDetailError("");

    try {
      const response = await fetch(`/api/bids/${encodeURIComponent(bid.id)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("첨부문서 조회에 실패했습니다.");
      }
      const detail = await response.json() as Bid;
      setNoticeDetail((current) => current?.id === bid.id ? detail : current);
    } catch {
      setNoticeDetailError("첨부문서를 불러오지 못했습니다. 나라장터 원문에서 확인해 주세요.");
    } finally {
      setNoticeDetailLoading(false);
    }
  };

  return (
    <main className={`app-shell ${theme}`}>
      {/* ── Topbar ── */}
      <header className="topbar">
        <a className="logo" href="#top" aria-label="FindBid 홈">
          <span className="logo-symbol" aria-hidden="true">
            <img className="logo-mark logo-mark-light" src="/findbid-b-icon-3x.png" alt="" />
            <img className="logo-mark logo-mark-dark" src="/findbid-b-icon-3x-dark.png" alt="" />
          </span>
          <span className="logo-copy">
            <strong>
              <span className="word-find">Find</span>
              <span className="word-bid">Bid</span>
            </strong>
            <small>AI Bid Searcher</small>
          </span>
        </a>

        <nav className="main-nav" aria-label="주요 메뉴">
          <a className="active" href="#search">
            <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="5.5" />
              <path d="m15 15 4.5 4.5" />
            </svg>
            입찰 탐색
          </a>
          <a href="/insights">
            <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 19V11M12 19V5M19 19v-8" />
              <path d="m4 8 5-4 4 4 6-5" />
            </svg>
            인사이트
          </a>
          <button type="button" onClick={() => setNotificationsOpen(true)} aria-haspopup="dialog">
            <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
              <path d="M10 21h4" />
            </svg>
            알림
          </button>
        </nav>

        <div className="top-actions">
          <div className="connection-state" aria-label="검색 서비스 연결됨">
            <span />
            <small>연결됨</small>
          </div>
          <button
            className="icon-button theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
          >
            {theme === "dark" ? (
              <svg className="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
              </svg>
            ) : (
              <svg className="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />
              </svg>
            )}
          </button>
          <button
            className="icon-button saved-bids-header-button"
            type="button"
            onClick={() => setSavedBidsOpen(true)}
            aria-label={`관심공고 ${saved.length}건 보기`}
            title="관심공고 보기"
          >
            <svg
              className="saved-bids-cart-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path className="cart-outline" d="M1 3.5h3.2l1.6 12h13.4L21.5 5.5" />
              <path className="cart-diamond" d="m12.7 1.2 6.5 6.5-6.5 6.5-6.5-6.5 6.5-6.5Z" />
              <circle cx="7.5" cy="20" r="1.3" />
              <circle cx="18" cy="20" r="1.3" />
            </svg>
            {saved.length > 0 && (
              <i aria-hidden="true">
                {saved.length > 99 ? "99+" : saved.length}
              </i>
            )}
          </button>
          <button className="profile-button" type="button" onClick={openCompanyProfile}>
            <span className="avatar" aria-hidden="true">
              <span className="profile-initials">{companyProfileInitials(companyProfile.name)}</span>
            </span>
            <span className="profile-copy">
              <strong>{companyProfile.name}</strong>
              <small>프로필 {companyProfile.completion}% 완성</small>
            </span>
            <span aria-hidden="true">⌄</span>
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="hero" id="top">
        <div className="hero-glow hero-glow-one" />
        <div className="hero-glow hero-glow-two" />
        <div className="hero-inner">
          <div className="eyebrow">
            <span />
            SMART BID SEARCHING
          </div>
          <h1>
            우리 회사에 맞는 입찰,<br />
            <span>AI가 먼저 찾아드립니다.</span>
          </h1>
          <p>
            인공지능이 검색 의도를 분석해 최적의 입찰공고를 탐색하여 분석정보와 함께 제공합니다.
          </p>

          {/* Semantic Search Card */}
          <div className="semantic-card" id="search">
            <div className="search-head">
              <div>
                <span className="spark" aria-hidden="true">✦</span>
                <strong>AI 시맨틱 검색</strong> <span className="section-kicker">AI SYMANTIC SEARCH</span>
                {/* <span className="beta">BETA</span> */}
              </div>
              <div className="search-head-actions">
                <button
                  type="button"
                  className="semantic-input-clear"
                  onClick={() => {
                    setSemanticQuery("");
                    prepareSemanticAnalysisState("");
                  }}
                >
                  <span aria-hidden="true">×</span>
                  입력 지우기
                </button>
                <div className="semantic-history" ref={semanticHistoryRef}>
                  <button
                    type="button"
                    className="semantic-history-toggle"
                    aria-expanded={semanticHistoryOpen}
                    aria-controls="semantic-history-panel"
                    onClick={() => setSemanticHistoryOpen((open) => !open)}
                  >
                    최근 검색어
                    <span>{semanticHistory.length}</span>
                  </button>
                  {semanticHistoryOpen && (
                    <div
                      id="semantic-history-panel"
                      className="semantic-history-panel"
                      aria-label="저장된 AI 검색어"
                    >
                      <div className="semantic-history-head">
                        <strong>저장된 AI 검색어</strong>
                        {semanticHistory.length > 0 && (
                          <button type="button" onClick={clearSemanticHistory}>
                            전체 삭제
                          </button>
                        )}
                      </div>
                      {semanticHistory.length === 0 ? (
                        <p>저장된 검색어가 없습니다.</p>
                      ) : (
                        <ul>
                          {semanticHistory.map((query) => (
                            <li key={query}>
                              <button
                                type="button"
                                className="semantic-history-select"
                                onClick={() => selectSemanticHistory(query)}
                                title={query}
                              >
                                {query}
                              </button>
                              <button
                                type="button"
                                className="semantic-history-delete"
                                onClick={() => deleteSemanticHistory(query)}
                                aria-label={`‘${query}’ 검색어 삭제`}
                              >
                                삭제
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="semantic-input">
              <textarea
                value={semanticQuery}
                onChange={(event) => {
                  setSemanticQuery(event.target.value);
                  setSemanticQueryActive(false);
                  setInterpretedConditions([]);
                }}
                onKeyDown={(event) => {
                  if (
                    event.key !== "Enter"
                    || event.shiftKey
                    || event.nativeEvent.isComposing
                  ) {
                    return;
                  }
                  event.preventDefault();
                  runSemanticSearchNow({
                    ...currentSearchSnapshot(),
                    semanticQuery: event.currentTarget.value,
                  });
                }}
                enterKeyHint="search"
                aria-label="찾고 싶은 입찰사업을 자연어로 입력"
                placeholder="서울 경기에 인공지능 시스템 구축 용역 사업으로 5억원이상 10억원 이하의 수의계약 또는 제한경쟁 사업을 찾아줘"
              />
              <button
                type="button"
                onClick={() => {
                  runSemanticSearchNow(currentSearchSnapshot());
                }}
                className="search-button"
              >
                <span className="search-button-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <circle cx="10.5" cy="10.5" r="6.5" />
                    <path d="m15.5 15.5 5 5" />
                  </svg>
                </span>
                <span className="search-button-label">
                  {isSearching ? "분석 중…" : "AI로 검색"}
                </span>
              </button>
            </div>
            <div className="parsed-intent">
              <div className="intent-heading">
                <span className="intent-label">AI가 이해한 조건</span>
                {searchTrace.length > 0 && (
                  <button
                    type="button"
                    className="search-trace-toggle"
                    aria-expanded={searchTraceOpen}
                    aria-controls="search-trace-panel"
                    title={
                      searchTraceId
                        ? `검색 과정 · ${searchElapsedMs.toLocaleString("ko-KR")}ms · ${searchTraceId}`
                        : `검색 과정 · ${searchElapsedMs.toLocaleString("ko-KR")}ms`
                    }
                    onClick={() => setSearchTraceOpen((open) => !open)}
                  >
                    <span>검색 과정 보기</span>
                    <small>{searchElapsedMs.toLocaleString("ko-KR")}ms</small>
                    <span aria-hidden="true">{searchTraceOpen ? "−" : "+"}</span>
                  </button>
                )}
              </div>
              <div className="intent-values">
                {semanticQuery.trim() ? (
                  !semanticQueryActive ? (
                    <span>입력 문장은 아직 검색에 적용되지 않았습니다.</span>
                  ) : interpretedConditions.length > 0 ? (
                    interpretedConditions.map((condition) => (
                      <span
                        key={condition}
                        className={condition.startsWith("제외:") ? "exclude" : undefined}
                      >
                        {condition}
                      </span>
                    ))
                  ) : (
                    <span>문장 전체 의미로 검색</span>
                  )
                ) : (
                  <span>자연어 검색어를 입력해 주세요.</span>
                )}
              </div>
              {searchTrace.length > 0 && searchTraceOpen && (
                <div id="search-trace-panel" className="search-trace-panel">
                  <ol>
                    {searchTrace.map((entry, index) => (
                      <li key={`${index}-${entry}`}>{entry}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Workspace ── */}
      <section className="workspace">
        {filtersOpen && (
          <button
            className="filter-backdrop"
            type="button"
            onClick={() => setFiltersOpen(false)}
            aria-label="상세 조건 닫기"
          />
        )}

        {/* Filter Sidebar */}
        <aside
          id="mobile-filters"
          className={`filters ${filtersOpen ? "mobile-open" : ""}`}
          aria-label="검색 상세 조건"
        >
          <div className="aside-title">
            <div>
              <span className="section-kicker">SEARCH FILTER</span>
              <h2>검색 상세 조건</h2>
            </div>
            <button
              className="title-reset-button"
              type="button"
              onClick={() => {
                const resetSnapshot = {
                  ...currentSearchSnapshot(),
                  category: "전체" as const,
                  region: "전체 지역",
                  maxBudget: 0,
                  includeKeyword: "",
                  excludeKeyword: "",
                  demandAgencyInput: "",
                  onlyEligible: false,
                  closingSoon: false,
                  closingWithinDays: null,
                  sortMode: null,
                };
                setCategory("전체");
                setRegion("전체 지역");
                setMaxBudget(0);
                setIncludeKeyword("");
                setExcludeKeyword("");
                setDemandAgencyInput("");
                setAgencySuggestions([]);
                setAgencySuggestionsHasMore(false);
                setAgencySuggestionLimit(AGENCY_SUGGESTION_PAGE_SIZE);
                prepareSemanticAnalysisState(resetSnapshot.semanticQuery);
                setOnlyEligible(false);
                setClosingSoon(false);
                setClosingWithinDays(null);
                setSearchSortMode(null);
                runSearchNow(resetSnapshot);
              }}
            >
              <span aria-hidden="true">↻</span>
              조건 초기화
            </button>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              aria-label="필터 닫기"
            >
              ×
            </button>
          </div>

          <div className="filter-scroll">

          {/* Category */}
          <div className="filter-group">
            <label>업무 구분</label>
            <div className="segment-control">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={category === item ? "active" : ""}
                  onClick={() => {
                    setCategory(item);
                    scheduleDetailSearch(
                      { ...currentSearchSnapshot(), category: item },
                      0,
                    );
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {/* Region & Budget */}
          <div className="filter-group two-cols">
            <div>
              <label htmlFor="region">참가 지역</label>
              <select
                id="region"
                value={region}
                onChange={(event) => {
                  const nextRegion = event.target.value;
                  setRegion(nextRegion);
                  scheduleDetailSearch(
                    { ...currentSearchSnapshot(), region: nextRegion },
                    0,
                  );
                }}
              >
                {regions.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="budget">사업금액(VAT별도)</label>
              <select
                id="budget"
                value={maxBudget}
                onChange={(event) => {
                  const nextBudget = Number(event.target.value);
                  setMaxBudget(nextBudget);
                  scheduleDetailSearch(
                    { ...currentSearchSnapshot(), maxBudget: nextBudget },
                    0,
                  );
                }}
              >
                {budgetOptions.map((item) => (
                  <option key={item.label} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Include Keywords */}
          <div className="filter-group include-keyword-group">
            <label htmlFor="include">포함 키워드</label>
            <div className="input-with-icon">
              <span aria-hidden="true">＋</span>
              <input
                ref={includeKeywordInputRef}
                id="include"
                value={includeKeyword}
                title={includeKeywordOverflowing ? includeKeyword : undefined}
                onFocus={() => {
                  if (!includeKeyword.trim()) setKeywordHistoryOpen("include");
                }}
                onClick={() => {
                  if (!includeKeyword.trim()) setKeywordHistoryOpen("include");
                }}
                onBlur={() => window.setTimeout(() => setKeywordHistoryOpen(null), 120)}
                onChange={(event) => {
                  const nextKeyword = event.target.value;
                  setIncludeKeyword(nextKeyword);
                  setKeywordHistoryOpen(nextKeyword.trim() ? null : "include");
                  scheduleDetailSearch(
                    { ...currentSearchSnapshot(), includeKeyword: nextKeyword },
                    500,
                  );
                }}
                autoComplete="off"
                placeholder="AI, 웹서비스, 플랫폼"
              />
            </div>
            {keywordHistoryOpen === "include"
              && !includeKeyword.trim()
              && includeKeywordHistory.length > 0 && (
              <div className="keyword-history-list" role="listbox" aria-label="최근 포함키워드">
                {includeKeywordHistory.map((value) => (
                  <div className="keyword-history-item" key={value}>
                    <button
                      className="keyword-history-select"
                      type="button"
                      role="option"
                      aria-selected="false"
                      title={value}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectKeywordHistory("include", value)}
                    >
                      {value}
                    </button>
                    <button
                      className="keyword-history-delete"
                      type="button"
                      aria-label={`${value} 포함키워드 이력 삭제`}
                      title="삭제"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => deleteKeywordHistory("include", value)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Exclude Keywords */}
          <div className="filter-group exclude-keyword-group">
            <label htmlFor="exclude">제외 키워드</label>
            <div className="input-with-icon danger">
              <span aria-hidden="true">－</span>
              <input
                ref={excludeKeywordInputRef}
                id="exclude"
                value={excludeKeyword}
                title={excludeKeywordOverflowing ? excludeKeyword : undefined}
                onFocus={() => {
                  if (!excludeKeyword.trim()) setKeywordHistoryOpen("exclude");
                }}
                onClick={() => {
                  if (!excludeKeyword.trim()) setKeywordHistoryOpen("exclude");
                }}
                onBlur={() => window.setTimeout(() => setKeywordHistoryOpen(null), 120)}
                onChange={(event) => {
                  const nextKeyword = event.target.value;
                  setExcludeKeyword(nextKeyword);
                  setKeywordHistoryOpen(nextKeyword.trim() ? null : "exclude");
                  scheduleDetailSearch(
                    { ...currentSearchSnapshot(), excludeKeyword: nextKeyword },
                    500,
                  );
                }}
                autoComplete="off"
                placeholder="장비 납품, 인력파견"
              />
            </div>
            {keywordHistoryOpen === "exclude"
              && !excludeKeyword.trim()
              && excludeKeywordHistory.length > 0 && (
              <div className="keyword-history-list" role="listbox" aria-label="최근 제외키워드">
                {excludeKeywordHistory.map((value) => (
                  <div className="keyword-history-item" key={value}>
                    <button
                      className="keyword-history-select"
                      type="button"
                      role="option"
                      aria-selected="false"
                      title={value}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectKeywordHistory("exclude", value)}
                    >
                      {value}
                    </button>
                    <button
                      className="keyword-history-delete"
                      type="button"
                      aria-label={`${value} 제외키워드 이력 삭제`}
                      title="삭제"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => deleteKeywordHistory("exclude", value)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Demand Agencies */}
          <div className="filter-group agency-autocomplete">
            <label htmlFor="demand-agency">수요기관</label>
            <div className="input-with-icon">
              <span aria-hidden="true">⌂</span>
              <input
                ref={demandAgencyInputRef}
                id="demand-agency"
                value={demandAgencyInput}
                title={demandAgencyInputOverflowing ? demandAgencyInput : undefined}
                onFocus={() => {
                  setAgencySuggestionsOpen(true);
                  if (!demandAgencyInput.trim()) {
                    setKeywordHistoryOpen("demandAgency");
                  }
                }}
                onClick={() => {
                  if (!demandAgencyInput.trim()) {
                    setKeywordHistoryOpen("demandAgency");
                  }
                }}
                onBlur={() => window.setTimeout(() => {
                  setAgencySuggestionsOpen(false);
                  setKeywordHistoryOpen(null);
                }, 120)}
                onChange={(event) => {
                  const nextAgencyInput = event.target.value;
                  setDemandAgencyInput(nextAgencyInput);
                  setAgencySuggestionLimit(AGENCY_SUGGESTION_PAGE_SIZE);
                  setAgencySuggestionsOpen(true);
                  setKeywordHistoryOpen(
                    nextAgencyInput.trim() ? null : "demandAgency",
                  );
                  scheduleDetailSearch(
                    { ...currentSearchSnapshot(), demandAgencyInput: nextAgencyInput },
                    500,
                  );
                }}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={agencySuggestionsOpen && agencySuggestions.length > 0}
                aria-controls="demand-agency-suggestions"
                autoComplete="off"
                placeholder="조달청, 한국소비자원"
              />
            </div>
            {keywordHistoryOpen === "demandAgency"
              && !demandAgencyInput.trim()
              && demandAgencyHistory.length > 0 && (
              <div className="keyword-history-list" role="listbox" aria-label="최근 수요기관">
                {demandAgencyHistory.map((value) => (
                  <div className="keyword-history-item" key={value}>
                    <button
                      className="keyword-history-select"
                      type="button"
                      role="option"
                      aria-selected="false"
                      title={value}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectKeywordHistory("demandAgency", value)}
                    >
                      {value}
                    </button>
                    <button
                      className="keyword-history-delete"
                      type="button"
                      aria-label={`${value} 수요기관 이력 삭제`}
                      title="삭제"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => deleteKeywordHistory("demandAgency", value)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {agencySuggestionsOpen
              && activeDemandAgencyFragment(demandAgencyInput).length >= 2 && (
              <div
                id="demand-agency-suggestions"
                className="agency-suggestion-list"
                role="listbox"
                aria-label="최상위기관 검색 결과"
              >
                {agencySuggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.agencyCode}-${suggestion.agencyName}`}
                    type="button"
                    role="option"
                    aria-selected="false"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      const nextAgencyInput = replaceDemandAgencyFragment(
                        demandAgencyInput,
                        suggestion.agencyName,
                      );
                      setDemandAgencyInput(nextAgencyInput);
                      setAgencySuggestions([]);
                      setAgencySuggestionsHasMore(false);
                      setAgencySuggestionsOpen(false);
                      setAgencySuggestionLimit(AGENCY_SUGGESTION_PAGE_SIZE);
                      scheduleDetailSearch(
                        { ...currentSearchSnapshot(), demandAgencyInput: nextAgencyInput },
                        0,
                      );
                    }}
                  >
                    <strong>{suggestion.agencyName}</strong>
                    <small>
                      공고 {suggestion.bidCount.toLocaleString()}건
                    </small>
                  </button>
                ))}
                {agencySuggestionsHasMore
                  && agencySuggestionLimit < AGENCY_SUGGESTION_MAX && (
                  <button
                    className="agency-suggestion-more"
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setAgencySuggestionLimit((current) => Math.min(
                        current + AGENCY_SUGGESTION_PAGE_SIZE,
                        AGENCY_SUGGESTION_MAX,
                      ));
                    }}
                  >
                    <strong>더 보기</strong>
                    <small>20개 추가</small>
                  </button>
                )}
                {!agencySuggestions.some(
                  (suggestion) => suggestion.agencyName
                    === activeDemandAgencyFragment(demandAgencyInput),
                ) && (
                  <button
                    className="agency-suggestion-direct"
                    type="button"
                    role="option"
                    aria-selected="false"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      const directAgencyName = activeDemandAgencyFragment(
                        demandAgencyInput,
                      );
                      const nextAgencyInput = replaceDemandAgencyFragment(
                        demandAgencyInput,
                        directAgencyName,
                      );
                      setDemandAgencyInput(nextAgencyInput);
                      setAgencySuggestions([]);
                      setAgencySuggestionsHasMore(false);
                      setAgencySuggestionsOpen(false);
                      setAgencySuggestionLimit(AGENCY_SUGGESTION_PAGE_SIZE);
                      scheduleDetailSearch(
                        { ...currentSearchSnapshot(), demandAgencyInput: nextAgencyInput },
                        0,
                      );
                    }}
                  >
                    <strong>
                      ‘{activeDemandAgencyFragment(demandAgencyInput)}’ 입력
                    </strong>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Toggles */}
          <div className="filter-group toggle-group">
            <Toggle
              checked={onlyEligible}
              onChange={() => {
                const nextOnlyEligible = !onlyEligible;
                setOnlyEligible(nextOnlyEligible);
                scheduleDetailSearch(
                  { ...currentSearchSnapshot(), onlyEligible: nextOnlyEligible },
                  0,
                );
              }}
              label="참가 가능"
            />
            <Toggle
              checked={closingSoon}
              onChange={() => {
                const nextClosingSoon = !closingSoon;
                const nextClosingWithinDays = nextClosingSoon ? 7 : null;
                setClosingSoon(nextClosingSoon);
                setClosingWithinDays(nextClosingWithinDays);
                scheduleDetailSearch(
                  {
                    ...currentSearchSnapshot(),
                    closingSoon: nextClosingSoon,
                    closingWithinDays: nextClosingWithinDays,
                  },
                  0,
                );
              }}
              label={closingWithinDays === 14 ? "14일 이내 마감" : "7일 이내 마감"}
            />
          </div>

          {/* Action Buttons */}
          {/*
          <button
            className="apply-button"
            type="button"
            onClick={() => { runSearchNow(currentSearchSnapshot()); setFiltersOpen(false); }}
          >
            조건 적용하기
          </button>
          */}
          <button
            className="apply-button"
            type="button"
            onClick={openSaveSearch}
          >
            ＋ 검색조건 저장/선택
          </button>

          {/* Profile Health */}
          <div className="profile-health">
            <div className="health-head">
              <div>
                <Mark>{companyProfileInitials(companyProfile.name)}</Mark>
                <span>
                  <strong>기업 프로필</strong>
                  <small>정확도를 높여보세요</small>
                </span>
              </div>
              <strong>{companyProfile.completion}%</strong>
            </div>
            <div className="progress">
              <span style={{ width: `${companyProfile.completion}%` }} />
            </div>
            <button type="button" onClick={() => setProfileOpen(true)}>
              프로필 보완하기
              <span>→</span>
            </button>
          </div>

          <a
            className="trander-banner"
            href="https://www.trander.it"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="입찰공고 AI 분석 플랫폼 - Trander 새 창에서 열기"
          >
            <span className="trander-banner-kicker">AI BID ANALYSIS</span>
            <strong>입찰공고 AI 분석 플랫폼</strong>
            <span className="trander-banner-brand">
              - Trander
              <span aria-hidden="true">↗</span>
            </span>
          </a>
          </div>
        </aside>

        {/* Results */}
        <div className="results">
          {/* Metric Cards */}
          <div className="metrics">
            <article>
              <span className="metric-icon mint"><span>⌕</span></span>
              <div>
                <small>전체 공고</small>
                <strong>{databaseTotal.toLocaleString("ko-KR")}<em>건</em></strong>
              </div>
            </article>
            <article>
              <span className="metric-icon blue"><span>✓</span></span>
              <div>
                <small>참가 가능</small>
                <strong>{eligibleTotal.toLocaleString("ko-KR")}<em>건</em></strong>
              </div>
            </article>
            <article>
              <span className="metric-icon gold"><span>✦</span></span>
              <div>
                <small>평균 적합도</small>
                <strong>{averageScore.toLocaleString("ko-KR")}<em>점</em></strong>
              </div>
            </article>
            <article>
              <span className="metric-icon rose"><span>◷</span></span>
              <div>
                <small>7일 내 마감</small>
                <strong>{closingSoonTotal.toLocaleString("ko-KR")}<em>건</em></strong>
              </div>
            </article>
          </div>

          {/* Toolbar */}
          <div className="result-toolbar">
            <div>
              <button
                className="mobile-filter"
                type="button"
                onClick={() => setFiltersOpen(true)}
                aria-controls="mobile-filters"
                aria-expanded={filtersOpen}
              >
                ☷ 상세 조건
              </button>
              <span className="section-kicker">RECOMMENDED BIDS</span>
              <h2>
                AI 추천 입찰공고
                <span className="recommendation-count">
                  {searchTotal.toLocaleString("ko-KR")}<em>건</em>
                </span>
              </h2>
              <div className="recommendation-notice">
                <button
                  className="recommendation-notice-trigger"
                  type="button"
                  aria-controls="recommendation-notice-popover"
                  aria-expanded={recommendationNoticeOpen}
                  onClick={() => setRecommendationNoticeOpen(true)}
                >
                  <span className="recommendation-notice-icon" aria-hidden="true">⚠</span>
                  주의사항 보기
                </button>
                {recommendationNoticeOpen && (
                  <div
                    id="recommendation-notice-popover"
                    className="recommendation-notice-popover"
                    role="dialog"
                    aria-label="입찰공고 주의사항"
                  >
                    <p>
                      제공되는 정보는 G2B API에 의하여 수집된 입찰공고를 기준으로 검색하며, 모든 나라장터 입찰공고를 포함하는것을 보장하지는 않습니다.
                      <br></br>모든 입찰공고의 정보는 나라장터 원문의 내용과 다를 수 있으므로 반드시 공고 원문 및 첨부 파일을 확인하시기 바랍니다.
                      <br></br>또한, 추천 입찰공고는 현재 주어진 정보에 근거하여 AI가 분석한 결과를 기반으로 제공되며, 실제 입찰 결과와 다를 수 있습니다.
                    </p>
                    <button
                      type="button"
                      onClick={() => setRecommendationNoticeOpen(false)}
                    >
                      확인
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="toolbar-actions">
              <select
                aria-label="정렬 기준"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="score">적합도 높은 순</option>
                <option value="closing">마감 임박 순</option>
                <option value="budget">금액 높은 순</option>
              </select>
            </div>
          </div>

          {/* Bid List */}
          <div
            className={`result-list ${isSearching ? "is-loading" : ""}`}
            aria-busy={isSearching}
          >
            {!searched ? (
              <div className="empty-state" role="status">
                <span>⌕</span>
                <h3>실제 입찰공고를 불러오는 중입니다</h3>
                <p>검색조건에 맞는 공고를 데이터베이스에서 조회하고 있습니다.</p>
              </div>
            ) : filteredBids.length === 0 ? (
              <div className="empty-state">
                <span>⌕</span>
                <h3>조건에 맞는 공고가 없습니다</h3>
                <p>포함 키워드를 줄이거나 사업 금액 범위를 넓혀보세요.</p>
                <button
                  type="button"
                  onClick={() => { setIncludeKeyword(""); setMaxBudget(0); }}
                >
                  조건 완화하기
                </button>
              </div>
            ) : (
              filteredBids.map((bid, index) => (
                <article className="bid-card" key={bid.id}>
                  <div className="bid-score">
                    <ScoreRing score={bid.score} />
                    <StatusBadge value={bid.eligibility} />
                    <span className="score-confidence">
                      신뢰도 {bid.scoreConfidence ?? 0}%
                    </span>
                  </div>
                  <div className="bid-content">
                    <div className="bid-meta-top">
                      <span
                        className="bid-sequence"
                        aria-label={`검색결과 ${(currentPage - 1) * PAGE_SIZE + index + 1}번`}
                      >
                        {(currentPage - 1) * PAGE_SIZE + index + 1}
                      </span>
                      <span className={`category category-${bid.category}`}>{bid.category}</span>
                      {bid.isNew && <span className="new-label">NEW</span>}
                      <span>{bid.noticeNo}</span>
                      <button
                        type="button"
                        className={`bookmark ${saved.includes(bid.id) ? "saved" : ""}`}
                        onClick={() => void toggleSaved(bid)}
                        aria-label={saved.includes(bid.id) ? "관심 공고 해제" : "관심 공고 저장"}
                      >
                        {saved.includes(bid.id) ? "◆" : "◇"}
                      </button>
                    </div>
                    <BidTitle
                      bid={bid}
                      onOpen={() => void openNoticeDetail(bid)}
                    />
                    <p className="bid-summary">{bid.summary}</p>

                    <div className="bid-facts">
                      <div>
                        <span>수요기관</span>
                        <AgencyName bidId={bid.id} name={bid.demandAgency} />
                      </div>
                      <div>
                        <span>사업금액(VAT별도)</span>
                        <strong>{bid.budgetLabel}</strong>
                      </div>
                      <div>
                        <span>계약방법</span>
                        <strong>{bid.contractMethod}</strong>
                      </div>
                      <div>
                        <span>참가지역</span>
                        <strong>{bid.region}</strong>
                      </div>
                    </div>

                    <div className="match-row">
                      <div className="match-group">
                        <span className="match-label">일치역량</span>
                        {bid.matched.length > 0 ? (
                          bid.matched.map((item) => (
                            <span key={item}>✓ {item}</span>
                          ))
                        ) : (
                          <span>일치역량 없음</span>
                        )}
                      </div>
                      {(bid.matchedConditions ?? []).length > 0 && (
                        <div className="match-group search-condition-group">
                          <span className="match-label">검색조건</span>
                          {(bid.matchedConditions ?? []).map((item) => (
                            <span key={item}>✓ {item}</span>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                  <div className="bid-deadline">
                    <span>입찰 마감</span>
                    <strong>D-{bid.daysLeft}</strong>
                    <time>{bid.closeAt}</time>
                    <button
                      type="button"
                      onClick={() => setSelected(bid)}
                      aria-label={`${bid.title} AI 상세 분석`}
                    >
                      상세 분석
                      <span>→</span>
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          {searched && totalPages > 1 && (
            <nav className="pagination" aria-label="검색결과 페이지">
              <button
                type="button"
                className="pagination-direction"
                disabled={currentPage === 1}
                onClick={() => runSearchNow(
                  currentSearchSnapshot(),
                  Math.max(1, currentPage - PAGE_JUMP),
                  "pagination",
                )}
              >
                이전 5페이지
              </button>
              {pageWindowStart > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => runSearchNow(currentSearchSnapshot(), 1, "pagination")}
                  >
                    1
                  </button>
                  {pageWindowStart > 2 && <span aria-hidden="true">…</span>}
                </>
              )}
              {pageNumbers.map((page) => (
                <button
                  type="button"
                  key={page}
                  className={page === currentPage ? "active" : ""}
                  aria-current={page === currentPage ? "page" : undefined}
                  onClick={() => runSearchNow(currentSearchSnapshot(), page, "pagination")}
                >
                  {page}
                </button>
              ))}
              {pageWindowEnd < totalPages && (
                <>
                  {pageWindowEnd < totalPages - 1 && <span aria-hidden="true">…</span>}
                  <button
                    type="button"
                    onClick={() => runSearchNow(currentSearchSnapshot(), totalPages, "pagination")}
                  >
                    {totalPages}
                  </button>
                </>
              )}
              <button
                type="button"
                className="pagination-direction"
                disabled={currentPage === totalPages}
                onClick={() => runSearchNow(
                  currentSearchSnapshot(),
                  Math.min(totalPages, currentPage + PAGE_JUMP),
                  "pagination",
                )}
              >
                다음 5페이지
              </button>
            </nav>
          )}

          {searched && filteredBids.length > 0 && (
            <div className="result-scroll-controls" aria-label="공고 목록 빠른 이동">
              <button
                type="button"
                onClick={scrollToPageTop}
                aria-label="페이지 최상단으로 이동"
                title="페이지 최상단으로 이동"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={scrollToResultBottom}
                aria-label="공고 목록 하단으로 이동"
                title="공고 목록 하단으로 이동"
              >
                ↓
              </button>
            </div>
          )}

          {/* <div className="source-note">
            <span>ⓘ</span>
            {searchError || "G2B 입찰공고 데이터베이스의 검색결과입니다."}
          </div> */}
        </div>
      </section>

      {/* ── Notice Detail Drawer ── */}
      {noticeDetail && (
        <div
          className="drawer-layer"
          role="presentation"
          onMouseDown={() => setNoticeDetail(null)}
        >
          <aside
            className="detail-drawer notice-detail-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="입찰공고 상세정보"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="drawer-head">
              <div>
                <span className={`category category-${noticeDetail.category}`}>
                  {noticeDetail.category}
                </span>
                <span>{noticeDetail.noticeNo}</span>
              </div>
              <button
                type="button"
                onClick={() => setNoticeDetail(null)}
                aria-label="공고 상세정보 창 닫기"
              >
                ×
              </button>
            </div>

            <div className="notice-detail-title">
              <span className="section-kicker">NOTICE INFORMATION</span>
              <h2>{noticeDetail.title}</h2>
              <div>
                <StatusBadge value={noticeDetail.eligibility} />
                {noticeDetail.isNew && <span className="new-badge">NEW</span>}
              </div>
            </div>

            <section className="notice-summary">
              <h3>공고 개요</h3>
              <p>
                {noticeDetail.summary || "등록된 공고 설명이 없습니다. 원문 공고에서 세부 내용을 확인해 주세요."}
              </p>
            </section>

            <div className="drawer-grid notice-fact-grid">
              <div>
                <span>공고번호</span>
                <strong>{noticeDetail.noticeNo}</strong>
              </div>
              <div>
                <span>업무 구분</span>
                <strong>{noticeDetail.category}</strong>
              </div>
              <div>
                <span>공고기관</span>
                <strong>{noticeDetail.agency}</strong>
              </div>
              <div>
                <span>수요기관</span>
                <strong>{noticeDetail.demandAgency}</strong>
              </div>
              <div>
                <span>사업금액(VAT별도)</span>
                <strong>{noticeDetail.budgetLabel}</strong>
              </div>
              <div>
                <span>마감일시</span>
                <strong>{noticeDetail.closeAt}</strong>
              </div>
              <div>
                <span>계약방법</span>
                <strong>{noticeDetail.contractMethod}</strong>
              </div>
              <div>
                <span>낙찰방법</span>
                <strong>{noticeDetail.awardMethod}</strong>
              </div>
              <div>
                <span>참가 지역</span>
                <strong>{noticeDetail.region}</strong>
              </div>
              <div>
                <span>참가 상태</span>
                <strong>{noticeDetail.eligibility}</strong>
              </div>
            </div>

            <section className="analysis-section notice-requirements">
              <h3>
                <span className="dot navy" />
                참가 자격 및 조건
              </h3>
              <ul>
                {noticeDetail.requirements.length > 0
                  ? noticeDetail.requirements.map((item) => (
                      <li key={item}>{item}</li>
                    ))
                  : <li>등록된 참가 제한 조건이 없습니다.</li>}
              </ul>
            </section>

            <section className="analysis-section">
              <h3>
                <span className="dot good" />
                공고 분류
              </h3>
              <ul>
                {noticeDetail.tags.length > 0
                  ? noticeDetail.tags.map((item) => (
                      <li key={item}>{item}</li>
                    ))
                  : <li>{noticeDetail.category}</li>}
              </ul>
            </section>

            <AttachmentDocuments
              attachments={noticeDetail.attachments ?? []}
              loading={noticeDetailLoading}
              error={noticeDetailError}
            />

            <div className="drawer-actions">
              <button
                className="secondary-action"
                type="button"
                onClick={() => void toggleSaved(noticeDetail)}
              >
                {saved.includes(noticeDetail.id) ? "◆ 관심공고 저장됨" : "◇ 관심공고 저장"}
              </button>
              <OriginalNoticeAction bid={noticeDetail} />
            </div>
          </aside>
        </div>
      )}

      {/* ── AI Analysis Drawer ── */}
      {selected && (
        <div
          className="drawer-layer"
          role="presentation"
          onMouseDown={() => setSelected(null)}
        >
          <aside
            className={`detail-drawer${feedbackBidId === selected.id ? " feedback-expanded" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label="AI 입찰공고 상세 분석"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="drawer-head">
              <div>
                <span className={`category category-${selected.category}`}>{selected.category}</span>
                <span>{selected.noticeNo}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="상세 창 닫기"
              >
                ×
              </button>
            </div>

            <div className="drawer-title">
              <ScoreRing score={selected.score} />
              <div>
                <StatusBadge value={selected.eligibility} />
                <h2>{selected.title}</h2>
                <p>{selected.agency} · {selected.demandAgency}</p>
                <span className="score-confidence">
                  추천 신뢰도 {selected.scoreConfidence ?? 0}%
                </span>
              </div>
            </div>

            <div className="ai-brief">
              <div>
                <span>✦</span>
                <strong>AI 핵심 분석</strong>
              </div>
              <p>{selected.summary}</p>
              {(selected.scoreReasons ?? []).map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
            </div>

            <div className="drawer-grid">
              <div>
                <span>사업금액(VAT별도)</span>
                <strong>{selected.budgetLabel}</strong>
              </div>
              <div>
                <span>마감일시</span>
                <strong>{selected.closeAt}</strong>
              </div>
              <div>
                <span>계약방법</span>
                <strong>{selected.contractMethod}</strong>
              </div>
              <div>
                <span>낙찰방법</span>
                <strong>{selected.awardMethod}</strong>
              </div>
            </div>

            <section className="analysis-section score-analysis">
              <h3>
                <span className="dot good" />
                적합도 산정 근거
              </h3>
              <div className="score-breakdown">
                {Object.entries(selected.scoreBreakdown ?? {}).map(([name, value]) => (
                  <div key={name}>
                    <span>{name}</span>
                    <strong>{value}점</strong>
                  </div>
                ))}
              </div>
            </section>

            {(selected.matchedConditions ?? []).length > 0 && (
              <section className="analysis-section">
                <h3>
                  <span className="dot navy" />
                  일치하는 검색조건
                </h3>
                <ul>
                  {(selected.matchedConditions ?? []).map((item) => (
                    <li key={item}>✓ {item}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="analysis-section">
              <h3>
                <span className="dot good" />
                일치하는 기업 역량
              </h3>
              <ul>
                {selected.matched.length > 0
                  ? selected.matched.map((item) => (
                      <li key={item}>✓ {item}</li>
                    ))
                  : <li>일치 항목을 추가로 확인해 주세요.</li>}
              </ul>
            </section>

            <section className="analysis-section">
              <h3>
                <span className="dot navy" />
                핵심 참가자격
              </h3>
              <ul>
                {selected.requirements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="analysis-section">
              <h3>
                <span className="dot warning" />
                확인할 사항
              </h3>
              <ul className="risk-list">
                {selected.risks.length > 0
                  ? selected.risks.map((item) => (
                      <li key={item}>! {item}</li>
                    ))
                  : <li>현재 확인된 추가 위험사항이 없습니다.</li>}
              </ul>
            </section>

            {feedbackEnabled && (
              <section
                className="analysis-section analysis-feedback"
                aria-labelledby={`analysis-feedback-title-${selected.id}`}
              >
                <div className="analysis-feedback-head">
                  <div>
                    <span className="dot good" />
                    <h3 id={`analysis-feedback-title-${selected.id}`}>
                      추천 결과 피드백
                    </h3>
                  </div>
                  {selected.sessionFeedbackSource === "favorite" && (
                    <small>관심공고 선택으로 +3점 반영 중</small>
                  )}
                </div>
                <p>공고 내용을 확인한 결과가 우리 회사에 적합한지 알려주세요.</p>
                <div className="bid-feedback-actions">
                  <button
                    type="button"
                    className={selected.sessionFeedback === "positive" ? "active positive" : ""}
                    disabled={feedbackSubmittingId === selected.id}
                    onClick={() => void submitRecommendationFeedback(selected, "positive")}
                  >
                    추천 적합
                  </button>
                  <button
                    type="button"
                    className={selected.sessionFeedback === "negative" ? "active negative" : ""}
                    disabled={feedbackSubmittingId === selected.id}
                    aria-expanded={feedbackBidId === selected.id}
                    onClick={() => {
                      setSelectedFeedbackReasons([]);
                      setFeedbackBidId((current) => {
                        return current === selected.id ? "" : selected.id;
                      });
                    }}
                  >
                    추천 부적합
                  </button>
                  {selected.sessionFeedbackSource === "detail" && (
                    <button
                      type="button"
                      className="feedback-clear"
                      disabled={feedbackSubmittingId === selected.id}
                      onClick={() => void submitRecommendationFeedback(selected, "clear")}
                    >
                      상세평가 취소
                    </button>
                  )}
                  {selected.sessionFeedbackSource === "detail"
                    && Boolean(selected.feedbackAdjustment) && (
                    <small>
                      상세평가 보정 {Number(selected.feedbackAdjustment) > 0 ? "+" : ""}
                      {selected.feedbackAdjustment}점
                    </small>
                  )}
                </div>
                {feedbackBidId === selected.id && (
                  <div
                    className="feedback-reason-panel"
                    role="group"
                    aria-label={`${selected.title} 추천 부적합 사유`}
                  >
                    <strong>부적합 사유를 모두 선택한 후 적용해 주세요.</strong>
                    <div>
                      {feedbackReasons.map((reason) => (
                        <button
                          type="button"
                          key={reason}
                          className={selectedFeedbackReasons.includes(reason) ? "selected" : ""}
                          disabled={feedbackSubmittingId === selected.id}
                          aria-pressed={selectedFeedbackReasons.includes(reason)}
                          onClick={() => setSelectedFeedbackReasons((current) =>
                            current.includes(reason)
                              ? current.filter((item) => item !== reason)
                              : [...current, reason],
                          )}
                        >
                          {reason}
                        </button>
                      ))}
                    </div>
                    <div className="feedback-reason-actions">
                      <button
                        type="button"
                        className="feedback-exclude"
                        disabled={feedbackSubmittingId === selected.id}
                        onClick={() => setExcludeConfirmOpen(true)}
                      >
                        이 공고를 현재 세션에서 제외
                      </button>
                      <button
                        type="button"
                        className="feedback-apply"
                        disabled={
                          feedbackSubmittingId === selected.id
                          || selectedFeedbackReasons.length === 0
                        }
                        onClick={() => void submitRecommendationFeedback(
                          selected,
                          "negative",
                          selectedFeedbackReasons,
                        )}
                      >
                        선택한 사유 적용 ({selectedFeedbackReasons.length})
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            <div className="drawer-actions">
              <button
                className="secondary-action"
                type="button"
                onClick={() => void toggleSaved(selected)}
              >
                {saved.includes(selected.id) ? "◆ 관심공고 저장됨" : "◇ 관심공고 저장"}
              </button>
              <OriginalNoticeAction bid={selected} />
            </div>
          </aside>
        </div>
      )}

      {/* ── Exclude Bid Confirmation ── */}
      {selected && excludeConfirmOpen && (
        <div
          className="modal-layer feedback-confirm-layer"
          role="presentation"
          onMouseDown={() => setExcludeConfirmOpen(false)}
        >
          <section
            className="feedback-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="feedback-confirm-title"
            aria-describedby="feedback-confirm-description"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="feedback-confirm-icon" aria-hidden="true">!</div>
            <h2 id="feedback-confirm-title">이 공고를 추천에서 제외할까요?</h2>
            <p id="feedback-confirm-description">
              현재 검색 세션의 추천 목록에서 이 공고가 제외됩니다.
              다른 검색 세션이나 원본 공고에는 영향을 주지 않습니다.
            </p>
            <div className="feedback-confirm-actions">
              <button
                type="button"
                className="feedback-confirm-cancel"
                onClick={() => setExcludeConfirmOpen(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="feedback-confirm-submit"
                disabled={feedbackSubmittingId === selected.id}
                onClick={() => {
                  setExcludeConfirmOpen(false);
                  void submitRecommendationFeedback(
                    selected,
                    "exclude",
                    ["이미 확인한 공고"],
                  );
                }}
              >
                제외
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ── Saved Bids Modal ── */}
      {savedBidsOpen && (
        <div
          className="modal-layer saved-bids-modal-layer"
          role="presentation"
          onMouseDown={() => setSavedBidsOpen(false)}
        >
          <section
            className="saved-bids-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="saved-bids-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setSavedBidsOpen(false)}
              aria-label="관심공고 창 닫기"
              autoFocus
            >
              ×
            </button>

            <div className="saved-bids-head">
              <div>
                <span className="section-kicker">SAVED BIDS</span>
                <h2 id="saved-bids-title">
                  관심공고
                  <span>{savedBids.length.toLocaleString("ko-KR")}건</span>
                </h2>
                <p>저장한 공고를 이 브라우저에서 다시 확인할 수 있습니다.</p>
              </div>
              {savedBids.length > 0 && (
                <div className="saved-bids-head-actions">
                  <small>최대 {SAVED_BIDS_LIMIT}건 저장</small>
                  <button
                    type="button"
                    className="saved-bids-clear-all"
                    disabled={clearingSavedBids}
                    onClick={() => void clearSavedBids()}
                  >
                    {clearingSavedBids ? "삭제 중…" : "전체 삭제"}
                  </button>
                </div>
              )}
            </div>

            <div className="saved-bids-modal-content">
              {savedBids.length === 0 ? (
                <div className="saved-bids-empty">
                  <span aria-hidden="true">◇</span>
                  <strong>저장한 관심공고가 없습니다.</strong>
                  <p>공고 카드의 마름모 버튼을 누르면 이곳에 저장됩니다.</p>
                  <a href="#search" onClick={() => setSavedBidsOpen(false)}>
                    입찰공고 살펴보기
                  </a>
                </div>
              ) : (
                <div className="saved-bids-list">
                  {savedBids.map((bid) => (
                    <article className="saved-bid-card" key={bid.id}>
                      <div className="saved-bid-meta">
                        <span className={`category category-${bid.category}`}>
                          {bid.category}
                        </span>
                        <span>{bid.noticeNo}</span>
                        <span className="saved-bid-score-badge">
                          적합도 {bid.score}점
                        </span>
                        <button
                          type="button"
                          onClick={() => void toggleSaved(bid)}
                          aria-label={`${bid.title} 관심공고 해제`}
                          title="관심공고 해제"
                        >
                          ◆
                        </button>
                      </div>
                      <button
                        className="saved-bid-title"
                        type="button"
                        onClick={() => {
                          setSavedBidsOpen(false);
                          void openNoticeDetail(bid);
                        }}
                      >
                        {bid.title}
                      </button>
                      <div className="saved-bid-facts">
                        <span>
                          수요기관
                          <strong>{bid.demandAgency}</strong>
                        </span>
                        <span>
                          사업금액(VAT별도)
                          <strong>{bid.budgetLabel}</strong>
                        </span>
                        <span className="saved-bid-fact-region">
                          참가 지역
                          <strong>{bid.region}</strong>
                        </span>
                        <span className="saved-bid-fact-deadline">
                          마감일시
                          <strong>{bid.closeAt}</strong>
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ── Saved Search Modal ── */}
      {saveSearchOpen && (
        <div
          className="modal-layer"
          role="presentation"
          onMouseDown={() => setSaveSearchOpen(false)}
        >
          <section
            className="saved-search-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="saved-search-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setSaveSearchOpen(false)}
              aria-label="검색조건 저장 창 닫기"
            >
              ×
            </button>

            <span className="section-kicker">SAVED SEARCH</span>
            <h2 id="saved-search-title">검색조건 저장</h2>
            <p>현재 조건에 이름을 붙여 저장하고 필요할 때 다시 적용할 수 있습니다.</p>

            <form className="saved-search-form" onSubmit={saveCurrentSearch}>
              <label htmlFor="saved-search-name">검색조건 이름</label>
              <input
                id="saved-search-name"
                value={savedSearchName}
                onChange={(event) => setSavedSearchName(event.target.value)}
                maxLength={50}
                autoFocus
                placeholder="예: 수도권 AI 구축사업"
              />
              <div className="saved-search-summary" aria-label="현재 검색조건 요약">
                <span>{category}</span>
                <span>{region}</span>
                <span>{budgetOptions.find((option) => option.value === maxBudget)?.label || "금액 전체"}</span>
                {includeKeyword && <span>포함: {includeKeyword}</span>}
                {excludeKeyword && <span className="exclude">제외: {excludeKeyword}</span>}
                {onlyEligible && <span>참가 가능만</span>}
                {closingSoon && <span>7일 내 마감</span>}
              </div>
              <button className="primary-action saved-search-submit" type="submit">
                현재 조건 저장
              </button>
            </form>

            <div className="saved-search-list-head">
              <h3>저장한 검색조건</h3>
              <span>{savedSearches.length}개</span>
            </div>
            {savedSearches.length === 0 ? (
              <div className="saved-search-empty">
                아직 저장한 검색조건이 없습니다.
              </div>
            ) : (
              <div className="saved-search-list">
                {savedSearches.map((savedSearch) => (
                  <article className="saved-search-item" key={savedSearch.id}>
                    <div>
                      <strong>{savedSearch.name}</strong>
                      <div className="saved-search-item-conditions">
                        <span>{savedSearch.filters.category}</span>
                        <span>{savedSearch.filters.region}</span>
                        <span>
                          {budgetOptions.find((option) => option.value === savedSearch.filters.maxBudget)?.label || "금액 전체"}
                        </span>
                        {savedSearch.filters.includeKeyword.trim() && (
                          <span>포함: {savedSearch.filters.includeKeyword}</span>
                        )}
                        {savedSearch.filters.excludeKeyword.trim() && (
                          <span className="exclude">
                            제외: {savedSearch.filters.excludeKeyword}
                          </span>
                        )}
                        {savedSearch.filters.demandAgencyInput.trim() && (
                          <span>수요기관: {savedSearch.filters.demandAgencyInput}</span>
                        )}
                        {savedSearch.filters.onlyEligible && (
                          <span>참가 가능만</span>
                        )}
                        {savedSearch.filters.closingSoon && (
                          <span>7일 내 마감</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <button type="button" onClick={() => applySavedSearch(savedSearch)}>
                        적용
                      </button>
                      <button
                        className="delete"
                        type="button"
                        onClick={() => deleteSavedSearch(savedSearch.id)}
                        aria-label={`${savedSearch.name} 삭제`}
                      >
                        삭제
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── Profile Modal ── */}
      {profileOpen && (
        <div
          className="modal-layer"
          role="presentation"
          onMouseDown={() => setProfileOpen(false)}
        >
          <section
            className="profile-modal"
            role="dialog"
            aria-modal="true"
            aria-label="기업 프로필"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setProfileOpen(false)}
              aria-label="모달 닫기"
            >
              ×
            </button>
            <Mark>{companyProfileInitials(companyProfile.name)}</Mark>
            <span className="section-kicker">COMPANY PROFILE</span>
            <h2>{companyProfile.name}</h2>
            <p>기업 정보를 기반으로 공고 참가 가능성과 사업 적합도를 분석합니다.</p>
            <div className="profile-completion">
              <div>
                <span>프로필 완성도</span>
                <strong>{companyProfile.completion}%</strong>
              </div>
              <div className="progress">
                <span style={{ width: `${companyProfile.completion}%` }} />
              </div>
            </div>
            <form className="profile-form" onSubmit={saveCompanyProfile}>
              <div className="profile-field">
                <label htmlFor="profile-name">기업명</label>
                <input
                  id="profile-name"
                  value={profileDraft.name}
                  maxLength={120}
                  required
                  onChange={(event) => setProfileDraft({
                    ...profileDraft,
                    name: event.target.value,
                  })}
                />
              </div>
              <div className="profile-field">
                <label htmlFor="profile-location">소재지</label>
                <input
                  id="profile-location"
                  value={profileDraft.location}
                  maxLength={120}
                  placeholder="예: 경기도 성남시"
                  onChange={(event) => setProfileDraft({
                    ...profileDraft,
                    location: event.target.value,
                  })}
                />
              </div>
              <div className="profile-field">
                <label htmlFor="profile-size">기업 규모</label>
                <select
                  id="profile-size"
                  value={profileDraft.size}
                  onChange={(event) => setProfileDraft({
                    ...profileDraft,
                    size: event.target.value,
                  })}
                >
                  <option value="소상공인">소상공인</option>
                  <option value="중소기업">중소기업</option>
                  <option value="중견기업">중견기업</option>
                  <option value="대기업">대기업</option>
                  <option value="비영리기관">비영리기관</option>
                </select>
              </div>
              <div className="profile-field">
                <label htmlFor="profile-budget">선호 최대 사업금액(VAT별도)</label>
                <div className="profile-budget-input">
                  <input
                    id="profile-budget"
                    type="number"
                    min="0"
                    max="1000000"
                    step="0.1"
                    value={profileDraft.preferredMaxBudget}
                    placeholder="예: 5"
                    onChange={(event) => setProfileDraft({
                      ...profileDraft,
                      preferredMaxBudget: event.target.value,
                    })}
                  />
                  <span>억원</span>
                </div>
              </div>
              <div className="profile-field profile-field-wide">
                <label htmlFor="profile-licenses">보유 면허·자격</label>
                <textarea
                  id="profile-licenses"
                  value={profileDraft.licenses}
                  placeholder="쉼표로 구분: 소프트웨어사업자, 정보통신공사업"
                  onChange={(event) => setProfileDraft({
                    ...profileDraft,
                    licenses: event.target.value,
                  })}
                />
              </div>
              <div className="profile-field profile-field-wide">
                <label htmlFor="profile-technologies">보유 기술</label>
                <textarea
                  id="profile-technologies"
                  value={profileDraft.technologies}
                  placeholder="쉼표로 구분: 생성형 AI, Java, React, Python"
                  onChange={(event) => setProfileDraft({
                    ...profileDraft,
                    technologies: event.target.value,
                  })}
                />
              </div>
              <div className="profile-field profile-field-wide">
                <label htmlFor="profile-business-areas">주요 사업 분야</label>
                <textarea
                  id="profile-business-areas"
                  value={profileDraft.businessAreas}
                  placeholder="쉼표로 구분: 공공 SI, AI 웹서비스 구축"
                  onChange={(event) => setProfileDraft({
                    ...profileDraft,
                    businessAreas: event.target.value,
                  })}
                />
              </div>
              <div className="profile-field profile-field-wide">
                <label htmlFor="profile-experiences">유사 수행실적</label>
                <textarea
                  id="profile-experiences"
                  value={profileDraft.experiences}
                  placeholder="쉼표로 구분: 공공 데이터 플랫폼 구축, 학교 정보시스템 운영"
                  onChange={(event) => setProfileDraft({
                    ...profileDraft,
                    experiences: event.target.value,
                  })}
                />
              </div>
              <div className="profile-field profile-field-wide">
                <span className="profile-field-label" id="profile-service-regions-label">
                  수행 가능 지역
                </span>
                <div
                  className="profile-region-options"
                  role="group"
                  aria-labelledby="profile-service-regions-label"
                >
                  {regions.map((region) => {
                    const selected = profileDraft.serviceRegions.includes(region);
                    return (
                      <button
                        key={region}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleProfileServiceRegion(region)}
                      >
                        <span aria-hidden="true">{selected ? "✓" : ""}</span>
                        {region}
                      </button>
                    );
                  })}
                </div>
                <small className="profile-field-note">
                  복수 선택할 수 있습니다. 전체 지역은 다른 지역과 함께 선택되지 않습니다.
                </small>
              </div>
              <div className="profile-field profile-field-wide">
                <span className="profile-field-label" id="profile-service-agency-types-label">
                  수행 가능 기관유형
                </span>
                <div
                  className="profile-agency-type-options"
                  role="group"
                  aria-labelledby="profile-service-agency-types-label"
                >
                  {[
                    {
                      name: "전체 기관",
                      details: [{
                        name: "나라장터에 등록된 모든 기관종류",
                        topLevelAgencyNames: [],
                        topLevelAgencyCount: 0,
                      }],
                    },
                    ...agencyTypeDetails,
                  ].map((option, index) => {
                    const selected = profileDraft.serviceAgencyTypes.includes(option.name);
                    const tooltipId = `profile-agency-type-tooltip-${index}`;
                    return (
                      <span className="profile-agency-type-option" key={option.name}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          aria-describedby={tooltipId}
                          onClick={() => toggleProfileServiceAgencyType(option.name)}
                        >
                          <span aria-hidden="true">{selected ? "✓" : ""}</span>
                          {option.name}
                        </button>
                        <span
                          className="profile-agency-type-tooltip"
                          id={tooltipId}
                          role="tooltip"
                        >
                          <strong>{option.name} 세부사항</strong>
                          <ul
                            aria-label={`${option.name} 세부 기관 목록`}
                            tabIndex={0}
                          >
                            {option.details.map((detail) => {
                              const displayedAgencyNames = detail.topLevelAgencyNames.slice(0, 2);
                              return (
                                <li key={detail.name}>
                                  <span>{detail.name}</span>
                                  {displayedAgencyNames.length > 0 && (
                                    <small>
                                      {displayedAgencyNames.join(", ")}
                                      {detail.topLevelAgencyCount > displayedAgencyNames.length ? ", ..." : ""}
                                    </small>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </span>
                      </span>
                    );
                  })}
                </div>
                <small className="profile-field-note">
                  복수 선택할 수 있습니다. 전체 기관은 다른 기관종류와 함께 선택되지 않습니다.
                </small>
              </div>
              <div className="profile-field profile-field-wide">
                <label htmlFor="profile-excluded-areas">제외 사업 분야</label>
                <input
                  id="profile-excluded-areas"
                  value={profileDraft.excludedBusinessAreas}
                  placeholder="쉼표로 구분: 건축공사, 장비 단순납품"
                  onChange={(event) => setProfileDraft({
                    ...profileDraft,
                    excludedBusinessAreas: event.target.value,
                  })}
                />
              </div>
              <p className="profile-form-help">
                여러 항목은 쉼표로 구분하며, 저장된 정보는 이 브라우저에 보관되고
                적합도와 참가 가능 여부 계산에 사용됩니다.
              </p>
              <div className="profile-form-actions">
                <button
                  className="secondary-action"
                  type="button"
                  onClick={restoreDefaultCompanyProfile}
                >
                  기본값 복원
                </button>
                <button className="primary-action" type="submit">
                  프로필 저장 및 검색 반영
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {saveNotice && (
        <div className="save-notice" role="status" aria-live="polite">
          ✓ {saveNotice}
        </div>
      )}

      <SiteFooter />
      <div className="footer-scroll-end" ref={footerBottomRef} aria-hidden="true" />

      {/* ── Mobile Dock ── */}
      <nav className="mobile-dock has-notifications" aria-label="모바일 주요 메뉴">
        <a className="active" href="#search">
          <span aria-hidden="true">⌕</span>
          <small>탐색</small>
        </a>
        <button
          type="button"
          onClick={() => setSavedBidsOpen(true)}
          aria-label={`관심공고 ${saved.length}건 보기`}
        >
          <span aria-hidden="true">◇</span>
          <small>관심공고</small>
          {saved.length > 0 && <em>{saved.length}</em>}
        </button>
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          aria-controls="mobile-filters"
          aria-expanded={filtersOpen}
        >
          <span aria-hidden="true">≡</span>
          <small>필터</small>
        </button>
        <button type="button" onClick={openCompanyProfile}>
          <span aria-hidden="true">○</span>
          <small>프로필</small>
        </button>
        <button type="button" onClick={() => setNotificationsOpen(true)} aria-haspopup="dialog">
          <span aria-hidden="true">♢</span>
          <small>알림</small>
        </button>
      </nav>

      <NotificationPopup open={notificationsOpen} onClose={closeNotifications} />
    </main>
  );
}
