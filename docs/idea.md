## 신규 기능

- 룰셋에서 룰셋을 호출 할 수 있도록 한다.
  - 설계 문서: docs/superpowers/specs/[2026-10-01-rule-set-flow-subset-call-design.md](http://2026-10-01-rule-set-flow-subset-call-design.md). 10-01에 승인받았고, 결정 번호는 D-135로 예약해 두었습니다.
  - 구현 계획: docs/superpowers/plans/[2026-10-01-rule-set-flow-subset-call.md](http://2026-10-01-rule-set-flow-subset-call.md). 태스크 11개이고, 실행 방식(Subagent-driven)도 승인받았습니다.
  - 설계 내용은 다음과 같습니다.
    - SET 노드 추가: 하위 세트를 룰 하나처럼 다룹니다. 입력은 하위 세트의 입력이고, 돌려받는 값은 하위 세트의 최종 결과뿐입니다.
    - 버전: 판정 시각에 유효한 RELEASED 버전을 씁니다. 폐기한 세트는 부를 수 없습니다.
    - 순환과 하위 세트 수정: 세트끼리 순환하는 것은 저장할 때 막고, 실행할 때는 깊이를 제한합니다. 하위 세트를 고치면 그 세트를 부르는 세트를 다시 검사합니다.
    - 오류 처리: 하위 세트에서 처리되지 않은 오류는 부모 세트의 SET 노드에서 난 것으로 올라옵니다. 부모는 이것을 받는 노드(CATCH)로 처리할 수 있습니다.
    - 디버거와 DB: 디버거는 "안으로 들어가기"로 하위 세트의 흐름을 따라갑니다. 세트 버전 표에는 CALL_SET_IDS 칸을 추가합니다.
    - 편집 화면: 룰 세트 편집 화면 안에서 세트 탭을 최대 8개까지 엽니다.
    - 넣지 않는 것: 변수 이름을 바꿔서 넘기는 기능, 재귀 호출, 캔버스에서 하위 세트를 펼쳐 보이는 기능은 범위에서 뺐습니다.
- mod
  - 1. 프롬포트 모드
  - 2. 결정 대기 기록 모드 : 결정해야 하는 상황에서 결정한 목록과 결정 해야할 목록을 가지고 있는 모드

---

- 아날로그도 제대로된 화면을 만들자.
- DB 설계 도구
- DB 관리 도구
- ASD-STE100 조사 및 스킬에 적용

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
- 룰도  major, minor 버전으로 처리 되도록 변경하자.
- 같은 화면 중복으로 열기 (서로 다른 내용을 보기 위해)
- 일자별 환율 받을 방법은?
- dev-team 개발 : wbs 상관없이 진행중인 작업을 dflow에 보여주면 된다. dflow 연결 안되도 돌아가야 된다. 🔶 조정자 킷 연동 dev 머지(2026-10-06, 16e62873), 오피스 화면(wbs-web staging bef36c55)은 push·배포 대기
- 자바 패키지명 이상한것(예 kr.dongkuk.*)
- 사용자 전용 조회 프로그램
  - 사용자에게 할당된 전용 조회 프로그램이 있다.
  - 기본적으로 쿼리와 입출력값 정의를 하면 그에 맞춰서 화면을 그리면 된다.
  - 해당 화면은 사용자에게 할당 할 수 있는 구조다.
  - 왼쪽(폭20% 크기 조절 가능)에는 해당하는 화면 리스트가 나오고 오른쪽에는 해당 쿼리/정의로 화면이 생성된다.

### 위젯 관련

- 위젯 칸 설명의 화면 ID 예시 정리(2026-10-07 보류): 공지가 MCM 으로 옮겨져 화면 ID 가 `mcm:lsh/noticeMgmt` 가 됐는데, 메인 mdm.db 의 위젯 linkPageId 칸 설명과 `scripts/mdm-meta/columns-widget-2026-10-05.json` 예시는 아직 `mls:lsh/noticeMgmt` 다. 공용 DB 쓰기라 지금은 그대로 둔다.
- 메모장 위젯은 이름 바꾸는 기능, ✅ 완료(2026-10-05, 5f57d51f)
- 비공개 위젯 (키 검색으로만 추가 할 수 있음) ✅ 완료(2026-10-05, db556b7a)
  - 후속(2026-10-05~06): 위젯 관리 도움말·가이드(cdf677fa·713fadc8), mermaid 공통·크기·크게 보기(9cd34e76·abe45e80), 공통 Markdown 표 렌더(713fadc8), 위젯 복사(f0295be0), 새로 고침 최소 600초(c6183e0d), 칸 설명 툴팁(7fc7084b, 운영 MDM 등록 남음)

---

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
- **룰 세트에서 디버깅 중 룰 링크로 넘어가면 룰 테스트에 값이 채워지게 하자.**

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