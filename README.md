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

## 처음 받은 뒤 셋업

DB 를 따로 설치하거나 만들 필요가 없다. local 프로파일은 모듈마다 SQLite 파일(`src/backend/data/{모듈}.db`)을 쓰고,
서버를 처음 띄울 때 파일 생성·스키마·기본 데이터가 자동으로 채워진다.

### 1. 준비물

| 항목 | 내용 |
|---|---|
| JDK 21 | 백엔드 컴파일 대상이 21 이다. 기본 `java` 가 17 이하면 실행할 때 `JAVA_HOME` 을 21 로 준다(아래 2번). Gradle wrapper jar 는 저장소에 들어 있다. |
| Node.js · pnpm | 프론트엔드(`src/frontend`, pnpm 모노레포). 처음 실행 때 `fe-run.sh` 가 `pnpm install` 과 화면 라이브러리 build 를 한다. |
| sqlite3 (선택) | DB 내용을 직접 보거나 MDM 샘플을 손으로 넣을 때만 쓴다. |

### 2. 첫 실행

```bash
git clone https://github.com/jongik-sv/dmes-standard.git
cd dmes-standard
JAVA_HOME=<JDK 21 경로> PATH="$JAVA_HOME/bin:$PATH" ./local-run.sh   # 백엔드 + 프론트 (기본 --all)
```

- 설정 파일 없이도 뜬다. 띄울 모듈을 줄이려면 [`.run.env.example`](.run.env.example) 을 `.run.env` 로 복사해 `BE_RUN_ARGS` 등을 고친다.
- `src/frontend/m-mcm/.env` 가 없으면 `fe-run.sh` 가 `.env.example` 로 만들고 `AUTH_SECRET` 을 발급한다.
- 브라우저에서 포털 http://localhost:5100 에 **`admin` / `admin123`** 으로 로그인한다.

### 3. 첫 기동 때 자동으로 되는 일 (DB)

| 무엇 | 누가 |
|---|---|
| `src/backend/data/` 폴더와 모듈별 `*.db` 파일 생성 | `be-run.sh` · SQLite 드라이버 |
| 테이블 생성과 기본 시드 (mls·mqc·mpp·mpn·aps 의 `V1__init_sample_*` 샘플 행 포함) | 모듈별 Flyway 마이그레이션 (`db/migration/**`) |
| 관리자 계정·메뉴·권한·OBJECT·마스터 시드 (MDM 메뉴 포함) | mcm `DataInitializer` (멱등) |
| MDM 화면 확인용 샘플 데이터 (용어·도메인·컬럼·레이아웃·마루 코드·마루 데이터·업무 룰) | mdm `MdmLocalSampleLoader` — **`be-run.sh` 로 띄우고 용어 사전이 빈 DB 일 때만 한 번** 넣는다 |

- MDM 샘플 원본은 텍스트 파일 [`src/backend/mdm/sample/mdm-local-sample.sql`](src/backend/mdm/sample/mdm-local-sample.sql) 이다. 이미 쓰던 `mdm.db` 에는 넣지 않는다.
  끄려면 `MDM_SAMPLE=0 ./be-run.sh`. 자동 테스트·E2E 는 `be-run.sh` 를 거치지 않으므로 샘플이 섞이지 않는다.
- 샘플을 손으로 넣을 때(예: Windows, 또는 모듈 폴더에서 `gradlew :api:bootRun` 으로 직접 띄운 경우) — mdm 을 한 번 띄워 `mdm.db` 를 만든 뒤 저장소 루트에서:
  ```bash
  sqlite3 src/backend/data/mdm.db < src/backend/mdm/sample/mdm-local-sample.sql
  ```

### 4. DB 를 처음 상태로 되돌리기

서버를 끄고 `src/backend/data/*.db` 를 지운 뒤(필요하면 먼저 백업) 다시 띄우면 3번이 처음부터 다시 된다.
모듈 하나만 되돌리려면 그 모듈의 `{모듈}.db` 만 지운다. `*.db` 는 `.gitignore` 대상이라 커밋되지 않는다.

### 5. (선택) D'Flow 에이전트 스킬

`.claude/skills/dflow-*` 를 쓰려면 개인 설정 파일이 필요하다. 샘플을 복사하고 토큰만 채운다.

