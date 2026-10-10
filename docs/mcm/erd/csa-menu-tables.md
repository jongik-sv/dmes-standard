# mcm / csa 메뉴·권한 — 테이블별 역할 설명

- 작성일: 2026-09-04
- 짝 문서: [`csa-menu-erd.md`](./csa-menu-erd.md) (관계도) · [`csa-menu.dbml`](./csa-menu.dbml) (dbdiagram.io 입력)
- 근거: `src/backend/data/mcm.db` 실측 + `mcm-core` 엔티티 + `SecUserService` / `DataInitializer`
- 공지사항 테이블(`TB_MCM_NOTICE`·`TB_MCM_NOTICE_TARGET`, 2026-10-07 mls 에서 이전)은 [`notice-tables.md`](./notice-tables.md) 에 따로 둔다.

이 문서는 **"이 테이블이 왜 있는가"** 만 다룬다. 컬럼 목록은 위 두 문서에 있다.

## 한 눈에

| 테이블 | 한 줄 역할 | 실측 | 소유 화면 |
|---|---|---:|---|
| `TB_MCM_SEC_MENU_FLD` | 메뉴 트리의 **폴더** | 8행 | 메뉴 관리 → 메뉴 필드 관리 팝업 |
| `TB_MCM_SEC_MENU` | 메뉴 트리의 **화면(leaf)** | 21행 | 메뉴 관리 본 그리드 |
| `TB_MCM_SEC_OBJ` | 화면의 **실체 등록부** | 21행 | OBJECT 관리 |
| `TB_MCM_SEC_ROLE_MAPPING` | **누가 무엇을 할 수 있는가** — 권한의 심장 | 21행 | 역할 관리 |
| `TB_MCM_SEC_PERM` | 권한 묶음 정의 (어떤 action 을 허용하는가) | 1행 | 권한 관리 |
| `TB_MCM_SEC_ROLE` | 역할 | 1행 | 역할 관리 |
| `TB_MCM_SEC_ROLEGROUP` | 역할 묶음 | 1행 | 역할 그룹 관리 |
| `TB_MCM_SEC_ROLEGROUP_MAPPING` | 역할그룹 ↔ 역할 연결 | 1행 | 역할 그룹 관리 |
| `TB_MCM_SEC_USER` | 사용자 | 1행 | 사용자 관리 |
| `TB_MCM_SEC_USER_MAPPING` | 사용자 ↔ 역할그룹 연결 | 1행 | 사용자 관리 |
| `TB_MCM_SEC_USER_PWD` | 비밀번호 (본체와 분리) | 1행 | 사용자 관리 |
| `TB_MCM_SEC_USER_FAVORITE` | 개인 즐겨찾기 | 0행 | 포털 사이드바 |
| `TB_MCM_SEC_USER_FAVORITE_FOLD` | 즐겨찾기 폴더 | 0행 | 포털 사이드바 |
| `TB_MCM_SEC_USER_WIDGET_TAB` | 개인 위젯 탭 | 신규(2026-10-02) | 포털 홈 위젯 |
| `TB_MCM_SEC_USER_WIDGET` | 개인 위젯 배치 | 신규(2026-10-02) | 포털 홈 위젯 |
| `TB_MCM_SEC_USER_START_PGM` | 개인 기본 화면(처음 시작할 때 여는 화면) | 신설 | 포털 탭 우클릭·사이드바 |
| `TB_MCM_SEC_USER_SRCH_DFLT` | 개인 조회 칸 기본값(화면·칸마다 규칙 한 줄) | 신규(2026-10-07) | 조회 영역 설정 아이콘 |
| `TB_MCM_WIDGET_DEF` | 위젯 정의·코드 위젯 덮어쓰기 | 신규(2026-10-02) | 위젯 관리 |
| `TB_MCM_WIDGET_DEFAULT_LAYOUT` | 「홈」 기본 배치(전사·부서) | 신규(2026-10-02) | 위젯 관리 → 기본 배치 |
| `TB_MCM_WIDGET_MEDIA` | 미디어 위젯 업로드 파일 메타 | 신규(2026-10-02) | 위젯 관리(미디어 위젯) |
| `TB_MCM_EXCHANGE_RATE` | 일자별 환율 | 삭제(Flyway V8, 2026-10-09) | 환율은 MDM 마스터 `FX_RATE` 로 이동 |
| `TB_MCM_SEC_USER_WIDGET_CHAT` | 개인 AI 챗봇 대화 기록 | 신규(2026-10-02) | 포털 홈 챗봇 위젯 |
| `TB_MCM_SEC_USER_WIDGET_MEMO` | 개인 메모(메모장 위젯) | 신규(2026-10-03) | 포털 홈 메모장 위젯 |
| `TB_MCM_USRQ_DEF` | 공용 쿼리 정의(SQL·입력·출력 정의) | 신규(2026-10-10) | 쿼리 정의 관리 |
| `TB_MCM_USRQ_ASSIGN` | 공용 쿼리 ↔ 사용자 할당 | 신규(2026-10-10) | 쿼리 정의 관리 → 할당 탭 |
| `TB_MCM_SEC_USER_HIS` | 사용자 변경 이력 | 0행 | (배치·인터페이스) |
| `TB_MCM_SEC_USER_ROLL_HIS` | 역할 부여 이력 | 0행 | (배치·인터페이스) |

