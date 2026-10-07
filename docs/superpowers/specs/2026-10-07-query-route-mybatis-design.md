# 일반 조회를 MyBatis SQL·조회 라우터로 — 기술 설계

- 작성: 2026-10-07, 레인 query-route(회차 notice-fill2, 지시 query-route-1)
- 상태: **초안. 모듈별 정책 절(§2)은 사용자 정리 중이라 선택지만 적는다.** 가이드 문구(MUST·SHOULD)와 모듈 표는 정책이 확정된 뒤 따로 쓴다.
- 보안 수정(조회·서비스 라우터 보호)은 별도 레인 route-guard(`fix/route-auth-guard`)가 맡는다. 이 문서 §4 는 그 레인과 맞출 설계 기준이다.

## 0. 배경

사용자 결정(2026-10-07) 흐름:

1. 「BPMN 에는 실제 프로세스만 들어가게 하고 싶다. 일반 조회는 쿼리로만 조회하는 것으로 알고 있다.」 JPA 경유 안(B)에는 「쿼리를 위해 JPA 를 경유하는 느낌, 성능은?」, 「쿼리가 있어야 디버깅하기 쉽다」 → 안 A(MyBatis 매퍼 SQL + 조회 라우터).
2. 이후 「BPMN 도 있어야지」로 정정. 조회 라우터는 BPMN 을 대체하지 않는 추가 경로이고, 단순 조회는 MyBatis SQL 을 쓰도록 유도하는 방향. 모듈별 강도(mcm·mdm 과 업무 모듈)는 사용자와 조정자가 다시 정리하는 중이다.

이 문서는 정책과 무관하게 필요한 기술 사실·보안·방언·데이터소스·명명·이전 목록·시범 계획을 정한다.

## 1. 현황 (2026-10-07 확인, 근거 포함)

| # | 사실 | 근거 |
|---|---|---|
| F1 | mcm·mdm 백엔드에 `/query/{queryId}`·`/lov/query/{queryId}` 가 **이미 등록되어 있다.** 가이드 BE 04 §11-Y 표의 「mcm SqlSession ✗」는 사실과 다르다. | cactus-core `build.gradle` 이 `mybatis-spring-boot-starter` 를 `api` 로 물려준다. `CactusMultiMybatisAutoConfiguration`(`cactus.mybatis.enabled` 기본 true)이 `dataSource` 빈이 있으면 `sqlSessionFactoryBiz`·`sqlSessionTemplateBiz` 를 만든다 → `InboundAutoConfiguration` 의 `@ConditionalOnBean(SqlSession.class)` 통과. 실측: 실행 중 mcm(8100)·mdm(8096)에 `POST /query/no.such` → `S999`(라우트 있음), `POST /zzz/none` → `E404`. |
| F2 | 라우터 SqlSession 은 JPA 와 **같은 DataSource** 를 쓴다. | `sqlSessionFactoryBiz(@Qualifier("dataSource"))`. mcm yml `cactus.datasource.primary-alias: biz`. |
| F3 | JPA 와 MyBatis 가 한 트랜잭션에서 같은 커넥션을 공유한다(실측 기록 있음). | `docs/cactus/001_*/usage-guide.md` §5-0(`pilotHybridTx.bpmn` 2026-05-19). |
| F4 | **BPMN 안에서 매퍼를 부르는 길(ScriptTask + 매퍼 id)도 이미 있다.** 매퍼 위치 관례 `src/main/resources/persistence/{serviceGroup}/{screen}.xml`, 기본 `mapper-locations = classpath*:persistence/**/*.xml`. | usage-guide §5-3, `CactusMybatisProperties`. |
| F5 | 운영 코드의 매퍼 XML 은 cactus-core `persistence/dmom/DmomMapper.xml`(select 2·insert 2), caravan-hub 2개뿐이다. mcm·mdm 화면 조회는 모두 JPA(@Query·native·EntityManager). | `find … -name '*.xml' | xargs grep -l '<mapper'` |
| F6 | `/query/{queryId}` 는 statement 종류를 검사하지 않는다. insert id 를 주면 실행·커밋된다. 화면 권한 검사도 없다(BFF `unmatchedDeny=false`, BE `EndpointPermissionFilter` 가 PermKey 를 못 뽑아 통과). `/service/*`·`/query/service/*`·`/lov/service/*` 도 같은 우회가 있다. | cactus-core 단위 탐침(SQLite, 행 0→1), `shared/src/auth/rbac-policy.ts` RESERVED_SECOND_SEG, `PermKey.parseUrl`. **수정은 route-guard 레인.** |
| F7 | `resultType=map` 의 Map 키에는 `mapUnderscoreToCamelCase` 가 적용되지 않는다. 키는 DB 가 돌려준 열 이름 그대로다. | `DmomMapper.xml` 주석·`DmomFormatRepositoryTest`. MyBatis `MapWrapper.findProperty` 는 이름을 바꾸지 않는다. |
| F8 | `MasterCodeMybatisInterceptor` 가 모든 SELECT 결과에서 `XXX_CD`→`XXX_CD_NM`, `MASTER_CODE/VALUE/DISPLAY_VALUE` 형식을 자동 디코딩한다. 키가 대문자 스네이크일 때만 동작한다. | 클래스 주석. |
| F9 | `SqlLoggingInterceptor` 는 SQL 본문·**바인딩 값**·경과 시간을 모두 INFO 로 남긴다. | `cactus/audit/SqlLoggingInterceptor.java` 51~86줄. |
| F10 | 기존 `DmomMapper.getFormatLayout` 은 MSSQL 전용 문법(`TOP 1`, `GETDATE()`)과 따옴표 없는 별칭을 쓴다. MSSQL 폐지 뒤 Oracle·PostgreSQL 에서 그대로는 동작하지 않는다. | 매퍼 본문. 이번 범위 밖(별도 후속). |
| F11 | FE 헬퍼 `apiQuery(module, queryId, params)`·`apiLovQuery` 와 BFF 라우트 `app/api/[module]/query/[queryId]` 가 있다. 지금 이 헬퍼를 쓰는 화면은 없다. | `shared/src/http/index.ts:426`, `grep apiQuery(` |

