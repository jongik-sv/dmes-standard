# {CLIENT} Analog 도입 핸드오버

작성일: 2026-05-22

## 목적

`/Users/cothe/projects/analog-express` 에 있는 최신 plate 계열 로그 분석 도구를 기반으로, {CLIENT} 저장소 안에 독립 실행 가능한 `analog` 분석 도구를 만든다.

기준 소스는 다음 두 프로젝트다.

- Backend/API 기준: `/Users/cothe/projects/analog-express/analog-express-web-plate`
- Frontend/UI 기준: `/Users/cothe/projects/analog-express/analog-express-ui-plate`

추가 결정 사항:

- `analog-serializer` 는 외부 Maven 의존성으로 쓰지 않는다.
- `/Users/cothe/projects/analog-serializer/analog-serializer-oasis4` 소스를 {CLIENT} `analog-core` 안으로 그대로 들여와 녹인다.

## 저장 위치 결정

{CLIENT} 저장소 내부 위치는 `src` 하위로 둔다.

```text
src/backend/analog/
  settings.gradle
  build.gradle
  core/
    src/main/java/com/dongkuk/analog/**          # analog-serializer-oasis4 원본 소스
    src/main/java/com/dongkuk/analogexpress/**   # analog-express-core 원본 소스
    src/main/resources/analog-serializer.json
  api/
    src/main/java/kr/co/ksm/dmes/analog/**       # {CLIENT} 전용 Spring Boot API, 설정, adapter
    src/main/resources/application.yml

src/frontend/m-analog/
  package.json
  src/
  pages/log-viewer-page.tsx
```

`api` 모듈의 {CLIENT} 전용 코드는 `com.dongkuk.dmes.analog.*` 패키지를 사용한다. 단, 가져온 라이브러리성 원본 코드는 import 파손을 줄이기 위해 기존 패키지를 유지한다.

## 왜 이렇게 하는가

`analog-express-web-plate` 는 Spring Boot 2.3, Java 11, WAR 중심 구조다. {CLIENT} backend 는 Java 21, Spring Boot 4, composite build 구조이므로 그대로 복사하면 빌드/운영 규칙과 어긋난다.

따라서 분석 엔진과 API 동작은 가져오되, 빌드와 {CLIENT} entrypoint 는 새로 맞춘다.

`analog-express-ui-plate` 는 CRA React 18 기반이다. {CLIENT} frontend 는 pnpm workspace, Next 16, React 19 기반이므로 CRA 앱을 그대로 넣지 않고 `m-analog` workspace 패키지로 포팅한다.

## 이식 대상

### 1. analog-express-core

원본:

```text
/Users/cothe/projects/analog-express/analog-express-core/src/main/java/com/dongkuk/analogexpress/**
```

역할:

- 파일 탐색
- 파일명 범위 필터
- 시간 범위 검색
- 다중 thread 검색
- 검색 결과 취합
- service list 후처리

{CLIENT} 반영:

```text
src/backend/analog/core/src/main/java/com/dongkuk/analogexpress/**
```

### 2. analog-serializer-oasis4

원본:

```text
/Users/cothe/projects/analog-serializer/analog-serializer-oasis4/src/main/java/com/dongkuk/analog/**
/Users/cothe/projects/analog-serializer/analog-serializer-oasis4/config.json
```

확인된 주요 클래스:

- `com.dongkuk.analog.parser.LogPattern`
- `com.dongkuk.analog.process.LogProcessor`
- `com.dongkuk.analog.scanner.LogLexer`
- `com.dongkuk.analog.scanner.LogData`
- `com.dongkuk.analog.nodes.*`

{CLIENT} 반영:

```text
src/backend/analog/core/src/main/java/com/dongkuk/analog/**
src/backend/analog/core/src/main/resources/analog-serializer.json
```

외부 의존성으로 남길 것:

- `com.fasterxml.jackson.core:jackson-databind`
- `com.github.tony19:named-regexp`
- `org.slf4j:slf4j-api`
- Lombok은 1차에서는 유지 가능. {CLIENT} 공통 Gradle 설정에 Lombok이 있으므로 큰 장애는 없지만, 장기적으로는 제거해도 된다.

### 3. analog-express-web-plate API

원본:

