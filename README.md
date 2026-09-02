# DMES — APS · MES (표준 프로젝트 템플릿)

`dmes-ksm` 프로젝트에서 뽑아낸 **표준/템플릿 저장소**다. 고객사 ERP 를 신규 **APS**(고급 계획·스케줄링)와 **MES**(제조 실행) 로 이관·구축하는 프로젝트를 시작할 때 이 저장소를 복제해 쓴다. 백엔드는 Spring Boot 멀티 모듈(JDK 21), 프론트엔드는 Next.js/React(pnpm 모노레포) 기반이다.

거버넌스 체계·프레임워크 모듈(oasis, cactus-core, caravan-\*, analog)·빌드 골격은 원본 그대로다. 여기에 더해 **어느 프로젝트에서나 그대로 쓰는 공통 기반**은 실동작 코드로 들어 있고(아래 §"바로 동작하는 기반"), 고객사별로 달라지는 업무 도메인만 `sample`/`Sample*` 접두어가 붙은 얇은 예시로 대체되어 있다. 실제 고객사 프로젝트에 쓸 때는:

1. `RULE.md`·`docs/external/SampleErp/`·`.bp-sync.json` 등의 `{CLIENT}` 표기를 실제 고객사명으로 채운다.
2. 각 업무 모듈(`aps-core`, `mcm`/`mls`/`mqc`/`mpp`/`mpn` 의 `sample` 패키지, `m-mpn`/`m-mls`/`m-mqc`/`m-mpp` 의 `sample` 컴포넌트)을 실제 업무 도메인으로 교체한다.
3. `docs/aps`, `docs/mls`, `docs/mqc`, `docs/mpp`, `docs/mes`, `docs/glossary` 등의 placeholder 문서를 실제 분석·설계 산출물로 채운다.
4. 초기 계정(`admin`)의 비밀번호, `cactus.jwt.secret`, `BACKEND_CLIENT_KEY`, `AUTH_SECRET` 을 전부 교체하고 비밀번호 정책을 켠다.

## 바로 동작하는 기반

복제 직후 로그인·권한·메뉴·마스터코드·업무기준·로그 분석이 실제로 동작한다. 화면을 새로 만들지 않아도 관리자가 사용자와 권한을 등록하고 메뉴를 붙일 수 있다.

| 영역 | 화면 | 위치 |
|---|---|---|
| 공통관리 › **마스터관리** | 카테고리 관리 · Master Code 관리 · Master Code 상세조회 (+ 코드선택·엑셀업로드 팝업) | `mcm-core/cma`·`cme` · `m-mcm/page-components/cma`·`cme`·`cmz` |
| 공통관리 › **시스템관리** | OBJECT · 메뉴 · 역할 · 역할그룹 · 사용자 · PERMISSION · 사용자 권한 일괄 등록 · 동기화 관리 | `mcm-core/csa` · `m-mcm/page-components/csa` |
| 공통관리 › **업무기준관리** | 업무기준 목록조회 · Data관리 · 상세조회 · 구조관리 (+ 팝업 3종) | `mcm-core/cmb` · `m-mcm/page-components/cmb`·`cmz` |
| **로그 분석** | 로그 뷰어 (모듈별 로그 검색·SQL 바인딩·워크스페이스) | `analog` · `m-analog` |
| 포털 기반 | 로그인 · 탭·즐겨찾기·메뉴 트리 셸 · BFF 프록시 · API 권한(RBAC) 검증 | `mcm` 런처 · `m-mcm` · `shared/portal-shell` |

메뉴·OBJECT·RBAC 초기 데이터는 `mcm/api` 의 `DataInitializer` 가 **멱등**으로 적재하므로 빈 DB 로 시작해도 된다. 이 화면들의 5종 설계 산출물은 [`docs/mcm/design/`](docs/mcm/design/) 에 함께 들어 있어, 신규 화면 설계의 깊이 기준선으로 쓴다.

포털 알림(STOMP push)과 EAI 인터페이스 화면(caravan 콘솔·인터페이스 포맷·전송오류)은 이 템플릿에 포함하지 않았다. 필요한 프로젝트에서 원본 패턴을 따라 붙인다.

## 문서 진입점

모든 에이전트·개발 작업 규칙의 정본은 [RULE.md](RULE.md) 다. 작업 착수 전 RULE.md 의 §"작업 분기 — 가이드 라우팅" 에서 단일 진입점을 고른다. `AGENTS.md` / `CLAUDE.md` 는 RULE.md 를 가리키는 래퍼다.

| 목적 | 진입점 |
|---|---|
| 전체 라우팅 (정본) | [RULE.md](RULE.md) |
| 세부 가이드 인덱스 | [docs/guide/README.md](docs/guide/README.md) |
| APS 현재 상태·작업·설계·개발 | [docs/aps/README.md](docs/aps/README.md) |
| MES 화면 설계 | [docs/guide/design/README.md](docs/guide/design/README.md) |
| MES 개발 | [docs/guide/MES/Mes-Guide.md](docs/guide/MES/Mes-Guide.md) |
| Backend / Frontend 표준 | [docs/guide/BackEnd/README.md](docs/guide/BackEnd/README.md) · [docs/guide/FrontEnd/README.md](docs/guide/FrontEnd/README.md) |

## 작업 분기

작업은 **목적**(설계 vs 개발) × **모듈**(APS vs MES) 로 아래 3개 분기 중 하나다. 상세 판정·게이트는 [RULE.md](RULE.md) 를 따른다.

