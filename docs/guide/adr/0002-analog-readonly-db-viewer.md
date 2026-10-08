# ADR-0002: analog 읽기전용 DB 뷰어 분리

- **Status**: ACCEPTED
- **Date**: 2026-10-08
- **Decision Date**: 2026-10-08
- **Context Tags**: analog, db-viewer, security, oracle

## 쉬운 설명 (현업용 요약)

오라클 테이블 내용을 눈으로 바로 확인하고 싶다는 요청이 있었습니다. 업무 화면(mcm) 안에 넣으면
권한·보안 규칙과 맞지 않아, 로그 조회 도구(analog)에 관리자 전용 읽기전용 조회 화면을 따로 둡니다.
처음에는 MCM 4개 스키마만 보이고, 한 번에 200건까지만 보여주며, 바꾸기(입력·수정·삭제)는 할 수 없습니다.

## Context (배경)

- 요청: 이미지(Toad/SQL 클라이언트식 좌측 스키마·테이블 트리 + 상단 SQL창 + 결과 그리드 + 컬럼 속성)와 같은
  오라클 테이블 조회 화면을 `mcm/tableBrowse` 로 구현하고, 오라클 전체 스키마 + 자유 SQL을 포함할 것.
- 확인된 제약:
  - `src/backend/mcm/api/.../config/JpaConfig.java` — mcm 런타임 계정은 `MCMAPUSER` 저권한이며
    `SCOTT/APSUSER` 등 타 스키마 조회 권한이 없다.
  - `src/backend/mcm/api/.../queryroute/QueryMapperLintTest.java` — MES 조회 라우터는 `SELECT *`·`${}` 치환 금지.
  - 기존 mcm BE는 테이블 고정 + 바인드 변수 방식만 사용하며, 동적 테이블 조회 API가 없다.
  - 비밀번호 해시·JWT 키 표는 스냅샷 제외 대상으로, DBA 도구 수준의 전체 노출과 상충한다.
- `analog` 선례: `LogSearchController.validateModule` 화이트리스트 가드,
  `ClientKeySecurityConfig` 단독 `X-Client-Key` 인증, MES 포털·RBAC·OASIS와 분리된 별도 앱(`m-analog`).

## Decision (결정)

- **D1**: MES 화면(`mcm/tableBrowse`)으로는 만들지 않는다. `analog-tool-workspace`
  (`analog-api-app` + `m-analog`)에 읽기전용 DB 뷰어를 분리한다. MES 5종 산출물·OASIS 계약·
  `QueryMapperLintTest` 대상이 아니다.
- **D2**: 허용 스키마 초기값은 `MCMAPUSER,MCM_SOURCE,MCM_BACKUP,MCAAPUSER` 로 한다.
  설정값(`analog.db.allowed-schemas`, env `ANALOG_DB_ALLOWED_SCHEMAS`)으로만 변경하며,
  스키마 추가는 DBA `SELECT` grant 확인 후 본 ADR 개정으로만 한다.
- **D3**: 실행 SQL은 `SELECT` 단문만 허용한다. `INSERT/UPDATE/DELETE/MERGE/DDL/UNION/;` 복문·SQL 주석(`--`, 블록주석)·괄호(함수·서브쿼리)를 거부하고,
  스키마·테이블·컬럼 식별자는 대문자 오라클 식별자 규칙으로 검증한다.
  단순 `WHERE`(비교·LIKE, 최대 500자)는 허용하되 원문이 아닌 파싱 결과로 재조립하며, 건수 상한은 SQL 텍스트·드라이버·추출
  3단계에서 중복 강제한다.
  편집창의 `SELECT *` 는 서버가 `ALL_TAB_COLUMNS` 로 명시 컬럼 목록으로 재작성한 뒤 실행한다(무제한 `*` 미실행).
  자격증명·토큰 패턴 컬럼(`PASS/PWD/HASH/TOKEN/SECRET/PRIVATE` 포함)은 명시 지정 시 거부, `*` 확장 시 제외한다.
- **D4**: 가드레일을 둔다. 최대 200건(`FETCH FIRST N ROWS ONLY` + `JdbcTemplate.setMaxRows` + 추출 중단 3중),
  쿼리 타임아웃 10초, 건별 감사로그(스키마·테이블·건수·소요ms·실행 SQL), `X-Client-Key` 필수.
  SQL 전체 4000자·SELECT 목록 100개 상한. 관리망 한정 기동(IP allowlist)은 v1 미구현 — 운영 배치 시 별도 조치.
