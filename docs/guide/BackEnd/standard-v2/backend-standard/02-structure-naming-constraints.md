# 02. 구조, 명명, 금지 사항

> 상위 문서: [BackEnd 표준 개발 가이드 V2](../../BackEnd_표준_통합_개발가이드_v2.md)

## 3. 표준 구조

### 3-1. 디렉토리 구조
```text
src/main/java/{base-package}/
├── entity/                              # 모듈 단위 공유 (모든 도메인·화면이 재사용)
│   ├── {Entity}.java                    # 테이블 1:1 — 본 테이블 전체 컬럼 보유
│   └── {Entity}Id.java                  # 복합 PK 시
├── repository/                          # 모듈 단위 공유
│   └── {Entity}Repository.java
└── {moduleGroup-lowercase}/             # 도메인 (그룹)
    └── {screenId}/                      # 화면별 service / mapper / dto
        ├── service/
        │   └── {ScreenId}Service.java
        ├── {ScreenId}Mapper.java        # 필요 시만 (MyBatis)
        └── dto/
            ├── {ScreenId}SearchRequest.java # 조회 시
            └── {ScreenId}Response.java      # 조회 시

src/main/resources/
├── services/{screenId}/{screenId}.bpmn
└── persistence/{screenId}/{screenId}-mapper.xml   # MyBatis 사용 시
```

- **MUST**: 본 §3-1 의 디렉토리 구조는 **MES 4 모듈 (mcm / mpp / mqc / mls) 전부 동일 적용** — 모듈마다 다른 패턴 ✗. (mpn / aps 는 §3-1 말미 예외 참조.)
- **MUST**: **Entity / Repository 는 모듈 단위 공유** — `{base-package}/entity/`, `{base-package}/repository/` 한 곳에 둔다. **그룹 sub-package (`{moduleGroup}/`) 나 화면 sub-package (`{screenId}/`) 아래에 entity / repository 를 두지 않는다.**
  - **이유**: 한 테이블을 둘 이상의 화면이 (그룹이 다르더라도) 참조할 때 화면·그룹별 부분 entity 를 따로 만들면 중복 / 분기 / cross-screen import 어색함이 발생. entity 의 "owner" 가 자의적이 됨.
  - **사례 (2026-05-28 이전 cma 4 화면 위반)**: `MasterCode` 가 `cma/masterCodeMng/entity/` 에 위치 → `masterCategoryMng/service/` 가 cross-screen import. 본 룰 도입 이후 (2026-05-29) `mcm/entity/MasterCode.java` 단일 위치 — 4 화면이 동일 entity 재사용.
  - **JPA repository 는 entity 1:1 종속** (`JpaRepository<MasterCode, String>`) 이라 entity 가 모듈 공유면 repository 도 자연히 모듈 공유.
- **MUST**: **Entity 는 매핑 테이블의 모든 컬럼을 1:1 보유** — 현 화면에서 쓰지 않는 컬럼이라도 동일 테이블이라면 누락 금지.
  - **이유**: 향후 다른 화면이 같은 테이블을 참조할 때 entity 수정 없이 재사용. "이번 화면 사용분만" 으로 빈약하게 만들면 다음 화면에서 컬럼 추가 작업 / 마이그레이션이 매번 발생.
  - **단, 본 테이블 외부 컬럼 (JOIN / STUFF / 동적 변환) 추가는 §6-A-1 그대로 금지** — entity = "본 테이블 전체 컬럼" 이지 "다른 테이블 캐싱" 이 아님.
  - 설계서 §7 의 To-Be Entity 컬럼 목록도 본 룰에 맞춰 **테이블 실 컬럼 전체** 를 기재한다 (화면 미사용 컬럼은 "사용 여부 N" 표기).
- **MUST**: 화면 sub-package = **화면 식별자 그대로** (`moldMaster` camelCase — 모듈명·그룹명 prefix 없는 단일 토큰). lowercase compounded (`moldmaster`) 금지.
- **MUST**: 그룹 sub-package = `moduleGroup` lowercase 3글자 (예: `ppa`, `cma`, `lva`). 모듈 구분은 base-package (`com.dongkuk.dmes.{moduleId}`) 가 담당하므로 screenId 에 모듈명을 중복하지 않는다.
- **예시**:
  - mcm: `com.dongkuk.dmes.mcm.entity.MasterCode` / `com.dongkuk.dmes.mcm.cma.masterCodeMng.service.MasterCodeMngService`
  - mpp: `com.dongkuk.dmes.mpp.entity.MoldMaster` / `com.dongkuk.dmes.mpp.ppa.moldMaster.service.MoldMasterService`
