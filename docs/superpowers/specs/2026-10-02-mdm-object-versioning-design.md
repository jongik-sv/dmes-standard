# MDM 버전 관리 확장 — 룰 세트·레이아웃·헤더 + major/minor 통일 설계

- 작성일: 2026-10-02
- 브랜치: `feat/mdm-versioning` (워크트리 `.claude/worktrees/mdm-versioning`, dev 8ca2aff6 기준)
- 결정 번호: D-144(이 설계 전체), ADR-0006(06:905·03:72 번복)
- 관련: ADR-0002(결재 없는 확정), ADR-0005(룰 세트 엔진 실행), D-135 하위 세트 호출 스펙(`2026-10-01-rule-set-flow-subset-call-design.md`)

## 1. 목적

룰 세트와 레이아웃(헤더 포함)에도 룰·마스터코드와 같은 버전 관리를 둔다. 사용자가 고른 목적은 넷이다(2026-10-02).

1. 편집 중 운영 보호 — 고치는 도중의 흐름·레이아웃이 운영에 반영되지 않는다.
2. 적용 시점 예약 — `apply_from` 으로 전환 시각을 정한다.
3. 과거 판정 재현 — 시각 T 에 어떤 정의로 판정·직렬화했는지 되짚는다.
4. 되돌리기 — 이전 확정 버전으로 돌아간다.

동시에 네 대상(마스터코드·룰·룰 세트·레이아웃)의 번호 체계와 버튼을 major/minor 로 통일한다.

## 2. 번복하는 기존 결정

| 기존 결정 | 위치 | 바뀌는 내용 |
|---|---|---|
| "버전·승인·배포 단위는 룰이다. 룰 세트는 버전 없는 실행 순서 목록으로만 둔다"(2026-09-07) | 06-business-rule.md:905, :927, PRD AC-4, ADR-0005:72 | 룰 세트도 버전 단위다. 저장은 DRAFT 에만 쓰고, 확정해야 운영에 반영된다 |
| 레이아웃 "상태·승인·소유자는 두지 않는다 … 저장하면 바로 배포한다"(2026-09-09) | 03-interface-layout.md:72, 06:988 | 레이아웃·헤더도 DRAFT·소유자·확정·확정취소를 갖는다 |
| 레이아웃 "바뀌었을 때만 +1"(I15), 헤더 저장 시 사용 전문 연쇄 재계산(I18) | tasks/TSK-05-03/design.md | 둘 다 폐지. 버전은 사람이 새 버전 버튼으로 만들고, 헤더 변경은 판정 시각 해석으로 전문에 반영된다 |
| 룰 버전 정수(06:971) | V8, `VersionTarget.BUSINESS_RULE` scale 0 | `DECIMAL(7,3)` + `VER_KIND` |
| 하위 세트는 "호출 시점의 저장된 현재 행"(D-135 C-D2) | subset-call 스펙 :257, §14 | 하위 세트도 판정 시각의 RELEASED 버전 |

원천 설계 문서(`docs/mdm/design/basic/` → `/Users/jji/project/mdm/docs/design` 심볼릭 링크)도 같은 내용으로 고친다(§9).

## 3. 핵심 결정 (사용자 확정 2026-10-02)

| # | 결정 | 내용 |
|---|---|---|
| K1 | 참조는 판정 시각으로 해석(A안) | 세트→룰, 전문→헤더, EAI→헤더, 세트→하위 세트 모두 ID 만 참조한다. 실행·직렬화 시각 T 에 유효한 RELEASED 버전을 고른다. 참조하는 쪽 버전에 상대 버전을 박지 않는다 |
| K2 | 세트와 룰은 독립 | 세트 새 버전은 흐름만 바꾸고 룰 버전을 건드리지 않는다. 룰만 새 버전을 확정하면 그 `apply_from` 부터 세트 안에서도 새 룰 버전이 쓰인다 |
| K3 | 번호 체계 통일 | 네 대상 모두 `VER DECIMAL(7,3)` + `VER_KIND`(MAJOR·MINOR). major 는 `floor(최대)+1`, minor 는 `최대+0.001`(상한 999). 차이는 번호와 종류 표시뿐이고 처리 경로는 같다(04:282) |
| K4 | 헤더도 버전 대상 | 헤더 레이아웃은 전문 레이아웃과 같은 버전 흐름을 갖는다 |
| K5 | 소유자 | 룰 세트·레이아웃·헤더의 DRAFT 도 소유자(선점·해제·넘기기)를 둔다 |
| K6 | 저장 구조(3안) | 룰 세트는 버전 행에 정의 JSON 을 둔다. 레이아웃은 자식 테이블 키에 `VER` 를 넣는다 |
| K7 | 단계 분할 | 1단계 공통 엔진+룰, 2단계 룰 세트, 3단계 레이아웃·헤더. 단계마다 계획·구현·병합을 따로 한다 |

