# 부속서 A. 식별자 사전

> 상위 문서: [부속서 A. 식별자 사전](../01_Agent부속_가이드.md)

## A.1 모듈 카탈로그 (`moduleId`)

`moduleId` 는 MES 하위 업무 모듈을 식별하는 단수 영문 약어. **lowercase 3 글자 정본**. `screenId` 에는 합성되지 않으며, 라우트 prefix (`/api/{moduleId}/...`)·BFF 경로·패키지 root (`com.dongkuk.dmes.{moduleId}`)·테이블명 (`TB_{moduleId}_...`) 에서 단독 표기는 항상 lowercase 3글자(단 `mdm` 테이블명은 대문자 `TB_MDM_` — [§A.12.7](04-decision-table-dispatch.md)).

### A.1.1 모듈 정본 (D1)

> **(MUST)** 신축 MES 의 모듈은 아래 표의 값으로 고정한다(2026-09-24 `mdm` 추가 등재). `master` / `aps` / `portal` 등 기 구축 식별자는 **legacy/외부 의존 카탈로그**(A.1.2) 로 분리 보존하되, 신규 화면의 `moduleId` 는 반드시 본 표의 값 중 하나로만 결정한다.

| moduleId | 풀네임 (영문) | 풀네임 (한글, 영역) | 도메인 | 라우트 prefix | 등재일 |
|---|---|---|---|---|---|
| `mpn` | Manufacturing Process / **Planning** | **공정계획** | 공정·BOP·라우팅·자원 마스터 | `/api/mpn` | 2026-05-20 |
| `mpp` | Manufacturing **Production** Planning | **생산관리** (조업) | 작업지시·실적·공정보고·금형관리 | `/api/mpp` | 2026-04-28 |
| `mls` | Manufacturing **Logistics** | **물류관리** | 입출고·재고·이송·창고 | `/api/mls` | 2026-05-20 |
| `mqc` | Manufacturing **Quality** Control | **품질관리** | 검사의뢰·검사실적·시험성적서 | `/api/mqc` | 2026-05-20 |
| `mcm` | Manufacturing **Common** Management | **공통관리** | KMC 콘솔·SERAI 연동·메시지·앱호스트 | `/api/mcm` | 2026-05-20 |
| `mdm` | Master Data **Management** | **기준정보관리(MDM)** | 용어·도메인·컬럼·단위·인터페이스 레이아웃·마스터코드·마스터데이터·업무기준 표준 원장(마루 MDM) | `/api/mdm` | 2026-09-24 |

**모듈 ↔ 한글 영역 매핑표 (단방향, 영역 → moduleId)**:

| 한글 영역 | moduleId | 비고 |
|---|---|---|
| 공정계획 | `mpn` | BOP / 라우팅 / 작업장 마스터 도메인 |
| 생산관리 | `mpp` | 작업지시·실적·금형·조업 일상 운영 (As-Is "조업관리" 포함) |
| 물류관리 | `mls` | 자재 입출고·재고·이송 |
| 품질관리 | `mqc` | 검사·시험·성적서 |
| 공통관리 | `mcm` | 콘솔·메시지·연동 인프라 (KMC) |
| 기준정보관리(MDM) | `mdm` | 표준 원장. mcm `cma`/`cmb` As-Is 와 병존([mdm ADR-0003](../../../mdm/adr/0003-module-boundary-screens-roles.md)) |

**(MUST NOT)**: 한글 영역명 ("조업관리" / "보전관리" / "설비관리" 등) 으로 신규 moduleId 를 도출하지 않는다. 위 표의 값으로 흡수 매핑하거나, 매핑 불가 시 [확인필요: Q-NNN] + 본 부속서 PR.

### A.1.2 legacy / 외부 의존 카탈로그 (참조용)

A.1.1 모듈 외 기 구축·공유 모듈은 본 표로 분리 등재. 신규 화면 `moduleId` 결정 후보로는 사용 ✗.

| moduleId | 풀네임 (영문) | 풀네임 (한글) | 도메인 | 라우트 prefix | 등재일 | 사용 화면 |
|---|---|---|---|---|---|---|
| `portal` | Portal Common | 포탈 공통 | 사용자·메뉴·권한 ({CLIENT} 포탈 공통) | `/api/portal` | 기 구축 | (포탈 공통) |
| `master` | Master Data | 마스터 | 부서·인원·코드·품목 등 공통 마스터 | `/api/master` | 기 구축 | (다수 화면 공유) |
| `mpn` | Advanced Planning & Scheduling | 생산계획 (선행 스케줄링) | 수주·APS·자원 | `/api/mpn` | 기 구축 | (다수 화면 공유) |

### A.1.3 등재 절차

1. 분석리포트 §1 에서 `moduleId` 후보 식별
2. 본 부속서 A.1.1 (모듈 정본) 에 매핑되지 않는 후보 발견 시 → [확인필요: Q-NNN] 마커 + §13 등재
3. 사용자 결정 후 본 부속서 PR 로 A.1.1 흡수 매핑 또는 A.1.2 분리 등재
4. 등재 PR 머지 후 분석리포트의 [확인필요] → resolved

