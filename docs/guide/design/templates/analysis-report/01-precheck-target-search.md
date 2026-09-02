## 0. 사전 판정표 (분석 시작 전 작성 강제 — R11-G1 / R-12 Tier 2)

> **(MUST)** §4 본 표 작성 **전** 본 §0 의 5 판정표를 모두 작성한다. 미작성 시 정합체크서 §A.A-R12-1 ✗ → 설계 미완성.
> 작성 순서: §0.1 → §0.2 → §0.3 → §0.4 → §0.5 (선후행 의존성 있음).

### 0.1 자연 제외 5 단계 판정표 (L1~L5)

> **(MUST — R-14)** 본 표는 manifest `classify.trace.json` 의 `items[classification IN ('L1','L2','L3','L4','L5')]` 인용으로만 작성. Agent 자체 designer.cs / cs / sp.sql grep ✗ (00 §6.4-R13.0-R14 Step 13~18 / §5.1 / §5.2 / §7 / §8 / §13 / §14 grep 금지 영역).

<!--
  manifest 정본 위치: `docs/{moduleId}/manifest/{targetKey}/classify.trace.json`
  - L1 = items[stepNo=6, classification='L1']  : Runner Step 6 결과
  - L2 = items[stepNo=7, classification='L2']  : Runner Step 7 결과
  - L3 = (Runner v3 보강 후보)
  - L4 = items[stepNo=9, classification='L4']  : Runner Step 9 결과 (OpenForm/CreateDialog/ShowDialog/NewCodeQuery/GeneralDialog 6 패턴)
  - L5 = (자동생성 컬럼 — Runner v3 보강 후보)
-->

| 우선순위 | 원천 | 컨트롤/요소명 | 사유 (L1~L5 enum) | Q-NNN | 근거 (파일:line) |
|---|---|---|---|---|---|
| <!-- 예시 (orderRegistration) --> |
| L1 | designer.cs | btnHidden | Visible=false | - | OrderRegistration.designer.cs:142 |
| L3 | designer.cs+cs | btnLegacy | 메서드 존재 + += 미발견 | Q-007 | OrderRegistration.cs (= 미발견) |
| <!-- 본 화면 (분석 대상) --> |

### 0.2 S-NNN 좌표 정렬 표

<!--
  알고리즘 (00 §6.4.1 단계 6 — R-11 강화):
  4 단계 lexicographic 정렬:
  (1) Y 좌표 오름차순 (위→아래) — designer.cs `Location.Y`
  (2) Y 좌표 동일 (오차 ±5px) → X 좌표 오름차순 (좌→우)
  (3) X 좌표 동일 → 컨트롤명 알파벳 오름차순
  (4) 알파벳 동일 → designer.cs 선언 줄번호 오름차순
  Lookup 묶음 (T1-B): `txt{X}Cd + btn{X} + txt{X}Nm` 의 정렬 좌표 = `txt{X}Cd` 의 Location.
-->

| 정렬순 | 컨트롤명 | Y | X | 알파벳 | 선언줄 | S-NNN |
|---:|---|---:|---:|---|---:|---|
| <!-- 예시 (orderRegistration) --> |
| 1 | dtpOrderFr | 30 | 100 | dtpOrderFr | 45 | S-001 |
| 2 | dtpOrderTo | 30 | 250 | dtpOrderTo | 46 | S-002 |
| <!-- 본 화면 --> |

### 0.3 G-NNN / GE-NNN 분기 분류표

<!--
  알고리즘 (00 §6.4.3-1 — T1-C 정밀화):
  3 우선순위:
  1순위 L 후보: parent FK 컬럼 SELECT/WHERE 존재 + 다중 row → L-NNN
  2순위 D 후보: PK 단일 row 반환 (WHERE PK 등치 비교) → D-NNN
  3순위 GE 후보: 위 둘 ✗ + 다중 row → GE-NNN
  매핑 사례 (Tier 6):
  - sList SELECT (메인) → G
  - sList2 / sSubList (확장 다중) → GE
  - sHoldInfo WHERE WO_NO=@WoNo (단일 row) → D
  - sDasSearch WHERE PARENT_ID=@PID ORDER BY (parent FK 다중) → L
