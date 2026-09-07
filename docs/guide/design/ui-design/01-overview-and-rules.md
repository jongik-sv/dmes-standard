# {CLIENT} MES 디자인설계 표준 가이드

> 상위 문서: [{CLIENT} MES 디자인설계 표준 가이드](../03_화면_디자인설계_가이드.md)

## 본 문서 구성

디자인설계 가이드는 허브 문서와 하위 장 문서로 분리되어 있다. 본 문서는 개요, 공통 원칙, 레이아웃, 명명, 금지사항을 담는다.

| 파트 | 내용 | 사용 시점 |
|---|---|---|
| Part A | 설계 표준 규칙 (§A.1 ~ §A.12) | 디자인설계서 작성 규칙·명명·금지사항 확인 시 |
| 템플릿 | [`03-template-and-sample.md`](03-template-and-sample.md) | 실제 디자인설계서 작성 시 템플릿 절을 사용 |
| Quick Sample | [`03-template-and-sample.md`](03-template-and-sample.md) — 주문등록(orderRegistration) | 처음 적용 시 또는 패턴 매칭 시 |

### 공통 참조 문서
| 문서 | 용도 |
|---|---|
| 「02_화면_기능설계_가이드.md」 | 기능↔디자인 설계서 정합 확인 시 |
| 「04_백단_BPMN_기능설계_가이드.md」 | 팝업/연계 흐름 매핑 시 |
| 「../FrontEnd/FrontEnd_표준_통합_개발가이드_v2.md」 | Frontend 개발 표준 통합본 (Part A 규칙 + Part B shared 카탈로그 + Part C 샘플) — §A.9 개발 연계, `@dk-oasis/shared` 허용 서브패스 확인 시 |

### 공통 원칙 (MUST)
- 구현 기반: Mantine 9 + ag-grid-community. `@dk-oasis/shared` 공통 컴포넌트는 Mantine 9 위에 구현되며, 그리드만 ag-grid-community 를 유지한다([전 모듈 ADR-0001](../../adr/0001-ui-library-mantine9-aggrid.md)).
- 모든 화면은 Frontend 개발가이드 §3-1 페이지 유형(A~E) 중 하나를 선택한다 (§A.4-1).
- **SIDEBAR / HEADER / TabsBar 는 `portal` 의 `PortalShell` 이 자동 주입**한다. 화면 설계의 대상 영역은 **`PageLayout` 내부 영역(SearchArea / ContentBody / ContentPanel)** 으로 한정한다. (MUST)
- 공통 컴포넌트는 `@dk-oasis/shared` 의 허용된 서브패스(`/layout`, `/form`, `/grid`, `/modal`, `/tree`, `/message-provider`, `/http`, `/use-api-call`, `/use-form-validation`, `/snapshot`, `/error-boundary` 등)에서 import 한다. 허용 목록 외 서브패스 사용 금지. (MUST NOT)
- 스타일 값(색상·폰트·여백)은 직접 정의 금지. `shared/src/*.css` 의 **CSS Custom Properties 토큰**(예: `var(--color-primary)`, `var(--spacing-md)`, `var(--font-size-md)`) 을 참조한다. (MUST)
- **외부 아이콘 라이브러리 사용 금지.** `lucide-react`, `@mui/icons-material`, `@ui5/icons` 등 별도 아이콘 패키지를 도입하지 않는다. 아이콘은 **인라인 `<svg viewBox="0 0 24 24" fill="none" stroke strokeWidth={2}><path d={pathData}/></svg>` 패턴**으로 처리하며, path 상수는 `src/{group}/{page}/icons.ts` 에 정의한다. (§A.5-4 / §A.8-8)

### 필수 참조 자료 — 기존 {CLIENT} ERP 원본 (MUST)

본 프로젝트는 **신규 개발이 아닌 {CLIENT} 기존 ERP → 신규 MES 마이그레이션**이다. 모든 설계는 아래 위치의 기존 ERP 원본 자료를 **반드시 먼저 확인**하고 진행한다. 임의 추정·신규 설계 금지.

