# 04. 케이스, 체크리스트, 메뉴 인프라

> 상위 문서: [BackEnd 표준 개발 가이드 V2](../../BackEnd_표준_통합_개발가이드_v2.md)

## 10. 케이스 선택표

| 상황 | 기본 패턴 |
|---|---|
| 단순 조회 | JPA + SearchRequest/Response + 조회 Service |
| 단순 저장/삭제 | JPA + 저장 Service |
| 복합 조회 | MyBatis Mapper + 조회 Service |
| Master-Detail 저장 | 2개 List<Map> 시그니처 |
| 공통 검증 오류 처리 | ErrorDetail 수집 후 일괄 throw |

---

## 11. 가이드 외 시나리오 대응 정책

본 가이드와 부속 문서(「Part B: BPMN 표준 개발 가이드」, 「Part C: cactus-core 레퍼런스」) 에 명시되지 않은 시나리오는 다음 절차를 따른다.

### 11-1. 절차 (MUST)

1. 본 가이드의 케이스 분류 (「3-2 케이스별 필수 파일」, 「10 케이스 선택표」) 와 일치하는 항목이 있는지 다시 확인한다.
2. 「Part C: cactus-core 레퍼런스」 에 사용 가능한 클래스 / ErrorCode 가 있는지 확인한다.
3. 위 두 단계로 해결되지 않으면 **개발을 멈추고** 사용자에게 처리 방향을 확인한다.
4. 결정된 사항은 가이드 또는 레퍼런스 문서에 추가하여 다음 작업부터 표준화한다.

### 11-2. 임의 처리 금지 (MUST NOT)

- 가이드에 없는 패턴을 추측으로 구현하지 않는다.
- 「Part C: cactus-core 레퍼런스」 에 없는 ErrorCode 상수를 임의로 사용하지 않는다.
- 「Part C: cactus-core 레퍼런스」 에 없는 cactus-core 클래스를 추측 import 하지 않는다.
- 일반 Spring/JPA 패턴이라도 본 가이드 표준과 충돌하면 적용하지 않는다.

### 11-3. 본 가이드 범위 외로 알려진 시나리오

다음 항목은 현 가이드 범위 외이며, 별도 결정 없이 진행 금지.

- 페이지네이션 (Pageable, Page<T>)
- 정렬 옵션 (Sort)
- 파일 업로드 / 다운로드
- 엑셀 익스포트
- 비동기 작업 / 스케줄 작업
- WebSocket / Server-Sent Events
- 외부 시스템 동기 호출 (RestTemplate, WebClient 등)
- 1:N JPA 연관관계 매핑

### 11-4. 품질 통제 최소 원칙

- SHOULD: Service 단위 테스트는 저장 로직(검증 분기, 일괄 throw) 에 대해 최소 1건 이상 작성한다.
- MUST: 빌드는 표준 `./gradlew build` (또는 프로젝트 기본 명령) 로 통과한다. 경고는 허용되나 에러는 0 건이다.
- MAY: 린터/포매터는 프로젝트 기본 설정을 따른다. 프로젝트 설정이 없는 경우 본 가이드 범위 외이다.

### 11-X. 외부 도메인 / 인프라 미구축 처리 (MUST)

외부 master 도메인 (`master.Material` / `master.Customer` / `wwUser` 등) 또는 외부 인프라 (mybatis SqlSession / RBAC role 등) 가 미구축 상태에서:

1. **임의 시뮬레이션 Entity 를 본 모듈에 생성하지 않는다.**
   - **사례**: `master.JobInfo` 를 mpp 모듈 안에 `B_JOB_INFO` Entity 로 직접 생성 → 도메인 경계 침범 = MUST NOT.

2. **사용자에게 명시적 동의 요청** — "도메인 X 가 미구축이라 Y 가 불가능합니다. Q-NNN deferred 로 등재 + placeholder 처리하겠습니다" 라고 보고.

3. **동의 후 분석리포트 §13 + 정합체크서 §G 에 Q-NNN 등재.**

4. **코드에는 placeholder 토스트** ("X 도메인 구현이 필요합니다 (deferred — Y 후 활성화)") **처리.**