---

## A.2 moduleGroup 카탈로그 (그룹 식별자 사전, D4)

`moduleGroup` 은 한 모듈 내에서 화면을 묶는 부그룹. 포털 페이지 경로·tsup entry (`pages/{moduleGroup}/{screenId}`) 의 **디렉토리 세그먼트** 역할. **`screenId` 자체에는 합성되지 않는다** (§A.3 — screenId 는 모듈명·그룹명 없는 단일 토큰 `{화면명}`).

### A.2.1 그룹명 표기 표준 — 영역 코드 (★ 갱신 2026-05-28)

> **(MUST — 사용자 결정 2026-05-28)** 신규 그룹명은 **`{moduleId 2-3번째 알파벳}{a~z 영역 순번}` 3글자 영역 코드** 로 통일한다. 모듈별로 영역(area)이 추가될 때마다 알파벳 순번을 1 진단계씩 진행 (a → b → c → ...). `screenId` 에는 포함되지 않으며, 포털·tsup 경로의 디렉토리 세그먼트로만 쓰인다.

**규칙**:
1. **앞 2글자 (모듈 식별)** = `moduleId` 의 **2번째·3번째 알파벳** (= moduleId 의 첫 `m` 을 떼고 나머지). 모듈 → 그룹 prefix 가 일정해 시각적 그룹핑 가능.
2. **3번째 글자 (영역 순번)** = `a/b/c/d/...` 신설 순서대로. 한 모듈 내 26 영역까지 확장.
3. **표기**: 모두 lowercase 3글자.

**모듈별 prefix 표**:

| moduleId | 2-3 번째 알파벳 (영역 코드 prefix) | 영역 코드 예 |
|---|---|---|
| `mls` | `ls` | `lsa` / `lsb` / `lsc` / `lsd` / ... |
| `mpp` | `pp` | `ppa` / `ppb` / `ppc` / `ppd` / ... |
| `mpn` | `pn` | `pna` / `pnb` / ... |
| `mqc` | `qc` | `qca` / `qcb` / ... |
| `mas` | `as` | `asa` / `asb` / ... |
| `mcm` | `cm` | `cma` / `cmb` / ... |
| `mdm` | `dm` | `dma` / `dmb` / `dmc` / `dmd` / `dme` / ... |

**(MUST NOT)**:
- 3 글자 외 길이 (`op` 2글자 / `oper` 4글자) — 신규 등재 ✗ (legacy 호환은 A.2.3 별표)
- 의미명 (`slitting` / `operation` / `planning` 같은 영문 단어) — **신규 등재 ✗** (legacy 호환은 A.2.3). 신규는 영역 코드 강제.
- camelCase 합성어 (`purchaseRequest` / `masterManagement`) — 신규 등재 ✗ (legacy 만)
- kebab-case (`l-sa`) 또는 snake_case (`l_sa`) ✗
- 한 모듈 내 동일 그룹명 중복 ✗
- moduleId 미등재 (A.1.1 외) 상태에서의 그룹 등재 ✗ (의존 관계)
- 영역 순번 건너뛰기 (`a` 없이 `b` 부터 시작) ✗ — 등재 순서 보존

### A.2.2 영역 신설 절차 (★ 갱신 2026-05-28)

> **(MUST)** 모듈 안에서 새 영역을 추가할 때는 다음 순서를 따른다.

1. **다음 알파벳 결정**: 본 모듈의 §A.2.3 등재 카탈로그에서 가장 마지막 알파벳 + 1. 예: `mls` 마지막 등재 = `lsa` → 다음은 `lsb`.
2. **등재 PR**: §A.2.3 표에 신규 영역 행 추가 + 의미 명시 + 사용 화면 명시.
3. **사용자 확정 마커**: 신설 단계에서 사용자 의미 확정 전이면 `[임시]` 마커 + `Q-NNN` ID 동반.
4. **폴더 생성**: `docs/{moduleId}/{newGroup}/` 디렉토리 생성.

**예시 (mls 모듈 진행)**:

| 등재일 | mls 영역 | 의미 | 비고 |
|---|---|---|---|
| 2026-05-28 | `lsa` | **슬리팅관리** (외주 슬리팅 의뢰·입고·출고·반납·수불현황) | plateSlittingMgmt 1차 등재 / slitStockIssueMgmt·slitReturnMgmt·slitTransSummary 추가. 의미명 사용자 확정 2026-06-10 |
| 2026-06-02 | `lsb` | **자재관리** (구 "공정내 자재창고/제품창고") | stockOrderMgmt·partLocationMgmt·stockOutWarehouseMgmt 등재. 의미명 사용자 확정 2026-06-10. stockOrderMgmt→itemOrderMgmt 개명 + 설계 완료 2026-06-10. **partLocationMgmt·stockOutWarehouseMgmt 선등재 철회 2026-06-12 (사용자 지시 — 설계 착수 시 부여)** |
| 2026-06-10 | `lsc` | **출하관리** | 사용자 카탈로그 확정 (화면 미등재) |
| 2026-06-10 | `lsd` | **재고관리** (구 "출하" 표기 폐기) | 사용자 카탈로그 확정. itemStockMgmt 등재 2026-06-10 (1호 화면) |
| 2026-06-10 | `lse` | **수불관리** | itemTransSummary 등재 동시 (사용자 확정). itemTransCheck 추가 2026-06-10 |
| 2026-06-10 | `lsf` | **PDA관리** | 사용자 카탈로그 확정 (화면 미등재) |
| 2026-06-10 | `lsg` | **기준관리** | slInfoMgmt(창고정보 조회) 등재 (사용자 카탈로그 확정 동시). slLocMgmt(적재위치 관리) 추가 2026-06-11. itemMoveTypeMgmt(수불유형정보조회) 추가 2026-06-12 |
| 2026-09-03 | `lsh` | **공지관리** | noticeMgmt(공지사항 관리) 등재 동시. **To-Be only 신규 영역** — As-Is 대응 화면 없음 (사용자 지시 2026-09-03) |

