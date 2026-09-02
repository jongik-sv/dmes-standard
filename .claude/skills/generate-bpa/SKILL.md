---
name: generate-bpa
description: "SampleErp 화면 1개의 PRIMARY 산출물인 통합 분석 보고서 (V3.1) 를 생성한다. Phase 1~4 JSON 을 입력으로 BPA 11개 섹션 + 기술 상세 Appendix 를 단일 MD 로 통합. 파일명에 한글 화면명 포함 (screens/{SCREEN-ID}_{화면명}.md) 으로 파일 탐색기에서 즉시 식별 가능. 화면당 산출물 = MD 1개 + BPMN 1개. 사용 시점: /generate-bpa SCREEN-ID 호출 시. 이전 /generate-legacy 도 본 스킬로 위임된다."
---

# 화면 통합 분석 보고서 생성 (V3.1 PRIMARY 산출물)

> ⭐ **V4 (2026-05-13) — 영역 분리 폴더 구조 (필수)**
>
> 본 스킬의 모든 산출 경로는 V4 부터 **`{areaId}/{moduleId}/...`** 로 해석 (root: `docs/external/SampleErp/orgErpReport/{areaId}/{moduleId}/screens/{SCREEN-ID}_{화면명}.{md,bpmn}`). 본문에 `{moduleId}/` 로 적힌 경로는 자동으로 영역 prefix.
>
> **영역 매핑** (PLUGIN_USAGE.md §1.2.1 정본):
> - **품질**: QMA · QSA · QCA · QIA · QRG · QGA · QNA · QBA · QRA · RMA · GIA
> - **물류**: SFA · SFB · SOA · SOB · ITR · ICA · INV · MIM · STA · STB · STC · STD · MCC · IZA · IPA · IBA · BPG · BPM
> - **조업**: PMA · (향후 PCA · PFA · PGA · MAA · MCM · BOA · BOP)
> - 신규 모듈은 사용자에게 영역 결정 요청.
>
> 예: `/generate-bpa QMA001K` → `docs/external/SampleErp/orgErpReport/품질/QMA/screens/QMA001K_검사결과등록.{md,bpmn}` + `품질/QMA/.cache/QMA001K/*.json` 입력.

SampleErp 화면 1개의 **모든 분석 결과 (BPA 본문 + 기술 상세 + 커스텀 클래스 요약 + procedure 매핑 + inline SQL) 를 단일 MD 로 통합** 한다. 화면당 PRIMARY 산출물은 정확히 2개:

```
{moduleId}/screens/{SCREEN-ID}_{화면명}.md      ← V3.1: 파일명에 한글 화면명 포함
{moduleId}/screens/{SCREEN-ID}_{화면명}.bpmn
```

예시: `GIA/screens/GIA044K_품목미결처리(품질).md` + `.bpmn`

> **V3 → V3.1 변경**: 파일명에 한글 화면명을 underscore 로 결합. SCREEN-ID 만 있던 V3 표기는 deprecated. 파일 탐색기에서 어떤 화면인지 열기 전에 식별 가능.

> V2 → V3 변경: 이전 `{SCREEN-ID}/_bpa.md` + `_legacy_analysis.md` + `_classes/*.md` 분산 구조를 단일 통합본으로 흡수. `/generate-legacy` 는 본 스킬의 deprecation alias 가 되었다.

## 화면명 추출 알고리즘 (V3.1 필수 단계)

화면 보고서 파일명을 결정하기 전에 다음 순서로 `{화면명}` 을 추출한다:

### 1순위: SampleErp 화면 폴더명 파싱
화면 폴더 경로 마지막 segment 에 `{SCREEN-ID}.{화면명}` 패턴 적용:
```
경로 예: docs/external/SampleErp/orgErpSource/KsmK Project/Tasks/기준정보관리/품목관리/GIA044K.품목미결처리(품질)/
폴더명: GIA044K.품목미결처리(품질)
정규식: ^([A-Z]{3}\d{3}K)\.(.+)$ → group(2) = "품목미결처리(품질)"
```

### 2순위: cs 파일 #region 작성정보 추출 (1순위 실패 시)
폴더명이 `{SCREEN-ID}` 단독이거나 다른 패턴이면 `{SCREEN-ID}.cs` 첫 50줄에서:
```
정규식: 업무\s*[:：]\s*(.+) → group(1) = 화면명
대안: namespace 주석 또는 클래스 XML doc
```

### 3순위 fallback: 사용자 질문 / 코드명 그대로
1·2순위 모두 실패 시 AskUserQuestion 으로 화면명 묻거나, `{SCREEN-ID}_화면명미확정.md` 형식 임시 사용 (사용자가 추후 rename).

### 파일명 sanitize 규칙
추출된 화면명을 파일명에 쓰기 전 다음 변환:
- 슬래시 `/`, 백슬래시 `\`, 콜론 `:`, 별표 `*`, 물음표 `?`, 큰따옴표 `"`, less/greater `< >`, 파이프 `|` → 제거
- **괄호 `()`, 한글, 점 `.`, 공백, 하이픈 `-`, underscore `_` 는 유지** (Windows/Linux/macOS 모두 허용)
- 양 끝 공백/점 제거
- 길이 60자 초과 시 잘라내기

예:
- `품목미결처리(품질)` → 그대로 유지 (괄호 OK)
- `Job 매칭/조회` → `Job 매칭조회` (슬래시 제거)

> 산출물 템플릿(`templates/bpa_report_template.md`) 의 §1~11 헤딩 / placeholder 는 부산 시절 그대로 보존한다 — 산출물 동일성 우선. §A 기술 상세 Appendix 는 V3 신설. 본문 채울 때 어휘만 [`_shared/vocabulary-mapping.md`](../_shared/vocabulary-mapping.md) 의 Java→C# / PL/SQL→T-SQL 매핑을 적용한다.

---

## ⛔ 절대 준수 규칙

> 이 규칙들은 BPA 문서 생성 시 어떤 상황에서도 위반할 수 없다.

### 규칙 1: 템플릿 100% 준수