## 2. 정책 (보류 — 선택지만)

사용자 정리가 끝나면 아래 중 하나로 채운다. 기술 설계(§3 이하)는 어느 안이든 같다.

| 안 | 내용 |
|---|---|
| P1 | 모든 모듈: BPMN 기본 유지, 조회 라우터는 허용된 추가 경로. 단순 조회는 MyBatis SQL 권장(라우터 직접 또는 BPMN 안 매퍼). |
| P2 | mcm·mdm 은 단순 조회를 라우터로 고정, 업무 모듈은 P1. |
| P3 | 현행 유지(라우터 금지) + 보안 보호만. |

## 3. 「단순 조회」 판정 기준 (초안)

정책 강도와 상관없이, 라우터를 쓸 수 있는 조회의 기술 조건이다. **아래를 모두 만족하면 단순 조회다.**

1. DB 를 읽기만 한다(같은 요청에서 쓰기·외부 호출·메시지 발행이 없다).
2. SQL 문 하나(동적 조건 `<if>`·`<where>` 포함)로 결과가 나온다. 결과를 Java 에서 다시 합치거나 여러 번 조회해 엮지 않는다.
3. 입력값 검사가 「형식·길이·허용 값」 수준이다(매퍼 `<if>` 나 공통 검사로 충분하다).
4. 행 단위 권한(본인 데이터·부서 범위)이 필요하면 그 조건이 **서버가 넣는 값**(§4 S3)으로 SQL 안에 표현된다.
5. 결과 행 수가 상한(§4 S4) 안에 든다. 대량 내보내기는 별도 경로다.

**단순 조회가 아닌 예(BPMN·서비스 유지):**
- 조회 결과를 가공해 여러 그리드·트리로 나누는 것(예: `commMenuMng` 트리 조립, `screenUsageStat` 지표 집계 후 조립).
- 잠금·버전 상태를 보고 분기하는 조회(mdm `*Edit.view` — 잠금 보유자·작업본 판정).
- 외부 시스템·캐시를 거치는 조회(mdm 메타 캐시, 환율·날씨 `widgetExt`).
- 사용자가 만든 SQL 을 실행하는 것(`widgetData.run` — 별도 실행기·읽기 전용 DS).
- 마스킹·복호화가 필요한 열(주민번호 등)이 있는 조회. 마스킹을 SQL 함수로 표현할 수 없으면 서비스에 둔다.

**권한·마스킹·다단 가공이 필요한 조회의 처리:**
- 화면 권한만 필요 → 라우터 + §4 S2(queryId 와 화면 권한 묶기)로 충분하다.
- 행 단위 권한 → 서버 주입 값으로 SQL 에 조건을 넣을 수 있으면 라우터, 아니면 서비스.
- 마스킹 → SQL 함수(방언별)로 되면 라우터, 아니면 서비스.
- 다단 가공 → BPMN 서비스 안에서 매퍼를 부른다(F4). SQL 은 매퍼 XML 에 남으므로 디버깅 이점은 같다.