```text
/Users/cothe/projects/analog-express/analog-express-web-plate/src/main/java/com/dongkuk/analogexpress/plate/**
```

우선 이식할 API:

- `GET /api/meta`
- `GET /log/range/time`
- `GET /log/range/time/download`
- `GET /log/range/time/tree`

보류 또는 optional:

- `GET /log/refresh`

`/log/refresh` 는 원본에서 외부 FTP client 실행에 의존한다. {CLIENT} 로컬/개발 환경에서 즉시 필요한 기능이 아니므로 1차 MVP에서는 비활성화하거나 설정이 있을 때만 동작하게 만든다.

## {CLIENT} 로그 형식 이슈

원본 plate 기본 설정은 다음 계열이다.

```properties
analog-express.log_file_name_format={MODULE}_{CLIENT_TYPE}_{FILE_NAME_DATE}.log
analog-express.live_log_file_name_format={MODULE}_{CLIENT_TYPE}.log
analog-express.datetime_format=yyyy-MM-dd HH:mm:ss,SSS
```

{CLIENT} `mpn` 현재 logback 설정은 다음 계열이다.

```xml
<property name="LOG_PATH" value="./logs"/>
<property name="LOG_FILE" value="dmes-mpn"/>
<file>${LOG_PATH}/${LOG_FILE}.log</file>
<fileNamePattern>${LOG_PATH}/${LOG_FILE}.%d{yyyy-MM-dd}.%i.log.gz</fileNamePattern>
<pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
```

따라서 그대로 plate 설정을 쓰면 {CLIENT} 로그를 못 찾는다.

필요 작업:

- {CLIENT}용 file naming strategy 추가
- live log: `dmes-{module}.log`
- archived log: `dmes-{module}.yyyy-MM-dd.i.log.gz`
- gzip rolling file 읽기 지원 검토
- datetime format 기본값을 `yyyy-MM-dd HH:mm:ss.SSS` 로 맞춤
- thread/serviceTag 추출 regex 는 {CLIENT} 실제 OASIS 로그 샘플 확보 후 확정

## Backend 빌드 방향

`src/backend/analog` 는 {CLIENT} backend composite build 에 편입 가능한 독립 Gradle build 로 둔다.

예상 구조:

```groovy
// src/backend/analog/settings.gradle
rootProject.name = 'analog'
include 'core'
include 'api'
```

```groovy
// src/backend/settings.gradle 에 추가
includeBuild('analog') {
    dependencySubstitution {
        substitute module('com.dongkuk.dmes:analog') using project(':')
    }
}
```

주의:

- 처음에는 `src/backend/build.gradle` 의 `buildAll/testAll` 대상에 바로 넣지 않아도 된다.
- 빌드가 안정화되면 `includedProjectNames` 에 `analog` 를 추가한다.
- `api` 는 launcher, `core` 는 순수 분석 라이브러리 역할로 분리한다.

## Frontend 포팅 방향

원본:

```text
/Users/cothe/projects/analog-express/analog-express-ui-plate
```

원본 주요 의존:

- React 18
- CRA `react-scripts`
- `@monaco-editor/react`
- `rsuite`
- `ag-grid-react`
- `axios`

{CLIENT} 반영 원칙:

- CRA 구조를 그대로 복사하지 않는다.
- `src/frontend/m-analog` 를 pnpm workspace 패키지로 만든다.
- API 호출은 `axios` 직접 base URL 대신 {CLIENT} BFF 경로를 사용한다.
- 가능하면 `@dk-oasis/shared/http` 의 `apiRequest` 계열을 쓴다.

예상 BFF 경로:

```text
/api/analog/rest/api/meta
/api/analog/rest/log/range/time
/api/analog/rest/log/range/time/tree
/api/analog/rest/log/range/time/download
```

또는 backend API 쪽에서 `/api/analog/**` prefix 를 직접 갖지 않게 만들고, 기존 {CLIENT} BFF REST 규칙대로 `/api/analog/rest/{API_PATH}` 에서 `{API_PATH}` 만 backend 로 전달한다.

포탈 편입 시 추가 작업:

