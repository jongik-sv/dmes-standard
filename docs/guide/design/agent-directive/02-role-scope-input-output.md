# Agent 화면 설계서 생성 지시서 V2

> 상위 문서: [Agent 화면 설계서 생성 지시서 V2](../00_Agent지시_가이드.md)

## 1. Claude의 역할

Claude는 화면 단위 설계서를 작성하는 설계 Agent로 동작한다.

Claude는 다음 원칙을 반드시 따른다.

1. 설계는 신규 창작이 아니라 **As-Is 분석 → To-Be 분석 → 매핑 → 설계** 순서로 수행한다.
2. 기존 {CLIENT} ERP 원본 소스와 DB 자료를 비즈니스 로직의 정본으로 본다.
3. 기능설계서는 화면이 **무엇을 하는가(WHAT)** 를 정의한다.
4. 디자인설계서는 화면이 **어떻게 보이고 배치되는가(HOW IT LOOKS)** 를 정의한다.
5. BPMN설계서는 화면 동작이 서버에서 **어떻게 처리되는가(HOW IT WORKS)** 를 정의한다.
6. 기능/디자인/BPMN 3종 설계서는 서로 독립 문서가 아니라 같은 분석리포트를 근거로 파생되어야 한다.
7. 지시서와 가이드에 이미 답이 있는 항목은 사용자에게 묻지 않는다.
8. 자료 부족 또는 업무 정책 판단이 필요한 항목만 사용자에게 확인한다.
9. 분석 중 발견한 항목은 일부만 발췌하지 않는다. 조회조건, 그리드 컬럼, 버튼, 팝업, 상태, 검증, 연동, 부수효과는 **전수 목록화**한다.
10. “주요”, “대표”, “등”이라는 표현으로 분석 범위를 축소하지 않는다. 실제 전수 확인이 불가능하면 `[확인필요]`로 표시한다.

---

## 2. 적용 범위 판정

### 2.1 MES 하위 업무 모듈

아래 moduleId는 본 3종 설계가이드 기준으로 작성한다.

| moduleId | mesModule | 설명 |
|---|---|---|
| `mpp` | `m-mpp` | 조업관리 / 생산실행 |
| `mqc` | `m-mqc` | 품질관리 |
| `mls` | `m-mls` | 물류관리 / 주문 / 출하 |
| `mas` | `m-mas` | MAS 영역 |
| `mcm` | `m-mcm` | 공통·시스템 모듈 |
| `master` | `m-master` 또는 프로젝트 기준 값 | 마스터 영역 |

### 2.2 APS 예외

다음 중 하나라도 해당하면 본 지시서의 3종 설계 템플릿을 적용하지 않는다.

| 조건 | 처리 |
|---|---|
| moduleId가 `mpn` | `docs/aps/Aps-Guide.md` 기준으로 전환 |
| mesModule이 `m-mpn` | `docs/aps/Aps-Guide.md` 기준으로 전환 |
| 경로가 `src/backend/{mpn, aps-core}` 또는 `src/frontend/m-mpn` | `docs/aps/Aps-Guide.md` 기준으로 전환 |
| 화면 식별자가 `APS_` prefix 또는 APS 화면번호 기반 | `docs/aps/Aps-Guide.md` 기준으로 전환 |

APS와 MES가 한 요청에 함께 포함된 경우, 섹션을 분리하여 각 가이드를 따르고 임의 혼용하지 않는다.

---

## 2.5 멀티에이전트 조율 (신설 — Wave G-1)

> **정본 위치 명세**: 본 § 은 plan 의 신규 "§3 멀티에이전트 조율" 본문에 해당한다. 기존 §3 ~ §21 의 1:1 보존을 위해 번호 충돌을 피해 §2.5 슬롯에 등재한다 (§0.1 / §0.2 와 동일한 sub-numbered 등재 패턴). 본 § 본문은 §3 으로 인용해도 동일하다 (plan 정본 우선).

본 절은 화면 설계 5종 산출물 생성 과정에서 메인 에이전트가 서브에이전트를 호출해 작업을 분산할 때 따르는 정본 규칙이다. 작업 분할 / 시스템 프롬프트 prepend / 결과 종합 3 단계로 구성한다.

### 2.5.1 Phase 분할 휴리스틱 (강제 아님 — 에이전트 판단)

서브에이전트 분산은 강제 아니라 **에이전트 판단 기준** 으로 수행한다. 다음 휴리스틱을 따른다.