| 자료 종류 | 위치 (프로젝트 루트 기준) | 설계 시 활용 |
|---|---|---|
| 테이블 | [`docs/external/KsmErpK/tables/`](../../../external/KsmErpK/tables) | As-Is 컬럼/관계 분석 → To-Be 테이블 매핑 근거 |
| 뷰 | [`docs/external/KsmErpK/views/`](../../../external/KsmErpK/views) | 조회 로직·조인·집계 규칙 추출 |
| 프로시저 | [`docs/external/KsmErpK/procedures/`](../../../external/KsmErpK/procedures) | 저장·상태변경·배치 등 비즈니스 로직 추출 |
| 함수 | [`docs/external/KsmErpK/functions/`](../../../external/KsmErpK/functions) | 계산식·변환식·유효성 규칙 추출 |
| 트리거 | [`docs/external/KsmErpK/triggers/`](../../../external/KsmErpK/triggers) | 자동 처리·연쇄 갱신·이력 적재 규칙 추출 |
| 기존 ERP 원본 소스 | `docs/external/KsmErpK/orgErpSource/` | 화면 동작·버튼 액션·이벤트 핸들러 등 UI/업무 규칙 추출 |

**원칙 (MUST)**
- 설계서 작성 시 위 자료를 **근거로 명시**한다 (예: "참조: `tables/MES_WORK_ORDER.sql`", "참조: `procedures/USP_WORK_ORDER_SAVE.sql`").
- 기존 ERP에 동일/유사 기능이 존재하면 **As-Is 분석 → To-Be 설계** 순서를 따른다.
- 기존 자료와 설계가 달라야 할 경우 §11 특이사항(또는 §10 검증·이슈)에 **차이와 사유를 명시 기록**한다.
- 위치 미확인 상태에서 추정으로 설계하지 않는다.

### 설계 산출물 저장 위치 (MUST)

본 가이드로 작성한 설계 산출물은 **모듈(체인)별 폴더로 분리하여 저장**한다. 한 화면당 기능/디자인/BPMN 3종 산출물이 같은 모듈 폴더 내에서 동일 `{화면식별자}` prefix 로 묶여야 한다.

**저장 규칙**
- 위치: `docs/{moduleId}/design/{화면식별자}/` — **화면별 하위 폴더** 아래에 3종 산출물(기능/디자인/BPMN)을 함께 저장한다. (MUST)
- **폴더 미존재 시 자동 생성** (Agent가 산출물을 작성하기 전에 `docs/{moduleId}/design/{화면식별자}/` 폴더 존재 여부를 먼저 확인하고, 없으면 생성한 뒤 저장한다)
- 파일명: `{화면식별자}_디자인설계서.md`
- 절대경로 예: `docs/mqc/design/inspectionResult/inspectionResult_디자인설계서.md`

**moduleId 산출 규칙**
- 화면이 속한 **모듈 식별자** (`mls`, `mqc`, `mpp`, `aps`, `mas`, `mes`, `master`) 를 그대로 사용 — 01 기능설계 가이드 §A.2-0-1 체인 사전 참조
- 모듈은 **화면 식별자에 포함되지 않으므로** 저장 경로에서 표현된다

**모듈 예시**
| 모듈 | moduleId | 화면 식별자 예 | 산출물 절대경로 예 |
|---|---|---|---|
| 자재/주문 | `mls` | `orderRegistration` | `docs/mls/design/orderRegistration/orderRegistration_디자인설계서.md` |
| 품질 | `mqc` | `inspectionResult` | `docs/mqc/design/inspectionResult/inspectionResult_디자인설계서.md` |
| 생산실적 | `mpp` | `workReport` | `docs/mpp/design/workReport/workReport_디자인설계서.md` |
| 생산계획 | `aps` | `productionPlan` | `docs/aps/design/productionPlan/productionPlan_디자인설계서.md` |
| 마스터 | `master` | `item` | `docs/master/design/item/item_디자인설계서.md` |
| 시스템 | `mes` | `user` | `docs/mes/design/user/user_디자인설계서.md` |

**한 화면당 산출물 3종 (같은 `{화면식별자}/` 폴더에 함께 저장)**
- `{화면식별자}_기능설계서.md` — 02 기능설계 가이드 Part B 템플릿 기반
- `{화면식별자}_디자인설계서.md` — 본 가이드(03) Part B 템플릿 기반
- `{화면식별자}_BPMN설계서.md` — 04 BPMN 가이드 Part B 템플릿 기반

==========================================================
---
---

# Part A. 설계 표준 규칙

## A.1. 문서 사용 규칙

### A.1-0. 적용 범위 (매우 중요 · MUST)

