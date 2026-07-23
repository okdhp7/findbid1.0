# Docker 인프라 구성

루트의 `compose.yaml`이 서비스 구성을 관리합니다.

- 기본 실행: frontend, backend, collector, document-worker, PostgreSQL, Redis
- 전체 실행: 기본 서비스와 OpenSearch, MinIO

```powershell
docker compose up --build -d
docker compose --profile full up --build -d
```

운영 환경에서는 `.env`의 데이터베이스 비밀번호와 `INTERNAL_API_KEY`를 반드시 변경해야 합니다.
