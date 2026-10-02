---
screenId: unitMng
asIsId: 해당 없음 (As-Is 레거시 없음 — 02 설계 문서 기반 신규 화면)
moduleId: mdm
moduleGroup: dma
작성일: 2026-09-24
작성자: Agent
---

# mdm — 단위 마스터 기능설계서

> **인용 정본 예외 (DEC-001 선례 준용, TSK-04-02 design.md 담당자 확인 필요 결정 D14)**: `Mes-Guide.md` §4
> 의 5종 설계 산출물 게이트는 As-Is → To-Be 마이그레이션을 전제하는데, 본 화면은 **As-Is 레거시가 없는
> 신규 화면**이라 분석리포트(§1~§17)가 존재하지 않고 G1~G7 게이트도 성립하지 않는다. `docs/ai-build-log/
> DEC-001_noticeMgmt-on-mls.md`(mls `noticeMgmt` 선례)와 같은 사유로, 5종을 **기능설계서 1종**으로
> 축소해 작성한다. 표는 분석리포트 대신 **원천 설계**(`docs/mdm/design/basic/02-term-domain-column.md`,
> 시안 `docs/mdm/design/basic/html/02-term-domain-column.html` "단위 마스터" 탭)와 **선행 Design 산출물**
> (`docs/mdm/tasks/TSK-04-02/design.md`)을 근거로 삼는다 — 각 표에 인용 위치를 붙인다.
>
> **Frontend 개발 연계 값** (§1.2 정본) — mesModule `m-mdm` / moduleGroup `dma` / pageName `unitMng` /
> pageId `unitMng` / 페이지 유형 `B` / tsup entry key `pages/dma/unitMng/page`

## 1. 화면 개요

### 1.1 업무/설계 측면

| 항목 | 내용 |
|---|---|
| 화면명 | 단위 마스터 |
| 화면 식별자 | `unitMng` |
| 모듈 | `mdm`(마루 MDM) / moduleGroup `dma`(용어·도메인) |
| 화면 목적 | 차원·기준 단위·환산 계수(`TB_MDM_UNIT`)를 등록·관리하고, 같은 차원 안에서의 환산값을 미리 계산해 보여준다. |
| 주요 사용자 | 표준 관리자(`MDM_STD_ADMIN`, 등록·수정) / 담당자(`MDM_STEWARD`, 조회·환산 계산기만) |
| 접근 경로 | 포털 → MDM > 용어·도메인 > 단위 마스터 |

근거: `docs/mdm/design/basic/02-term-domain-column.md:169` "역할 경계 … MDM 의 책임은 기준 단위(도메인),
환산 계수(단위 마스터 배포), '저장은 반드시 기준 단위' 규칙 세 가지다", `docs/mdm/tasks/TSK-01-03/design.md`
§2.6(`MdmPermissions.MATRIX` DMA 그룹: `STD_ADMIN→EDIT`, `STEWARD→READ`).

### 1.2 Frontend 개발 연계 값

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId | `mdm` | `docs/mdm/screens/README.md` §2 |
| moduleGroup | `dma` | `docs/mdm/screens/README.md:19-24` (용어·도메인·컬럼·단위) |
| mesModule | `m-mdm` | 01 A.4.5 `m-{moduleId}` |
| 적용 명명 룰 | MES 단일 룰 | mdm 은 MES 모듈(mpn 아님) |
| 화면식별자 (screenId) | `unitMng` | `docs/mdm/screens/README.md:35` (TSK-04-02 등재) |
| pageName / pageId / serviceId | `unitMng` | screenId 동일값(MES 룰) |
| 페이지 유형 | `B`(조회 + 상세) | A-DETAIL 있음, 라인(L) 없음, 확장그리드(GE) 없음 |
| 주요 API path (UI→BFF) | `POST /api/mdm/oasis/unitMng/{action}` | `docs/mdm/TRD.md:38-41`, spec.md API 스펙 |
| 주요 API path (BFF→BE) | `POST /oasis/unitMng/{action}` | 상동 |
| Frontend 파일명 | `m-mdm/pages/dma/unitMng/page.tsx` | `docs/mdm/screens/README.md:73-81` 경로 규약(mdm 실 관례 — `{screenId}.tsx` 단일 파일이 아니라 `pages/{group}/{screenId}/page.tsx`) |
| tsup entry key | `pages/dma/unitMng/page` | `m-mdm/tsup.config.ts` 등록 규칙(TSK-04-02 design.md §2) |
| action 어휘 | `search`/`save`/`delete`/`compare` (13개 고정 어휘 중) | TSK-04-02 design.md I14(`MdmActions`) |
| 메뉴 계층 | 마루 MDM(`mdm`) > 용어·도메인(`dma`) > 단위 마스터(`unitMng`) | `DataInitializer.seedMdmMenus()` 코드 시드(사용자 수동 등록 아님 — mdm 관례, mls `noticeMgmt` 와 다름) |