## 4. 보안 설계 (route-guard 레인과 맞출 기준)

| # | 항목 | 선택지 | 추천 |
|---|---|---|---|
| S1 | 라우터 노출 범위 | (a) 매퍼 파일 위치로 정한다: `persistence/query/**` 아래 매퍼만 라우터에 노출하고, 그 밖(`DmomMapper` 등 내부 매퍼, BPMN 안에서만 쓰는 매퍼)은 404. (b) yml 허용 목록(`cactus.query.exposed-namespaces`). (c) 모든 SELECT 허용. | **(a).** 설정을 따로 고치지 않아도 되고, 매퍼를 만든 사람이 위치로 노출을 선언한다. 판정은 `MappedStatement.getResource()` 경로로 한다. 기본값은 거부(fail-closed)다. |
| S2 | 화면 권한과 queryId 묶기 | (a) queryId = `{objId}.{action}`(namespace = 화면 objId = 기존 OASIS serviceId, statement id = action). BE 는 `/query/{objId}.{action}` 을 `PermKey(module,"oasis",objId,action)` 로, BFF 는 `module/objId/action` 키로 환산한다. (b) 라우터 전용 권한 행을 새로 만든다. (c) 로그인만 확인한다. | **(a).** 기존 OBJECT·버튼 권한(TB_MCM_SEC_OBJ·PERM_BUTTON) 시드를 그대로 쓰므로 새 시드가 필요 없다. 같은 화면의 OASIS 조회 권한과 라우터 조회 권한이 자동으로 같아진다. 형식이 맞지 않는 queryId 는 거부한다. |
| S3 | 서버가 넣는 값(IDOR) | 요청 키 중 `_` 로 시작하는 키를 지운 뒤 서버가 `_userId`(인증 주체)·`_sysCd` 등을 넣는다. 매퍼는 사용자 식별이 필요하면 `#{_userId}` 만 쓴다. `${}` 문자열 치환은 조회 매퍼에서 금지하고 정적 검사로 막는다. | 그대로 채택. 넣을 키 목록은 route-guard 와 정한다. |
| S4 | 행 상한·페이지 | (a) `RowBounds(0, max+1)` 로 읽어 상한을 넘으면 거절(오류 + 「조건을 좁혀 달라」). (b) 넘으면 잘라서 돌려주고 표시한다. | **(a).** 조용히 잘리면 사용자가 모른다. 기본 상한 10,000행, `cactus.query.max-rows` 로 조정. 페이지 조회는 `_offset`·`_limit` 와 공통 SQL 조각(§5 D3)으로 한다. |
| S5 | statement 종류 | SELECT 만 허용, 그 밖은 거부. 없는 id 는 404. | 그대로 채택(F6 대응). |
| S6 | LoV 라우터 | `/lov/query` 는 BFF 정책상 로그인만 확인하는 경로다. | 노출은 S1 과 같은 규칙에 `persistence/lov/**` 를 따로 두고, 코드성·공개 범위 데이터만 둔다. 화면 데이터는 `/query` 로 한다. |
| S7 | 읽기 전용 연결 | (a) `@Transactional(readOnly=true)`. (b) 위젯 실행기처럼 방언별 읽기 전용 설정(SQLite `PRAGMA query_only`, PostgreSQL·Oracle `SET TRANSACTION READ ONLY`). (c) 운영은 읽기 전용 DB 계정 DataSource. | 1차 방어는 S5. (a)는 sqlite-jdbc 가 연결 뒤 `setReadOnly` 를 거부하므로 시험으로 확인한 뒤에 쓴다. 장기적으로 (c). |
| S8 | 로그 | 바인딩 값이 INFO 로 남는다(F9). | SQL 본문·queryId·경과 시간은 INFO, 바인딩 값은 DEBUG 로 낮춘다(개인정보). 디버깅할 때는 로거 수준만 올린다. |

### 4-1. route-guard 레인 반영 사항 (2026-10-07)

