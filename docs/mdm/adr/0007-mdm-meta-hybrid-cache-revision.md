# ADR-0007: MDM 메타는 업무 모듈이 받아 캐시하고 변경 기록 순번으로 무효화한다

- **Status**: PROPOSED
- **Date**: 2026-10-02
- **Decision Date**: 2026-10-02
- **Context Tags**: MDM, CACHE, CACTUS, MES_MODULES, OASIS

## 쉬운 설명 (현업용 요약)

MDM 에는 컬럼 사전·도메인·업무기준(룰)·룰 세트·마스터코드·전문 같은 기준 정보가 모여 있다. 업무 화면과 업무 서버가
이 기준 정보로 라벨을 붙이고 입력값을 검사하려면 매번 MDM 에 물어볼 수도, 기준 정보를 받아 두고 쓸 수도 있다.

**업무 모듈이 받아 두고 쓰기로 했다.** 매번 물으면 MDM 이 잠깐 멈출 때 업무도 같이 멈추고, 화면 하나를 열 때마다 MDM 을
여러 번 부르게 된다. 대신 받아 둔 기준 정보가 오래되지 않게, MDM 은 기준 정보를 바꿀 때마다 "몇 번째 변경에서 무엇이
바뀌었는지"를 적어 두고, 업무 모듈은 10초마다 그 기록을 확인해 바뀐 것만 지운다. 지운 것은 다음에 필요할 때 다시 받는다.

관리자는 포털 시스템관리의 "MDM 캐시 관리" 화면에서 모듈별로 받아 둔 기준 정보와 확인 상태를 보고, 필요하면 특정 항목을
모든 모듈에서 지우거나 다시 받게 할 수 있다.

## Context (배경)

- 업무 모듈(mcm·mls·mqc·mpp·mpn)은 MDM 을 참조하지 않았다. MDM(8096, 전용 SQLite)은 메타를 다른 모듈에 내주는 API 가 없었다.
- 하위 프로젝트 B(UI 캡션·툴팁)와 C(화면·BE 값 검증)가 같은 메타를 쓴다. 화면 검사와 서버 검사가 같은 정의를 봐야 한다.
- 엔진(maru-mdm-engine)은 EvalEx 하나만 의존하는 순수 Java 라 업무 모듈이 직접 실행할 수 있다.
- 빌드: cactus-core 는 업무 모듈의 includeBuild 다. 엔진을 api 로 물리면서 중첩 includeBuild 전달을 실측했다 — 중첩 includeBuild 가 전달된다(mls 가 cactus-core 의 엔진 includeBuild 를 따라 찾아 :lib:compileJava 가 통과했다).
  업무 모듈 다섯 곳 settings.gradle 에 엔진 includeBuild 를 명시했다(mdm 선례).
- 설계 정본: [spec](../../superpowers/specs/2026-10-02-mdm-meta-cache-design.md), 구현 계획:
  [plan](../../superpowers/plans/2026-10-02-mdm-meta-cache.md).

## Decision (결정)

- **D1 하이브리드 배포**: 정의는 MDM 서버에 HTTP(OASIS `metaFeed`)로 요청해 받고, 업무 모듈은 받은 정의를 자기 로컬 캐시에 두고
  엔진 jar 로 직접 검증한다. MDM 서버에는 캐시를 두지 않는다 — 늘 DB 최신 값을 준다.
- **D2 리비전 무효화**: MDM 원장 쓰기 서비스는 같은 트랜잭션에서 `TB_MDM_META_REV`(증가 순번·대상 종류·키·변경 종류)에 기록을
  남긴다(`MetaRevisionRecorder`, 키 펼침 — 도메인 → 하위 도메인·참조 컬럼, 코드 → 참조 도메인 펼침, 헤더 → 사용 전문, 물리명 변경 → 두 이름).
  업무 모듈은 `poll-interval`(기본 10초)마다 `search(since = max(0, appliedSeq - revision-lookback), pageLimit)` 로 요청해 받은 키 중 처리하지 않은 순번만 지운다
  (이미 처리한 순번은 건너뜀). 설정 `revision-lookback`(기본 100) 기간 안에 늦게 커밋된 기록을 다시 처리하고, 그 바깥의 늦은 커밋은 `max-age` 안전망이 잡는다.
  규칙 다섯 가지(기동·정상·truncated·역행·경합)를 둔다.
- **D3 클라이언트 위치**: cactus-core `com.dongkuk.dmes.cactus.mdm`(자동 설정, 기본 꺼짐). 업무 모듈은 `cactus.mdm.enabled: true`
  와 `cactus.mdm.module` 로 켠다. 엔드포인트 `/api/{module}/mdmMeta/{columns,domains,status,entries,entry,load}`.
- **D4 장애 시**: 캐시에 있는 항목은 계속 쓴다. 없는 키는 "받을 수 없음"이고 캐시하지 않는다. 연속 실패면 30초 동안 MDM 을 부르지 않는다.
  기록 누락에 대비해 항목 최대 수명(기본 60분)을 둔다.
- **D5 화면 삭제·재등록**: MDM 변경 기록에 강제 기록(EVICT·RELOAD, SYSADMIN 만)을 더하는 방식이다. 모든 모듈·인스턴스가 다음 확인에서 반영한다.

## Consequences (결과)