**(MUST NOT)**: 사용자 확정 전 임시 영역명을 정본 등재 (A.2.3) 에 추가 ✗. 반드시 `[임시]` 마커 유지 → 확정 PR 후 마커 제거.

### A.2.3 등재 카탈로그

> 신규 그룹은 §A.2.1 표기 표준 (영역 코드 — `{moduleId 2-3번째}{a~z 순번}`) 으로 등재. 기 등재된 의미명 (legacy `operation` / `planning` 등) 은 **하위 호환 보존**.

| moduleId | moduleGroup | 표기 분류 | 의미 | 등재일 | 등재 PR | 사용 화면 |
|---|---|---|---|---|---|---|
| `mls` | `lsa` | **신규 영역 코드** (★ 2026-05-28 / 의미 확정 2026-06-10) | **슬리팅관리** (외주 슬리팅 의뢰·입고·출고·반납·수불현황 — PG-04) | 2026-05-28 | (plateSlittingMgmt 등재 동시) | `plateSlittingMgmt` · `slitStockIssueMgmt` · `slitReturnMgmt` · `slitTransSummary` |
| `mls` | `lsb` | **신규 영역 코드** (★ 2026-06-02 / 의미 확정 2026-06-10) | **자재관리** (구 "공정내 자재창고/제품창고" — 재고오더조회·부품위치등록·자재불출처리(창고)) | 2026-06-02 | (stockOrderMgmt·partLocationMgmt·stockOutWarehouseMgmt 등재 동시 → 미설계 2건 선등재 철회 2026-06-12) | `itemOrderMgmt`(구 stockOrderMgmt) · `itemStockIssueMgmt`(자재불출처리(창고) — 사용자 부여 2026-06-12) — ★ 구 partLocationMgmt/stockOutWarehouseMgmt 선등재 철회 (2026-06-12 사용자 지시: 설계 착수 시 사용자가 screenId 부여) |
| `mls` | `lsc` | **신규 영역 코드** (★ 의미 확정 2026-06-10) | **출하관리** | 2026-06-10 | (사용자 카탈로그 확정) | — |
| `mls` | `lsd` | **신규 영역 코드** (★ 의미 확정 2026-06-10) | **재고관리** (구 "출하" 표기 폐기) | 2026-06-10 | (사용자 카탈로그 확정 / itemStockMgmt 등재 2026-06-10) | `itemStockMgmt` |
| `mls` | `lse` | **신규 영역 코드** (★ 2026-06-10) | **수불관리** | 2026-06-10 | (itemTransSummary 등재 동시) | `itemTransSummary` · `itemTransCheck` |
| `mls` | `lsf` | **신규 영역 코드** (★ 2026-06-10) | **PDA관리** | 2026-06-10 | (사용자 카탈로그 확정) | — |
| `mls` | `lsg` | **신규 영역 코드** (★ 2026-06-10) | **기준관리** | 2026-06-10 | (slInfoMgmt 등재 동시) | `slInfoMgmt` · `slLocMgmt` · `itemMoveTypeMgmt` |
| `mls` | `lsh` | **신규 영역 코드** (★ 2026-09-03) | **공지관리** — 전사 공지사항 등록·게시 | 2026-09-03 | (noticeMgmt 등재 동시 — 사용자 지시) | `noticeMgmt` |
| `mpp` | `operation` | legacy 의미명 | 일상 운영 (작업실적·공정보고) | 2026-04-28 | (workReport 등재 동시) | `workReport` |
| `mpp` | `master` | legacy 의미명 (예정) | mpp 모듈 마스터 (작업장·자원 등) | (예정) | — | — |
| `mpp` | `setup` | legacy 의미명 (예정) | mpp 셋업 (BOP·라우팅 등) | (예정) | — | — |
| `mcm` | `cma` | **영역 코드** (`cm`+`a`) | Master 관리(원장) — 카테고리·마스터코드 | 2026-05-27 | (masterCategoryMng 등재 동시) | `masterCategoryMng` / `masterCodeMng` / `masterCodeSelPop` / `masterCodeUploadFilePopup` |
| `mcm` | `cmb` | **영역 코드** (`cm`+`b`) | 업무기준 관리(원장) — 업무기준(Rule) 구조·데이터 | 2026-06-04 | (masterRule* 5종 설계확정 등재) | `masterRuleListPop` / `masterRuleList` / `masterRuleFrame` / `masterRuleData` / `masterRuleFrameColListPopup` |
| `mdm` | `dma` | **영역 코드** (`dm`+`a`) | 용어·도메인·컬럼·단위(02) — 표준 원장 사전(마루 MDM) | 2026-09-24 | (TSK-02-01 전사 아키텍처 설계) | `unitMng` / `termMng` / `domainMng` / `columnMng` / `termRegPop` (+ TSK-01-01 샘플 `mdmSample` 은 옛 경로에 있으며 TSK-01-03 에서 옮긴다) |
| `mdm` | `dmb` | **영역 코드** (`dm`+`b`) | 인터페이스 레이아웃(03) | 2026-09-24 | (TSK-02-01 전사 아키텍처 설계) | `headerMng` / `layoutMng` |
| `mdm` | `dmc` | **영역 코드** (`dm`+`c`) | 마스터코드(04) | 2026-09-24 | (TSK-02-01 전사 아키텍처 설계) | `codeMng` / `codeItemEdit` / `codeConfirm` (2026-09-28 D-101: `codeEdit`→`codeMng`, `codeCateEdit`→`codeItemEdit` 로 합침. 두 ID 는 서버 서비스·권한 OBJECT 로만 남음) |
| `mdm` | `dmd` | **영역 코드** (`dm`+`d`) | 마스터데이터(05) | 2026-09-24 | (TSK-02-01 전사 아키텍처 설계) | `dataMng` / `dataItemMng` / `dataCsvUploadPop` (2026-09-29 D-104: `dataEdit`→`dataMng`, `dataCateEdit`·`dataHistory`→`dataItemMng` 로 합침. 세 ID 는 서버 서비스·권한 OBJECT 로만 남음) |
| `mdm` | `dme` | **영역 코드** (`dm`+`e`) | 업무기준·룰 세트(06) | 2026-09-24 | (TSK-02-01 전사 아키텍처 설계) | `ruleMng` / `ruleEdit` / `ruleConfirm` / `ruleSetMng` / `ruleSetEdit` |
| `master` | `common` | legacy 의미명 | 공통 마스터 (코드·부서) | 기 구축 | — | (다수) |
| `master` | `item` | legacy 의미명 | 품목·재질 마스터 | 기 구축 | — | (다수) |
| `aps` | `planning` | legacy 의미명 | 생산계획 | 기 구축 | — | (다수) |