## 4. 공통 버전 엔진

### 4.1 표준 칼럼 규약

버전 테이블은 다음 칼럼 이름을 그대로 쓴다. 새 테이블은 처음부터 이 이름으로 만든다. `VersionRowStore` 가 이 이름을 고정해 쓰므로(VersionRowStore.java:45-51) 코드 변경 없이 재사용한다.

| 칼럼 | 의미 |
|---|---|
| `<객체ID>`, `VER DECIMAL(7,3)` | 키 |
| `VER_KIND` | MAJOR·MINOR. 만든 뒤 바꾸지 않는다 |
| `STATUS` | DRAFT·REQUESTED·APPROVED·RELEASED·CANCELLED(실사용은 DRAFT·RELEASED) |
| `BASE_VER` | 복사해 온 버전 |
| `OWNER_ID` | DRAFT 소유자 |
| `APPLY_FROM`, `APPLY_TO` | 적용 구간. DRAFT 가 아니면 필수 |
| `REQUESTED_BY`, `REQUESTED_AT`, `RELEASED_AT` | 확정 기록(ADR-0002 D3·D5) |
| `ROW_VERSION` | 낙관적 잠금 |
| 감사 칼럼, `AUD_VER` | 감사 카운터(D-034) |

부모 테이블은 `STATUS` 를 `CREATED`→`INUSE`→`DEPRECATED` 로 둔다. 첫 확정 때 공통 엔진이 `CREATED`→`INUSE` 로 올린다(`markParentInUse`). 폐기·되살리기는 부모 단위다.

### 4.2 엔진 확장

- `VersionTarget` 에 `RULE_SET("TB_MDM_RULE_SET_VER", 3)`, `LAYOUT("TB_MDM_LAYOUT_VER", 3)` 를 더한다. `BUSINESS_RULE` scale 을 3 으로 바꾼다. 헤더는 `LAYOUT` 과 같은 테이블이므로 대상을 따로 두지 않는다.
- `DefaultVersionTableRegistry` switch 에 두 대상을 더한다.
- `VersionRowStore` 의 객체 ID 바인딩은 문자열이다. 레이아웃 ID 는 INTEGER 이므로 SQLite 의 타입 친화도로 비교되는지 시험으로 확인하고, 안 되면 `VersionTableSpec` 에 `objectIdNumeric` 플래그를 더해 `Long` 으로 바인딩한다.
- 대상마다 `VersionConfirmCheckSpi`, `VersionDraftDeletionSpi` 를 구현한다(없으면 fail-closed, VersionSpiRegistry.java:30-41).
- `MasterCodeVersionNumbers` 를 `common/version/VersionNumbers` 로 일반화해 네 대상이 같이 쓴다. 마스터코드 쪽은 위임만 남긴다.
- 새 버전 생성 규칙(미적용 버전 하나, MDM006)은 `VersionWriteGuard` 를 그대로 쓴다.

### 4.3 화면 공통

