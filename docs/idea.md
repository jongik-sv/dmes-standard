## 신규 기능

- mod
  - 1. 프롬포트 모드
  - 2. 결정 대기 기록 모드 : 결정해야 하는 상황에서 결정한 목록과 결정 해야할 목록을 가지고 있는 모드

---


- **DB 설계 도구**
  - **구상 문서: [docs/superpowers/specs/2026-10-09-erd-tool-concept.md](superpowers/specs/2026-10-09-erd-tool-concept.md) (2026-10-09). exERD 방식 편집·MDM 용어·도메인 연동·Claude Code MCP·CLI 편집. 정본(Flyway/ERD)·MDM 버전 객체 여부·exERD 동작 범위 결정 대기.**
  - **연구 보고서: [docs/erd-tool/2026-10-09-erd-tool-research.md](erd-tool/2026-10-09-erd-tool-research.md) (2026-10-09). exERD 가정 6개 중 5개 확인, 논리명→물리명 변환 API 는 이미 있음(0.2~0.3초), MCM 등은 DB FK·코멘트가 0이라 관계 추정 필요, 새 결정 거리 6건.**
  - **설계: [docs/superpowers/specs/2026-10-10-erd-tool-design.md](superpowers/specs/2026-10-10-erd-tool-design.md) (2026-10-10). 결정 20건 확정, 범위 기반+P1+P2(가져오기·뷰어·편집·여러 사람과 LLM 동시 편집), 미룬 기능 [erd-tool/deferred.md](erd-tool/deferred.md), 화면 시안 [erd-tool/mockup](erd-tool/mockup/erd-designer-mockup.html). 다음은 구현 계획.**
  - **UX 1차 뒤 요청 (2026-10-11, 1차 마감 중 사용자 확인)**
    - 관계선 붙는 쪽 = 1차 t6d 로 반영(좌우로 8px 넘게 떨어지면 마주 보는 면, 겹치면 같은 쪽 ㄷ자, 끄는 중 실시간).
    - 여러 표 동시 처리 → **1차 마감 뒤 바로 다음 회차**. 범위 4가지: 이동·정렬(함께 끌기·되돌리기 한 번·맞춤·간격), 접기 보기(전체·키만·이름만 일괄), 다이어그램 안팎(함께 올리기·빼기), 삭제·속성 일괄(함께 삭제·같은 컬럼 일괄 추가). 지금 코드: 선택 상태는 Set, xyflow 기본 Cmd/Ctrl+클릭·Shift+끌기, 속성 패널·도구 막대는 첫 표만, 서버 SetFold 는 표 목록을 받음. 1차 마감 D9 확인 결과가 입력.
    - 관계선 경유점(수동 경로) → **2차**. 다이어그램·관계별 꺾임점 저장(새 V 파일), 꺾임점 설정·지우기 명령(되돌리기·공동 편집 알림·MCP 포함), 선 마디 끌기 손잡이·[자동 경로로 되돌리기], 표 이동·자동 배치 때 꺾임점 처리 규칙. 지금은 다이어그램에 표 위치·접기만 저장.
    - ERD 에서 PK 를 맨 위에 보이기(exERD 식 구분선) → 결정 대기. 아래 "DB 컬럼 순서 맞추기" 를 하면 덜 급함.
- **DB 관리 도구**
- ASD-STE100 조사 및 스킬에 적용
- 에이전트 오피스의 태스크의 상세 내용에 완료작업, 현재 작업, 계획 작업 까지 같이 보이도록...

무인 작업 시 조정자가 사람에게 보고할 내용을 기술하는 모드가 필요, 이제 스크롤 해도 괜찮아.

- skill-doctor 명령어로 안쓰는 스킬 덜어내기
- **BPMN 디버거 기능**
- 기본화면 , 즐겨찾기의 순서와 폴더 위치는 드래그앤 드롭으로 바꿀 수 있게 하자.
- 조정자 스킬 이름을 dco(디코)로 바꾸자
- 조정자 스킬에 WBS 를 만들고 진행 관리를 하도록 하자. 자동으로 파일 열기까지(진행중)
  - 또 mod 도 만들자.
- 조정자 스킬이 오랫동안 멈춰있다면 업무 조정이 필요
- 조정자를 관리하는 세션 필요

---