본 가이드는 **MES 하위 업무 모듈**(MLS · MPP · MQC · MAS · 시스템 MES 등)의
화면 디자인 설계에만 적용한다. 아래 대상은 본 가이드의 적용 범위가 **아니다**:

| 대상 | 적용 가이드 | 체계 |
|---|---|---|
| **APS** (공정계획) — `src/frontend/m-mpn` | [`docs/aps/Aps-Guide.md`](../../../aps/Aps-Guide.md) | 구 체계 |
| MES 하위 업무 모듈 | **본 3종 설계가이드** + [`docs/guide/MES/Mes-Guide.md`](../../MES/Mes-Guide.md) | 신 체계 (마이그레이션) |

- **APS 화면은 본 가이드로 설계하지 않는다.** APS 관련 작업은 별도의 [`docs/aps/Aps-Guide.md`](../../../aps/Aps-Guide.md) 를 따른다. (MUST NOT)
- 한 PR 에 APS 와 MES 가 섞이면 섹션별로 각 가이드를 분리 적용한다. (MUST NOT 임의 혼용)

#### "MES" 단어의 중의적 사용 — 반드시 구분 (MUST)

| 표기 | 의미 |
|---|---|
| **프로젝트 MES** (대문자) | 전사 ERP → 신규 MES 마이그레이션 프로젝트 전체 (본 가이드 line 5) |
| **moduleId `mes`** (소문자) | 시스템 공통 모듈 단일 체인. §A.5-6 moduleId 체계에서 다루는 `mes` |

### A.1-1. 규칙 등급
| 등급 | 의미 |
|---|---|
| MUST | 반드시 지켜야 하는 규칙 |
| SHOULD | 특별한 사유가 없으면 따라야 하는 규칙 |
| MAY | 필요한 경우 선택적으로 적용할 수 있는 규칙 |

### A.1-2. 기본 원칙
- **Agent 의사결정 원칙은 「02_화면_기능설계_가이드.md §A.1-2-1」 이 정본**. 본 가이드(03 디자인설계) 작성 시에도 동일하게 적용된다 — MUST/MUST NOT 으로 답이 정해진 항목(레이아웃 유형 결정·shared 컴포넌트 사용·CSS Custom Properties 토큰 등)은 사용자에게 선택지로 제시하지 않고 기본값을 채택한다. 가이드 공백 항목만 사용자께 결정 요청. 채택 결과는 디자인설계서 §1 또는 §11 에 「02 §B.0-4 기본값 채택 명시」 표 형식으로 기록 (MUST).
- UI 디자인 설계는 **"이 화면이 어떻게 보이고 어떻게 배치되는가(HOW IT LOOKS)"** 를 정의한다.
- **화면 설계의 대상 영역은 `PageLayout` 내부** — 즉 `SearchArea(A-FILTER)` / `ContentBody` 내부의 `ContentPanel(MAIN)` 이며, 상단 타이틀·버튼바·페이지 상단/하단은 `PageLayout` 의 props(`title`, `buttons`)로 주입된다. SIDEBAR / HEADER / TabsBar 는 `portal` 의 `PortalShell` 이 자동 주입하므로 **화면 설계자가 그리지 않는다**. (MUST)
- 디자인설계서는 **텍스트/표/ASCII 구조도** 중심이다. 실제 스크린샷/Figma 링크는 §10에만 첨부한다.
- 스타일 값은 직접 정의하지 않고 **shared CSS Custom Properties 토큰** 으로 참조한다 (§A.6 준수). (MUST)
- **[마이그레이션 원칙]** As-Is 화면 구조를 **기본 유지**하되, MES 표준 컴포넌트로 재배치한다. (MUST)
  - 사용자가 익숙한 배치 유지 → 학습 비용 최소화
  - 구조 변경(레이아웃 유형 전환, 영역 재구성)은 **명확한 근거** 와 **§11 기록** 필수
  - 임의로 "더 나은" 구조로 변경 금지 (MUST NOT)

### A.1-3. 작성 순서
1. 기능설계서 §2 화면 영역 정의 확인 → 2. 레이아웃 유형 결정 → 3. 메인 영역 구조도 작성 → 4. A-FILTER 내부 배치 → 5. MAIN 내부 배치 → 6. 그리드 컬럼 + 코드값 변환 → 7. 컴포넌트 트리 작성 → 8. 팝업/다이얼로그 목록 → 9. 빈 상태/로딩/에러 → 10. 반응형/아이콘

