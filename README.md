# FindBid

나라장터 입찰공고와 첨부문서를 분석해 기업에 적합한 사업을 추천하는 AI 조달 인텔리전스 시스템입니다.

## 프로젝트 구조

```text
FindBid/
├── frontend/                 # Next.js 웹 애플리케이션
│   ├── app/
│   ├── lib/
│   ├── public/
│   └── Dockerfile
├── backend/                  # FastAPI 검색·기업 적합성 API
│   ├── app/
│   │   ├── api/
│   │   ├── models/
│   │   ├── repositories/
│   │   ├── services/
│   │   ├── eligibility/
│   │   └── agent/
│   └── Dockerfile
├── collector/                # 나라장터 업무별 공고 수집기
│   ├── g2b/
│   ├── normalizers/
│   └── schedulers/
├── document_worker/          # 첨부문서 추출·청킹·임베딩 워커
│   ├── extractors/
│   ├── ocr/
│   ├── chunkers/
│   └── embeddings/
├── shared/                   # 공통 설정·스키마·상수
├── infrastructure/           # PostgreSQL·OpenSearch·MinIO 설정
├── tests/                    # 단위·통합 테스트
└── compose.yaml
```

## 기본 실행

1. 환경변수 파일을 준비합니다.

```powershell
Copy-Item .env.example .env
```

2. 기본 서비스를 실행합니다.

```powershell
docker compose up --build -d
```

3. 접속 주소를 확인합니다.

- 웹: `http://localhost:3100`
- 백엔드 API 문서: `http://localhost:8100/docs`
- 백엔드 상태: `http://localhost:8100/api/v1/health`

기본 구성에는 frontend, backend, collector, document-worker, PostgreSQL, Redis가 포함됩니다.

개발 환경에서는 `compose.override.yaml`이 자동으로 적용됩니다. `frontend` 소스 변경은
HMR로, `backend`와 공통 Python 소스 변경은 Uvicorn reload로 컨테이너 재빌드 없이
자동 반영됩니다. 의존성 파일을 변경한 경우에만 `--build`로 다시 실행합니다.

운영 이미지 구성만 실행하려면 override 파일을 제외합니다.

```powershell
docker compose -f compose.yaml up --build -d
```

## 전체 인프라 실행

OpenSearch와 MinIO까지 실행하려면 `full` 프로필을 사용합니다.

```powershell
docker compose --profile full up --build -d
```

- OpenSearch: `http://localhost:9200`
- MinIO API: `http://localhost:9000`
- MinIO 관리화면: `http://localhost:9001`

## 실제 나라장터 연동

`.env`에 공공데이터포털에서 발급받은 일반 인증키를 입력합니다.

```dotenv
DEMO_MODE=false
G2B_SERVICE_KEY=발급받은_일반_인증키
```

수집기는 물품·용역·공사·외자 API를 주기적으로 조회하고 표준 공고 모델로 변환해 백엔드에 저장합니다. 인증키가 없으면 수집기는 데모 모드로 대기하고 백엔드는 초기 데모 데이터를 제공합니다.

## 주요 API

```text
GET  /api/v1/health
POST /api/v1/search
POST /api/v1/agent/search
GET  /api/v1/bids/{bid_id}
GET  /api/v1/bids/{bid_id}/eligibility
GET  /api/v1/company/profile
POST /api/v1/admin/bids/import
```

## 테스트

실행 중인 기본 서비스에 대해 단위 및 통합 테스트를 수행합니다.

```powershell
docker compose --profile test run --rm test
```

## 종료

```powershell
docker compose --profile full down
```

데이터 볼륨까지 삭제하려면 명시적으로 `-v` 옵션을 추가해야 합니다.
