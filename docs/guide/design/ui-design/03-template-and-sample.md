# Part B. 스펙 템플릿 (templates 정본 참조)

> 상위 문서: [{CLIENT} MES 디자인설계 표준 가이드](../03_화면_디자인설계_가이드.md)


> **(MUST)** 디자인설계서 산출물의 양식 정본은 [`templates/디자인설계서.template.md`](../templates/디자인설계서.template.md) 이다 (단일 정본 — 본 가이드 본문에 양식 중복 금지). Agent 는 `{화면식별자}_디자인설계서.md` 를 작성할 때 본 정본 템플릿을 복사하여 frontmatter 6 필드를 채우고, 기능설계서 §3.2 (그리드 컬럼) / §9 (팝업) 등을 인용한다 (재카운트 금지).

> 절 순서 / 표 헤더 / "해당 없음" 유지 / frontmatter 6 필드 변경 금지 (MUST). ASCII 구조도 (§2.2 / §3.2 / §3.3 / §5 컴포넌트 트리) 외 자유 단락 / 임의 산문 금지.

> 그리드 X축 식별자 (G-NNN) 는 기능설계서가 정의한 값을 그대로 사용 (디자인설계서에서 신규 부여 금지 — 정합체크서 §C ✗). 정본은 01 A.4.8 참조.

---


# Part C. Quick Sample — 주문등록 (orderRegistration)

## C.0. 시나리오
- **주문등록 (orderRegistration)** — 좌우 분할형 + 마스터-디테일 (FE 페이지 유형 **C** + **D** 혼합). MES 명명 룰 (02 §A.2-1): `screenId = pageId = serviceId = orderRegistration` 단일 토큰.

## C.1. 결정 사항

### C.1-1. UI 디자인
| 항목 | 값 |
|---|---|
| 화면 식별자 (`screenId = pageId = serviceId`) | `orderRegistration` |
| 레이아웃 유형 | 좌우 분할형 |
| 참조 화면 | `orderSearch` [확인필요] |

### C.1-2. Frontend 연계 값 (MES)
| 항목 | 값 |
|---|---|
| mesModule | `m-mls` |
| moduleGroup | `order` |
| **screenId / pageId / serviceId** | `orderRegistration` (단일 camelCase 토큰) |
| 페이지 유형 | **C** (조회+저장) + 상태 워크플로우 혼합 |
| Frontend 파일 | `m-mls/pages/order/orderRegistration.tsx` |
| tsup entry key | `pages/order/orderRegistration` |

## C.2. §2.2 메인 영역 구조도

```
┌──────────────────────────────────────────────────────┐
│ A-FILTER                                          [⚙] │
│ [주문일자 From] ~ [To]  [고객사 ▼]  [상태 ▼]  [주문번호]│
│                                      [조회] [초기화]   │
├─────────────────────────┬────────────────────────────┤
│ MAIN-LEFT (55%)         │ MAIN-RIGHT (45%)           │
│ 주문 목록 그리드          │ 헤더 폼 (D-001~D-007)        │
│                         │ 품목 라인 서브그리드          │
│                         │ (L-001~L-006)              │
│                         │ [신/저/삭/확/취]             │
├─────────────────────────┴────────────────────────────┤
│ FOOTER                                   [엑셀]       │
└──────────────────────────────────────────────────────┘
```

> A-FILTER 오른쪽 위 `[⚙]` 는 「조회 기본값」 설정 아이콘이다. `SearchArea` 가 조건 칸 뒤에 자동으로 그리므로 구조도에는 위치만 표기하고 별도 컴포넌트로 설계하지 않는다. 날짜 기간은 `[주문일자 From] ~ [To]` 처럼 날짜 칸 두 칸 사이에 `~` 를 두어 표기한다.

## C.3. §4 그리드 컬럼 (기능설계서 §3.2와 일치)

| DB 컬럼명 | 화면 표시명 | 정렬 | 표시 형식 | 비고 |
|---|---|---|---|---|
| - | No | Center | 숫자 | 자동 순번 |
| ORDER_NO | 주문번호 | Left | 텍스트(링크) | 클릭 시 상세 표시 |
| CUSTOMER_NAME | 고객사 | Left | 텍스트 | |
| ORDER_DATE | 주문일자 | Center | YYYY-MM-DD | |
| DUE_DATE | 납기일 | Center | YYYY-MM-DD | |
| ORDER_STATUS | 상태 | Center | 뱃지 | 코드→명칭 변환 (§4.2) |
| TOTAL_AMOUNT | 총금액 | Right | #,### | |

## C.4. §4.2 코드값 변환
| ORDER_STATUS | CODE_ORDER_STATUS | WAIT→대기, CONF→확정, PROC→진행, DONE→완료, CANCEL→취소 |
| ORDER_TYPE | CODE_ORDER_TYPE | MTO→주문생산, MTS→재고생산 |