**반드시 [templates/bpa_report_template.md](templates/bpa_report_template.md) 파일을 읽고, 그 섹션 번호(1~11), 제목, HTML 형식을 정확히 따라야 한다.**
- 섹션 번호/제목을 임의로 변경, 재배치, 추가, 삭제하지 않는다
- 템플릿에 없는 섹션(예: "액티비티 목록", "호출 procedure 목록", "데이터 처리 상세", "ERD")을 추가하지 않는다
- 템플릿 내 `<!-- 작성 지침 -->` HTML 주석의 지시를 반드시 따른다

### 규칙 2: 워크플로우에 화면 조작 금지

**BPA 워크플로우는 "비즈니스 프로세스"를 표현하는 것이지, "화면 조작 절차"를 표현하는 것이 아니다.**

| ⛔ 금지 (화면 조작) | ✅ 올바름 (비즈니스 프로세스) |
|---|---|
| "조회/저장 버튼 클릭" | "Job 매칭 검증", "수주 정보 등록" |
| "화면 진입/로드/초기화" | "EAI 전문 수신", "배치 처리 시작" |
| "그리드 표시/바인딩" | "실적 데이터 집계", "환율 환산 계산" |
| "팝업 열기/닫기", "탭 전환" | "ERP 실적 보고", "거래처별 분배" |
| "메시지 출력", "엑셀 내보내기" | 워크플로우에서 제외 |

**판단 기준**: "사람이 화면에서 하는 행위"이면 제거하거나 "시스템이 수행하는 업무 처리"로 변환한다.

### 규칙 3: 코드 레벨 정보 금지

워크플로우(섹션 3, 4)와 비즈니스 로직 상세(섹션 5)에서 아래 항목 사용 금지:
- C# 메서드명: `btnSearch_Click`, `OnSave`, `Form_Load` 등
- procedure 이름 / SQL key: `doAddress`, `S_JobList` 등
- 컬럼명: `JOB_ID`, `COIL_WGT` 등 (섹션 5의 엔티티 수준 언급만 예외)
- 베이스 클래스/컨트롤명: `FormWith1Grid`, `FpSpread`, `C1Combo` 등 (섹션 6/8 의 컴포넌트 분석에서만 예외)

### 규칙 4: Mermaid 구문 규칙

- 노드 내 줄바꿈은 반드시 `<br/>` 을 사용한다. `\n` 사용 금지.
- **노드 텍스트 및 엣지 라벨 내 괄호 `()` 사용 금지.** Mermaid 에서 `()` 는 노드 형태 정의 구문으로 인식되어 파싱 에러를 유발한다. `6000 (부산)` → `6000 부산`, `입고 실적 없음 (미입고)` → `입고 실적 없음` 등으로 괄호를 제거한다.
- **다이아몬드 `{}` 노드 안에서 괄호가 특히 위험하다.** 반드시 큰따옴표로 감싸거나 괄호 자체를 제거한다.
  - ⛔ `D5{실물정보구분 확인<br/>실물(A) 여부}:::decision` → 파싱 에러
  - ✅ `D5{"실물정보구분 확인<br/>실물(A) 여부"}:::decision` → 정상
  - ✅ 가장 좋은 방법: `D5{실물정보구분 확인<br/>실물 A 여부}:::decision`

### 규칙 5: P-XX 번호체계 필수

- 섹션 4의 모든 프로세스에 **P-01, P-02...** 번호 부여 (Mermaid 노드에도 포함)
- 섹션 5의 각 `<details>` 블록은 섹션 4의 P-XX 와 **1:1 매핑**

### 규칙 6: 조회 전용 화면 제외

데이터 변경(INSERT/UPDATE/DELETE)이 전혀 없고 SELECT 조회만 수행하는 화면은 **BPA 생성 대상에서 제외**한다.

**판별 기준:**
1. `structure.json` 의 `activities` 에 데이터 변경 컴포넌트(`btnSave_Click`, `OnSave`, `Save 류 핸들러`, `type: "custom"`)가 없음
2. `sql_analysis.json` 에 INSERT/UPDATE/DELETE/MERGE 호출이 없음 (SELECT/조회 procedure 만 존재)
3. 서브화면 호출이 없음

위 3가지를 모두 만족하면 조회 전용으로 판정하고, BPA 를 생성하지 않는다. 완료 보고에 제외 사유를 명시한다:
```
⏭️ BPA 생성 제외 (조회 전용):
- 화면 ID: [SCREEN-ID]
- 사유: 데이터 변경 없음 (SELECT 조회만 수행)
```

### 규칙 7: 섹션 3(핵심)과 섹션 4(상세)의 추상화 수준 구분

**섹션 3과 섹션 4는 반드시 다른 추상화 수준으로 작성해야 한다. 동일한 흐름을 반복하면 안 된다.**

| 구분 | 섹션 3 (핵심 워크플로우) | 섹션 4 (상세 워크플로우) |
|------|----------------------|----------------------|
| 목적 | 업무 기능 **그룹** 간 관계 조감도 | 각 기능 그룹 내부의 **P-XX 단위** 세부 흐름 |
| 노드 수 | 3~7개 (업무 기능 그룹 단위) | 기능별 5~15개 (개별 처리 단계) |
| P-XX 번호 | 노드에 포함되는 P-XX 범위 표기 | 필수 |
| Mermaid 수 | 1개 (전체 조감도) | **업무 그룹별 개별 Mermaid** |
| 방향 | `flowchart TD` (세로) | `flowchart TD` (세로) |
| 예시 노드 | "Job 매칭 등록", "실적 보고" | "P-03: BL 번호 존재 여부 확인", "P-07: 무게 환산" |

**단일 프로세스 판단 기준**: 화면의 업무 기능이 하나의 흐름(예: 조회→검증→저장→회신)으로만 구성되고, 독립적인 업무 기능 그룹이 2개 미만이면 **단일 프로세스**로 판정한다.

**단일 프로세스의 핵심 워크플로우 작성 기준:**
- 상세 워크플로우(섹션 4)의 Mermaid 노드가 **10개 미만**이면: 섹션 3 은 Mermaid 없이 다음 메시지로 대체:
  > 이 화면은 단일 업무 프로세스로 구성되어 있어 핵심 워크플로우를 별도로 작성하지 않습니다. **4. 상세 워크플로우**를 참조하세요.
