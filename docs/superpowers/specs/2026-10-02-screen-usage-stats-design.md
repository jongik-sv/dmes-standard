# 사용자 화면 사용 통계 — 설계

- 작성일: 2026-10-02
- 브랜치·워크트리: `feat/screen-usage-stats` · `.claude/worktrees/screen-usage-stats` (`dev` 기준)
- 범위: 포털(m-mcm) 안에서 연 화면의 이용 구간 수집 → mcm 백엔드 저장·일별 집계·보관 → 관리자 통계 화면 → 메뉴 등록

## 1. 목적과 성공 기준

사용자가 밝힌 용도는 세 가지다.

1. **미사용 화면 정리** — 오래 열리지 않은 메뉴 화면을 찾아 정리·마이그레이션 우선순위 판단에 쓴다.
2. **이용 현황 보고** — 기간·부서·화면·사용자별 열람 횟수, 이용자 수, 이용 시간을 관리자에게 보인다.
3. **감사·추적** — 누가 언제 어떤 화면을 얼마 동안 봤는지 개별 이력을 조회한다.

확정한 요구:

| 항목 | 결정 |
|---|---|
| 기록 단위 | 화면 열기 + 실제 이용 시간(구간). 화면 안 버튼 동작은 수집하지 않는다 |
| 보관 | 원본 구간 1년, 일별 집계 영구 |
| 부서 기준 | 이용 당시 부서(기록 시점 스냅숏) |
| 조회 권한 | 관리자 메뉴 권한(SYSADMIN 등 메뉴 권한 체계) |
| 메뉴 | 통계 화면 완성 **후** 새 메뉴로 등록하고, 실행 중인 로컬 서버에서 사이드바에 보이는지 확인한다 |

성공 기준:

- 포털에서 화면을 열고 전환·닫기·창 가림을 하면 구간이 서버 원본 테이블에 쌓인다(중복 없음).
- 다음 날 집계 뒤(또는 당일 조회 시 원본 합산으로) 통계 화면의 6개 탭이 기간·부서·사용자·화면 조건으로 맞는 값을 보인다.
- 기록 실패가 화면 사용을 막거나 오류 알림을 띄우지 않는다.
- 사용자 ID·부서는 서버가 인증 정보로 채운다(클라이언트가 보낸 값은 쓰지 않는다).

수집하지 않는 범위: 화면 내부 버튼 동작, 팝업, 포털 밖에서 단독으로 연 화면, 로그인 전 화면.

## 2. 전체 구성

```
[shared] portal-shell/usage-tracker.ts ── 활성 탭 변화·가시성·무입력 관찰 → 구간 생성
[shared] portal-shell/usage-sender.ts  ── 큐 · 묶음 전송 · keepalive flush
[shared] PortalShell prop onUsageSegments(segments)
[m-mcm] app/portal/page.tsx            ── sender 생성, PortalShell 에 연결
        │  POST /api/mcm/oasis/screenUsage/record   (AUTH_ONLY: 로그인 사용자 전원)
        ▼
[mcm-core] screenusage/ ScreenUsageService(record) → TB_SEC_SCREEN_USAGE_LOG (원본)
[mcm-core] ScreenUsageRollup @Scheduled 02:00   → TB_SEC_SCREEN_USAGE_DAY (일별 집계) · 1년 지난 원본 삭제
[mcm-core] ScreenUsageStatService(overview/byScreen/byDept/byUser/unused/history)
        ▲  POST /api/mcm/oasis/screenUsageStat/{action}   (메뉴 권한)
[m-mcm] page-components/csa/screenUsageStat/   ── 통계 화면(탭 6개)
[mcm/api] DataInitializer                      ── 테이블 DDL(MSSQL) · 메뉴·객체·권한 시드
```

## 3. 프런트 수집

### 3.1 구간 정의

구간 = 사용자가 한 화면을 실제로 보고 있던 연속 시간. 1구간 = 원본 1행.

| 시작 사유 (`START_KIND`) | 언제 |
|---|---|
| `OPEN` | `openPageTab` 이 **새 탭을 만든** 경우, 기본 화면 자동 열기로 새 탭을 만든 경우 |
| `SWITCH` | 이미 열린 탭으로 활성 탭이 바뀐 경우(탭 바 클릭, 메뉴로 기존 탭 재선택, 뒤로가기, 탭 닫힘 후 이웃 탭 활성, 새로고침 뒤 복원). 홈 탭으로 가는 경우는 구간을 끝내기만 한다 |
| `RESUME` | 브라우저 탭이 다시 보이거나, 무입력 후 입력이 돌아오거나, 긴 구간을 자른 뒤 이어지는 경우 |