- 스위치(기본 off): `cactus.inbound.query-routes.enabled`(`/query/{id}`·`/lov/query/{id}`), `cactus.inbound.service-routes.enabled`(`/service`·`/query/service`·`/lov/service`). `/lov/master` 는 늘 켠다.
- 켰을 때의 공통 검사(cactus-core `QueryStatementGuard`): S2 형식(`{objId}.{action}`, 아니면 400), S5(없는 id 404·`ms.getId()` 정확 일치·SELECT 만·CALLABLE·selectKey 거부), S1(`persistence/query/`·`persistence/lov/`), S4(`cactus.query.max-rows`, 기본 10,000).
- S2 권한 키 환산과 S3 서버 주입은 아직 없다. 그동안 mcm `EndpointPermissionFilter` 와 BFF 는 `/query/`·`/lov/query/`·`/service/`·`/lov/service/` 를 경로 모양으로 거부한다. 라우터를 켜는 회차에 그 자리를 S2 판정으로 바꾼다.
- **mdm(8096)에는 `EndpointPermissionFilter` 가 없다**(mcm `SecurityConfig` 만 연결). mdm 에서 라우터를 켜려면 mdm 에도 BE 권한 판정을 먼저 넣어야 한다.

## 5. 방언 설계

대상: 로컬·시험 SQLite, 운영 Oracle 또는 PostgreSQL. MSSQL 은 대상이 아니다(사용자 메모 2026-10-03).

| # | 항목 | 선택지 | 추천 |
|---|---|---|---|
| D1 | 방언 구분 수단 | (a) 공통 SQL 만 허용. (b) `databaseIdProvider` 를 등록하고 다른 부분만 `databaseId="oracle|postgresql|sqlite"` 변형 statement 나 `<if test="_databaseId == 'oracle'">` 로 나눈다. (c) 방언별 매퍼 파일. | **(b), 단 기본은 공통 SQL.** cactus `build()` 에 `VendorDatabaseIdProvider`(Oracle→`oracle`, PostgreSQL→`postgresql`, SQLite→`sqlite`)를 넣는다. databaseId 없는 statement 가 기본이고, 다른 방언용 변형이 있으면 MyBatis 가 그것을 고른다. (c)는 같은 화면 SQL 이 여러 파일로 흩어져 디버깅이 어려워진다. |
| D2 | 결과 키 대소문자 | 따옴표 없는 별칭은 Oracle 이 대문자, PostgreSQL 이 소문자로 바꾸고, SQLite 는 쓴 그대로 돌려준다. 그래서 SQLite 시험은 통과해도 운영에서 키가 어긋난다(F7). (a) 모든 열에 큰따옴표 별칭(`CODE_VAL AS "codeVal"`). (b) 프레임워크가 키를 정규화한다. (c) resultMap. | **(a).** FE 가 받는 키가 SQL 에 그대로 보여 디버깅이 쉽고, 방언과 무관하다. 큰따옴표 없는 별칭·`SELECT *` 는 정적 검사로 막는다. 키 표기(camelCase 또는 대문자 스네이크)는 §6 결정 항목 K1. |
| D3 | 페이지·상위 N | Oracle 12c+ 와 PostgreSQL 은 `OFFSET n ROWS FETCH NEXT m ROWS ONLY` 를 지원하지만 SQLite 는 `LIMIT m OFFSET n` 만 된다. | cactus-core 에 공통 `<sql>` 조각(`cactus.page`)을 두고 그 안에서만 `_databaseId` 로 나눈다. 화면 매퍼는 `<include refid="cactus.page"/>` 만 쓴다. Oracle 버전이 12c 미만이면 다시 정한다. |
| D4 | 자주 어긋나는 함수 | `NVL`(Oracle 전용) → `COALESCE`, `SYSDATE`·`GETDATE()` → 서버가 넣는 `_now` 값, `DECODE` → `CASE`, `(+)` 외부 조인 → `LEFT JOIN`, `ROWNUM`·`TOP` → D3, 문자열 연결 `||` 는 세 방언 공통이라 허용, LIKE 패턴은 `<bind name="xLike" value="'%' + x + '%'"/>` 로 SQL 밖에서 만든다. | 정적 검사 규칙으로 넣는다. |
| D5 | SQLite 시험에서 운영 방언 지키기 | (a) 정적 검사(D2·D4 금지 패턴, databaseId 변형이 있으면 세 방언 모두 있는지). (b) 운영 방언 DB 로 시험(도커 금지라 로컬 자동 시험은 불가). (c) 개발계 Oracle·PostgreSQL 에서 매퍼 전체를 `EXPLAIN` 하는 점검 스크립트를 배포 전에 수동으로 돌린다. | **(a) 필수 + (c) 배포 전 점검.** (a)는 매퍼 XML 을 읽는 단위 시험 하나로 구현해 모든 모듈 시험에서 돈다. |
| D6 | 스키마 접두어·SQLite 치환 | 운영 SQL 은 `MCMAPUSER.TABLE` 형식이다(PostgreSQL 스키마, Oracle 사용자). 로컬 SQLite 는 스키마가 없어 mcm `JpaConfig` 가 Hibernate `McmAuditStatementInspector` 로 `MCMAPUSER.` 제거·`SYSDATETIME()`·`ISNULL(`·`N'…'` 를 치환한다. **MyBatis SQL 은 이 검사기를 거치지 않으므로 매퍼 SQL 은 로컬에서 `no such table` 로 실패한다**(기존 `DmomMapper` 도 같다). | 시범에서 mcm-core `McmSqliteMybatisInterceptor`(StatementHandler.prepare, 연결의 DB 제품명이 SQLite 일 때만 같은 치환)를 넣고 mcm `McmMybatisConfig` 가 cactus 가 만든 SqlSessionFactory 마다 붙인다. 운영 DB 에서는 SQL 을 건드리지 않는다. **cactus 공통화 후보:** 치환 규칙(스키마 접두 목록)을 `cactus.mybatis.sqlite-rewrite.schemas` 같은 설정으로 받아 `CactusMultiMybatisAutoConfiguration.build()` 의 인터셉터 목록에 넣으면 업무 모듈(MLSAPUSER 등)도 같은 인터셉터를 쓸 수 있다. 지금 Hibernate 쪽 검사기는 mcm 에만 있다. |
| D7 | MyBatis 쓰기의 감사 열 | JPA 쓰기는 `McmAuditStatementInspector` 가 감사 9열을 보강한다. MyBatis 쓰기는 cactus `CactusMybatisAuditInterceptor` 가 맡는다. | BPMN 안 매퍼로 쓰기를 할 때 두 인터셉터가 같은 열을 같은 값으로 채우는지 확인한다(후속 확인 항목, 조회 라우터와는 무관). |

