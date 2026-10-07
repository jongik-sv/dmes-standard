# DMES 개발 지침 (APS · MES 라우터) — 표준 프로젝트 템플릿

> 본 저장소는 `dmes-ksm` 프로젝트를 모델로 뽑아낸 **표준/템플릿 프로젝트**다. 거버넌스 체계(본 파일, 스킬 체계, ADR 프로세스), Gradle/pnpm 빌드 골격, 프레임워크 모듈(oasis·cactus-core·caravan-*·analog)은 그대로 재사용 가능하도록 두었고, 업무 도메인 코드·문서는 `sample`/`Sample*` 접두어가 붙은 얇은 예시로 대체했다. 새 고객사 프로젝트를 시작할 때는 `{CLIENT}` 표기, `SampleErp`, `sample-*` 이름을 실제 값으로 바꿔 나가면 된다.

본 저장소에서 작업하는 모든 에이전트가 준수해야 할 최상위 라우터다. `CLAUDE.md` / `AGENTS.md` 는 본 파일을 가리키는 단순 래퍼이며, 작업 착수 전 아래 라우터에서 단일 진입점을 선택한다.

`RULE.md` 는 라우팅과 전역 운영 원칙만 둔다. Frontend, Backend, 보안, 데이터 마이그레이션, 공통 명명처럼 영역별 세부 규칙은 각 정본 문서에 둔다.

## 작업 분기 — 가이드 라우팅

작업은 **목적**(설계 vs 개발) × **모듈**(APS / MES) 두 축으로 다음 3개 분기 중 하나로 매핑된다.

| # | 작업 분기 | 진입점 | 적용 체계 |
|---|---|---|---|
| 1 | **MES 화면 설계** — As-Is 분석 → 5종 설계 산출물 작성 | 본 파일 §"화면 설계시 규칙" → [docs/guide/design/README.md](docs/guide/design/README.md) | 마이그레이션 분석 강화 (00~04 가이드 + templates) |
| 2 | **APS 작업** (설계 + 개발 통합) — `src/backend/{mpn, aps-core}`, `src/frontend/m-mpn` | [docs/aps/README.md](docs/aps/README.md) | 현재 할 일, 작업 정의, 개발 가이드와 설계 문서의 단일 진입점 |
| 3 | **MES 개발** — 작성된 설계 산출물 → 코드 구현 — `src/backend/{moduleId}`, `src/frontend/m-{moduleId}` | [docs/guide/MES/Mes-Guide.md](docs/guide/MES/Mes-Guide.md) §"Agent 빠른 실행 경로"·§"개발 진입 가드" | v2 개발가이드 + 5종 산출물 소비 |

식별 규칙:

- 화면코드 prefix 가 `APS_` 또는 작업 파일 경로가 `src/backend/{mpn, aps-core}` / `src/frontend/m-mpn` 이면 **APS** (분기 2) 로 본다.
- 그 외 화면코드 또는 `src/backend/{moduleId}` / `src/frontend/m-{moduleId}` (mpp / mqc / mls / mas / mcm 등) 은 **MES** 로 본다.
- MES 작업 지시에 "설계", "분석리포트", "기능설계서", "디자인설계서", "BPMN설계서", "정합체크" 등 산출물 작성 키워드가 있으면 분기 1이다.
- MES 화면의 `docs/{moduleId}/design/{화면식별자}/` 5종 산출물이 없거나 분석리포트가 없으면 분기 1이다. 단 mdm 은 `docs/mdm/screens/{화면식별자}/` 다(`docs/mdm/design` 은 외부 링크 — [docs/mdm/screens/README.md](docs/mdm/screens/README.md)).
- 5종 산출물이 모두 있고 분석완료 게이트 G1~G7 통과 + 정합체크 통과면 분기 3이다.
- 부분 누락·게이트 미통과·정합 불일치 등 경계 상태의 가드는 [Mes-Guide.md](docs/guide/MES/Mes-Guide.md) §4 "개발 진입 가드" 표를 따른다.

공통 규칙:

