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
G2B_API_KEY=발급받은_일반_인증키
```

수집기는 물품·용역·공사·외자 API를 주기적으로 조회하고 표준 공고 모델로 변환해 백엔드에 저장합니다. 인증키가 없으면 수집기는 데모 모드로 대기하고 백엔드는 초기 데모 데이터를 제공합니다.

백엔드는 서버가 실행될 때 나라장터 수요기관의 등록·변경 정보를 확인하고 하루 한 번
로컬 `demand_agencies` 테이블에 반영합니다. 관리자 페이지의 `수요기관 관리` 메뉴에서
동기화 상태와 실행 이력을 확인하고, 당일 자동 실행 전에는 수동으로 가져오기를 시작할
수 있습니다. 날짜 조회는 최근 7일을 중복 조회한 뒤 기관코드로 병합하여 지연 반영과
기관 변경·삭제 정보의 누락을 방지합니다.

## 주요 API

```text
GET  /api/v1/health
POST /api/v1/search
POST /api/v1/agent/search
GET  /api/v1/bids/{bid_id}
GET  /api/v1/bids/{bid_id}/eligibility
GET  /api/v1/company/profile
POST /api/v1/admin/bids/import
GET  /api/v1/admin/demand-agencies
POST /api/v1/admin/demand-agencies/sync
```

## 테스트

실행 중인 기본 서비스에 대해 단위 및 통합 테스트를 수행합니다.

```powershell
docker compose --profile test run --rm test
```

## 운영 배포 (Ubuntu 서버)

IP 직접 접속(TLS 없음) 기준, `full` 프로필(OpenSearch·MinIO 포함) 운영 절차입니다.

1. **서버 준비**: Docker Engine + `docker compose` 플러그인 설치, `docker` 그룹 권한, `systemctl enable docker`. git 원격이 사설망(Tailscale 등)에 있다면 서버도 같은 네트워크에 조인되어야 합니다.

2. **소스 배치**

```bash
git clone <repo-url> /opt/findbid
cd /opt/findbid
```

3. **운영 `.env` 작성**: `.env.example`을 복사한 뒤 `chmod 600 .env`로 보호하고, 아래 값을 실제 운영값으로 채웁니다.
   - `INTERNAL_API_KEY`, `FINDBID_ADMIN_PASSWORD`, `POSTGRES_PASSWORD`, `S3_SECRET_KEY`: `openssl rand -hex 32` 등으로 강한 랜덤값 생성
   - `APP_ENV=production`, `DEMO_MODE=false`, `G2B_SERVICE_KEY=<발급받은 인증키>` (`G2B_API_KEY`는 수요기관 동기화 전용 키가 따로 있을 때만 채우면 되고, 비워두면 `G2B_SERVICE_KEY`를 재사용합니다)
   - `OPENSEARCH_JAVA_OPTS`: 서버 메모리에 맞게 조정 (예: 32GB 서버는 `-Xms2g -Xmx2g`)
   - `.env`는 git에 커밋하지 않습니다 (`.gitignore`에 이미 포함됨).

4. **빌드 & 기동** (override 제외, 운영 이미지만)

```bash
docker compose -f compose.yaml --profile full up --build -d
docker compose -f compose.yaml --profile full ps
```

5. **포트 노출**: `compose.yaml`에서 `frontend`(3100)·`backend`(8100)·`postgres`(5432)·`opensearch`(9200)·`minio`(9000/9001) 전부 `127.0.0.1`에만 바인딩되어 도커 컨테이너 자체는 외부에 노출되지 않습니다. 외부 접속은 호스트에 별도 설치한 **nginx**(80/443)가 도메인으로 받아서 frontend로 리버스 프록시합니다.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

MinIO 콘솔 등 내부 전용 서비스 관리가 필요하면 SSH 터널을 사용합니다: `ssh -L 9001:localhost:9001 <서버>`.

**도메인 + HTTPS (nginx + certbot)**: 도메인의 A 레코드를 서버 IP로 연결한 뒤, 호스트에 nginx를 설치하고 `infrastructure/nginx/findbid.conf`를 참고해 `/etc/nginx/sites-available/`에 배치합니다. 인증서는 `certbot --webroot`로 발급합니다 (nginx 플러그인의 `--nginx` 자동 편집은 멀티 도메인 환경에서 challenge 경로가 앱으로 새는 경우가 있어, webroot 방식을 권장합니다).

```bash
sudo mkdir -p /var/www/certbot
sudo certbot certonly --webroot -w /var/www/certbot -d <도메인> -d www.<도메인>
```

인증서 갱신 시 nginx를 reload하도록 훅을 등록합니다.

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh > /dev/null <<'EOF'
#!/bin/bash
systemctl reload nginx
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

nginx 설정과 인증서는 docker compose 스택 밖(호스트)에 있으므로 백업 대상에 `/etc/nginx/sites-available/`와 `/etc/letsencrypt/`도 포함하는 걸 권장합니다.

6. **백업**: `postgres`와 `minio` 볼륨을 매일 백업하는 cron 스크립트를 등록합니다 (`pg_dump` + `minio-data` tar, 7일 보관).

7. **업데이트 배포**

```bash
cd /opt/findbid
git pull origin main
docker compose -f compose.yaml --profile full up --build -d
docker compose -f compose.yaml --profile test run --rm test
```

## 종료

```powershell
docker compose --profile full down
```

데이터 볼륨까지 삭제하려면 명시적으로 `-v` 옵션을 추가해야 합니다.
