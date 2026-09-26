---
screenId: termMng
asIsId: 해당 없음 (As-Is 레거시 없음 — 02 설계 문서 기반 신규 화면)
moduleId: mdm
moduleGroup: dma
작성일: 2026-09-24
작성자: Agent
---

# mdm — 용어 관리 기능설계서

> **인용 정본 예외 (DEC-001 선례 준용, TSK-04-02 design.md 담당자 확인 필요 결정 D14)**: `Mes-Guide.md` §4
> 의 5종 설계 산출물 게이트는 As-Is → To-Be 마이그레이션을 전제하는데, 본 화면은 **As-Is 레거시가 없는
> 신규 화면**이라 분석리포트(§1~§17)가 존재하지 않고 G1~G7 게이트도 성립하지 않는다. `docs/ai-build-log/
> DEC-001_noticeMgmt-on-mls.md`(mls `noticeMgmt` 선례)와 같은 사유로, 5종을 **기능설계서 1종**으로
> 축소해 작성한다. 표는 분석리포트 대신 **원천 설계**(`docs/mdm/design/basic/02-term-domain-column.md`,
> 시안 `docs/mdm/design/basic/html/02-term-domain-column.html` "용어 관리" 탭)와 **선행 Design 산출물**
> (`docs/mdm/tasks/TSK-04-02/design.md`)을 근거로 삼는다 — 각 표에 인용 위치를 붙인다.
>
> **Frontend 개발 연계 값** (§1.2 정본) — mesModule `m-mdm` / moduleGroup `dma` / pageName `termMng` /
> pageId `termMng` / 페이지 유형 `B` / tsup entry key `pages/dma/termMng/page`

## 1. 화면 개요

### 1.1 업무/설계 측면

| 항목 | 내용 |
|---|---|
| 화면명 | 용어 관리 |
| 화면 식별자 | `termMng` |
| 모듈 | `mdm`(마루 MDM) / moduleGroup `dma`(용어·도메인) |
| 화면 목적 | 용어집(`TB_MDM_TERM`)의 (표기, 의미 번호) 단위 CRUD 와, 등록·수정 중인 표기·정의를 바탕으로 한 1차(문자열)·2차(임베딩) 유사어 추천을 제공한다. |
| 주요 사용자 | 표준 관리자(`MDM_STD_ADMIN`, 등록·수정·재인코딩 배치) / 담당자(`MDM_STEWARD`, 조회·추천 조회만) |
| 접근 경로 | 포털 → MDM > 용어·도메인 > 용어 관리 |

근거: `docs/mdm/design/basic/02-term-domain-column.md:34` "관리 | 버전(승인·상태 없음) | 표준 관리자가
저장하면 바로 배포", `docs/mdm/design/basic/html/02-term-domain-column.html` 용어 상세 카드 안내문
"표준 관리자 역할만 등록·수정한다".

### 1.2 Frontend 개발 연계 값

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId | `mdm` | `docs/mdm/screens/README.md` §2 |
| moduleGroup | `dma` | `docs/mdm/screens/README.md:19-24` |
| mesModule | `m-mdm` | 01 A.4.5 |
| 적용 명명 룰 | MES 단일 룰 | mdm 은 MES 모듈 |
| 화면식별자 (screenId) | `termMng` | `docs/mdm/screens/README.md:36`(TSK-04-02 등재) |
| pageName / pageId / serviceId | `termMng` | screenId 동일값 |
| 페이지 유형 | `B`(조회 + 상세) | A-DETAIL 있음 |
| 주요 API path (UI→BFF) | `POST /api/mdm/oasis/termMng/{action}` | `docs/mdm/TRD.md:38-41`, spec.md |
| 주요 API path (BFF→BE) | `POST /oasis/termMng/{action}` | 상동 |
| Frontend 파일명 | `m-mdm/pages/dma/termMng/page.tsx` | `docs/mdm/screens/README.md:73-81` |
| tsup entry key | `pages/dma/termMng/page` | `m-mdm/tsup.config.ts`(TSK-04-02 design.md §2) |
| action 어휘 | `search`/`save`/`delete`/`compare`/`execute`(13개 고정 어휘 중) | TSK-04-02 design.md I14 |
| 메뉴 계층 | 마루 MDM(`mdm`) > 용어·도메인(`dma`) > 용어 관리(`termMng`) | `DataInitializer.seedMdmMenus()` 코드 시드 |