5. **master 도메인 / 인프라 구축 후 placeholder 해제 + 정합체크서 갱신.**

**인프라 격차** (예: Phase 7 mybatis → OASIS 단일 simplification):
- 외부 도메인 미구축과 **별도 카테고리**.
- 결정 사유 + 향후 전환 조건을 분석리포트 §11.2 (채택 결과) 또는 화면별 Decision Log (§11-X-6) 에 등재.

**6. 위 절차 위반 시 정합체크서 §K 가 ✗ 되어 §12-4 의 재개발 의무 발동.**

### 11-Y. Phase 7 라우트 자동 등록 조건 (MUST · 모듈별 사용 가능 범위)

cactus-core 의 `InboundAutoConfiguration` 은 `QueryController` (`/query/{queryId}` + `/query/service/{serviceId}` + `/service/{serviceId}`) 를 `@ConditionalOnBean(SqlSession.class)`, `LovController` (`/lov/master/{code}/{group?}` + `/lov/query/{queryId}` + `/lov/service/{serviceId}`) 를 `@ConditionalOnBean({SqlSession.class, OasisServiceExecutor.class})` 조건으로 등록한다. **MyBatis `SqlSession` 빈을 등록하지 않은 모듈에서는 두 컨트롤러 자체가 빈으로 등록되지 않아 해당 path 호출은 runtime 404** 가 된다.

| 모듈 | SqlSession 등록 | Phase 7 6 종 라우트 사용 | 명명 룰 |
|---|---|---|---|
| `aps` | ✓ (`@MapperScan` + `*Mapper.java` 다수) | **허용** | APS 별도 규약 (§3-1 / §5 APS 예외) |
| `mpn` | ✓ (mybatis 사용) | **허용** | APS 별도 규약 (§3-1 / §5 APS 예외) |
| `mpp` | ✗ (JPA + OASIS BPMN 전용) | **금지 — 무조건 OASIS** | MES 단일 식별자 (camelCase) |
| `mqc` | ✗ (JPA + OASIS BPMN 전용) | **금지 — 무조건 OASIS** | MES 단일 식별자 (camelCase) |
| `mls` | ✗ (JPA + OASIS BPMN 전용) | **금지 — 무조건 OASIS** | MES 단일 식별자 (camelCase) |
| `mas` | ✗ (JPA + OASIS BPMN 전용) | **금지 — 무조건 OASIS** | MES 단일 식별자 (camelCase) |
| `mcm` | ✗ (JPA + OASIS BPMN 전용) | **금지 — 무조건 OASIS** | MES 단일 식별자 (camelCase) |

- **MUST**: BE 측에서 `mpp` / `mqc` / `mls` / `mas` / `mcm` 화면 호출은 **OASIS handler (`POST /api/{moduleId}/oasis/{serviceId}/{action}` — BFF→BE 변환 후 `POST /oasis/{serviceId}/{action}`)** 만 노출한다.
- **MUST (MES 4 모듈 명명)**: `mpp` / `mqc` / `mls` / `mas` 의 `serviceId` 는 §5 의 `{화면명}` 단일 토큰 camelCase 식별자 룰을 따른다 (모듈명·그룹명 prefix 없음). API URL `serviceId` 자리에 모듈 prefix 부착형 (`mlsPlateSlittingMgmt`) 이나 임의로 줄인 별칭 (`product`, `plateSlitting`) 을 두지 않는다.
- **MUST**: LoV 마스터 코드 (`B029` / `B053` / `B055` / `B056` 등) 도 위 5 모듈에서는 **OASIS LoV BPMN service** 신설로 제공한다. `LovController.lovMaster` 가 SqlSession 의존이라 위 5 모듈에서는 라우트 미등록 = 404.
- **MUST**: 위 5 모듈에 후행으로 `@MapperScan` / `SqlSession` 빈을 임의 도입하지 않는다 (도메인 정책상 OASIS BPMN 단일화 결정). 도입이 필요하다고 판단되면 §11-X 결정사항 기록 (Decision Log) + 사용자 동의 후 진행.
- **MUST NOT**: 위 5 모듈의 FE 측 `apiQuery` / `apiQueryService` / `apiService` / `apiLovMaster` / `apiLovQuery` / `apiLovService` 호출 = runtime 404 = 정합체크서 §K 자동 ✗.


