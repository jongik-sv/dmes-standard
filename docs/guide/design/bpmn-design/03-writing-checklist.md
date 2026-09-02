# {CLIENT} MES BPMN 프로세스 설계 표준 가이드

> 상위 문서: [{CLIENT} MES BPMN 프로세스 설계 표준 가이드](../04_백단_BPMN_기능설계_가이드.md)

## A.6. 금지 사항 (MUST NOT)

| 항목 | 이유 |
|---|---|
| 실제 BPMN XML(camunda:property 등) 작성 | XML은 개발가이드 §7 템플릿으로 작성 |
| SQL 쿼리 전체 작성 (`SELECT col FROM ...`) | 서버 처리 개요 기술만 허용 |
| 트랜잭션 경계·Lock 범위 구체 명시 | 구현 상세 — "동시 수정 방지 방식" 선택만 기술 |
| 화면 이벤트 없는 추상 프로세스 정의 | 모든 프로세스는 **화면 트리거**에서 시작 |
| 에러 처리를 프로세스별로 중복 기술 | §3 에러 처리 매트릭스에서 공통 정의 |
| API-ID 없이 엔드포인트만 나열 | 프로세스 간 참조 불가 |
| 상태 전이 부수 효과 누락 | 타 모듈 영향이 있는 전이는 §4에 반드시 등록 |
| BPMN 개발가이드 §3 일치 키 변경 제안 | 개발 표준 준수 |
| 응답 코드별 화면 동작 누락 | 정상 + 주요 에러 최소 3가지 흐름도에 포함 |
| 다이어그램 없이 서술문만으로 기술 | 텍스트 다이어그램 또는 Mermaid 필수 |
| **다계층 상태를 단일 action(`changeStatus`)으로 통합** | 각 계층의 권한/검증/부수효과가 다름 — 계층별 `change{LayerName}` action 분리 (§A.4-1-1) |
| **다단 그리드를 그리드별 별도 API로 조회** | 필터 일관성·성능 저하 — 통합 조회 API로 단일 호출 (§A.4-1-2) |
| **그리드 인라인 편집을 행별 개별 호출** | 원자성 깨짐 — 일괄 저장 (`POST /oasis/{serviceId}/save`, body `{ master: [...] }`) 트랜잭션 1건 (§A.4-1-3) |
| **업무 특화 조회를 본 리소스 Response에 포함** | 응답 비대화 — 서브 리소스 GET으로 분리 (§A.4-1-4) |
| **`[확인필요]` 마커 없이 추측한 프로세스/API 정의** | 기능설계서 §A.6-1 마커 규칙 준수 — 추측은 명시적 표기 |

---

## A.7. 표준 템플릿

### A.7-1. 템플릿 위치
BPMN설계서 스펙 템플릿은 [`04-template-and-sample.md`](04-template-and-sample.md) 의 템플릿 절이다. 해당 템플릿을 기준으로 `{화면식별자}_BPMN설계서.md` 를 만들고 내용을 채워 넣는다.

### A.7-2. 파일 네이밍
- 작성 파일명: `{화면식별자}_BPMN설계서.md` (예: `orderRegistration_BPMN설계서.md`) (MUST)
- 저장 위치: `docs/{moduleId}/design/{화면식별자}/` (MUST) — 기능·디자인설계서와 동일 폴더

### A.7-3. 프로세스 흐름도 표기

#### 텍스트 다이어그램 (기본)
```
[트리거 이벤트]
    │
    ▼
화면: (화면 상태 변화)
    │
    ▼
{HTTP Method} {URL} (API-NNN)
    │
    ├─ Request: {파라미터}
    │
    ▼
서버 처리:
    │
    ├─→ 1. ...
    ├─→ 2. ...
    │
    ▼
응답:
    │
    ├─→ 200 성공: {화면 동작}
    ├─→ 4xx 에러: ...
    └─→ 5xx 에러: ...
```

#### Mermaid 다이어그램 (복잡한 분기 시)
복잡한 분기가 있는 경우 사용 가능. (MAY)

---

## A.8. 작성 규칙