### A.1-4. 정합성 체크 (용어) — 02 §A.1-4 참조

본 가이드에서 "정합성 체크" / "정합 체크" 는 **02 기능설계 가이드 §A.1-4** 의 정의를 그대로 따른다. 세 층위:

1. **A.1-4-1. 3종 설계서 간 정합성** — 화면 식별자·필드ID·버튼ID·팝업ID·DB 컬럼명·상태코드·action 이 기능/디자인/BPMN 3종에서 동일
2. **A.1-4-2. 설계 ↔ 구현 정합성** — DB 컬럼(SNAKE_CASE) ↔ Entity @Column ↔ DTO(camelCase) ↔ FE payload 루트 일치
3. **A.1-4-3. 화면별 `{화면식별자}_정합체크.md` 산출물** — 위 1·2 를 행별 체크리스트로 실증 검증한 리포트 (복잡 화면 SHOULD)

디자인설계 관점에서 가장 자주 적용되는 것은 **A.1-4-1** (그리드 컬럼 DB 컬럼명·팝업ID·버튼ID 가 기능설계서와 동일한가). §A.7 정합 확인 표에서 검증한다.

---

## A.2. 시작 전 결정 항목

### A.2-1. 최소 확정 값

설계 시작 전 아래 값을 모두 확정한다. (MUST). 기능설계서 §1 (§A.2-2-2) 와 **동일한 값** 을 공유하므로, 기능설계서 확정 후 복사 사용한다.

#### A.2-1-1. UI 디자인 결정 값
| 항목 | 설명 | 예 |
|---|---|---|
| 화면 식별자 | 기능설계서와 동일 | `orderRegistration` |
| 레이아웃 유형 | §A.4-1에서 선택 | 좌우 분할형 |
| 참조 화면 | 유사 기존 화면 | `orderSearch` |
| Figma 파일 | 링크 / 없으면 §2.2 구조도 기준 | - |

#### A.2-1-2. Frontend 개발 연계 값 (기능설계서 §A.2-2-2 와 동일 — 정본은 02 가이드 §A.2-1)

> **MES**: `screenId = pageId = serviceId` 동일 단일 camelCase `{화면명}` 토큰. Frontend 파일명 = `{screenId}.tsx`.
> **APS 예외** (`mpn` 체인 / `src/frontend/m-mpn`): 기존 kebab + `-page.tsx`.

| 항목 | 값 (MES 기본) | 값 (APS 예외) | 근거 |
|---|---|---|---|
| mesModule | `m-mls` / `m-mqc` / `m-mpp` / `m-mas` / `m-mcm` 중 1 | `m-mpn` | FE §2-3 |
| moduleGroup | 모듈 내 도메인 그룹 (kebab-case) | 동일 | FE §2-2 |
| **screenId / pageId / serviceId** (단일 토큰) | `{화면명}` 단일 camelCase (예: `inspectionResult`, `plateSlittingMgmt`) | kebab (예: `production-plan`) | 02 §A.2-1 |
| 페이지 유형 | A/B/C/D/E 중 1 | 동일 | FE §3-1 |
| Frontend 파일 | `m-{moduleId}/pages/{moduleGroup}/{screenId}.tsx` | `m-mpn/pages/{moduleGroup}/{kebab-name}-page.tsx` | FE §14 |
| tsup entry key | `pages/{moduleGroup}/{screenId}` (`-page` 접미사 없음) | `pages/{moduleGroup}/{kebab-name}-page` | FE §14-5 |

- 위 FE 연계 값은 디자인설계서 문서 정보 헤더 또는 §1에 **반드시 명시**한다. (MUST)
- 페이지 유형은 §A.10 케이스 선택표 및 §A.4-1 레이아웃 유형과 매핑된다.
- **MES `screenId` = `pageId` = `serviceId` 단일 토큰 (MUST)** — `portal:{group}/{name}` / kebab-case `pageName` 등 분리 표기 금지 (정본 02 §A.2-1).

### A.2-2. 선행 설계 확인
- 기능설계서(`{화면식별자}_기능설계서.md`) §2 (화면 영역 정의) 확정 필수. (MUST)
- 기능설계서의 A- 영역과 본 설계서의 영역이 **1:1 대응** 되어야 한다. (MUST)