- **이유 (식별자 매핑)**: 폴더/패키지 ↔ 화면 식별자 ↔ FE 파일(`moldMaster.tsx`) ↔ 클래스명(`MoldMaster*`) 4 영역 정합 — 시각 매핑 + 추적성.
- **legacy**:
  - 기 생성된 entity 가 그룹·화면 폴더 아래 분산되어 있는 기존 mcm-core 자산 (`code/entity/`, `security/entity/`, `role/entity/` 등 15+ entity) = As-Is 유지. 다음 사이클에 본 룰로 마이그레이션 또는 폐기 결정.
  - cma 4 화면 (`masterCodeMng` / `masterCategoryMng` / `masterCodeSelPop` / `masterCodeUploadFilePopup`) = 2026-05-29 본 룰 적용 첫 사이클로 mcm-core 이동.
  - 신규 화면은 본 룰 무조건 적용.

**[MES screenId = serviceId = pageId 단일 식별자 룰 — MUST]**

MES 4 모듈 (`mls` / `mqc` / `mpp` / `mas`) 은 한 화면을 식별하는 모든 값을 **단일 camelCase 식별자**로 통일한다.

| 축 | 값 | 형식 |
|---|---|---|
| `screenId` | 화면 식별자 (분석리포트 / 정합체크서 / FE 라우트 prefix) | `{화면명}` 단일 토큰 camelCase — 화면명 그 자체 (`plateSlittingMgmt`). 모듈명·그룹명 prefix 없음 |
| `serviceId` | BPMN 파일명 (확장자 제외) / `<bpmn:process id>` | `screenId` 와 **완전 동일** |
| `pageId` | FE 측 페이지 식별자 / RBAC / 메뉴 코드 | `screenId` 와 **완전 동일** |
| Spring Service bean | `@Service("...")` 값 | `screenId` 와 **완전 동일** |
| BPMN 파일 경로 | `services/{serviceId}/{serviceId}.bpmn` | `screenId` 와 **완전 동일** |
| API URL serviceId | `POST /oasis/{serviceId}/{action}` | `screenId` 와 **완전 동일** |

- **MES 예시**:
  - `plateSlittingMgmt` — MLS 모듈 / 후판 슬리팅 관리 화면
  - `moldInspect` — MQC 모듈 / 금형 검사 화면
  - `moldMaster` — MPP 모듈 / 금형 마스터 화면
  - `workOrderIssue` — MAS 모듈 / 작업지시 발행 화면
- **금지**: 모듈명 prefix 부착 (`mlsPlateSlittingMgmt` ✗ — 모듈 구분은 경로/URL/패키지가 담당). 같은 화면을 `screenId = plateSlittingMgmt`, `serviceId = plateSlitting`, `pageId = MLS-PLATE-SLIT` 처럼 **분기시키지 않는다**. 한 화면 = 한 식별자.

**[APS / mpn 예외 — MUST]**

`mpn` 모듈 (APS 사이트 — `com.dongkuk.dmes.mpn` + `com.dongkuk.dmes:aps-core` 기반) 은 본 MES camelCase 룰을 **적용하지 않는다**.

- APS 는 별도 명명 컨벤션 (`aps-core` / `APS-CORE` 기반의 BPMN flow + Manager / Service / Handler 패턴) 을 유지한다.
- APS 의 명명 정본은 `aps-core` / `oasis-project-support` skill 의 규약을 따른다 — 본 가이드는 {CLIENT} **MES 4 모듈 (mls / mqc / mpp / mas)** 기준이다.
- 본 §3-1 / §5 / §9 의 "단일 camelCase 식별자" 룰은 MES 4 모듈에만 강제. `mpn` 화면 작업 시 본 룰을 적용하지 않고 APS 측 규약을 따른다.

### 3-2. 케이스별 필수 파일
| 케이스 | 필수 파일 |
|---|---|
| 조회 전용 | Entity, Repository, SearchRequest, Response, Service, BPMN |
| 저장/삭제 전용 | Entity, Repository, Service, BPMN |
| 조회 + 저장 | Entity, Repository, SearchRequest, Response, Service, BPMN |
| 복잡 조회(MyBatis) | Entity(선택), Mapper, mapper.xml, SearchRequest/Response, Service, BPMN |
| Master-Detail 저장 | Master/Detail Entity, Repository, Service, BPMN |

---

## 4. 핵심 선택 기준

### 4-1. JPA / MyBatis 선택 기준
| 상황 | 기본 선택 |
|---|---|
| 단건 조회, 기본 CRUD, PK 기반 변경 | JPA |
| 단순 목록 조회 (단일 엔티티, 단순 조건) | JPA |
| **복합** 검색, **다중 테이블 조인**, 통계/집계 | MyBatis |
| 동적 조건이 다수인 경우 | MyBatis |
| 저장 프로시저 호출 | MyBatis |
| 성능 튜닝이 핵심인 조회 | MyBatis 우선 검토 |