---

## 1. 메뉴 트리 — 테이블 3개

메뉴 하나를 띄우려면 테이블 3개가 모두 필요하다. **폴더 / 화면 / 실체** 로 역할이 나뉜다.

### `TB_MCM_SEC_MENU_FLD` — 폴더

트리에서 **접었다 폈다 하는 마디**만 담는다. 클릭해도 화면이 안 뜨는 것들이다.

실측 8행 전부:

| MENU_ID | MENU_NM | PARENT | FULL_SEQ | VIEW_YN |
|---|---|---|---:|---|
| `mcm` | 공통관리 | — | 1,000,000 | NULL |
| `cma` | 마스터관리(원장) | `mcm` | 1,010,000 | NULL |
| `csa` | 시스템관리 | `mcm` | 1,020,000 | NULL |
| `cme` | 마스터관리(가동) | `mcm` | 1,030,000 | NULL |
| `cmb` | 업무기준관리(원장) | `mcm` | 1,040,000 | NULL |
| `cmz` | 팝업 | `mcm` | 1,050,000 | **N** |
| `analog` | 로그 분석 | — | 2,000,000 | Y |
| `anl` | 로그 조회 | `analog` | 2,010,000 | Y |

- `PARENT_MENU_ID` 가 **자기 자신을 가리킨다** — 모듈 루트(`mcm`, `analog`)는 NULL, 그룹은 모듈을 가리킨다.
- `cmz` 만 `MENU_VIEW_YN='N'` 이다. 팝업 화면들을 모아 두되 **사이드바에는 안 보이게** 하려는 용도다.
  메뉴 관리 화면에서는 보이고 사이드바에서만 숨는다.
- **`NULL` 은 숨김이 아니라 표시다.** `'N'` 일 때만 숨긴다.

### `TB_MCM_SEC_MENU` — 화면(leaf)

트리에서 **클릭하면 화면이 뜨는 마디**만 담는다. 폴더 행은 하나도 없다.

실측 21행 중 4행:

| MENU_ID | MENU_NM | PARENT | OBJECT_ID | FULL_SEQ |
|---|---|---|---|---:|
| `masterCategoryMng` | 카테고리 관리 | `cma` | `masterCategoryMng` | 1,010,100 |
| `masterCodeMng` | Master Code 관리 | `cma` | `masterCodeMng` | 1,010,110 |
| `commObjMng` | OBJECT 관리 | `csa` | `commObjMng` | 1,020,100 |
| `commMenuMng` | 메뉴 관리 | `csa` | `commMenuMng` | 1,020,110 |

