# ADR-0003: mcm-core 를 라이브러리로 나눈 이유 (mcm 앱과 분리)

- **Status**: ACCEPTED
- **Date**: 2026-10-10
- **Decision Date**: 2026-09-02 (추정 — `mcm-core` 의 `build.gradle`·README 가 처음 들어온 커밋 `caa3e5d46` 날짜. 이미 있던 결정을 2026-10-10 에 소급 기록한다)
- **Context Tags**: mcm-core, mcm, architecture, module-boundary, cactus, template

## 쉬운 설명 (현업용 요약)

이 저장소는 고객사마다 복제해서 쓰는 표준 틀입니다. 로그인·권한·메뉴·마스터 코드 같은 공통 기능은
복제한 첫날부터 동작해야 합니다. 그래서 공통 기능을 담는 부분(mcm-core)과 실제로 화면을 띄우는
프로그램(mcm)을 따로 나눴습니다.

- 공통 기능 부분은 단독으로 실행되지 않고, 다른 프로그램이 가져다 씁니다. 물류(mls)·품질(mqc)·생산(mpp)
  프로그램도 같은 공통 기능을 씁니다.
- 고객사에 따라 우리 실행 엔진(cactus·oasis)을 쓰기도 하고, 외부 업체가 자기 방식(REST)으로 붙이기도 합니다.
  공통 기능 부분이 엔진에 묶여 있지 않아야 두 경우 모두 같은 기능을 쓸 수 있습니다.
- 이 경계를 사람의 주의에 맡기지 않고, 어기면 자동 검사가 실패하도록 했습니다.

비용도 있습니다. 지금은 mcm 만 이 공통 기능을 실제로 쓰고, 기능 하나를 고칠 때 두 곳을 함께
고쳐야 할 때가 있습니다. 엔진이 필요한 코드는 공통 기능 부분에 넣을 수 없다는 규칙도, 자동 검사가
실패해야 알게 되는 일이 있었습니다. 이 문서는 무엇을 어디에 둘지의 기준을 한곳에 적어 그 비용을 줄입니다.

## Context (배경)

- 표준 템플릿은 고객사마다 복제해 쓴다. 공통 기반(로그인·권한·메뉴·마스터 코드)이 첫날부터 동작해야 한다
  (`README.md`).
- 통합 방식이 두 가지다. 모드 A 는 cactus + oasis 를 쓰는 BPMN 방식(이 저장소)이다. 모드 B 는 cactus·oasis 없이
  REST 로 붙는 외부 SI 프로젝트다. 문서는 「mcm-core 자체는 동일하다. 사이트 통합 방식만 다름」이라고 적는다
  (`docs/guide/BackEnd/Mcm-Core-Onboarding.md` 「두 가지 모드」).
- 여러 MES 앱이 같은 코어를 쓴다. `mls`·`mqc`·`mpp` 의 `lib/build.gradle` 은 `api libs.mcm.core` 를 선언한다.
  `mcm/lib/build.gradle` 은 `api libs.mcm.core` 와 함께 `cactus-core`·`caravan-console` 을 선언한다.
- `mcm-core` 는 `java-library` 이고 실행 파일이 아니다. 스프링 스타터는 `compileOnly` 로만 참조하고, 데이터소스·
  트랜잭션 매니저·시큐리티 필터체인 같은 런타임 빈은 호스트 앱이 제공한다. `com.dongkuk.dmes:mcm-core` 아티팩트로
  발행할 수 있다. 자격증명은 환경변수로만 넣는다 (`src/backend/mcm-core/README.md` 「모듈 성격」).
- 선례가 있다. 공지 코드를 mcm-core 로 옮기려던 계획이 구현 중에 `mcm/lib` 로 바뀌었다. 공지 코드가
  `CactusAuditEntity`·`MdmValidator`·`BusinessException` 을 쓰는데, mcm-core 는 cactus 의존이 막혀 있었기 때문이다.
  BPMN 은 mcm-core 리소스에 두면 mcm-core 를 쓰는 모든 호스트가 로드하므로 `mcm/api` 에 남겼다
  (`docs/superpowers/specs/2026-10-07-notice-to-mcm-design.md`).

## Decision (결정)

- **D1**: 백엔드를 `mcm-core`(라이브러리)와 `mcm`(앱: `lib`·`api`)으로 계속 나눈다. 의존 방향은
  `MES 앱 → mcm-core` 한 방향이다. 반대 방향 참조를 두지 않는다.
- **D2**: `mcm-core` 는 `com.dongkuk.dmes.cactus..`·`com.dongkuk.oasis..`·`com.dongkuk.dmes.aps..` 와 런처 전용
  패키지(`mcm.init`·`mcm.listener`·`mcm.adapter`·`mcm.domain`)를 의존하지 않고, 내부 패키지 사이클도 없어야 한다.
  `McmCoreArchitectureTest`(ArchUnit)가 이를 강제한다. 예외는 예약 작업 패키지 `mcm.job..` 하나뿐이며
  cactus·oasis 검사에서만 빠진다 (2026-10-09, 같은 테스트 주석).
- **D3**: 런처에 하위 패키지를 추가하면 같은 변경에서 아키텍처 테스트의 런처 패키지 목록에도 등재한다.
  목록에 없는 패키지는 역참조가 있어도 잡히지 않는다.
- **D4**: 새 코드는 아래 표로 위치를 정한다.

