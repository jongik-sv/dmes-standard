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
바뀌었는지"를 적어 두고, 업무 모듈은 그 기록을 확인해 바뀐 것만 지운다. 지운 것은 다음에 필요할 때 다시 받는다.

**확인 시점은 2026-10-12 에 바꿨다.** 처음에는 업무 모듈이 10초마다 MDM 에 "바뀐 것 있나요"를 물었다. 바뀐 것이 없어도 모듈 다섯 곳이
10초마다 물어 로그와 로그 뷰어가 이 요청으로 가득 찼다. 지금은 MDM 이 기준 정보를 바꾸면 곧바로 업무 모듈에 "확인해 보세요"라는 짧은
알림을 보내고, 업무 모듈은 알림을 받자마자 확인한다. 알림이 어떤 이유로 닿지 않아도 업무 모듈이 5분마다 한 번 스스로 확인하므로 늦어도
5분 안에는 맞춰진다.

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
  남긴다(`MetaRevisionRecorder`, 키 펼침 — 도메인 → 하위 도메인·참조 컬럼, 코드 → 참조 도메인 펼침, 헤더 → 사용 전문, 물리명 변경 → 두 이름,
  컬럼·도메인 → 그 물리명을 항목으로 쓰는 RELEASED 전문(헤더 항목이면 헤더와 그 헤더를 쌓은 전문). 전문 합성이 항목의 타입·단위·소수를
  그때의 컬럼 사전에서 읽어 사전 변경이 확정 없이 피드 값을 바꾸던 것(D-144 3단계 최종 검토 I1, 판정 P3-28)에 대한 펼침이다. D-151 이후
  확정한 버전은 항목 행에 고정돼 사전과 무관하므로 이 펼침은 값이 바뀌지 않는 키까지 거는 무해한 무효화로 남긴다(확정 경로를 거치지 않아
  고정 표시가 없는 샘플·픽스처 RELEASED 는 지금 사전을 읽는다). 컬럼은 신규·물리명 변경·도메인 교체일 때, 도메인은 변경 분류가 COMPATIBLE 이
  아닐 때 펼친다).
  업무 모듈은 ~~`poll-interval`(기본 10초)마다~~ MDM 변경 신호를 받을 때와 `poll-interval`(기본 5분, 안전망)마다(D7, 2026-10-12 개정) `search(since = max(0, appliedSeq - revision-lookback), pageLimit)` 로 요청해 받은 키 중 처리하지 않은 순번만 지운다
  (이미 처리한 순번은 건너뜀). 설정 `revision-lookback`(기본 100) 기간 안에 늦게 커밋된 기록을 다시 처리하고, 그 바깥의 늦은 커밋은 `max-age`(절대 상한 24시간) 안전망이 잡는다.
  규칙 다섯 가지(기동·정상·truncated·역행·경합)를 둔다.
- **D3 클라이언트 위치**: cactus-core `com.dongkuk.dmes.cactus.mdm`(자동 설정, 기본 꺼짐). 업무 모듈은 `cactus.mdm.enabled: true`
  와 `cactus.mdm.module` 로 켠다. 엔드포인트 `/api/{module}/mdmMeta/{columns,domains,status,entries,entry,load}`.
- **D4 장애 시**: 캐시에 있는 항목은 계속 쓴다. 없는 키는 "받을 수 없음"이고 캐시하지 않는다. 연속 실패면 30초 동안 MDM 을 부르지 않는다.
  기록 누락에 대비해 항목 수명을 둔다(A2, 2026-10-02) — 마지막 조회 뒤 유휴 60분(`max-idle`, 조회마다 연장), 적재 뒤 절대 상한 24시간(`max-age`).
  자주 조회되는 항목일수록 오래 남되 절대 상한은 넘지 않는다.