### 4-2. Controller 사용 기준
- MUST NOT: 일반 업무 API 를 위해 Controller 를 직접 작성하지 않는다.
- MAY: 프레임워크 외부 연계, 별도 콜백, 시스템 헬스체크 등 BPMN 진입 구조로 처리되지 않는 예외는 별도 기준에 따라 작성할 수 있다.

---

## 5. 명명 규칙

| 대상 | 규칙 | 예시 (MES) |
|---|---|---|
| 클래스 | PascalCase (`{ScreenId 첫글자 대문자}*`) — Java 클래스 컨벤션 (식별자/폴더/파일명 룰과는 별개) | `PlateSlittingMgmtService` |
| 메서드/변수 | camelCase | `searchPlateSlitting` |
| 테이블 | `TB_{모듈명}_{역할}` (모듈명=mpn/mpp/mls/mqc/mas/mcm lowercase 3글자, 역할=lowercase snake_case) · 예외: `mdm` 은 `TB_MDM_{역할}` 대문자(식별자 사전 §A.12.7) | `TB_mls_plate_slitting` |
| 컬럼 | UPPER_SNAKE_CASE | `SLITTING_NO` |
| Service Bean | camelCase = `screenId` 와 동일 | `@Service("plateSlittingMgmt")` |
| BPMN 파일 | `{serviceId}.bpmn` (= `screenId`) | `plateSlittingMgmt.bpmn` |
| BPMN process id | `<bpmn:process id="{serviceId}">` (= `screenId`) | `<bpmn:process id="plateSlittingMgmt">` |
| API URL (BE 매핑) | `POST /oasis/{serviceId}/{action}` | `POST /oasis/plateSlittingMgmt/search` |
| UI→BFF URL | `POST /api/{moduleId}/oasis/{serviceId}/{action}` | `POST /api/mls/oasis/plateSlittingMgmt/search` |
| pageId (FE / RBAC) | `screenId` 와 동일 | `plateSlittingMgmt` |

- **MUST (MES 단일 식별자 룰)**: MES 4 모듈 (`mls` / `mqc` / `mpp` / `mas`) 의 `screenId` = `serviceId` = `pageId` = Spring Service bean 이름 = BPMN 파일명 = API URL 의 `serviceId` 가 **모두 동일한 camelCase 값**이다. 한 화면 = 한 식별자 (§3-1 의 "MES screenId = serviceId = pageId 단일 식별자 룰" 참조).
- **MUST**: MES `serviceId` 형식 = `{화면명}` 단일 토큰 camelCase — 화면명 그 자체 (모듈명·그룹명 prefix 없음). (예: `plateSlittingMgmt`, `moldInspect`, `moldMaster`, `workOrderIssue`)
- **MUST**: `serviceId` 는 BPMN 파일명(확장자 제외) 및 `<bpmn:process id>` 와 동일한 값을 사용한다.
- **MUST**: `action` 은 BPMN `actionGateway` 의 `conditionExpression` 값과 동일하다.
- **MUST NOT**: 복수형 `products`, 또는 `/api/{group}/{resource}/{action}` 순서로 구성하지 않는다.
- **MUST NOT**: 같은 화면에 `screenId` / `serviceId` / `pageId` / Service bean 이름 / BPMN 파일명을 서로 다른 값으로 분기시키지 않는다.
- **MUST (유일성)**: 한 모듈 내 같은 이름의 화면(`screenId` = `serviceId` = BPMN 파일명) 2개 이상 ✗. OASIS 로더가 BPMN 을 **파일명만으로** 매칭하므로 동일 배포 단위 classpath (의존 jar 포함) 안에 같은 파일명이 있으면 호출 시점 `Duplicate service files exist` 예외로 양쪽 모두 사용 불가. 개발 중 동일 이름의 Object 발견 시 **즉시 중단 + 사용자 질문**. 정본: [01_Agent부속_가이드.md §A.4.4.2](../../../design/identifier-dictionary/02-naming-conventions.md) (본 문서에서는 중복 기술하지 않는다).
- **APS / mpn 예외 (MUST)**: `mpn` 모듈 (APS 사이트) 은 본 MES 단일 식별자 룰을 적용하지 않는다. `mpn` 은 `aps-core` 기반의 별도 명명 컨벤션을 따른다 (§3-1 의 "APS / mpn 예외" 박스 참조). 본 표의 예시 / "단수 camelCase" 룰은 MES 4 모듈 (mls/mqc/mpp/mas) 한정이다.
- 상세 규격은 Part B §3 참조.