- 담당자 알림기능
  - 프로그램에서 발생한 기능
  - 메일과 연관 기능
  - 알림의 중요도 고려
  - 메시지 발송 그룹 관리 기능
  - 사용자 관리에서 사용되는 부서코드를 MDM의 마스터코드로 변경 (TB_MCM_DEPT_INFO와 마스터코드 선택가능하도록)
  - 비밀번호도 도메인으로 관리 하자.
  - 시스템의 이름을 정할 수 있는 기능(MDM, MES, ...)

### 기타 수정

- ROLE이 상속관계를 가지도록 수정
- 자바 패키지명 이상한것(예 kr.dongkuk.*)

### 위젯 관련

- PDF 출력 개선
  - 위젯 화면에 제목 추가
  - 위젯 화면만 PDF 대상
- 

### MDM 관련

- MES의 가동 MDM과 원장이 되는 MDM이 동일한 화면(다만 DB 시스템, 유저가 다름)을 사용하고 2개의 시스템으로 분리되어야 함
  - MES 시스템에서 실제 적용되어서 사용해야 하는 MDM과
  - 원장이 되는 MDM 이 따로 존재해야 함
  - 이 시스템간 배포/적용 되어서 실제 MDM이 동작함
  - 될 수 있으면 DB 시스템 자체가 다르면 좋겠음(실제 환경과 유사, 테스트 가능)
- **룰 세트에서 디버깅 중 룰 링크로 넘어가면 룰 화면의 값 테스트에 값이 채워지게 하자.**

### MDM 화면

- 중요 !!!! 컬럼 사전에 도메인이 필수 인가? 지금은 필수가 아니다.
- 도메인관리에서 부모 도메인과 연결을 끊는 기능 (연결은 있음)
- 화면에만 있는 비즈니스 룰 자체에 대한 AST 생성/캐시 기능
- 특정 화면의 자체 컬럼에 대한 룰엔진(예를 들어 이 화면에서는 이 값이 NOT NULL)

### 버그·기술 부채

- 로그인 잠금과 계정 삭제가 둘 다 `USE_TP='N'` 이라 구분되지 않는다. 잠긴 계정 로그인 응답도 ACCOUNT_LOCKED 가 아니라 ACCOUNT_DISABLED 로 나가고, 잠금을 푸는 길은 비밀번호까지 초기화하는 '계정 재생성'뿐이다(관리자 비밀번호 초기화는 잠금·실패 횟수를 풀지 않고, `unlockUser` 는 부르는 곳이 없다). 잠금 전용 표시 칸과 비밀번호를 건드리지 않는 잠금 해제 경로(화면·API)를 설계하자(2026-10-03 로그인 잠금 롤백 수정 중 발견).

### 리팩토링 후속

- 스킬 윈도우 실기 확인(2026-10-07, 나중에): 스킬을 python 없이 node·Git Bash 로 옮긴 뒤 실제 윈도우 PC 에서 확인할 18건과 동봉 jq.exe 1.8.2 실행 확인이 남았다. 목록: docs/superpowers/specs/2026-10-07-skills-windows-compat.md §8.2. 그때 `kill -0` 직접 사용 약 10곳을 compat_pid_alive 로 바꾸는 일도 함께 한다.
- m-mcm 화면의 OASIS 호출 복사본 20개를 shared 공통 계층으로 옮기기 — 정리 문서: [docs/refactor-2026-10/m-mcm-api-commonization.md](refactor-2026-10/m-mcm-api-commonization.md) (2026-10-04)
  - 필요성: 같은 unwrap 로직이 20벌 복사돼 있고, 프론트 가이드 §7-A-2 와 스킬 예제가 이 복사 코드를 싣고 있어 새 화면·새 고객사 프로젝트마다 늘어난다. 오류 문구 선택 C(기본 문구 + 항목명 상세)를 m-mcm 에 넓히려면 공통 계층이 필요하다.
  - 지킬 조건: 모듈별 호출 경로(/api/mcm·mdm·mls)는 UI 서버 분할을 위한 의도된 설계이므로 basePath 를 필수로 받는다. 채팅·메모 자체 오류 클래스, null 필터 차이, vitest 의 shared import 제약에 대응한다.
  - 단계: ① 같은 복사본 13개 위임 → ② export 형 3개 → ③ 채팅·메모·캐시 관리 → ④ HTTP 계층 통일(json-api-client → shared apiRequest, 별도 결정).
  - 선행 조건: 이번 리팩토링(c3 레인)의 m-mdm·m-mls 공통 계층과 a8 레인의 서버 errors[] 보강이 dev 에 들어온 뒤 진행한다.
  - 결정 대기: 진행 시점, HTTP 계층 통일 여부, ObjectPickerModal 오류 노출, `userId:"admin"` 하드코딩, 가이드·예제 갱신.