- **D5 화면 삭제·재등록**: MDM 변경 기록에 강제 기록(EVICT·RELOAD, SYSADMIN 만)을 더하는 방식이다. 모든 모듈·인스턴스가 다음 확인에서 반영한다(D7 뒤로는 강제 기록도 변경 신호를 보내므로 곧바로 확인한다).
- **(D-154 로 대체 — 개정 이력)** ~~**D6 버전 있는 정의는 RELEASED 버전 전체를 캐시한다**: 룰·룰 세트(D-144 2단계, 엔진 `RuleSetDefinition` 에 `ver`·`applyFrom`·`applyTo` 를 더했다)와 전문(D-144 3단계 — 버전마다 쌓은 헤더의 버전 경계로 나눈 합성 구간을 함께 싣는다, spec §4.1)은 RELEASED 버전 목록을 받아 두고 판정 시각마다 `APPLY_FROM <= t < APPLY_TO`(여럿이면 VER 최대)로 고른다(전문은 이어서 그 버전 안에서 시각을 담는 합성 구간). "현재 버전"을 캐시하지 않으므로 예약 버전의 APPLY_FROM 도래(원장 쓰기 없음)에 무효화가 필요 없다 — 기록은 확정·확정 취소·부모 상태 변경처럼 RELEASED 목록이나 상태를 바꾸는 쓰기에만 남긴다.~~ 지금은 목차(전 RELEASED 버전)와 버전 본문(`X@ver`)을 나눠 캐시하고, 목차로 판정 시각마다 버전을 다시 고른다 — 예약 버전 도래에 무효화가 필요 없다는 결론은 그대로다.

- **D7 변경 신호 + 안전망 폴링(2026-10-12 개정, 사용자 결정 "절충안")**: D2 의 확인 시점을 바꾼다. 변경 기록 표·순번·폴러의 정합 규칙(기동·정상·
  truncated·역행·경합, `revision-lookback`, Ticket)은 그대로다.
  - **보내기(MDM)**: `MetaRevisionRecorder` 가 `TB_MDM_META_REV` 에 행을 하나라도 넣으면(원장 SAVE·강제 EVICT·RELOAD 모두 이 한 곳을 지난다)
    `MetaChangeSignaler` 가 그 트랜잭션의 커밋 뒤(`TransactionSynchronization.afterCommit`, 트랜잭션마다 한 번, 롤백이면 보내지 않음) 자체
    스레드에서 짧게 모아(기본 0.1초) 대상마다 `POST {target}/internal/mdm/metaSignal` 을 비동기로 보낸다(연결 1초·읽기 2초). 최선 노력이다 —
    실패는 MDM 요청·트랜잭션에 올리지 않고 대상마다 첫 실패만 WARN, 이어지는 실패는 DEBUG, 복구 때 INFO 한 줄(Ruling R12). 대상 목록은
    `mdm.meta-signal.targets`(모듈 인스턴스 기준 주소, 로컬은 `application-local.yml`, 운영은 `MDM_META_SIGNAL_TARGETS`), 켜기는
    `mdm.meta-signal.enabled`.
  - **받기(cactus-core)**: `MdmMetaSignalController`(`POST /internal/mdm/metaSignal`)가 `MdmRevisionPoller.requestPoll()` 로 폴러 스레드에 확인
    하나를 예약하고 202 를 돌려준다. 요청 스레드에서 확인하지 않는다. 신호가 연달아 오면 기다리는 확인 하나로 합친다(기본 0.3초,
    `cactus.mdm.signal-debounce`). 대기 표시는 확인 직전에 내리므로 확인 중에 온 신호는 확인 하나를 더 남긴다.
  - **인증**: 예약 작업 실행 접수(`/internal/job/run`)와 같다. `/api/` 로 시작하지 않아 포털 BFF 로는 닿지 않고, cactus 보안 체인의
    `X-Client-Key`(ClientKeyFilter)를 통과한 뒤 주체가 `system:mdm` + `ROLE_SYSTEM` 이어야 한다(아니면 403). 신호는 내용을 싣지 않고 모듈은
    늘 `changes(since)` 로 받으므로 신호를 잃거나 위조돼도 확인이 늦어지거나 한 번 더 돌 뿐이다.
  - **안전망**: `poll-interval` 기본을 10초에서 5분으로 올린다(설정은 남긴다). 기동 첫 확인은 기다리지 않고(초기 지연 0), 확인이 실패하는
    동안은 30초마다 다시 확인한다(MDM 이 늦게 뜬 경우 5분을 기다리지 않게 — D4 의 30초 건너뛰기와 같은 간격).