**[D2 테이블 명명 표준 — MUST]**
- 테이블명 형식: **`TB_{모듈명}_{역할}`**
  - **모듈명**: 6 모듈 (`mls` / `mqc` / `mpp` / `mas` / `mpn` / `mcm`) lowercase 3글자만 허용.
    - MES 4 모듈: `mls` (물류) / `mqc` (품질) / `mpp` (조업) / `mas` (작업지시·실행)
    - APS 모듈: `mpn` (계획 — APS 사이트, §3-1 의 APS / mpn 예외 적용)
    - 공통 인프라: `mcm` (앱 호스트 / 메뉴 / 코드 마스터 등)
    - 예외: `mdm`(마루 MDM, 2026-09-24) — 모듈·역할 모두 대문자 `TB_MDM_{ROLE}` (식별자 사전 §A.12.7)
  - **역할**: lowercase snake_case. 역할 안에 추가 `_` 허용 (예: `mold_master`, `inspection_request`, `plate_slitting`).
- 예시:
  - `TB_mls_plate_slitting` — MLS 모듈 후판 슬리팅
  - `TB_mls_shipment_history` — MLS 모듈 출하 이력
  - `TB_mqc_inspection_request` — MQC 모듈 검사 요청
  - `TB_mpp_mold_master` — MPP 모듈 금형 마스터
  - `TB_mas_work_order` — MAS 모듈 작업지시
  - `TB_mpn_plan_master` — MPN 모듈 계획 마스터 (APS)
  - `TB_mcm_app_host` — MCM 모듈 앱 호스트
- 정본 정의는 [01_Agent부속_가이드.md §A.12](../../../design/identifier-dictionary/04-decision-table-dispatch.md) 인용 (Wave G-2 신설, 본 문서에서는 중복 기술하지 않는다).
- 기존 `TB_{CLIENT}_*` 형식 테이블은 마이그레이션 대상 (별도 PR) — 본 표준 신규 적용은 새 테이블부터.

**[D2-Menu PARENT_MENU_ID / OBJECT_ID 표준 (메뉴 시드 — 2026-06-05 Phase 1~4 §13 정본 참조)]**
- MES 메뉴 트리 (`TB_MCM_SEC_MENU`) 의 leaf row 는 `PARENT_MENU_ID = {group 토큰}` (3 글자 lowercase: `cma` / `csa` / `cme`), `OBJECT_ID = {화면명}` 단일 토큰 camelCase 형식을 강제한다.
- `OBJECT_ID` 정규식 = `^[a-z][a-zA-Z0-9]*$`. 시드 진입점 (`DataInitializer.insertMcmSecMenuIfAbsent`) 이 빌드 타임에 본 정규식 검증 후 위반 시 `IllegalStateException` 으로 차단한다 (`src/backend/mcm/api/.../init/DataInitializer.java:1042-1045`). PascalCase / kebab / snake / 빈문자열 등 모두 차단.
- 본 두 컬럼은 BE myMenusTree 응답의 derived `componentPath = PARENT_MENU_ID + "/" + OBJECT_ID` 의 입력값이자 FE `page-components/{group}/{leaf}/page.tsx` 디스크 경로와 1:1 일치한다. 자세한 BE 응답 패턴 / FE 소비 패턴은 §13 (Phase 1~4) 참조.

### 5-1. 지역 변수 / 파라미터 네이밍

지역 변수·메서드 파라미터·필드 변수는 **타입 prefix + camelCase** 를 사용한다.

| 타입 | prefix | 예시 |
|---|---|---|
| String | `str` | `strProdNo`, `strRowStatus` |
| int | `int` | `intCount`, `intIndex` |
| long | `lng` | `lngSeq` |
| double / BigDecimal | `dbl` | `dblPrice`, `dblQty` |
| boolean | `is` / `has` / `yn` | `isValid`, `hasError`, `ynUse` (DB 컬럼 `USE_YN` 대응 시 `yn` 허용) |
| List<T> | `list` | `listProduct`, `listErrors` |
| Map<K,V> | `map` | `mapRow`, `mapParam` |
| 배열 | `arr` | `arrCode` |
| Entity / DTO 객체 | prefix 없음, 타입 의미가 드러나는 camelCase | `product`, `searchRequest` |

- MUST: 지역 변수 / 파라미터 / 필드 변수에 위 prefix 를 적용한다.
- MUST NOT: Entity · DTO · Map key 문자열의 **필드명** 에는 prefix 를 붙이지 않는다. (예: `private String productId` 유지 — JSON 직렬화 키 / BE↔FE 계약과 맞물리기 때문)
- MAY: 루프 인덱스는 관용 `i`, `j`, `k` 를 허용한다.

### 5-2. 주석 규칙

핵심 이해 포인트에만 한글 주석을 남긴다. 모든 줄에 주석을 달지 않는다.

- MUST: Service 메서드 선언 위에 한 줄 Javadoc 으로 **비즈니스 의미** 를 명시한다. (예: `/** 조회 (BPMN action=search) */`)
- MUST: 저장 로직의 다음 지점에는 한글 주석을 남긴다.
  - rowStatus 분기 진입부 (R/미지정 스킵, C/U/D 분기)
  - PK 필수값 검증 지점
  - 에러 수집 후 일괄 throw 지점
  - 레거시 예외(§8-4 레거시 키 유지 적용 부위)