## C.5. §4.3 행 조건별 표시
| ORDER_STATUS='DONE' | 텍스트 연하게 |
| ORDER_STATUS='CANCEL' | 텍스트 취소선 + 연하게 |
| PRIORITY='HIGH' | 좌측 강조 바 |

## C.6. §5 컴포넌트 구조

```
OrderRegistrationPage                   ← m-mls/src/order/orderRegistration/OrderRegistrationPage.tsx
├── PageLayout                             ← @dk-oasis/shared/layout: PageLayout
│   ├── title="주문등록"                    (prop)
│   ├── buttons=[조회, 초기화, 신규, 저장, 삭제, 확정, 취소, 엑셀]
│   │                                      ← @dk-oasis/shared/form: Button
│   ├── SearchArea (A-FILTER)              ← @dk-oasis/shared/layout: SearchArea
│   │   ├── SearchField (S-001, S-002) 주문일자 From/To   ← 기간: type="date" 두 칸(label="~"), DatePicker 는 내장이라 별도 노드 없음
│   │   ├── SearchField (S-003) 고객사
│   │   │   └── ComboBox                   ← @dk-oasis/shared/form: ComboBox
│   │   ├── SearchField (S-004) 상태
│   │   │   └── ComboBox                   ← @dk-oasis/shared/form: ComboBox
│   │   └── SearchField (S-005) 주문번호
│   │       └── Input                      ← @dk-oasis/shared/form: Input
│   └── ContentBody (MAIN)                 ← @dk-oasis/shared/layout: ContentBody
│       ├── ContentPanel (MAIN-LEFT 55%)   ← @dk-oasis/shared/layout: ContentPanel
│       │   └── AgDataGrid (주문 목록)       ← @dk-oasis/shared/grid: AgDataGrid
│       └── ContentPanel (MAIN-RIGHT 45%)  ← @dk-oasis/shared/layout: ContentPanel
│           ├── FormGroup (D-001~D-007)    ← @dk-oasis/shared/form: FormGroup
│           │   └── Input / DatePicker / ComboBox / Textarea
│           │                              ← @dk-oasis/shared/form
│           └── AgDataGrid (L-001~L-006, 편집 가능)
│                                          ← @dk-oasis/shared/grid: AgDataGrid
│                                            + useGridDataManager
└── (팝업)
    ├── P-001 고객사 검색 Modal             ← @dk-oasis/shared/modal: Modal
    ├── P-002 품목 검색 Modal               ← @dk-oasis/shared/modal: Modal
    └── P-003~P-005 확인 Modal              ← @dk-oasis/shared/modal: MessageModal

Hook:
- useGridDataManager (품목 라인 행 상태 관리)   ← @dk-oasis/shared/grid
- useApiCall (조회/저장/확정/취소 호출)         ← @dk-oasis/shared/use-api-call
- useGfnMessage (성공/실패 토스트)              ← @dk-oasis/shared/message-provider
- useFormValidation (V-NNN / XV-NNN 검증)       ← @dk-oasis/shared/use-form-validation
```

## C.7. §6 팝업
| P-001 | 고객사 검색 | CUSTOMER_CODE 필드 검색 아이콘 | → CUSTOMER_CODE, CUSTOMER_NAME |
| P-002 | 품목 검색 | PRODUCT_CODE 필드 검색 아이콘 | → PRODUCT_CODE, PRODUCT_NAME, UNIT_PRICE |
| P-003 | 삭제 확인 | [삭제] 클릭 | "주문 {ORDER_NO}을(를) 삭제하시겠습니까?" |
| P-004 | 확정 확인 | [확정] 클릭 | "주문을 확정하시겠습니까?..." |
| P-005 | 취소 사유 입력 | [취소] 클릭 | 취소 사유 텍스트 |

## C.8. §9 아이콘

| 용도 | ICONS 상수 | 출처 (SVG path) |
|---|---|---|
| 조회 | `ICONS.search` | Heroicons outline · magnifying-glass |
| 초기화 | `ICONS.reset` | Heroicons outline · arrow-path |
| 신규 | `ICONS.plus` | Heroicons outline · plus |
| 저장 | `ICONS.save` | Heroicons outline · floppy-disk |
| 삭제 | `ICONS.trash` | Heroicons outline · trash |
| 확정 | `ICONS.checkCircle` | Heroicons outline · check-circle |
| 취소 | `ICONS.xCircle` | Heroicons outline · x-circle |
| 엑셀 | `ICONS.download` | Heroicons outline · arrow-down-tray |

> 구현: `src/order/orderRegistration/icons.ts` 에 path 문자열 상수 정의 + 로컬 `Icon({ path })` 래퍼로 렌더. 외부 아이콘 라이브러리 미사용.