- **`PARENT_MENU_ID` 는 같은 테이블이 아니라 `SEC_MENU_FLD` 를 가리킨다.** 이게 제일 헷갈리는 지점이다.
- `MENU_ID` 와 `OBJECT_ID` 가 **관행상 같은 값**이다. 강제는 아니지만 21행 전부 그렇다.
- 21행 전부 `OBJECT_ID` 를 갖는다. 화면이 없는 메뉴 행은 존재하지 않는다.

> **왜 폴더와 화면을 나눴나** — 2026-06-02 에 분리했다. 한 테이블에 섞여 있으면
> "이 행이 폴더인가 화면인가" 를 `OBJECT_ID IS NULL` 같은 조건으로 매번 판별해야 하고,
> 권한 필터가 폴더까지 훑게 된다. 지금 구조에서는 권한 판정이 `SEC_MENU`(화면)만 보면 되고
> 폴더는 그 결과로부터 역산한다.

### `TB_MCM_SEC_OBJ` — 화면의 실체 등록부

**"이런 화면이 존재한다"** 를 선언하는 곳이다. 메뉴에 걸리는 것과는 별개다.

- `OBJECT_ID` = `screenId` = `serviceId` = BPMN 파일명. 시스템 전체를 관통하는 단일 식별자다.
- **`SYSTEM_CODE` 가 FE 의 `moduleId` 가 된다.** BFF 가 이 값으로 어느 백엔드로 보낼지 정한다
  (`mcm` → 8100, `mls` → 8092, `analog` → 8191). 예: `logViewer` 의 `SYSTEM_CODE='analog'`.
- **메뉴에 안 걸리는 화면도 여기엔 등록된다.** 팝업이 그렇다 — 자기 `serviceId` 로 OASIS 를
  직접 호출하므로 OBJECT 가 있어야 권한 판정을 통과한다.
- 그래서 `SEC_OBJ`(21) 와 `SEC_MENU`(21) 행 수가 우연히 같아 보이지만 **개념이 다르다.**
  OBJECT 는 "화면의 존재", MENU 는 "트리에서의 위치" 다.

---

## 2. 권한 — 테이블 5개

`사용자 → 역할그룹 → 역할 → (화면 × 권한)` 4단 구조다. 중간 단계가 많아 보이지만
각 단계는 "묶어서 관리" 를 위한 것이다.

### `TB_MCM_SEC_ROLE_MAPPING` — 권한의 심장

**이 테이블 한 줄이 "역할 R 은 화면 O 에서 권한 P 를 갖는다" 를 뜻한다.**
`(OBJECT_ID, PERMISSION_ID, ROLE_ID)` 3중 복합 PK — 세 값의 조합 자체가 한 건이다.

실측 21행 = `SYSADMIN` × 화면 21개 × `PERM_ALL`.

- `SecUserService.filterMenusByRole` 이 여기서 **"허용 OBJECT_ID 집합"** 을 만든다. 메뉴 표시의 출발점.
- `EndpointPermissionFilter` 도 여기를 본다. **이 행이 없으면 메뉴에 걸어도 API 가 막힌다.**
- 신규 화면을 만들고 "메뉴는 걸었는데 안 보인다 / 조회가 안 된다" 면 십중팔구 여기가 비어 있다.

### `TB_MCM_SEC_PERM` — 권한 묶음 정의

**"권한 P 는 어떤 action 을 허용하는가"** 를 정의한다. 화면과 무관한 순수 정의다.

실측 1행:

| PERMISSION_ID | PERMISSION_NM | PERMISSION_ACTION |
|---|---|---|
| `PERM_ALL` | 전체 권한 | `search,save,delete,import,export,reg,confirm,cancel,approve,reject,copy,deleteCmUser,reReg` |

- `PERMISSION_ACTION` 은 **콤마 문자열**이다. `UserPermCache` 가 분할해 PermKey 를 만들고,
  화면의 버튼 활성/비활성이 여기서 갈린다 (`PageLayout.buttons` 의 `action` 값과 대조).