## Consequences (결과)

- 업무 처리는 MDM 이 멈춰도 이미 받은 정의로 계속된다. 대신 일반적으로 신호가 닿아 확인할 때까지(1초 안팎), 신호를 놓치면 한 정기 주기(최대 5분, D7) 동안, 폴 실패·30초 스킵·늦게 커밋된 기록·MDM 다운 시에는 더 오래 옛 정의가 보일 수 있으며, 상한은 항목 수명이다 — 조회가 끊긴 항목은 마지막 조회 뒤 60분(유휴), 자주 조회되는 항목도 적재 뒤 24시간(절대 상한)을 넘지 않는다.
- **순번 순서 = 커밋 순서 가정**: 완화한다. 폴러가 최근 100개 순번(설정 `revision-lookback`)을 다시 훑어 늦게 커밋된 기록을 처리한다. 단 그 구간 밖으로 늦게 커밋된 기록은 `max-age` 안전망(절대 상한 24시간)이 잡는다. 시간 스팬은 쓰기 빈도에 따라 달라진다.
- **자주 조회되는 항목의 옛 정의**: 유휴 수명은 조회마다 연장되므로, 자주 조회되는 항목은 lookback 구간 밖으로 늦게 커밋된 기록을 놓치면 최대 24시간까지 옛 정의가 보일 수 있다.
- 기록 쓰기는 여러 행 `VALUES` 네이티브 INSERT 한 문장이다(SQLite·PostgreSQL·MSSQL·Oracle 23ai). 더 옛 Oracle 로 가면 고친다.
- 운영 DDL 은 Flyway 가 꺼진 프로필(`application-wildfly.yml`)에서 운영 DB 확정 때 수동으로 맞춘다(V20 `TB_MDM_META_REV`).
- 변경 기록 보관 정리(30일)는 아직 없다. 정리로 생긴 공백은 클라이언트가 역행·truncated 규칙으로만 다룬다.
- 업무 모듈 다섯(mcm·mls·mqc·mpp·mpn) 모두 cactus 보안 체인과 ClientKeyFilter 뒤에 있다 — mqc·mpp·mpn 은 2026-10-02 에 `cactus.jwt`·
  `cactus.security`·`cactus.oasis.service-group` 을 더했다(없으면 Spring Security 기본 체인이 BFF 호출을 401 로 막았다). `/api/{module}/mdmMeta/*`
  요청은 BFF 의 `X-Client-Key` 를 먼저 통과해야 하고, 관리 엔드포인트의 SYSADMIN 확인은 ClientKeyFilter 가 세운 인증의 권한(그것이 없을 때만
  BFF 가 넘긴 `X-Authenticated-Role` 헤더)으로 한다. 새 업무 모듈도 같은 설정을 갖춰야 한다(Backend-Implementation-Guide §11.1).
- **관리자 상세 보기의 원문 노출**: 사용자 결정(2026-10-02)으로 SYSADMIN 이 캐시 항목 하나를 열면(`entry`) 컬럼의 비즈니스식 원문(`bizExpr.text`)과 룰 정의 전체가 브라우저로 나간다 — 서버 전용 원칙(spec §4.2)의 예외는 이 관리자 화면 하나뿐이고, 목록·화면 메타는 원문을 싣지 않는다.
- **다중 인스턴스**: 캐시는 JVM 별(프로세스 별) 독립이다. 각 인스턴스는 독립적으로 폴링하고 적재하므로 중복 적재가 일어난다(부하 증가). 인스턴스들이 일시적으로 다른 정의를 볼 수 있으며, 화면의 EVICT·RELOAD 강제 기록은 각 인스턴스가 신호를 받을 때(D7), 놓치면 자기 정기 주기에 반영한다.
- **신호 대상 목록(D7)**: MDM 이 업무 모듈 주소를 알아야 한다(`mdm.meta-signal.targets`). 목록은 인스턴스 주소여야 모든 인스턴스가 신호를 받는다.
  부하 분산 주소 하나를 넣으면 그 뒤 인스턴스 하나만 받고 나머지는 정기 확인(최대 5분)에서 따라온다(알려진 한계). 목록에 없는 모듈·인스턴스와
  신호가 꺼진 배포(운영 `MDM_META_SIGNAL_TARGETS` 미설정)는 반영이 약 10초에서 최대 5분으로 늦어진다. 모듈을 늘리면 목록도 고친다.