## 2. 화면 영역 정의

| 영역ID | 영역명 | 설명 |
|---|---|---|
| `A-FILTER` | 조회조건 | 단위 코드·차원으로 목록을 좁힌다 |
| `A-GRID` | 목록 그리드 | 조회 결과 목록. 행 클릭 시 A-DETAIL 에 상세를 표시한다 |
| `A-DETAIL` | 상세 폼(등록/수정) | 단위 코드·차원·기준 단위·환산 계수 입력 영역 |
| `A-PREVIEW` | 환산 계산기 | 값·입력 단위를 받아 같은 차원의 모든 단위로 서버가 계산한 환산값을 목록(AgDataGrid)에 보여준다. 목록에서 행을 고르면 그 단위가 입력 단위가 된다 |
| `A-BTN` | 버튼 | `PageLayout.buttons` 로 주입 |

## 3. 조회조건 정의 (영역: A-FILTER)

근거: `docs/mdm/design/basic/html/02-term-domain-column.html` "단위 마스터" 탭 검색 카드(603-618행,
TSK-02-02 조사 보고 인용) — "검색어(단위 코드)", "차원(전체/질량/길이/시간/개수)".

| 필드ID | DB 컬럼명 (SNAKE_CASE) | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| S-001 | `UNIT_CODE` | 검색어 | TextBox | N | (빈값) | 단위 코드 부분 일치 |
| S-002 | `DIMENSION` | 차원 | ComboBox | N | 전체 | §10 LV-001 인라인 후보 — 코드 마스터 아님(자유 입력 값도 검색 가능, I20) |

### 3.2 조회 결과 (그리드 컬럼)

근거: HTML 시안 단위 목록 카드(620-640행) "단위 코드·차원·기준 단위·환산 계수·읽는 법", TSK-04-02
design.md I3(차원별 기준 단위 공유).

| 컬럼ID | DB 컬럼명 (alias) | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G-001 | `UNIT_CODE` | 단위 코드 | PK. ASCII, 최대 20자(I20) | Left | varchar(20) |
| G-002 | `DIMENSION` | 차원 | ASCII 코드, 화면은 §3.3 라벨맵으로 한글 표시(I20·I21) | Left | varchar(50) |
| G-003 | `BASE_UNIT` | 기준 단위 | 같은 차원의 모든 행이 공유(I3) | Left | varchar(20) |
| G-004 | `FACTOR` | 환산 계수 | 기준 단위 대비 배수(decimal) | Right | decimal(18,9) |
| G-005 | (계산) | 기준 단위 여부 | `UNIT_CODE == BASE_UNIT` 이면 "기준 단위" 배지(클라이언트 계산, 서버 컬럼 아님) | Center | text |

> 확장/서브 그리드: 해당 없음 — 단일 그리드 화면.

### 3.3 코드값 표시 변환

| DB 컬럼 | 코드 마스터 | 변환 예 |
|---|---|---|
| `DIMENSION` | 코드 마스터 아님 — FE 상수 맵 `DIMENSION_LABELS`(TSK-04-02 design.md I21, D11) | `MASS`→질량, `LENGTH`→길이, `SPECIFIC_GRAVITY`→비중, `ENERGY`→에너지 등 등록된 차원 전체(2026-10-02 확장). 맵에 없는 코드는 코드 문자열 그대로 표시 |

## 4. 상세 영역 필드 정의 (영역: A-DETAIL)

