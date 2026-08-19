from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    database_url: str = "postgresql+psycopg://findbid:findbid@postgres:5432/findbid"
    bid_database_url: str = ""
    bid_database_schema: str = "public"
    bid_database_table: str = "bids"
    redis_url: str = "redis://redis:6379/0"
    opensearch_url: str = "http://opensearch:9200"
    s3_endpoint: str = "http://minio:9000"
    s3_access_key: str = "findbid"
    s3_secret_key: str = "findbid-storage"
    g2b_service_key: str = ""
    g2b_api_key: str = ""
    internal_api_key: str = "change-this-in-production"
    backend_internal_url: str = "http://backend:8000"
    demo_mode: bool = True
    semantic_search_enabled: bool = True
    semantic_model_name: str = (
        "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    )
    semantic_model_cache: str = "/home/findbid/.cache/fastembed"
    semantic_min_score: float = 0.35
    semantic_candidate_limit: int = 5000
    semantic_result_cache_seconds: int = 120
    search_trace_enabled: bool = True
    feedback_session_ttl_seconds: int = 7200
    feedback_adjustment_limit: int = 10
    demand_agency_sync_enabled: bool = True
    demand_agency_sync_page_size: int = 500
    demand_agency_sync_timeout_seconds: float = 30.0
    demand_agency_sync_window_days: int = 31
    demand_agency_sync_overlap_days: int = 7
    # ponytail: 나라장터(KONEPS)는 2002년 개통이라 2000년 이전 데이터는 없음.
    # 1900년으로 잡으면 초기 백필 요청 수가 5배 이상 불어나 레이트리밋에 바로 걸림.
    demand_agency_sync_initial_date: str = "200001010000"
    demand_agency_sync_check_seconds: int = 3600

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