## 2. 화면 영역 정의

| 영역ID | 영역명 | 설명 |
|---|---|---|
| `A-FILTER` | 조회조건 | 검색어(표기·약어·동의어·별칭 통합)·사용 시스템·맥락으로 목록을 좁힌다 |
| `A-GRID` | 목록 그리드 | 조회 결과 목록. 행 클릭 시 A-DETAIL 에 상세를 표시한다 |
| `A-DETAIL` | 상세 폼(등록/수정) | 표기·의미 번호·정의 등 입력 영역 |
| `A-RECO` | 유사어 추천 패널 | 표기·정의·영문명 입력을 디바운스해 1차·2차 추천 후보를 보여준다 |
| `A-BTN` | 버튼 | `PageLayout.buttons` 로 주입(재인코딩 배치 포함) |

## 3. 조회조건 정의 (영역: A-FILTER)

근거: HTML 시안 용어 관리 검색 카드(78-96행, TSK-02-02 조사 보고 인용) — "검색어(표기·영문 약어·동의어·
별칭 통합)", "사용 시스템(전체/MES/ERP/APS/DKMS/L2)", "맥락(전체/전사/제조/소둔 공정/구매·제조/영업/품질)".

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| S-001 | `TERM_NAME`/`ENG_ABBR`/`SYNONYMS`/`ALIASES` | 검색어 | TextBox | N | (빈값) | 표기·영문 약어·동의어·별칭 통합 부분 일치 |
| S-002 | `SYSTEMS` | 사용 시스템 | ComboBox | N | 전체 | §10 LV-001 인라인 후보(MES/ERP/APS/DKMS/L2) |
| S-003 | `CONTEXT` | 맥락 | ComboBox | N | 전체 | §10 LV-002 인라인 후보. `CONTEXT` 는 자유 텍스트 칼럼이라 검색 편의용일 뿐 저장값을 제한하지 않는다 |

### 3.2 조회 결과 (그리드 컬럼)

근거: HTML 시안 용어 목록 카드(98-109행) "표기·의미·영문 약어·맥락·사용 시스템·동의어".

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G-001 | `TERM_NAME` | 표기 | 한글 표기, UNIQUE 아님(동음이의어는 의미 번호로 구분) | Left | varchar(100) |
| G-002 | `SENSE_NO` | 의미 | 동음이의어 구분 번호 | Center | int |
| G-003 | `ENG_ABBR` | 영문 약어 | 중복 허용 + 경고(I8) | Left | varchar(50) |
| G-004 | `CONTEXT` | 맥락 | 자유 텍스트 | Left | varchar(100) |
| G-005 | `SYSTEMS` | 사용 시스템 | JSON 배열을 콤마 조인해 표시(예: `MES, ERP`) | Left | text |
| G-006 | `SYNONYMS` | 동의어 | JSON 배열(`"명칭(시스템)"`)을 콤마 조인해 표시 | Left | text |

> 확장/서브 그리드: 해당 없음.

### 3.3 코드값 표시 변환

| DB 컬럼 | 코드 마스터 | 변환 예 |
|---|---|---|
| `SYSTEMS`/`SYNONYMS`/`ALIASES` | 코드 마스터 아님 — JSON 문자열 배열(TSK-04-02 design.md "코드베이스 지식" 절) | `["MES","ERP"]` → 그리드에 `MES, ERP` |

## 4. 상세 영역 필드 정의 (영역: A-DETAIL)