- 조회만 되는 역할을 만들려면 `PERMISSION_ACTION='search'` 인 권한을 새로 만들어 매핑하면 된다.
- `POPUP_BTN` / `PERMISSION_COMMON` / `PERMISSION_CUSTOM` 은 버튼 단위 세부 제어용이다.

### `TB_MCM_SEC_ROLE` — 역할

`SYSADMIN`(시스템관리자) 처럼 **직무 하나**를 뜻한다. 실측 1행.

- `ROLE_ID` 는 **`ROLE_` prefix 없이** 저장한다. JWT claim 을 만들 때 코드가 `ROLE_` 를 붙여
  `ROLE_SYSADMIN` 이 된다. DB 에 `ROLE_SYSADMIN` 으로 넣으면 `ROLE_ROLE_SYSADMIN` 이 되어 깨진다.
- `MENU_ID` 는 로그인 직후 기본 진입 메뉴다(→ `SEC_MENU_FLD`). 현재 NULL.
- `PARENT_ROLE_ID` 는 역할 상속용 컬럼인데 **지금 화면에서 안 쓴다.** DDL 만 남아 있다.

### `TB_MCM_SEC_ROLEGROUP` / `TB_MCM_SEC_ROLEGROUP_MAPPING` — 역할 묶음

역할 여러 개를 하나로 묶는다. 실측 `ROLE_GROUP_SYSADMIN`(시스템관리자 그룹) 1행.

- **사용자에게 역할을 직접 주지 않고 역할그룹을 준다.** 사람이 늘어도 그룹만 바꾸면 되기 때문이다.
- `ROLEGROUP_MAPPING` 이 그룹 ↔ 역할 연결선이다. `(ROLE_GROUP_ID, ROLE_ID)` 복합 PK.
- 역할이 하나뿐인 지금은 그룹이 군더더기처럼 보이지만, 역할이 늘면 이 층이 값을 한다.

---

## 3. 사용자 — 테이블 3개

### `TB_MCM_SEC_USER` — 사용자 본체

`admin` 1행. 성명·사번·부서·연락처 같은 **신원 정보**와 테마·엑셀 형식 같은 **개인 설정**이 함께 있다.

- `PWD_FAIL_COUNT` 로 로그인 실패를 센다 (`cactus.security.max-login-failures` 와 비교).
- `DEPT_CD` 는 `TB_MCM_DEPT_INFO` 를 가리키는데, 그 테이블이 비어 있으면 화면에 부서명이 공란으로 뜬다.

### `TB_MCM_SEC_USER_MAPPING` — 사용자 ↔ 역할그룹

실측 `admin` → `ROLE_GROUP_SYSADMIN` 1행. 권한 체인의 **첫 칸**이다.

> **길이 불일치 주의** — `SEC_USER.USER_ID` 는 `varchar(30)` 인데 여기 `USER_ID` 는 `varchar(100)` 이다.
> 지금은 문제가 없지만 같은 값을 담는 컬럼끼리 길이가 다르다.

### `TB_MCM_SEC_USER_PWD` — 비밀번호

**본체에서 분리한 이유**는 비밀번호 관련 컬럼이 6개나 되고 접근 통제 수준이 다르기 때문이다.

- `USER_ENC_PWD` = BCrypt 해시. `USER_ENC_TEMP_PWD` / `TEMP_PWD_EXPIRATION_DATE` 는 임시 비밀번호 발급용.
- `LAST_PWD_CHNG_DATE` 로 만료 정책(`mcm.password.expiry-days`)을 판정한다. **현재 정책은 전부 꺼져 있다.**
- `SALT` 컬럼은 BCrypt 를 쓰는 지금 미사용이다.
- `DataInitializer` 가 **매 부팅마다 admin 비밀번호를 `admin123` 으로 강제 재설정**한다. dev 안전망이다.

---

## 4. 즐겨찾기 — 테이블 2개