## 6. 매퍼 위치·명명·결과·FE·디버깅

- **위치:** 라우터 노출 매퍼 `src/main/resources/persistence/query/{group}/{objId}.xml`. BPMN 안에서만 쓰는 매퍼는 기존 관례 `persistence/{group}/{objId}.xml`(F4). LoV 는 `persistence/lov/{group}/{name}.xml`.
- **namespace:** 화면 objId(= OASIS serviceId, camelCase). **statement id:** action 이름(`search`, `searchDetail`, `lov` …). 그래서 queryId = `{objId}.{action}` 이고 URL 은 `/api/{module}/query/{objId}.{action}` 이다.
- **결과 키(K1, 결정 필요):** (a) camelCase 큰따옴표 별칭 — FE 대부분의 관례와 같다. 다만 `MasterCodeMybatisInterceptor` 자동 디코딩(F8)이 동작하지 않는다. (b) 대문자 스네이크 큰따옴표 별칭 — 자동 디코딩이 동작하지만 FE 관례와 다르다. **추천 (a)**, 코드명은 SQL JOIN 이나 공통 코드 조각으로 직접 가져온다. 기존 화면을 옮길 때는 지금 FE 가 받는 키를 그대로 별칭으로 쓴다(시범도 이렇게 한다).
- **FE 호출:** `apiQuery<Row[]>("mcm", "masterCodeSelPop.search", params)`. 응답은 `ApiResponse`(`data` 가 행 배열)이고, OASIS 의 `grids.{output}.rows` 와 모양이 다르다. 화면의 `api.ts` 한 곳에서만 바꾼다.
- **디버깅:** 매퍼 XML 이 실행 SQL 의 정본이다. 로그는 `/* {queryId} */` 머리와 SQL 본문·경과 시간(INFO), 바인딩 값(DEBUG, S8)을 남긴다.

## 7. 데이터소스·트랜잭션

- 라우터는 biz `SqlSessionTemplate`(= JPA 와 같은 `dataSource`, F2)만 쓴다. cmn·if·caravan DS 의 조회는 라우터 대상이 아니다(필요하면 BPMN ScriptTask 의 `tx` 로 고른다, F4).
- 라우터는 Spring 트랜잭션 밖에서 statement 마다 자동 커밋 연결로 돈다. 읽기만 하므로 정합성 문제는 없고, 읽기 전용 보장은 §4 S5·S7 로 한다.
- BPMN 서비스 안에서 매퍼를 부르면 그 서비스의 트랜잭션에 참여하고 JPA 와 같은 연결을 쓴다(F3). 같은 트랜잭션에서 JPA 로 쓴 직후 매퍼로 읽으려면 먼저 `flush` 해야 한다(Hibernate 쓰기 지연).
- **mdm:** SqlSession 은 이미 있다(F1, 8096). 라우터는 MDM 메타 캐시·버전별 캐시를 거치지 않고 DB 를 바로 읽는다. 그래서 캐시를 기준으로 판정하는 조회(메타 해석·버전 선택)는 서비스에 두고, 라우터는 목록 화면처럼 캐시와 무관한 조회에만 쓴다. `maru-mdm-engine` 은 매퍼를 두지 않는다(엔진은 저장소 중립).
- `open-in-view: false` 는 영향이 없다(라우터는 JPA 를 쓰지 않는다).