### A.2-3. 마이그레이션 입력 자료

디자인설계서 작성 시 아래 자료를 참조한다. 본 표의 **고정 경로는 프로젝트 공통값**이므로 매 설계 요청 시 재지정하지 않는다.

#### 📎 매 요청 시 제공 자료
| # | 자료 | 제공 방식 | 디자인 반영 용도 |
|---|------|----------|----------------|
| 1 | **As-Is 화면 캡처** | `ksm_jh/docs/reference/captures/{화면식별자}/` *(선택 — 있으면 강력 권장. 없으면 As-Is `designer.cs` 좌표·크기 + 기능설계서 §2/§3/§4 기반 추정 + §11 "캡처 미제공" 명시)* | 레이아웃 유형 판정, 영역 배치 파악, 색상/아이콘 식별 |
| 2 | **신규 Figma (있으면)** | 별도 링크 | To-Be 디자인 시안 |
| 3 | **Frontend 개발가이드 통합본** | [`docs/guide/FrontEnd/FrontEnd_표준_통합_개발가이드_v2.md`](../../FrontEnd/FrontEnd_표준_통합_개발가이드_v2.md) | 페이지 유형·필수 파일·shared 허용 목록·import 경로 (Part A + B + C) — `@dk-oasis/shared` 허용 서브패스/심볼은 Part B 가 정본 |

### A.2-5. As-Is → To-Be 레이아웃 전환 원칙

| As-Is 구조 | To-Be 기본 처리 | 근거 |
|-----------|----------------|------|
| 상/하 2단 그리드 | **유지** — 다단 그리드형 (§A.4-1) | 업무 흐름 유지 |
| 좌/우 2단 그리드 | **유지** — 좌우 분할형 | 동일 |
| 상단 툴바 + 업무 버튼 다수 | **A-TOOLBAR 영역 도입** (§A.3-2) | 구조 표준화 |
| 조회조건 밀집 (한 행) | **5~6행 그룹핑으로 재배치** | 가독성 개선 |
| 스크린 하단 상세 폼 | **그대로 유지** 또는 우측으로 재배치 | 업무 검토 후 §11 기록 |
| 탭 기반 | **유지** — 탭형 | 동일 |
| 커스텀 UI 위젯 | **`@dk-oasis/shared` 컴포넌트로 대체** | 일관성 |

- 위 표에 해당하지 않는 경우 `[확인필요]` + §11 기록. (MUST)

---

## A.3. 표준 구조

### A.3-1. 디자인설계서 섹션 구성 (순서 고정)
| §1 공통 화면 구조 | §2 화면 레이아웃 | §3 영역별 배치 상세 | §4 그리드 컬럼 디자인 | §5 컴포넌트 구조 | §6 팝업/다이얼로그 | §7 빈 상태/로딩/에러 | §8 반응형 규칙 | §9 아이콘 | §10 스크린샷/와이어프레임 |

### A.3-2. 공통 레이아웃

#### A.3-2-1. portal PortalShell (자동 주입 — 설계 대상 아님)

`portal` 패키지는 아래 공통 프레임을 모든 페이지에 자동 적용한다. 화면 설계자는 이 영역을 그리지 않는다.

```
┌────────────┬──────────────────────────────────────────────┐
│            │ HEADER (portal: 로고·사용자·로그아웃·알림)     │
│            ├──────────────────────────────────────────────┤
│  SIDEBAR   │ TabsBar (열린 페이지 탭 + 즐겨찾기)            │
│  (portal:  ├──────────────────────────────────────────────┤
│   메뉴 트리) │                                              │
│            │   ▼ 여기부터가 화면 설계 대상 (PageLayout)     │
│            │                                              │
└────────────┴──────────────────────────────────────────────┘
```

- SIDEBAR / HEADER / TabsBar / Dashboard 진입면: **화면별 재설계 금지** (MUST NOT)
- 구성 근거: `shared/src/portal-shell/portal-shell.tsx` 가 `Header / Sidebar / TabsBar / Dashboard` 를 조립. `portal/app/portal/page.tsx` 가 이를 호출.

##### A.3-2-1-1. 푸터 (page-id-badge)

PortalShell 은 활성 탭의 **하단 우측 모서리**에 `pageId` 를 작은 텍스트로 표시한다. 이 요소는 UI 상 "푸터" 역할을 한다.