근거: HTML 시안 용어 상세 카드(111-180행) 전체.

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| D-001 | `TERM_ID` | (내부 키) | TextBox(read-only, 비표시) | N | (자동) | 대리키, 화면에 노출하지 않음(서버 채번) |
| D-002 | `TERM_NAME` | 표기(한글) | TextBox | Y | (빈값) | `(표기, 의미 번호)` 중복 저장 거부(I6) |
| D-003 | `SENSE_NO` | 의미 번호 | TextBox(숫자) | Y | (빈값) | 동음이의어 구분 |
| D-004 | `DEFINITION` | 정의 | Textarea | Y | (빈값) | 필수(I7). 유사어 추천 임베딩 입력(I9)에 들어간다 |
| D-005 | `CONTEXT` | 맥락 | TextBox | N | (빈값) | 자유 텍스트 |
| D-006 | `SYSTEMS` | 사용 시스템 | TextBox(콤마 구분 → 배열 직렬화) | N | (빈값) | 여러 시스템 동시 사용 가능 |
| D-007 | `ENG_NAME` | 영문명 | TextBox | N | (빈값) | 유사어 추천 임베딩 입력(I9)에 들어간다 |
| D-008 | `ENG_ABBR` | 영문 약어 | TextBox | N | (빈값) | 물리명 조합용. 중복이면 저장은 되고 경고만 표시(I8) |
| D-009 | `SYNONYMS` | 동의어 | TextBox(콤마 구분 → 배열 직렬화) | N | (빈값) | `명칭(시스템)` 형식. 추천 패널 "동의어로 확정"이 이 필드에 추가한다(D12) |
| D-010 | `ALIASES` | 별칭(표기 변형) | TextBox(콤마 구분 → 배열 직렬화) | N | (빈값) | 표기 변형 |
| D-011 | `STD_BASIS` | 표준 결정 근거 | Textarea | N | (빈값) | 원칙은 ERP 기준, 예외 시 이유 |

> `OWNER_DEPT`/`OWNER_ID`/`SRC_ORIGIN`(소유 부서·담당자·등록 출처)은 HTML 시안 상세 폼에 입력 필드로
> 없다(§11.1 GAP-101) — DB 는 nullable 이라 화면 미노출로 두고 저장하지 않는다.
> `EMBEDDING`/`EMBEDDING_MODEL` 은 화면에 노출하지 않는다(서버가 저장 시 자동 계산, 네이티브 SQL 전용,
> TSK-04-02 design.md I10).

### 4.2 라인 필드 (서브 그리드)

해당 없음.

## 5. 버튼 및 기능 동작 정의

### 5.1 버튼 목록

| 버튼ID | 버튼명 | 위치 | To-Be action | 설명 |
|---|---|---|---|---|
| B-001 | 조회 | toolbar | `search` | A-FILTER 조건으로 목록 재조회 |
| B-002 | 등록 | toolbar | (client) | 그리드에 빈 행 추가 + A-DETAIL 초기화 |
| B-003 | 저장 | toolbar | `save` | A-DETAIL 값 검증 후 저장(I6·I7·I8), 재조회 |
| B-004 | 삭제 | toolbar | `delete` | 선택 행 삭제(§11.1 GAP-102 — `TB_MDM_COLUMN.TERM_IDS` 참조 검사는 이번 범위 밖, D13) |
| B-005 | 동의어로 확정 | A-RECO 그리드셀 | (client, 저장은 B-003) | 추천 후보를 `SYNONYMS`(D-009)에 추가(D12) |
| B-006 | 재인코딩 배치 실행 | A-BTN(관리자 전용) | `execute` | 최초 일괄 구축·모델 교체 재인코딩 공통(I11). 청크 단위 진행 상태 표시(D6) |

### 5.1-1 그리드셀 인라인 버튼 (GB-NNN)

| 버튼ID | 버튼명 | 소속 그리드 | 셀 컬럼 | 핸들러 | 설명 |
|---|---|---|---|---|---|
| GB-001 | 동의어로 확정 | A-RECO(추천 목록) | 처리 | B-005 와 동일 | 실제 신규 후보에만 노출(자기 자신·경고성 겹침 행은 배지만, HTML 시안 182-194행) |

### 5.2 버튼별 동작 상세