---

## 12. 완료 체크리스트

### 12-1. 개발 전
- [ ] base-package 가 확정되었는가?
- [ ] module / serviceId / beanName / action 이 확정되었는가?
- [ ] JPA 와 MyBatis 선택 기준이 정해졌는가?
- [ ] **분석리포트 §3 S-NNN 수량 추출 = N개?**
- [ ] **§4.3 G-NNN 수량 + GE-NNN 수량 추출?**
- [ ] **§4.5 B-NNN 수량 + §4.5-1 GB-NNN 수량 추출?**
- [ ] **§4.6 P-NNN 수량 추출?**
- [ ] **§6 V-NNN 수량 추출?**
- [ ] **§7 Entity 컬럼 목록 추출 (편집 가능 컬럼 / 외부 JOIN 컬럼 / 계산 컬럼 분류)?**
- [ ] **§10 LV-NNN 수량 추출?**
- [ ] **위 매트릭스 표가 작업 노트 또는 정합체크서 §A.2 에 기재되었는가?**
- [ ] **`./gradlew test --rerun` 실행 후 결과 0 실패 확인** (`BUILD SUCCESSFUL` + `0 tests failed` — 캐시 통과가 아닌 재실행 기준. 실패 시 §12-4 재개발 사이클 발동)

### 12-2. 개발 후
- [ ] Lombok, 필드 주입, Controller 작성 금지 규칙을 지켰는가?
- [ ] Entity 에 `@Table`, `@Column`, 기본 생성자, getter/setter 가 있는가?
- [ ] Repository 가 표준 인터페이스를 따르는가?
- [ ] Service 메서드 시그니처가 표준과 일치하는가?
- [ ] 저장 로직이 PK 검증을 먼저 수행하고 `C/U/D/R` 를 올바르게 처리하는가?
- [ ] 에러를 수집 후 일괄 throw 하는가?
- [ ] MyBatis 사용 시 INSERT/UPDATE 에 감사 컬럼 바인딩과 VER 처리가 있는가?
- [ ] 모든 import 가 「Part C: cactus-core 레퍼런스」 의 경로와 일치하는가?
- [ ] `@Service("beanName")`, BPMN `camunda:class`, `method`, `dto` 가 모두 일치하는가?
- [ ] BPMN 파일명과 API `serviceId` 가 일치하는가?
- [ ] **메뉴·권한 등재 (§13-3 MUST)**: 신규 화면(팝업 포함)마다 OBJECT · 메뉴 leaf · 역할 매핑 시드를 넣었는가? BPMN `actionGateway` 의 새 action 이 `PERM_ALL` 목록에 있는가?
- [ ] **메뉴·권한 실측**: admin 로그인 → 사이드바에서 화면 진입 → 조회·저장 등 모든 action 이 403 없이 동작하는가? (팝업은 사이드바에 뜨지 않고 부모 화면에서 열리는가?)

### 12-3. 설계서 ↔ 코드 1:1 대조 (MUST)

매 화면 개발 완료 시 다음 항목을 모두 ✓ 처리. 한 항목이라도 ✗ 면 미완성 판정 + §12-4 의 재개발 의무 발동.

**[결함 등급 전수 처리 의무 — A3·E2, MUST]**
- **결함 전부 처리: Critical / High / Medium / Low 4 등급 모두 등재 및 보완. "사소한 것은 생략" 금지.** 정합체크서 §A·§K 의 ✗ / △ 항목은 등급 무관 전수 처리한다. Low 등급이라는 이유로 △ 잔존 / 다음 사이클 이연 금지 (사용자 동의 받은 Q-NNN deferred 만 예외).
- 본 4 등급 분류는 [00_Agent지시_가이드.md §6.14 Phase 종료 자동 고해성사](../../../design/agent-directive/06-analysis-source-db-api.md) 와 정합한다.

**["해당 없음" 표기 기준 — A3·A5·E3, MUST]**
- **A3 ("해당 없음" 허용 범위 한정)**: "해당 없음" 표기는 **외부 도메인 미구축 (BE deferred / DB cascade / cross-module stub / Q-NNN deferred 등) 만** 허용한다.
  - 허용 예: "외부 wwUser 도메인 deferred 상태 — Q-MasterDomain-deferred 등재"
  - 허용 예: "As-Is 없음 (To-Be only 화면)"