> **(MUST) 분석리포트 정본 인용 양식 적용** — 본 §A.8 의 모든 §1 ~ §6 작성 규칙은 **00 §16 정본 인용 매트릭스** 를 적용한다. 분석리포트 §X.Y 의 표를 그대로 인용 (자체 추가 금지). 인용 양식: 설계서 해당 절 첫 줄에 `(분석리포트 §X.Y 와 동일)` 명기 + 표 복사. BPMN 설계서 고유 정보(payload 양식·BPMN 흐름·트랜잭션 경계 등)는 분석리포트 §11 API 패턴 결과 + §5 As-Is 메서드 매핑 인용 위에 추가 컬럼·하위 절로만 보강. 분석리포트에 없는 행을 BPMN설계서가 추가하면 정합체크서 §A 가 ✗ 로 차단한다.

### A.8-1. §1.1 API 엔드포인트 총괄표
- 열: `API-ID | Method | URL | 설명 | 트리거 (화면 동작)` (MUST)
- 트리거는 기능설계서 §5 버튼과 매핑. (MUST)
- 동일 URL이라도 Method가 다르면 별도 API-ID 부여. (MUST)

### A.8-2. §1 표기 컨벤션 박스
- DB 컬럼명/테이블명, API JSON 필드, 바인드 변수, 코드값→명칭 변환 4원칙 명시. (MUST)

### A.8-3. §2 프로세스별 BPMN 상세
- 각 프로세스는 §A.7-3 텍스트 다이어그램 형식. (MUST)
- 응답별 화면 동작: **200 성공 / 4xx 에러 / 5xx 에러** 최소 3가지 포함. (MUST)
- 선행 조건(`isDirty`, 상태 체크)은 다이어그램 상단에 배치. (MUST)

### A.8-4. §3 에러 처리 매트릭스
- 열: `HTTP 상태 | 에러 코드 | 화면 처리 | 사용자 메시지` (MUST)
- 최소 포함: 400 / 401 / 403 / 404 / 409 / 422 / 500 / timeout / network (MUST)

### A.8-5. §4 데이터 연동 및 부수 효과
- §4.1 상태 전이 부수 효과 열: `상태 전이 | 부수 효과 | 대상 모듈 | 설명` (MUST)
- §4.2 참조 무결성 열: `관계 | 제약 | 위반 시` (MUST)
- §4.3 동시 수정 방지 방식(§A.4-2) 명시. (MUST)

### A.8-6. §5 화면 생명주기

**§5 는 자유 서술 금지 (MUST)**. 다음 표 양식만 허용 (표(단계/이벤트/동작/호출 액션) 4열 고정).

| 단계 | 이벤트 | 동작 | 호출 액션 |
|---|---|---|---|
| onMount | 화면 진입 |  |  |
| onUnmount | 화면 이탈 (메뉴 이동 / 뒤로가기) |  |  |
| onBeforeUnload | 브라우저 새로고침 / 닫기 |  |  |

위 3 행은 **MUST** (모두 채움). 화면 고유 단계는 행 추가 가능. 분석리포트 §10 업무 규칙 + §11 API 패턴 인용 위에 추가 컬럼·행으로 보강. `isDirty` 같은 화면 상태 분기는 "동작" 컬럼에 IF 분기로 표기.

### A.8-7. §6 특이사항

> **(MUST)** Q-NNN 양식 정본은 [`templates/분석리포트.template.md §13`](../templates/analysis-report/04-api-decisions-gaps-gates.md) — 7 컬럼 표. BPMN설계서 §6 은 분석리포트 §13 의 BPMN 관련 행만 **인용** 한다 (자체 추가 금지). 자체 추가 시 정합체크서 §G 가 ✗ 로 추적.

> 신규 [확인필요] 항목 발견 시 **분석리포트 §13 갱신 → §6 인용** 순으로 처리 ([templates/분석리포트.template.md §16](../templates/analysis-report/04-api-decisions-gaps-gates.md) 인용 양식).

## A.9. 개발가이드 연계 규칙

BPMN 설계서는 **BackEnd BPMN 개발가이드 §3 핵심 일치 규칙 6가지** 및 **Frontend 개발가이드** 와 양방향 정합되어야 한다. (MUST)

### A.9-1. BackEnd / BPMN 연계 (v2)

| 일치 키 | 설계서 위치 | 개발가이드 위치 |
|---|---|---|
| 파일명 (`{serviceId}.bpmn`) | §1 문서 정보 (serviceId) | BE v2 Part B §3, §4-2 |
| process id | §2-1 (서비스 확정 값) | BE v2 Part B §3 |
| Bean명 | §2-1 | BE v2 Part B §3, Part A §7-4 |
| method | §1.1 | BE v2 Part B §3, Part A §7-4 |
| DTO | §1.1 | BE v2 Part B §3, Part A §7-3 |
| action | §1.1 action 열 | BE v2 Part B §3, §6-1 |
| URL 표준 | §A.2-3 `POST /oasis/{serviceId}/{action}` | BE v2 Part B §3 |