| 버튼ID | 트리거 | 선행 조건 | 동작(단계별) | 호출 액션 |
|---|---|---|---|---|
| B-001 | 클릭 | 없음 | 1) A-FILTER 값 수집 2) `search` 호출 3) 그리드 바인딩 | `search` |
| B-002 | 클릭 | 없음 | 1) A-DETAIL 초기화 2) A-RECO 초기화 | (없음) |
| B-003 | 클릭 | §6 검증 통과 | 1) 클라이언트 필수값 확인 2) `save` 호출 3) 응답의 `warnings`(예: `ENG_ABBR_DUP`) 있으면 비차단 안내 표시 4) 그리드 재바인딩 | `save` |
| B-004 | 클릭 | 그리드 행 선택 | 1) 확인 모달 2) `delete` 호출 3) 재조회 | `delete` |
| B-005/GB-001 | 클릭 | A-RECO 후보 행 존재 | 1) 후보 `termName`+후보 `systems` 로 `"{termName}({systems})"` 조합 2) D-009 값에 추가(저장 전이라 사용자가 다시 편집 가능) | (없음, 클라이언트) |
| B-006 | 클릭(관리자만 활성) | `MDM_STD_ADMIN` 권한 | 1) `execute` 호출(청크 500건) 2) 진행 상태(`processed/remaining/done`) 표시 3) `done=true` 까지 반복 호출 | `execute` |

### 5.3 그리드 동작

| 동작 | 설명 |
|---|---|
| 행 클릭 | 선택 행 값을 A-DETAIL 에 바인딩 |
| 행 더블클릭 | 해당 없음 |
| 헤더 클릭 | 클라이언트 정렬 |
| 페이지 변경 | 해당 없음 — 전건 조회(용어는 최대 1만여 건, AC7 성능 기준 참고) |

**A-RECO 동작**: D-002(표기)·D-004(정의)·D-007(영문명) 중 하나라도 바뀌고 표기가 2자 이상이면 디바운스
후 `compare` 를 1회 호출한다(1차·2차 결과가 `stage` 태그로 한 응답에 묶여 온다, TSK-04-02 design.md
D4·I18). 이전 호출이 끝나기 전에 새 입력이 들어오면 이전 요청은 `AbortController` 로 취소한다.

## 6. 입력값 검증 규칙

### 6.1 필드별 검증

| 규칙ID | 대상 필드 | 검증 내용 | 에러 메시지 |
|---|---|---|---|
| V-001 | `TERM_NAME`(D-002) | 필수 | 표기(한글)는 필수입니다. |
| V-002 | `SENSE_NO`(D-003) | 필수, 정수 | 의미 번호는 숫자여야 합니다. |
| V-003 | `DEFINITION`(D-004) | 필수 | 정의는 필수입니다. |

### 6.2 연관 검증 (여러 필드 조합)

| 규칙ID | 조건 | 에러 메시지 |
|---|---|---|
| XV-001 | `(TERM_NAME, SENSE_NO)` 조합이 이미 존재(I6) | 같은 표기·의미 번호의 용어가 이미 있습니다. |
| XV-002(경고, 비차단) | `ENG_ABBR` 이 다른 행과 중복(I8) | (저장은 진행) "영문 약어 `{값}` 이 이미 다른 용어에서 쓰이고 있습니다." |

### 6.3 검증 실행 순서

```
[저장] 클릭
  → 1단계: 필수값 체크(V-001~V-003)
  → 2단계: 연관 검증 — 거부(XV-001)
  → 3단계: 연관 검증 — 경고만(XV-002, 저장은 계속 진행)
  → 서버 요청 → 성공 시 warnings 표시, 실패 시 첫 번째 에러 필드로 포커스 이동
```

서버는 FE 검증을 신뢰하지 않고 V-001~V-003 / XV-001~XV-002 를 재검증한다(TSK-04-02 design.md I6~I8).

## 7. 상태 정의 및 상태별 제어

해당 없음 — 용어집은 승인·상태 워크플로가 없다(§1.1 근거 인용과 동일, 02 설계 문서 34행).

### 7.2 상태 전이 규칙

해당 없음.

### 7.3 상태별 필드 편집 가능 여부

해당 없음.

### 7.4 상태별 버튼 활성/비활성

해당 없음(B-006 재인코딩 배치는 상태가 아니라 **역할**로만 활성/비활성이 갈린다 — §8).

## 8. 권한 정의

> mdm 은 ADMIN/MANAGER/USER 3역할 모델이 아니라 `MDM_STD_ADMIN`/`MDM_STEWARD` 2역할 + `SYSADMIN`
> 브레이크글라스다(`MdmPermissions.MATRIX`).