- **A5 (검증 자체 누락 시 "해당 없음" 금지)**: 검증 항목 자체를 수행하지 않은 채 "해당 없음" 으로 표기 금지. 예를 들어 §K.5.1 의 매 행 As-Is `file:line` 인용 자체를 안 한 상태에서 "해당 없음" 처리하면 §K.5.0.1 위반 (✗ 자동).
- **E3 (해당 없음 사유 명시)**: "해당 없음" 표기 시 **사유** (어떤 외부 도메인 / 어떤 Q-NNN ID / To-Be only 화면 등) 를 함께 기재한다. 사유 없는 "해당 없음" = ✗ 자동.

- [ ] **Entity 컬럼 수 = 분석리포트 §7 Entity 컬럼 수** (정확히 일치 — 임의 추가/제외 0건)
- [ ] **§4.3 "편집 여부 N" 컬럼은 Entity 저장 컬럼이 아닌 동적 변환으로 처리되었는가?**
- [ ] **§4.3 "UI 표시 전용" / "(STUFF/JOIN)" 표시 컬럼은 동적 변환되었는가?**
- [ ] **그리드 컬럼 수 = §4.3 G-NNN + GE-NNN 수** (정확히 일치)
- [ ] **검색조건 수 = §3 S-NNN 수** (정확히 일치)
- [ ] **본체 버튼 수 = §4.5 B-NNN 수** (정확히 일치)
- [ ] **그리드셀 버튼 수 = §4.5-1 GB-NNN 수** (정확히 일치)
- [ ] **팝업 수 = §4.6 P-NNN 수** (정확히 일치)
- [ ] **LoV 매핑 = §10 LV-NNN 수** (정확히 일치)
- [ ] **검증 규칙 = §6 V-NNN 수** (정확히 일치)
- [ ] **정합체크서 §A.2 누락 검증 + §K (코드 정합) 모두 ✓?**
- [ ] 위반 시 §6-A-1~6-A-4 중 어느 항목에 해당하는지 명시?

**[As-Is 정합 매트릭스 — As-Is 가 있는 경우 MUST] (§K.5.0 절대 원칙 + 3단계 검증 차단 조항)**

본 체크박스는 `/analyze-service {SCREEN-ID}` 산출 cache (`sql_analysis.json`) + 분석리포트 §17.2-T1/T2/T3/T4 + 정합체크서 §K.5 (컬럼 단위 + UI 이벤트 + 표준 라이브러리 + 코드 인용/quote) 를 인용해 강제 검증한다. As-Is 가 없는 To-Be only 화면은 "해당 없음" 표기 후 통과.

**🚨 §K.5.0 절대 원칙 (정합체크서.template §K.5.0 인용) — 위반 시 즉시 ✗ 재개발 의무**:
- **§K.5.0.1 As-Is 1:1 보존**: 화면 구조 / 컬럼 / 상태값 / 데이터 동작 / 자동 연동 / 검증 로직 임의 변경 금지. 변경 사유에 "효율" / "단순화" / "표준에 맞춤" / "시간" / "유사" / "동등" 표현 등장 = ✗ 자동.
- **§K.5.0.2 Skip 금지**: T1~T4 모든 행 1:1 매핑 의무. "분량이 커서 다음" / "유사하므로 생략" = ✗ 자동.
- **§K.5.0.3 3단계 검증 의무**: A 추출 완전성 + B 수량 동일성 + C 임의 변경 검증 모두 통과해야 §K.5 ✓.

**1단계: 추출 완전성 검증 (§K.5.5.A)**