- **D5**: DB 미설정(`analog.db.url` 없음) 시 analog 기동은 정상이며, DB 뷰어 API는 `503` + 안내 메시지를 반환한다.
- **D6** (2026-10-08 추가, LOB 보기): 조회 결과에는 LOB 요약만 싣고, 전체 내용은 칸 하나를 다시 읽어 보인다. 원본 내려받기는 두지 않는다.
  - 결과 그리드: CLOB·NCLOB 은 앞 4,000자 + `…(전체 N자)`, BLOB·RAW·LONG RAW 는 크기와 종류(`BLOB 48.8KB · PNG`, 앞 16바이트로 판별).
    응답 하나의 LOB 미리 보기 예산은 1,000,000자이고, 다 쓰면 나머지 CLOB 칸은 앞 100자만 싣는다.
    최악(200행 × 100칸이 모두 큰 CLOB)은 약 3.4M자(한글이면 약 10MB)로, 관리자 전용 도구라 받아들인다. LONG RAW 는 최대 64KB 까지만 읽는다.
  - 행 다시 찾기: 대상이 실제 표(`ALL_TABLES`, IOT 제외)일 때만 SELECT 목록에 `ROWIDTOCHAR(ROWID) "_ROWID"` 를 더하고,
    응답 `rowIdKey`·`lobColumns` 로 알린다. `_ROWID` 는 칸 목록(`columns`)에 넣지 않는다.
  - 한 칸 재조회 `POST /db/lob {schema, table, column, rowid}`: 스키마·식별자·민감 칸은 D2·D3 규칙을 그대로 타고,
    `ALL_TAB_COLUMNS` 로 실제 존재와 형식(CLOB·NCLOB·BLOB·RAW·LONG RAW)을 확인한 식별자만 SQL 에 넣는다.
    rowid 는 형식 검사(18자) 뒤 `CHARTOROWID(?)` 바인드로만 넘긴다. 사전에 없는 칸·행 없음은 `404`, LOB 가 아닌 칸은 `400`.
  - 응답 상한(서버에서 자른다): CLOB 앞 1,000,000자, BLOB·RAW 는 이미지(PNG·JPEG·GIF·WEBP, 1MB 이하)면 base64, UTF-8 글이면 앞 1MB 를 글로,
    그 밖은 앞 4,096바이트 hex. 권한은 기존 API 와 같은 permKey(`analog/dbviewer/query`)·`X-Client-Key` 경로이고 감사로그를 남긴다.
  - LONG·LONG RAW 는 같은 행의 다른 칸보다 먼저 읽어야 한다(오라클 드라이버 ORA-17027). 조회 요약은 LONG 글만 먼저 읽고 LONG RAW 는 읽지 않으며(`LONG RAW` 로만 표시),
    상세 창에서만 최대 1MB 를 읽는다(전체 길이는 알 수 없어 `lengthKnown=false`). 행 Map 순서는 SELECT 순서를 지킨다.
- **D7** (2026-10-08 추가, 보안 리뷰 반영): LOB 내용이 보이게 되면서 칸 이름만 보는 민감 칸 차단으로는 부족해, 다음을 더한다.
  - 민감 칸 차단은 모든 조회 경로(`*` 확장, 칸 목록 없는 구조화 조회, 명시 칸)에서 SQL 을 만들기 직전 한 곳에서 하고, WHERE·ORDER BY 에 쓴 민감 칸도 거부한다(한 글자씩 알아내기 방지).
  - 표 단위 차단 목록(`analog.db.denied-tables`): 기본 `TB_SEC_KEY_STORE`(JWT 서명 키), `TB_SEC_AUDIT_LOG`(평문 초기·임시 비밀번호가 든 감사 JSON),
    `TB_MCM_SEC_USER_WIDGET_CHAT`·`TB_MCM_SEC_USER_WIDGET_MEMO`(사용자 개인 글). 표 목록에서 숨기고 columns·query·lob 을 모두 거부한다.
  - 차단 목록은 늘리기만 한다: 실제 목록은 코드의 기본 목록과 설정 추가분의 합집합이며, 환경변수로 기본 목록을 줄일 수 없다(운영에서 실수로 풀리지 않게).
  - FROM 대상은 해당 OWNER 의 `ALL_TABLES`·`ALL_VIEWS` 에 있을 때만 실행한다(동의어로 다른 스키마 표를 읽는 경로 차단).