- MUST: BPMN `<bpmn:documentation>` 은 Checker Task, Error End Event 에 한국어 한 줄 설명을 둔다.
- MUST NOT: 코드 동작을 그대로 반복하는 주석 (예: `// i 값을 1 증가`).
- SHOULD: 본 가이드의 섹션 번호(예: `(BackEnd 가이드 §8-5)`) 를 주석에 함께 표기해 규칙 추적이 가능하게 한다.

### 5-2-1. 설계서 추적성 주석 (SHOULD)

코드에 설계서 항목 ID (G-NNN, B-NNN, V-NNN 등) 를 주석으로 표기하여 역추적 가능하게 한다. §12-3 1:1 대조 검증 시 코드 측 매핑 근거가 된다.

**Entity / DTO 필드**:
```java
/** G-002 itemCd — 분석리포트 §4.3 (편집 Y / 신규시만) */
@Column(name = "ITEM_CD", length = 30)
private String itemCd;
```

**Service 메서드**:
```java
/** BPMN action=search — 분석리포트 §1.1 API-001 (sMoldInfo 직역).
 *  14 검색조건 (§3 S-001~S-014) 처리. */
public List<MoldInfoResponse> searchMoldInfo(...) { ... }
```

**저장/삭제 메서드의 부수 효과**:
```java
/** BPMN action=startPolish — 분석리포트 §1.1 API-?? (iMoldPolish).
 *  부수 효과: P_MOLD_INFO.MOLD_STATUS = '4' 갱신 (§6 V-004). */
```

### 5-3. 파일 헤더 주석

신규 `.java` 파일 생성 시 파일 최상단(package 선언 위)에 작성자·작성일·내용 블록 주석을 남긴다. 수정 시에는 이력만 append 한다. Javadoc 범위(타입·메서드 설명)가 아니므로 `/** */` 가 아닌 일반 블록 주석 `/* */` 을 사용한다.

- MUST: 신규 `.java` 파일 생성 시 최상단에 `작성자 / 작성일 / 내용` 3요소를 포함하는 헤더를 삽입한다.
- MUST: `내용` 은 해당 파일의 역할을 한국어 한 줄(70자 내외)로 간략히 기술한다. (예: "Product 엔티티 — 제품 마스터 기본 필드 정의")
- MUST: 작성자·수정자 식별자는 GitHub 핸들을 `@` 접두어와 함께 기재한다. (예: `@junhwan-park`)
- MUST: 날짜는 `YYYY-MM-DD` 형식으로 통일한다.
- MUST: 파일을 수정할 때는 `변경 이력:` 아래에 `- YYYY-MM-DD @<handle>: <변경내용>` 한 줄을 추가한다. `변경 이력:` 블록이 없으면 `내용:` 아래 한 줄 비우고 새로 만든다.
- MUST NOT: 기존 이력 항목을 삭제하거나 내용을 수정하지 않는다 (append-only).
- MUST NOT: `내용` 에 구현 상세나 TODO 를 적지 않는다. 파일의 존재 이유·역할만 기재한다.
- MUST NOT: 헤더를 Javadoc (`/** */`) 으로 작성하지 않는다. Javadoc 은 타입·메서드 문서에만 사용한다.
- SHOULD: 변경내용은 한국어 한 줄(70자 내외)로 요약한다. 다수 파일에 걸친 변경이라면 대표 커밋/이슈 번호를 포함할 수 있다.
- MAY: 순수 자동 포맷팅(IDE formatter) 적용만 수행한 경우 이력 기재를 생략할 수 있다. (git history 로 추적)

신규 파일 헤더:

```java
/*
 * 작성자: @junhwan-park
 * 작성일: 2026-04-23
 * 내용: Product 엔티티 — 제품 마스터 기본 필드(id, nm, type, useYn) 정의
 */
package com.dmes.aps.core.domain.simulation;

import ...
```

수정된 파일 헤더:

```java
/*
 * 작성자: @junhwan-park
 * 작성일: 2026-04-23
 * 내용: Product 엔티티 — 제품 마스터 기본 필드(id, nm, type, useYn) 정의
 *
 * 변경 이력:
 * - 2026-05-02 @junhwan-park: useYn 컬럼 추가
 * - 2026-05-10 @another-user: ProductSearchRequest 검증 로직 보강
 */
package com.dmes.aps.core.domain.simulation;

import ...
```

---

## 6. 금지 사항

다음은 모두 MUST NOT 이다.