| 항목 | 기준 | 처리 |
|---|---|---|
| 분할 권고 임계치 | 작업 단위가 **≥ 5 화면** 또는 **≥ 5 산출물** 동시 검증/보완 | Phase 분할 + 서브에이전트 분산 권고 |
| 분할 단위 | 화면 단위 / 산출물 종류 (분석리포트 vs 기능설계서 vs ...) / 검증 단위 (R-14 manifest 9 파일 vs 본문 인용 vs 정합체크서) 중 작업 성격에 맞는 축 1개 | 메인이 단일 축으로 잘라 서브에이전트에 분산 |
| 계층 | **1계층 분산 기본** (메인 → 서브에이전트 N 개). 2계층 (서브 → 서브-서브) 은 환경 지원 시에만 시도 | 환경 제약 발견 시 1계층으로 자동 전환 (강제 2계층 금지) |
| 환경 제약 | 서브에이전트가 Agent / Task 도구 미가용한 경우 등 | 메인이 직접 1계층 분산으로 fallback (사용자 보고 불필요 — fail-fast 회피) |
| 컨텍스트 보호 (= **컨텍스트 분산**) | 메인 에이전트는 오케스트레이션 + 결과 종합만 담당 | 워커가 산출한 본문은 작업 노트 파일에 저장, 메인 컨텍스트에는 250자 이내 요약만 반환 |

> **용어 — "컨텍스트 분산"**: 위 "컨텍스트 보호" 행과 동일 개념의 별칭. 메인 에이전트 컨텍스트 윈도우 단일 집중을 피하고, 워커별 작업 노트 파일에 본문을 분산 저장하여 메인은 압축 요약만 수신하는 운영 패턴을 가리킨다. 본 가이드 본문에서 "컨텍스트 보호" / "컨텍스트 분산" 표현은 호환 사용한다.

분할이 권고되지 않는 경우 (단일 화면 단일 산출물 등) 메인 에이전트가 직접 수행한다. **분량 회피 목적의 임의 분할 금지** (§6.13 참조).

### 2.5.2 표준 시스템 프롬프트 템플릿 (14 항 prepend)

서브에이전트 호출 시 메인 에이전트는 prompt 첫머리에 다음 **14 항** 을 한 글자도 빠뜨림 없이 prepend 한다. 14 항은 본 가이드 §0 / §6 / §16 / §17 의 정본을 워커 컨텍스트에 강제 주입하는 장치로, 누락 시 산출물 품질 보장 불가.

```
[사용자 요구사항 — 위반 금지]
1. As-Is 1:1 보존: 본문 / 표 / 컬럼 / 게이트 / 인용 라인 1:1 보존. 임의 수정 / 삭제 / 병합 금지.
2. 추측 금지·인용 필수: 모든 본문 주장에 file:line cite 또는 명확 근거. 파일 경로 패턴 추측 금지 (실제 ls / Glob 로 검증).
3. 누락 금지: 작업 대상 자산 처음~끝 모두 읽기. 발췌 / "주요 / 대표 / 등" 표현 금지.
4. 결함 전부 처리: 발견 시 부분 처리 / 사소한 것 생략 금지. 결함 = 결함 전부 = 재작성 수준.
5. 분량 회피 / 요약화 금지: 본문 충실 작성 (행위 / 조건 / 예시 / 실패시 대응 명시). "토큰 한계로 skip" 같은 누락 정당화 금지.
6. 스크린샷 시각 비교 (제공 시): designer.cs + 화면 캡처 + 디자인설계서 3자 1:1 대조. 부재 시 fail-fast 보고 또는 designer/cs 단독 검증.
7. 빠르게 가려고 대충 금지: 느려도 꼼꼼하게가 표준. 시간이 더 걸려도 §1~§5 우선.
8. 정본 가이드 (RULE.md / 본 설계 가이드 / 개발 가이드) 준수: 가이드 §외 임의 신설 / 임의 해석 금지.
9. 화면 단위 작업 시 5종 산출물 정합: 분석리포트 / 기능 / 디자인 / BPMN / 정합체크서 동일 분석리포트 단일 원천 (§0.1.3).
10. Phase 종료 자동 고해성사 4 질문 (§6.14): 사용자가 묻기 전에 본인이 먼저 점검.
11. 환경 제약 발견 시 fail-fast: 도구 미가용 / 경로 부재 / 자료 부재 등은 임의 합리화 금지, 즉시 보고.
12. 직접 수행 우회 금지 (Agent 도구 미가용 시 fail-fast): 강제 2계층 분산 금지, 1계층 자동 전환.
13. 가이드 §외 임의 신설 금지: 신규 § / 표 / 컬럼 추가는 가이드 정본 갱신 후에만.
14. 파일 경로 패턴 추측 금지: 작업 초기 ls / Glob 로 실제 경로 확인 후 사용.

[작업 단위 — 본 phase 에서 처리할 범위]
{메인이 분할한 단위 — 예: "화면 X / 산출물 Y"}

[입력 자산]
{본문 / cs / designer.cs / SQL / 메모리 / 가이드 정본 경로}

[Phase 종료 자동 고해성사 (§6.14 — 본 작업에도 적용)]
모든 Edit 완료 후 워커 스스로 4 질문 점검:
1. 14 항 위반? 2. 검증 안 한 부분? 3. 그대로 수용? 4. 임의 합리화?
→ 모두 No 면 결과 반환. 하나라도 Yes 면 즉시 정정 후 재점검.

[메인 Claude 반환 (250자 이내)]
{워커가 메인에 압축 보고 — 라인 diff / 추가 § 수 / 핵심 결정}
```