- 위치: ContentPanel 영역의 우측 하단 (`position: absolute; right: 10px; bottom: 0`)
- 내용 (MES): `{moduleId}:{screenId}` 형식 — 예: `mpp:workReport` / `mls:orderRegistration` (MES 는 `pageId = screenId` 단일 토큰)
- 내용 (APS 예외): `{moduleId}:{moduleGroup}/{kebab-name}` 형식 — 예: `mpn:planning/production-plan` (APS 는 kebab 컨벤션 유지)
- 목적: 개발/운영 중 화면이 **어느 모듈·어느 페이지인지 즉시 식별**
- 화면 설계자는 이 영역을 따로 설계하지 않는다 — portal 자동 주입 (§A.3-2-1 의 일부)
- 표시값은 02 §A.2-1 의 **screenId 단일 토큰 규약**(MES) / kebab 예외 규약(APS) 을 따라야 올바르게 표시된다
- 구성 근거: `shared/src/portal-shell/portal-shell.tsx` 의 `.portal-shell__page-id-badge`

#### A.3-2-2. PageLayout 기반 화면 구조 (화면 설계 대상)

모든 업무 페이지는 `PageLayout` 으로 감싸며 내부에 `SearchArea`, `ContentBody`, `ContentPanel` 를 배치한다. 이 구조는 Frontend 개발가이드 §14-2 와 1:1 매칭된다.

```
┌────────────────────────────────────────────────────────────┐
│ PageLayout                                                  │
│  ├─ 상단: title ("표시명")        buttons=[조회, 저장, ...]    │
│  ├─ SearchArea  (A-FILTER)                                  │
│  │    └─ SearchField × N  (조회조건 필드들)                   │
│  └─ ContentBody (MAIN)                                      │
│        ├─ ContentPanel  (단일 그리드/폼/2단의 상단)            │
│        └─ ContentPanel  (좌우 분할 / 2단의 하단 / 상세 폼 등)  │
└────────────────────────────────────────────────────────────┘
```

- `PageLayout.buttons` : 페이지 최상단 버튼 바. **별도 A-TOOLBAR 영역을 신설하지 않는다** — 기본 CRUD·업무 특화 버튼 모두 `buttons` 배열로 전달. (MUST)
- `SearchArea` : 조회조건 묶음. 업무가 복잡하면 `SearchField` 를 여러 행으로 자동 wrap.
- `ContentBody` / `ContentPanel` : 그리드·폼·분할·다단 구성의 컨테이너. 2단/3단 그리드는 `ContentPanel` 을 세로로 나열하고 필요 시 리사이저 삽입.
- import: `import { PageLayout, SearchArea, SearchField, ContentBody, ContentPanel } from "@dk-oasis/shared/layout";` (Frontend §14-2, §4)

#### A.3-2-3. 업무 특화 버튼이 다수인 화면 (A-TOOLBAR 의미)

업무 특화 버튼이 **10개 이상** 또는 CRUD 외 연계 조회/편집 버튼이 다수인 화면은 설계상 **A-TOOLBAR 영역**으로 구분하여 구조도에 표기한다. 구현은 `PageLayout.buttons` 에 모두 전달한다(별도 컴포넌트 미사용).

- 설계 구조도 표기: `A-TOOLBAR` 라인을 넣어 **아이콘 버튼 그룹 │ 구분선 │ 텍스트 버튼 그룹** 을 시각화. 실제 구현은 `PageLayout.buttons` 배열 순서로 전달.
- 아이콘 버튼은 **툴팁 한글 라벨 필수** (MUST) — `aria-label` 또는 `title` 속성으로 제공.
- 버튼이 많아 한 행 초과 시 줄바꿈 허용 (MAY).

---

## A.4. 핵심 선택 기준

### A.4-1. 레이아웃 유형

> Frontend 개발가이드 §3-1 페이지 유형(A~E)과 1:1 매핑된다. 페이지 유형은 **필수 파일 세트**와 **템플릿**을 결정하므로 디자인 설계 단계에서 유형을 먼저 확정한다.