- caravanhub 연동 클라이언트 복제 7파일 통합 — 2026-10-04 a8 조사, 사용자 결정으로 이번 리팩토링에서는 보류
  - 현황: `caravan-console/.../console/caravanhub` 7파일(270줄)과 `cactus-core/.../integration/caravanhub` 7파일(약 400줄)이 이름만 다른 복제본이다. 로직은 같고 설정 prefix(`caravan-console.caravanhub` / `cactus.caravan-hub`)·빈 이름·패키지·로그 문구만 다르다. mcm 은 같은 환경변수를 yml 두 블록에 적고, 컨텍스트에 RestClient·hub 클라이언트가 2벌씩 뜬다.
  - caravan-console 은 멈춘 모듈이 아니다(mcm 이 엔티티·서비스·대시보드를 씀). 합칠 대상은 hub 클라이언트 7파일뿐이고, console 쪽 클라이언트 사용처는 ConsoleTopicService 전송 1곳이다.
  - 권장안 A: cactus 쪽을 정본으로 둔다(테스트 있음, dmom 이 의존). console 이 cactus-core 를 compileOnly 로 의존하고 ConsoleTopicService 가 CaravanHubIntegrationClient 를 주입받게 바꾼 뒤, 7파일은 archive 로 옮긴다(caravanhubconfig 엔티티 패키지는 유지).
  - 보류 이유: console 의 "cactus 의존 0" 설계를 되돌리고, 켜고 끄는 키가 `cactus.caravan-hub.enabled` 로 바뀐다. 운영·개발계 외부 설정에서 두 prefix 의 값이 다른지 확인한 뒤 다시 다룬다(실서버 설정을 볼 수 있을 때).

### 조회·로그 (2026-10-07 보류)

- 업무 모듈 단순 조회를 MyBatis 조회 라우터로(BPMN 없이) — 검토 문서: [docs/superpowers/specs/2026-10-07-query-router-issues-review.md](superpowers/specs/2026-10-07-query-router-issues-review.md)
  - 방침(안): mcm·mdm 은 지금처럼 BPMN+JPA, 그 밖 업무 모듈은 단순 조회만 라우터+MyBatis, 등록·수정·삭제는 BPMN+JPA.
  - 2026-10-09 사용자 방향: **조회 쿼리는 BPMN 에서 뺀다** — 조회는 MyBatis·JPA 를 직접 호출하고(읽기 전용 트랜잭션), BPMN 은 등록·수정·삭제와 업무 흐름만. 근거: 로그로 잰 BPMN 겉비용(서비스 시간 − 태스크 시간)은 중앙 1~~3ms 라 긴 작업엔 무시할 만하지만 5~~10ms 짜리 조회에선 20~30%, 조회 호출이 BPMN 호출의 약 95%. BPMN 이 주던 서비스 태그(MDC)·권한 확인·감사 로그는 조회 경로에서도 따로 챙겨야 한다(검토 문서 문제점 참고).
  - 2026-10-09 조사: BPMN 없이 조회하는 경로가 이미 있다 — **REST 신경로** `/api/{모듈}/rest/{화면ID}/{액션}/{백엔드경로}`(BFF `src/frontend/m-mcm/app/api/[module]/rest/[objId]/[action]/[...path]/route.ts`, 설계 [docs/framework/BFF-RBAC-REST-신경로규약-상세설계.md](framework/BFF-RBAC-REST-신경로규약-상세설계.md) 2026-07-28). BFF 가 권한 키 `{모듈}/{화면ID}/{액션}` 으로 검사한 뒤 화면ID·액션을 떼고 백엔드의 일반 Spring 컨트롤러로 넘긴다(컨트롤러 변경 없음).
    - 쓰는 곳: DB 뷰어 `/api/analog/rest/dbViewer/query/…`, 로그 뷰어 `/api/analog/rest/logViewer/search/…`, 미디어 위젯 올리기 `/api/mcm/rest/commWidgetMng/upload/…`, mpn 계획 오더 등([이행 대조표](framework/BFF-RBAC-mpn-REST-이행-대조표.md)).
    - `/query` 보다 맞는 이유: 권한 연결이 이미 있고, 백엔드가 평범한 컨트롤러라 MyBatis·JPA 직접 호출·읽기 전용 트랜잭션을 걸기 쉽고, 「등록된 쿼리 아무거나 실행」 경로가 아니라 위험이 작다 → `/query` 를 새로 열지 않고 조회를 이 경로로 옮기는 안을 먼저 검토한다.
    - 빈틈: BFF 는 화면 권한(`dbViewer/query` 등)만 보고 뒤의 백엔드 경로가 그 화면 것인지는 확인하지 않는다 — 한 화면 권한으로 같은 모듈의 다른 백엔드 경로를 부를 수 있다(「BFF permKey↔BE 묶기」, 개발 기간 보류). 옮길 때 추가로 챙길 것: 백엔드 조회 경로에 서비스 태그(MDC)·필요하면 감사 로그.
  - 현황: 시범(mcm masterCodeSelPop) 코드는 dev(d9e119e4)에 있고 라우터 스위치(`cactus.inbound.query-routes`)는 꺼져 있다. 보안 수정(9e55954a)으로 /query·/service 직접 경로는 BFF 403·BE 404.
  - 남은 것: 문서의 문제점 7개·Q2~Q8 답변, 켜는 조건 4가지, BFF 허용 방식, 업무 모듈로 시범 이전, 가이드·ADR. 레인 메모: ~/.coord/notice-fill2/lanes/query-route/memo.md
  - 선행(10-07 결정): 로컬 DB 를 OrbStack 의 Oracle 23ai Free 로 먼저 바꾼다(컨테이너 하나를 전 레인이 스키마로 나눠 공유). 그 뒤 방언 항목(§2·Q4~Q6)을 실제 Oracle 로 시험하며 진행한다.