-->

| @Case | parent FK | PK 단일 | 다중 row | ORDER BY | 분류 (G/GE/D/L) |
|---|---|---|---|---|---|
| <!-- 예시 (workReport) --> |
| sList | N | N | Y | Y | G |
| sList2 | N | N | Y | Y | GE |
| sHoldInfo | N | Y | N | N | D |
| sDasSearch | Y (PARENT_ID) | N | Y | Y | L |
| <!-- 본 화면 --> |

### 0.4 B-NNN / GB-NNN 분류표 (4 enum)

<!--
  알고리즘 (00 §6.4.4 단계 11 — R-11 강화):
  4 enum 분류 (위치 + 핸들러 본문 결합):
  - grpsearch 내부 + Dialog 호출만 → S 흡수 (B 카운트 ✗)
  - 그리드 셀 (ButtonField / OnGridButtonClicked / CellClick) → GB-NNN
  - 표준 toolbar (PageLayout.buttons / FormWith1Grid base 4: 조회·신규·저장·초기화) → B-NNN 포함
  - 일반 Button / 추가 ToolStrip → B-NNN 포함
  매핑 사례 (Tier 6):
  - btnSearch + toolbar + OnSearch() → B
  - btnLookupCust + grpsearch + Dialog.Show() → S 흡수
  - btnGridDelete + 그리드 ButtonField + OnGridButtonClicked → GB
  - btnDelResults + ToolStripButton 추가 + 데이터 액션 → B
  - btnRes + grpsearch + Lookup + 일괄변경 (T1-F 다중 핸들러) → S Lookup + B 일괄변경 (2 행)
-->

| 컨트롤명 | 위치 (grpsearch / toolbar / 본체 / 그리드셀) | 핸들러 본문 (Dialog만 / 데이터 액션) | 분류 (S 흡수 / B / GB) |
|---|---|---|---|
| <!-- 예시 (orderRegistration) --> |
| btnSearch | toolbar | OnSearch() | B |
| btnLookupCust | grpsearch | Dialog.Show() | S 흡수 |
| btnGridDelete | 그리드셀 | OnGridButtonClicked | GB |
| <!-- 본 화면 --> |

### 0.5 P-NNN 후보 판정표 (4 enum)

<!--
  알고리즘 (00 §6.4.5 단계 8):
  4 enum 분류:
  - 직접 호출 (Button/Toolbar/GridCell 이벤트에서 OpenForm/Dialog/CreateDialog 호출) → P-NNN 포함
  - 호출 함수 미발견 → 본 P-NNN 제외 + Q-NNN
  - 외부 화면만 호출 → 본 P-NNN 제외 + §11.3 자연 제외
  - 주석 처리 → 제외
  매핑 사례 (Tier 6):
  - OpenForm("PGA020K_HoldInfo") + btnHold_Click → P-001 직접
  - new PGA020K_DASSearch (호출 라인 grep 미발견) → 제외 + Q-NNN
  - PGA020K_JobDetail (다른 화면에서만 호출) → §11.3 L4 자연제외
  - // OpenForm(...) (주석) → L2 제외
-->

| 호출 패턴 | 호출 위치 (파일:line) | 분류 (직접/Q/외부/주석) | P-NNN 또는 자연제외 |
|---|---|---|---|
| <!-- 예시 (inspectionRequest) --> |
| OpenForm("PGA020K_HoldInfo") | btnHold_Click:142 | 직접 | P-001 |
| new PGA020K_DASSearch | (호출 라인 미발견) | Q-NNN | 제외 + Q-008 |
| <!-- 본 화면 --> |

---

## 1. 분석 대상