| 기능 | SYSADMIN | MDM_STD_ADMIN | MDM_STEWARD | 비고 |
|---|---|---|---|---|
| 조회 | O | O | O | `search` |
| 신규등록 | O | O | X | `save` |
| 수정 | O | O | X | `save` |
| 삭제 | O | O | X | `delete` |
| 유사어 추천 조회 | O | O | O | `compare`(READ_ACTIONS 에도 포함) |
| 재인코딩 배치 실행 | O | O | X | `execute` — `EDIT_ACTIONS` 에만 있어 담당자는 버튼이 비활성(I14) |

> RBAC 는 `OBJECT_ID='termMng'` 로 BFF 가 외부에서 판정한다(mdm 백엔드 자체 권한 분기 없음).

## 9. 연동 화면 / 팝업

해당 없음 — 유사어 추천은 별도 팝업이 아니라 A-RECO 인라인 패널이다.

## 10. 기타 열거형 (LoV)

| 열거형(DB 컬럼) | 코드값 | 화면 표시명 | 설명 |
|---|---|---|---|
| LV-001 `SYSTEMS`(검색 편의용) | `MES`/`ERP`/`APS`/`DKMS`/`L2` | 좌동 | HTML 시안 검색 카드 인라인 상수. 코드 마스터 아님, 자유 입력도 허용 |
| LV-002 `CONTEXT`(검색 편의용) | `전사`/`제조`/`소둔 공정`/`구매·제조`/`영업`/`품질` | 좌동 | 상동. `CONTEXT` 는 자유 텍스트라 목록 밖 값도 저장 가능 |

## 11. 특이사항 / 설계 결정

### 11.1 GAP 등재(분석리포트 없음 — 본 절에서 직접 등재)

| ID | 항목 | 영향도 | 후속 조치 | 상태 |
|---|---|---|---|---|
| GAP-101 | HTML 시안 상세 폼에 `OWNER_DEPT`/`OWNER_ID`/`SRC_ORIGIN` 입력이 없다(02 설계 문서 "관리" 속성 서술과 실제 시안 폼이 불일치, TSK-04-01 이 D3 로 컬럼만 신설) | 중간 | 이번 화면은 시안대로 미노출. 소유 부서·담당자 관리가 실제로 필요해지면 후속 작업에서 필드 추가 | open |
| GAP-102 | `TB_MDM_COLUMN.TERM_IDS`(다른 화면 소유, JSON 배열)가 참조하는 용어를 이 화면에서 삭제해도 막지 않는다(TSK-04-02 design.md D13) | 중간 | TSK-04-04(컬럼 사전)에 인계 | open |
| GAP-103 | "동의어로 확정" 이 채우는 시스템 값의 방향(후보 자신의 systems vs 편집 중인 용어의 systems)이 02 예시 하나에만 근거한다(TSK-04-02 design.md D12) | 낮음 | 저장 전 편집 가능 필드라 되돌리기 쉬움. 담당자 확인 시 반대로 바꿀 수 있음 | open |
| GAP-104 | 권한 표(§8) 열이 템플릿 기본(ADMIN/MANAGER/USER)과 다르다 | 낮음 | `SYSADMIN`/`MDM_STD_ADMIN`/`MDM_STEWARD` 로 대체 | resolved |

### 11.2 검토한 대안

| 대안 | 장점 | 단점 | 채택 여부 | 사유 |
|---|---|---|---|---|
| 1차·2차 추천을 별도 화면 액션 2개(`compare`+또 다른 액션)로 분리 | TSK-02-02 design.md §6.13 원안과 더 가까움 | RBAC 액션 어휘 13개 제한(I14)에서 액션을 하나 더 써야 하고, 화면이 두 번 호출해 합쳐야 함 | X | TSK-04-02 design.md D4 — `compare` 한 액션으로 결합 |
| 재인코딩 배치를 동기 1회 호출로 처리 | 구현 단순 | 실제 ONNX 기준 1만 건 5.6분 — HTTP 타임아웃 위험 | X | TSK-04-02 design.md D6 — 청크 폴링 채택 |
| 용어 삭제 시 `TB_MDM_COLUMN.TERM_IDS` 참조를 방언별 JSON 질의로 검사 | 참조 무결성 보장 | `TB_MDM_COLUMN` 은 다른 화면(TSK-04-04) 소유, 검증 안 된 구현이 앞서가는 모양 | X | TSK-04-02 design.md D13 — 이번 범위에서는 인계만 |