근거: HTML 시안 단위 등록 카드(642-666행) "단위 코드 *", "차원 *", "기준 단위 *", "환산 계수 *".

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| D-001 | `UNIT_CODE` | 단위 코드 | TextBox | Y | (빈값) | 등록 후 read-only(PK). ASCII 20자 이내(I20) |
| D-002 | `DIMENSION` | 차원 | ComboBox(자유 입력, `dimensionOptions` 자동완성) | Y | (빈값) | ASCII 50자 이내(I20). 새 차원이면 D-003 은 D-001 과 같은 값으로 고정된다(I3, D2) |
| D-003 | `BASE_UNIT` | 기준 단위 | TextBox(read-only) | Y | (자동) | 서버가 §D2 규칙대로 자동 채움 — 사용자가 직접 입력하지 않는다 |
| D-004 | `FACTOR` | 환산 계수 | TextBox(숫자) | Y | (빈값) | 기준 단위 대비 정확값(decimal). 새 차원 첫 등록이면 반드시 `1`(I3) |

### 4.2 라인 필드 (서브 그리드)

해당 없음 — 본 화면은 라인(서브 그리드) 영역이 없다.

## 5. 버튼 및 기능 동작 정의

### 5.1 버튼 목록

| 버튼ID | 버튼명 | 위치 | To-Be action | 설명 |
|---|---|---|---|---|
| B-001 | 조회 | toolbar | `search` | A-FILTER 조건으로 목록 재조회(응답에 `dimensionOptions` 동봉) |
| B-002 | 단위 등록 | toolbar | (client) | 그리드에 빈 행 추가 + A-DETAIL 초기화. 서버 호출 ✗ |
| B-003 | 저장 | toolbar | `save` | A-DETAIL 값 검증 후 저장, 재조회 |
| B-004 | 삭제 | toolbar | `delete` | 선택 행 삭제(I5 — FK 참조·형제 단위 존재 시 서버가 거부) |
| B-005 | (버튼 없음 — 자동 계산) | A-PREVIEW 내부 | `compare` | 값·입력 단위가 바뀌면 같은 차원 단위마다 환산값 계산 요청(I1·I2) |

### 5.1-1 그리드셀 인라인 버튼 (GB-NNN)

해당 없음.

### 5.2 버튼별 동작 상세

| 버튼ID | 트리거 | 선행 조건 | 동작(단계별) | 호출 액션 |
|---|---|---|---|---|
| B-001 | 클릭 | 없음 | 1) A-FILTER 값 수집 2) `search` 호출 3) 그리드·`dimensionOptions` 바인딩 | `search` |
| B-002 | 클릭 | 없음 | 1) A-DETAIL 초기화 2) D-002 콤보박스에 기존 차원 후보 제공 | (없음) |
| B-003 | 클릭 | §6 검증 통과 | 1) 클라이언트 필수값 확인 2) `save` 호출 3) 응답으로 그리드 재바인딩 | `save` |
| B-004 | 클릭 | 그리드 행 선택 | 1) 확인 모달 2) `delete` 호출 3) 거부 시 오류 메시지, 성공 시 재조회 | `delete` |
| B-005 | 값·입력 단위 변경(300ms 뒤), 목록 행 선택, 결과 행 클릭 | A-PREVIEW 값(십진수, 천 단위 쉼표 허용)·입력 단위 | 1) 같은 차원 단위마다 `compare` 병렬 호출 2) 결과(서버 계산값)를 단위별로 그대로 표시(클라이언트 재계산 없음, I2) 3) 숫자가 아니면 값 칸 아래 안내만 표시(서버 호출 ✗) 4) 서버 거부 시 칸에 "계산 실패" + 오류 메시지 1회 5) 결과 행 클릭 시 그 단위·환산값을 새 입력으로 삼음 | `compare` |

### 5.3 그리드 동작

| 동작 | 설명 |
|---|---|
| 행 클릭 | 선택 행 값을 A-DETAIL 에 바인딩(재조회 없이 그리드 데이터 그대로 사용) |
| 행 더블클릭 | 해당 없음 |
| 헤더 클릭 | 클라이언트 정렬 |
| 페이지 변경 | 해당 없음 — 전건 조회(단위 마스터는 소량 마스터 데이터) |