| 레이아웃 유형 | FE 페이지 유형 | 구조 (PageLayout 기반) | 저장형 여부 |
|---|---|---|---|
| 단일 그리드형 (조회만) | **B** 조회+Grid | `SearchArea` + `ContentBody` 안 `ContentPanel` 1개(`AgDataGrid`) | X |
| 조회전용 Form (결과 없음) | **A** 조회전용 Form | `SearchArea` + `ContentBody` 안 `ContentPanel` 1개(`FormGroup`) | X |
| 상하 분할형 (조회 + 미니 상세) | **C** 조회+저장 | `SearchArea` + `ContentBody` 안 `ContentPanel` 2개 세로 | O |
| 좌우 분할형 (조회 + 편집 병행) | **C** / **D** | `SearchArea` + `ContentBody` 안 `ContentPanel` 2개 가로 | O |
| 트리-그리드형 | **D** Master-Detail | `SearchArea` + `ContentPanel`(Tree) + `ContentPanel`(AgDataGrid) | △ |
| 탭형 (다수 관점) | **B** / **C** | `SearchArea` + `ContentBody` 안 탭 요소 + `ContentPanel` | △ |
| 카드-그리드형 (대시보드) | **B** | `SearchArea` + `ContentPanel`(카드 Row) + `ContentPanel`(AgDataGrid) | X |
| 모달 (팝업 전용) | **E** 팝업·모달 | `Modal` from `@dk-oasis/shared/modal` | △ |
| **다단 그리드형 (2~3단)** | **C** / **D** 혼합 | `SearchArea` + `ContentBody` 안 `ContentPanel` N개 세로 + 리사이저 | O |

#### A.4-1-1. 다단 그리드형 설계 원칙 (MUST)

다단 그리드형은 **업무 단계별 목록을 동시에 보며 이동 처리** 해야 하는 화면에 적합하다.

- 각 그리드는 **업무 단계를 의미**한다 (예: 미진행 → 진행/완료).
- 그리드 제목에 **단계명 + 건수** 표기: `"미진행 건 (N행 조회됨)"`. (MUST)
- 그리드 간에 **드래그 리사이저** 제공하여 사용자가 비중 조절 가능. (MUST)
- 통합 조회 API **1회 호출** 로 모든 그리드를 동시 갱신. (SHOULD, BPMN 설계와 연계)
- 3단 이상은 업무 정당화 필수. 남용 금지. (MUST)

**적용 예시**: 검사결과등록 — 상단(미진행 건) / 하단(진행/보류/재시작/완료 건) 2단 구조

### A.4-2. 영역 분할 비율
| 분할 | 권장 비율 | 조건 |
|---|---|---|
| 상하 | 그리드 60% / 상세 40% | 상세 필드 8개 이하 |
| 상하 | 그리드 40% / 상세 60% | 상세 필드 많거나 서브그리드 포함 |
| 좌우 | 그리드 55% / 상세 45% | 기본값 |
| 좌우 | 그리드 40% / 상세 60% | 상세 필드/서브그리드 많음 |

### A.4-3. 공통 vs 화면 고유 컴포넌트
| 판단 기준 | 선택 |
|---|---|
| `@dk-oasis/shared` 에 있음 | shared import (MUST) |
| shared에 유사, 커스텀 필요 | shared 확장 논의 → §11 기록 |
| 화면 단 1곳에서만 | 화면 고유 (MAY) |
| 재사용 가능성 높음 | shared 추가 제안 후 사용 (MUST) |

---

## A.5. 명명 규칙

> **(MUST)** 명명 규칙의 단일 정본은 [01 부속서 A.4](../01_Agent부속_가이드.md) 참조 (단일 정본 원칙). 본 가이드는 03 디자인 고유 규칙 (§A.5-4 아이콘) 만 본문 정의한다.

| 영역 | 정본 위치 |
|---|---|
| 영역ID (`A-FILTER` / `A-TOOLBAR` / `A-GRID` / `A-DETAIL` 등 대문자 의미명) | 01 A.4.8 |
| 팝업/다이얼로그ID (flat MUST, P-001~) | 01 A.4.7 |
| 컴포넌트명 (PageLayout / SearchArea / ContentBody / ContentPanel / AgDataGrid / FormGroup / Modal 등) | 본 가이드 §5 (shared 등재 심볼만) |
| DB 컬럼명 (SNAKE_CASE) / API JSON 키 (camelCase) | 01 A.4.9 |
| moduleId / mesModule (= `m-{moduleId}`, 업무 페이지는 `portal` 금지) | 01 A.1 / A.4.5 |