- Lombok 사용
- 필드 주입(`@Autowired private ...`) 사용
- 일반 업무 API 용 `@RestController`, `@Controller`, `@RequestMapping` 계열 작성
- JPA 연관관계 매핑(`@OneToMany`, `@ManyToOne` 등) 사용
- Entity 를 무분별하게 직접 응답에 노출
- 저장 검증 중 에러를 발견하는 즉시 throw
- `selectOne` 을 PK 외 조건에 사용
- 템플릿 밖 메서드 시그니처 사용

### 6-A. 설계서 임의 변경 금지 (MUST NOT)

**6-A-1.** Entity 는 (a) **본 테이블의 모든 실 컬럼** 을 보유하되 (§3-1 의 entity 전체 컬럼 룰), (b) **다른 테이블의 컬럼 (JOIN / STUFF / 동적 변환 결과) 을 본 entity 에 캐싱·스냅샷·복제 추가하지 않는다**.
- §4.3 "편집 여부 N" + "근거 (STUFF/JOIN)" 표시 = DB 저장 컬럼이 아닌 동적 변환 시그널. 화면 표시용으로만 사용하고 entity 컬럼화 ✗.
- **사례 (위반 시 결과)**: `jobNm` 을 (다른 테이블 — 코드 마스터 P001 — 에서 JOIN 으로 가져오는 값인데) Entity 저장 컬럼으로 추가 → popup 으로 `jobCd` 변경 시 `jobNm` 동기화 안 됨 → 코드 마스터 변경 자동 반영 안 됨 → DB 일관성 깨짐.
- **(a) 와 (b) 의 구분**: 본 테이블 컬럼이라면 화면 미사용이라도 entity 에 포함 (재사용성). 다른 테이블 컬럼은 화면 표시용이라도 entity 에 캐싱 금지 (정합성).

**6-A-2.** 설계서 §3/§4/§5 항목을 임의로 줄이거나 합치지 않는다.
- 화면 폭 / 가독성 등 사유로 줄여야 한다면 사용자에게 먼저 확인 (Q-NNN 등재).
- **사례**: 66 그리드 컬럼 → 16 임의 축소 / 14 검색조건 → 6 임의 축소 = MUST NOT.

**6-A-3.** 설계서가 명시하지 않은 정책을 임의로 광범위하게 적용하지 않는다.
- **사례**: §7.3 의 상태별 편집 매트릭스가 명시 안 된 상태에서 "폐기/수정중 모든 컬럼 편집 차단" 으로 광범위 적용 = MUST NOT.

**6-A-4.** 단순화 / 캐싱 결정은 사용자 동의 후 진행.
- "단순화 한 번에 해결" 충동은 안티패턴.
- **사례**: 외부 JOIN 컬럼들을 일괄로 Entity 캐싱 컬럼으로 처리 (분기 회피).

**6-A-5.** 위반 시 정합체크서 §K (코드 구현 정합) 가 ✗ 되어 §12-4 의 재개발 의무 사이클 발동.

### 6-B. 트랜잭션 / Proxy 안티패턴 (MUST NOT — cactus/oasis 정합)

**6-B-1.** cactus-core / oasis-core 의 BPMN ServiceTask 진입점 Service 클래스 / 메서드에 `@Transactional` 어노테이션 **사용 금지**.
- **이유**: Spring 이 `@Transactional` 만나면 CGLIB proxy 생성 → proxy 클래스 (`{ServiceName}$$SpringCGLIB$$0`) 의 method 는 runtime 생성이라 javac `-parameters` 옵션의 `MethodParameters` attribute 가 누락됨 → OASIS executor (`SpringMethodOrConstructorParameter` → Spring `DefaultParameterNameDiscoverer`) 가 reflection 으로 parameter name 추출 시 `null` 반환 → `PrioritizableParameterAndArgumentHolder` 생성자(line 40)에서 `IllegalArgumentException("ParameterName must not be null. Check compile option '-parameters' to get the parameter name.")` throw.
- **OASIS 호출 흐름**: `OasisController` → `OasisServiceExecutor` → `CoreServiceStarter` → `SpringTransactionHandler` → `CoreProcessStarter` → `PlainJavaServiceTaskExecutable` → `StrictMethodInvoker` → `StrictMethodResolver` → `TypeMatchableMethodArgumentBinder` → `PrioritizableParameterAndArgumentHolder.<init>` 에서 throw.

**6-B-2.** 트랜잭션 boundary 는 OASIS executor 가 자동 wrap 한다.
- **기본 동작**: `SpringTransactionHandler` 가 BPMN process 단위로 트랜잭션 wrap. `DefaultTxInjectingServiceProvider` 가 default-manager (`txBiz`) 자동 inject. Service 자체에는 어노테이션 불필요.
- **명시 필요 시**: BPMN process level 의 `<bpmn:extensionElements>` 에 `<camunda:property name="tx" value="txBiz"/>` (또는 다른 tx manager 이름) 추가. process 전체가 한 트랜잭션 안에서 atomic.

**6-B-3.** 참조 패턴.