종료: 다른 탭 활성화, 활성 탭 닫기, `visibilitychange` 가림, `pagehide`, 로그아웃(`doLogout` 맨 앞), 무입력 30분(종료 시각 = 마지막 입력 시각), 구간 길이 15분 도달(마지막 입력 시각까지 잘라 보내고 그 시각부터 `RESUME` 으로 이어감 — 창이 비정상 종료돼도 잃는 시간을 15분 이내로 묶고, 무입력 판정과도 어긋나지 않는다).

- 1초 미만 구간은 버린다.
- 홈 탭(`tab.isHome`)은 기록하지 않는다. 홈 탭이 활성인 동안에는 구간이 없고, 홈에서 다른 탭으로 가면 그 탭의 구간이 `SWITCH`(새 탭이면 `OPEN`)로 시작한다.
- 열람 횟수 = `OPEN` 구간 수. 이용 시간 = 모든 구간 길이 합.
- 입력 감지: `pointerdown`·`keydown`·`wheel` 을 passive 리스너로 받고 마지막 입력 시각만 갱신한다. 무입력 판정은 60초 주기 타이머가 한다.

### 3.2 삽입점 (조사 근거: `shared/src/portal-shell/portal-shell.tsx`)

- 활성 탭이 바뀌는 경로는 모두 `activeTabId` 상태(`:247`)로 모인다. `activeTabId` 를 deps 로 둔 useEffect 하나에서 "이전 구간 종료 + 새 구간 시작"을 처리한다. 같은 형태의 기존 effect 가 `:938-943`(`portal-tab-activated` 발행)에 있다.
- `OPEN`/`SWITCH` 구분은 `openPageTab` 이 새 탭을 만들 때 ref 에 "다음 활성화는 OPEN" 표시를 남기고 effect 가 그것을 소비하는 방식으로 한다. `setTabs` 업데이터 안에서 상태를 바꾸므로 StrictMode 이중 호출을 고려해 표시는 탭 ID 기준으로 둔다.
- 로그아웃은 `doLogout`(`:535`) 맨 앞에서 활성 구간을 끝내고 flush 를 시작한다(확인창 취소 시에는 호출되지 않는 위치).
- `visibilitychange`·`pagehide` 리스너는 새로 단다.
- 기존 `onPageOpen` prop 은 건드리지 않는다.

### 3.3 모듈

- `usage-tracker.ts` — 순수 클래스. 시계(`now()`)와 이벤트 대상(document/window)을 주입받는다. 출력은 `UsageSegment { clientSegId, pageId, startKind, startedAt, endedAt }`(epoch ms). React 에 의존하지 않는다.
- `usage-sender.ts` — 큐(최대 200건, 넘치면 오래된 것부터 버림), 20건 또는 60초마다 묶음 전송(최대 100건/요청), 실패 시 큐에 되돌려 다음 주기 재시도, `flush({ keepalive: true })`. 오류는 `console.warn` 만 남긴다.
- `PortalShell` 에 `onUsageSegments?: (segments: UsageSegment[]) => void` prop 추가. prop 이 없으면 추적기를 만들지 않는다.
- `portal-shell/index.ts` 에 `export *` 추가. package.json·tsup 수정은 필요 없다.
- m-mcm `app/portal/page.tsx` 가 sender 를 만들고 prop 으로 연결한다. 전송 body 는 OASIS 형식 `{ meta: { userId, menuId: "PORTAL_SHELL" }, params: {}, grids: { segments: { rows } } }` 이다. `meta.userId` 는 OASIS 봉투 관례상 넣지만 서버는 쓰지 않고 인증 정보로 채운다.

## 4. 백엔드 (mcm-core / mcm/api)

### 4.1 원본 `TB_SEC_SCREEN_USAGE_LOG` (1년 보관)