- [ ] **분석리포트 §17.2-T4 의 E-NNN ID** ↔ **정합체크서 §K.5.1 의 E-ID** 가 1:1 정합 (누락/추가 0건)
- [ ] **§K.5.1 매 행 = As-Is 1 컬럼 / 1 분기 / 1 이벤트 / 1 라이브러리** (case 단위 또는 INSERT/UPDATE 전체 단위 묶음 ✓ 표기 0건)
- [ ] **§K.5.1 모든 행에 As-Is 코드 위치** (`file:line` 형식) **+ As-Is 코드 quote** (본문 한 줄 이상) 보유
- [ ] **§K.5.1 ✓ 행 모두 BE 코드 위치** (`file:line`) **+ BE 코드 quote** 보유 — **인용/quote 누락 ✓ 행 = 0건** (있으면 ✗ 자동 전환)
- [ ] **§K.5.1 △ 행 모두 §G Q-NNN ID 인용** (예: `Q-MasterDomain-deferred` / `Q-MLS-deferred` / `Q-LoV-deferred`)
- [ ] **부속 dialog 별로 위 항목 각각 검증** (분석리포트 §17.3 의 부속 매핑 + 부속별 §K.5 인용)

**2단계: 수량 동일성 검증 (§K.5.5.B — §17.4 ↔ §K.5)**

- [ ] **§17.4 의 T1 카운트 (As-Is 컴포넌트 수) = §K.5.1 의 컴포넌트 행 수** 동일 (차이 발생 시 §G Q-NNN 등재 또는 §12 결정 후보 ID 인용 필수)
- [ ] **§17.4 의 T2 카운트 (이벤트 수) = §K.5.1 의 이벤트 행 수** 동일
- [ ] **§17.4 의 T3 카운트 (표준 라이브러리 수) = §K.5.1 의 라이브러리 행 수** 동일
- [ ] **§17.4 의 T4 SP case 컬럼 E-NNN 수 = §K.5.1 의 컬럼 행 수** 동일

**3단계: 임의 변경 검증 (§K.5.6)**

✗ 자동 전환 패턴 — 각 항목 0건 검증:

- [ ] **화면 구조 임의 분리/통합** — As-Is 1 화면이 To-Be N 화면으로 분리되었으나 §G Q-NNN / §12 결정 ID 인용 없음 = ✗ (예: As-Is 메인 grid1+grid2 통합 → To-Be moldMaster + moldAttach popup 분리 — 사유 없음)
- [ ] **컴포넌트 임의 제거** — As-Is 의 Grid/Btn/Txt/Combo 중 하나가 To-Be 에 매핑 안 됨 (T1 행에 To-Be 위치 빈 행) = ✗
- [ ] **이벤트 자동 연동 누락** — As-Is 의 OnGridRowSelectionChanged / OnGridCellDoubleClick / btn*_Click 등이 To-Be 에 대응 코드 없음 (T2 행 미매핑) = ✗
- [ ] **표준 라이브러리 호출 누락** — As-Is 의 AttachmentManager / AutoFillup / RfdCustomerDialog / NewCodeQuery 등이 To-Be 에 대응 처리 없음 (T3 행 미매핑) = ✗
- [ ] **상태값 hardcode 임의 변경** — 예: As-Is `'8'` → To-Be `'9'` 사유 없음 = ✗
- [ ] **테이블 임의 교체** — 예: As-Is `P_JIG_HISTORY` UPDATE → To-Be `P_MOLD_INFO.CUR_SL_CD` 임의 변경 = ✗
- [ ] **PK 키 단순화** — 예: As-Is 4-5 키 → To-Be 단일 IDENTITY 사유 없음 = ✗
- [ ] **컬럼 누락** — INSERT/UPDATE 의 As-Is 컬럼 중 To-Be Entity 에 부재 (Entity 컬럼 추가 결정 없음) = ✗
- [ ] **As-Is 외 BE 동작** (§K.5.2 X-NNN) 모든 행에 §12 결정 후보 ID 또는 §G Q-NNN ID 인용 보유

**(MUST NOT — 표면 통과 차단)**:
- As-Is 코드 인용/quote 없이 ✓ 표시 금지. 위반 시 §12-3 미통과 → §12-4 재개발 의무 자동 발동.
- 묶음 부수효과 ("MOLD_STATUS=4 + P_MOLD_POLISH INSERT + PUNCH_CNT 복사" 같은 한 셀) 금지. 부수효과 1건 = 1행.
- "분량이 커서 다음 응답에" / "유사하므로 생략" / "효율 위해 단순화" 표현 사용 시 §K.5.0.2 위반 — ✗ 자동.