## 6. 입력값 검증 규칙

### 6.1 필드별 검증

| 규칙ID | 대상 필드 | 검증 내용 | 에러 메시지 |
|---|---|---|---|
| V-001 | `UNIT_CODE`(D-001) | 필수, ASCII `^[A-Za-z0-9_]{1,20}$` | 단위 코드는 영문·숫자·밑줄 20자 이내여야 합니다. |
| V-002 | `DIMENSION`(D-002) | 필수, ASCII `^[A-Za-z0-9_]{1,50}$` | 차원은 영문·숫자·밑줄 50자 이내여야 합니다. |
| V-003 | `BASE_UNIT`(D-003) | 필수, ASCII 20자 이내 | 기준 단위 값이 올바르지 않습니다. |
| V-004 | `FACTOR`(D-004) | 필수, 0보다 큰 decimal | 환산 계수는 0보다 큰 숫자여야 합니다. |

### 6.2 연관 검증 (여러 필드 조합)

| 규칙ID | 조건 | 에러 메시지 |
|---|---|---|
| XV-001 | `UNIT_CODE` 가 금지 단위 코드(월·년·영업일·근무시간에 대응하는 `MONTH`/`MON`/`YEAR`/`YR`/`BIZDAY`/`WORKHOUR`, 대소문자 무관)인 경우(I4) | 월·년·영업일·근무시간처럼 고정 계수가 없는 단위는 등록할 수 없습니다. |
| XV-002 | 이미 존재하는 차원에 `BASE_UNIT` 이 그 차원의 기존 값과 다름(I3) | 이 차원의 기준 단위는 이미 `{기존 기준 단위}` 로 정해져 있습니다. |
| XV-003 | 새 차원의 첫 등록인데 `UNIT_CODE != BASE_UNIT` 또는 `FACTOR != 1`(I3, D2) | 새 차원의 첫 단위는 그 자신이 기준 단위(계수 1)여야 합니다. |
| XV-004(A-PREVIEW) | `compare` 요청의 두 단위 차원이 다름(I1) | 서로 다른 차원끼리는 변환할 수 없습니다. |

### 6.3 검증 실행 순서

```
[저장] 클릭
  → 1단계: 필수값 체크
  → 2단계: 형식/범위 체크(ASCII·길이·decimal)
  → 3단계: 연관 검증(금지 코드, 차원별 기준 단위 일관성)
  → 모두 통과 → 서버 요청
  → 실패 → 첫 번째 에러 필드로 포커스 이동 + 에러 메시지 표시
```

서버는 FE 검증을 신뢰하지 않고 V-001~V-004 / XV-001~XV-003 을 재검증한다(TSK-04-02 design.md I1~I5).

## 7. 상태 정의 및 상태별 제어

해당 없음 — 단위 마스터는 승인·상태 워크플로가 없다. `docs/mdm/design/basic/02-term-domain-column.md:34`
"관리 | 버전(승인·상태 없음) | 표준 관리자가 저장하면 바로 배포"(용어 속성 표이나 단위 마스터도 같은
02 영역 원칙을 따른다, TSK-04-02 design.md I16 CHG_SEQ 서술 참고).

### 7.2 상태 전이 규칙

해당 없음.

### 7.3 상태별 필드 편집 가능 여부

해당 없음.

### 7.4 상태별 버튼 활성/비활성

해당 없음.

## 8. 권한 정의

> mdm 은 ADMIN/MANAGER/USER 3역할 모델이 아니라 `MDM_STD_ADMIN`/`MDM_STEWARD` 2역할 + `SYSADMIN`
> 브레이크글라스다(`MdmPermissions.MATRIX`, TSK-01-03 design.md §2.6). 권한 표의 열을 실제 역할로 바꾼다.