`TB_MCM_SEC_USER_FAVORITE` / `TB_MCM_SEC_USER_FAVORITE_FOLD`. 둘 다 **실측 0행** — 아직 미사용이다.

- 사용자가 사이드바에서 자주 쓰는 화면을 개인 폴더로 모아 두는 기능.
- FAVORITE 은 `SEC_MENU`(화면)를 가리킨다. 폴더가 아니라 화면만 즐겨찾기할 수 있다.
- PK 가 5중 복합(`FULL_ID` + `FVT_FOLD_ID` + `MENU_ID` + `MENU_SEQ` + `USER_ID`)이라 무거운 편이다.
  As-Is 에서 넘어온 구조로 보인다.

### 기본 화면 — `TB_MCM_SEC_USER_START_PGM` (2026-10-02 신설)

- 포털을 처음 시작할 때 자동으로 여는 개인 화면 목록이다. 탭을 우클릭해 '기본 화면 등록'으로 넣고,
  사이드바 '기본 화면' 목록에서 열거나 해제한다. 관리 방식은 즐겨찾기와 같고 폴더만 없다.
- PK = (`USER_ID`, `FULL_ID`, `MENU_ID`, `MENU_SEQ`), `START_SEQ` 가 여는 순서다. `FULL_ID` 는 즐겨찾기처럼 componentPath 다.
- 서비스는 `secStartPgm`(search·toggle, `SecStartPgmService`)이다. Flyway 파일이 없으므로 wildfly(`ddl-auto: none`) 환경은 DDL 을 미리 만들어야 한다.

### 조회 칸 사용자 기본값 — `TB_MCM_SEC_USER_SRCH_DFLT` (2026-10-07 신설, 스펙 `docs/superpowers/specs/2026-10-07-search-defaults-design.md` §5)

- 사용자가 조회 칸마다 정한 기본값 규칙이다. PK = (`USER_ID`, `PAGE_ID`, `FIELD_KEY`). `PAGE_ID` 는 포털 화면 키(`{moduleId}:{componentPath}`, 그리드 개인화의 화면 키와 같다)이고 `FIELD_KEY` 는 칸 식별자(`defaultKey ?? name`)다.
- `RULE_JSON`(VARCHAR 1000) 은 `{"kind":"fixed","value":…}`·`{"kind":"relative","base":"today|monthStart|monthEnd","months":N,"days":N}`·`{"kind":"last"}` 중 하나다. 서버가 검사한 정규형으로 저장한다(`months` ±120, `days` ±3660, 화면당 50행 이하). `FIELD_META`·`FIELD_LABEL` 은 나중에 관리자 배포 기본값이 칸을 찾고 사람이 알아보기 위한 속성이며 NULL 을 허용한다.
- 서비스는 `secSrchDflt`(search·savePage·resetPage, `SecSrchDfltService`, AUTH_ONLY)다. 사용자는 늘 인증 컨텍스트 값이고 `savePage` 는 그 화면의 행을 한 트랜잭션(`SecSrchDfltWriter`)으로 지우고 다시 넣는다. Flyway 파일이 없으므로 개발계·운영계(Oracle·PostgreSQL)는 앱 배포 전에 DDL 을 미리 만든다(`csa-menu.dbml` 참고). 서비스가 길이를 글자 수로 검사하므로 Oracle 문자열 열은 `VARCHAR2(n CHAR)` 로 만든다(BYTE 단위면 한글 고정값·라벨이 ORA-12899 로 500 오류가 난다).

### 위젯 B·C·D — 테이블 6개 (2026-10-02 신설·10-03 메모 추가, 스펙 `docs/superpowers/specs/2026-10-02-widget-admin-generic-design.md` §4·§17)