| 컬럼 | 형식 | 설명 |
|---|---|---|
| `USAGE_ID` | VARCHAR(36) PK | UUID |
| `USER_ID` | VARCHAR(50) | `SecurityIdentity.requireUserId()` |
| `DEPT_CD` | VARCHAR(10) NULL | 기록 시점 `SecUser.deptCd` (`SecUserRepository.findById`) |
| `PAGE_ID` | VARCHAR(200) | `${PARENT_MENU_ID}/${OBJECT_ID}` |
| `START_KIND` | VARCHAR(10) | `OPEN`/`SWITCH`/`RESUME` |
| `STARTED_AT`, `ENDED_AT` | TIMESTAMP | 클라이언트 시각 |
| `DURATION_MS` | BIGINT | 서버가 `ENDED_AT - STARTED_AT` 로 계산 |
| `CLIENT_SEG_ID` | VARCHAR(36) | 프런트 구간 ID |
| `CLIENT_IP` | VARCHAR(45) NULL | 감사용 |
| `RECEIVED_AT` | TIMESTAMP | 서버 수신 시각 |

- 고유 제약 `(USER_ID, CLIENT_SEG_ID)` — 재전송 중복 방지. 이미 있으면 건너뛴다.
- 인덱스 `(STARTED_AT)`, `(USER_ID, STARTED_AT)`, `(PAGE_ID, STARTED_AT)`.
- 테이블은 기존 감사 계열(`TB_SEC_AUDIT_LOG`)처럼 schema 접두를 두지 않는다.

### 4.2 일별 집계 `TB_SEC_SCREEN_USAGE_DAY` (영구)

키 `(USAGE_DT, PAGE_ID, USER_ID, DEPT_CD)` — `USAGE_DT` 는 `CHAR(8)` `yyyyMMdd`(서버 시간대 Asia/Seoul), `DEPT_CD` 가 없으면 `'-'`.
값 `OPEN_CNT`, `SEG_CNT`, `DURATION_MS`.
사용자 단위로 남기므로 화면별·부서별·사용자별·이용자 수 통계를 이 테이블 하나로 계산한다.

### 4.3 기록 서비스 `screenUsage` / action `record`

- `@Service("screenUsageService")`, 클래스에 `@Transactional` 금지(OASIS 규칙 6-B-1). 쓰기는 저장소 메서드 트랜잭션으로 한다.
- BPMN `mcm/api/src/main/resources/services/audit/screenUsage.bpmn`, 통계는 `services/csa/screenUsageStat.bpmn` — `output` 필수(6-C-2), grids key `segments` 와 Java 파라미터 이름 일치(6-E-3).
- 검증(통과 못 한 구간은 버리고 건수만 로그): 요청당 100건 초과 분 버림, `ENDED_AT < STARTED_AT`, 길이 > 24시간, `STARTED_AT` 이 수신 시각보다 5분 넘게 미래 또는 30일 넘게 과거, 1초 미만, `PAGE_ID` 공백·200자 초과, `START_KIND` 값 이상.
- `PAGE_ID` 가 메뉴 마스터에 있는지는 기록 시 검사하지 않는다(메뉴 개편 뒤에도 이력을 남기기 위해). 통계 조회에서 메뉴에 없는 화면은 "(메뉴 없음)"으로 표시한다.
- 응답 `data.result = { saved, skipped }`.
- 권한: 로그인 사용자 전원이 호출하므로 메뉴 권한이 아닌 AUTH_ONLY 경로로 연다(`m-mcm/proxy.ts` `authOnlyPrefixes` 및 백엔드 `EndpointPermissionFilter` 의 해당 목록).

### 4.4 집계·보관 스케줄러 `ScreenUsageRollup`

- `@Scheduled(cron = "0 0 2 * * *", zone = "Asia/Seoul")`. 예외는 기존 `RevokedTokenPurger` 처럼 잡아서 `log.warn`.
- 처리 범위: 집계 테이블의 최대 `USAGE_DT` 2일 전부터 어제까지(집계 테이블이 비면 원본 최소 일자부터). 시작 일자는 `오늘 − 365일` 보다 이르지 않게 자른다(삭제된 원본 일자 재계산·이상 시각 방지). 늦게 도착한 구간(큐 재전송)을 반영하기 위해 최근 2일을 다시 계산한다.
- 일자마다: 그 일자 원본을 읽어 Java 에서 키별로 합산 → 그 일자 집계 행 삭제 → 삽입. 일자 단위로 멱등이라 서버 여러 대가 동시에 돌아도 결과가 같다(ShedLock 없음).
- 날짜를 걸치는 구간은 `STARTED_AT` 의 일자에 귀속한다.
- 집계 뒤 `STARTED_AT < 오늘 - 365일` 이면서 집계가 끝난 일자의 원본을 삭제한다.
- 날짜 계산은 Java 에서 하고 SQL 에는 범위 파라미터만 넘긴다(방언 날짜 함수 불사용).