- analog 로그에서 조회 호출 빼기 — BPMN 호출의 약 95% 가 조회이고 호출당 약 16줄이라(10-07 mcm 로그 2,108회·33,729줄, Hibernate SQL DEBUG 9,064줄 별도) 업무 처리 로그가 묻힌다.
  - 방안: A 조회를 MDC(rw=R)로 표시해 별도 파일 · B DEBUG 로 낮추기 · C 조회는 요약 한 줄만 · D analog 화면 필터.
  - 추천: A+C. 조회 판정은 이름 규칙(search·select 등)과 BPMN 의 읽기 전용 표시를 함께 쓴다.

### 개발 도구 (2026-10-07)

- 로컬 Oracle 데이터 보기를 MCM 웹페이지(SQL 콘솔)로 — DbGate(Electron, 연결 1개에 약 350~600MB 추정)·SQL Developer·SQLcl(JVM)은 16GB PC 에 무겁다. 포털(5100)·MCM 백엔드는 늘 떠 있어 추가 메모리가 거의 없다.
  - 1단계 범위(안): 테이블 목록(`USER_TABLES`) · 컬럼 정보(`USER_TAB_COLUMNS`, MDM 컬럼 사전 한글명 함께) · SQL 입력 + 결과 그리드(shared `AgDataGrid`, 정렬·필터·엑셀).
  - 보안 경계(필수): 임의 SQL 실행은 그 자체로 주입 기능이다. `local`·`dev` 프로필에서만 컨트롤러 빈을 등록(운영 빌드에는 빈이 생기지 않게), 관리자 권한 확인, 읽기 전용 트랜잭션 + `SELECT`·`WITH` 만 허용, 행 수 상한(예: 1,000)·쿼리 시간 제한.
  - DB 연결: 로컬 DB 의 Oracle 23ai Free 전환(podman 컨테이너 `oracle-26ai-free`, `localhost:1521/FREEPDB1`)에 맞춰 Oracle 데이터소스를 쓰거나 콘솔 전용 접속을 둔다. SQLite 도 같은 화면에서 볼지 결정한다.
  - 현황: 리포에 SQL 콘솔 기능은 없다(`caravan-console` 은 메시지 허브 관리 콘솔).
  - 대안(당장 필요할 때): 터미널 `usql`(Go 단일 실행 파일, 순수 Go Oracle 드라이버라 클라이언트 불필요) 또는 SQLPro for Oracle(네이티브, 무료판+유료 기능).
  - 결정 대기: 보안 범위, DB 연결 방식, 1단계 범위. 정해지면 브레인스토밍 → 레인.

### DB 컬럼 순서 맞추기 (2026-10-11 결정, 운영 전)