| 위치 | Service `@Transactional` | BPMN process tx property | 동작 |
|---|---|---|---|
| `com.dongkuk.dmes.mcm.pilot.PilotMultiTxService` (`pilotHybridTx.bpmn`) | ✅ 0건 | ✅ `tx="txBiz"` 명시 | 정상 reference |
| `com.dongkuk.dmes.mcm.role.service.SecObjService` (`secObj.bpmn`) | ✅ 0건 | 미명시 (default 자동 wrap) | 정상 reference |
| (위반 사례 2026-05-28) mcm cma 4 화면 (`masterCodeMng` / `masterCategoryMng` / `masterCodeSelPop` / `masterCodeUploadFilePopup`) | ❌ search/save 에 `@Transactional(readOnly=true)` / `@Transactional(rollbackFor=Exception.class)` | 미명시 | `ParameterName must not be null` 발생 → 4 Service @Transactional 일괄 제거 후 해결 |

**6-B-4.** 검증 방법.
- **정적 검사 (먼저 돌린다)**: `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .`
  — BPMN `camunda:class` 로 진입점을 역산해 `@Transactional` 잔존을 찾는다. 서버 기동 불필요.
  판정은 주석·문자열 리터럴을 제거한 뒤 하므로, 규칙을 서술한 Javadoc 을 위반으로 세지 않는다.
  상세는 [`oasis-contract-check` 스킬](../../../../../.claude/skills/oasis-contract-check/SKILL.md).
- 아래 런타임 확인은 정적 검사가 통과했는데도 증상이 남을 때 쓴다.
- BE 로그의 `c.d.o.m.StrictMethodResolver: Try binding for method.` 라인에서 클래스명을 확인한다.
  - 정상: `com.dongkuk.dmes....{ServiceName}.search(...)` — 원본 클래스명.
  - 위반: `com.dongkuk.dmes....{ServiceName}$$SpringCGLIB$$0.search(...)` — CGLIB proxy 생성됨 → `@Transactional` 잔존 신호.
- `javap -v {ServiceName}.class | findstr MethodParameters` 로 .class 의 attribute 직접 확인 — `Name = "..."` 가 표시되어야 정상.

**6-B-5.** 위반 시 정합체크서 §K (코드 구현 정합) 가 ✗ 되어 §12-4 의 재개발 의무 사이클 발동.

### 6-C. BPMN serviceTask camunda property 표준 (MUST — JavaServiceTask 정합)

**6-C-1.** **`grid` property 사용 금지** (`JavaServiceTask` 만 해당).
- **이유**: OASIS `JavaServiceTaskExecutable` 는 `grid` property 를 지원하지 않는다. 명시 시 `c.d.oasis.exceptions.PropertyException: [grid] is an unavailable attribute. Element [{taskId}]. Executor [JavaServiceTaskExecutable]` throw + 트랜잭션 rollback.
- **정합 매커니즘**: method parameter 이름 (예: `master`, `dsGrdUpload`) 이 CactusRequest body 의 `grids.{key}` key 와 일치하면 OASIS `ParameterNameMethodArgumentBindingStrategy` 가 자동 binding.
- **참고**: `ScriptTask` (mybatis Mapper id 호출) 만 `grid` property 사용 가능.

**6-C-2.** **`output` property 누락 시 결과 손실** (MUST 명시).
- 누락 시 method 반환값이 `ServiceResult.results()` 에 등록되지 않아 CactusResponseConverter 가 응답에 `data` / `grids` 영역 미생성. 결과: 응답 body 가 `{ "meta": {...} }` 만 (성공으로 보이나 데이터 누락).
- **정합 명시**: 단일 List 반환 → `output="{listKey}"` (예: `output="objects"`) → 응답 `grids.objects.rows`. 단일 값 반환 → `output="{valueKey}"` → 응답 `data.{valueKey}`.

**6-C-3.** **`<conditionExpression>` 미사용** (sequenceFlow `name` 만으로 분기).
- 정본 reference: `mcm-core/secObj.bpmn`, `mcm-core/masterCodeMng.bpmn` 등은 `<bpmn:sequenceFlow id="flow_search" name="search" sourceRef="actionGateway" targetRef="searchTask" />` 형태로 `name` 만 명시. OASIS executor 가 `actionGateway` 의 `input="action"` 으로 받은 값을 sequenceFlow `name` 과 매칭.
- `<bpmn:conditionExpression>` 명시는 OASIS executor 의 정합 동작 안에서 불필요.

**6-C-4.** 검증.
- **정적 검사 (먼저 돌린다)**: `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .`
  — serviceTask 의 `grid` property 사용(§6-C-1)과 `output` 누락(§6-C-2)을 전수 검사한다.
  §6-C-2 는 예외 없이 성공처럼 보이는 실패라 런타임 확인만으로는 놓치기 쉽다.
