# DMES — APS · MES (표준 프로젝트 템플릿)

`dmes-ksm` 프로젝트에서 뽑아낸 **표준/템플릿 저장소**다. 고객사 ERP 를 신규 **APS**(고급 계획·스케줄링)와 **MES**(제조 실행) 로 이관·구축하는 프로젝트를 시작할 때 이 저장소를 복제해 쓴다. 백엔드는 Spring Boot 멀티 모듈(JDK 21), 프론트엔드는 Next.js/React(pnpm 모노레포) 기반이다.

거버넌스 체계·프레임워크 모듈(oasis, cactus-core, caravan-\*, analog)·빌드 골격은 원본 그대로이며, 업무 도메인 코드와 문서는 `sample`/`Sample*` 접두어가 붙은 얇은 예시로 대체되어 있다. 실제 고객사 프로젝트에 쓸 때는:

1. `RULE.md`·`docs/external/SampleErp/`·`.bp-sync.json` 등의 `{CLIENT}` 표기를 실제 고객사명으로 채운다.
2. 각 업무 모듈(`aps-core`, `mcm-core`, `mcm`/`mls`/`mqc`/`mpp`/`mpn` 의 `sample` 패키지, `m-mpn`/`m-mls`/`m-mqc`/`m-mpp`/`m-mcm` 의 `sample` 컴포넌트)을 실제 업무 도메인으로 교체한다.
3. `docs/aps`, `docs/mcm`, `docs/mls`, `docs/mqc`, `docs/mpp`, `docs/mes`, `docs/glossary` 등의 placeholder 문서를 실제 분석·설계 산출물로 채운다.

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
- **MES** — `mls`(물류), `mqc`(품질), `mpp`(조업), `mcm`·`mcm-core`(앱 호스트·메뉴·권한·마스터코드)
- **공통/인프라** — `cactus-core`(인증·OASIS 플랫폼), `oasis`(BPMN 런타임), `caravan-core`/`caravan-hub`/`caravan-console`(EAI/메시지 허브), `analog`(로그 검색 엔진), `data-migration`(고객사 데이터 이관 — `sample-migration` 이 패턴 예시)

각 업무 모듈(`aps-core`, `mcm-core`, `mcm`, `mls`, `mqc`, `mpp`, `mpn`)에는 `sample`/`Sample*` 패키지 한 벌만 들어 있다. 실제 업무 도메인 코드는 여기에 채워 넣는다.

### Frontend (`src/frontend/`, Next.js · React · pnpm)

- 모듈 앱 — `m-mpn`(APS), `m-mcm`(포털 호스트), `m-mls`, `m-mpp`, `m-mqc`, `m-analog`
- 공유 — `shared`(`@dk-oasis/shared` — 공통 컴포넌트·http·grid·portal-shell), `m-design-dummy`(디자인 핸드오프 샌드박스)

## 빌드·실행

- **Backend** — 각 모듈 Gradle. 예: `cd src/backend/aps-core && ./gradlew test`
- **Frontend** — `cd src/frontend && pnpm install && pnpm dev` (세부 절차는 [docs/guide/FrontEnd/Local-Rules.md](docs/guide/FrontEnd/Local-Rules.md) §3)
- 로컬 실행 스크립트 — `./be-run.sh`, `./fe-run.sh`, `./local-run.sh` (기본 인자는 `.run.env` 참고)

세부 규칙(영속성·테스트·보안·배포·명명)은 모두 [docs/guide/](docs/guide/README.md) 하위 정본 문서를 따른다.
