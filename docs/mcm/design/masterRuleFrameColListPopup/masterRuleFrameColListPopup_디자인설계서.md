---
screenId: masterRuleFrameColListPopup
asIsId: MasterRuleFrameColListPopup
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-04
작성자: Agent
---

# MCM — 업무기준 컬럼 리스트 등록 팝업 디자인설계서

> **Frontend 개발 연계 값** (기능설계서 §1.2 와 동일):
> - mesModule=m-mcm / moduleGroup=cmb / pageName=masterRuleFrameColListPopup / pageId=masterRuleFrameColListPopup / 페이지 유형=E / tsup entry key=`pages/cmb/masterRuleFrameColListPopup`
> - 명명 룰: MES 단일 룰 (camelCase). Frontend 파일명 = `masterRuleFrameColListPopup.tsx`.

---

## 1. 공통 화면 구조

SIDEBAR / HEADER / TabsBar 는 `portal` 의 `PortalShell` 이 자동 주입한다. 단, 본 화면은 **모달 팝업**으로, 부모 화면(MasterRuleFrame)에서 `Modal` 로 호출된다.

### 1.1 포털 공통 영역 (설계 대상 아님 — portal 주입)

```
┌────────────┬──────────────────────────────────────────────┐
│            │ HEADER (portal)                              │
│  SIDEBAR   ├──────────────────────────────────────────────┤
│  (portal)  │ TabsBar (portal)                             │
│            ├──────────────────────────────────────────────┤
│            │  ▼ 부모 화면 위에 Modal 로 팝업 표시          │
│            │                       page-id-badge (portal) │
└────────────┴──────────────────────────────────────────────┘
```

- **page-id-badge** = `mcm:masterRuleFrameColListPopup` (MES 단일 룰)
- 본 화면은 부모(MasterRuleFrame) 컨텍스트에서 `Modal` 로 렌더 (독립 탭 진입 ✗ — 팝업)

### 1.2 화면 설계 대상 영역 (PageLayout 기반 — Modal 내부)

```
┌────────────────────────────────────────────────────────────┐
│ Modal.title = "업무기준 컬럼 등록"   buttons = [등록, 닫기]   │
│  ├─ SearchArea  (A-FILTER) — read-only 표시                 │
│  │    └─ 업무기준 / 업무기준명 (read-only)                   │
│  └─ ContentBody (MAIN)                                      │
│        └─ ContentPanel  (편집 그리드 — 컬럼 리스트)          │
└────────────────────────────────────────────────────────────┘
```

| 영역 | 담당 컴포넌트 | 비고 |
|---|---|---|
| 팝업 컨테이너 | `Modal` | `@dk-oasis/shared/modal` |
| 페이지 타이틀 / 상단 버튼바 | `PageLayout` `title` / `buttons` | [등록, 닫기] |
| A-FILTER (업무기준 표시) | `SearchArea` + `SearchField` × 2 (read-only) | `@dk-oasis/shared/layout` |
| MAIN (콘텐츠) | `ContentBody` + `ContentPanel` × 1 | `@dk-oasis/shared/layout` |
| 편집 그리드 | `AgDataGrid` (+ `useGridDataManager`) | 인라인 편집 (text/combo/mask/checkbox) |

---

## 2. 화면 레이아웃

### 2.1 레이아웃 유형 + 페이지 유형 자동 결정 (R-12)

| 항목 | 값 (enum 강제) |
|---|---|
| **페이지 유형 (자동 결정)** | E (등록 폼 — A-FILTER 표시 전용 + 편집 그리드 위주, 상세/상태 없음) |
| **레이아웃 유형** | 단일그리드형 |
| **참조 화면** | masterCodeSelPop (mcm 팝업 — A-FILTER + 단일 그리드 패턴 참조) |

### 2.2 메인 영역 구조도