- 버튼 묶음은 `m-mdm/src/shell/VersionActionBar`(2026-10-02 추가, 원 작업 트리 미커밋 — §10 참고)를 쓴다. 순서: 새 버전(major), 새 버전(minor), 삭제, 확정, 확정취소, 선점, 해제, 넘기기.
- 새 버전 모달은 마스터코드 `NewVersionModal` 을 공용으로 올려 종류만 고르게 한다(룰·세트·레이아웃은 "빈 버전/복원" 선택 없이 마지막 RELEASED 복사).
- 버전 표시는 `v1.010` 형식, 상태 배지는 `VersionStatusBadge`, 소유자는 `DraftLockBadge` 를 쓴다.
- 권한 action 이름은 룰 기준 `copy`(새 버전)·`delete`·`lock`·`unlock`·`handover`·`confirm` 으로 맞춘다. 룰 세트·레이아웃의 권한 시드는 이 이름으로 만든다. 마스터코드의 `reg`→`copy` 정리는 권한 데이터 이행이 필요해 별도 작업으로 뺀다(§5).

## 5. 1단계 — 공통 엔진 일반화 + 룰 major/minor

### 데이터

- 마이그레이션 `V17__rule_version_decimal.sql`: `TB_MDM_RULE_VER`·`TB_MDM_RULE_VAR`·`TB_MDM_RULE_ROW` 의 `VER INTEGER` 를 `DECIMAL(7,3)` 로 다시 만들고, `TB_MDM_RULE_VER` 에 `VER_KIND NOT NULL` 을 더한다. 기존 n 은 n.000·MAJOR 로 옮긴다. SQLite 테이블 재생성 순서와 칼럼 순서 불변식(`MdmBusinessRuleMigrationTest`)을 지킨다.
- 엔티티·DTO 의 `Integer ver` 를 `BigDecimal` 로 바꾼다. 화면에는 `v1.000` 형식으로 보인다.
- 계획의 첫 작업은 정수 `ver` 사용처 목록 작성이다: `maru-mdm-engine` 정의 타입, DTO·`BASE_VER`, 프런트 `ver: number`, `openMdmPage` 로 넘기는 URL·질의 값, ruleEdit 버전 Select, e2e 스펙, `ver` 를 담는 기록·로그 테이블.
- `BigDecimal` 비교: scale 이 다르면 `equals` 가 false 다(`1` ≠ `1.000`). SQLite NUMERIC 은 `1.000` 을 정수로 돌려줄 수 있다. 읽는 경계에서 `setScale(3)` 으로 맞추고, 마스터코드가 이미 쓰는 변환을 재사용한다. `ver` 를 `Map`·`Set` 키나 `equals` 로 쓰는 곳을 모두 점검한다.
- 마스터코드 권한 action `reg`→`copy` 정리는 역할 권한 데이터 이행이 따르는 별도 작업으로 1단계에서 뺀다(관련 시드·필터 파일 `DataInitializer.java`·`EndpointPermissionFilter.java` 에 다른 작업의 미커밋 변경이 있음). §4.3 의 action 통일은 새 대상(세트·레이아웃)에만 바로 적용한다.

### 동작

- `RuleVersionService.newVersion(id, kind)` — 종류를 받는다. 번호는 `VersionNumbers`.
- 룰 화면 버튼을 "새 버전(major)·새 버전(minor)" 둘로 한다.
- 엔진 계약 `rule(ruleId, evalTs)` 는 그대로다. `RuleStep`·`FlowNode` 에는 버전 칸을 넣지 않는다(K1).

### 검증

- 마이그레이션 시험: 정수 버전 데이터가 n.000·MAJOR 로 옮겨지고 자식 행 키가 따라오는지.
- `VersionNumbers` 단위 시험(마스터코드 기존 시험 이관).
- 룰 새 버전 major/minor, 확정·확정취소 회귀(SQLite).
- m-mdm 룰 화면 단위 시험, 전체 `pnpm run test`.

## 6. 2단계 — 룰 세트 버전 관리

### 데이터