**사용 예시 prompt**:

```
[사용자 요구사항 — 위반 금지] ... (14 항 그대로) ...

[작업 단위]
masterCodeMng 메인 화면 1개 — 분석리포트 §17.2 컬럼 단위 1:1 전수 행 분해 보완.

[입력 자산]
- 본문: docs/mcm/design/masterCodeMng/masterCodeMng_분석리포트.md
- As-Is 원장 자산 (XFDL / Java / MyBatis 매퍼) 경로 ls 로 확인

[Phase 종료 자동 고해성사] ... 4 질문 ...

[메인 Claude 반환 (250자 이내)]
"§17.2 +120 행 추가 / Edit 3회 / 4질문 통과. 노트: _redesign/masterCodeMng/wave1.md"
```

14 항 중 하나라도 prepend 누락 시 워커 산출물 품질 보장 ✗. 메인 에이전트는 매 호출마다 14 항 모두 포함 여부를 자체 검증한다.

### 2.5.3 에이전트 결과 종합 규칙

서브에이전트의 압축 보고 (250자 이내) 는 메인 에이전트가 그대로 사용자에 통과시키지 않는다. 다음 3 단계를 거친다.

| 단계 | 메인 에이전트 행동 | 통과 기준 | 미통과 시 처리 |
|---|---|---|---|
| **1. 인용 검증** | 워커가 작업 노트에 적은 file:line cite 가 실제 파일과 일치하는지 spot-check (최소 30% 또는 5건 중 큰 값) | 인용 일치율 100% | 워커 재호출 + 14 항 prepend 강조 |
| **2. 산출물 실제 상태 확인** | 워커가 "+N 행 추가" 보고 시 실제 산출물 파일을 Read 또는 wc -l 으로 확인 | 보고 line 증가 == 실제 line 증가 | 워커 재호출 또는 메인 직접 보완 |
| **3. 14 항 위반 자체 점검** | 워커 산출물에 임의 합리화 (예: "△ skip — 토큰 한계") / 추측 표현 / 분량 회피가 없는지 grep | hit 0 건 | 발견 시 정정 후 §6.14 재진입 |

**(MUST) 메인 에이전트는 워커 보고를 그대로 수용하지 않는다.** 워커 보고와 산출물 실제 상태의 차이가 발견되면 §6.14 Phase 종료 자동 고해성사 4 질문 재점검을 트리거하고, 잔존 결함이 0 이 아니면 해당 Phase 자체를 재진입한다 (최대 2 회).

---

## 3. 입력값 확인

Claude는 설계 시작 전에 아래 값을 확인한다.

### 3.1 필수 입력값

> **(MUST)** MES 모듈 (`mls` / `mqc` / `mpp` / `mas` / `mcm`) 과 APS 모듈 (`mpn`) 의 명명 패턴이 다르다. 본 표는 **MES 룰 정본**. APS 예외 (mpn) 는 §3.1.1 별표 참조.

#### MES 룰 (`mls` / `mqc` / `mpp` / `mas` / `mcm` — 정본)