```bash
cp .dflow.local.example .dflow.local   # pats= 에 D'Flow 웹 /account 「내 토큰」 값을 넣고 dev_branch 를 확인한다
.claude/skills/dflow-work/scripts/dflow.sh doctor
```

`.dflow.local` 은 개인 토큰이 들어가므로 커밋하지 않는다(`.gitignore`). 필요한 명령: git · curl · jq · python3 · gh.

### 6. (필수) Claude Code — 사용 한도 초기화 뒤 자동 계속

Claude Code 세션이 claude.ai 사용 한도(5시간 슬롯)에 걸리면 작업이 멈춘다. 아래 설정을 켜 두면 한도가 초기화될 때
멈춘 작업을 스스로 이어 간다. 밤새 돌리는 에이전트·팀 작업이 한도 때문에 아침까지 멈춰 있지 않도록 **모두 켠다.**

개인 설정 파일 `~/.claude/settings.json` 에 한 줄을 넣는다(저장소에 커밋하는 설정이 아니다).

```json
{
  "autoContinueAtUsageLimit": true
}
```

- claude.ai 구독 계정으로 로그인한 세션에 적용된다. 확인한 버전: Claude Code 2.1.287.
- 끄면 한도에 걸릴 때 선택 창(`What do you want to do?`)이 뜬다. 추가 지출·업그레이드 항목이 들어 있을 수 있으므로 Enter 를 무심코 누르지 않는다.
- 다음 경우에는 자동 계속이 취소된다. 그때는 직접 프롬프트를 보내거나 `/rate-limit-options` 로 다시 건다.
  - 기다리는 동안 Claude Code 를 다시 띄우거나 세션을 백그라운드로 보낸 경우
  - 초기화까지 24시간 넘게 남은 경우(주간 한도)
  - 초기화 뒤에도 한도에 거듭 걸린 경우

## 빌드·실행