- 마이그레이션 `V18__rule_set_version.sql`
  - `TB_MDM_RULE_SET`: `FLOW_JSON`·`RULE_IDS` 를 버전 테이블로 옮기고, `STATUS` CHECK 에 `CREATED` 를 더한다. `ROW_VERSION` 은 버전 행으로 옮긴다.
  - 새 `TB_MDM_RULE_SET_VER(MARU_RULE_SET_ID, VER)` — §4.1 표준 칼럼 + `FLOW_JSON`·`RULE_IDS`.
  - `TB_MDM_RULE_SET_TEST_CASE` 는 세트 단위 그대로. V15 의 FK 때문에 세트 테이블 재생성 순서에 주의한다(V15:6-7).
  - 기존 세트 → `1.000 MAJOR RELEASED`, `APPLY_FROM = 2000-01-01 00:00:00`(일괄), `APPLY_TO = 9999-12-31`, `RELEASED_AT = U_AT`(없으면 `C_AT`, 그것도 없으면 2000-01-01). 폐기된 세트는 부모 `DEPRECATED` 를 유지한다.
    - `APPLY_FROM` 을 `C_AT` 로 두지 않는다. 엔진은 판정 시각으로 세트 버전을 고르므로, `C_AT` 보다 이른 판정 시각(과거 데이터 재판정, 세트 테스트 케이스의 `EVAL_TS` 등)에서 `SET_NOT_FOUND` 가 나게 된다. 이행 버전은 언제 판정해도 찾혀야 한다(아래 한계와 같은 뜻).
  - 한계: 지금까지 세트는 덮어쓰기 저장이라 이전 흐름이 남아 있지 않다. 따라서 과거 판정 재현(목적 3)은 이행 시점 이후부터 보장된다. 이행 이전 시각(`C_AT` 보다 이른 시각 포함)에는 이행 시점의 흐름이 쓰인다.

### 동작

- 새 버전·삭제·선점·해제·넘기기는 §4 공통.
- 흐름도 편집기(`ruleSetEdit`)
  - 2초 자동 저장(`useAutoSave`)은 **내 DRAFT** 에만 쓴다. DRAFT 가 없거나 소유자가 아니면 읽기 전용으로 연다.
  - 상단에 버전 선택(기본: 내 DRAFT, 없으면 지금 적용 중인 RELEASED)과 `VersionActionBar` 를 둔다.
  - `view`(배치·색) 변경도 DRAFT 에 쓴다. RELEASED 를 열었을 때는 배치 이동도 저장하지 않는다.
  - 디버거·테스트 케이스는 화면에 열린 버전 정의로 돌린다. 룰은 판정 시각의 RELEASED.
- 확정 화면 `dme/ruleSetConfirm`(룰 `ruleConfirm` 과 같은 구조): 검사 → `apply_from` 입력 → 확정.
- 확정 검사(`RuleSetConfirmCheckSpi`)
  1. 흐름 구조 검사(지금 저장 시 검사 재사용)
  2. 참조 룰마다 `apply_from` 시점에 RELEASED 가 있는지
  3. 그 룰 버전들로 순서·순환 검사
  4. 테스트 케이스 실행 결과. 기대값이 있는 케이스가 실패하면 오류로 확정을 막는다(룰 확정 `RuleConfirmReport` 의 `CASE_FAILED`·`CASE_RUN_FAILED` 가 ERROR 인 것과 같은 등급). 기대값이 없는(실행만) 케이스가 실행 오류로 끝나면 막지 않고 경고 `CASE_RUN_ERROR` 로 알리며 "기대값 있음"·"실패" 수에 넣지 않는다(Ruling P2-22)
- 룰 확정 시 세트 순서 검사(`RuleSetOrderCheck`): 검사 대상을 "INUSE 세트 현재 행"에서 "**이 룰의 apply_from 이후 유효한 세트 RELEASED 버전들**"로 바꾼다. 세트 DRAFT 는 세트 확정 때 검사한다.
- 룰 확정취소 교차 효과(ADR-0002 D8-10): 룰의 유일한 확정 버전을 되돌리면 그 룰을 담은 세트의 **확정**이 막힌다(지금은 저장·되살리기가 막힘).

### 엔진

- `DefinitionLookup.ruleSet(setId)` → `ruleSet(setId, evalTs)`. `StoredDefinitionLookup` 은 `TB_MDM_RULE_SET_VER` 에서 판정 시각의 RELEASED 를 고른다(`currentReleased` 와 같은 규칙).
- 시험 실행 경로(디버거·테스트 케이스)는 DRAFT 정의를 직접 넘기는 기존 방식(편집 중 정의 주입)을 쓴다. 운영 경로는 RELEASED 만 읽는다.
- `docs/mdm/engine-contract.md:50` 을 고친다.