1. **MES 화면 설계** — As-Is 분석 → 5종 설계 산출물 작성
2. **APS 작업** (설계+개발 통합) — `src/backend/{aps-core, mpn}`, `src/frontend/m-mpn`
3. **MES 개발** — 작성된 설계 산출물 → 코드 구현 — `src/backend/{moduleId}`, `src/frontend/m-{moduleId}`

## 저장소 구성

### Backend (`src/backend/`, Spring Boot · JDK 21)

- **APS** — `aps-core`(제품 라이브러리 `com.dongkuk.dmes:aps-core`), `mpn`(APS 런처, `api`+`lib`)
- **MES** — `mls`(물류), `mqc`(품질), `mpp`(조업), `mcm`·`mcm-core`(앱 호스트·메뉴·권한·마스터코드·업무기준 — **실동작**)
- **공통/인프라** — `cactus-core`(인증·OASIS 플랫폼), `oasis`(BPMN 런타임), `caravan-core`/`caravan-hub`/`caravan-console`(EAI/메시지 허브), `analog`(로그 검색 엔진), `data-migration`(고객사 데이터 이관 — `sample-migration` 이 패턴 예시)

`mcm`·`mcm-core` 를 뺀 업무 모듈(`aps-core`, `mls`, `mqc`, `mpp`, `mpn`)에는 `sample`/`Sample*` 패키지 한 벌만 들어 있다. 실제 업무 도메인 코드는 여기에 채워 넣는다.

### Frontend (`src/frontend/`, Next.js · React · pnpm)

- 모듈 앱 — `m-mcm`(포털 호스트 + BFF + 공통관리 화면 — **실동작**), `m-analog`(로그 뷰어 — **실동작**), `m-mpn`(APS), `m-mls`, `m-mpp`, `m-mqc`
- 공유 — `shared`(`@dk-oasis/shared` — 공통 컴포넌트·http·grid·portal-shell), `m-design-dummy`(디자인 핸드오프 샌드박스)

## 빌드·실행

복제 직후 아래 한 줄이면 백엔드 6개 모듈과 프론트엔드가 전부 뜬다. Ctrl+C 한 번으로 전부 정리된다.

```bash
./local-run.sh
```

백엔드/프론트를 따로 띄우려면:

```bash
./be-run.sh          # 백엔드만 (기본 --all)
```

```bash
./fe-run.sh --all -q # 프론트만, 설치·빌드 건너뛰고 dev 만
```

포트를 이미 물고 있는 프로세스가 있으면 정리하고 시작한다. 모듈 하나가 죽어도 나머지는 계속 뜨고,
어느 모듈이 죽었는지 로그에 남는다.

| 스크립트 | 기본 동작 | 주요 옵션 |
|---|---|---|
| `be-run` | 6개 모듈 동시 기동 | `--all` / 모듈별 `--mcm --mpn --mls --mqc --mpp --analog` / `--keep-port` |
| `fe-run` | pnpm install → 화면 라이브러리 build → 전체 dev | `--all` · `--mpn` · `-q`(설치·빌드 skip) · `--clean` · `--build` |
| `local-run` | BE + FE 동시 | 인자는 FE 로 전달. BE 대상은 `.run.env` 의 `BE_RUN_ARGS` |

**Windows** — 같은 동작의 PowerShell 판이 `*.ps1` 로 함께 들어 있다. 실행 정책에 막히지 않도록
`*.cmd` 래퍼를 두었으니 cmd·탐색기에서는 그쪽을 쓴다.

```bat
local-run.cmd
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\local-run.ps1
```

`.run.env`·포트·옵션은 셸 판과 동일하다. `.ps1` 은 Windows PowerShell 5.1 이 한글을 깨뜨리지 않도록
UTF-8 BOM + CRLF 로 커밋돼 있다(`.gitattributes` 가 고정).

기본 인자는 `.run.env` 에서 바꾼다 (`BE_RUN_ARGS` / `FE_RUN_ARGS` / `LOCAL_RUN_ARGS`).
이 파일은 개인 설정이라 git 에 없다 — [`.run.env.example`](.run.env.example) 을 복사해 쓰고,
없으면 스크립트가 `--all` 로 폴백하므로 복제 직후 설정 없이도 그대로 뜬다.

**로컬 포트** — 포털 `5000` · mls `8092` · mqc `8093` · mpp `8094` · mpn `8095` · **mcm `8100`(포털 호스트)** · analog `8191`.
FE 는 `m-mcm/.env` 의 `{모듈}_WAS_URL` 로 각 백엔드를 찾는다. 이 파일이 없으면 `fe-run.sh` 가
`.env.example` 에서 만들고 `AUTH_SECRET` 을 자동 발급한다 (로컬 전용 — 실 프로젝트에서 반드시 교체).

**초기 계정은 `admin` / `admin123`.** local 프로파일은 SQLite(`src/backend/data/*.db`)를 쓰고,
빈 DB 로 시작해도 `DataInitializer` 가 메뉴·권한·마스터 시드를 멱등 적재한다.

개별 모듈만 다룰 때:

- **Backend** — `cd src/backend/{모듈} && ../gradlew test` (Gradle wrapper 는 `src/backend` 한 벌만 둔다)
- **Frontend** — `cd src/frontend && pnpm install && pnpm dev` (세부 절차는 [docs/guide/FrontEnd/Local-Rules.md](docs/guide/FrontEnd/Local-Rules.md) §3)

세부 규칙(영속성·테스트·보안·배포·명명)은 모두 [docs/guide/](docs/guide/README.md) 하위 정본 문서를 따른다.