- **요청·로그 양(D7)**: 모듈마다 10초에 한 번이던 `metaFeed/search` 가 변경이 있을 때와 5분에 한 번으로 준다(모듈 다섯 곳 기준 하루 약 43,000회 → 약 1,440회 + 변경 수).
- **지움 기록 보관 시간과 정기 주기(D7 검토)**: 캐시의 지움 기록(5분)은 지움보다 먼저 시작한 진행 중 적재만 막으면 되므로 적재 한 번의 길이(연결
  2초·읽기 5초)보다 길면 되고 정기 주기와 무관하다. 정리는 확인이 성공할 때만 하므로 주기가 5분이면 기록이 최대 약 10분 남는다 — 오래 남는 쪽이라
  안전하다. 관리 화면의 "최신 아님"은 시각이 아니라 순번(`appliedSeq < latestSeq`)으로 판정하므로 주기와 무관하다. 강제 기록 뒤 반영 기다리기
  한도(25초)는 신호 경로 기준으로 두고, 신호를 놓친 모듈은 기존 "아직 반영 전" 안내로 끝난다.
- **기록기 트랜잭션**: 호출 쪽 트랜잭션이 없으면 기록기(`MetaRevisionRecorder`)가 `TransactionTemplate(REQUIRED)`로 자기 트랜잭션을 연다.
- **Oracle 위험**: 다중 행 `VALUES (..), (..)` INSERT 는 Oracle 19c 에서 실행되지 않고 23ai+ 에서만 가능하다. V20 마이그레이션은 SQLite 전용(`AUTOINCREMENT`)이므로 운영 DB(Oracle·PostgreSQL)로 가면 시퀀스·IDENTITY 로 바꿔야 한다. 시퀀스 CACHE 설정은 순번 순서 가정에 영향을 줄 수 있다.

## Alternatives Considered (대안)

- **업무 모듈이 매번 MDM 에 묻기**: 캐시 정합 문제는 없지만 MDM 장애가 업무 장애가 되고, 화면 하나에 MDM 호출이 여러 번이다.
- **MDM 서버 캐시 + 모듈 반영 상태 관리**: 이전에 고른 안. 캐시가 두 겹이 되고, 모듈 인스턴스마다 반영 상태를 MDM 이 알아야 한다. D1 로 대체했다.
- **푸시(메시지 큐) 무효화**: 즉시 반영되지만 새 인프라(Kafka 등)를 운영해야 하고, 놓친 메시지를 다시 맞추는 장치가 결국 순번 기록과 같다.
- **짧은 주기 폴링만(처음 D2, 10초)**: 단순하고 MDM 이 모듈 주소를 몰라도 되지만, 변경이 없어도 모듈마다 10초에 한 번 요청해 로그·로그 뷰어가
  이 요청으로 가득 찼다. D7 로 대체했다.
- **신호에 바뀐 키를 실어 보내기**: 한 번 덜 묻지만 신호를 잃으면 그 변경을 놓친다(다시 맞추려면 결국 순번 확인이 필요하다). 위조된 신호가 캐시를
  지우게 된다. 신호는 "지금 확인"만 뜻하게 두고 내용은 늘 `changes(since)` 로 받는다.