- 현상: 표의 컬럼이 길이순이다(VARCHAR2(1) → TIMESTAMP → NUMBER → 짧은 VARCHAR2 → … → CLOB). PK 가 중간에 끼어 있다(예: TB_MCM_SEC_MENU 의 MENU_ID 가 DB 에서 8번째, V1 DDL 에서 10번째). ERD 는 DB 의 COLUMN_ID 순서를 그대로 보인다(ErdDbMetaReader).
- 원인(확인): 각 스키마의 `V1__baseline.sql` 이 엔티티를 Hibernate OracleDialect 로 내보낸 DDL 이다(파일 머리말에 적혀 있음, 예: mcm-core/.../mcmapuser/V1__baseline.sql). 길이순은 기준선 파일에 그대로 들어 있다. 백엔드 설정은 `ddl-auto: none` 이라 실행 중에 표를 만들지는 않는다.
- 다른 시스템 위험: 같은 머리말에 "운영(WildFly)은 Flyway 를 끄고 DBA 가 이 파일을 그대로 적용한다" 고 적혀 있다. 순서를 고치는 V 파일만 더하면 V1 만 적용한 시스템은 다시 길이순이 된다 → 기준선 자체를 고친다.
- 규칙: PK → 엔티티(Java)에 선언된 필드 순서 → VER → 감사 컬럼 8개. 엔티티가 없는 표는 PK 를 맨 앞, 감사 컬럼을 맨 뒤로만 옮긴다.
- 범위: Flyway 로 관리하는 전 모듈 스키마(mcm·mdm·mls·mqc·mpp·mpn 등) 한 번에.
- 방법(10-11 사용자 결정 = 기준선 다시 쓰기, "머지된 V 파일 수정 금지" 의 예외 승인):
  1. 각 스키마 `V1__baseline.sql` 을 규칙 순서로 다시 쓴다. 손으로 쓰지 않고 엔티티·기존 DDL 을 읽는 스크립트로 만든다. 새 시스템은 V1 하나만 적용해도 바른 순서가 된다.
  2. 이미 만든 개발 DB(L_MAIN·TPL_*·각 PC·복제 PDB)는 컬럼 재배치를 한 번 돌린다(PK 가 아닌 컬럼을 규칙 순서로 `INVISIBLE` → `VISIBLE`, Oracle 12c 이상, 데이터 이동·제약 재생성 없음). 그 뒤 `flyway repair` 로 V1 체크섬을 새 파일에 맞춘다.
  3. 재발 막기: 모든 V 파일의 `create table` 과 복제 PDB 실제 컬럼 순서가 규칙에 맞는지 보는 시험을 둔다(나중에 표를 더하는 V 파일도 걸림). 엔티티에서 DDL 을 다시 내보내는 경로가 있으면 그 결과도 규칙 순서로 정렬한다. ERD 도구가 DDL 을 만들 때도 같은 순서를 쓴다.
- 순서: ① 컬럼 순서에 기대는 SQL 조사(컬럼 이름 없는 `INSERT ... VALUES`, `SELECT *` 순서 의존, 프로시저·시드 스크립트) ② 기준선 생성 스크립트·새 V1 작성 ③ 새 PDB 에 V1 부터 적용해 순서·시험 확인, 기존 DB 복제본에 재배치 + repair 확인 ④ L_MAIN·TPL_* 적용과 각 PC 안내 ⑤ 순서 검사 시험 추가.
- 시점: ERD UX 1차 마감 뒤 별도 회차. 여러 표 동시 처리(화면)와 영역이 달라 함께 돌릴 수 있다.


### Oracle 시험 잠금 세분화 (2026-10-09 결정 대기)

- 지금: Oracle 시험을 돌리는 빌드가 PC 전체 잠금(`$TMPDIR/dmes-ora-pdb.lock`) 하나를 PDB 복제→시험→삭제 전 구간 동안 쥔다. 다른 레인의 Oracle 시험은 그동안 줄을 선다(10-09 오전 16분 막힘, 사례 기록 [docs/reports/2026-10-09-oracle-test-turn-deadlock-heavy-slots.md](reports/2026-10-09-oracle-test-turn-deadlock-heavy-slots.md)).
- 안: 잠금을 구간별로 쪼개(복제·삭제만 잠그고 시험은 PDB 별로 동시에) 여러 레인이 함께 시험하게 한다.
- 걸림: Oracle 컨테이너 VM 메모리가 2~3GB 라 동시 시험이면 ORA-04031 등 메모리 부족이 날 수 있다 → VM 메모리를 늘릴지, 지금처럼 하나씩 둘지 정해야 한다.
- 함께 볼 것: Oracle 잠금을 기다리는 동안 heavy 슬롯을 쥐지 않게(같은 문서 대책 F), 빌드 안 시험 차례 교착(대책 A, b39ed2edf 로 해결).