- 한 PR 에 여러 분기가 섞이면 섹션별로 분리해 각 가이드를 적용한다. 임의 혼용 금지.
- Frontend 구현 규칙은 APS/MES 로 분리하지 않는다. APS/MES 라우팅은 업무·설계·Backend 문맥 판정을 위한 것이며, FE 구현 세부는 공통 [docs/guide/FrontEnd/README.md](docs/guide/FrontEnd/README.md) 를 따른다.
- 모듈 폴더가 소스에 없으면 임의 생성하지 않고 사용자에게 확인한다.
- 문서 탐색은 인덱스 우선이다. 공통 가이드는 [docs/guide/README.md](docs/guide/README.md), APS는 [docs/aps/README.md](docs/aps/README.md), MES 설계는 [docs/guide/design/README.md](docs/guide/design/README.md), MES 개발은 [docs/guide/MES/Mes-Guide.md](docs/guide/MES/Mes-Guide.md)를 1차 진입점으로 한다.
- 워크스페이스/프로젝트 명칭이 모호할 때는 [docs/guide/Common/Workspace-Structure.md](docs/guide/Common/Workspace-Structure.md) 의 역할명을 따른다.
- BP(bpgoat 또는 Bpmn)의 협의·분석·설계 문서를 근거로 사용하는 작업은 [BP 워크스페이스 동기화 가이드](docs/guide/Common/BP-Workspace-Sync.md)에 따라 작업 시작 시 `./tools/bp-sync --if-stale`를 실행하고 `docs/external/BP/{CLIENT}/` 로컬 미러를 사용한다. `{CLIENT}` 는 실제 고객사 프로젝트 착수 시 `.bp-sync.json` 의 `outputDir` 과 함께 채운다.

## 에이전트 실행 운영 원칙

- 본 저장소에서 작업하는 모든 에이전트는 실행 환경(Codex, Claude 등)에 관계없이, 작업 수행 중 서브에이전트가 필요하다고 판단되면 서브에이전트를 만들어 병렬 조사·검토·구현 보조에 활용한다.
- 다음 상황에서는 서브에이전트 활용을 우선 검토한다: 동시에 여러 범위의 코드·문서·데이터를 확인해야 하는 경우, 서로 다른 모듈·계층·도메인을 분리 검토해야 하는 경우, 처리해야 할 업무량이 많아 병렬화가 품질과 속도에 도움이 되는 경우.
- 메인 에이전트는 서브에이전트 결과를 그대로 위임 종료하지 않고, 최종 판단·충돌 조정·수정 방향 결정·검증 책임을 가진다.
- 단일 파일의 작은 수정처럼 범위가 좁고 병렬화 이점이 낮은 작업은 메인 에이전트가 직접 수행해도 된다.

## 로컬 스킬 라우팅