- **신호를 트랜잭션 안에서 보내기**: 커밋 전에 모듈이 확인하면 아직 보이지 않는 기록을 놓치고, 보내기 실패·지연이 MDM 저장을 막는다. 커밋 뒤
  비동기로 보낸다.
- **TTL 만 두기**: 단순하지만 바뀐 정의가 수명만큼 남는다. 수명은 안전망으로만 남겼다.

## Trigger (PROPOSED 인 경우만)

- 업무 모듈 한 곳 이상에서 하위 프로젝트 B(캡션·툴팁) 또는 C(검증)가 이 캐시로 동작하고, 통합 확인(구현 계획 Task 14)이 통과하면 ACCEPTED 로 올린다.
- ~~레이아웃 버전 관리(3단계) 병합 시 LAYOUT 피드를 RELEASED 버전 목록 + 시각 선택으로 바꾼다(D6 과 같은 방식).~~ **반영됨**(2026-10-03, D-144 3단계 Task 16b) — metaFeed LAYOUT 은 전문별 RELEASED 버전 목록(버전마다 `ver`·`applyFrom`·`applyTo` + 헤더 버전 경계로 나눈 합성 구간)이고, cactus `MdmDefinitionLookup.layout(id, t)` 가 룰과 같은 선택기로 고른다(`LayoutReleaseTimeline`, spec §4.1). **배포 순서**: 피드 값 모양이 바뀌었으므로(스냅샷 하나 → 버전 목록) MDM 과 cactus-core(업무 모듈)는 같은 릴리스로 배포한다. 섞이는 동안에는 LAYOUT 키만 failed(`MdmUnavailableException`)이고 캐시 관리 화면(mdmCacheMng)에도 그렇게 보이며, 다른 대상은 영향이 없다. 캐시는 메모리에만 있으므로 옮길 데이터가 없고 재시작하면 정리된다.
- ~~**후속 — 전문 합성의 사전 고정(최종 검토 I1 장기 대책, 판정 P3-28)**: 지금은 컬럼·도메인 변경을 LAYOUT 키로 펼쳐 캐시만 맞춘다. 확정 때 항목의
  `dataType`·`unitCode`·`scale` 을 버전에 고정해 RELEASED 합성이 사전과 무관하게 하는(또는 쓰는 컬럼의 타입 변경을 영향도 확인 뒤에만 허용하는)
  일은 전문 소비 연동(직렬화·파싱) 전에 한다. 그때까지는 사전 변경이 RELEASED 전문의 피드 값과 과거 재현(확정 때 남긴 본문 스냅샷)을 바꿀 수 있다.~~
  **반영됨**(2026-10-03, D-151) — 확정이 항목 행 전부를 고정 표시(`PINNED_YN`)하고 `DATA_TYPE`·`UNIT_CODE`·`SCALE`(V22)에 확정 시점 사전
  유효값(없으면 NULL)을 고정하며, 확정 취소가 비운다. 고정 표시 행은 NULL 까지 그 값으로 합성한다. 기존 확정 버전은 V22 가 채웠다. D2 의
  컬럼·도메인 → LAYOUT 펼침은 무해한 무효화로 그대로 둔다. EAI 인코딩·패딩은 고정 범위 밖이다(D-151 (9)).
- **운영 DB 확정 시**:
  - 다중 행 `VALUES` INSERT 를 Oracle·PostgreSQL 방언으로 바꾼다(V20 마이그레이션 포함).
  - V20 `TB_MDM_META_REV.REV_SEQ` 를 시퀀스·IDENTITY 로 정의하고, 순번 순서 가정(CACHE 포함)을 다시 검증한다.
  - 시간대 교차 트랜잭션으로 인한 순번 역전이 정말 일어나는지 부하 테스트로 확인한다.

## 개정 이력