- `src/frontend/pnpm-workspace.yaml` 에 `m-analog` 추가
- `src/frontend/package.json` dev/build script 에 필요 시 filter 추가
- `src/frontend/m-mcm/app/portal/module-config.ts` 에 `analog` module loader 추가
- `src/frontend/m-mcm/page-components/access-management/module-pages.ts` 에 analog 페이지 등록
- 메뉴 seed 또는 메뉴 관리 화면으로 “로그 분석” 메뉴 추가
- `m-mcm/proxy.ts` 환경변수 매핑에 `ANALOG_WAS_URL` 추가 검토

## MVP 범위

1차 MVP는 다음까지만 완료해도 충분하다.

- `analog/core` 빌드 성공
- `analog/api` 로컬 실행 성공
- fixture 로그 파일 기준 시간 범위 + keyword 검색 성공
- 검색 결과에서 service list 추출
- `/log/range/time/tree` 가 serializer 내장 소스로 동작
- `m-analog` 에서 검색 조건 입력, 로그 표시, service list 표시

2차 이후:

- gzip archive 검색
- 다운로드 UX
- 포탈 메뉴/RBAC 완전 편입
- refresh/FTP 동기화 대체 방식
- {CLIENT} 실제 OASIS 로그 패턴 정교화

## 구현 순서

1. `src/backend/analog` skeleton 생성
2. `analog-express-core` 소스 복사
3. `analog-serializer-oasis4` 소스와 `config.json` 복사
4. Gradle dependency 정리
5. core 단위 테스트부터 빌드 확인
6. `web-plate` controller 로직을 {CLIENT} API adapter 로 이식
7. {CLIENT} 로그 파일명 전략 추가
8. fixture 로그 기반 API 테스트 작성
9. `src/frontend/m-analog` 생성
10. UI plate 컴포넌트 중 필요한 것만 포팅
11. BFF/포탈 편입
12. smoke 확인

## 검증 명령 후보

Backend:

```bash
cd /Users/cothe/projects/dmes-standard/src/backend/analog
./gradlew :core:test
./gradlew :api:test
./gradlew :api:bootRun
```

Frontend:

```bash
cd /Users/cothe/projects/dmes-standard/src/frontend
pnpm install
pnpm --filter @dk-oasis/m-analog build
pnpm --filter @dk-oasis/mcm dev
```

전체 편입 후:

```bash
cd /Users/cothe/projects/dmes-standard/src/frontend
pnpm lint
pnpm build
```

## 주의 사항

- 사용자 작업으로 보이는 기존 변경 파일을 되돌리지 말 것.
- 현재 핸드오버 작성 시점에 이미 변경되어 있던 파일:
  - `src/backend/aps-core/src/main/resources/db/migration/sqlite/V22__pv_slot_policy.sql`
  - `src/backend/aps-core/src/main/resources/db/migration/sqlite/V23__operation_runtime_unit_time_per_batch.sql`
  - `src/frontend/m-mpn/src/master/operation/OperationDetailForm.tsx`
- `analog-serializer` 소스는 외부 저장소에서 그대로 가져오되, {CLIENT} 내에서는 `analog/core` 의 내부 코드로 취급한다.
- 원본의 `com.dongkuk.analog.*`, `com.dongkuk.analogexpress.*` 패키지를 무리하게 rename 하지 않는다. rename 은 기능 안정화 후 별도 작업으로 판단한다.
- `analog-express-web-plate` 의 `application.properties` 에는 로컬 개인 경로가 포함되어 있으므로 그대로 복사하지 말고 {CLIENT}용 `application.yml` 로 재작성한다.
- 운영 로그 디렉터리 접근 권한과 민감 로그 노출 정책은 별도 확인이 필요하다. 포탈 편입 전에는 local/dev 전용으로 묶는 것이 안전하다.

## 열려 있는 질문

- {CLIENT} 실제 운영/개발 로그의 표준 저장 위치는 어디인가?
- `mpn`, `mpp`, `mqc`, `mcm` 로그를 한 analog 인스턴스가 모두 읽을 것인가, 모듈별로 분리할 것인가?
- gzip archive 검색을 1차에 포함할 것인가?
- 로그 분석 도구를 포탈 인증/RBAC 뒤에 둘 것인가, 개발자 전용 별도 포트로 둘 것인가?
- `refresh` 기능은 폐기할 것인가, {CLIENT} 배포 환경에 맞는 동기화 방식으로 대체할 것인가?