- 작업 착수 전 `.claude/skills/` 목록을 확인한다.
- 요청 내용과 스킬 설명·`SKILL.md`가 일치하는 로컬 스킬이 있으면 사용자가 직접 지정하지 않아도 해당 스킬을 적용한다.
- 여러 스킬이 해당하면 작업에 필요한 최소 조합을 선택하고 적용 순서를 판단한다.
- 선택한 스킬의 `SKILL.md`는 작업 전에 끝까지 읽는다.
- Codex 전역 스킬과 로컬 스킬이 충돌하면 사용자 요청과 본 `RULE.md`를 우선한다.
- 실행 환경(Claude / Codex 등)에 무관하게 `.claude/skills/` 를 로컬 스킬 **정본** 으로 본다. Codex 전역 `~/.codex/skills/` 에 같은 이름이 없어도 본 디렉터리의 스킬을 적용한다.
- 실행 환경 간 공유가 필요한 스킬은 `.agents/skills/{스킬명}` → `../../.claude/skills/{스킬명}` 상대 심볼릭 링크로 노출한다. 사본을 두지 않는다 — 정본은 `.claude/skills/` 한 곳이고 `.agents/` 에는 링크만 둔다.
  - **불변식(2026-09-28 확인)**: `.claude/skills/` 의 스킬은 `_shared`(SKILL.md 없는 공용 문서)를 빼고 **전량** 링크로 노출한다. `.agents/skills/` 에 디렉터리 사본이 생기면 그건 규칙 위반이다 — 정본이 조용히 갈라지고, 어느 쪽을 고치느냐에 따라 하네스별 스킬이 서로 다른 지시를 주게 된다. 새 스킬을 추가할 때 링크를 같이 만들고, `ls -la .agents/skills` 로 전 항목이 `->` 임을 확인한다.
  - `dflow-*` 8종(D'Flow 에이전트 스킬)도 2026-10-01 부터 이 리포가 **정본**이다. wbs-web 의 `.claude/skills/dflow-*` 는 이곳으로 가는 링크이므로, 스킬 수정은 여기서 한다. 모든 스킬은 git 에 커밋한다(`.agents/` 링크는 mode `120000`).
  - OpenCode 는 `.claude/skills/` 를 직접 스캔하므로 링크가 없어도 동작한다. 링크는 Codex 등 `.agents/skills/` 만 보는 하네스용이라, **부재는 OpenCode 에서 티가 나지 않는다** — 그래서 위 불변식을 직접 확인해야 한다.

무조건 적용하는 스킬 (목록 대조를 기다리지 않고 아래 조건에서 즉시 진입):

| 조건 | 스킬 |
|---|---|
| MES 모듈(`mcm`/`mls`/`mqc`/`mpp`/`mas`)의 OASIS Service·BPMN 을 작성·수정한 뒤, 또는 응답 body 가 `meta` 만이라 화면 0 건 / `ParameterName must not be null` / `[grid] is an unavailable attribute` / `Generic type. You must explicitly specify` 오류가 났을 때 | [`.claude/skills/oasis-contract-check/`](.claude/skills/oasis-contract-check/SKILL.md) — 커밋 전 `node .claude/skills/oasis-contract-check/scripts/check_oasis_contract.mjs --root .` 가 ERROR 0 이어야 한다 |
| 백엔드 모듈(`aps-core`·`mcm-core`·`mdm` 등)의 DB 스키마를 바꿔 Flyway 마이그레이션 파일을 새로 만들 때 (엔티티·컬럼·인덱스·제약 추가/변경) | [`.claude/skills/flyway-migration-add/`](.claude/skills/flyway-migration-add/SKILL.md) — 번호는 방언별로 고르지 말고 `migration_tool.py status` 가 주는 합집합 채번을 쓴다 |
| ADR 을 발행·개정하거나 `PROPOSED → ACCEPTED` 로 확정할 때 (전 모듈 공용) | [`.claude/skills/adr-write/`](.claude/skills/adr-write/SKILL.md) — 번호는 **모듈별 독립**(접두어 없음). 모듈 밖 인용은 번호만 쓰지 말고 경로 링크를 함께 쓴다 |
| BP(bpgoat)에 **새 회의록·협의·설계 문서가 올라왔을 때** 그 내용을 설계에 반영해야 하는 경우 (조회만 하면 해당 없음) | [`.claude/skills/bp-update-intake/`](.claude/skills/bp-update-intake/SKILL.md) — 실질 신규분은 `.md` mtime 으로 가린다(`.doc.json` 단독 갱신 = 본문 무변경). 판정은 문서끼리가 아니라 shipped 코드로 하고, 반영은 **안건집 → ADR → 메모리** 순 |
| STT(음성 인식) 자막을 **회의록으로 정리**할 때 (녹음 자막 `.txt` 수령, "회의록 정리·작성해줘") | [`.claude/skills/meeting-minutes/`](.claude/skills/meeting-minutes/SKILL.md) — 작성 규칙 정본은 BP 미러의 「회의 내용 요약 프롬프트」. 자막은 `offset`/`limit` 으로 **전량** 읽고, 교정 근거는 [`docs/glossary/`](docs/glossary/) 의 단어집·이해관계자 명단(고객사 착수 시 채움). 확신 낮은 인명·수치는 본문에서 빼고 따로 보고 |
| `src/frontend` 의 화면(`m-*`)·shared UI 를 만들거나 고칠 때, Mantine·ag-grid prop/옵션이 설치 버전에서 유효한지 확인하거나 옛 API·타입 오류를 고칠 때 | [`.claude/skills/mantine-aggrid-ui/`](.claude/skills/mantine-aggrid-ui/SKILL.md) — 규칙 정본은 [FrontEnd 가이드](docs/guide/FrontEnd/README.md)(Part B·UI-Visual-Standard)이고 스킬은 문서 조회·검증 절차다. 라이브러리 문서는 설치 버전(Mantine 9.6 · ag-grid-community 33.3.2) 기준으로 스크립트로 조회하고, 바꾼 파일은 커밋 전 `audit` 두 개가 0건이어야 한다 |

## 화면 설계시 규칙

본 절은 **분기 1 (MES 화면 설계) 의 진입점** 이다. APS 화면 설계는 본 절을 적용하지 않고 분기 2 ([docs/aps/README.md](docs/aps/README.md))를 따른다.

진입 시 필독:

- [docs/guide/design/README.md](docs/guide/design/README.md) — 설계 가이드 인덱스, 파일 번호 체계, 읽기 순서, 템플릿 위치.
- [docs/guide/design/00_Agent지시_가이드.md](docs/guide/design/00_Agent지시_가이드.md) — 산출물 작성 순서, 분석완료 게이트(G1~G7), 정합 키 정의.
- [docs/guide/design/01_Agent부속_가이드.md](docs/guide/design/01_Agent부속_가이드.md) — `moduleId`, 화면식별자, `pageId`, `serviceId`, 테이블명 등 명명 정본.
- [docs/guide/design/02_화면_기능설계_가이드.md](docs/guide/design/02_화면_기능설계_가이드.md), [03_화면_디자인설계_가이드.md](docs/guide/design/03_화면_디자인설계_가이드.md), [04_백단_BPMN_기능설계_가이드.md](docs/guide/design/04_백단_BPMN_기능설계_가이드.md).

진입 게이트:

- 본 프로젝트는 신규 개발이 아닌 **{CLIENT} 기존 ERP → 신규 MES 마이그레이션** 이다. 설계 시작 전 원본 자료(`docs/external/{CLIENT_ERP}/`, 템플릿에서는 [`docs/external/SampleErp/`](docs/external/SampleErp/)) 전수 확보 필수다.
- 분석리포트 없이 기능/디자인/BPMN 설계서를 먼저 작성하지 않는다.

## 세부 개발 규칙 진입점

긴 정책 본문은 `RULE.md` 에 직접 추가하지 않고 아래 영역별 정본 문서에 추가한다.

| 영역 | 정본 |
|---|---|
| 공통 용어·식별자 | [docs/guide/Common/Identifier-Glossary.md](docs/guide/Common/Identifier-Glossary.md) |
| 워크스페이스·패키지·`core/lib/app/package` 역할명 | [docs/guide/Common/Workspace-Structure.md](docs/guide/Common/Workspace-Structure.md) |
| Frontend UI·BFF·검증·중요 액션 UX | [docs/guide/FrontEnd/Local-Rules.md](docs/guide/FrontEnd/Local-Rules.md) |
| Frontend 표준 통합 가이드 | [docs/guide/FrontEnd/README.md](docs/guide/FrontEnd/README.md) |
| Backend 구현·영속성·테스트·서버 재검증·DB/Seed | [docs/guide/BackEnd/Backend-Implementation-Guide.md](docs/guide/BackEnd/Backend-Implementation-Guide.md) |
| Backend 표준 통합 가이드 | [docs/guide/BackEnd/README.md](docs/guide/BackEnd/README.md) |
| 데이터 마이그레이션 스크립트 패턴 (고객사 baseline 은 착수 시 신설) | [src/backend/data-migration/sample-migration/README.md](src/backend/data-migration/sample-migration/README.md) |
| 보안·인증·인가 | [docs/guide/Security/README.md](docs/guide/Security/README.md) |

## RULE.md 관리 원칙

- `RULE.md` 는 분기 라우팅, 전역 운영 원칙, 영역별 정본 문서 인덱스만 유지한다.
- Frontend UX, Backend 구현, 테스트, 데이터 마이그레이션, 보안 등 세부 규칙은 해당 영역 문서에 둔다.
- 라우팅 규칙이 충돌하면 본 파일을 우선하고, 구현 세부가 충돌하면 해당 영역 정본 문서를 갱신해 정합을 맞춘다.