- 업무 처리는 MDM 이 멈춰도 이미 받은 정의로 계속된다. 대신 일반적으로 한 폴 주기(약 10초) 동안, 폴 실패·30초 스킵·늦게 커밋된 기록·MDM 다운 시에는 더 오래 옛 정의가 보일 수 있으며, 상한은 항목 수명(60분)이다.
- **순번 순서 = 커밋 순서 가정**: 완화한다. 폴러가 최근 100개 순번(설정 `revision-lookback`)을 다시 훑어 늦게 커밋된 기록을 처리한다. 단 그 구간 밖으로 늦게 커밋된 기록은 `max-age` 안전망(60분)이 잡는다. 시간 스팬은 쓰기 빈도에 따라 달라진다.
- 기록 쓰기는 여러 행 `VALUES` 네이티브 INSERT 한 문장이다(SQLite·PostgreSQL·MSSQL·Oracle 23ai). 더 옛 Oracle 로 가면 고친다.
- 운영 DDL 은 Flyway 가 꺼진 프로필(`application-wildfly.yml`)에서 운영 DB 확정 때 수동으로 맞춘다(V18 `TB_MDM_META_REV`).
- 변경 기록 보관 정리(30일)는 아직 없다. 정리로 생긴 공백은 클라이언트가 역행·truncated 규칙으로만 다룬다.
- 업무 모듈 다섯(mcm·mls·mqc·mpp·mpn) 모두 cactus 보안 체인과 ClientKeyFilter 뒤에 있다 — mqc·mpp·mpn 은 2026-10-02 에 `cactus.jwt`·
  `cactus.security`·`cactus.oasis.service-group` 을 더했다(없으면 Spring Security 기본 체인이 BFF 호출을 401 로 막았다). `/api/{module}/mdmMeta/*`
  요청은 BFF 의 `X-Client-Key` 를 먼저 통과해야 하고, 관리 엔드포인트의 SYSADMIN 확인은 ClientKeyFilter 가 세운 인증의 권한(그것이 없을 때만
  BFF 가 넘긴 `X-Authenticated-Role` 헤더)으로 한다. 새 업무 모듈도 같은 설정을 갖춰야 한다(Backend-Implementation-Guide §11.1).
- **관리자 상세 보기의 원문 노출**: 사용자 결정(2026-10-02)으로 SYSADMIN 이 캐시 항목 하나를 열면(`entry`) 컬럼의 비즈니스식 원문(`bizExpr.text`)과 룰 정의 전체가 브라우저로 나간다 — 서버 전용 원칙(spec §4.2)의 예외는 이 관리자 화면 하나뿐이고, 목록·화면 메타는 원문을 싣지 않는다.
- **다중 인스턴스**: 캐시는 JVM 별(프로세스 별) 독립이다. 각 인스턴스는 독립적으로 폴링하고 적재하므로 중복 적재가 일어난다(부하 증가). 인스턴스들이 일시적으로 다른 정의를 볼 수 있으며, 화면의 EVICT·RELOAD 강제 기록은 각 인스턴스가 자기 폴 주기에 반영한다.
- **기록기 트랜잭션**: 호출 쪽 트랜잭션이 없으면 기록기(`MetaRevisionRecorder`)가 `TransactionTemplate(REQUIRED)`로 자기 트랜잭션을 연다.
- **Oracle 위험**: 다중 행 `VALUES (..), (..)` INSERT 는 Oracle 19c 에서 실행되지 않고 23ai+ 에서만 가능하다. V18 마이그레이션은 SQLite 전용(`AUTOINCREMENT`)이므로 운영 DB(Oracle·PostgreSQL)로 가면 시퀀스·IDENTITY 로 바꿔야 한다. 시퀀스 CACHE 설정은 순번 순서 가정에 영향을 줄 수 있다.

## Alternatives Considered (대안)

- **업무 모듈이 매번 MDM 에 묻기**: 캐시 정합 문제는 없지만 MDM 장애가 업무 장애가 되고, 화면 하나에 MDM 호출이 여러 번이다.
- **MDM 서버 캐시 + 모듈 반영 상태 관리**: 이전에 고른 안. 캐시가 두 겹이 되고, 모듈 인스턴스마다 반영 상태를 MDM 이 알아야 한다. D1 로 대체했다.
- **푸시(메시지 큐) 무효화**: 즉시 반영되지만 새 인프라(Kafka 등)를 운영해야 하고, 놓친 메시지를 다시 맞추는 장치가 결국 순번 기록과 같다.
- **TTL 만 두기**: 단순하지만 바뀐 정의가 수명만큼 남는다. 수명은 안전망으로만 남겼다.

## Trigger (PROPOSED 인 경우만)

- 업무 모듈 한 곳 이상에서 하위 프로젝트 B(캡션·툴팁) 또는 C(검증)가 이 캐시로 동작하고, 통합 확인(구현 계획 Task 14)이 통과하면 ACCEPTED 로 올린다.
- **운영 DB 확정 시**:
  - 다중 행 `VALUES` INSERT 를 Oracle·PostgreSQL 방언으로 바꾼다(V18 마이그레이션 포함).
  - V18 `TB_MDM_META_REV.REV_SEQ` 를 시퀀스·IDENTITY 로 정의하고, 순번 순서 가정(CACHE 포함)을 다시 검증한다.
  - 시간대 교차 트랜잭션으로 인한 순번 역전이 정말 일어나는지 부하 테스트로 확인한다.

## References

- [spec 2026-10-02-mdm-meta-cache-design](../../superpowers/specs/2026-10-02-mdm-meta-cache-design.md)
- [ADR-0004 운영 DB 미정](0004-drop-mssql-production-assumption.md), [ADR-0005 룰 세트 실행은 엔진](0005-rule-set-runs-in-engine.md),
  [ADR-0006 룰 버전 major/minor 소수](0006-object-versioning-major-minor.md)(`metaFeed` RULE 의 `ver` 는 소수 — 정렬은 수 비교)
- 코드: `src/backend/mdm/lib/.../common/metarev/MetaRevisionRecorder.java`, `.../feed/metaFeed/service/MetaFeedService.java`,
  `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/`