| 항목 | 필수 여부 | 예시 | 누락 시 처리 |
|---|---:|---|---|
| 화면명 | 필수 | 작업실적현황 | `[확인필요]` |
| 화면 식별자 (= screenId = pageId = serviceId) | 필수 | `plateSlittingMgmt` | 가이드 기준으로 추정 가능하면 제안, 확정 불가 시 `[확인필요]` |
| As-Is 식별자 | 필수 권장 | `PGA020K` | 없으면 `[확인필요]` |
| moduleId | 필수 | `mls` | 업무 영역으로 추정 가능하면 제안, 확정 불가 시 `[확인필요]` |
| mesModule | 필수 | `m-mls` | moduleId로부터 산출 |
| moduleGroup | 필수 | `operation` | 사전 미등재 시 사용자 확인 필요 |
| pageName | 필수 | `plateSlittingMgmt` | **screenId 와 동일 camelCase 값** (kebab-case 변환 ✗) |
| pageId | 필수 | `plateSlittingMgmt` | **screenId 와 동일 camelCase 단일값** (`portal:{moduleGroup}/{pageName}` path 구조 ✗) |
| page type | 필수 | `C` | 기능 구조 기준으로 자동 판정, 혼합형이면 확인 필요 |
| serviceId | 필수 | `plateSlittingMgmt` | **screenId 와 동일 camelCase 단일값** (액션 결합 ✗) |
| 주 사용자 | 필수 권장 | 생산관리팀 | 자료 없으면 `[확인필요]` |

**MES 룰 핵심 (사용자 결정)**:
- `screenId` = `pageId` = `serviceId` = `pageName` **단일 camelCase 값** (예: `plateSlittingMgmt`)
- Frontend 파일명 = `{screenId}.tsx` (예: `plateSlittingMgmt.tsx`) — kebab `mls-plate-slitting-mgmt.tsx` ✗, suffix `-page` ✗
- kebab-case 변환 / `portal:{moduleGroup}/{pageName}` path 구조 / `-page` suffix 모두 ✗

#### 3.1.1 APS 예외 (`mpn` — 별표)

| 항목 | 필수 여부 | 예시 | 누락 시 처리 |
|---|---:|---|---|
| 화면명 | 필수 | 수요계획 | `[확인필요]` |
| 화면 식별자 (screenId) | 필수 | `demand` | 가이드 기준으로 추정 가능하면 제안 |
| moduleId | 필수 | `mpn` | (APS 고정) |
| pageName | 필수 | `demand` | kebab-case (단일 토큰) |
| pageId | 필수 | `portal:planning/demand` 형식 가능 | APS 기존 컨벤션 유지 |
| serviceId | 필수 | `demand` | screenId 와 동일 |
| **Frontend 파일명** | 필수 | `demand-page.tsx` | **kebab-case + `-page.tsx` suffix 유지** (APS 기존 컨벤션) |

**APS 예외 적용 조건**: moduleId == `mpn` 또는 mesModule == `m-mpn` 또는 화면이 APS 도메인 (수주·APS·자원·planning·scheduling 등). MES 룰 (camelCase 단일값 + `-page` 미사용) 적용 ✗.

### 3.2 참조 자료 경로

아래 경로는 프로젝트 고정 경로로 취급한다. 사용자가 매번 제공하지 않아도 Claude는 기본 참조 대상으로 본다.

#### As-Is 자료

| 자료 | 표준 위치 | 활용 |
|---|---|---|
| As-Is 테이블 | `docs/external/KsmErpK/tables/` | 기존 컬럼/관계 분석 |
| As-Is 뷰 | `docs/external/KsmErpK/views/` | 조회 로직, 조인, 집계 규칙 분석 |
| As-Is 프로시저 | `docs/external/KsmErpK/procedures/` | 저장, 상태변경, 배치 로직 분석 |
| As-Is 함수 | `docs/external/KsmErpK/functions/` | 계산식, 변환식, 검증 규칙 분석 |
| As-Is 트리거 | `docs/external/KsmErpK/triggers/` | 자동 처리, 연쇄 갱신, 이력 적재 분석 |
| 기존 ERP 원본 소스 | `docs/external/KsmErpK/orgErpSource/` | 화면 동작, 버튼 이벤트, 숨은 업무 규칙 분석 |

#### To-Be 자료

| 자료 | 표준 위치 | 활용 |
|---|---|---|
| To-Be 테이블 정의서 | `docs/external/DMES/DMES-SECTION-{MODULE}_테이블정의서.xlsx` | 신규 DB 컬럼명/타입 정본 |
| 타 모듈 Entity | `src/backend/{moduleId}/core/src/main/java/**/domain/**/*.java` | 기 구축 컬럼명 재사용 확인 |
| 화면별 매핑 문서 | `docs/{moduleId}/reference/mapping/{화면식별자}_mapping.md` | As-Is ↔ To-Be 매핑 정본 |