### A.9-2. Frontend 연계 (「FrontEnd_표준_통합_개발가이드_v2.md」)

| 설계 산출물 | Frontend v2 대응 | 정합 규칙 |
|---|---|---|
| §1.1 API-ID · URL · action | §14-1 `{name}-api.ts` 함수 + `apiRequest` 호출 | URL `POST /oasis/{serviceId}/{action}` 1:1. Method 는 모두 POST |
| §1 moduleId / serviceId | §2-2 최소 확정값 | FE/BE 모두 동일 값 |
| §2 Request Body (조회) | §10-1 plain DTO + §10-2 | `meta/params/grids` 래핑 금지 |
| §2 Request Body (저장) | §10-3 최상위 키 3자 일치 + §9-3 rowStatus | 단일 Grid = `master`, Master-Detail = `master`+`detail` 고정. `items`/`rows` 금지 |
| §2 Response shape | §14-1 `Promise<XxxResponse>` | JSON 구조 1:1 |
| §3 에러 매트릭스 | §8-2 Level A (`meta`) + Level B (`errors`) | `meta.message` → `useGfnMessage` 1회 표시. `errors[].grid` = body 키 |
| §3 400 field errors | §8-4 Level B 6필드 (`grid, rowKey, rowIndex, field, code, message`) | 재매핑 금지 |
| §4.3 동시 수정 방지 (updatedAt) | §14-1 `{name}-api.ts` body 포함 | FE 가 `updatedAt` 을 body 에 포함 전송 |
| §A.4-1-3 일괄 저장 | §9 `useGridDataManager` + SavePayload → §10-3 변환 | rowStatus C/U/D (R 제외) |
| §A.4-1-4 연계 조회 | `search{SubResource}` action | FE Modal 에서 `apiRequest` 호출 |

### A.9-3. 검증 절차
1. API-001 ~ API-NNN 각각 BackEnd 6가지 일치 키 확인
2. 기능설계서 §5 버튼ID ↔ BPMN설계서 API-ID 매핑 누락 없음
3. 상태 전이(기능 §7.2) ↔ 상태 변경 API(BPMN §2.7) 1:1 매칭
4. BPMN §2 Request Body 가 Frontend `{name}-api.ts` 가 생성 가능한 shape 인지 확인 (§A.5-4 plain DTO, rowStatus)
5. BPMN §3 에러 shape 가 Frontend §8-2 와 동일한지 확인

### A.9-4. 불일치 발견 시
- 설계가 개발가이드(BackEnd 또는 Frontend)를 벗어나면 **개발가이드를 따른다**. (MUST)
- 개발가이드에 없는 케이스이면 §6 특이사항에 기록 후 개발팀과 협의. (MUST)

---

## A.10. 케이스 선택표

| 프로세스 유형 | 흐름 패턴 | 필수 요소 |
|---|---|---|
| 단순 조회 | GET + 페이징 + 응답별 처리 | 0건 처리 |
| **통합 조회 (다단 그리드)** | 단일 GET → 응답 `{top, bottom}` 분리 | 상태코드 등 구분 필드 기반 분리 |
| 단건 상세 | GET + 404 처리 | isDirty 체크 |
| 신규 등록 | POST + 유효성 + 채번 + 201 | 서버 채번 / 필드 에러 매핑 |
| 수정 (동시수정) | PUT + 낙관적 락 + 409 | updatedAt 비교 |
| **그리드 일괄 저장 (인라인 편집)** | `POST /oasis/{serviceId}/save` body `{ master: [...rowStatus...] }` + 행별 updatedAt + 1 트랜잭션 | 행별 에러 리포트 (Level B) |
| 삭제 | DELETE + 상태/참조 체크 | 422 처리 |
| **상태 변경 (단일 계층)** | PATCH + 전이 검증 + 부수 효과 | Demand/Inventory 연동 |
| **계층별 상태 변경 (다계층)** | 계층별 **각각** PATCH 엔드포인트 | 각 계층 독립 전이 + 계층 간 자동 연동 §4.1 |
| **분할/합치기** | POST `/split` 또는 `/merge` + 원자성 트랜잭션 | 원 건/신규 건 식별 관계 (ORIGINAL_ID) |
| **업무 특화 연계 조회** | 서브 리소스 GET `/{id}/{sub}` | 본 리소스와 별개 권한/캐싱 |
| **업무 특화 연계 편집 이동** | 별도 화면 URL 이동 | `?fromInspection={id}` 컨텍스트 전달 |
| 팝업 경유 액션 | 팝업 입력 → 액션 API | 팝업 반환값 → body 매핑 |
| 파일 업로드 | multipart + 진행률 | 에러 행 리포트 |