**legacy 보존 원칙**: 기 등재된 의미명 행 (`operation` / `master` / `setup` / `common` / `item` / `planning`) 은 신규 표기 표준 (A.2.1) 적용 ✗ — As-Is 1:1 보존. 신규 그룹 등재 시에만 §A.2.1 의 영역 코드 표준 강제.

**legacy → 영역 코드 마이그레이션** (선택 사항): 기 등재된 의미명 영역을 신규 영역 코드로 변경할 수 있다. 변경 시 (a) §A.2.3 에 새 행 추가 + (b) legacy 행에 `migrated_to: {새 코드}` 표기 + (c) 영향 산출물 (화면별 5종 + 체크리스트 frontmatter + 폴더 위치) 동시 갱신 + (d) 본 §A.2.3 changelog 행 추가. **사용자 결정 2026-05-28 — `mls` 모듈은 이미 영역 코드 (lsa) 로 전환됨** (기 등재 `slitting` 의미명 → `lsa`).

---

## A.3 화면 식별자 사전 (D3)

### A.3.1 화면식별자 형식 (D3, MUST)

> **(MUST — 사용자 결정 사항 정본)** MES 모듈 신규 화면 `screenId` 는 **`{화면명}` 단일 토큰** camelCase 형식으로 결정한다. **모듈명·그룹명 토큰을 식별자에 포함하지 않는다** (`{moduleId}{화면명}` 2-토큰 / `{모듈명}{그룹명}{화면명}` 3-토큰 형식 모두 사용 ✗ — 사용자 결정으로 폐기). 모듈 구분은 폴더 경로·URL prefix·패키지 root 가 담당하므로 식별자에 모듈명을 중복 표기하지 않는다. APS 예외 (`mpn`) 는 별도 — 단일 토큰 (kebab-case 변환 가능) 유지.

#### MES 룰 (`mls` / `mqc` / `mpp` / `mas` / `mcm` / `mdm` — 정본)

| 토큰 | 표기 | 출처 | 예시 |
|---|---|---|---|
| `{화면명}` | **camelCase 도메인 명사** (한 단어 또는 N 단어 조합) — 화면명 그 자체를 식별자로 사용한다 (첫 글자 소문자) | 분석리포트 §1 화면식별자 | `plateSlittingMgmt` |

**예시 (MES 룰)**:

| 화면명 (도메인 의미) | screenId |
|---|---|
| 후판 슬리팅 관리 | **`plateSlittingMgmt`** |
| 마스터 코드 관리 | **`masterCodeMng`** |
| 마스터 카테고리 관리 | **`masterCategoryMng`** |
| 검사 요청 | **`inspectionRequest`** |
| 재고 이동 | **`stockMove`** |
| 토픽 콘솔 | **`topicConsole`** |

**(MUST NOT)** (MES 룰):
- 모듈명 토큰 prefix (`mlsPlateSlittingMgmt` ✗ — 모듈 토큰 폐기, 사용자 결정. 모듈 구분은 경로/URL/패키지가 담당)
- 그룹명 토큰 삽입 (`cmaMasterCodeMng` / `mcmCmaMasterCodeMng` ✗ — 그룹 토큰 사용 폐기 — 사용자 결정)
- 숫자 prefix (`MPP_WRK010` 같은 코드명) / 하이픈 / 언더스코어 / 복수형
- 한글 자체 음역 (`molMaster` ✗)

#### APS 예외 (`mpn` — 별표)

- APS 화면식별자는 단일 토큰 camelCase 또는 kebab-case (예: `demand` / `capacity` / `planningRun` 또는 `demand` / `production-plan`) 유지.
- 본 §A.3.1 MES 룰과 무관 (APS 기존 컨벤션 유지).

#### legacy 보존

본 가이드 개정 이전에 등재된 식별자 및 **기 생성된 화면·산출물 (폴더·파일명 포함)** 은 §A.3.2 표 및 각 산출물 위치에서 As-Is 1:1 보존한다. **이미 만들어진 산출물은 개명하지 않는다.**
- **단일 토큰 legacy** (`workReport` / `masterCodeMng` / `inspectionResult` 등): 신규 단일 토큰 룰과 형식이 동일하므로 그대로 사용.
- **모듈/그룹 prefix legacy** (예: 기 산출물 폴더 `mlsPlateSlittingMgmt`): As-Is 유지. 신규 화면만 본 §A.3.1 단일 토큰 룰 (`plateSlittingMgmt`) 로 등재한다.

#### DB 메뉴 시드 연계 — PARENT_MENU_ID + OBJECT_ID = componentPath (★ 2026-06-05 신설)

본 §A.3.1 의 `screenId` (camelCase 단일 토큰) 는 **DB 메뉴 시드 진입점 `TB_MCM_SEC_MENU.OBJECT_ID`** 와 1:1 일치한다.

| 축 | 값 | 정본 |
|---|---|---|
| `PARENT_MENU_ID` (메뉴 row) | group 토큰 3 글자 lowercase (`cma` / `csa` / `cme` 등) | §A.2 영역 코드 |
| `OBJECT_ID` (메뉴 row) | **`screenId` 본체** (camelCase 단일 토큰) | 본 §A.3.1 |
| BE derived `componentPath` | **`PARENT_MENU_ID + "/" + OBJECT_ID`** (예: `csa/commMenuMng`) | BE 가이드 §13-1 |
| FE 디스크 폴더 | **`page-components/{PARENT_MENU_ID}/{OBJECT_ID}/page.tsx`** | FE 가이드 §11-2 |

- **MUST**: 시드 진입점 (`DataInitializer.insertMcmSecMenuIfAbsent`) 이 빌드 타임 정규식 `^[a-z][a-zA-Z0-9]*$` 으로 OBJECT_ID 룰 위반을 차단한다. PascalCase / `_` / `-` / 빈문자열 모두 시드 단계에서 `IllegalStateException` 으로 fail-fast. 본 §A.3.1 룰 위반 시 부팅 자체가 실패하므로 가이드 위반 검출이 즉시 일어난다.
- **MUST**: 4 축 (시드 OBJECT_ID / BE componentPath / FE 디스크 폴더 / codegen PAGE_REGISTRY 키) 모두 동일 camelCase 단일 토큰. 어느 한 축이라도 PascalCase / kebab / snake 면 런타임 라우팅 실패.

### A.3.2 화면 ↔ As-Is 매핑

화면식별자 ↔ As-Is 코드 ↔ 모듈/그룹 매핑 단순 카탈로그.

> **(LEGACY 보존 주석)** 본 표의 `pageName` 컬럼에 kebab-case (`work-report` 등) 로 등재된 행은 **본 가이드 신규 명명 룰 (§A.4.2 MES 룰 = screenId 와 동일 camelCase 단일값) 이전에 등재된 legacy 값** 이다. As-Is 1:1 보존 원칙 (§A.3.1 legacy 보존) 에 따라 표 본문은 그대로 유지하되, **신규 등재 행부터는 §A.4.2 MES 룰을 강제 적용** 한다 (예: `plateSlittingMgmt` 행 등재 시 `pageName` = `plateSlittingMgmt`). APS 예외 (`mpn`) 만 kebab-case 유지.