- 아래 런타임 확인은 정적 검사가 통과했는데도 증상이 남을 때 쓴다.
- BE 로그의 `c.d.oasis.process.CoreProcessStarter: Process [{serviceId}] finish.` 가 정상 종료. `finish with exceptions.` 시 직전 ERROR 라인 확인.
- `[grid] is an unavailable attribute` 발견 → §6-C-1 위반.
- 응답 body 가 `meta` 만 (data/grids 미존재) → §6-C-2 위반 (output 누락).

**6-C-5.** 위반 시 정합체크서 §K ✗ → §12-4 재개발 사이클 발동.

### 6-D. Service 반환 패턴 (MUST — cactus CactusResponseConverter 정합)

**6-D-1.** **권장: Service method 가 List 또는 단일값 직접 반환**.
- `CactusResponseConverter.convertSuccess()` 가 `ServiceResult.results()` 의 각 value 를 type 별 자동 분리:
  - `List` → `grids.{key}.rows` 영역
  - 그 외 (Number / String / 단일 객체) → `data.{key}` 영역
- 정본 reference: `mcm-core/SecObjService.searchObjects()` 가 `List<SecObj>` 직접 반환. `mcm-core/MasterCodeMngService.searchCodes()` 도 List 직접 반환 패턴.

**6-D-2.** **Map 반환은 비표준** — cactus 가 Map 내부 List 를 자동 분리하지 않는다.
- `Map<String, Object>` 반환 + BPMN `output="result"` 명시 시 응답이 `data.result = {key1:..., key2:[...]}` 형태로 Map 통째 저장됨 → FE 가 result key 안의 Map 을 별도 추출 처리해야 함.
- **사례 (2026-05-28)**: mcm cma `MasterCodeMngService.search()` / `MasterCategoryMngService.search()` 가 `Map<String, Object>` 반환 + BPMN `output` 미명시 → 응답 빈 → 화면 0건. fix: `output="result"` 명시 + FE `unwrapPayload(data.result)` 추가.

**6-D-3.** **복수 결과 필요 시 BPMN serviceTask 분기** — mpp 정본 패턴 권장.
- 한 화면 내 search 결과가 2 개 이상 List (예: 그리드 + LoV) 필요 시 BPMN 에 serviceTask 여러 개 + 각 task 의 method 단일 List 반환 + 각 output 명시.
- 또는 단일 serviceTask + Map 반환 + output="result" + FE flat 처리 (위 6-D-2 의 trade-off).

**6-D-4.** 위반 검증 — BE 응답 body 가 `meta` 만 / `data` 만 (`grids` 미존재) 시 §6-D-1 위반 또는 §6-C-2 위반.

### 6-E. CactusRequest body 표준 (MUST — FE-BE 협약)

**6-E-1.** **body 영역 분리** — `CactusRequest` 표준 schema:
```json
{
  "meta":   { "userId": "...", "menuId": "..." },
  "params": { "key": "value", ... },
  "grids":  { "key": { "rows": [...] } }
}
```
- `params`: flat key-value (단건 파라미터). String / Number / 단순 객체 만.
- `grids.{key}.rows`: `List<Map>` 데이터. key = Service method parameter 이름과 일치.

**6-E-2.** **List 를 `params` 에 넣으면 throw**.
- `CactusRequestConverter.convert():38-39` 가 `params` 의 각 value 를 `new TypedObject(value)` (TypeReference 미명시) 로 wrap. List 같은 generic 타입은 `IllegalArgumentException("Generic type. You must explicitly specify the type for a generic type. ...")` throw.
- `CactusRequestConverter.convert():43-46` 의 `grids.{gridId}.rows` 만 `new TypedObject(rows, new TypeReference<List<Map<String, Object>>>(){})` 로 TypeReference 명시 → List 처리 가능.
- **사례 (2026-05-28)**: mcm cma `masterCodeMng/api.ts` 의 `saveMaster(rows)` 가 `params: { master: rows }` 로 전송 → throw. fix: `grids: { master: { rows: rows } }`.

**6-E-3.** **method parameter 이름 = body key 일치** (OASIS binding 정합).
- `ParameterNameMethodArgumentBindingStrategy` 가 inputs Map 의 key 로 method parameter 매핑.
- Service `public Map<String, Object> save(List<Map<String, Object>> master)` 의 parameter 이름 `master` = body `grids.master.rows` 또는 `params.master` 의 key 와 일치 필수.
- Java 규약상 parameter 이름은 camelCase. 사례 (2026-05-28): mcm cma `masterCodeUploadFilePopup` 의 Service param `dsGrdUpload` ↔ FE grid key `ds_grdUpload` 불일치 → fix: FE 를 `dsGrdUpload` 로 통일.

**6-E-4.** Phase 7 라우트 (query / service / lov) 는 별도 schema — §11-Y 참조.

---