- 상세 워크플로우(섹션 4)의 Mermaid 노드가 **10개 이상**이면: 반드시 핵심 워크플로우 Mermaid 를 작성한다. 상세 워크플로우의 시스템 레벨 단계들을 비즈니스 의미 단위 **4~6개 그룹**으로 압축하고, 각 노드에 포괄하는 P-XX 번호를 `<br/>` 로 표기한다.

### 규칙 8: 섹션 4 업무 그룹별 분리

**섹션 4 는 하나의 거대 Mermaid 가 아니라, 업무 기능 그룹별로 소제목 + 개별 Mermaid 로 분리해야 한다.**

⛔ 금지 패턴:
```
### 프로세스 흐름도
(하나의 Mermaid 에 P-01~P-13 전부 나열, Router 에서 12개 분기)
```

✅ 올바른 패턴:
```
### 프로세스 흐름도 — 등록/취소 (P-04, P-05)
(Mermaid: 유효성 검증 → 분기 → 서브화면 호출)

### 프로세스 흐름도 — 매칭/매칭취소 (P-06, P-07)
(Mermaid: 유효성 검증 → 부적합 경고 → 서브화면 호출)
```

**그룹 분리 원칙:**
- 관련 프로세스를 업무 단위로 묶는다
- 각 Mermaid 에 유효성 검증, 분기 조건, 서브화면 호출 등 **비즈니스 로직 단계** 를 포함
- 데이터 변경 없는 순수 조회 프로세스(P-XX)는 Mermaid 에서 제외하고 텍스트로 언급
- `flowchart LR`(가로) 금지 — 노드 텍스트가 잘려 읽기 어려움. 반드시 `flowchart TD`(세로) 사용

### 규칙 9: 핵심 워크플로우 노드 품질 기준

섹션 3 의 각 노드는 **비즈니스 의미 단위** 여야 하며, 프로그램 실행 단계를 그대로 나열해서는 안 된다.

| ⛔ 금지 (프로그램 실행 로직) | ✅ 올바름 (비즈니스 의미 단위) |
|---|---|
| "DataSet 갱신" → "AppDB.Execute 호출" → "Spread 갱신" → "MessageBox 표시" | "Job 매칭 등록 및 사용자 알림" |
| "기존 데이터 삭제" → "신규 데이터 등록" → "트랜잭션 커밋" | "수주 등록·갱신" |

**추가 금지 항목 (핵심 워크플로우에서)**:
- 구현 패턴: "Delete-Insert", "Upsert", "Batch Insert" 등
- 화면 ID: "SOA005K", "QMA001K" 등 (상세 워크플로우/섹션 10 에서만 허용)
- 트랜잭션 관련: "트랜잭션 커밋", "커밋 처리" 등

### 규칙 10: BPMN 2.0 파일 동시 산출 (세트 보장 · bpmn-skill 위임)

화면 BPA(.md) 와 동일 흐름의 BPMN 2.0 파일(.bpmn) 을 **항상 세트로 산출** 한다. Mermaid 가 렌더되지 않는 환경 + bpmn.io / Camunda Modeler / VS Code BPMN 확장 같은 정식 BPMN 도구에서 시각 확인하기 위함.

> ⚠️ **BPMN 파일은 반드시 [`bpmn-skill`](../bpmn-skill/SKILL.md) (= `@cothe/bpmn-tool` CLI) 로 작성한다.** 직접 XML 편집(Write·Edit 로 `.bpmn` 파일 쓰기) 금지. `bpmn-tool create` 가 DI 좌표·BPMNShape·BPMNEdge·네임스페이스를 자동 관리하므로, 본 스킬은 JSON 스펙(노드/흐름) 만 만들고 CLI 가 좌표·XML 을 채운다.

> 추가 예시·풀 골격은 [`../_shared/bpmn-output-convention.md`](../_shared/bpmn-output-convention.md) 와 [`../bpmn-skill/SKILL.md`](../bpmn-skill/SKILL.md) 정본 참조.

**10-1. 산출 위치 (V3 — screens/ 평탄 구조)**:
```
docs/external/SampleErp/orgErpReport/{moduleId}/screens/{SCREEN-ID}_{화면명}.bpmn
```

> V2.1 → V3.1 변경: 화면별 폴더 (`{SCREEN-ID}/`) 폐기. `screens/` 평탄 구조 하에 `{SCREEN-ID}_{화면명}.md` 와 `{SCREEN-ID}_{화면명}.bpmn` 만 형제로 존재 (V3.1 — 파일명에 한글 화면명 포함). BPA md 에서 BPMN 링크는 `./{SCREEN-ID}_{화면명}.bpmn` (동일 폴더).

**10-2. Mermaid 노드 ↔ bpmn-tool JSON `type` 매핑**:

bpmn-skill 의 `create` 입력 JSON `nodes[].type` 값으로 변환한다. 변환 후 `bpmn-tool create` 가 DI 와 XML 을 자동 생성.

| Mermaid 노드 / classDef | bpmn-tool `type` | 비고 |
|---|---|---|
| 시작 (외부 트리거, `start`/`external`) | `bpmn:StartEvent` | 외부 이벤트면 `eventDefinitions: [{type:"bpmn:MessageEventDefinition"}]` |
| 핵심 처리 (`proc`/`process`) — 사용자 입력 | `bpmn:UserTask` | |
| 핵심 처리 (`proc`/`process`) — 시스템 처리 | `bpmn:ServiceTask` | |
| 분기/판별 (`decision`) | `bpmn:ExclusiveGateway` | 분기 2 개 이상이면 default flow 지정 권장 |
| 데이터 저장 (`save`/`data`) | `bpmn:ServiceTask` | `documentation` 에 엔티티 명시 |
| 동일 화면 내 sub-dialog 묶음 (`{SCREEN-ID}pop*` / `tab*` / `sub*`) | `bpmn:SubProcess` | **`children: { nodes, flows }` 필수**. 내부 흐름을 실제로 그림. `width`/`height` 명시 (예: 450×200). 자식 노드 `x`,`y` 는 다이어그램 전체 좌표계 + 부모 bounds 내부 |
| 다른 SCREEN-ID 서브화면 호출 (별도 BPA 존재) | `bpmn:CallActivity` | `calledElement: "Process_{호출 SCREEN-ID}"`. 내부는 호출 대상 BPA 가 책임지므로 본 BPMN 에서는 펼치지 않음 |