| 화면식별자 | As-Is 코드 | moduleId | moduleGroup | pageName | 등재일 | 비고 |
|---|---|---|---|---|---|---|
| `workReport` | `PGA020K` | `mpp` | `operation` | `work-report` | 2026-04-28 | legacy 등재 — §A.4.2 신규 룰 이전 |
| `moldMaster` | `PMA005K` | `mpp` | `moldManagement` | `mold-master` | 2026-05-18 | PMA005K 도메인 메인 화면 — legacy 등재 (§A.4.2 신규 룰 이전) |
| `moldAttach` | `PMA005K_Attach` | `mpp` | `moldManagement` | `mold-attach` | 2026-05-18 | 메인 GB-004 / P-004 — 하위 팝업 |
| `moldExpHistory` | `PMA005K_EXP` | `mpp` | `moldManagement` | `mold-exp-history` | 2026-05-18 | 메인 GB-007 / P-007 — 하위 팝업 |
| `moldPolish` | `PMA005K_Polish` | `mpp` | `moldManagement` | `mold-polish` | 2026-05-18 | 메인 B-004 / P-010 — 하위 팝업 |
| `moldPolishHistory` | `PMA005K_PolishHistroy` | `mpp` | `moldManagement` | `mold-polish-history` | 2026-05-18 | 메인 B-005 / P-011 — As-Is 파일명 typo (`PolishHistroy`) 보존 / screenId 정정 (Q-013) |
| `moldPurchaseHistory` | `PMA005K_PurchaseHistory` | `mpp` | `moldManagement` | `mold-purchase-history` | 2026-05-18 | 메인 B-008 / P-014 — 하위 팝업 |
| `moldPurchaseReq` | `PMA005K_PurchaseReq` | `mpp` | `moldManagement` | `mold-purchase-req` | 2026-05-18 | 메인 B-007 / P-013 — 하위 팝업 |
| `moldRepair` | `PMA005K_Repair` | `mpp` | `moldManagement` | `mold-repair` | 2026-05-18 | 메인 toolbar `btnRepair` 주석처리로 호출 미연결 (Q-009 As-Is 보존) — 본 화면 단독 호출 가능 |
| `moldJobCdSelect` | `PMA005K_SelectJobCd` | `mpp` | `moldManagement` | `mold-job-cd-select` | 2026-05-18 | 메인 GB-005 / P-005 — 하위 팝업 |
| `plateSlittingMgmt` | `MIM112K` | `mls` | `lsa` | `plateSlittingMgmt` | 2026-05-26 | 박판슬리팅입고 — 기 생성 소급 등재 (§A.4.2 신규 룰) |
| `slitStockIssueMgmt` | `PCB021K` | `mls` | `lsa` | `slitStockIssueMgmt` | 2026-05-28 | 자재불출처리(박판) — 기 생성 소급 등재 (§A.4.2 신규 룰) |
| `slitReturnMgmt` | `ITR200K` | `mls` | `lsa` | `slitReturnMgmt` | 2026-06-02 | 슬리팅반납관리 (As-Is 박판반납관리) — 신규 등재 |
| `itemOrderMgmt` | `PCA020K` | `mls` | `lsb` | `itemOrderMgmt` | 2026-06-10 | 재고오더조회 (구 `stockOrderMgmt` 개명 — 사용자 확정 2026-06-10. 상단 연동 버튼 중 품목별재고조회→`itemStockMgmt`/수불조회→`itemTransCheck` 는 To-Be 연동, 발주조회(MPO507K)·Job진행현황조회(PCA008K)·공정진행현황(PCA001K 모달)·WoNo(PCA100K=DSB001K) 는 mpp 담당 — As-Is 코드 연동 유지 후 추후 연결) |
| `slitTransSummary` | `ITR301K` | `mls` | `lsa` | `slitTransSummary` | 2026-06-10 | 슬리팅 입출고현황 (As-Is 박판수불집계표 재설계 — 금액·단가 제거, 조회 전용. ITR106K 월별 흡수. 구 `slitTransHist` 개명 — 사용자 확정 2026-06-10) |
| `itemTransSummary` | `ITR103K` | `mls` | `lse` | `itemTransSummary` | 2026-06-10 | 자재 입출고현황 (As-Is 수불집계표 재설계 — 금액·단가 제거, 조회 전용. ITR104K 월별 흡수. **lse 수불관리 — 사용자 확정**. 구 `itemTransHist` 개명 — 사용자 확정 2026-06-10) |
| `slInfoMgmt` | `IBA006K` | `mls` | `lsg` | `slInfoMgmt` | 2026-06-10 | 창고정보 조회 (As-Is 창고정보등록 — **ERP CRUD 존치 / MES 조회전용 미러**, IF-MLS-IN-03 동기화. 사용자 확정 2026-06-10) |
| `itemStockMgmt` | `INV103K` | `mls` | `lsd` | `itemStockMgmt` | 2026-06-10 | 품목별재고조회 — 신규 등재 (**lsd 재고관리 — 사용자 확정 2026-06-10**. itemOrderMgmt 상단 버튼 연동 대상) |
| `itemTransCheck` | `ITR006K` | `mls` | `lse` | `itemTransCheck` | 2026-06-10 | 수불현황조회 — 신규 등재 (**lse 수불관리 — 사용자 확정 2026-06-10**. itemOrderMgmt 상단 버튼 연동 대상. As-Is 동봉 ITR006K_FirstHalf 포함 여부는 화면 분석에서 판정) |
| `slLocMgmt` | `IBA007K` | `mls` | `lsg` | `slLocMgmt` | 2026-06-11 | 적재위치 관리 (As-Is LOCATION 등록 — **MES 정본 CRUD 소유 전환**: TB_MLS_SL_LOC(120) 직접 IUD, 창고(119)는 SELECT-only 참조. IF-MLS-IN-04 폐기. 사용자 확정 2026-06-11) |
| `itemMoveTypeMgmt` | `IBA001K` | `mls` | `lsg` | `itemMoveTypeMgmt` | 2026-06-12 | 수불유형정보조회 (As-Is 수불유형등록 — **ERP CRUD 존치 / MES 조회전용 미러**, IF-MLS-IN-05 → TB_MLS_MOVE_TYPE(121). 사용자 확정 2026-06-12) |
| `itemStockIssueMgmt` | `PCB020K` | `mls` | `lsb` | `itemStockIssueMgmt` | 2026-06-12 | 자재불출처리(창고) — **사용자 부여 + 설계 완료 2026-06-12 (6종 산출)**. 일반 자재 전용(박판 분기 미이식 — slitStockIssueMgmt 위임), 반납 ADMIN popup 1:1, IF-MLS-OUT-06/07, 공정보고 자동 연동(P-6) 미채택 |
| `noticeMgmt` | — (To-Be only) | `mls` | `lsh` | `noticeMgmt` | 2026-09-03 | 공지사항 관리 — **As-Is 없음(신규 화면)**. 사용자 지시 2026-09-03 로 mls 를 테스트 모듈 삼아 신설. 목록+상세 CRUD + 게시상태/게시기간. 분석리포트 미작성(기능설계서 1종 축소 — 사용자 결정) |
| `domainMng` | — (To-Be only) | `mdm` | `dma` | `domainMng` | 2026-09-24 | 도메인 관리 — As-Is 없음, 원천 02 maru03020/03030 계승. 상속 트리·검증식 두 칸·테스트 케이스·영향도(TSK-04-03). 기능설계서 1종(`docs/mdm/screens/domainMng/`) |
| `columnMng` | — (To-Be only) | `mdm` | `dma` | `columnMng` | 2026-09-24 | 컬럼 사전 — As-Is 없음(신규). TSK-04-04. 기능설계서 1종(`docs/mdm/screens/columnMng/`, 팝업 termRegPop 절 포함) |
| `termRegPop` | — (To-Be only) | `mdm` | `dma` | `termRegPop` | 2026-09-24 | 용어 인라인 등록 팝업(columnMng 에서 호출, 메뉴 leaf 없음). TSK-04-04 |
| `headerMng` | — (To-Be only) | `mdm` | `dmb` | `headerMng` | 2026-09-24 | 전문 헤더 정의 — As-Is 없음(신규). TSK-05-02. 기능설계서 1종(`docs/mdm/screens/headerMng/`) |
| `layoutMng` | — (To-Be only) | `mdm` | `dmb` | `layoutMng` | 2026-09-24 | 전문 레이아웃 — As-Is 없음(신규). 헤더 적층·상수 재정의·본문 항목·오프셋 자동 계산(TSK-05-02). 기능설계서 1종(`docs/mdm/screens/layoutMng/`) |
| `codeItemEdit` | — (To-Be only) | `mdm` | `dmc` | `codeItemEdit` | 2026-09-24 | 코드 편집 — As-Is 없음(신규). TSK-06-03. 기능설계서 1종(`docs/mdm/screens/codeItemEdit/`) |
| `codeCateEdit` | — (To-Be only) | `mdm` | `dmc` | `codeCateEdit` | 2026-09-24 | 카테고리 편집(REGEX·TABLE) — As-Is 없음(신규). TSK-06-04. 2026-09-28 D-101 로 화면은 `codeItemEdit` 카테고리 탭에 합침(서버 서비스·권한 OBJECT 로만 남음). 기능설계서는 `docs/mdm/screens/codeItemEdit/` |
| `codeConfirm` | — (To-Be only) | `mdm` | `dmc` | `codeConfirm` | 2026-09-26 | 마루 코드 버전 확정(검사 8항·적용시점·diff, DRAFT → RELEASED) — As-Is 없음(신규), 원천 04 「상신 시 검사」·「버전 상태와 적용시점」, 시안 탭7(상신·결재 영역 제외). TSK-06-05. 기능설계서 1종(`docs/mdm/screens/codeConfirm/`) |
| `codeMng` | — (To-Be only) | `mdm` | `dmc` | `codeMng` | 2026-09-24 | 마루 코드 조회·등록 — As-Is 없음(신규), 원천 04 「화면」 탭1. TSK-06-02. 기능설계서 1종(`docs/mdm/screens/codeMng/`) |
| `codeEdit` | — (To-Be only) | `mdm` | `dmc` | `codeEdit` | 2026-09-24 | 마루 코드 수정(헤더·라벨·폐기·버전 목록·새 버전·DRAFT 소유권) — As-Is 없음(신규), 원천 04 「화면」 탭2. TSK-06-02. 2026-09-28 D-101 로 화면은 `codeMng` 에 합침(서버 서비스·권한 OBJECT 로만 남음). 기능설계서는 `docs/mdm/screens/codeMng/` |
| `ruleMng` | — (To-Be only) | `mdm` | `dme` | `ruleMng` | 2026-09-24 | 룰 — As-Is 없음, 원천 06 룰 목록·등록. 서버 페이징 목록 + MDM 원천 등록(VER 1 DRAFT 자동 선점). TSK-08-02. 기능설계서 1종(`docs/mdm/screens/ruleMng/`) |
| `ruleEdit` | — (To-Be only) | `mdm` | `dme` | `ruleEdit` | 2026-09-24 | 룰 화면 — As-Is 없음, 원천 06 룰 화면. 헤더·버전·의사결정표·활용처 카드(08-03·08-04 가 카드를 더한다). TSK-08-02. 기능설계서 1종(`docs/mdm/screens/ruleEdit/`) |
| `ruleConfirm` | — (To-Be only) | `mdm` | `dme` | `ruleConfirm` | 2026-09-26 | 버전 확정(룰) — As-Is 없음, 원천 06 「상신 시 검사」·「버전 비교」. 확정 대기 DRAFT 목록 + 확정 검사 4항(저장 시 검사 전부·비어 있음·값 테스트·결과 변수 참조)과 적용 순서·입력 계약 변경·row_id diff 를 보고 DRAFT → RELEASED 확정(결재 없음, ADR-0002). TSK-08-05. 기능설계서 1종(`docs/mdm/screens/ruleConfirm/`) |
| `ruleSetMng` | — (To-Be only) | `mdm` | `dme` | `ruleSetMng` | 2026-09-26 | 룰 세트 — As-Is 없음, 원천 06 룰 세트 조회·등록. 계산 칸(룰 수·최종 결과 변수·입력 변수 수·세트 검사) 목록 + 빈 세트 등록(INUSE) 뒤 룰 세트 편집으로 이동. TSK-08-06. 기능설계서 1종(`docs/mdm/screens/ruleSetMng/`) |
| `ruleSetEdit` | — (To-Be only) | `mdm` | `dme` | `ruleSetEdit` | 2026-09-26 | 룰 세트 편집 — As-Is 없음, 원천 06 룰 세트 편집. 룰 순서 편집·즉시 입출력 계산·저장 시 검사(순환 거부·중복 대입 경고)·구성 지침·폐기/되살리기. TSK-08-06. 기능설계서 1종(`docs/mdm/screens/ruleSetEdit/`) |