## Consequences (결과)

- 좋은 점: MES 보안·lint 규칙을 깨지 않고 이미지와 유사한 조회 UX(트리 + SQL창 + 그리드 + 컬럼 속성) 제공.
  권한 확대 없이 MCM 4개 스키마 즉시 조회 가능.
  BFF는 제네릭 프록시라 코드 등록이 불필요했다 (`ANALOG_WAS_URL` 기존 존재, permKey `analog/dbviewer/query`).
  포털 도달은 `ANALOG_STATIC_PAGES` 에 `anl/dbViewer` 1줄 등록으로 해결했다.
- 나쁜 점·비용: `analog/api` 에 Oracle JDBC 의존이 새로 들어간다. `SCOTT` 등 타 스키마는 DBA grant 없이는
  여전히 불가하다. `WHERE`는 허용하되 조인·서브쿼리·함수는 v1 미지원이다.
- 운영 잔여 (코드 아님 — 체크리스트로 이관): 읽기전용 DB 유저 발급·`ANALOG_DB_*` 설정(현재 로컬 검증은 `MCMAPUSER` 직결),
  운영 RBAC에 `analog/dbviewer/query` 관리자 롤 부여, 감사로그 파일 보관 정책, 동시 실행 상한·호출자 귀속(v2).

## Alternatives Considered (대안)

- **A. mcm 업무 화면으로 구현**: 기각. 저권한 계정으로 타 스키마 불가, lint·OASIS 계약 위반, 전수 스캔 위험.
- **B. 완전 자유 SQL 허용(검증 없음)**: 기각. 인젝션·추출·성능 위험으로 보안 승인 불가.
- **C. DBA 클라이언트 사용(SQL Developer/DBeaver/sqlplus)**: 유효한 대안으로 유지. PDB 직접 접속이 가능하면
  코드 없이 해결되며, 본 ADR과 상호 배타가 아니다.

## Acceptance Evidence (확정 근거)

- 적대적 검토 2건 (보안 공격 관점 12건 지적 중 상 3건 + must-fix 2건 전부 반영):
  주석 우회 차단 + 3중 건수 상한 + 민감 컬럼 denylist + `analog.db` yml 경로 통일 +
  `ANALOG_STATIC_PAGES` 등록 + WHERE 서술 모순 해소.
- BE 17건·기존 보안/메타 6건 통과. 전체 스위트 잔여 4건은 `git stash` 베이스라인 대조로 변경 전부터
  실패하는 환경 이슈(fixture 미커밋)임을 확인.
- 로컬 Oracle 실증 (`L_MAIN`, `MCMAPUSER` 55표): 정상·`*`·`WHERE` 200 반환, 주석·`UNION`·타스키마·민감컬럼·복문·DML
  6종 공격 전부 400 + 사유 본문 확인. FE 토스트에 사유가 표시된다 (`DbViewerExceptionHandler`).
- 잔여 운영 항목: 읽기전용 DB 유저 발급, `analog/dbviewer/query` 관리자 롤 부여, 감사로그 보관, 동시 실행 상한(v2).
- D6(LOB 보기): 로컬 Oracle(`L_MAIN`)에서 CLOB(`TB_MCM_NOTICE.CONTENT`)·NCLOB·PNG·글·PDF·무작위 BLOB·RAW·LONG RAW·NULL 칸과
  `/db/lob` 거부 경로를 확인했다. 1,200,000자 CLOB 은 1,000,000자로 잘렸고, 165행 × CLOB 2칸 응답은 3.0MB 였다.

## References

- `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/config/JpaConfig.java`
- `src/backend/mcm/api/src/test/java/com/dongkuk/dmes/mcm/queryroute/QueryMapperLintTest.java`
- `src/backend/analog/api/src/main/java/com/dongkuk/dmes/analog/web/LogSearchController.java` (`validateModule`)
- `src/backend/analog/api/src/main/java/com/dongkuk/dmes/analog/security/ClientKeySecurityConfig.java`
- `src/frontend/m-mcm/page-components/csa/commMenuMng/page.tsx` (좌 Tree + 우 그리드 FE 패턴)
- Image: Toad식 테이블 브라우저 캡처 (사용자 제공, `SCOTT.ACCOUNT_HISTORY` 예시)