### 4.5 통계 조회 서비스 `screenUsageStat`

공통 파라미터: `fromDt`, `toDt`(yyyyMMdd), `deptCd?`, `userId?`, `pageId?`.
조회 범위가 집계 테이블 최대 일자 다음 날 이후(오늘 포함)에 걸치면 그 구간은 원본에서 같은 키로 합산해 더한다(02:00 집계 전 어제분 누락 방지).

| action | 반환 | 내용 |
|---|---|---|
| `overview` | data | 총 열람, 이용자 수, 총 이용 시간, 미사용 화면 수, 일별 추이(일자·열람·이용자 수), 상위 10개 화면 |
| `byScreen` | grid | 화면명(메뉴명), pageId, 메뉴 경로, 열람 횟수, 이용자 수, 총·평균 이용 시간, 마지막 이용일 |
| `byDept` | grid | 부서코드·부서명, 이용자 수, 열람 횟수, 이용 시간, 최다 이용 화면 |
| `byUser` | grid | 사용자 ID·이름, 부서, 열람 횟수, 이용 시간, 마지막 이용일 |
| `unused` | grid | `MENU_VIEW_YN='Y'` 인 메뉴 화면 중 `unusedDays`(기본 90) 동안 이용 기록(구간 종류 무관)이 없는 화면, 마지막 이용일(전체 기간), 메뉴 경로 |
| `history` | grid | 원본 구간 그대로(사용자·부서·화면·시작 사유·시작·종료·길이·IP). 최근 1년, 한 번에 시작·종료일 포함 최대 31일, 최신순 최대 10,000행 |

- 부서별 탭의 "선택 부서의 화면별 내역"은 `byScreen` 에 `deptCd` 를 넣어 호출한다.
- 집계 SQL 은 `GROUP BY`·`SUM`·`COUNT(DISTINCT)` 와 범위 파라미터만 쓰는 이식 가능한 SQL(JPQL 우선)로 쓴다. 계층 메뉴 경로가 필요하면 기존 `SecMenuNativeRepository` 의 방언 분기 패턴을 재사용한다.
- 6개 action 은 `DataInitializer` 의 `PERM_ALL` `allActions` 목록에 추가한다(빠지면 SYSADMIN 도 403).

### 4.6 스키마 반영

- 로컬 SQLite: `@Entity`(+ `@Table(uniqueConstraints, indexes)`) 와 `ddl-auto=update`.
- MSSQL 계열(local-db·wildfly): `DataInitializer` 의 기존 멱등 `CREATE TABLE` 패턴으로 두 테이블과 인덱스를 만든다.
- 이력용 `mcm-core/.../db/migration/sqlite/V*.sql` 은 런타임 미적용이므로 추가하지 않는다(mcm 은 Flyway 비활성).

## 5. 통계 화면 (m-mcm `page-components/csa/screenUsageStat/`)

- 파일: `page.tsx`(default export), `api.ts`(`createJsonApiClient` 로 OASIS 호출), `types.ts`, 필요 시 `format.ts`(시간·숫자 포맷 순수 함수).
- 골격: 조회 화면(A 유형) + 탭. 상단 버튼은 `PageLayout buttons` 의 `search`, `export`.
- 검색 조건(`SearchArea`): 기간 `SearchField` 2개(`~`, 기본 최근 30일), 부서, 사용자, 화면. 첫 진입 자동 조회는 하지 않고 [조회]로만 조회한다(커밋 `c564a05f` 방향).
- 탭(shared `Tabs`, 본문은 `useState` 로 전환):
  1. 개요 — `KpiTile` 4개, 일별 열람 추이 `LineChart`, 상위 10개 화면 `HBarChart`(부모에 가로 스크롤)
  2. 화면별 — `AgDataGrid`
  3. 부서별 — `AgDataGrid`, 행 선택 시 아래에 해당 부서의 화면별 그리드
  4. 사용자별 — `AgDataGrid`
  5. 미사용 화면 — 기준 일수 입력 + `AgDataGrid`
  6. 이용 이력 — `AgDataGrid`. 기간이 31일을 넘으면 조회 전에 안내하고 막는다