### 후속

- 2단계 병합 뒤 D-135 스펙 C-D2 를 "하위 세트도 판정 시각의 RELEASED"로 고치고 §14 "하위 세트 버전 고정"을 지운다. D-136 모델 반영과 함께 한 번에 고친 뒤 SDD 를 시작한다.

## 7. 3단계 — 레이아웃·헤더 버전 관리

### 데이터

- 마이그레이션 `V19__layout_version.sql`
  - `TB_MDM_LAYOUT`(부모): ID·이름·종류·송수신 시스템·`STATUS`(CREATED/INUSE/DEPRECATED). 형식 속성(구분자·총 길이 정책 등 버전마다 달라질 수 있는 칼럼)은 버전 행으로 옮긴다. 업무 칼럼 `` `VERSION` `` 은 지운다.
  - `TB_MDM_LAYOUT_VER` 재생성: 키 `(LAYOUT_ID, VER)`, §4.1 표준 칼럼, 형식 속성, `SWITCH_MODE`·`CHANGE_KINDS`·`CHANGE_SUMMARY`, `SNAPSHOT_JSON`(본문만). `LAYOUT_VERSION` → `VER`.
  - `TB_MDM_LAYOUT_ITEM`·`TB_MDM_LAYOUT_HEADER`·`TB_MDM_LAYOUT_CONST` 키에 `VER` 를 넣는다: `(LAYOUT_ID, VER, SEQ)` 등.
  - 이행: 기존 이력 행 → RELEASED, `VER = LAYOUT_VERSION.000`, `APPLY_FROM = C_AT`, 다음 이력 행의 `C_AT` 으로 `APPLY_TO` 를 닫는다(마지막은 9999-12-31). 항목·헤더 구성·상수 행은 **최신 버전에만** 만든다. 이전 버전은 스냅샷 JSON 으로만 남아 읽기 전용 이력으로 보인다(항목 행 복원은 하지 않는다).
  - 헤더 레이아웃은 이력이 없으므로 현재 행을 `1.000 RELEASED` 로 옮긴다.
  - 한계: 이전 전문 버전은 헤더를 값으로 복사한 스냅샷만 남는다. 이행 이전 시각의 직렬화 재현은 그 스냅샷으로만 가능하고, 헤더 버전 해석은 이행 이후부터 적용된다.

### 동작

- 저장(`layoutMng.save`, `headerMng.save`)은 내 DRAFT 의 항목 행에만 쓴다. `LayoutVersioner.record`(자동 +1)는 없앤다.
- 확정할 때
  - 직전 RELEASED 와 비교해 `CHANGE_KINDS`·`SWITCH_MODE` 를 기록한다(`LayoutChangeClassifier` 재사용, 호출 시점을 저장→확정으로 옮김).
  - 동시 전환(SIMULTANEOUS)이면 확정 화면에 "송신·수신 양쪽이 apply_from 에 맞춰 전환해야 함"을 강조한다.
  - 본문 `SNAPSHOT_JSON` 을 만든다.
- 헤더 연쇄 재계산(`HeaderMngService.recalculateUsers`, I18)을 없앤다. 헤더를 확정해도 전문 버전은 생기지 않는다.
- 헤더 확정 화면: 이 헤더를 쓰는 전문(그리고 EAI) 목록과 `apply_from` 시점의 총 길이 변화를 영향도로 보인다. 검사: 헤더 변경 뒤 전문 총 길이 규칙을 어기는 전문이 없을 것.
- 총 길이·내보내기·샘플 전문은 **시각 T 기준으로 합성**한다. T 시점의 전문 버전 + T 시점의 헤더 버전. 기본 T 는 현재 시각, 화면에서 바꿀 수 있다. `LayoutSerializer`/`LayoutParser` 계약에 T 를 넘긴다.
- 확정 화면 `dmb/layoutConfirm`(전문·헤더 공용).
- 버전·영향도 탭: 이력 그리드에 상태·종류·적용 구간·소유자 열을 더한다. `VersionPanel` 의 "배포는 이번 범위 밖" 안내는 그대로(배포 보류, PRD §2 규칙 7).
- 컬럼·도메인 영향도(`LayoutImpactFinder`)는 RELEASED(현재·미래)와 DRAFT 를 구분해 보인다.

