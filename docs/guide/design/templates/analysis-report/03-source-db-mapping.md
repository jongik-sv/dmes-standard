## 5. As-Is 소스 로직 분석 (R-12 Tier 5 — 표 컬럼 분해, 자유 비고 ✗)

<!--
  자유 서술 ✗ — 모든 정보를 7 컬럼 표로 분해.
  외부 호출 깊이 D1~D5 (R-12 Tier 2):
  - D1 본 화면 (cs / designer.cs) — 강제 전수
  - D2 직접 호출 SP (procedures/{SP}.sql) — 강제 전수
  - D3 의존 SP / 함수 / 트리거 (D2 가 호출하는) — 강제 전수
  - D4 외부 SP (D3 가 호출) — 추적 + Q-NNN (본 분석 범위 외)
  - D5 외부 화면 (다른 폼) — §11.3 L4 자연 제외
-->

| # | 깊이 (D1~D5) | 소스 파일 | 클래스/폼 | 이벤트/메서드 | 트리거 | 호출 SP / 함수 / 트리거 | 검증 (V-NNN) | 부수효과 |
|---:|---|---|---|---|---|---|---|---|
| <!-- 예시 (workReport) --> |
| 1 | D1 | PGA020K.cs | PGA020K | OnSearch | B-001 조회 | soPGA020 sList | V-001 | grid1.LoadData |
| 2 | D2 | soPGA020.sql | sList | (SP 분기) | OnSearch 호출 | dbo.fnGetWorkType | - | - |
| 3 | D3 | dbo.fnGetWorkType | (함수) | - | sList 호출 | (없음) | - | - |
| <!-- 본 화면 --> |

### 5.1 이벤트 핸들러 12종 추적 매트릭스 (R-12 Tier 2)

<!--
  12 이벤트 전수 grep. 미발견은 "0 / 미발견" 명시 (행 삭제 ✗).
  이벤트 enum: Click / DoubleClick / CellClick / CellDoubleClick / SelectionChanged / ValueChanged / KeyDown / Validating / Leave / Enter / TextChanged / MouseDown
-->

| 이벤트 | 발견 수 | 미발견 (Y/N) | 미사용 (메서드 + += 없음 → L3) | 매핑 ID (B / GB / S 흡수 등) |
|---|---:|---|---:|---|
| Click | 0 |  | 0 |  |
| DoubleClick | 0 |  | 0 |  |
| CellClick | 0 |  | 0 |  |
| CellDoubleClick | 0 |  | 0 |  |
| SelectionChanged | 0 |  | 0 |  |
| ValueChanged | 0 |  | 0 |  |
| KeyDown | 0 |  | 0 |  |
| Validating | 0 |  | 0 |  |
| Leave | 0 |  | 0 |  |
| Enter | 0 |  | 0 |  |
| TextChanged | 0 |  | 0 |  |
| MouseDown | 0 |  | 0 |  |

### 5.2 SP 분기 추적 매트릭스 (R-12 Tier 2 — 표 컬럼 분해, 자유 설명 ✗)

<!--
  본 SP 의 모든 @Case 분기 전수 + 표 컬럼 분해.
  표준 9 분기 (다른 SP 면 발견된 분기 그대로 등재):
  sList / sList2 / sJobInfo / sHoldInfo / sDasSearch / cDate / sDate / uMachWorked / ResultsCancelCheck
-->

| @Case 분기 | 매개변수 | 반환 row 수 (단일/다중/UPDATE) | parent FK | ORDER BY / LIMIT | 분류 (G/GE/D/L/제외) | 본 화면 호출 (Y/N) | 비고 |
|---|---|---|---|---|---|---|---|

## 6. As-Is DB/SQL 분석

### 6.1 테이블/뷰 분석

| # | 구분 | 이름 | 주요 컬럼 | 키/관계 | 조회/저장 관련성 | To-Be 대응 |
|---:|---|---|---|---|---|---|

### 6.2 프로시저/함수/트리거 분석 (R-12 Tier 5 — 표 컬럼 분해)

<!--
  자유 본문 설명 ✗ — 표 컬럼 분해.
  추적 깊이: D2 (직접 호출 SP) + D3 (의존 SP / 함수). D4+ 는 §11.3 L4 자연 제외.
-->