<!--
  명명 룰 (사용자 결정 사항):
  - **MES (mls / mqc / mpp 등 표준 MES 모듈)**: 화면식별자 = pageId = serviceId = pageName = `{화면명}` camelCase. 4 식별자 모두 1byte 동일.
    - 예: `plateSlittingMgmt`, `inspectionRequest`, `workReport`
    - Frontend 파일명 = `{screenId}.tsx` (예: `plateSlittingMgmt.tsx`)
  - **APS 예외 (mpn 한정)**: pageName = kebab-case, Frontend 파일명 = `{pageName}-page.tsx`
  - 본 §1 표의 4 식별자 값은 위 룰에 따라 결정. 정합체크서 §B 가 검증.
-->

| 항목 | 값 |
|---|---|
| 화면명 |  |
| 화면 식별자 (screenId) |  |
| As-Is 식별자 (asIsId) |  |
| moduleId |  |
| moduleGroup |  |
| 적용 명명 룰 (`MES 단일 룰` / `APS 예외 (mpn)`) |  |
| pageName (MES: = screenId / APS-mpn: kebab) |  |
| pageId (MES: = screenId / APS-mpn: `portal:{moduleGroup}/{pageName}`) |  |
| serviceId (= screenId, MES/APS 공통) |  |
| Frontend 파일명 (MES: `{screenId}.tsx` / APS-mpn: `{pageName}-page.tsx`) |  |
| 분석 일자 |  |

**화면 목적** (R-12 Tier 5 — **패턴 1 enum 강제**):

<!--
  패턴: `{화면명}은 {As-Is 코드}의 {업무 enum}을 수행한다.`
  업무 enum 7값 (다중 시 `,` 구분): 조회 / 등록 / 수정 / 삭제 / 상태변경 / 통계 / 출력
  패턴 외 ✗ (P-NNN 연동 / 권한 / 통계 세부 / 타 화면 참조 명시 금지).
  예시:
  - "장비정보조회는 PJA005K의 조회를 수행한다." (단일 업무)
  - "주문등록은 ORD001K의 등록, 수정, 삭제를 수행한다." (다중 업무)
-->

> {화면명}은 {As-Is 코드}의 {업무 enum}을 수행한다.

## 2. 자료 수집 인벤토리 (R-12 Tier 2 — 5 enum 사전 박힘)

<!--
  외부 자료 5 enum 사전 박힘. 분석가는 "확인 여부 / 활용 결과" 컬럼만 채움.
  추가 자료 발견 시 6번 이후 행에 append.
-->

| # | 자료 구분 | 경로/파일 | 확인 여부 (Y/N) | 분석에 사용한 내용 | 미확인 시 영향 |
|---:|---|---|---|---|---|
| 1 | DDL extended property (As-Is 컬럼 한글 의미) | docs/external/ksmerpk/db/{table}.sql |  |  | G-NNN 화면 표시명 폴백 5 미충족 → Q-NNN |
| 2 | resx PropBag (As-Is 라벨 다국어) | docs/external/ksmerpk/resx/{form}.ko.resx |  |  | S-NNN 화면 표시명 폴백 4 미충족 |
| 3 | 운영 화면 캡처 | docs/캡처/{화면}.png |  |  | §10 와이어프레임 미참조 |
| 4 | 매핑 문서 (As-Is ↔ To-Be) | docs/매핑/{화면}.xlsx |  |  | §8 매핑 분석 정합 ✗ |
| 5 | Entity 구조 (To-Be 테이블) | backend-v2/entity/{table}.entity.ts |  |  | §7 To-Be 테이블 분석 Q-NNN |

## 3. 검색/탐색 기준

| 구분 | 사용한 키워드/기준 | 결과 요약 |
|---|---|---|
| As-Is 화면 | `{As-Is 코드}` grep | (cs / designer.cs 파일 위치) |
| 컨트롤 선언 | `designer.cs` 의 `Controls.Add` | (컨트롤 수) |
| 이벤트 핸들러 | `cs` 의 `+= new EventHandler` / `+= new EventArgs` | (등록 핸들러 목록) |
| SP 분기 | `procedures/{SP}.sql` 의 `@Case=` | (분기 수) |
| LoV 호출 | `NewCodeQuery / GeneralDialog` | (코드 그룹 ID) |