## 8. 기존 조회 전용 BPMN 목록 (이전 제안만, 이번에 옮기지 않음)

MES·MDM BPMN 65개, action 270개다. 그중 읽기 성격 action(search·view·lov·list·history 등)이 약 100개다.

**엄격 기준(BPMN 전체가 조회 action 하나):**

| BPMN | action | BPMN 줄 | 서비스 줄 | 비고 |
|---|---|---|---|---|
| mcm `cma/masterCodeSelPop` | search | 83 | 138 | **시범.** As-Is 매퍼 원문이 서비스 주석에 있다. 결과 List. |
| mcm `cmb/masterRuleListPop` | search | 87 | 98 | 결과가 `{ds_GetRuleMasterList, cnt}` Map 이라 FE 파싱을 바꿔야 한다. |
| mcm `roleManagement/widgetDef` | list | 68 | 50 | 부서 기준 배치 판정(본인 데이터)이 들어 있어 단순 조회가 아니다. |
| mls `lsh/noticeBoard` | search | 75 | — | 공지(다른 레인 소관). |

**넓은 기준(조회 action 만 여러 개):**

| BPMN | action | BPMN 줄 | 서비스 줄 | 판정 |
|---|---|---|---|---|
| mcm `audit/auditLog` | search, period | 61 | 148 | 단순 조회 후보(페이지 있음 → D3). |
| mcm `cme/masterCodeMngList` | search, searchDetail | 89 | 414 | searchDetail 이 카테고리 LoV 와 상세를 합쳐 돌려준다 → 일부만 후보. |
| mcm `cmb/masterRuleDataList` | search, lov, searchExport | 156 | 247 | 동적 열(규칙 프레임) 조회라 단순 조회가 아니다. |
| mcm `csa/screenUsageStat` | overview 등 6개 | 243 | 67(위임) | 집계 후 조립 → 서비스 유지. |
| mdm `dmd/dataHistory` | view, search | 109 | 173 | 버전 이력. 캐시 무관하면 후보. |

**이전 순서 제안:** 시범(masterCodeSelPop) → auditLog(페이지 조각 검증) → masterRuleListPop(응답 모양 변경 사례) → 저장 BPMN 안의 search action 은 정책 확정 뒤 화면을 고칠 때 함께 옮긴다(일괄 이전은 권하지 않는다. 화면마다 FE 응답 파싱이 바뀌어 회귀 위험이 크다).

## 9. 가이드 변경 대상 (문구는 정책 확정 뒤)

| 문서 | 위치 | 바뀔 내용 |
|---|---|---|
| BE 04 | `docs/guide/BackEnd/standard-v2/backend-standard/04-cases-checklist-menu.md` §11-Y(77~92줄) | 모듈 표의 SqlSession 열(사실 F1로 정정), 「금지 — 무조건 OASIS」·「SqlSession 도입 금지」 MUST, 명명 규칙에 queryId = `{objId}.{action}` |
| BPMN 설계 | `docs/guide/design/bpmn-design/01-overview-and-input.md` §A.2-3-2(305줄~), 117줄 | 채택 기준 표(단순 조회 판정 §3) |
| FE 표준 | `docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md` §2-2-1·§2-2-1-A(130·148줄) | 모듈별 사용 조건, `apiQuery` 응답 모양 |
| FE Part B | `part-b-shared-policy.md` 85줄 | 헬퍼 사용 문구 |
| 스킬 | `oasis-project-support`, `bpmn-skill`, `mantine-aggrid-ui`, `oasis-contract-check`(§K 「apiQuery = 404 = ✗」 판정) | 조회 라우터 안내·판정 규칙 |
| cactus 사용 가이드 | `docs/cactus/001_*/usage-guide.md` §5-3 | 라우터 노출 위치 `persistence/query/**` 추가 |

## 10. 시범 계획 (mcm masterCodeSelPop)