| # | 깊이 (D2/D3) | 구분 (SP/함수/트리거) | 이름 | 호출 주체 | 매개변수 | 반환 row | 변경 테이블 | 부수효과 (있음/없음) |
|---:|---|---|---|---|---|---|---|---|

## 7. To-Be 테이블/Entity 분석

| # | To-Be 테이블/Entity | 컬럼명 | 타입 | As-Is 대응 | 기 구축 컬럼 재사용 (Y/N) | 채택 여부 (Y/N) |
|---:|---|---|---|---|---|---|

## 8. As-Is ↔ To-Be 매핑 분석

| # | 화면 요소 | As-Is 출처 | As-Is 컬럼/값 | To-Be 테이블.컬럼 | 변환 규칙 | 설계 반영 위치 | 상태 (open/resolved) |
|---:|---|---|---|---|---|---|---|

## 9. 상태/코드/LoV 분석

### 9.1 상태값 매핑 (statusCodes 통합 — ST-NNN)

<!--
  추출 알고리즘 (00 §6.4.6 + §6.4.6-1 산식 본문 직접 박힘):
  ST-NNN 수 = (workType enum 값 수)
            + (표시 영향 플래그 컬럼 수)        ← INSP_FLG / INSIDE_FLG / YYNN / idx_YN / BYPASS_YN 컬럼별 1행
            + (진행·승인·마감·취소 enum 값 수)   ← 값별 1행
            + (sList where 분기 enum 컬럼 수)   ← DateType A/B/C 등 컬럼 = 1행 통합 (값별 분리 ✗)

  포함:
  - workType enum 값별 1 행 (W/S/SH/WH/R = 5행) — enum 1행 통합 ✗ (R10-6)
  - 표시 영향 플래그 컬럼별 1 행
  - 진행·승인·마감·취소 enum 값별 1 행
  - sList where 분기 enum 컬럼 = 1 행 통합

  제외:
  - 검색조건 CheckBox / ComboBox (S-NNN 으로만)
  - LoV 코드 마스터 enum 값 (LV-NNN 으로만, 코드 그룹 1 행)
  - 서버 내부 분기 (화면 표시 영향 없음)

  매핑 사례 (Tier 6 — workReport 9 행):
  1. WORK_TYPE='W' → ST-001 workResults
  2. WORK_TYPE='S' → ST-002 setup
  3. WORK_TYPE='SH' → ST-003 setupHold
  4. WORK_TYPE='WH' → ST-004 workHold
  5. WORK_TYPE='R' → ST-005 rework
  6. INSP_FLG (Y/N) → ST-006 inspectionFlag (컬럼 1행)
  7. INSIDE_FLG (Y/N) → ST-007 insideFlag
  8. YYNN ("점검"/"정상") → ST-008 inspectionTarget
  9. DateType (A/B/C) → ST-009 dateType (검색조건 enum 컬럼 통합 1행)
-->

| ID (ST-NNN) | As-Is 상태값 | As-Is 의미 | To-Be 상태코드 | 단순 표시값/동작 제어값 | 전이 조건 | 영향 영역 (조회·그리드·버튼·전이) | 근거 |
|---|---|---|---|---|---|---|---|

### 9.2 코드값/LoV 매핑 (LV-NNN)

<!--
  추출 알고리즘 (00 §6.4.6-2 — 5 단계):
  1. 입력: NewCodeQuery / GeneralDialog / 회사 종속 LoV / SP 자체 enum
  2. 카운트: 코드 그룹 ID 별 1 행 (enum 값 분리 ✗)
  3. 일련번호: LV-001~
  4. 본 화면 vs 의존 SP 범위 (R-11): **본 화면 직접 호출만** LV-NNN. 의존 SP 내부 LoV = 제외 + §11.3 자연제외
  5. 포함 후보 enum: (a) 조회조건 ComboBox/Lookup → 포함 / (b) 그리드 표시 변환 → 포함 / (c) 본 화면 팝업 → 포함 / (d) API 응답 변환 → 포함 / (e) 의존 SP / 외부 SP / 외부 팝업 → 제외 + §11.3 / (f) 코드 그룹 중복 → 1 행
-->

| ID (LV-NNN) | 코드 그룹 | As-Is 값 | As-Is 표시명 | To-Be 코드 | 사용 위치 (S-NNN / G-NNN / P-NNN) | 근거 |
|---|---|---|---|---|---|---|