- **`TB_MCM_WIDGET_DEF`**: 위젯 정의. `SRC_TP='C'` 는 코드 위젯 메타 덮어쓰기(행은 관리자가 덮어쓸 때만 생긴다 — 없으면 코드 값 그대로·사용 중), `SRC_TP='D'` 는 관리자가 코드 없이 만든 위젯(`WIDGET_ID = def.{key}`, 본체는 `TYPE_ID` 유형). `USE_YN='N'` 이면 사용자 탭에서 자리는 지키고 「사용 중지된 위젯입니다」 빈 칸으로 보인다. 쿼리 유형의 SQL·챗봇 시스템 프롬프트는 `CONFIG_JSON` 에 있고, 일반 사용자용 목록(`widgetDef/list`)에서는 빠진다.
- **`TB_MCM_WIDGET_DEFAULT_LAYOUT`**: 「홈」 기본 배치. `LAYOUT_KEY` 는 `*`(전사) 또는 `DEPT_CD`. 적용 순서는 사용자 부서 → 상위 부서(`TB_MCM_DEPT_INFO.UPPER_DEPT_CD`) → 전사 → 화면 코드 상수이고, 자기 「홈」을 저장한 사용자에게는 영향이 없다.
- **`TB_MCM_WIDGET_MEDIA`**: 미디어 위젯 파일 메타. 본체는 DB 가 아니라 `dmes.widget.media-dir/{FILE_ID}` 디스크 파일이다(운영 배포 시 이 폴더를 보존·백업 대상에 넣는다).
- **`TB_MCM_EXCHANGE_RATE`**: 삭제(Flyway V8, 2026-10-09). 환율은 MDM 마스터 `FX_RATE`(날짜 한 행·통화 칼럼)로 옮겼고 위젯은 `FxMasterReader` 로 읽는다.
- **`TB_MCM_SEC_USER_WIDGET_CHAT`**: AI 챗봇 위젯 대화 기록(사용자·인스턴스별 최근 100개).
- **`TB_MCM_SEC_USER_WIDGET_MEMO`**: 메모장 위젯의 개인 메모(`scope=personal` 정의만). 사용자·배치 칸(`INST_ID`)마다 하나이고 `FMT` 는 `text`·`md`·`html`, 본문은 20,000자까지다. `TITLE`(2026-10-03 추가, NULL 허용)은 사용자가 붙인 메모장 제목(40자 이하, NULL = 위젯 정의 이름)이다 — 개발계·운영계는 앱 배포 전에 `ALTER TABLE … ADD TITLE`(Oracle `VARCHAR2(100 CHAR)`, PostgreSQL `varchar(100)`)을 먼저 실행한다(스펙 widget-admin-generic §17.2). 사용자당 100개(새 칸을 저장할 때만 센다). 공용 메모(`scope=shared`)는 이 테이블이 아니라 `TB_MCM_WIDGET_DEF.CONFIG_JSON` 에 있다. 사용자가 위젯을 빼도 행은 남는다.
- 서비스: 사용자용 `widgetDef/list`·`widgetData/run`·`widgetExt/*`·`widgetChat/*`·`widgetMemo/*`·미디어 내려받기는 AUTH_ONLY, 관리자용 `commWidgetMng/*`(정의 저장·SQL 미리보기·기본 배치·미디어 올리기)는 위젯 관리 메뉴 권한(RBAC). 여섯 테이블 모두 Flyway 없이 로컬 `ddl-auto: update` 로 생기므로 개발계·운영계는 DDL 을 미리 만든다(`csa-menu.dbml` 참고, 긴 문자열은 Oracle CLOB·PostgreSQL TEXT).

### 공용 쿼리 조회 — 테이블 2개 (2026-10-10 신설, 스펙 `docs/superpowers/specs/2026-10-10-user-query-program-design.md` §2)

