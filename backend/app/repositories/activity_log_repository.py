from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.activity_log import (
    AdminActivityAuditLog,
    CompanyProfileSnapshot,
    RecommendationFeedbackLog,
    SearchActivityLog,
    UserActivitySession,
)
from findbid_shared.config import get_settings
from findbid_shared.schemas import CompanyProfileInput, FeedbackRequest, SearchRequest, SearchResponse


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


def _stable_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class ActivityLogRepository:
    def __init__(self, session: Session):
        self.session = session

    @staticmethod
    def session_hash(session_id: str) -> str:
        return _stable_hash(session_id.strip()) if session_id.strip() else ""

    def _touch_user(
        self,
        session_id: str,
        *,
        profile: dict[str, Any] | None = None,
        ip_address: str = "",
        user_agent: str = "",
        ai_search_increment: int = 0,
        feedback_increment: int = 0,
    ) -> UserActivitySession | None:
        session_hash = self.session_hash(session_id)
        if not session_hash:
            return None
        model = self.session.get(UserActivitySession, session_hash)
        now = _utc_now()
        if model is None:
            model = UserActivitySession(
                session_hash=session_hash,
                session_label=f"익명-{session_hash[:8]}",
                first_seen_at=now,
                last_seen_at=now,
            )
            self.session.add(model)
        model.last_seen_at = now
        if ip_address.strip():
            model.ip_hash = _stable_hash(
                f"{get_settings().internal_api_key}:{ip_address.strip()}"
            )
        if user_agent.strip():
            model.user_agent = user_agent.strip()[:500]
        if profile is not None:
            model.current_company_profile = profile
        model.ai_search_count = int(model.ai_search_count or 0) + ai_search_increment
        model.feedback_count = int(model.feedback_count or 0) + feedback_increment
        return model

    def _profile_snapshot(
        self,
        session_hash: str,
        profile: dict[str, Any] | None,
    ) -> CompanyProfileSnapshot | None:
        if not session_hash or not profile:
            return None
        serialized = json.dumps(
            profile,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        profile_hash = _stable_hash(serialized)
        statement = select(CompanyProfileSnapshot).where(
            CompanyProfileSnapshot.session_hash == session_hash,
            CompanyProfileSnapshot.profile_hash == profile_hash,
        )
        snapshot = self.session.scalar(statement)
        if snapshot is None:
            snapshot = CompanyProfileSnapshot(
                session_hash=session_hash,
                profile_hash=profile_hash,
                profile_data=profile,
            )
            self.session.add(snapshot)
            self.session.flush()
        else:
            snapshot.last_used_at = _utc_now()
        return snapshot

    @staticmethod
    def _result_summary(response: SearchResponse) -> dict[str, Any]:
        return {
            "databaseTotal": response.database_total,
            "total": response.total,
            "eligibleTotal": response.eligible_total,
            "closingSoonTotal": response.closing_soon_total,
            "averageScore": response.average_score,
            "elapsedMs": response.query_plan.elapsed_ms,
            "versions": response.query_plan.versions,
            "items": [
                {
                    "bidId": item.id,
                    "noticeNo": item.notice_no,
                    "title": item.title,
                    "demandAgency": item.demand_agency,
                    "score": item.score,
                    "scoreConfidence": item.score_confidence,
                    "eligibility": item.eligibility,
                    "scoreBreakdown": item.score_breakdown,
                    "scoreReasons": item.score_reasons[:5],
                    "feedbackAdjustment": item.feedback_adjustment,
                }
                for item in response.items[:20]
            ],
        }

    def record_profile(
        self,
        session_id: str,
        profile: CompanyProfileInput,
        *,
        ip_address: str = "",
        user_agent: str = "",
    ) -> None:
        profile_data = profile.model_dump(mode="json", by_alias=True)
        user = self._touch_user(
            session_id,
            profile=profile_data,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        if user is None:
            return
        self._profile_snapshot(user.session_hash, profile_data)
        self.session.commit()

    def record_search(
        self,
        session_id: str,
        request: SearchRequest,
        response: SearchResponse,
        *,
        ip_address: str = "",
        user_agent: str = "",
    ) -> None:
        if request.search_trigger != "ai_button":
            return
        profile_data = (
            request.company_profile.model_dump(mode="json", by_alias=True)
            if request.company_profile is not None
            else {}
        )
        user = self._touch_user(
            session_id,
            profile=profile_data,
            ip_address=ip_address,
            user_agent=user_agent,
            ai_search_increment=1,
        )
        if user is None:
            return
        profile_snapshot = self._profile_snapshot(user.session_hash, profile_data)
        request_data = request.model_dump(mode="json", by_alias=True)
        request_data.pop("companyProfile", None)
        model = SearchActivityLog(
            search_id=response.query_plan.search_id,
            session_hash=user.session_hash,
            trigger="ai_button",
            profile_snapshot_id=profile_snapshot.id if profile_snapshot else None,
            search_fingerprint=response.query_plan.search_fingerprint,
            request_data=request_data,
            result_summary=self._result_summary(response),
        )
        self.session.add(model)
        self.session.commit()

    def record_feedback(
        self,
        session_id: str,
        request: FeedbackRequest,
        impression: dict[str, Any],
        *,
        ip_address: str = "",
        user_agent: str = "",
    ) -> None:
        stored_request = impression.get("request")
        request_data = stored_request if isinstance(stored_request, dict) else {}
        profile_data = request_data.get("companyProfile")
        profile = profile_data if isinstance(profile_data, dict) else {}
        user = self._touch_user(
            session_id,
            profile=profile or None,
            ip_address=ip_address,
            user_agent=user_agent,
            feedback_increment=1,
        )
        if user is None:
            return
        existing_search = self.session.scalar(
            select(SearchActivityLog).where(SearchActivityLog.search_id == request.search_id)
        )
        if existing_search is None:
            profile_snapshot = self._profile_snapshot(user.session_hash, profile)
            promoted_request = dict(request_data)
            promoted_request.pop("companyProfile", None)
            result_summary = impression.get("summary")
            if not isinstance(result_summary, dict):
                result_summary = {
                    "items": [
                        {"bidId": bid_id, **features}
                        for bid_id, features in impression.get("bids", {}).items()
                        if isinstance(features, dict)
                    ]
                }
            self.session.add(
                SearchActivityLog(
                    search_id=request.search_id,
                    session_hash=user.session_hash,
                    trigger="feedback_promoted",
                    profile_snapshot_id=profile_snapshot.id if profile_snapshot else None,
                    search_fingerprint=str(impression.get("fingerprint", "")),
                    request_data=promoted_request,
                    result_summary=result_summary,
                )
            )
        reasons = list(dict.fromkeys(
            [*request.reasons, *([request.reason] if request.reason else [])]
        ))
        self.session.add(
            RecommendationFeedbackLog(
                search_id=request.search_id,
                session_hash=user.session_hash,
                bid_id=request.bid_id,
                feedback_type=request.feedback_type,
                reasons=reasons,
                condition_ids=request.condition_ids,
                source=request.source,
            )
        )
        self.session.commit()

    def admin_overview(
        self,
        log_type: str = "users",
        page: int = 1,
        page_size: int = 15,
    ) -> dict[str, Any]:
        safe_page = max(1, page)
        safe_page_size = max(1, min(page_size, 100))
        offset = (safe_page - 1) * safe_page_size
        totals = {
            "users": self.session.scalar(
                select(func.count()).select_from(UserActivitySession)
            ) or 0,
            "searches": self.session.scalar(
                select(func.count()).select_from(SearchActivityLog)
            ) or 0,
            "feedback": self.session.scalar(
                select(func.count()).select_from(RecommendationFeedbackLog)
            ) or 0,
        }
        users: list[UserActivitySession] = []
        searches: list[SearchActivityLog] = []
        feedback: list[RecommendationFeedbackLog] = []
        if log_type == "users":
            users = list(self.session.scalars(
                select(UserActivitySession)
                .order_by(UserActivitySession.last_seen_at.desc())
                .offset(offset)
                .limit(safe_page_size)
            ))
        elif log_type == "searches":
            searches = list(self.session.scalars(
                select(SearchActivityLog)
                .order_by(SearchActivityLog.created_at.desc(), SearchActivityLog.id.desc())
                .offset(offset)
                .limit(safe_page_size)
            ))
        elif log_type == "feedback":
            feedback = list(self.session.scalars(
                select(RecommendationFeedbackLog)
                .order_by(
                    RecommendationFeedbackLog.created_at.desc(),
                    RecommendationFeedbackLog.id.desc(),
                )
                .offset(offset)
                .limit(safe_page_size)
            ))
        else:
            raise ValueError("지원하지 않는 활동로그 유형입니다.")
        total = int(totals[log_type])
        return {
            "summary": totals,
            "pagination": {
                "type": log_type,
                "page": safe_page,
                "pageSize": safe_page_size,
                "total": total,
                "totalPages": max(1, (total + safe_page_size - 1) // safe_page_size),
            },
            "users": [
                {
                    "sessionHash": item.session_hash,
                    "sessionLabel": item.session_label,
                    "ipHash": item.ip_hash[:12],
                    "userAgent": item.user_agent,
                    "companyProfile": item.current_company_profile,
                    "aiSearchCount": item.ai_search_count,
                    "feedbackCount": item.feedback_count,
                    "firstSeenAt": _iso(item.first_seen_at),
                    "lastSeenAt": _iso(item.last_seen_at),
                }
                for item in users
            ],
            "searches": [
                {
                    "id": item.id,
                    "searchId": item.search_id,
                    "sessionLabel": f"익명-{item.session_hash[:8]}",
                    "trigger": item.trigger,
                    "request": item.request_data,
                    "resultSummary": item.result_summary,
                    "createdAt": _iso(item.created_at),
                }
                for item in searches
            ],
            "feedback": [
                {
                    "id": item.id,
                    "searchId": item.search_id,
                    "sessionLabel": f"익명-{item.session_hash[:8]}",
                    "bidId": item.bid_id,
                    "feedbackType": item.feedback_type,
                    "reasons": item.reasons,
                    "source": item.source,
                    "createdAt": _iso(item.created_at),
                }
                for item in feedback
            ],
        }

    def delete_user_activity(self, session_hash: str) -> bool:
        user = self.session.get(UserActivitySession, session_hash)
        if user is None:
            return False
        self.session.execute(
            delete(RecommendationFeedbackLog).where(
                RecommendationFeedbackLog.session_hash == session_hash
            )
        )
        self.session.execute(
            delete(SearchActivityLog).where(SearchActivityLog.session_hash == session_hash)
        )
        self.session.execute(
            delete(CompanyProfileSnapshot).where(
                CompanyProfileSnapshot.session_hash == session_hash
            )
        )
        self.session.delete(user)
        self.session.add(
            AdminActivityAuditLog(
                action="사용자 활동기록 삭제",
                target=f"익명-{session_hash[:8]}",
            )
        )
        self.session.commit()
        return True