1. 매퍼 `mcm/api/src/main/resources/persistence/query/cma/masterCodeSelPop.xml`(namespace `masterCodeSelPop`, id `search`)에 서비스와 같은 SQL 을 쓴다. 별칭은 지금 FE 키(`"CODE_VAL"` 등)를 큰따옴표로 쓰고, LIKE 는 `<bind>` 로 만든다.
2. 시험(SQLite, 도커 없음): 같은 입력 조합(조건 없음·pCodeId·pDiv=CODE_VAL·pDiv=CODE_VAL_MEAN·빈 pValue·대소문자 섞임)마다 `MasterCodeSelPopService.search` 결과와 `sqlSession.selectList("masterCodeSelPop.search")` 결과가 행 순서·값까지 같은지 비교한다.
3. 성능: 같은 시험 안에서 OASIS 경로(`/oasis/masterCodeSelPop/search`)와 라우터 경로(`/query/masterCodeSelPop.search`)를 MockMvc 로 번갈아 각 20회(예열 5회 뒤) 재서 중앙값·p90 을 적는다. 이 PC 는 측정이 흔들리므로 결론은 「차이가 있다/없다」 수준으로만 쓴다.
4. FE: `api.ts` 의 `searchMasterCodes` 만 `apiQuery` 로 바꾼다(BPMN 은 지우지 않는다). **미룸(조정자 결정 2026-10-07):** 라우터 스위치·S2 권한 판정을 켜는 회차에서 한다. route-guard 이후 BE·BFF 가 `/query/` 를 거부하므로 그 전에는 화면에서 부를 수 없다.
5. 워크트리 서버에서 브라우저로 팝업 조회를 확인하고 정리한다. **미룸**(4와 함께).

### 10-1. 시범 결과 (2026-10-07, 커밋 3a2281cf3 — 백엔드만, FE 전환은 S2·스위치를 켜는 회차로 미룸)

**동등성** — `mcm/api` 시험 `MasterCodeSelPopQueryRouteParityTest` 15건 통과(`sh ../gradlew -p . :api:test --tests 'com.dongkuk.dmes.mcm.queryroute.*'`, mcm 폴더에서). 같은 SQLite 파일 위에 OASIS 경로(MockMvc `/oasis/masterCodeSelPop/search` → BPMN → 서비스)와 라우터 경로(MockMvc `/query/masterCodeSelPop.search` → QueryController → 매퍼)를 운영과 같은 모양으로 조립했다. 입력 13조합(조건 없음, 코드 ID 일치·대소문자, 빈 코드 ID, 값·의미 LIKE, 한글, 와일드카드 문자 `_`·`%`, 알 수 없는 pDiv, 조합, 일치 없음)에서 행 순서·키·값(NULL 포함)이 같다.

**알려진 차이 1건** — params 에 `"pValue": null` 처럼 값이 null 인 키를 명시하면 OASIS 경로는 서비스에 닿기 전에 S999(「The type cannot be determined because object is null」, oasis 입력 변환)로 실패한다. 라우터는 키가 없을 때와 같은 행을 돌려준다. FE 는 pValue 를 늘 문자열로 보내므로 지금 화면 영향은 없다. 시험이 이 차이를 현재 동작으로 고정한다.

**성능** — `MasterCodeSelPopQueryRoutePerfTest`(`QUERY_ROUTE_PERF=1` 일 때만). 두 경로를 번갈아 부르고, 워밍업 각 5회를 뺀 뒤 각 20회. MockMvc 요청 하나의 왕복(JSON 직렬화 포함) 시간이다. 3회 반복했고 측정 중 부하 평균은 6.6~11 이었다(MacBook Air M5, 다른 세션 작업 중).

| 행 수 | 회차 | OASIS 중앙값 / p90 (ms) | 라우터 중앙값 / p90 (ms) |
|---|---|---|---|
| 100 | 1 | 5.68 / 6.22 | 3.30 / 3.92 |
| 100 | 2 | 3.05 / 3.85 | 1.78 / 2.01 |
| 100 | 3 | 4.32 / 5.11 | 2.41 / 2.74 |
| 10,000 | 1 | 53.52 / 59.28 | 57.61 / 61.20 |
| 10,000 | 2 | 69.58 / 82.06 | 75.97 / 87.87 |
| 10,000 | 3 | 96.17 / 103.62 | 103.96 / 111.97 |