- **2026-10-03 — 캐시 값 모양을 목차 + 버전 본문으로 바꾼다(D-154).** 룰·룰 세트·코드·전문의 캐시 값을 정의 전 이력 한 키에서 목차 키 `X` 와 버전 본문 키 `X@ver` 로 나눈다. 하이브리드 배포(정의는 MDM 이 주고 판정은 업무 모듈 엔진)와 변경 기록 순번 무효화·10초 폴링 구조는 그대로다(결정 P13). D6(RELEASED 버전 전체 캐시)은 목차(전 버전) + 버전 본문으로 대체했다(Decision 의 D6 줄에 취소선으로 표시). D4 와 Consequences 첫 줄의 "MDM 이 멈춰도 이미 받은 정의로 계속된다"는 두 경우에 후퇴한다 — 장애 중 적용 시작 경계를 지나 새 최종 버전 본문이 캐시에 없을 때, `MASTER_AT` 의 base_dt 가 미리 받지 못한 시각의 버전을 가리킬 때는 받을 수 없음이고(`on-unavailable: REJECT` 면 저장 거부) 다른 버전으로 대신 판정하지 않는다(결정 P8·P9, spec §5.9). D1·D2·D3·D5 본문은 그대로다. 설계는 [spec 2026-10-03-mdm-meta-cache-per-version-design.md](../../superpowers/specs/2026-10-03-mdm-meta-cache-per-version-design.md), 결정은 [D-154](../decisions.md). 본문 개정 전 적대적 검토는 이 작업에서 따로 띄우지 않고 최종 브랜치 리뷰가 대신한다.

- **2026-10-12 — 확인 시점을 변경 신호 + 안전망 폴링으로 바꾼다(D7, 사용자 결정 "절충안").** 10초 폴링의 요청·로그 양(모듈 다섯 곳이 변경이 없어도 10초마다 `metaFeed/search`)을 줄이면서 반영은 오히려 빠르게 하려고, MDM 이 변경 기록 커밋 뒤 업무 모듈에 HTTP 확인 신호를 보내고 정기 확인은 5분 안전망으로 남긴다. 메시지 큐 푸시(대안에서 기각)와 달리 새 인프라가 없고, 신호는 내용 없이 "지금 확인"만 뜻해 순번 기록·폴러 정합 규칙을 그대로 쓴다. D2 의 "10초마다" 를 취소선으로 고치고 D5 에 신호를 더했으며 D7·Consequences(대상 목록·다중 인스턴스 한계·지움 기록 분석)·Alternatives(짧은 주기 폴링·신호에 키 싣기·트랜잭션 안 보내기)를 더했다. D1·D3·D4·D6 본문은 그대로다. ADR 이 PROPOSED 라 본문을 개정한다(adr-write §5 의 ACCEPTED 불변 규칙 대상 아님). 본문 개정 전 적대적 검토(adr-write §8)는 이 작업에서 띄우지 않았다 — 브랜치 리뷰가 대신한다.

## References

- [spec 2026-10-02-mdm-meta-cache-design](../../superpowers/specs/2026-10-02-mdm-meta-cache-design.md)
- [spec 2026-10-03-mdm-meta-cache-per-version-design](../../superpowers/specs/2026-10-03-mdm-meta-cache-per-version-design.md) (D-154)
- [ADR-0004 운영 DB 미정](0004-drop-mssql-production-assumption.md), [ADR-0005 룰 세트 실행은 엔진](0005-rule-set-runs-in-engine.md),
  [ADR-0006 룰 버전 major/minor 소수](0006-object-versioning-major-minor.md)(`metaFeed` RULE 의 `ver` 는 소수 — 정렬은 수 비교)
- 코드: `src/backend/mdm/lib/.../common/metarev/MetaRevisionRecorder.java`, `.../feed/metaFeed/service/MetaFeedService.java`,
  `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/`
- 코드(D7): `src/backend/mdm/lib/.../common/metarev/MetaChangeSignaler.java`·`MetaSignalProperties.java`·`MetaSignalConfig.java`,
  `src/backend/cactus-core/.../cactus/mdm/MdmMetaSignalController.java`·`MdmRevisionPoller.java`(`requestPoll`). 인증 선례: mcm-core `job/agent/JobRunController.java`
