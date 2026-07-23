from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    database_url: str = "postgresql+psycopg://findbid:findbid@postgres:5432/findbid"
    redis_url: str = "redis://redis:6379/0"
    opensearch_url: str = "http://opensearch:9200"
    s3_endpoint: str = "http://minio:9000"
    s3_access_key: str = "findbid"
    s3_secret_key: str = "findbid-storage"
    g2b_service_key: str = ""
    internal_api_key: str = "change-this-in-production"
    backend_internal_url: str = "http://backend:8000"
    demo_mode: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