읽는 법(조심스럽게): 절대값은 회차마다 크게 흔들리지만(10,000행 중앙값 53→96ms), **세 회차 모두 방향은 같다.** 100행에서는 라우터가 1.3~2.4ms 빠르다(약 40%). OASIS 쪽의 BPMN 실행·JPA 트랜잭션 열고 닫기라는 고정 비용이 없기 때문으로 본다. 10,000행에서는 라우터가 4~8ms 느리다(약 6~9%). 행을 Map 으로 만드는 비용(MyBatis 자동 매핑·`callSettersOnNulls`)이 JPA native `Object[]` → `LinkedHashMap` 수동 매핑보다 큰 것으로 추정한다(프로파일로 확인하지 않음). 화면 체감 차이는 둘 다 작다. 한계: SQLite 파일 DB, HTTP·WAS·BFF 없음, 운영 인터셉터(`SqlLoggingInterceptor` INFO 로그·`MasterCodeMybatisInterceptor`)·Hibernate show_sql 없음. 운영 Oracle·PostgreSQL 에서는 네트워크 왕복이 커서 고정 비용 차이의 비중이 더 작아질 수 있다.

### 10-2. 리뷰(opus/high 1회) 반영과 남은 항목

반영:
- 하네스 연결에 `PRAGMA case_sensitive_like = ON` — SQLite LIKE 기본(ASCII 대소문자 무시) 때문에 `UPPER` 가 빠져도 통과하던 것을 운영처럼 구분하게 했다.
- `QueryMapperLintTest` — `persistence/query/**`·`persistence/lov/**` 매퍼의 select 열마다 큰따옴표 별칭, `SELECT *`·`${}`·방언 전용 함수 금지(§5 D5(a) 첫 구현). SQLite 동등성 시험으로는 잡히지 않는 D2 를 막는다.
- `McmMybatisConfigWiringTest` — 운영 조립 경로(cactus 자동 설정 + `McmMybatisConfig`)에서 sqlSessionFactoryBiz 에 SQLite 인터셉터가 한 번 붙고, 기본 매퍼 위치 전체(DmomMapper 포함)를 읽어도 namespace 가 부딪히지 않고, 매퍼가 SQLite 에서 도는지 본다.
- 매퍼 조건을 `'CODE_VAL'.equals(pDiv)`·`pCodeId.toString().length() > 0` 로 — OGNL `==` 의 숫자 변환(숫자 0 이 `''` 와 같아짐, 숫자 pDiv 로 500)을 피한다.

남은 항목(후속, 이번 범위 밖):
- 머지 순서: 이 매퍼는 route-guard(스위치 기본 off·SELECT 검사) 뒤에 dev 에 들어가야 한다. 그 전에는 로그인 사용자가 보호 없는 `/query/masterCodeSelPop.search` 로 뷰 전체를 읽을 수 있다(읽기 전용).
- `ORDER BY CODE_VAL` 하나라 값이 같은 행끼리의 순서는 서비스·매퍼 모두 운영 DB 에서 보장되지 않는다. 2차 키를 넣으려면 서비스(기존 화면 동작)도 같이 바꿔야 해서 기록만 한다.
- `McmSqliteMybatisInterceptor` 는 운영에서도 prepare 마다 `getMetaData().getURL()` 을 부른다(왕복 없음). cactus 공통화할 때 팩토리 생성 시 한 번 판정해 SQLite 일 때만 붙이는 방식으로 바꾼다.
- `toSqliteCompatible` 의 `MCMAPUSER.` 제거는 문자열 리터럴 안까지 바꾼다(기존 JPA 검사기와 같은 동작, SQLite 에서만). 리터럴 밖만 고치는 스캐너로 바꾸는 것은 검사기 소유 쪽 후속이다.
- `InboundAutoConfiguration` 이 `CactusMultiMybatisAutoConfiguration` 뒤에 처리된다는 순서 지정이 없어 `/query` 등록이 이름 순서에 기댄다(추정) — route-guard 레인에 전달.

## 11. 결정 필요 항목 (조정자·사용자)

| # | 질문 | 추천 |
|---|---|---|
| Q1 | 모듈별 정책(§2) | 사용자 정리 대기 |
| Q2 | 라우터 노출 범위(S1) | 매퍼 위치 `persistence/query/**` |
| Q3 | 권한 묶기(S2) | queryId = `{objId}.{action}` → 기존 OASIS 권한 재사용 |
| Q4 | 결과 키 표기(K1) | camelCase 큰따옴표 별칭(이전 화면은 기존 키 유지) |
| Q5 | 방언 구분(D1) | 공통 SQL 기본 + databaseIdProvider 변형 |
| Q6 | 운영 방언 보증(D5) | 정적 검사 필수 + 배포 전 EXPLAIN 점검 |
| Q7 | 행 상한(S4) | 넘으면 거절, 기본 10,000 |
| Q8 | 바인딩 값 로그(S8) | DEBUG 로 낮춤 |