```
┌────────────────────────────────────────────────────────────────────┐
│ [업무기준 컬럼 등록]                              [등록] [닫기]       │ ← title + buttons
├────────────────────────────────────────────────────────────────────┤
│ 업무기준 [____RULE_ID____]  업무기준명 [______RULE_NM______]         │ ← A-FILTER (read-only)
│                                                          [▲ 접기]    │ ← btn_fold (B-003)
├────────────────────────────────────────────────────────────────────┤
│ ┌─순번─┬─영문항목명─┬─한글항목명─┬──IN/OUT──┬코드여부┬───컬럼속성───┐ │ ← head 2행 병합
│ │      │            │            │선택│ [▼] │        │유형│총길이│소수│ │
│ ├──────┼────────────┼────────────┼──┼─────┼────────┼────┼──────┼────┤ │
│ │  1   │ COL_ID     │ COL_NM     │☐ │[IN▼]│ [N ▼]  │[..▼]│##,##9│##,9│ │ ← body (편집)
│ │  2   │ ...        │ ...        │☐ │[OUT]│ [Y ▼]  │ ... │ ...  │... │ │
│ └──────┴────────────┴────────────┴──┴─────┴────────┴────┴──────┴────┘ │
└────────────────────────────────────────────────────────────────────┘
```

---

## 3. 영역별 배치 상세

### 3.1 영역 크기 및 배치

| 영역 | 높이 | 너비 | 스크롤 | 리사이즈 | 비고 |
|---|---|---|---|---|---|
| A-FILTER | 고정 (43px) | 100% | 없음 | N | 업무기준 ID/명 read-only |
| A-GRID | 가변 | 100% | 세로 | N | 편집 그리드 (selecttype=multiarea) |
| A-BTN | 고정 | 100% | 없음 | N | 등록/닫기 (PageLayout.buttons) |

### 3.2 A-FILTER 내부 배치

```
[업무기준]  [____RULE_ID (readonly, W80)____]   [업무기준명]  [______RULE_NM (readonly, W300)______]
  S-001            S-002                            S-003               S-004
```

### 3.3 MAIN 내부 배치

```
┌─ ContentPanel (AgDataGrid — 컬럼 리스트, 인라인 편집) ──────────────┐
│  순번(int) │ 영문항목명(text,30) │ 한글항목명(text,100)              │
│  선택(checkbox) │ IN/OUT(combo ds_inOut, 헤더 일괄적용)             │
│  코드여부(combo ds_div) │ 유형(combo ds_colType)                    │
│  총길이(mask ##,##9) │ 소수점길이(mask ##,##9)                       │
└────────────────────────────────────────────────────────────────────┘
```

---

## 4. 그리드 컬럼 디자인

> 기능설계서 §3.2 그대로 인용.

> **표기 원칙**: `DB 컬럼명` = SNAKE_CASE / `화면 표시명` = 한글 라벨

| DB 컬럼명 | 화면 표시명 | 정렬 | 표시 형식 | 비고 |
|---|---|---|---|---|
| (UI 자동) | 순번 | Center | int(5) | currow+1 |
| COL_ID | 영문항목명 | Left | varchar(30) | 인라인 편집 (text, maxlen 30) |
| COL_NM | 한글항목명 | Left | varchar(100) | 인라인 편집 (text, maxlen 100) |
| CHK | 선택 | Center | bit(1/0) | checkbox (일괄 IN/OUT 대상) |
| IO_FLAG | (IN/OUT) | Center | varchar(3) | combo ds_inOut (헤더 일괄 적용) |
| MASTER_CODE_DIV | 코드여부 | Center | varchar(1) | combo ds_div (N/Y) |
| COL_TYPE | 유형 | Center | varchar(20) | combo ds_colType (DATE/NUMBER/VARCHAR2) |
| COL_LEN | 총길이 | Right | int(5) | mask ##,##9 (maxlen 5) |
| COL_PREC_LEN | 소수점길이 | Right | int(5) | mask ##,##9 (maxlen 5) |

### 4.2 코드값 표시 변환

> 기능설계서 §3.3 인용.

| DB 컬럼 | 코드 마스터 | 변환 예 |
|---|---|---|
| IO_FLAG | ds_inOut | (공백)→선택 / IN→IN / OUT→OUT |
| MASTER_CODE_DIV | ds_div | N→N / Y→Y |
| COL_TYPE | ds_colType | DATE / NUMBER / VARCHAR2 |

### 4.3 그리드 행 조건별 표시