| 기능 | SYSADMIN | MDM_STD_ADMIN | MDM_STEWARD | 비고 |
|---|---|---|---|---|
| 조회 | O | O | O | `search`(READ_ACTIONS 포함) |
| 신규등록 | O | O | X | `save`(EDIT_ACTIONS 에만 있음) |
| 수정 | O | O | X | `save` |
| 삭제 | O | O | X | `delete`(EDIT_ACTIONS 에만 있음) |
| 환산 계산기 | O | O | O | `compare`(READ_ACTIONS 에도 포함 — 읽기 전용 계산이라 담당자도 가능) |

> RBAC 는 `TB_MCM_SEC_OBJ`/`TB_MCM_SEC_ROLE_MAPPING` 의 `OBJECT_ID='unitMng'` 로 BFF 가 외부에서 판정한다
> (mdm 백엔드 자체 권한 분기 없음, TSK-01-03 D6).

## 9. 연동 화면 / 팝업

해당 없음.

## 10. 기타 열거형 (LoV)

| 열거형(DB 컬럼) | 코드값 | 화면 표시명 | 설명 |
|---|---|---|---|
| LV-001 `DIMENSION`(검색 편의용, 강제 아님) | `MASS` | 질량 | 02 설계 문서 예시 차원(773-798행) |
| LV-001 `DIMENSION` | `LENGTH` | 길이 | 상동 |
| LV-001 `DIMENSION` | `TIME` | 시간 | 상동(day/h/min/s/ms/us 예시, 787-794행) |
| LV-001 `DIMENSION` | `COUNT` | 개수 | 상동 |

> LV-001 은 코드 마스터가 아니라 FE 인라인 상수(`DIMENSION_LABELS`)다 — `DIMENSION` 칼럼은 위 4개로
> 고정되지 않고 임의 ASCII 코드를 새로 등록할 수 있다(I20). 목록에 없는 코드는 코드 문자열 그대로
> 표시한다.

## 11. 특이사항 / 설계 결정

### 11.1 GAP 등재(분석리포트 없음 — 본 절에서 직접 등재)

| ID | 항목 | 영향도 | 후속 조치 | 상태 |
|---|---|---|---|---|
| GAP-001 | 본 화면은 As-Is 가 없어 분석리포트·G1~G7 게이트가 성립하지 않는다(DEC-001 과 동일 사유) | 높음 | TSK-04-02 design.md 담당자 확인 필요 결정 D14 로 기록, 기능설계서 1종만 작성 | resolved(문서화) |
| GAP-002 | `UNIT_CODE`/`BASE_UNIT`/`DIMENSION` 은 코드 칼럼이라 한글 값을 저장하는 것을 전제하지 않는다(TSK-04-01 이 물려준 기존 스키마) | 높음 | TSK-04-02 design.md D11 로 ASCII 제한 + FE 라벨맵으로 해결 | resolved(설계 반영) |
| GAP-003 | 권한 표(§8)의 열이 템플릿 기본(ADMIN/MANAGER/USER)과 다르다 — mdm 은 2역할 모델이다 | 낮음 | 열을 `SYSADMIN`/`MDM_STD_ADMIN`/`MDM_STEWARD` 로 대체(본 문서 §8) | resolved |

### 11.2 검토한 대안

| 대안 | 장점 | 단점 | 채택 여부 | 사유 |
|---|---|---|---|---|
| 차원별 기준 단위를 `TB_MDM_DIMENSION` 마스터로 명시 관리 | 기준 단위 조회가 단순해짐 | 신규 테이블·화면 필요, 이번 범위(V4 = 인덱스 하나) 초과 | X | TSK-04-02 design.md D2 — 새 차원 첫 등록 행이 스스로 기준 단위가 되는 규칙으로 대체 |
| `UNIT_CODE`/`DIMENSION` 에 한글을 직접 저장 | 화면이 DB 값을 그대로 보여줄 수 있음 | `UNIT_CODE` 가 PK·FK 대상이라 재작업 범위가 큼 | X | TSK-04-02 design.md D11 — ASCII 코드 + FE 라벨맵 채택 |
| 금지 단위 코드를 관리 테이블로 운영자가 수정 가능하게 함 | 유연함 | 스키마·화면 추가로 범위 초과, 02 설계 문서의 목록이 고정 개념(달력 의존)이라 실익 적음 | X | TSK-04-02 design.md D3 — 코드 상수로 하드코딩 |