차이 발생 시:
- 사용자 동의 받은 차이 → 정합체크서 §G 에 Q-NNN 등재 + △ 행 + ✓ 인정
- 사용자 동의 없는 차이 → ✗ 처리 + §12-4 재개발 의무 발동

### 12-4. 검증 실패 시 재개발 의무 (MUST)

§12-3 1:1 대조의 한 항목이라도 ✗ 면 다음 절차를 반드시 수행한다. 사용자에게 "이 정도면 완성된 것 같다" 라고 보고하는 행위 금지.

**[재개발 의무 사이클]**

**Step R-0. Phase 종료 자동 고해성사 (C1·E2 — MUST, R-1 직전 자체 점검)**

본 워커 / 개발자 스스로 다음 4 질문을 자체 점검한다. **숨기거나 임의 종료 금지**. 정본 절차는 [00_Agent지시_가이드.md §6.14](../../../design/agent-directive/06-analysis-source-db-api.md) 인용 (본 문서에서는 중복 기술하지 않는다).
- Q1. 본 Phase 에서 **잔존 ✗ / △ / 누락** 항목은 무엇인가? (모두 명시)
- Q2. 본 Phase 에서 **직접 검증하지 않은** 항목은 무엇인가? (E2 검증 정직)
- Q3. 본 Phase 에서 **As-Is 1:1 보존을 위반**한 임의 변경이 있는가? (있으면 §6-A 어느 항목 위반인지 분류)
- Q4. 본 Phase 에서 **사용자 동의 없이 진행한 단순화 / 캐싱 / 우회** 가 있는가?

위 4 질문에 모두 "없음" 으로 답해야 R-0 통과. 단 한 건이라도 "있음" 이면 그 항목을 ✗ 처리 후 R-1 진입.

**Step R-1. ✗ 항목 식별**
- R-0 에서 식별한 항목 + ✗ 처리된 체크박스 모두 나열
- 각 항목이 §6-A-1~6-A-4 중 어느 안티패턴에 해당하는지 분류

**Step R-2. 해당 단계로 복귀**
- Entity 컬럼 ✗ → §1-3 의 "3. Entity 작성" 단계로 복귀
- DTO 컬럼 ✗ → "5. DTO 작성" 단계로 복귀
- Service 메서드 ✗ → "6. Service 작성" 단계로 복귀
- BPMN action ✗ → "7. BPMN 연결" 단계로 복귀
- 그 외 → 해당 단계로 복귀

**Step R-3. 사용자 동의 필요 여부 판단**
- 단순 코드 수정으로 ✓ 가 가능 → 코드 수정 후 재검증
- 설계서 항목을 의도적으로 추가/제거/변경 필요 → 사용자에게 명시적 동의 요청
  - 동의 받으면 Q-NNN 등재 후 ✓ 인정
  - 동의 못 받으면 설계서대로 복원 (§6-A 임의 변경 금지 적용)

**Step R-4. 재검증**
- §12-3 1:1 대조 다시 수행
- 또 다른 항목이 ✗ 일 수도 있음 → R-1 로 복귀

**Step R-5. 종료 조건**
- 모든 항목이 ✓ 일 때만 화면 개발 완료 판정
- 그 외에는 R-1~R-4 사이클 반복

**[금지 사항 — 재개발 우회 (MUST NOT)]**
- "이 정도면 됐다" 라며 ✗ 인 채로 종료 보고 → MUST NOT
- 검증 항목 자체를 임의로 ✓ 처리 → MUST NOT
- 사용자 동의 없이 설계서 항목을 ✗ 회피용으로 임의 변경 → MUST NOT (§6-A 위반)

---

## 13. 2026-06-05 Phase 1~4 — 동적 메뉴 인프라

DB 메뉴 트리를 단일 SoT 로 삼고 FE 라우팅에서 정적 매핑 (구 `module-pages.ts`) 의존을 제거한 인프라 변경. BE / FE 양쪽 표준 패턴을 동시 등재한다.

### 13-1. DB 메뉴 트리 endpoint — derived `componentPath` (MUST)