> ⛔ **SubProcess 평탄화 금지**: 원본 Mermaid 또는 BPA §5 에서 sub-dialog / 서브 흐름으로 식별된 그룹을 `bpmn:ServiceTask` / `bpmn:UserTask` 여러 개로 풀어서 메인 흐름에 직렬화하지 않는다. 평탄화는 "계층 구조 정보 상실 + 메인 다이어그램 노드 폭증 + sub-dialog 호출 관계 소실" 을 유발한다. 반드시 `bpmn:SubProcess` (또는 `bpmn:CallActivity`) 컨테이너를 유지하고 내부는 `children` 으로 그린다. "서브프로세스 생성하지 말라" 와 같은 모호한 지시를 받아도 평탄화로 해석하지 말 것 — 평탄화가 필요하면 사용자가 명시적으로 "메인 흐름에 인라인" 또는 "ServiceTask 로 풀어라" 라고 요구한다.
| 종결 (정상) | `bpmn:EndEvent` | |
| 종결 (에러, `error`) | `bpmn:EndEvent` + `eventDefinitions:[{type:"bpmn:ErrorEventDefinition", errorRef:"Error_X"}]` | 동시에 최상위 `errors[]` 에 `Error_X` 정의 추가 |

Mermaid 의 arrow(라벨 포함) 는 `flows[]` 항목으로 변환 (`{id, source, target, name?}`).

**10-3. DI 좌표 — bpmn-tool 자동 처리**:

bpmn-tool 이 노드 생성/삭제 시 BPMNShape/BPMNEdge 를 자동 관리한다. 본 스킬에서는 좌표(`x`, `y`) 를 **분기가 있을 때만** 명시한다.

명시 가이드 (bpmn-skill 권장값):
- 주 흐름: 자동 배치 사용 (생략)
- 분기 경로: `y` 를 100(상단) / 300(하단) 으로 분배
- SubProcess 내장 (`children`) 사용 시: 자식 노드 `x`, `y` 는 다이어그램 전체 좌표계 기준 + SubProcess `bounds` 내부

저장 후 검증은 `bpmn-tool validate` 가 다음을 자동 확인 (별도 체크리스트 불필요):
- XML 파싱 / Start·End Event 존재 / 연결 무결성
- ExclusiveGateway default flow 권장
- DI(BPMNDiagram) 존재
- Shape 겹침 / Round-trip 안정성

**10-4. md §3 본문 구성 (Mermaid 블록 바로 위에 BPMN 링크 명시 — V2)**:

```markdown
## 3. 핵심 워크플로우 (Mermaid)

> 📐 **BPMN 2.0 파일**: [./{SCREEN-ID}_{화면명}.bpmn](./{SCREEN-ID}_{화면명}.bpmn) — bpmn.io / Camunda Modeler / VS Code BPMN Editor 에서 DI 좌표 기반 다이어그램으로 렌더링. 아래 Mermaid 는 README 용 경량 시각화.

```mermaid
flowchart TD
... (Mermaid)
```
```

> V3: BPMN 이 동일 `screens/` 폴더에 있으므로 `./{SCREEN-ID}_{화면명}.bpmn` 형태 (V2 의 화면 폴더 형식이 아님).

> 섹션 3 이 단일 프로세스로 생략된 경우 (규칙 7) → §4 의 첫 Mermaid 블록 바로 위에 같은 형식으로 BPMN 링크 명시.

**10-5. 예외 (산출 제외)**:
- 규칙 6 (조회 전용) 으로 BPA 자체가 제외된 화면은 BPMN 도 산출하지 않음

### 규칙 11: 간결 문체

BPA 문서 전체(섹션 2, 5, 7 등) 에 아래 문체 규칙을 적용한다. 정보량·단계 수는 줄이지 않되, 과도한 서술형 표현을 간결체로 변환한다.

1. **종결 어미 제거**: "~한다", "~된다", "~이다" → 명사형 종결
2. **접속어 축약**: "~하여 ~를 ~하고" → "→" 또는 "·"로 연결
3. **반복·수식어 제거**: "해당 자재의 현재" → "자재"
4. **백틱 컬럼명 제거**: 업무 용어만 표기 (컬럼명은 섹션 9 엔티티에서 확인)
5. **procedure 파라미터 나열 금지**: procedure 이름 + 호출 목적만 기술

| 원칙 | ⛔ 과도한 서술형 | ✅ 간결체 |
|------|----------------|----------|
| 종결 어미 | "수신된 전문을 IF 모듈의 수신 로그 테이블에 기록한다." | "수신 전문을 IF 수신 로그 테이블에 기록" |
| 접속어 | "검증 통과 후 자재 마스터와 생산 정보를 결합 조회하여" | "자재 마스터·생산 정보 결합 조회 →" |
| 반복 표현 | "가입고 여부를 확인하여 가입고 상태인 경우" | "가입고 상태인 경우" |
| 컬럼명 | "자재번호(`MTL_NO`), 야드구분(`YRD_TP`)" | "자재번호, 야드구분" |

---

## 실행 절차

### Step 1: 입력 데이터 확인

moduleId 추출: SCREEN-ID 의 앞 3글자 (예: `SOA004K` → `SOA`)

필수 JSON 존재 확인:
```
docs/external/SampleErp/orgErpReport/{moduleId}/.cache/{SCREEN-ID}/structure.json
docs/external/SampleErp/orgErpReport/{moduleId}/.cache/{SCREEN-ID}/java_analysis.json
docs/external/SampleErp/orgErpReport/{moduleId}/.cache/{SCREEN-ID}/sql_analysis.json
docs/external/SampleErp/orgErpReport/{moduleId}/.cache/{SCREEN-ID}/ui_analysis.json
```

> JSON 파일명(`java_analysis.json` 등) 은 부산 시절 그대로 보존 — 산출물 동일성 우선.

없으면 → `/analyze-service [SCREEN-ID]` 를 Skill tool 로 자동 실행

### Step 2: 연관 화면(Dialog/팝업) 탐색

`.cache/` 에서 `{SCREEN-ID}pop*/`, `{SCREEN-ID}tab*/`, `{SCREEN-ID}sub*/` 패턴 디렉토리를 Glob 으로 재귀 탐색. JSON 이 존재하는 연관 화면만 분석 대상에 포함.