---

## A.11. 가이드 외 시나리오 대응

1. §A.10에 없는 프로세스 → 가장 가까운 케이스 선택 → §6 특이사항 기록.
2. BPMN 개발가이드 §11 에도 없으면 **설계/개발 합동 리뷰**를 거친 후 반영.
3. 비동기 큐/스케줄러/이벤트 기반 프로세스는 별도 설계 문서로 분리. (MUST)

---

## A.12. 완료 체크리스트

### A.12-1. 설계 전
- [ ] 기능설계서 §5/§7/§9 확정
- [ ] 프로세스 ID / Bean명 / Base URL 확정
- [ ] §A.3-2 필수 흐름 중 해당 화면 적용 항목 선별
- [ ] 상태 전이 시 부수 효과 범위 파악
- [ ] **기존 ERP 원본 소스 확보** — `docs/external/KsmErpK/orgErpSource/`
- [ ] **As-Is 프로시저/함수/트리거/뷰 확보** — `docs/external/KsmErpK/{procedures,functions,triggers,views}/`
- [ ] **기존 소스에서 Controller/Service/SP/Trigger 로직 추출** (§A.2-2-2)
- [ ] **To-Be 테이블 설계서 확보** — `docs/external/DMES/DMES-SECTION-{MODULE}_테이블정의서.xlsx`
- [ ] **As-Is ↔ To-Be 테이블 매핑** 확인 — `docs/{moduleId}/reference/mapping/{화면식별자}_mapping.md`
- [ ] 기존 소스 로직 중 To-Be에서 달라지는 부분 식별

### A.12-2. 설계 후
- [ ] §1 표기 컨벤션 박스
- [ ] §1 문서 정보에 **Frontend 연계 값**(mesModule / `screenId(=pageId=serviceId)` / 페이지 유형) 기록 (기능설계서 §1.2 와 동일)
- [ ] §1.1 URL 이 표준 `POST /oasis/{serviceId}/{action}` 형식. 복수형·하이픈(APS 예외 제외)·`/api/backend/` 금지
- [ ] moduleId / serviceId 확정. **MES**: `serviceId = screenId = pageId` 단일 camelCase `{화면명}` = BPMN 파일명 (예: `orderRegistration.bpmn`) / **APS 예외**: kebab
- [ ] §1.1 모든 버튼 매핑 포함
- [ ] §2 각 프로세스에 트리거/요청/서버처리/응답 4단계 모두
- [ ] §2 Request Body 가 **plain DTO** shape (meta/params/grids 래핑 없음)
- [ ] §2 Grid 저장 Request 가 **v2 최상위 키** `{ "master": [...rowStatus...] }` (단일) 또는 `{ "master": [...], "detail": [...] }` (Master-Detail) 형태
- [ ] 응답 케이스 200 성공 + 4xx 에러 + 5xx 에러 최소 3개
- [ ] §3 에러 매트릭스 9종 (400/401/403/404/409/422/500/timeout/network) 등록
- [ ] §3 에러 shape: Level A `{ meta: { success, code, message } }` (필수) + Level B `{ meta, errors: [{ grid, rowKey, rowIndex, field, code, message }] }` (저장형 Grid 조건부)
- [ ] §4.1 타 모듈 영향 모두 등록
- [ ] §4.2 참조 무결성 DB 컬럼 대문자 SNAKE_CASE
- [ ] §4.3 동시 수정 방지 방식 명시 (updatedAt 포함 여부)
- [ ] BPMN 일치 키 6가지 BackEnd 개발가이드와 일치
- [ ] Frontend 연계 (§A.9-2) 검증 — URL·Method·body shape·에러 shape
- [ ] API-ID ↔ 기능설계서 버튼ID 매핑 누락 없음
- [ ] §6 특이사항 최소 1건 기록

---
---