복제 직후 아래 한 줄이면 백엔드 7개 모듈과 프론트엔드가 전부 뜬다. Ctrl+C 한 번으로 전부 정리된다.

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
| `be-run` | 7개 모듈 동시 기동 (2개 이상이면 먼저 [선빌드](#백엔드-선빌드-be-run)) | `--all` / 모듈별 `--mcm --mpn --mls --mqc --mpp --mdm --analog` / `--keep-port` / [`--dry-run`](#드라이런---dry-run) |
| `fe-run` | pnpm install → 화면 라이브러리 build → 전체 dev | `--all` · `--mpn` · `-q`(설치·빌드 skip) · `--clean` · `--build` |
| `local-run` | BE + FE 동시 | 인자는 FE 로 전달. BE 대상은 `.run.env` 의 `BE_RUN_ARGS` |
| `dmes-up` (Windows 전용) | JDK 21 지정 → wrapper jar 보충 → 포트 정리 → BE + FE | `-Detach` · `-Be` · `-Fe` · `-Full` · `-Clean` · `-Warmup`(아무 동작 안 함) — [아래](#windows-한-번에-띄우기-dmes-up) |

**Windows** — 같은 동작의 PowerShell 판이 `*.ps1` 로 함께 들어 있다. 실행 정책에 막히지 않도록
`*.cmd` 래퍼를 두었으니 cmd·탐색기에서는 그쪽을 쓴다.

```bat
local-run.cmd
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\local-run.ps1
```

포트·옵션은 셸 판과 같다. 단 PowerShell 판 `be-run.ps1` 은 아직 `mdm` 모듈을 띄우지 않고(MDM 샘플 자동 적재도 셸 판에만 있다),
`.run.env` 와 환경변수를 읽는 순서가 셸 판과 다르다([아래 표](#runenv-와-환경변수-우선순위)). 한글이 든 `.ps1` 은 Windows PowerShell 5.1 이 깨뜨리지 않도록
UTF-8 BOM + CRLF 로 커밋돼 있다(줄 끝은 `.gitattributes` 가 CRLF 로 고정. `dmes-up.ps1`·`dmes-down.ps1` 은 ASCII 만 쓴다).
Windows 에서 확인할 항목은 [docs/refactor-2026-10/windows-ps1-checklist.md](docs/refactor-2026-10/windows-ps1-checklist.md) 에 모았다.

기본 인자는 `.run.env` 에서 바꾼다 (`BE_RUN_ARGS` / `FE_RUN_ARGS` / `LOCAL_RUN_ARGS`).
이 파일은 개인 설정이라 git 에 없다 — [`.run.env.example`](.run.env.example) 을 복사해 쓰고,
없으면 스크립트가 `--all` 로 폴백하므로 복제 직후 설정 없이도 그대로 뜬다.

**로컬 포트** — 포털 `5100` · mls `8092` · mqc `8093` · mpp `8094` · mpn `8095` · mdm `8096` · **mcm `8100`(포털 호스트)** · analog `8191`.
FE 는 `m-mcm/.env` 의 `{모듈}_WAS_URL` 로 각 백엔드를 찾는다. 이 파일이 없으면 `fe-run.sh` 가
`.env.example` 에서 만들고 `AUTH_SECRET` 을 자동 발급한다 (로컬 전용 — 실 프로젝트에서 반드시 교체).

**초기 계정은 `admin` / `admin123`.** local 프로파일은 SQLite(`src/backend/data/*.db`)를 쓰고,
빈 DB 로 시작해도 `DataInitializer` 가 메뉴·권한·마스터 시드를 멱등 적재한다(자세한 내용은 §"처음 받은 뒤 셋업").

개별 모듈만 다룰 때:

- **Backend** — `cd src/backend/{모듈} && ../gradlew test` (Gradle wrapper 는 `src/backend` 한 벌만 둔다)
- **Frontend** — `cd src/frontend && pnpm install && pnpm dev` (세부 절차는 [docs/guide/FrontEnd/Local-Rules.md](docs/guide/FrontEnd/Local-Rules.md) §3)

세부 규칙(영속성·테스트·보안·배포·명명)은 모두 [docs/guide/](docs/guide/README.md) 하위 정본 문서를 따른다.

### 백엔드 선빌드 (be-run)

모듈을 **2개 이상** 띄우면(`--all` 포함) be-run 은 모듈별 bootRun 앞에서 `src/backend` 루트 composite 로 Gradle 을 한 번 돌려
bootRun 이 쓸 산출물(classes·jar)을 먼저 만든다. 모듈마다 따로 도는 bootRun 여러 개가 공유 includeBuild(cactus-core·mcm-core·
maru-mdm-engine 등)를 동시에 빌드하며 서로의 `build/classes`·jar 를 덮어쓰던 경합을 없애려는 단계다.

1. **계획** — `src/backend/gradlew :<모듈>:api:bootRun … -m -q`. `-m` 이라 태스크를 실행하지 않고 목록만 받는다. 여기서 `bootRun` 을 뺀 태스크가 선빌드 대상이다(손으로 적지 않아 의존이 바뀌어도 따라간다).
2. **선빌드** — 그 태스크 전부를 Gradle 1회로 실행한다(`--continue`). 셸 판은 종전 bootRun 처럼 PC 전역 무거운 명령 슬롯(heavy.sh) 없이 돈다.
3. **기동** — 모듈 폴더에서 종전처럼 `:api:bootRun`. 컴파일·jar 가 UP-TO-DATE 라 기동만 한다.

- 모듈이 1개면 선빌드 없이 bootRun 이 직접 빌드한다(종전 동작).
- 계획이나 선빌드가 실패하면 **아무 모듈도 띄우지 않고** 끝난다. 실패한 채 띄우면 bootRun 들이 다시 동시에 빌드해 경합이 되살아나기 때문이다.
  종료 코드는 셸 판 `1`, ps1 판은 계획 실패 `1`·빌드 실패 Gradle 종료 코드다. `local-run` 은 be-run 종료를 보고 FE 까지 정리하고,
  `dmes-up.ps1 -Detach` 는 대기를 멈추고 함께 띄운 FE 를 정리한 뒤 `1` 로 끝난다.
- 셸 판에서 선빌드 도중 Ctrl+C·TERM 을 받으면 선빌드 프로세스까지 정리하고 130·143 으로 끝난다. 계획(`-m`, 몇 초) 도중 받은 TERM 은 계획 프로세스까지 정리하지 못한다.

| 변수 | 값 | 동작 |
|---|---|---|
| `BE_PREBUILD` | `0` | 선빌드를 끈다 — 모듈별 bootRun 이 종전처럼 각자 빌드한다 |
| `BE_PREBUILD_CONTINUE` | `1` | 선빌드가 실패해도 모듈을 띄운다 — 실패한 모듈은 자기 로그에 같은 오류를 다시 낸다 |

```bash
BE_PREBUILD=0 ./be-run.sh --all            # 선빌드 없이
BE_PREBUILD_CONTINUE=1 ./be-run.sh --all   # 실패해도 기동
```

둘 다 환경변수나 `.run.env` 에 둔다. 둘이 겹칠 때 어느 쪽이 이기는지는 셸 판과 ps1 판이 다르다([아래 표](#runenv-와-환경변수-우선순위)).

### 드라이런 (`--dry-run`)

`./be-run.sh --all --dry-run` (ps1 판도 같은 이름 — `.\be-run.ps1 --all --dry-run`)은 **서버를 띄우지도 끄지도 않고** 이전 인스턴스 종료·포트 회수도
하지 않은 채 할 일만 출력한다 — 기동 대상, 회수할 포트, 선빌드 계획과 태스크 목록, 모듈별 bootRun 명령.

- 단 선빌드 대상(모듈 2개 이상이고 `BE_PREBUILD` 가 `0` 이 아님)이면 태스크 목록을 보이려고 **`gradlew -m`(계획만, 태스크 실행 없음)을 한 번 부른다.**
  그래서 Gradle 데몬 기동·설정 시간이 들고, 계획이 실패하면 그 출력 끝 15줄을 보인다(드라이런 자체는 0 으로 끝난다).
  모듈이 1개거나 `BE_PREBUILD=0` 이면 Gradle 을 부르지 않는다.
- 모듈 플래그 없이 `--dry-run`(·`--keep-port`)만 주면 `BE_RUN_ARGS`(없으면 `--all`)의 모듈을 대상으로 한다.

### 모듈을 나중에 하나 더 띄울 때 (현재 동작)

be-run 은 시작하면서 **같은 체크아웃에서 이미 돌고 있는 be-run 을 먼저 끝낸다.** 그래서 `./be-run.sh --mcm` 이 도는 중에 다른 터미널에서
`./be-run.sh --mdm` 을 실행하면, 앞의 be-run 이 TERM 을 받고 자기 정리(cleanup)로 mcm 까지 내린 뒤 새 실행이 mdm 만 띄운다.

- 이유(`be-run.sh` 의 `terminate_previous_be_runs`) — 포트만 빼앗으면 이전 be-run 이 "내 모듈이 다 죽었다" 고 보고 뒤늦게 cleanup 을 돈다.
  그 cleanup 은 이 체크아웃 모듈 포트의 앱 JVM 을 정리하므로 방금 새로 띄운 같은 포트 모듈까지 죽일 수 있다. 그래서 포트를 건드리기 전에
  이전 인스턴스에 TERM 을 보내고 cleanup 이 끝나길 최대 30초 기다린 뒤, 남아 있으면 KILL 한다.
- 셸 판이 끝내는 대상은 **이 체크아웃의** `be-run.sh` 뿐이다(명령줄 절대경로나 작업 디렉터리로 판정). 다른 워크트리·체크아웃의 be-run 과
  자기를 띄운 부모(`local-run.sh`)는 건드리지 않는다.
- ps1 판(`be-run.ps1` 의 `Stop-PreviousBeRuns`)은 명령줄에 `be-run.ps1` 이 든 **PC 의 모든 프로세스**를 끝낸다 — 체크아웃을 가리지 않는다.
  taskkill `/T` 뒤 30초 안에 끝나지 않으면 `/F`.
- `local-run` 이 도는 중에 따로 be-run 을 실행하면 local-run 이 띄운 be-run 이 위 규칙으로 끝나고, local-run 은 백엔드 종료를 보고 전체 정리에 들어간다.
  그 정리는 명령줄에 이 체크아웃 `src/` 경로가 든 프로세스를 쓸어 담으므로 새로 띄운 be-run 의 Gradle·모듈까지 끝낼 수 있다(코드를 읽어 정리한 동작, 실측은 아니다).

여러 모듈을 함께 띄우려면 **한 번의 be-run 에 모듈을 같이 준다** — `./be-run.sh --mcm --mdm` 또는 `--all`.
이미 돌던 구성에 모듈을 더하려면 전체 목록으로 다시 실행한다(앞의 실행은 위처럼 정리되고, 2개 이상이면 선빌드부터 다시 한다).
로컬 기본 구성으로 굳히려면 `.run.env` 의 `BE_RUN_ARGS` 에 적는다.

### .run.env 와 환경변수 우선순위

셸 판(`be-run.sh`·`fe-run.sh`·`local-run.sh`)은 `.run.env` 를 셸 스크립트로 실행(`. .run.env`)하고, ps1 판은 `이름=값` 줄을 글자로 읽는다.
그래서 같은 설정이 다르게 먹을 수 있다.

| 항목 | 셸 판 (sh) | ps1 판 |
|---|---|---|
| `.run.env` 읽는 방식 | 셸로 실행(source) — 셸 문법을 다 쓸 수 있다 | `이름=값` 줄만 정규식으로 읽고 값 양끝 따옴표를 뗀다. `export 이름=…` 줄은 못 읽고, 줄 끝 주석은 값에 섞인다 |
| 같은 이름이 여러 줄 | 마지막 줄이 이긴다 | 첫 줄이 이긴다 |
| `BE_PREBUILD` · `BE_PREBUILD_CONTINUE` | `.run.env` 에 있으면 **`.run.env` 가 이긴다**(환경변수를 덮어쓴다). 없을 때만 환경변수 | **환경변수가 이긴다.** 비어 있을 때만 `.run.env` |
| `BE_RUN_ARGS` · `FE_RUN_ARGS` · `LOCAL_RUN_ARGS` | `.run.env` 가 이기고, 거기 없으면 환경변수도 읽힌다 | `.run.env` 만 읽는다(환경변수는 보지 않는다) |
| `MDM_SAMPLE` · `DEV_LOG_COLOR` | 위와 같은 순서(`.run.env` → 환경변수) | 해당 기능이 없다 |
| 포털 포트 | `modules.conf` 값을 `.run.env` 의 `PORTAL_PORT` 가 덮을 수 있다(`fe-run.sh`·`local-run.sh`) | `modules.conf` 값만 쓴다 |
| `*_RUN_ARGS` 가 붙는 때 | 공통 — 명령줄에 대상 플래그(be: 모듈, fe·local: `--all`·`--mpn`·`--mdm` 등 범위)가 없을 때만 | 같음(ps1 판 `local-run` 의 범위 플래그는 `--all`·`--full`·`--mpn`·`--mpn-only`) |

- 셸 판에서 한 번만 다른 값으로 돌리려면(`BE_PREBUILD=0 ./be-run.sh …`) `.run.env` 에 그 변수를 두지 않는다. 두면 `.run.env` 값이 이긴다.
- `dmes-up.ps1 -Detach` 는 백엔드·프런트를 WMI 로 띄우므로 호출한 창의 환경변수가 전달되지 않을 수 있다(미검증) — 이때 `BE_PREBUILD*` 는 `.run.env` 에 둔다.

### Windows 한 번에 띄우기 (dmes-up)

`dmes-up.cmd`(→ `dmes-up.ps1`)는 JDK 21 지정 → `gradle-wrapper.jar` 보충 → 이 저장소의 이전 실행·포트 정리 → BE + FE 기동을 한 번에 한다.
백엔드 대상은 `-Detach`·`-Be` 면 `be-run.ps1 --all`(ps1 판 6개 모듈), 옵션 없는 포그라운드면 `local-run.ps1` 을 거쳐 `.run.env` 의 `BE_RUN_ARGS`(없으면 `--all`)다.

| 옵션 | 동작 |
|---|---|
| (없음) | 포그라운드 — `local-run.ps1` 로 띄우고 이 창의 Ctrl+C 로 함께 끈다 |
| `-Detach` | 백그라운드 — 이 창을 닫아도 남는다. 로그 `logs\be.log`·`logs\fe.log`, 끄기는 `dmes-down.cmd`. 포트가 다 열릴 때까지 최대 8분(선빌드 포함) 기다리고, 백엔드가 포트를 열기 전에 끝나면(선빌드 실패 등) 함께 띄운 FE 를 정리하고 `1` 로 끝난다 |
| `-Be` / `-Fe` | 한쪽만 |
| `-Full` | FE 를 install·build 부터(`--all`). 주지 않으면 `--all -q` |
| `-Clean` | `-Full` 과 같다 |
| `-Warmup` | **아무 동작도 하지 않는다.** 예전 모듈별 직렬 warm-up 은 be-run.ps1 선빌드로 바뀌었고, 옛 명령이 깨지지 않게 받아 두기만 한다(주면 "더 필요 없다" 안내만 낸다) |