- **`TB_MCM_USRQ_DEF`**: 관리자가 등록한 공용 쿼리 정의. PK = `QUERY_ID`(40). `SQL_TEXT`(CLOB, 필수)가 조회 SQL, `PARAMS_JSON`·`COLUMNS_JSON`(CLOB)이 입력·출력 정의다. `MAX_ROW_CNT`(기본 1000, 1~5000)는 최대 행 수, `USE_YN`(기본 `Y`)은 사용 여부다. `CATEGORY_CD` 는 공통코드 `USRQ_CTG`(처음 값 `ETC` 기타), `OWNER_DEPT_CD` 는 `TB_MCM_DEPT_INFO.DEPT_CD` 와 같은 길이(10)의 담당 부서다. 제약: `CK_TB_MCM_USRQ_DEF_USE`(`USE_YN` in Y/N)·`CK_TB_MCM_USRQ_DEF_MAX`(`MAX_ROW_CNT` 1~5000).
- **`TB_MCM_USRQ_ASSIGN`**: 정의 ↔ 사용자 할당. PK = (`QUERY_ID`, `USER_ID`), 사용자 단위만 있다. `USER_ID`(30)는 `TB_MCM_SEC_USER.USER_ID` 와 같은 길이다. 인덱스 `IX_TB_MCM_USRQ_ASSIGN_USER`(`USER_ID`, `QUERY_ID`)는 사용자 목록(`myList`)의 `USER_ID` 조건에 쓴다.
- **외래 키는 없다.** 정의를 지울 때 서비스가 할당을 먼저 지운다. 없는 사용자의 할당은 할당 탭이 「없는 사용자」로 보여 준다.
- 화면·서비스: `userQueryMng`(쿼리 정의 관리, csa 폴더, `PERM_ALL`)와 `userQuery`(공용 쿼리 조회, 새 폴더 `cmq` 공용 조회, 서비스 `myList`·`getDef`·`run`). 일반 역할은 권한 `PERM_USRQ_USE`(`myList,getDef,run`)로 매핑한다. 메뉴·OBJECT·권한·공통코드는 `ModuleMenuSeeder.seedUserQueryMenus`·`CoreRbacSeeder`·`UserQueryCategoryCodeSeeder` 가 시드한다.
- DDL 은 Flyway `mcm-core` `db/migration/oracle/mcmapuser/V13` 이다. 칼럼 주석은 DDL 에 있고, 감사 9 칼럼은 두 표에 모두 붙는다(`csa-menu.dbml` 에서는 생략).

---

## 5. 이력 — 테이블 2개

`TB_MCM_SEC_USER_HIS`(사용자 변경) / `TB_MCM_SEC_USER_ROLL_HIS`(역할 부여). 둘 다 **실측 0행**.

- 메뉴 동작과는 무관하다. 인사 인터페이스나 배치가 적재하는 감사 이력용이다.
- `INF_REQ_NO`(인터페이스 요청번호) 컬럼이 있는 것으로 보아 외부 연계 적재를 전제한 설계다.
- 일자(`ACTIVE_DT` / `OP_SUMUP_DT`)가 PK 앞자리에 있어 **일자별 스냅샷** 성격이다.

---

## 부록 — 자주 하는 착각

| 착각 | 실제 |
|---|---|
| 메뉴 테이블이 하나일 것이다 | 폴더(`SEC_MENU_FLD`)와 화면(`SEC_MENU`) 두 개다 |
| `SEC_MENU.PARENT_MENU_ID` 는 `SEC_MENU` 를 가리킨다 | **`SEC_MENU_FLD` 를 가리킨다** |
| `MENU_VIEW_YN` 이 NULL 이면 숨김이다 | **표시**다. `'N'` 일 때만 숨긴다 |
| OBJECT 만 만들면 화면이 뜬다 | 역할 매핑(`SEC_ROLE_MAPPING`)까지 있어야 API 가 열린다 |
| SYSADMIN 은 전부 통과한다 | `sysadmin-freepass` 기본값이 **false** — SYSADMIN 도 매핑으로 판정된다 |
| FK 제약이 걸려 있다 | **하나도 없다.** 전부 논리 FK, 조인은 코드가 한다 |
| `FULL_SEQ` 를 직접 입력해야 한다 | `recomputeMenuFullSeq()` 가 저장·부팅 시 자동 재계산한다 |
| 메뉴에 안 걸린 화면은 OBJECT 도 없다 | 팝업은 메뉴 없이 OBJECT 만 갖는다 |