## 8. 오류 처리

| 상황 | 처리 |
|---|---|
| 미적용 버전이 있는데 새 버전 | 거부(MDM006), 버튼 비활성 + 그 DRAFT 로 이동 |
| minor 999 | minor 버튼만 비활성, "major 를 올리십시오" |
| 소유자 아닌 사람의 저장 | 거부(기존 `DraftOwnershipService`), 화면은 읽기 전용으로 열어 막는다 |
| 확정 시 `apply_from` 이 직전 RELEASED 의 `apply_from` 보다 이르거나 같음 | 거부(`ApplyFromOrderCheck`) |
| 세트 확정 시 참조 룰에 `apply_from` 시점 RELEASED 없음 | 확정 검사 오류, 해당 룰 목록 표시 |
| 판정 시각에 RELEASED 세트·헤더 없음 | 엔진 판정 오류(기존 "룰 없음"과 같은 등급), 메시지에 대상 ID·시각 |
| 동시 저장 충돌 | `ROW_VERSION` 조건부 UPDATE 실패 → 다시 불러오기 안내 |

## 9. 문서

- ADR-0006 "룰 세트·레이아웃 버전 관리와 major/minor 통일"(adr-write 스킬). 06:905·03:72·06:988 번복, I15·I18 폐지, K1~K7 기록.
- `docs/mdm/decisions.md` D-144.
- PRD AC-4, ADR-0005:72 갱신 메모.
- 원천 설계 문서(다른 저장소 `/Users/jji/project/mdm/docs/design`): 06·03·08·01 해당 절. 단계별로 그 단계의 절만 고친다.
- `docs/mdm/engine-contract.md`(2단계).
- `docs/guide/FrontEnd/Local-Rules.md` §24 MDM 버전 버튼 규약에 major/minor 공통 적용 문구(1단계).

## 10. 선행 조건과 작업 트리

- 원 작업 트리(dev)에 오늘 작업이 미커밋으로 남아 있다: `VersionActionBar`(버튼 통일), 도메인 검색, `DetailPopover`/컬럼 정보, 목록 테스트 [조회] 수정. 1단계 구현 전에 이것들을 dev 에 커밋하고 이 브랜치를 dev 위로 rebase 한다. 그 전까지는 스펙·계획 문서만 이 브랜치에 둔다.
- 마이그레이션 번호(V17~V19)는 착수 시점에 `flyway-migration-add` 스킬로 다시 채번한다. D-144·ADR-0006 번호도 쓰는 시점에 원 작업 트리의 `decisions.md`·`adr/` 를 다시 확인해 정한다(다른 세션이 MDM 결정을 같이 쓰고 있음).

## 11. 검증 원칙

- 백엔드: SQLite 시험만, 도커 금지. 대상별 상태 전이(새 버전 major/minor, 삭제, 확정, 확정취소, 선점·해제·넘기기), 판정 시각 해석(apply_from 경계 직전·직후), 마이그레이션 이행 데이터.
- 엔진: 세트 버전 경계에서 다른 흐름이 선택되는지, 룰 새 버전이 세트 안에서 `apply_from` 부터 쓰이는지(K2).
- 레이아웃: 헤더 확정 뒤 T 전후로 전문 직렬화 결과가 달라지는지, 이전 T 로 과거 전문을 재현하는지(목적 3).
- 프런트: m-mdm 전체 `pnpm run test`, 타입 검사, 해당 화면 e2e 스펙 갱신. 화면 확인은 ego-browser 로 하고 끝나면 닫는다.

## 12. 범위 밖

- 배포(07)와 송신 측 전환 실행.
- 여러 대상을 한 번에 확정하는 변경 묶음.
- 세트 노드의 룰 버전 고정(B·C안).
- 레이아웃 이전 버전의 항목 행 복원.