- 엑셀은 shared 표준 `exportToExcel` 로 현재 탭 그리드를 내보낸다. 탭을 바꾸면 그 탭 기준으로 조회한다(이미 조회한 조건이 같으면 다시 부르지 않는다).
- shared 래퍼만 쓴다(`@mantine/*`·`ag-grid-*` 직접 import 금지), 로컬 `.css` import 금지, `mantine-aggrid-ui` audit 0건.
- 새로 만드는 공통 부품은 없다(기간은 표준 `SearchField` 2개).

## 6. 메뉴 등록 (마지막 단계)

통계 화면이 로컬에서 동작한 뒤에 한다.

1. `DataInitializer` 에 `seedScreenUsageMenus()` 추가: `insertMcmSecObjIfAbsent("screenUsageStat", "화면 사용 통계", ...)`, `insertMcmSecMenuIfAbsent(..., 부모 csa, ...)`, SYSADMIN `PERM_ALL` 매핑. 호출은 기존 확장 지점(`seedMlsMenus()` 뒤), 마지막 `recomputeMenuFullSeq()` 가 순번을 다시 매긴다.
2. `componentPath` = `csa/screenUsageStat` 이 페이지 레지스트리 키와 같아야 한다.
3. 실행 중인 로컬 서버·DB 에 반영(재기동으로 IfAbsent 시드 적용) → ego-browser 로 SYSADMIN 로그인 → 사이드바 시스템관리 아래 메뉴 확인 → 화면 열기 → 다른 화면 몇 개 열고 전환 → 통계 화면 [조회] 로 오늘 값이 보이는지 확인 → 작업 공간 닫기.

## 7. 테스트

| 대상 | 방식 |
|---|---|
| `usage-tracker` | shared vitest(happy-dom, 가짜 타이머, 주입 시계): OPEN/SWITCH/RESUME, 홈 탭 미기록, 가림·재표시, 무입력 30분, 15분 자르기, 1초 미만 제외, 로그아웃 종료 |
| `usage-sender` | shared vitest: 묶음 크기·주기, 실패 재시도, 큐 상한, keepalive flush |
| PortalShell 연동 | shared vitest: 탭 열기·전환·닫기 시 `onUsageSegments` 호출 순서 |
| 기록 서비스 | mcm-core JUnit(Mockito, `SecurityIdentity` 스텁): 검증 규칙, body userId 무시, 중복 건너뜀, 부서 스냅숏 |
| 집계·통계 | mcm-core 저장소 테스트(기존 테스트 DB 설정) — 일자 집계 멱등성, 오늘분 원본 합산, 보관 삭제 경계, 미사용 화면 판정 |
| OASIS 계약 | `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` ERROR 0 |
| 화면 | `mantine-aggrid-ui` audit 0건, `tsc`, ego-browser 확인(6절 3번). Playwright E2E 는 추가하지 않는다 |
| 아키텍처 | `McmCoreArchitectureTest` 통과(새 패키지 `screenusage`) |

## 8. 구현 단위 (병렬)

| 단위 | 내용 | 선행 |
|---|---|---|
| U1 프런트 수집 | shared `usage-tracker`·`usage-sender`·PortalShell prop·테스트, m-mcm `portal/page.tsx` 연결 | 없음(4.3 계약만 따름) |
| U2 백엔드 | 엔티티·저장소·기록 서비스+BPMN·스케줄러·통계 서비스+BPMN·DataInitializer DDL·AUTH_ONLY·allActions·테스트 | 없음 |
| U3 통계 화면 | `csa/screenUsageStat` 화면(4.5 응답 계약 기준) | 없음(계약 기준으로 병렬), 통합 확인은 U2 뒤 |
| U4 메뉴 등록·통합 확인 | 6절 전체 | U1·U2·U3 |

## 9. 결정 (2026-10-02 사용자 검토로 확정)

1. shared `Tabs` 는 Part B 허용 목록(§1)에 없다 → **확정:** 이 화면에 사용하고 허용 목록에 `tabs` 서브패스를 추가한다(가이드 문서 수정 포함).
2. ~~홈 탭 포함 여부~~ → **확정(사용자 지시): 홈 탭은 기록하지 않는다.**
3. 새로고침 뒤 복원된 활성 탭 → **확정:** `SWITCH` 로 시작(열람 횟수 미포함, 이용 시간만 반영).