| 넣을 것 | 위치 | 근거 |
|---|---|---|
| cactus·oasis 없이 짜는 공통 업무 로직·엔티티·리포지토리·서비스 | `mcm-core` | 모드 B 사이트와 mls·mqc·mpp 가 함께 쓴다. D2 검사를 통과해야 한다 |
| cactus 가 필요한 코드(감사 엔티티 `CactusAuditEntity`, `MdmValidator`, `BusinessException`, cactus 보안 어댑터) | `mcm/lib` | mcm-core 는 cactus 를 의존할 수 없고, `mcm/lib` 는 cactus-core 를 선언한다 (공지 선례) |
| BPMN 서비스 정의, `SecurityConfig`, `McmApplication`, 앱 전용 설정 | `mcm/api` | 모드 A 호스트만 가진다. mcm-core 리소스에 BPMN 을 두면 쓰는 모든 호스트가 로드한다 |
| 모드 B 의 REST 컨트롤러 | 호스트(사이트) 프로젝트 | Onboarding 문서는 「자체 REST Controller」를 사이트 패키지에 두고 mcm-core 서비스를 직접 호출하게 한다. mcm-core 는 컨트롤러를 갖지 않는다 |

- **D5**: 화면 진입점이 모드 A 에서는 REST 컨트롤러가 아니라 BPMN 이다. `mcm/api` 의 BPMN `camunda:class` 가
  mcm-core 의 서비스 빈을 부른다.

## Consequences (결과)

- 좋은 점
  - 같은 코어를 모드 A 와 모드 B 가 쓴다. 모드 B 사이트가 cactus·oasis 를 끌어오지 않아도 된다.
    Onboarding 체크리스트는 모드 B 에서 `cactus-core`·`oasis-core` 의존이 0 인지 확인하게 한다.
  - mls·mqc·mpp 가 로그인·권한·메뉴·마스터 코드를 다시 만들지 않는다. 의존은 `api libs.mcm.core` 한 줄이다.
  - 경계가 코드로 강제된다. 어긋나면 `McmCoreArchitectureTest` 가 실패한다.
  - 코어를 아티팩트로 발행할 수 있어, 앱과 다른 주기로 배포하는 길이 열려 있다.
- 나쁜 점·비용
  - (사실) 지금 mcm-core 기능을 실제로 구동하는 앱은 mcm 뿐이다. mls·mqc·mpp 는 샘플 골격이다.
    분리의 이득 중 다중 앱 재사용은 아직 실제로 쓰이지 않고, 구조 비용만 먼저 낸다.
  - (사실) 기능 하나가 두 곳에 걸친다. 서비스는 mcm-core 에, BPMN 액션은 `mcm/api` 에 있다.
    예로 2026-10-10 의 `secStartPgm`·`secFavorite` 의 `reorder` 가 그렇다. 한 기능을 고치면 두 모듈을 함께
    고쳐 한 변경으로 묶어야 한다.
  - (사실) cactus 를 쓰는 코드는 mcm-core 에 넣을 수 없다는 규칙이 문서만으로는 잘 안 보인다.
    공지 코드는 mcm-core 로 옮기려다 아키텍처 테스트 규칙 때문에 방향을 바꿨다. 테스트가 실패해야 알게 된다.
  - (사실) 런처와 라이브러리가 같은 루트 패키지 `com.dongkuk.dmes.mcm` 을 공유한다. 그래서 역참조 검사는
    런처 전용 패키지를 열거하는 방식이고, 목록 갱신을 잊으면 구멍이 생긴다 (D3).
  - (판단) 위치 판단 표(D4)가 없으면 같은 질문이 레인마다 반복된다. 이 ADR 이 그 표의 정본이다.

## Alternatives Considered (대안)

- **A. mcm 하나로 합친다**: 기각 (판단). 기능 위치 고민과 두 곳 수정은 사라진다. 그러나 모드 B 사이트가
  cactus·oasis 를 함께 끌어와 「코어는 동일, 통합 방식만 다름」이 깨진다. mls·mqc·mpp 가 mcm 앱 전체에
  의존하게 된다.
- **B. BPMN 도 mcm-core 리소스에 넣는다**: 기각. 기능 한 개가 한 모듈에 모이는 장점이 있다. 그러나 mcm-core 를
  쓰는 모든 호스트가 그 BPMN 을 로드한다. 모드 B 호스트는 oasis 엔진이 없어 의미가 없고, 모드 A 의
  다른 호스트에는 불필요한 서비스가 노출된다 (공지 선례).
- **C. 앱마다 공통 코드를 복사한다**: 기각 (판단). 의존 방향 규칙은 필요 없다. 그러나 권한·메뉴·마스터 코드
  수정이 앱 수만큼 늘고, 복제한 고객사 저장소 사이에서 어긋난다. 템플릿이 약속한 「첫날부터 동작하는 공통 기반」과
  맞지 않는다.
- **D. mcm-core 에서 cactus 의존 금지를 풀고 어댑터로 감싼다**: 채택하지 않음 (판단). 위 비용 중 세 번째는
  줄어든다. 그러나 모드 B 가 쓸 수 없는 클래스가 코어에 섞이고, 금지 규칙이 사실상 사라진다.
  필요한 예외는 `mcm.job..` 처럼 패키지 단위로 좁게 두는 방식을 쓴다.

## References

- `src/backend/mcm-core/README.md` (「모듈 성격」)
- `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/arch/McmCoreArchitectureTest.java`
- `docs/guide/BackEnd/Mcm-Core-Onboarding.md` (「두 가지 모드」, 모드 B 「자체 REST Controller」)
- `docs/superpowers/specs/2026-10-07-notice-to-mcm-design.md` (공지 이전: 위치 결정 선례)
- `src/backend/{mls,mqc,mpp,mcm}/lib/build.gradle` (`api libs.mcm.core`)
- `docs/ARCHITECTURE.md` §3