**등재 절차**:
1. 신규 화면 분석 시 본 표에 행 추가
2. moduleId / moduleGroup 이 A.1 / A.2 에 미등재면 [확인필요: Q-NNN] 등재 + 부속서 PR 진행

**충돌·중복 등재 처리 (R-11, MUST)**:

분석 진행 중 동일 As-Is 코드 (예: `PGA020K`) 가 **다른 화면식별자 (예: `workReport` vs `workReportStatus`) 로 도출되려 할 때** 의 처리:

| 시나리오 | 처리 |
|---|---|
| As-Is 코드 본 표 등재됨 + Agent 가 다른 식별자 도출 시도 | **본 표 등재값 강제 적용** (00 §6.4-R10 R10-1 우선순위 1). 다른 식별자 사용 금지. |
| As-Is 코드 본 표 미등재 + Agent 가 후보 1 개 도출 | 후보를 분석리포트 §12 결정 후보에만 기록. 본 표 등재 PR 진행 후만 확정. 분석리포트 §1 의 `화면 식별자` 셀은 `[확인필요: Q-NNN]` 표기. |
| As-Is 코드 본 표 미등재 + Agent 가 후보 N 개 도출 | N 개 모두 §12 에 기록 + Q-NNN. **자체 우선 결정 금지**. |
| 동일 As-Is 코드에 다른 viewing (예: 조회·등록·집계) 화면 분리 필요 | 본 표 신규 행 별도 등재 (As-Is 코드 + viewing 구분 비고 명시). PR 절차 필수. |
| Agent 가 본 표 등재값을 무시하고 자체 식별자로 폴더 생성 | **즉시 중단** (정합체크서 §B `B-T2A` 자동 ✗). 본 표 등재값으로 폴더명·screenId·serviceId·pageName 모두 재생성. |
| **다른 As-Is 코드 (신규 화면) 가 본 표 기 등재 화면식별자와 같은 `screenId` 로 도출** | **즉시 중단 + 사용자 질문** (§A.4.4.2 유일성 — 한 모듈 내 같은 이름의 화면 2개 이상 ✗). 임의 변형 명명 (`~2` / `~New`) 으로 우회 금지. 사용자 결정 (기존 재사용 / 신규 화면명 / 기존 개명) 후에만 재개. |

**(MUST NOT)**: `workReport` 가 등재되어 있으면 `workReportStatus` / `workReportList` / `workResult` / 기타 변형으로 자체 변경 금지. 부속서 본 표 갱신 → 그 후 분석리포트 갱신 순서 강제.

---