### 3.3 화면 캡처

As-Is 화면 캡처는 선택 자료이나, 있으면 반드시 반영한다.

캡처가 없는 경우:

1. As-Is 소스, designer, 이벤트 핸들러, SQL, 테이블 정의서 기반으로 화면 요소를 식별한다.
2. 확정 불가능한 항목은 `[확인필요]`로 표시한다.
3. 기능설계서 §11 또는 특이사항에 `캡처 미제공 — As-Is 소스 기반 추정`이라고 기록한다.

---

## 4. 산출물

Claude는 한 화면에 대해 기본적으로 아래 5개 산출물을 작성한다.

| # | 산출물 | 파일명 | 저장 위치 | 필수 여부 |
|---:|---|---|---|---|
| 1 | 분석리포트 | `{화면식별자}_분석리포트.md` | `docs/{moduleId}/design/{화면식별자}/` | 필수 |
| 2 | 기능설계서 | `{화면식별자}_기능설계서.md` | `docs/{moduleId}/design/{화면식별자}/` | 필수 |
| 3 | 디자인설계서 | `{화면식별자}_디자인설계서.md` | `docs/{moduleId}/design/{화면식별자}/` | 필수 |
| 4 | BPMN설계서 | `{화면식별자}_BPMN설계서.md` | `docs/{moduleId}/design/{화면식별자}/` | 필수 |
| 5 | 정합체크서 | `{화면식별자}_정합체크.md` | `docs/{moduleId}/design/{화면식별자}/` | 필수 |

대량 컬럼 매핑 또는 As-Is/To-Be 차이가 많은 화면은 아래 문서를 추가 작성한다.

| 산출물 | 파일명 | 저장 위치 | 필수 조건 |
|---|---|---|---|
| As-Is ↔ To-Be 매핑 문서 | `{화면식별자}_mapping.md` | `docs/{moduleId}/reference/mapping/` | 컬럼 수가 많거나 매핑 차이가 있는 경우 필수 |

### 4.1 폴더 생성 규칙

산출물 작성 전 `docs/{moduleId}/design/{화면식별자}/` 폴더 존재 여부를 확인한다.

폴더가 없으면 생성한 뒤 저장한다.

### 4.2 파일명 규칙

파일명에는 moduleId를 넣지 않는다. moduleId는 저장 경로에서 표현한다.

올바른 예:

```text
docs/mpp/design/workReport/workReport_분석리포트.md
docs/mpp/design/workReport/workReport_기능설계서.md
docs/mpp/design/workReport/workReport_디자인설계서.md
docs/mpp/design/workReport/workReport_BPMN설계서.md
docs/mpp/design/workReport/workReport_정합체크.md
```

잘못된 예:

```text
docs/mpp/design/mppWorkReport/mppWorkReport_분석리포트.md  ← screenId 에 모듈명 prefix (mpp) 금지
docs/mpp/design/workReport/mpp_work_report_기능설계서.md
docs/mpp/design/workReport/work-report_기능설계서.md
```

---

## 5. 생성 순서

Claude는 반드시 아래 순서로 작업한다.

```text
0. Auto Manifest Runner 자동 호출 (R-14 / R14-Auto — 분석 1번째 행동 강제)
1. 적용 범위 판정
2. 입력값 확인
3. 자료 수집 인벤토리 작성
4. As-Is 화면 요소 전수 분석
5. As-Is DB/SQL/소스 로직 분석
6. To-Be 테이블/Entity 분석
7. As-Is ↔ To-Be 매핑 분석
8. API 패턴 및 페이지 유형 판정
9. 분석리포트 작성
10. 분석완료 게이트 판정
11. 기능설계서 작성
12. 디자인설계서 작성
13. BPMN설계서 작성
14. 정합체크서 작성
15. 확인필요 항목 집계
16. 최종 응답 작성
```

> **(MUST — R-14 / R14-Auto)** Step 0 = Auto Manifest Runner 자동 호출. **manifest 9 파일이 존재하지 않거나 verify-report.pass=true 가 아니면 Agent 는 분석을 시작하지 않는다.** 호출 절차는 §0.2.9, 캐시 정책은 §0.2.10 정본.

기능설계서가 기준 문서이다. 디자인설계서와 BPMN설계서는 기능설계서의 화면 영역, 필드ID, 버튼ID, 팝업ID, 상태코드, action을 기준으로 작성한다.

단, 기능설계서는 분석리포트의 전수 목록과 매핑 결과를 근거로 작성한다.

---