### Step 3: 데이터 로드

메인 + 연관 화면 모두:
1. `structure.json` → 화면 구조, 컴포넌트 목록, 서브화면
2. `java_analysis.json` → 커스텀 partial class 정보 (의미는 C# 클래스 — vocabulary-mapping 적용)
3. `sql_analysis.json` → MSSQL procedure 분석, 테이블 정보
4. `ui_analysis.json` → 화면 레이아웃 (WinForms Designer.cs/.resx), 이벤트

### Step 4: 커스텀 클래스 분석 보고서 로드

java_analysis.json 의 `classes` 에서 클래스명 추출 → `docs/external/SampleErp/orgErpReport/{moduleId}/.cache/{SCREEN-ID}/classes/{ClassName}.md` (V3) 로드. cross-module Foundation/Shared 클래스는 `_shared/DBMS/classes/{ClassName}.md` 에서 로드.

### Step 5: 200줄 이상 클래스 필터링

class_analysis.md 의 "총 라인 수" 또는 `wc -l` 로 확인. **200줄 이상**만 섹션 6 Mermaid 대상.

### Step 6: BPA 보고서 생성

**반드시 [templates/bpa_report_template.md](templates/bpa_report_template.md) 을 먼저 읽은 후**, 그 구조를 정확히 따라 작성한다. 본문 채울 때 [`../_shared/vocabulary-mapping.md`](../_shared/vocabulary-mapping.md) 의 Java→C# / PL/SQL→T-SQL 어휘 매핑을 적용한다.

#### 데이터 소스별 섹션 매핑:

| 섹션 | 주요 데이터 소스 | 핵심 작성 포인트 |
|------|----------------|-----------------|
| 1. 시스템 개요 | structure.json `serviceInfo` | 템플릿 6행 테이블 그대로 사용 |
| 2. 시스템 목적 | structure.json + java_analysis.json | 왜 존재하는지, 누가 사용하는지, 어떤 업무를 지원하는지 |
| 3. 핵심 워크플로우 | structure.json `activities` | 업무 기능 그룹 2개 이상일 때만 Mermaid. 단일 프로세스면 "단일 프로세스" 메시지. 섹션 4와 동일 흐름 반복 금지 |
| 4. 상세 워크플로우 | structure.json `activities` | P-XX 번호 필수. 프로세스 식별: 아래 참조 |
| 5. 비즈니스 로직 상세 | sql_analysis.json + java_analysis.json | `<details>` P-XX 1:1 매핑. 엔티티 수준만 |
| 6. 커스텀 클래스 | class_analysis.md | 항상 포함. 3가지 케이스 분기. 본문 어휘는 C# (vocabulary-mapping 참조) |
| 7. 주요 유즈케이스 | 종합 | `<details>` UC-XX. 최소 2개 |
| 8. 화면 구성 개요 | ui_analysis.json | WinForms 화면. Designer.cs 의 컨트롤 트리 + .resx 텍스트 |
| 9. 관련 엔티티 | sql_analysis.json | 테이블 목록 + 텍스트 관계. ERD/컬럼 금지 |
| 10. 서브화면/Dialog | structure.json `subServices` | 없으면 생략 |
| 11. 특이사항 | 종합 | 최소 3건 |

#### 프로세스 식별 방법 (섹션 4용):
1. `activities` 에서 `type: "custom"` 또는 데이터 변경하는 `type: "common"`
2. `btnSave_Click`, `OnSave`, `OnDelete` 등 데이터 변경 핸들러
3. `subServices` 로 서브화면/Dialog 호출
4. 외부 시스템 호출 (있으면)
5. 단순 `OnLoad` + 단일 procedure 조회 → **제외**

#### 연관 화면 약칭 표기 (섹션 4, 5):
- 동일 ID 파생: `— tab01`, `— pop01`, `— Dialog`
- 다른 SCREEN-ID 서브화면: `— SOA005K`
- 메인 화면: 생략

#### Step 6.5: §5 비즈니스 규칙 — DDL CHECK 자동 추출 (V2 표준)

§5 (비즈니스 로직 상세) 의 비즈니스 규칙은 **처리 절차 (P-XX) 기반 규칙** 외에 **DDL CHECK 제약에서 추출한 도메인 규칙 (BR-DDL-XX)** 을 명시한다.

본 단계는 **표준 동작** — 화면이 참조하는 테이블의 schema 분석 보고서가 존재하면 무조건 수행한다.

##### 6.5-1. CHECK 제약 / 도메인 가정 발췌

각 의존 테이블의 `docs/external/SampleErp/orgErpReport/{moduleId}/DBMS/tables/{TABLE}_schema_analysis.md` 에서:

1. DDL `CHECK (...)` 절을 추출 → `BR-DDL-{TABLE-prefix}-NN` 으로 번호 부여
2. CHECK 제약은 없지만 procedure/응용이 가정하는 값 도메인 (`STATUS IN (...)`, `INSP_CLASS_CD IN (...)`) → `BR-DDL` 시리즈로 명시
3. NOT NULL + 명명 컨벤션이 시사하는 의미 (atomic pair 예: `*_CHECKER` + `*_CHECKED_DT` 같이 동시 SET) → 본 절에 명시

##### 6.5-2. 본문 작성 형태

```markdown
> 본 절은 처리 절차 (P-XX) 와 함께 **DDL 에서 추출한 도메인 규칙 (BR-DDL-XX)** 을 명시한다. BR-DDL 규칙은 본 화면 코드 / 의존 procedure 가 의존하는 데이터 무결성 가정으로, DDL CHECK 제약이 부재하므로 응용 측이 책임진다. 자세한 schema 분석은 [`../DBMS/tables/`](../DBMS/tables/) 참고.

#### BR-DDL-REQ-01: INSP_STATUS 도메인
- 적용 테이블: Q_INSPECTION_REQUEST
- 도메인: {Q, V, R, D}
- 강제 위치: 응용 (`uInspRequest`) — DDL CHECK 부재
- BPA P-XX 매핑: P-12 검토 완료 (INSP_STATUS = R), P-04 부적합 보존 (V)

...
```

#### Step 6.6: §9 엔티티 표 — 핵심 컬럼 + 코드값 사전 + 트리거 (V2 표준)

§9 (관련 엔티티) 의 엔티티 표는 단순 테이블 나열을 넘어 다음 4개 컬럼을 갖춘다:

1. **테이블명**
2. **핵심 컬럼** (PK + 비즈니스 키 + 본 화면 read/write 컬럼) — 백틱 인용 + 상태/도메인 값 명시
3. **코드값 사전 매핑** (있는 경우 — 예: `STATUS` → `Q030`, `DECISION_CD` → `Q005`)
4. **트리거 사이드 이펙트** (있는 경우 — 트리거명 + 부수 적재 결과)
5. **본 화면 책임 / 갱신 procedure 매핑** — 본 화면이 어떤 갱신 경로로 본 테이블을 건드리는지
6. **컬럼 lineage 링크** — `[../DBMS/tables/{TABLE}_schema_analysis.md#9-컬럼-lineage--readwrite-추적](...)`

##### 출력 형태 예시

```markdown
### 9. 관련 엔티티

| 테이블 | 핵심 컬럼 | 코드값 사전 | 트리거 | 본 화면 책임 | Schema |
|---|---|---|---|---|---|
| Q_INSPECTION_REQUEST | `INSP_STATUS`{Q,V,R,D} · `DECISION_CD`{A,R,S,N} · 수량 9종 | Q001 / Q005 / Q013 | DELETE → `Q_INSPECTION_DELETE_HISTORY` 아카이브 | UPDATE 만 (uInspRequest) — DELETE 미수행 | [컬럼 lineage](../DBMS/tables/Q_INSPECTION_REQUEST_schema_analysis.md#9-컬럼-lineage--readwrite-추적) |
| Q_INSPECTION_NCR | **`STATUS`{10,21,23,30,40,60,90}** · 검토자 7세트 | Q030 | 없음 | **상태 머신의 정본** — uInspDisposal 갱신 | [컬럼 lineage](../DBMS/tables/Q_INSPECTION_NCR_schema_analysis.md#9-컬럼-lineage--readwrite-추적) |
```

##### 참조 사례

참조 형태: `docs/external/SampleErp/orgErpReport/{MODULE-ID}/screens/{SCREEN-ID}_{화면명}.md` 의 §5 / §9. BR-DDL 규칙 + 엔티티 표 두 영역 모두 위 V3.1 규칙을 따른다.

### Step 7: 화면 BPMN 2.0 파일 산출 (bpmn-skill 위임 · md 와 세트)

§3 핵심 워크플로우(또는 §4 상세 워크플로우 — 단일 프로세스일 때) Mermaid 와 **의미적으로 동등한** BPMN 2.0 파일을 [`bpmn-skill`](../bpmn-skill/SKILL.md) 로 작성한다. **직접 `.bpmn` XML 을 Write·Edit 으로 쓰지 않는다.** 규칙 10 의 매핑은 bpmn-tool 의 JSON 스펙으로 변환되며, DI 좌표·BPMNShape/BPMNEdge·네임스페이스는 `bpmn-tool create` 가 자동 처리한다.

**작업 순서:**

1. **소스 Mermaid 선택**:
   - §3 이 정상 작성된 경우: §3 Mermaid 가 메인
   - §3 이 단일 프로세스로 생략된 경우 (규칙 7): §4 의 첫 Mermaid 블록이 메인
   - 단일 화면이 너무 많은 분기(예: 9개 이상 액션) 를 가지는 경우 §4 의 가장 큰 Mermaid 채택

2. **bpmn-tool JSON 스펙 구성** (규칙 10-2 매핑표):
   - Mermaid 의 각 노드 → `nodes[]` 항목 `{id, type, name, documentation?}`. `type` 은 규칙 10-2 표 적용.
   - Mermaid arrow → `flows[]` 항목 `{id, source, target, name?}`. 분기 라벨은 `name` 에 한글 그대로.
   - 각 노드의 `documentation` 에 §5 (비즈니스 로직 상세) 의 해당 P-XX 설명을 BPA 수준으로 요약 — 코드 식별자(메서드명·procedure 명·컬럼명) 금지.
   - **sub-dialog / 서브화면 처리 (필수 — 평탄화·collapsed 빈 박스·documentation 대체 모두 금지)**:
     - **동일 화면 내 sub-dialog** (Step 2 에서 발견한 `{SCREEN-ID}pop*` / `tab*` / `sub*` 중 별도 SCREEN-ID 가 없는 경우): `bpmn:SubProcess` + `children: { nodes, flows }` 로 **내부 흐름을 실제로 그린다**. `width`/`height` 명시 (권장 450×200, 내부 노드 수가 많으면 확대). 자식 노드의 `x`,`y` 는 다이어그램 전체 좌표계 기준 + 부모 SubProcess `bounds` 영역 내부에 위치.
     - **다른 SCREEN-ID 서브화면 호출** (별도 BPA 가 존재 — 예: `SOA005K`): `bpmn:CallActivity` + `calledElement: "Process_{호출 SCREEN-ID}"`. 본 BPMN 에서는 펼치지 않으며, 내부는 그 화면의 BPA 가 책임.
     - 같은 sub-dialog 가 메인 흐름에서 여러 분기로부터 호출되더라도 SubProcess 노드는 1 회만 정의하고, `flows[]` 에서 진입/이탈 sequenceFlow 만 복수로 연결.
     - ⛔ **금지 패턴 (어떤 경우에도 SubProcess 컨테이너 제거 금지)**:
       - 평탄화: sub-dialog 내부 단계를 메인 프로세스에 `bpmn:ServiceTask` / `bpmn:UserTask` 여러 개로 풀어 직렬화
       - documentation 대체: SubProcess 를 생성하지 않고 메인 Task 의 `documentation` 필드에 "서브 흐름은 ~~~ 다이얼로그에서 처리" 같은 텍스트만 남김
       - 빈 collapsed 박스: `bpmn:SubProcess` 만 만들고 `children` 을 비워서 사용자가 내부를 못 보게 함
     - "서브프로세스 생성하지 말라" 류의 모호한 지시를 받아도 위 금지 패턴으로 해석하지 않는다. 사용자가 명시적으로 "메인 흐름에 인라인", "ServiceTask 로 풀어라", "CallActivity 로 외부 참조만 두고 내부 생략" 이라고 요구할 때만 컨테이너 변경 / 펼침을 수행.
     - 서브 흐름이 BPA §5 의 P-XX 에 속하는 비즈니스 단계라면 다이어그램에서 반드시 보여야 한다 — children 으로 그리거나 CallActivity 로 외부 BPA 를 가리킨다.
   - 에러 종결 노드를 사용하면 최상위 `errors[]` 에 `{id, name, errorMessage}` 정의 추가 후 노드의 `eventDefinitions[]` 에서 `errorRef` 로 연결.
   - 분기가 없는 단순 직선 흐름은 좌표 생략 (자동 배치). 분기가 있으면 분기 경로의 `y` 만 100/300 으로 분배.

   **예시 입력 (단순 직선 흐름)**:
   ```json
   {
     "process": { "id": "Process_GIA044K", "name": "품목미결처리(품질)", "isExecutable": true },
     "nodes": [
       { "id": "Start_1", "type": "bpmn:StartEvent", "name": "검사 완료 후 진입" },
       { "id": "Task_1", "type": "bpmn:ServiceTask", "name": "미결 자재 조회",
         "documentation": "P-01: 품목·로트 단위 미결 상태 자재 조회" },
       { "id": "Gw_1", "type": "bpmn:ExclusiveGateway", "name": "판정 결과" },
       { "id": "Task_2", "type": "bpmn:UserTask", "name": "처리 의견 입력",
         "documentation": "P-02: 처리 의견 및 후속 조치 입력" },
       { "id": "End_1", "type": "bpmn:EndEvent", "name": "미결 처리 완료" }
     ],
     "flows": [
       { "id": "f1", "source": "Start_1", "target": "Task_1" },
       { "id": "f2", "source": "Task_1", "target": "Gw_1" },
       { "id": "f3", "source": "Gw_1", "target": "Task_2", "name": "조치 필요" },
       { "id": "f4", "source": "Gw_1", "target": "End_1", "name": "보류" },
       { "id": "f5", "source": "Task_2", "target": "End_1" }
     ]
   }
   ```

   **SubProcess + children 예시** (동일 화면 내 sub-dialog 가 있을 때) 는 [`../bpmn-skill/SKILL.md` §"SubProcess 내장 자식 요소 (children)"](../bpmn-skill/SKILL.md) 참조. 핵심 형태:
   ```json
   { "id": "Sub_부적합등록", "type": "bpmn:SubProcess", "name": "부적합 등록",
     "x": 500, "y": 100, "width": 450, "height": 200,
     "children": {
       "nodes": [
         { "id": "Sub_Start", "type": "bpmn:StartEvent", "x": 530, "y": 182 },
         { "id": "Sub_Task1", "type": "bpmn:UserTask", "name": "부적합 사유 입력", "x": 600, "y": 160 },
         { "id": "Sub_End", "type": "bpmn:EndEvent", "x": 850, "y": 182 }
       ],
       "flows": [
         { "id": "SubFlow1", "source": "Sub_Start", "target": "Sub_Task1" },
         { "id": "SubFlow2", "source": "Sub_Task1", "target": "Sub_End" }
       ]
     }
   }
   ```

3. **bpmn-tool 호출** — `bpmn-skill` 의 create 패턴을 사용:
   ```bash
   echo '<json>' | bpmn-tool create > docs/external/SampleErp/orgErpReport/{areaId}/{moduleId}/screens/{SCREEN-ID}_{화면명}.bpmn
   ```
   - JSON 은 stdin 으로 전달. 한글이 포함되면 셸 인용 깨짐 방지를 위해 임시 파일(`.cache/{SCREEN-ID}/bpmn_spec.json`) 에 저장 후 `cat ... | bpmn-tool create > ...` 권장.
   - 산출 경로의 `screens/` 디렉토리가 없으면 먼저 생성.

4. **검증**: `bpmn-tool validate <산출 .bpmn>` 실행. 출력 JSON 의 `유효: true` 확인. `오류` 가 0 이 아니면 JSON 스펙 재구성 후 재실행.

5. **md ↔ bpmn 상호 링크**: BPA md §3 (또는 §4 첫 Mermaid) 블록 **바로 위** 에 규칙 10-4 형식대로 BPMN 파일 링크 명시.

### Step 7.5: §A 기술 상세 Appendix 작성 (V3 신설)

§1~11 본문 종료 후 **수평선 (`---`) + `# A. 기술 상세 (Appendix)`** 으로 구분하고 다음 5개 하위 절을 추가한다. 본 Appendix 는 V2 의 `_legacy_analysis.md` 내용을 흡수한 것 — 개발자가 코드 매핑을 확인할 때 참조.

```markdown
---

# A. 기술 상세 (Appendix)

> 본 Appendix 는 개발자 / 신규 시스템 설계자를 위한 코드/스키마 매핑 자료. §1~11 은 업무 담당자용, §A1~A5 는 기술 자료. 한 파일에서 두 시각이 만난다.

## A1. 컴포넌트 / 이벤트 핸들러 매핑
(structure.json 의 activities / customActivities 표화. 각 행: 컴포넌트명 / 핸들러 / 호출 procedure / 비즈니스 의미 / P-XX 매핑)

## A2. MSSQL procedure 호출 매핑
(sql_analysis.json 의 `plsqlCalls.detectedCalls` 표화. 각 행: procedure 명 / 유형 / 용도 / 분석 보고서 링크)
| # | 호출명 | 유형 | 용도 | 상세 분석 |
|---|--------|------|------|----------|
| 1 | dbo.{name} | procedure | {용도} | [../DBMS/procedures/{name}.md](../DBMS/procedures/{name}.md) |

## A3. inline SQL 쿼리
(`.cache/{SCREEN-ID}/inline_queries.md` 가 있으면 본문 인라인 인용. 없으면 "inline SQL 없음" 표기)

## A4. 데이터 흐름 다이어그램
(structure.json + sql_analysis.json 의 dataFlow 합성 Mermaid — Form ↔ Spread ↔ DataSet ↔ procedure ↔ Table)

## A5. WinForms Designer 컨트롤 트리
(ui_analysis.json 의 컨트롤 계층 트리 표화. 본 화면이 WinForms 가 아닌 경우 생략)
```

> Appendix 본문 어휘에도 `_shared/vocabulary-mapping.md` 의 Java→C# / PL/SQL→T-SQL 매핑 적용.

> Appendix 가 비어있는 경우 (조회 전용 + 기술 정보 거의 없음) 도 §A 헤딩과 "본 화면은 기술 상세 정보가 충분치 않습니다" 한 줄로 명시 (사용자가 §A 의 부재를 의심하지 않도록).

### Step 8: 저장 (V3 표준)

```
docs/external/SampleErp/orgErpReport/{moduleId}/screens/{SCREEN-ID}_{화면명}.md
docs/external/SampleErp/orgErpReport/{moduleId}/screens/{SCREEN-ID}_{화면명}.bpmn
```

`screens/` 디렉토리가 없으면 생성한다. 두 파일이 화면당 유일한 PRIMARY 산출물 (이전 V2 의 `{SCREEN-ID}/_bpa.md` / `_legacy_analysis.md` / `_classes/*.md` / `.bpmn` 전부를 흡수).

> V2.1 → V3 변경: 화면 폴더 (`{SCREEN-ID}/`) 폐기 + `_bpa.md`/`_legacy_analysis.md` 분리 폐기 + `_classes/`/`_inline_queries.md` 의 `.cache/` 이전. 사용자가 화면당 보는 PRIMARY 파일은 정확히 2개.

### Step 9: 완료 보고

```
📊 BPA 생성 완료:
- 화면 ID: [SCREEN-ID]
- 모듈 ID: [moduleId]
- 프로세스 수: [P-XX 개수]개
- 커스텀 클래스 워크플로우: [200줄 이상 클래스 수]개
- 서브화면: [서브화면 수]개

📁 출력 (V3 PRIMARY — 화면당 2개):
  - 통합 보고서: docs/external/SampleErp/orgErpReport/[moduleId]/screens/[SCREEN-ID]_[화면명].md
  - BPMN     : docs/external/SampleErp/orgErpReport/[moduleId]/screens/[SCREEN-ID]_[화면명].bpmn

  ※ §1~11 비즈니스 본문 + §A 기술 상세 Appendix 단일 통합. _legacy_analysis.md 별도 산출 없음.
```

---

## 실행 정책

- **세션 완수 정책 준수**: [`../_shared/session-completion-policy.md`](../_shared/session-completion-policy.md) — "다음 세션 심화 예정" / "약식" 산출 금지. 한 응답에 다 안 들어가면 같은 세션 내 turn 분할로 §1~11 + §A + BPMN 까지 완수.
- **Phase 1~4 JSON 자동 확보**: 필수 JSON 이 없으면 `/analyze-service` 를 자동 실행
- **항상 재생성**: 기존 BPA 문서가 있어도 최신 JSON 기반으로 재생성
- **팀원 spawn 금지**: 이 스킬은 직접 실행하며 서브에이전트 불필요

---

## 서브에이전트 위임 시 필수 전달 사항

이 스킬을 서브에이전트에 위임할 때, 다음을 **프롬프트에 반드시 포함**한다:

1. **템플릿 파일 경로** 와 "반드시 이 파일을 읽고 섹션 구조를 정확히 따를 것"
2. **vocabulary-mapping.md 경로** 와 "본문 채울 때 Java→C# / PL/SQL→T-SQL 어휘 매핑 적용"
3. 아래 규칙 블록:

```
⛔ BPA 절대 준수 규칙:
1. 템플릿 파일을 반드시 먼저 읽고 섹션 번호/제목/형식을 정확히 따를 것. 섹션 추가/삭제/이름변경 금지
2. 워크플로우에 화면 조작 금지 — "버튼 클릭", "화면 진입", "그리드 표시" 등 UI 조작 용어 금지. 비즈니스 프로세스만 표현
3. 코드 레벨 정보 금지 — C# 메서드명, procedure 이름, SQL key, 컬럼명, 베이스 클래스명, 컨트롤명 금지
4. P-XX 번호체계 필수 — 섹션 4의 모든 프로세스에 P-01, P-02... 부여, 섹션 5와 1:1 매핑
5. Mermaid 구문 — 노드 내 줄바꿈은 반드시 `<br/>` 사용. `\n` 사용 금지. 노드 텍스트 및 엣지 라벨 내 괄호 `()` 사용 금지
6. 섹션 9 — ERD 다이어그램 금지, 컬럼 상세 금지. 엔티티 목록 테이블 + 텍스트 관계만
7. 조회 전용 화면 제외 — 데이터 변경(INSERT/UPDATE/DELETE)이 없고 SELECT 만 수행하는 화면은 BPA 생성 대상에서 제외
8. 섹션 3 vs 4 추상화 수준 분리 — 섹션 3 은 업무 기능 그룹 간 조감도, 섹션 4 는 그룹 내부 세부 흐름. 동일 흐름 반복 금지
9. 섹션 4 업무 그룹별 분리 — 하나의 거대 Mermaid 금지. 업무 그룹별 소제목 + 개별 Mermaid. flowchart TD 사용
10. 핵심 워크플로우 노드 품질 — 섹션 3 노드는 비즈니스 의미 단위. 프로그램 실행 단계 나열 금지
11. BPMN 동시 산출 — BPA md 와 함께 `{MODULE}/screens/{SCREEN-ID}_{화면명}.bpmn` 산출 (V3.1 — screens/ 평탄 구조 내 형제. 파일명에 한글 화면명 포함). **반드시 `bpmn-skill` (= `@cothe/bpmn-tool` CLI) 사용. 직접 XML 편집 금지** — DI 좌표·BPMNShape/BPMNEdge 는 `bpmn-tool create` 가 자동 관리. 규칙은 `bpmn-skill/SKILL.md` + `_shared/bpmn-output-convention.md` 참조
12. 간결 문체 — 종결 어미 제거. 접속어 축약. 백틱 컬럼명 제거. procedure 파라미터 나열 금지
13. 본문 어휘 매핑 — `_shared/vocabulary-mapping.md` 적용 (Java→C#, PL/SQL→T-SQL)
```