### A.5-4. 아이콘
**외부 아이콘 라이브러리 사용 금지.** 아이콘은 인라인 SVG path 패턴으로 처리한다.

- 표준 패턴 (MUST):
  ```tsx
  // src/{group}/{page}/icons.ts
  export const ICONS = {
    search:  "M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z",
    save:    "M5 3h11l3 3v15H5V3z M8 3v6h8V3",
    trash:   "M3 6h18 M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2 M6 6l1 14h10l1-14",
    // ...
  };

  // src/{group}/{page}/Icon.tsx (로컬 얇은 래퍼)
  export function Icon({ path, size = 16, color = "currentColor" }: IconProps) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
           stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    );
  }
  ```
- path 데이터 출처: **Heroicons outline 24px 기준** 권장 (https://heroicons.com/). 직접 그리거나 단순 도형은 유니코드(`•`, `▼`) 또는 HTML entity(`&#9881;` = ⚙) 허용. (MAY)
- 디자인설계서 §9 아이콘 표기 형식: `용도 | 상수명(ICONS.xxx) | 출처(선택)`. path 문자열 자체는 설계서에 넣지 않는다 (구현 단계 `icons.ts` 에서 관리).
- 금지 (MUST NOT):
  - `lucide-react`, `@mui/icons-material`, `@ui5/icons` 등 외부 패키지 설치·import
  - 설계서에 `FilePlus / Search / Trash2` 같은 lucide-react 컴포넌트명 기재
  - 설계서에 PNG·GIF·JPG 아이콘 파일 경로만 적어두기 (SVG 원본 기반 필수)

## A.6. 금지 사항 (MUST NOT)

| 항목 | 이유 |
|---|---|
| SIDEBAR / HEADER / TabsBar 를 화면별로 재설계 | portal PortalShell 이 주입 — 전체 일관성 파괴 |
| 색상/폰트/여백의 hex·px 값 직접 기재 | CSS Custom Properties 토큰(`var(--color-*)`, `var(--spacing-*)`) 참조 필수 |
| `@dk-oasis/shared/dist/...` 직접 import | FE §5-2 금지 (빌드 의존) |
| 상대경로 체인(`../../../`) 으로 shared 또는 타 도메인 import | FE §5-2 금지 |
| **외부 아이콘 라이브러리 (lucide-react / @mui/icons-material / @ui5/icons 등) 도입** | m-mpn 실제 코드에 0건 — 인라인 SVG 패턴으로 통일 (§A.5-4) |
| 설계서에 `FilterBar / DataGrid / SplitPanel / BottomBar / Toolbar / Pagination / Resizer / IconButton` 등 **shared에 없는 가상 이름** 기재 | shared 실제 이름은 `PageLayout / SearchArea / SearchField / ContentBody / ContentPanel / AgDataGrid / GridPanel / Modal / ComboBox / DatePicker / Button / Tree / Spinner` 등 — §A.10 참조 |
| 기능설계서 영역ID 임의 변경 | 교차 참조 깨짐 |
| 그리드 컬럼 한글명만으로 정의 | DB 매핑 불가 |
| **조회조건 20+ 필드를 1행에 밀집 배치** | 가독성·사용성 파괴 — **5~6행 그룹핑 필수** |
| **A-TOOLBAR 아이콘 버튼에 툴팁 없이 사용** | 업무 특화 버튼은 아이콘만으로 의미 인지 불가 — hover 툴팁 한글 라벨 MUST |
| **다단 그리드에서 그리드 간 분할선 고정** | 업무 비중이 다양 — 리사이저 MUST |
| **다단 그리드에서 건수 표기 누락** | "미진행 건 (N행 조회됨)" 형태로 제목에 건수 표기 MUST |
| **그리드 인라인 편집 허용 영역 불명확** | 상태별/역할별 편집 가능 셀을 §4 에 명시 MUST (시각적 구분도 필수) |
| 모바일 레이아웃 상세 설계 | MES 모바일 미지원 |
| shared에 있는 컴포넌트 재작성 | 유지보수 비용 증가 (FE §6) |
| Figma 스크린샷만 첨부, 구조도 생략 | Figma 미접근자 이해 불가 |
| 팝업을 §6 등록 없이 본문 언급 | 개발 단계 누락 |
| 반응형 규칙(§8) 생략 | "미지원"이라도 명시 필요 |

---