- **MUST**: 메뉴 트리 응답 (`SecUserService.getMyMenus` / `getMyMenusTree`) 의 **leaf row** 에는 BE 측에서 derived 컬럼 `componentPath = PARENT_MENU_ID + "/" + OBJECT_ID` 를 채워 내려보낸다. 폴더 row (`MENU_TP = 'FLD'` 또는 leaf 아님) 는 `componentPath = null` 강제.
- **MUST**: `PARENT_MENU_ID` 또는 `OBJECT_ID` 중 한 쪽이 null / blank 인 leaf row 도 `componentPath = null` 로 보낸다 (FE 가 sysCd+path+pageName fallback 으로 자체 복구).
- **참조 구현**: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/security/service/SecUserService.java:392-394` — 폴더는 `row.put("componentPath", null)` (line 357), leaf 는 PARENT_MENU_ID + "/" + OBJECT_ID concat.
- **이유**: FE 라우팅의 group/leaf 조립을 DB SoT 로 끌어올려, 신규 화면 추가 시 FE 측 정적 매핑 파일 (구 `module-pages.ts`) 수정 의무를 제거. `PARENT_MENU_ID` 가 group 토큰 (cma/csa/cme) 이고 `OBJECT_ID` 가 camelCase leaf 토큰이라는 §5 D2-Menu 규약과 자연 정합.

### 13-2. 메뉴 시드 — OBJECT_ID camelCase assertion (MUST)

- **MUST**: `TB_MCM_SEC_MENU` 시드 진입점은 **빌드 타임 정규식 차단**으로 OBJECT_ID 룰 위반을 차단한다.
  - 정규식: `^[a-z][a-zA-Z0-9]*$` (소문자 시작 + 영숫자만, 첫 글자 lowercase).
  - 위반 시: `IllegalStateException("OBJECT_ID camelCase 룰 위반 — menuId=... objectId='...'. 허용 패턴: ^[a-z][a-zA-Z0-9]*$")` throw — 시드 단계에서 즉시 실패. 런타임 라우팅 실패 회피.
  - `null` 입력은 허용 (root 그룹 폴더는 `TB_MCM_SEC_MENU_FLD` 가 owner — OBJECT_ID 부재).
- **참조 구현**: `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` 의 `insertMcmSecMenuIfAbsent` (7-인자 오버로드 head + camelCase 정규식).
- **이유**: FE 의 `page-components/{group}/{leaf}/page.tsx` 폴더명과 1:1 일치해야 codegen PAGE_REGISTRY 키 = DB componentPath 키가 정합 — 시드 시점에서 차단하지 않으면 런타임 404 / 모듈 미발견 오류.

### 13-3. 신규 메뉴·권한 등재 절차 (MUST)

**화면 개발(MES·APS 공통)은 메뉴와 권한 등재까지 끝나야 완료다.** 코드와 테스트가 통과해도 등재가 빠지면 사용자는 화면에 들어가지 못하거나, 들어가도 모든 호출이 403 이다. 특히 OBJECT 행이 없으면 admin(SYSADMIN)도 `EndpointPermissionFilter` 에서 403 을 받고, 증상은 "조용한 빈 데이터"로만 보인다(2026-08-12 cmb 6 화면 누락 사례).

시드 위치는 `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/` 이다. `DataInitializer.java` 가 단계 호출 순서를 정하고, 단계 본문은 `seed/` 패키지의 역할별 Seeder 에 있다(코어 RBAC·`PERM_ALL` action 목록 `CoreRbacSeeder`, 업무 모듈 메뉴 `ModuleMenuSeeder`, MDM 메뉴 `MdmMenuSeeder`). 모든 헬퍼가 `insertIfAbsent` 계열이라 멱등이다. 신규 업무 모듈은 `ModuleMenuSeeder.seedAnalogMenus()` 를 본보기로 같은 클래스에 `seed{Module}Menus()` 를 만들고 `DataInitializer.seedMcmSecRbac()` 의 "확장 지점" 주석 자리에서 호출한다. 기존 모듈에 화면을 더할 때는 그 모듈의 seed 메서드에 행을 추가한다.

신규 화면(팝업 포함) 1건마다 아래 다섯 단계를 모두 수행한다.

1. **식별자 확정**: 화면명을 `screenId` 정본(§5 명명 규칙)으로 확정한다. camelCase 단일 토큰이며, OBJECT_ID · 메뉴 `objectId` · OASIS `serviceId` · FE 폴더명이 모두 이 값이다.
2. **OBJECT 등재** — `TB_MCM_SEC_OBJ`: `insertMcmSecObjIfAbsent(screenId, 화면명, systemCode)`. `systemCode` 는 FE `moduleId`(예: `mcm`, `mpp`, `analog`)다. `UserPermCache` 는 이 OBJECT_ID 로만 PermKey(`{objId}/{action}`)를 만든다.
3. **메뉴 등재** — `TB_MCM_SEC_MENU`(leaf) / `TB_MCM_SEC_MENU_FLD`(폴더):
   - 그룹 폴더가 없으면 `insertMpnFld(groupId, menuSeq, 그룹명, moduleRoot, fullSeq)` 로 먼저 만든다(이름의 Mpn 은 legacy, 모듈 무관).
   - leaf 는 `insertMcmSecMenuIfAbsent(screenId, "001", fullSeq, 화면명, groupId, screenId)` 로 넣는다. `parentMenuId` = group 토큰(3 글자), `objectId` = screenId.
   - **팝업**도 leaf 로 등재하되 7-인자 오버로드로 `viewYn="N"` 을 준다. 사이드바에는 뜨지 않고, 메뉴·역할 화면에서 화면과 똑같이 RBAC 를 다룰 수 있다.
   - FULL_SEQ 는 7자리 인코딩(모듈 백만 / 그룹 만 / 화면 +100·+110…)을 따른다. 부팅 끝의 `recomputeMenuFullSeq()` 가 트리 위치 기준으로 재부여한다.
4. **역할 매핑** — `TB_MCM_SEC_ROLE_MAPPING`: 최소 `(SYSADMIN, screenId, PERM_ALL)` 1행을 `insertIfAbsentComposite` 로 넣는다. 설계서가 업무 역할(조회 전용 등)을 정의하면 그 역할 × OBJECT × PERMISSION 행도 함께 넣는다. 역할·권한 데이터 모델은 [RBAC-PATH-CONVENTION §5.1](../../../Security/RBAC-PATH-CONVENTION.md) 을 따른다.
5. **action 등재** — `TB_MCM_SEC_PERM.PERMISSION_ACTION`: 화면 BPMN 의 `actionGateway` 분기명 중 `CoreRbacSeeder.seedCoreRbac()` 의 `allActions` 목록에 없는 것을 추가한다. **목록에 없는 action 은 SYSADMIN 도 403 이다.** 조회는 되는데 콤보·팝업·저장만 실패하는 형태로 나타난다. 이미 시드된 DB 는 `ensurePermAllActions` 가 부팅 때 누락분을 append 한다.
   ```bash
   grep -h 'sourceRef="actionGateway"' src/backend/{moduleId}/**/services/**/*.bpmn
   ```

그 다음:

- 빌드·부팅 → 시드 정규식(§13-2) 통과 → leaf row 의 derived `componentPath` 가 `{group}/{screenId}` 로 응답에 실린다.
- FE 페이지는 `page-components/{group}/{screenId}/page.tsx` 에 작성한다. 빌드 시 codegen(FE 가이드 §11-2)이 자동 등재한다.
- **실측(완료 조건)**: admin 으로 로그인해 사이드바에서 화면에 들어가고, 설계서의 모든 action(조회·저장·콤보·팝업)이 403 없이 동작하는지 확인한다. §12-2 체크리스트의 메뉴·권한 두 항목이 이것이다.

### 13-4. legacy 호환 메모

- 2026-06-05 이전 시드 데이터 중 `OBJECT_ID` 가 PascalCase / `_` 포함 등 룰 위반인 행은 마이그레이션 대상 — 본 정규식 가드 진입 후 부팅이 실패하므로 마이그레이션 PR 분리.
- FE 측 `module-pages.ts` 파일은 2026-06-05 완전 제거되었다 (FE 가이드 §11-4). BE 측에는 명시 호출처 없음 — 본 §13-1 의 derived `componentPath` 만 표준.

---