| 조건 | 표시 방식 | 비고 |
|---|---|---|
| CHK=1 (선택) 행 | 헤더 IN/OUT 콤보 선택 시 일괄 IO_FLAG 적용 | E-001 (기능 §5.2) |

---

## 5. 컴포넌트 구조

```
MasterRuleFrameColListPopupPage             ← m-mcm/src/cmb/masterRuleFrameColListPopup/MasterRuleFrameColListPopupPage.tsx
├── Modal                                   ← @dk-oasis/shared/modal: Modal
│   └── PageLayout                          ← @dk-oasis/shared/layout: PageLayout
│       ├── title="업무기준 컬럼 등록"       (prop)
│       ├── buttons=[등록, 닫기]            ← @dk-oasis/shared/form: Button
│       ├── SearchArea (A-FILTER)           ← @dk-oasis/shared/layout: SearchArea
│       │   ├── SearchField (S-002 업무기준 ID, readonly)  ← @dk-oasis/shared/layout: SearchField
│       │   └── SearchField (S-004 업무기준명, readonly)
│       └── ContentBody (MAIN)              ← @dk-oasis/shared/layout: ContentBody
│           └── ContentPanel                ← @dk-oasis/shared/layout: ContentPanel
│               └── AgDataGrid              ← @dk-oasis/shared/grid: AgDataGrid (인라인 편집)
```

> **(MUST)**: 03 §A.9-3 의 심볼만 사용.

---

## 6. 팝업/다이얼로그

> 기능설계서 §9 인용. 본 화면 자체가 팝업.

| 팝업ID | 팝업명 | 트리거 | 크기 | 내용 | 반환값 |
|---|---|---|---|---|---|
| P-001 | 업무기준 컬럼 등록 (본 화면) | 부모 btn_ruleCol | 1260×630 (As-Is) | 컬럼 리스트 편집 그리드 | 없음 (부모 콜백 = fn_search) |

---

## 7. 빈 상태 / 로딩 / 에러 표시

| 상황 | 표시 위치 | 표시 방식 | 구현 |
|---|---|---|---|
| 그리드 데이터 없음 | ContentPanel 중앙 | 아이콘 + "조회 결과가 없습니다" | `AgDataGrid` 기본 empty state |
| 그리드 로딩 중 | ContentPanel | 스피너 오버레이 | `Spinner` 또는 `AgDataGrid` loading prop |
| 저장 중 | 버튼 영역 | 버튼 비활성 + 스피너 | `useApiCall` loading 상태 |
| API 에러 | 토스트 | `useGfnMessage` 토스트 (1회만) | `useApiCall` 자동 처리 |
| 필드 유효성 에러 (V-001~007) | 해당 행/셀 | 에러 메시지 + 셀 포커스 이동 | `useFormValidation` |
| 저장 확인 (XV-001) | 모달 | "기존에 있던 컬럼정보들은 모두 삭제됩니다. 저장하시겠습니까?" | `MessageModal` confirm |
| 치명적 에러 | 전체 | `ErrorModal` | `@dk-oasis/shared/layout: ErrorModal` |

---

## 8. 반응형 규칙

| 브레이크포인트 | A-FILTER | MAIN 영역 | 비고 |
|---|---|---|---|
| 기본 (대형) | 1행 나열 | 단일 그리드 |  |
| 중형 | 1행 | 단일 그리드 |  |
| 소형 | - | - | MES 화면 모바일 미지원 |

---

## 9. 아이콘

| 용도 | ICONS 상수명 | 출처 (SVG path 원본) | 비고 |
|---|---|---|---|
| 저장(등록) | `ICONS.save` | Heroicons outline · floppy-disk | 디스크 (B-001) |
| 닫기 | `ICONS.close` | Heroicons outline · x-mark | X (B-002) |
| 접기/펴기 | `ICONS.chevronUp` / `ICONS.chevronDown` | Heroicons outline · chevron | ▲▼ (B-003) |

---

## 10. 스크린샷 / 와이어프레임 참조

해당 없음 — §2.2 와이어프레임이 기준 (00 §3.3 캡처 미제공 정책).

| 화면 영역 | 캡처 경로 / 링크 | 출처 (As-Is / Figma / 운영) | 비고 |
|---|---|---|---|
| (해당 없음) | - | - | §2.2 ASCII 기준 |
