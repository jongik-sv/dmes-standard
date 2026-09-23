# TSK-01-01 설계 — mdm 모듈 스캐폴드(mdm · maru-mdm-engine) + DB 연결 + CI

> Phase: Design · 작성: 2026-09-23 · order: 12cbcc4e-ed40-454f-8041-c99e08487d0b
> `docs/mdm/tasks/TSK-01-01/state.json` 에 `agent_prompt` 필드 없음 — 위임자 직접 지시 없음, 본 문서는 spec.md·RULE.md·prd_ref 문서·코드베이스 탐색만으로 작성했다.

> **작성 경위 정정(투명성 기록, `docs/mdm/tasks/TSK-01-01/.issues` 참고)**: 이 문서의 초안은 Design 에이전트가 조사용으로 띄운 fork 서브에이전트 중 일부가 위임 범위(읽기·조사 전용)를 벗어나 직접 작성한 것이다 — fork 가 부모의 전체 컨텍스트(design.md 작성 지시)를 물려받아 같은 파일을 동시에 고쳐 썼다. 오케스트레이터가 이 사고를 `.issues` 에 `design/skill-unclear` 로 기록하고 fork 를 회수했다. 이후 Design 에이전트(단일 작성자)가 **핵심 주장과 붙여넣기용 스니펫 위주로 원문(TRD·PRD·RULE·실제 코드)과 대조해 재검증**했다 — 틀린 인용은 고치고, 근거가 약한 서술은 보강했다(§0·D7 의 패키지 근거 재확인, §5·§6 의 ArchUnit/Flyway 변이 검증 보강, §6.1b/D9 의 testAll 결함 실측 확인, §6.3 보안 설정 보완, §7 신설 등). 모든 문장을 전수 재검증하지는 못했다 — 예를 들어 §1 표의 "aps-core 가 독립 java-library 선례" 여부나 "McmCoreArchitectureTest 가 유일한 ArchUnit 선례"라는 단정은 최초 fork 초안의 서술을 그대로 신뢰했다. 아래 본문은 이 부분 재검증을 마친 버전이며, Build Phase 는 표시되지 않은 나머지 서술도 필요할 때 원문으로 다시 확인하는 것을 권한다.

## 0. prd_ref 접근 경위 정정

spec.md 의 prd_ref 경로(`docs/mdm/design/basic/01-mdm-overview.md`, `.../06-business-rule.md`)는 **이 워크트리 안에서는** 못 연다 — `docs/mdm/design` 은 `/Users/jji/project/mdm/docs/design` 으로 가는 심볼릭 링크인데(PRD.md:5), 이 워크트리에는 그 링크 자체가 없다(`ls docs/mdm/`: `design` 없음 — 메모리 `local-symlinks-not-tracked.md` 가 기록한 "로컬 전용 심볼릭 링크" 군에 속한다).

다만 **링크 대상 디렉터리 자체는 워크트리 밖(`/Users/jji/project/mdm/docs/design/basic/`)에 실재하고 읽을 수 있다**(절대경로 `Read`/`grep` 확인 완료, `ls`로 01~08·evalex-guide.md·workrule-column-design.md·README.md·sql/·html/·bak/ 전부 존재). 이번 설계는 이 절대경로를 직접 읽어 prd_ref 원문을 확인했다. 그 결과 **PRD/TRD 의 요약과 원문이 한 곳 어긋난다** — 엔진 모듈 Java 패키지다. 아래 §2.2·§5·§6·D7 참고.

- `01-mdm-overview.md:379-381`(「8. 공통 엔진 모듈」): "엔진을 서버 안의 패키지가 아니라 별도 모듈 `maru-mdm-engine`으로 빌드해서 배포한다... 패키지 구성과 의존성 규칙은 `06-business-rule.md` 엔진 모듈 절에 있다."
- `06-business-rule.md:453`(「모듈 하나, 패키지 다섯」): "기존 샘플 `js/AstExporter.java`의 패키지 `kr.dongkuk.maru.mdm.expr`는 이 모듈의 `engine.expr`로 옮긴다. 서버 애플리케이션과 패키지 이름이 겹치지 않게 모듈 패키지는 모두 `engine` 아래에 둔다." 이어지는 패키지 표(456-461행)가 다섯 패키지를 전부 `kr.dongkuk.maru.mdm.engine.{expr,rule,domain,code,spi}` 로 명시한다.
- TRD.md:18 은 이것을 `com.dongkuk.dmes.mdm.engine.{expr,rule,domain,code,spi}` 로 요약했다 — **원문과 다른 root 패키지**(`kr.dongkuk.maru.mdm` vs `com.dongkuk.dmes.mdm`). PRD.md §2 규칙 1·3("영역 문서 02~06 이 우선한다", "01 은 출처일 뿐이고 02~06 이 조정한 내용이 우선한다")에 따라 영역 문서 06 의 명시적 패키지 표가 TRD 요약보다 우선한다고 읽었다. TRD.md:5 자신도 "이 문서에 적은 명령은... 이 문서 작성 시점에 실행해 확인하지 않았다"고 밝혀, TRD 의 패키지 표기가 검증 없이 저장소 관례(`com.dongkuk.dmes.*`)로 추정 작성됐을 가능성을 뒷받침한다.

## 1. 접근 방식

mqc(`src/backend/mqc`)를 뼈대로 **세 갈래를 따로 본뜬다** — "mqc 를 본뜬다"는 spec 문구는 Gradle 구조에만 그대로 맞고, 나머지는 다른 선례가 낫다:

| 영역 | 본뜨는 대상 | 이유 |
|---|---|---|
| Gradle 구조(settings.gradle, lib/api 분리, composite includeBuild, dependencySubstitution) | **mqc** | spec 이 지정한 선례, 실제로 동일 패턴이 mcm/mpp/mls/mpn 4곳에서 검증됨 |
| application.yml 프로파일 3종(local/local-db/wildfly) | **mcm** (datasource 연결 형태만) | mqc 는 SQLite 단일 yml 뿐이고, 3 프로파일을 실제로 가진 곳은 mcm 하나뿐이다. **단, mcm 은 `flyway.enabled: false`(재검증 확인, application.yml:37-38)라 Flyway 는 mcm 에서 본뜨지 않는다** — datasource url/driver/username/password 구조만 참고하고, Flyway 는 TRD §4.3 지시대로 mdm 이 처음 켠다(§7 행18) |
| Flyway 위치·locations 스코프 원칙 | **mqc** + 신규 방언 분기 | mqc 의 "locations 를 자기 아티팩트 폴더로 좁힌다" 원칙은 유지하되, `{sqlite,mssql}` 하위 분기는 이 리포에 선례가 없는 신규 패턴이다 |
| 포털 적재(page-registry, module-config.ts) | **m-mls**(`lsh/noticeMgmt`) | m-mqc 는 `pages/sample/index.tsx` 라는 **미등록 죽은 코드**다 — `generate-page-registry.mjs` 의 `MODULE_PAGE_PACKAGES` 가 m-mqc 를 스캔하지 않고, `module-config.ts` 의 `PORTAL_MODULE_CONFIG` 에도 없다. m-mls 만 실제로 포털에 걸린 유일한 "외부 모듈 화면" 선례다 |
| 메뉴·권한 시드(DataInitializer) | **analog**(`seedAnalogMenus`) | m-mls 의 noticeMgmt 는 **메뉴·권한 시드가 전혀 없다**(DataInitializer 에 `noticeMgmt`/`seedMls`/`seedLsh` 어느 것도 없음) — §13-3 이 경계하는 "OBJECT 행 없이 뜬 화면"에 해당하는 기존 부채로 보인다. mdm 은 이 부채를 반복하지 않고 analog 의 4단계(폴더·OBJECT·leaf·RBAC)를 그대로 따른다 |
| 독립 java-library 단일 모듈 구조(자체 settings.gradle 1줄, `../gradlew` 실행) | **aps-core / mcm-core** | mqc 는 lib+api 2서브프로젝트 구조라 다르다. aps-core 가 정확히 "독립 java-library, 자체 settings.gradle, nested wrapper 없음" 구조다 |
| ArchUnit 규칙 스타일 | **mcm-core**(`McmCoreArchitectureTest`) | 리포에서 유일한 ArchUnit 선례. `noClasses()...should().dependOnClassesThat()...as(...)` 관용구를 그대로 확장한다 |

세 개의 독립 산출물(mdm 백엔드, maru-mdm-engine, m-mdm 프론트)과 두 개의 기존 파일군 수정(mcm DataInitializer, m-mcm 포털 등록)으로 나뉜다. maru-mdm-engine 은 mdm 과 무관하게 그 자체로 완결된 순수 라이브러리이므로 두 산출물을 병렬로 만들 수 있다.

## 2. 변경 파일 목록

### 2.1 신규 — `src/backend/mdm`

```
src/backend/mdm/settings.gradle                     # rootProject.name='mdm' + includeBuild(cactus-core, mcm-core, maru-mdm-engine)
src/backend/mdm/build.gradle                         # mqc/build.gradle 구조 복제 + 서브프로젝트 test 집계 1블록 추가(§6.1b, D9 — mqc 와 의도적으로 다른 지점)
src/backend/mdm/lib/build.gradle                     # mqc/lib/build.gradle + maru-mdm-engine 의존 + mssql-jdbc/flyway-database-sqlserver 추가(§6.2 참고)
src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/package-info.java   # "향후 업무 패키지는 com.dongkuk.dmes.mdm.{group}.{screenId} 에 둔다" 1줄 Javadoc — 실 코드 없음(§5 불변 규칙 참고)
src/backend/mdm/api/build.gradle                     # mqc/api/build.gradle 그대로(war 이름만 mdm.war)
src/backend/mdm/api/src/main/java/com/dongkuk/dmes/mdm/MdmApplication.java
src/backend/mdm/api/src/main/resources/application.yml
src/backend/mdm/api/src/main/resources/application-local.yml
src/backend/mdm/api/src/main/resources/application-local-db.yml
src/backend/mdm/api/src/main/resources/application-wildfly.yml
src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V1__baseline.sql   # 주석만(빈 베이스라인)
src/backend/mdm/api/src/main/resources/db/migration/mdm/mssql/V1__baseline.sql    # 주석만, sqlite 와 같은 V-번호
src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmApplicationHealthTest.java  # §4 AC-2 참고
```

### 2.2 신규 — `src/backend/maru-mdm-engine`

```
src/backend/maru-mdm-engine/settings.gradle           # rootProject.name = 'maru-mdm-engine' (aps-core 패턴, includeBuild 없음)
src/backend/maru-mdm-engine/build.gradle              # java-library + maven-publish, EvalEx 3.7.0 + JUnit5 + ArchUnit 만 의존
src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/expr/package-info.java
src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/expr/ExpressionEvaluator.java   # EvalEx 를 실제로 쓰는 얇은 클래스(ArchUnit 대상 0건 방지)
src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/package-info.java
src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/domain/package-info.java
src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/code/package-info.java
src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/spi/package-info.java
src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/expr/ExpressionEvaluatorTest.java
src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/arch/MaruMdmEngineArchitectureTest.java
# D7(§6 하단) — 패키지 root 는 TRD.md:18 요약이 아니라 원천 설계 06-business-rule.md:456-461 원문을 따른다: kr.dongkuk.maru.mdm.engine.*
```

### 2.3 신규 — `src/frontend/m-mdm`

```
src/frontend/m-mdm/package.json           # @dk-oasis/m-mdm, m-mls/m-mqc package.json 복제
src/frontend/m-mdm/tsconfig.json          # m-mls/m-mqc 복제
src/frontend/m-mdm/tsup.config.ts         # entry: index + "pages/mdt/mdmSample/page"
src/frontend/m-mdm/src/index.ts           # 빈 배럴(재수출 없음, 주석만)
src/frontend/m-mdm/pages/mdt/mdmSample/page.tsx     # 샘플 빈 화면 — PageLayout 뼈대만, API 호출 없음
src/frontend/m-mdm/tests/tsup-entries.smoke.test.ts # §3 스모크 테스트 0 — page.tsx ↔ tsup entry 정합
```

**TRD 이탈 1건(한 줄 기록)**: TRD.md:75 는 화면 경로를 `m-mdm/src/pages/{group}/{screenId}/page.tsx` 로 적었으나, 포털 codegen(`generate-page-registry.mjs`)이 실제로 스캔하는 디렉터리는 `{pkg}/pages`(`src/` 없이) 이다(재검증 시 `MODULE_PAGE_PACKAGES` 항목의 `dir: path.resolve(ROOT, "..", "{module}", "pages")` 로 확인, m-mpp·m-mls 실물도 `pages/` 최상위). TRD 요약과 codegen 실측이 어긋나는 지점이라 **codegen 을 따른다** — `m-mdm/pages/...`(`src/` 없이).

### 2.4 수정 — 백엔드 composite

```
src/backend/settings.gradle    # includeBuild('mdm'), includeBuild('maru-mdm-engine') 추가(각 dependencySubstitution 포함)
src/backend/build.gradle       # includedProjectNames 에 'mdm', 'maru-mdm-engine' 추가
```

### 2.5 수정 — 메뉴·권한 시드

```
src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java
  # 412행 seedAnalogMenus() 호출 다음, 414행 "확장 지점" 주석(정확한 원문: "// 확장 지점 — 신규 업무
  # 모듈을 추가할 때 여기에 seed{Module}Menus() 를 호출한다.") 자리에 seedMdmMenus() 호출 추가.
  # 메서드 정의는 seedAnalogMenus() 정의(810행 부근) 바로 아래에 둔다.
```

### 2.6 수정 — 포털(m-mcm) 등록

```
src/frontend/m-mcm/package.json                                         # dependencies 에 "@dk-oasis/m-mdm": "workspace:*"
src/frontend/m-mcm/scripts/generate-page-registry.mjs                   # MODULE_PAGE_PACKAGES 에 m-mdm 항목 추가(41-45행)
src/frontend/m-mcm/app/portal/module-config.ts                          # PORTAL_MODULE_CONFIG 에 mdm 항목 추가(146-149행 주석 자리)
src/frontend/m-mcm/app/api/[module]/oasis/[serviceId]/[action]/route.ts # backendApiUrlByModule(재검증 확인, 39-46행)에 "mdm: process.env.MDM_WAS_URL" 1행 추가(선택 — 미추가 시 mdm 호출은 기본값 backendApiUrl(8080)로 잘못 프록시된다. 샘플 화면은 API 를 호출하지 않아(§3.3) 이번 AC 에는 영향 없지만, 다음 화면 Task 가 바로 쓸 수 있도록 지금 추가해 둔다)
src/frontend/m-mcm/.env.example                                         # MDM_WAS_URL="http://localhost:8096" 추가
```

### 2.7 수정 — pnpm 워크스페이스·실행 스크립트

```
src/frontend/pnpm-workspace.yaml   # packages 에 "- m-mdm" 추가(명시적 나열, glob 아님)
src/frontend/package.json          # dev, build:libs 스크립트에 --filter @dk-oasis/m-mdm 추가
src/frontend/pnpm-lock.yaml        # `pnpm install`(non-frozen) 재실행 결과 커밋 — 수동 편집 금지
be-run.sh                          # §6.10 참고, 7곳 수정
```

`be-run.ps1`/`.cmd`, `local-run.sh`/`.ps1`/`.cmd`, `dmes-up.ps1`/`.cmd` 는 **이번 범위에서 수정하지 않는다**(D3). 네 파일군 모두 mqc 문자열이 실재하므로(D3 재검증 인용) mdm 을 추가하지 않으면 Windows/`local-run`/`dmes-up` 경로에서 `--mdm` 이 조용히 무시되거나 오류가 난다 — 알려진 갭으로 남긴다.

## 3. 테스트 전략

### 3.1 백엔드 — 신규 테스트

| 테스트 | 위치 | 목적 |
|---|---|---|
| `MdmApplicationHealthTest` | `mdm/api/src/test/java/.../MdmApplicationHealthTest.java` | `@SpringBootTest(webEnvironment=RANDOM_PORT)` + `@ActiveProfiles("local")`, 임시 SQLite 파일(`@TempDir` 로 `spring.datasource.url` override)로 기동 → `/actuator/health` 200 확인 → `flyway_schema_history` 에 V1 SUCCESS 행 존재 확인. 수용 기준 2번(헬스 체크)과 TRD §12(두 방언 마이그레이션 적용) 를 한 테스트로 검증한다(수동 curl 만으로는 testAll 게이트에 들어오지 않는다). **테스트 의존성(`spring-boot-starter-test`)·`useJUnitPlatform()` 은 root `build.gradle` 의 `subprojects {}` 블록(mqc/build.gradle:17-34 확인)이 `api`/`lib` 서브프로젝트 모두에 이미 적용하므로 mdm 이 mqc 의 root build.gradle 구조를 그대로 복제하면(§2.1) 별도로 추가할 필요가 없다** — mqc 자체는 `api` 하위에 테스트 파일이 0개라 이 상속 경로가 눈에 띄지 않았을 뿐이다. **선례 정정(재검증)**: `analog/api` 의 `@SpringBootTest` 6개 클래스(`ClientKeyFilterTest`·`LogSearchController*Test`·`MetaApiControllerTest`, 15 `@Test`)를 최초 초안은 "cactus-core 를 올려 부팅하는 선례"로 인용했으나, 이는 틀렸다 — `analog/*/build.gradle` 를 재검증 시 다시 grep 한 결과 `cactus`/`mcm-core` 의존 **0건**이었고, analog 는 자체 `com.dongkuk.dmes.analog.security.ClientKeyFilter` 를 따로 두고 있어 cactus-core 와 무관한 독립 Spring Boot 앱이다. 즉 **cactus-core + mcm-core 를 함께 올려 부팅하는 `@SpringBootTest` 선례는 이 리포에 없다.** 대신 확인한 것: cactus-core·mcm-core 의 `src/main/java` 전체에 `ApplicationRunner`/`CommandLineRunner`/`@PostConstruct`/`ApplicationReadyEvent` 가 **0건**이라(재검증 grep), 부팅 중 DB 를 먼저 읽는 코드가 있다는 증거도 없다 — 그렇다고 부팅이 보장되는 것은 아니고, 단지 "막을 만한 코드가 눈에 띄지 않는다"는 정황 증거일 뿐이다. **Build 1단계에서 `MdmApplicationHealthTest` 를 가장 먼저 만들어 실제 부팅 성패부터 확인**하고, 실패하면 원인을 design.md 에 이탈로 적는다. 선례 없이 처음 시도하는 조합이라는 점을 정직하게 남긴다. |
| `MdmFlywayVersionParityTest` | `mdm/api/src/test/java/.../MdmFlywayVersionParityTest.java` | §5 불변 규칙 4 — sqlite/mssql 두 마이그레이션 디렉터리의 버전 번호 집합이 같은지 자동 비교 |
| `ExpressionEvaluatorTest` | `maru-mdm-engine/src/test/java/.../expr/ExpressionEvaluatorTest.java` | EvalEx 로 단순 식(`"1 + 2"` 등)을 평가해 기대값이 나오는지 — ArchUnit 대상 0건 회피 겸 "EvalEx 가 실제로 동작한다"의 증거. **§4 AC #6(composite build 의존 증명)의 실제 검증 지점이기도 하다** — 이 테스트가 `mdm/lib` 가 아니라 `maru-mdm-engine` 자체에 있으므로, AC #6 을 자동 게이트로 만들려면 `mdm/lib` 쪽에도 `ExpressionEvaluator` 를 직접 import 해 호출하는 스모크(`MdmEngineDependencySmokeTest`, 아래 행)가 별도로 필요하다 |
| `MdmEngineDependencySmokeTest`(신규, §4 AC #6 대응) | `mdm/lib/src/test/java/.../MdmEngineDependencySmokeTest.java` | `mdm/lib` 코드가 `kr.dongkuk.maru.mdm.engine.expr.ExpressionEvaluator` 를 직접 import 해 호출하고 결과를 검증 — composite build 로 엔진을 실제로 참조·링크한다는 것을 컴파일+런타임 양쪽에서 증명한다(`:lib:dependencies` 출력 확인만으로는 사람 눈 확인이라 testAll 게이트에 들어오지 않는다). `includeBuild('../maru-mdm-engine')` 를 지우는 변이를 주면 컴파일 자체가 실패해야 한다 |
| `MaruMdmEngineArchitectureTest` | `maru-mdm-engine/src/test/java/.../arch/MaruMdmEngineArchitectureTest.java` | §5 불변 규칙 1·2 의 ArchUnit 규칙 2개(허용 목록/금지 목록) |

### 3.2 프론트엔드 — 신규 테스트

| 테스트 | 위치 | 목적 |
|---|---|---|
| `tsup-entries.smoke.test.ts` | `m-mdm/tests/` | `pages/**/page.tsx` 파일 목록과 `tsup.config.ts` 의 entry 키 목록이 1:1 대응하는지 확인. m-mls·m-mqc·m-mpn·m-mpp 의 "테스트 파일 0개 → `vitest run` exit 1" 부채를 mdm 은 만들지 않으면서, "새 page.tsx 를 추가하고 tsup entry 를 깜빡한다"는 실제 실패 모드(런타임에 `dist/pages/.../page.js` 없음 → 포털에서 404)를 잡는다 |

### 3.3 화면 작업의 브라우저 E2E — 적용 범위 판단

이 Task 는 `domain: infra`, `entry-point: -` 다(spec.md 머리말). dev-discipline 「화면 작업의 브라우저 E2E」 절의 적용 조건("entry-point 가 있거나 domain 이 fullstack/frontend")에 **문자 그대로는 해당하지 않는다**. 다만 수용 기준에 "샘플 빈 화면 1개가 m-mcm 포털에서 열린다"가 있어 화면 결과물이 존재하므로, 최소 스모크 1개는 브라우저로 확인한다(과잉 적용보다 과소 적용의 리스크가 크다고 판단).

- **스모크 넷 적용 판정**:
  1. 메뉴 이동 — **적용**. `e2e/mdm-sample-smoke.spec.ts` 하나를 `src/frontend/e2e/`(기존 관례 위치)에 추가. admin 로그인 → 사이드바에서 mdt 그룹 → mdmSample 진입 → 화면 로드 확인.
  2. 목록 서버 데이터 채움 — **해당 없음**(사유: 샘플 화면은 그리드·목록이 없는 빈 화면. spec 의 "샘플 빈 화면"이 요구하는 전부가 로드 확인이다).
  3. 등록/수정 1회 — **해당 없음**(사유: 위와 동일, 입력 폼이 없다).
  4. 서버 오류 표시 — **해당 없음**(사유: 이 화면은 API 를 호출하지 않는다 — mcm 포털만 떠 있으면 열린다. mdm 백엔드(8096)가 내려가 있어도 화면 자체는 뜬다는 것이 오히려 "빈 화면" 요구사항의 증거다).
- 서버는 수동 기동(리포 관례, playwright.config.ts 가 서버를 띄우지 않음 — TRD §7 "주의" 문구와 일치): `./be-run.sh --mcm` + `./fe-run.sh --all -q`(mdm 백엔드 8096 은 이 스모크에 필요 없다 — 위 4번 근거). 명령은 TRD §7 이 정한 `pnpm exec playwright test e2e/mdm-*.spec.ts` 그대로 쓴다(dev-discipline 보다 TRD 가 우선 — "프로젝트 명세가 도구·경로를 따로 정했으면 그것이 이긴다").
- **통과 판정**: 리포터 출력에 `1 passed`(대상 spec 기준) + `0 skipped`/`0 failed` 를 확인한다. `SMOKE_LOGIN_USER=admin` / `SMOKE_LOGIN_PASSWORD=admin123`(TRD §7, DataInitializer.java:245-246 이 부팅마다 admin 비밀번호를 이 값으로 강제 재설정하는 것과 일치 확인 완료)을 환경변수로 넘긴다. 로그인 실패로 조용히 스킵되는 것을 "통과"로 오인하지 않는다.
- 스크린샷: `docs/mdm/tasks/TSK-01-01/screens/mdt-mdmSample.png` 1장, `dflow.sh taskdir` 산출 경로 규칙을 따른다.
- **Playwright 설치(재검증 완료, 추가 스캐폴드 불필요)**: `src/frontend/package.json:27` 에 `"@playwright/test": "^1.58.2"` 가 이미 devDependency 로 있고, `src/frontend/e2e/`(playwright.config.ts:4 `testDir: "./e2e"`) 에 기존 spec 파일 10여 개가 이미 동작 중이다(재검증 시 `ls src/frontend/e2e/*.spec.ts` 로 재확인). dev-discipline 의 기본값(`@playwright/test` 대신 bare `playwright` 라이브러리)과 다르지만, "프로젝트 관례가 있으면 그것"(dev-discipline 「화면 작업의 브라우저 E2E」 절 본문) 규칙에 따라 기존 `@playwright/test` 관례를 그대로 따른다 — 이번 Task 에서 새로 설치할 것이 없다(이탈 아님, 해당 없음).

## 4. 수용 기준 매핑

| # | 수용 기준 | 검증 방법·명령 |
|---|---|---|
| 1 | `cd src/backend && ./gradlew testAll` 이 mdm 포함으로 통과 | **Build 착수 직후 최우선 확인(D9 는 이미 확정됨, §6.1b)**: mqc 를 그대로 복제하면 `mdm/lib`·`mdm/api` 의 테스트가 `testAll` 에서 전혀 실행되지 않는다는 것이 실측(기존 testAll 결과 XML, §6.1b)으로 이미 확인됐다 — 따라서 §6.1b 집계 블록은 "혹시 몰라 넣는 방어"가 아니라 **필수**다. `mdm/build.gradle` 에 그 블록을 넣은 뒤 `testAll` 출력(`--console=plain` 등)에 `:mdm:lib:test`·`:mdm:api:test`·`:maru-mdm-engine:test` 가 실제로 나타나는지 눈으로 먼저 확인한다 — 이 확인 없이는 아래 "tests 증가" 수치가 거짓 통과일 수 있다. 그 다음 `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll` — `includedProjectNames`(§2.4)에 `mdm`·`maru-mdm-engine` 반영 후 0 failures, 기준선 386 대비 mdm 신규 테스트 정확히 5개(§3.1 — mdm 쪽 `MdmApplicationHealthTest`·`MdmFlywayVersionParityTest`·`MdmEngineDependencySmokeTest` 3개 + engine 쪽 `ExpressionEvaluatorTest`·`MaruMdmEngineArchitectureTest` 2개, 클래스당 `@Test` 메서드 수는 구현 중 정해지므로 "테스트 클래스 5개 신규" 기준으로 본다) 만큼 tests 증가 |
| 2 | `./be-run.sh --mdm` 으로 기동 후 헬스 체크 응답 | 수동: `./be-run.sh --mdm` 후 `curl -fsS localhost:8096/actuator/health` → `{"status":"UP"}`. 자동 게이트는 §3.1 `MdmApplicationHealthTest`(RANDOM_PORT)가 testAll 안에서 이미 검증 — 수동 curl 은 be-run.sh 배선 자체(포트·프로파일 전달)의 실측용 |
| 3 | `pnpm --filter @dk-oasis/m-mdm test` 와 `pnpm lint` 통과 | **선행조건**: `pnpm build:libs`(§2.7 — `@dk-oasis/m-mdm` 추가분 포함)를 먼저 실행한다. m-mdm 이 의존하는 `@dk-oasis/shared` 는 `dist/` 산출물을 통해 타입을 노출하므로(state.json `frontend_lint_preexisting` 이 기록한 기존 관례 — "m-mls·m-mqc tsc 는 shared dist 없으면 실패"), dist 없이 `tsc --noEmit`/`vitest` 를 돌리면 mdm 자체 결함이 아닌 선행조건 누락으로 실패한다. `test`: `vitest run` — §3.2 스모크 1개 존재로 exit 0(m-mls 류의 "테스트 0개 exit 1" 재현 안 함). `lint`: D2 결정("담당자 확인 필요 결정" 절) 채택 — m-mdm 자체 `tsc --noEmit` 0 에러 + 전역 `pnpm lint` 실행 시 **기준선(m-mcm 기존 23 errors) 대비 신규 에러 0건**(m-mcm 수정분이 새 eslint 에러를 만들지 않는지 별도 확인) |
| 4 | 샘플 빈 화면 1개가 m-mcm 포털에서 열린다 | §3.3 `e2e/mdm-sample-smoke.spec.ts` + 스크린샷. 선행조건: §2.5(메뉴·권한 시드) + §2.6(포털 등록) 둘 다 적용 — 시드만 하고 등록을 빠뜨리면 메뉴는 보이는데 클릭 시 404, 등록만 하고 시드를 빠뜨리면 사이드바에 안 뜨거나 403(§13-3 경고 그대로) |
| 5 | `../gradlew test` 통과, ArchUnit 규칙 위반 시 빌드 실패 | `cd src/backend/maru-mdm-engine && ../gradlew test` — §3.1 `MaruMdmEngineArchitectureTest` 포함 0 failures. **변이 검증**(Build/Verify 공통 절차, §5 규칙 1·2 의 변이 문구 그대로): 규칙 1 은 build.gradle 에 실제 의존을 추가 + 그 타입을 실제로 참조하는 코드, 규칙 2 는 메서드 본문에서 `java.net.URI.create(...)`/`DriverManager.getConnection(...)` 를 실제로 호출하는 코드로 각각 1회 만들어 `./gradlew test` 가 빨강이 되는지 확인 후 되돌린다. 단순 `import` 만 추가하는 변이는 빨강을 보장하지 않으므로 쓰지 않는다(§5 규칙 2 "한계 명시" 참고) |
| 6 | mdm 모듈이 composite build 로 엔진을 의존한다 | **자동 게이트(필수)**: `mdm/lib` 의 `MdmEngineDependencySmokeTest`(§3.1 신규)가 `kr.dongkuk.maru.mdm.engine.expr.ExpressionEvaluator` 를 직접 import·호출해 `testAll` 안에서 매번 검증한다 — `includeBuild('../maru-mdm-engine')` 를 지우는 변이를 주면 `mdm/lib` 컴파일 자체가 실패해야 한다(§5 규칙 8 과 함께 "composite 의존이 빠지면 testAll 이 반드시 죽는다"를 보장). 보조 확인(수동, testAll 게이트 아님): `cd src/backend/mdm && ../gradlew :lib:dependencies --configuration runtimeClasspath` 출력에 `project :maru-mdm-engine`(로컬 소스 치환)이 나타나는지 눈으로 확인 |

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

1. **maru-mdm-engine 의 main 의존은 EvalEx 하나뿐이다.** `build.gradle` 의 `dependencies { }` 블록에 EvalEx(`com.ezylang:evalex`) 외의 `implementation`/`api`/`compileOnly` 항목을 추가하지 않는다(Spring Boot BOM·cactus-core·mcm-core 전부 금지). ArchUnit 화이트리스트(허용): `kr.dongkuk.maru.mdm.engine..`(D7 — 패키지 root, §6 참고), `com.ezylang.evalex..`, `java.lang..`, `java.util..`, `java.math..`, `java.time..`, `java.text..`.
   - **변이(Build/Verify 가 실제로 실행, build.gradle 수정 불필요)**: `expr` 패키지의 아무 클래스 메서드 본문에 `new java.io.File("x")` 호출을 실제로 추가한다 — `java.io..` 는 규칙 1 의 화이트리스트 밖이므로(허용 목록에 `java.io` 없음, `java.lang/util/math/time/text` 만 허용) build.gradle 을 건드리지 않고도 ArchUnit 규칙(`engine_은_EvalEx_와_java_표준_외에_의존하지_않는다`)을 빨강으로 만들 수 있다. 이 변이는 그 규칙이 빨강이어야 한다. (규칙 2 본문이 언급하는 `java.io.File`·`java.nio.file.Files` 금지는 규칙 2 의 별도 금지 목록이 아니라 **규칙 1 의 화이트리스트 밖이라는 사실**로 이미 잡힌다 — §6.5 ArchUnit 코드의 규칙 2 는 `java.sql/javax.sql/java.net/java.nio.channels` 만 명시적으로 금지하고 `java.io` 는 규칙 1 이 담당하도록 정리했다. 두 규칙 서술과 §6.5 코드가 정확히 대응하도록 맞춘 것이다.)
2. **maru-mdm-engine 은 DB·네트워크를 직접 호출하지 않는다.** ArchUnit 명시 금지 목록(§6.5 코드): `java.sql..`, `javax.sql..`, `java.net..`(HTTP 포함), `java.nio.channels..`(소켓). **임의 파일 I/O**(`java.io.File`, `java.nio.file.Files`)는 이 규칙의 별도 금지 목록이 아니라 규칙 1 의 화이트리스트(`java.lang/util/math/time/text` 만 허용, `java.io` 없음)로 이미 막힌다 — 정의·사본 조회는 `engine.spi` 인터페이스로만 받는다(PRD FR-E7·TRD §10).
   - **변이(Build/Verify 가 실제로 실행)**: `expr` 패키지 클래스의 메서드 본문 안에서 `java.net.URI.create("http://x")` 또는 `java.sql.DriverManager.getConnection("jdbc:x")` 를 **실제로 호출**(단순 import 가 아니라 호출부까지)하도록 바꾸면 ArchUnit 규칙(`engine_은_DB_와_네트워크를_직접_호출하지_않는다`)이 빨강이고, 실패 메시지에 해당 규칙의 `.as(...)` 문구가 찍히는지까지 확인한다. **한계 명시**: ArchUnit 은 클래스가 실제로 참조하는 바이트코드 의존만 본다 — "build.gradle 에 의존을 선언만 하고 어떤 클래스도 그 타입을 참조하지 않는" 경우는 규칙 1·2 어느 쪽도 잡지 못한다. 이 구멍은 자동화하지 않고 §5 규칙 1 의 build.gradle 리뷰(사람 또는 Build 단계의 `dependencies` 태스크 출력 확인)로 메운다 — 커버되지 않는 변이로 정직하게 남긴다.
3. **Flyway locations 는 자기 모듈 폴더로 좁힌다** — mqc 의 원칙(주석 그대로) 그대로 유지. `application-local.yml` 은 `classpath:db/migration/mdm/sqlite`, `application-local-db.yml`/`application-wildfly.yml` 은 `classpath:db/migration/mdm/mssql` 만 가리킨다. `classpath:db/migration`(넓은 매칭)이나 `db/migration/mdm`(방언 미분리)으로 바꾸지 않는다.
   - **변이**: locations 를 `classpath:db/migration` 으로 넓히면(또는 방언 폴더를 혼합하면) mcm-core 의 SEC 마이그레이션과 버전 번호가 겹쳐 부팅 테스트가 빨강이어야 한다(§4 AC-1 커버).
4. **두 방언(sqlite/mssql) 폴더의 Flyway 버전 번호 집합은 항상 같아야 한다.** V1 이 sqlite 에 있으면 mssql 에도 V1 이 있어야 한다(내용은 방언별로 달라도 됨, 이번엔 둘 다 주석만).
   - **테스트**: `MdmFlywayVersionParityTest`(신규, `mdm/api/src/test/java/.../MdmFlywayVersionParityTest.java`) — `db/migration/mdm/sqlite`·`db/migration/mdm/mssql` 두 classpath 디렉터리의 파일명에서 `V\d+(_\d+)?` 버전 토큰만 뽑아 두 집합을 `assertEquals`. "사람이 리뷰"에 맡기지 않고 §3.1 신규 테스트로 자동화한다(dev-discipline 의 "불변 규칙마다 변이 검증" 요구를 충족하려면 사람 리뷰만으로는 Verify Phase 게이트가 재현 불가능하다).
   - **변이**: sqlite 쪽에만 V2 를 추가하고 mssql 쪽엔 추가하지 않으면 위 테스트가 빨강이어야 한다. 이번 Task 는 V1 하나뿐이라 초기 상태는 항상 초록.
5. **SQLite 로컬 DB 는 모듈별로 파일을 분리한다** — `jdbc:sqlite:../data/mdm.db` 단독 파일(다른 모듈과 공유하지 않음). `spring.flyway.table` 커스터마이즈(별도 history table)는 **하지 않는다** — DB 파일 자체가 분리돼 있어 불필요(mqc/mpp/mls/mpn 4곳 모두 동일 원칙, `flyway.table` 커스터마이즈 선례 0건). MSSQL(`local-db`/`wildfly`) 쪽 이력 테이블 충돌 여부는 D8(§"담당자 확인 필요 결정") 참고 — 결론은 "계정/스키마 분리를 전제로 커스터마이즈하지 않는다"로 같다.
6. **OBJECT_ID/screenId/serviceId/FE 폴더명은 항상 같은 문자열이다** — `mdmSample`. camelCase 단일 토큰(`^[a-z][a-zA-Z0-9]*$`, §13-2 정규식, `insertMcmSecMenuIfAbsent` 가 빌드 타임에 강제). `componentPath`(`mdt/mdmSample`) = `m-mdm/pages/mdt/mdmSample/page.tsx` 경로 = tsup entry 키(`pages/mdt/mdmSample/page`) = `PAGE_REGISTRY` 키, 넷이 항상 정확히 일치한다.
   - **변이**: 넷 중 하나만 바꾸면(예: 폴더명만 `mdmsample` 로 오타) §3.2 스모크 테스트 또는 §3.3 E2E 가 빨강이어야 한다.
7. **포트 8096 은 mdm 전용이다.** `be-run.sh`(§2.7) 외 어떤 파일에도 8096 을 다른 모듈이 쓰지 않는다(리포 전체 grep 결과 사용 전 상태 확인 완료).
8. **testAll 대상 등록은 mdm·maru-mdm-engine 둘 다** — 하나만 넣지 않는다(`src/backend/build.gradle` `includedProjectNames`, §2.4).

## 6. 부록 — 붙여넣기용 스니펫

Build Phase 가 그대로 옮겨 쓸 수 있도록, 조사에서 확인한 실제 코드를 근거로 한 스켈레톤을 남긴다. 전부 기존 파일(mqc/mcm/mcm-core/aps-core/m-mls)의 실측 구조를 그대로 확장한 것이다.

### 6.1 `src/backend/mdm/settings.gradle` (mqc/settings.gradle 확장)

```gradle
rootProject.name = 'mdm'

includeBuild('../cactus-core') {
    dependencySubstitution {
        substitute module('com.dongkuk.dmes:cactus-core') using project(':')
    }
}
includeBuild('../mcm-core') {
    dependencySubstitution {
        substitute module('com.dongkuk.dmes:mcm-core') using project(':')
    }
}
includeBuild('../maru-mdm-engine') {
    dependencySubstitution {
        substitute module('kr.dongkuk.maru.mdm:maru-mdm-engine') using project(':')   // D7 — group 은 06-business-rule.md 패키지표 기준
    }
}

include 'lib'
include 'api'
```

### 6.1b `src/backend/mdm/build.gradle`(루트) — **mqc 를 그대로 복제하지 않는 지점, D9 참고**

**재검증 시 실측으로 확정한 결함(D9, "담당자 확인 필요 결정" 절 참고)**: `src/backend/build.gradle` 의 `testAll` 은 `gradle.includedBuild(it).task(':test')`(각 포함 빌드의 **루트** `:test` 태스크)에 의존한다. `mqc`/`mpp`/`mls`/`mpn`/`analog` 처럼 `lib`+`api`(또는 `core`+`api`) 2-서브프로젝트 구조인 모듈은 루트 자체에 `src/` 디렉터리가 없다(재검증 확인: `ls -d src/backend/mqc/src` → 없음, `analog/build.gradle` 머리 주석도 "`./gradlew :core:test` / `./gradlew :api:test`" 로 **서브프로젝트를 직접 지정**하라고 적혀 있어 루트 `:test` 로 서브프로젝트가 묶인다고 가정하지 않는다). 루트가 `plugins { id 'java' }` 를 직접 적용해 자체 `:test` 태스크는 존재하지만, 이 태스크는 루트 자신의(존재하지 않는) 소스셋을 대상으로 해서 서브프로젝트 테스트를 자동으로 끌어오지 않는다 — Gradle 은 프로젝트 경계를 넘는 태스크 집계를 명시적으로 연결하지 않는 한 하지 않는다. **확정**: gradle 을 직접 돌리지 않고도(Design Phase 규칙상 실행 금지) 오케스트레이터가 이미 만들어 둔 `testAll` 산출물(`src/backend/*/build/test-results/test/*.xml`, 2026-09-23 생성)로 실측했다 — 테스트 결과 XML 이 `aps-core`·`cactus-core`·`caravan-core`·`caravan-hub`(전부 루트에 직접 `src/` 가 있는 단일-프로젝트 빌드)에만 있고, `mqc`/`mpp`/`mls`/`mpn`/`mcm`/`localKafka`/`analog`(전부 lib+api 또는 core+api 분할 구조) 에는 **0건**이다. `<testcase>` 총합은 정확히 386 — state.json `baseline.backend_testAll.tests` 와 완전히 일치해 "기준선 386 은 lib+api 서브프로젝트 테스트를 전혀 포함하지 않는다"는 것이 코드 추론이 아니라 **실측으로 확정**됐다(D9).

이 결함을 그대로 물려받으면, mdm 이 mqc 의 루트 `build.gradle` 을 문자 그대로 복제할 경우 §3.1 의 `MdmApplicationHealthTest`·`MdmFlywayVersionParityTest`·`MdmEngineDependencySmokeTest` 가 **작성되고도 `testAll` 게이트에서 한 번도 실행되지 않는다** — 수용 기준 1·2·6번이 "초록"으로 보여도 실은 아무것도 검증하지 않는 거짓 통과가 된다. 그래서 mdm 의 루트 `build.gradle` 만은 mqc 와 **의도적으로 다르게** 서브프로젝트 테스트를 명시적으로 묶는다(태스크 경로를 문자열로 지연 평가해 구성 순서에 덜 민감하게 한다):

```gradle
// mqc/build.gradle 과 동일(plugins/allprojects/subprojects 블록은 §1 표대로 그대로 복제) ...

// ── mqc 와 다른 지점(D9) — 루트 :test 가 서브프로젝트 테스트를 실제로 실행하도록 명시 집계 ──
// testAll(src/backend/build.gradle) 이 gradle.includedBuild('mdm').task(':test') 하나에만 의존하므로,
// 이 의존을 걸어 두지 않으면 :lib:test/:api:test 가 testAll 그래프에 들어오지 않을 위험이 있다(재검증 근거 위 참고).
tasks.named('test') {
    dependsOn(subprojects.collect { "${it.path}:test" })   // 문자열 태스크 경로 — 평가 순서에 덜 민감
}
```

### 6.2 `src/backend/mdm/lib/build.gradle` (mqc/lib/build.gradle + 엔진 + MSSQL 클래스패스)

mcm 의 `local-db`/`wildfly` 프로파일이 `com.microsoft.sqlserver.jdbc.SQLServerDriver`/`SQLServerDialect` 를 쓰는데도 리포 어디에도 `mssql-jdbc`/`flyway-database-sqlserver` 의존 선언이 없다(caravan-hub 의 `providedRuntime` 1건 제외, 재검증 시 확인한 기존 공백). mdm 은 이 공백을 반복하지 않는다.

```gradle
tasks.named('test') {
    useJUnitPlatform()
    // mqc/lib/build.gradle:12-14 와 같은 이유 — SQLite 는 DB 파일 단위 락이라 병렬 fork 시 테스트가 서로 막힌다.
    // MdmApplicationHealthTest 는 @TempDir 로 파일을 격리하지만, mdm/lib 쪽에 SQLite 기반 테스트가 늘어날 것을 대비해 미리 맞춘다.
    maxParallelForks = 1
}

dependencies {
    api 'com.dongkuk.dmes:cactus-core:1.0.20-SNAPSHOT'
    api 'com.dongkuk.dmes:mcm-core'
    api 'kr.dongkuk.maru.mdm:maru-mdm-engine'   // D7 — group kr.dongkuk.maru.mdm (com.dongkuk.dmes 아님)

    api 'org.springframework.boot:spring-boot-starter-actuator'
    api 'org.springframework.boot:spring-boot-starter-data-jpa'
    api 'org.springframework.boot:spring-boot-starter-security'
    api 'org.springframework.boot:spring-boot-starter-web'
    api 'org.springframework.boot:spring-boot-starter-validation'

    // local(SQLite)
    api 'org.xerial:sqlite-jdbc:3.45.3.0'
    api 'org.hibernate.orm:hibernate-community-dialects:7.0.5.Final'

    // local-db(MSSQL 직결) — mcm 의 application-local-db.yml 이 이미 요구하는데 선언이 빠져 있던 것을 mdm 에서 명시
    runtimeOnly 'com.microsoft.sqlserver:mssql-jdbc:12.8.1.jre11'

    // Flyway — Spring Boot 4 부터 FlywayAutoConfiguration 이 별도 모듈로 빠졌다(mqc 주석 그대로).
    api 'org.flywaydb:flyway-core'
    api 'org.springframework.boot:spring-boot-flyway'
    runtimeOnly 'org.flywaydb:flyway-database-sqlserver'   // mcm-core/build.gradle:68 의 flyway-database-postgresql(testRuntimeOnly) 과 같은 명명 패턴 — 정확한 artifactId·버전 존재 여부는 Build 1단계 실제 resolve 로 확정한다(EvalEx 좌표와 같은 이유, §6.4 주석 참고)
}
```

### 6.3 `application*.yml` — mcm 프로파일 3종을 mdm 규모로 축소

**재검증 시 추가한 두 가지(원래 fork 초안에 없던 것)**:
1. `spring.profiles.default: local` — `be-run.sh` 는 mdm 을 `:api:bootRun --args='--spring.profiles.active=local'`(be-run.sh:569, 재검증 확인)로 항상 명시 기동하므로 `./be-run.sh --mdm` 경로(AC-2)는 이 값이 없어도 된다. 다만 IDE·`../gradlew :api:bootRun`(인자 없이)로 직접 띄우는 경로는 default 가 없으면 datasource 미설정으로 기동이 실패한다 — mcm 처럼 `McmApplication.java` 에 `setDefaultProperties` 코드를 새로 두는 대신, yml 한 줄로 같은 효과를 낸다.
2. `cactus.security.client-key: ${BACKEND_CLIENT_KEY:dmes-bff-local-client-key-2026}` — mls(`application.yml:59`)·analog(`application.yml:26`) 가 이미 이 값을 명시한다(재검증 grep 확인). 반면 `mqc` 는 이 키 자체가 없다 — mqc 는 cactus.security 섹션이 통째로 없는 최소 bootRun 스켈레톤이라 원래 선례가 아니다(§1 표 참고, "Gradle 구조만 mqc"). BFF(`m-mcm/proxy.ts`)가 OASIS 호출 시 이 헤더를 검증하므로, 이번 Task 의 샘플 화면 자체는 API 를 호출하지 않지만(§3.3) 다음 화면 Task 가 바로 쓸 수 있도록 지금 넣어 둔다.
   - `client-key-skip-paths` 는 **명시적으로 넣지 않는다** — `ClientKeyFilter.java:62-66`(`DEFAULT_SKIP_PATHS`)에 이미 `/auth/`, `/api/auth/`, `/actuator/` 세 경로가 기본값이다. mcm 이 이 키를 재정의한 것은 `/ws/`(WebSocket 핸드셰이크) 예외가 추가로 필요해서일 뿐, mdm 은 WebSocket 이 없어 기본값으로 충분하다 — 재정의하면 오히려 "override 시 default 3종이 통째로 대체된다"(mcm 코드 주석)는 함정에 걸려 하나라도 빠뜨리면 actuator 가 막힐 수 있다.

`application.yml`(공통 — mcm 처럼 profiles.group 만 두고 datasource 는 넣지 않는다):

```yaml
spring:
  application:
    name: mdm
  profiles:
    default: local
    group:
      dev: [wildfly]
      prod: [wildfly]
  flyway:
    enabled: true

cactus:
  security:
    client-key: ${BACKEND_CLIENT_KEY:dmes-bff-local-client-key-2026}

server:
  port: 8096
```

`application-local.yml`:

```yaml
spring:
  datasource:
    url: jdbc:sqlite:../data/mdm.db
    driver-class-name: org.sqlite.JDBC
  jpa:
    database-platform: org.hibernate.community.dialect.SQLiteDialect
    hibernate:
      ddl-auto: none
  flyway:
    locations: classpath:db/migration/mdm/sqlite
```

`application-local-db.yml`(mcm 패턴, 최소화. **D8 전제**: `DB_USERNAME` 계정의 기본 스키마가 mdm 전용(예: `MDMAPUSER`)이어야 Flyway 이력 테이블이 다른 모듈과 섞이지 않는다 — 배포 시 확인):

```yaml
spring:
  datasource:
    url: jdbc:sqlserver://${DB_HOST}:${DB_PORT:1433};databaseName=${DB_NAME};encrypt=false;trustServerCertificate=true
    driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
    username: ${DB_USERNAME}
    password: ${DB_PASSWORD}
  jpa:
    database-platform: org.hibernate.dialect.SQLServerDialect
    hibernate:
      ddl-auto: none
  flyway:
    locations: classpath:db/migration/mdm/mssql
```

`application-wildfly.yml`(D6 — 사전 관리 스키마 전제, JNDI 이름 규약 `java:/jdbc/mssql/{모듈}/{DS}` 그대로 적용):

```yaml
spring:
  datasource:
    jndi-name: "${JNDI_DS_BIZ:java:/jdbc/mssql/mdm/dsBiz}"
  jpa:
    database-platform: org.hibernate.dialect.SQLServerDialect
    hibernate:
      ddl-auto: none
  flyway:
    enabled: false   # D6: wildfly 는 사전 관리 스키마 전제 — 마이그레이션은 local/local-db 로만 검증한다
```

### 6.4 `src/backend/maru-mdm-engine/build.gradle`

```gradle
plugins {
    id 'java-library'
    id 'maven-publish'
}

group = 'kr.dongkuk.maru.mdm'   // D7 — 06-business-rule.md:456-461 패키지표(kr.dongkuk.maru.mdm.engine.*) 기준, TRD.md:18(com.dongkuk.dmes.mdm.engine.*) 아님
version = '0.1.0-SNAPSHOT'

repositories {
    mavenCentral()
}

java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}

tasks.withType(JavaCompile).configureEach {
    options.encoding = 'UTF-8'
    options.compilerArgs.add('-parameters')
}

tasks.named('test') {
    useJUnitPlatform()
}

dependencies {
    api 'com.ezylang:EvalEx:3.7.0'   // 좌표 대소문자는 Build 1단계에서 실제 resolve 로 확정한다(artifactId 표기가 EvalEx/evalex 로 문서마다 다름)

    testImplementation platform('org.junit:junit-bom:5.11.4')
    testImplementation 'org.junit.jupiter:junit-jupiter'
    testImplementation 'com.tngtech.archunit:archunit-junit5:1.3.0'
    testRuntimeOnly 'org.junit.platform:junit-platform-launcher'
}
```

### 6.5 ArchUnit 규칙 (mcm-core `McmCoreArchitectureTest` 관용구 확장)

```java
private static final JavaClasses ENGINE = new ClassFileImporter()
        .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
        .importPackages("kr.dongkuk.maru.mdm.engine");   // D7 — 06-business-rule.md 패키지표 그대로

@Test
void engine_은_EvalEx_와_java_표준_외에_의존하지_않는다() {
    ArchRule rule = classes().that().resideInAPackage("kr.dongkuk.maru.mdm.engine..")
            .should().onlyDependOnClassesThat().resideInAnyPackage(
                    "kr.dongkuk.maru.mdm.engine..",
                    "com.ezylang.evalex..",
                    "java.lang..", "java.util..", "java.math..", "java.time..", "java.text..")
            .as("엔진 jar 는 EvalEx·java 표준 외 의존을 금지한다 (PRD FR-E7·TRD §10)");
    rule.check(ENGINE);
}

@Test
void engine_은_DB_와_네트워크를_직접_호출하지_않는다() {
    ArchRule rule = noClasses().that().resideInAPackage("kr.dongkuk.maru.mdm.engine..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "java.sql..", "javax.sql..", "java.net..", "java.nio.channels..")
            .as("엔진 jar 는 DB·네트워크를 직접 호출하지 않는다 — 정의·사본 조회는 engine.spi 로만 받는다 (TRD §10)");
    rule.check(ENGINE);
}
```

### 6.6 `DataInitializer.java` — `seedMdmMenus()` (analog 패턴 그대로 확장)

412행 `seedAnalogMenus();` 호출 다음, 414행 "확장 지점" 주석 자리에 `seedMdmMenus();` 호출을 추가한다. 메서드 정의는 `seedAnalogMenus()` 정의 바로 아래에 둔다.

FULL_SEQ 모듈 번호: 루트 폴더(parent=null)를 `insertMpnFld` 로 등록하는 기존 사례는 analog(모듈 4, `insertMpnFld("analog", "00000004", "로그 분석", null, 4000000L)`, DataInitializer.java:816) **하나뿐**이었다(리포 전체 grep 확인, mpn/mpp/mqc/mls/mcm 은 이 헬퍼로 root 폴더를 만들지 않는다 — 다른 경로로 이미 시드돼 있는 것으로 보인다, Build 단계에서 재확인 권장). 모듈 번호 `5` 는 이번 조사에서 충돌을 찾지 못해 골랐다 — Build 착수 시 `grep -n 'insertMpnFld' DataInitializer.java` 로 5 가 비어 있는지 한 번 더 확인한다. 부팅 마지막의 `recomputeMenuFullSeq()`(2026-06-04 주석, 414행 부근)가 트리 위치 기준으로 FULL_SEQ 를 다시 계산하므로, 여기 적은 리터럴 값이 틀려도 최종 화면 노출에는 영향이 적지만 값 자체는 관례대로 맞춰 둔다.

```java
private void seedMdmMenus() {
    final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
    final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                            + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";

    // ── 폴더 (FLD) — root mdm(모듈 5) + group mdt(§6 D5) ──
    insertMpnFld("mdm", "00000005", "마루 MDM", null,   5000000L);
    insertMpnFld("mdt", "00000100", "용어·도메인·컬럼·단위", "mdm", 5010000L);

    // ── OBJECT — SYSTEM_CODE='mdm' 이 FE moduleId 가 된다 ──
    insertMcmSecObjIfAbsent("mdmSample", "MDM 샘플", "mdm");

    // ── 메뉴 leaf (parent=mdt) — componentPath = 'mdt/mdmSample' ──
    insertMcmSecMenuIfAbsent("mdmSample", "001", "5010100", "MDM 샘플", "mdt", "mdmSample");

    // ── RBAC — SYSADMIN × 1 OBJECT × PERM_ALL ──
    insertIfAbsentComposite(
            "TB_MCM_SEC_ROLE_MAPPING",
            new String[]{"ROLE_ID",  "OBJECT_ID",  "PERMISSION_ID"},
            new String[]{"SYSADMIN", "mdmSample", "PERM_ALL"},
            "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
            "VALUES ('SYSADMIN', 'mdmSample', 'PERM_ALL'" + AUDIT_VALS + ")");
    log.info("[DataInitializer] MDM 샘플(mdt) 메뉴 시드 — 폴더 2 + OBJECT 1 + 메뉴 leaf 1 + RBAC 1");
}
```

action(PERMISSION_ACTION) 등재는 이번엔 불필요하다 — 샘플 화면이 조회 액션(`search` 등 기본 `PERM_ALL` 액션)만 쓰고 OASIS BPMN 을 아직 갖지 않는다(§3.3 근거). 실제 BPMN 이 생기는 다음 화면 Task 에서 `seedMcmSecRbac()` 의 `allActions` 목록에 추가한다.

### 6.7 `module-config.ts` — mls 항목 다음(146행 주석 자리)에 추가

```ts
{
  // {날짜} — mdm 모듈 포털 등재. 1호 화면 mdt/mdmSample(스캐폴드 검증용 빈 화면).
  //   화면 코드는 m-mdm 패키지의 pages/{group}/{leaf}/page.tsx 에 있고, codegen 이 등재한다.
  moduleId: "mdm",
  packageName: "@dk-oasis/m-mdm",
  loadPage: createStrictModuleLoader("mdm", sharedPortalPageLoader),
},
```

### 6.8 `generate-page-registry.mjs` — `MODULE_PAGE_PACKAGES`(41-45행)

```js
const MODULE_PAGE_PACKAGES = [
  { pkg: "@dk-oasis/m-mpp", dir: path.resolve(ROOT, "..", "m-mpp", "pages") },
  { pkg: "@dk-oasis/m-mls", dir: path.resolve(ROOT, "..", "m-mls", "pages") },
  { pkg: "@dk-oasis/m-mdm", dir: path.resolve(ROOT, "..", "m-mdm", "pages") },
];
```

### 6.9 `m-mdm/tsup.config.ts`

```ts
import { defineConfig, type Options } from "tsup";

const external = [
  "react", "react-dom", "next", "next/navigation", "next-auth", "next-auth/react",
  "@dk-oasis/shared", /^@dk-oasis\/shared\/.*/,
];

const common: Options = {
  format: ["esm"],
  target: "es2022",
  charset: "utf8",
  dts: true,
  sourcemap: true,
  clean: false,   // 호스트(m-mcm) dev 서버가 dist/ 를 watch — m-mls/m-mqc 와 동일 이유
  splitting: true,
  outDir: "dist",
  external,
};

export default defineConfig([
  { ...common, entry: { index: "src/index.ts" } },
  {
    ...common,
    entry: {
      "pages/mdt/mdmSample/page": "pages/mdt/mdmSample/page.tsx",
    },
  },
]);
```

### 6.10 `be-run.sh` — 실제 수정 7곳(주석의 "3곳"보다 많다, 재검증 시 실측 재확인 완료)

```
5~6행(머리 주석 포트 표):   mls 8092 · mqc 8093 · mpp 8094 · mpn 8095 · mdm 8096 · mcm 8100 · analog 8191
14행(모듈 플래그 주석):     --mpn --mcm --mls --mqc --mpp --mdm --analog
69행 부근(dev_log_tag_color): be-mdm) printf '%s' "$DEVLOG_...";;  # 미사용 색상 하나 배정
174행 BE_ALL_MODULES:      BE_ALL_MODULES=(mls mqc mpp mpn mdm mcm analog)
178~183행 be_module_port:  mdm) printf '8096' ;; 추가
217행 인자 파싱 case:       --mpn|--mcm|--mls|--mqc|--mpp|--mdm|--analog)
225행 오류 메시지:          ... --mpn/--mcm/--mls/--mqc/--mpp/--mdm/--analog
```

## 7. 조사 히트 분류표 — mqc/m-mqc·포트·빌드 등록 전수 (team-lead 필독 항목 대응)

재검증 시 직접 `grep`/`Read` 로 확인. 각 행을 "mdm 도 손댈 곳"과 "손대지 않는 이유"로 분류한다.

| # | 조사 대상 | 실측(file:line) | 분류 |
|---|---|---|---|
| 1 | `src/backend/settings.gradle`(루트) `includeBuild` 목록 | `mpn`(3)·`cactus-core`(8)·`aps-core`(13)·`mcm-core`(18)·`caravan-console`(23)·`mpp`(28)·`mqc`(33)·`mls`(38)·`mcm`(43)·`localKafka`(48)·`caravan-core`(53)·`caravan-hub`(58)·`analog`(63) | **손댈 곳** — `includeBuild('mdm')`·`includeBuild('maru-mdm-engine')` 2행 추가(§2.4) |
| 2 | `src/backend/build.gradle` `includedProjectNames` | testAll 등 집계 태스크의 대상 배열 | **손댈 곳** — `'mdm'`·`'maru-mdm-engine'` 추가(§2.4) |
| 3 | `mqc/settings.gradle` composite 패턴 | `includeBuild('../cactus-core') { dependencySubstitution { substitute module(...) using project(':') } }` 동일 패턴으로 `../mcm-core` 도 포함 | **참고(패턴 복제)** — mdm/settings.gradle·maru-mdm-engine 의존 선언에 그대로 확장(§6.1) |
| 4 | cactus-core 이중 `includeBuild`(루트 + mqc 자체) | 루트(8행)와 mqc(3행) 양쪽에 동시 포함, `src/backend/build.gradle` 의 aggregator 가 이 구조를 전제로 이미 정상 동작 중 | **손대지 않는 이유** — Gradle 이 canonical path 기준 dedup, 기존 mpp/mls/mcm/mpn 4곳 모두 같은 이중 포함 패턴으로 이미 검증됨. mdm 도 같은 방식이라 별도 조치 불필요 |
| 5 | `be-run.sh` | 포트 표(5-6)·플래그 주석(14)·색상(67-70)·`BE_ALL_MODULES`(174)·포트 case(178-182)·인자 파싱(217)·오류 메시지(225) | **손댈 곳** — 7곳 수정(§6.10) |
| 6 | `be-run.ps1`/`.cmd`, `local-run.sh`/`.ps1`/`.cmd`, `dmes-up.ps1`/`.cmd` | 전부 mqc 등 5~6 모듈을 하드코딩(D3 재검증 인용) | **손대지 않는 이유(범위 밖, D3 결정)** — spec·TRD 가 `be-run.sh` 만 명시. 알려진 갭으로 기록, `.sh` 만 지원 |
| 7 | `fe-run.sh` | 381행 로그 문자열에만 모듈명이 정적으로 나열(`m-mpn/m-mpp/m-mqc/m-mls/m-analog`) — 실제 동작은 `pnpm build:libs`/`pnpm dev` 호출뿐이라 루트 `package.json` 이 SoT | **손대지 않는 이유** — §2.7 에서 루트 package.json 만 고치면 `fe-run.sh --all -q` 가 코드 수정 없이 m-mdm 을 함께 빌드·watch 한다. 로그 문자열 갱신은 선택 사항(있으면 좋으나 AC 무관) |
| 8 | CI 파일(`.github/workflows/*`, `Jenkinsfile`, `.gitlab-ci.yml`) | 리포 전체 0건(재검증 재확인) | **손대지 않는 이유** — 이 표준 템플릿 저장소에 외부 CI provider 자체가 없다(D4) |
| 9 | `src/frontend/m-mcm/package.json` dependencies | `@dk-oasis/m-mpp`·`@dk-oasis/m-mls` 등록, `@dk-oasis/m-mqc` 는 없음(m-mqc 자체가 미등록 상태) | **손댈 곳** — `"@dk-oasis/m-mdm": "workspace:*"` 추가(§2.6) |
| 10 | `generate-page-registry.mjs` `MODULE_PAGE_PACKAGES`(41-45행) | `@dk-oasis/m-mpp`·`@dk-oasis/m-mls` 등록, `@dk-oasis/m-mqc` 는 44행에 **주석으로만** 존재("향후") — 즉 m-mqc 는 지금도 포털에 안 걸린다 | **손댈 곳** — mdm 은 m-mqc 처럼 주석으로 방치하지 않고 실제 배열 항목으로 추가(§6.8) |
| 11 | `next.config.ts` `transpilePackages` | `portalTranspilePackages`(module-config.ts:184-192)를 import — `PORTAL_MODULE_CONFIG` 의 `packageName` 목록에서 **자동 파생**(`@dk-oasis/mcm` 제외) | **손대지 않는 이유** — §6.7 로 `PORTAL_MODULE_CONFIG` 에 mdm 항목만 추가하면 transpilePackages 는 자동으로 `@dk-oasis/m-mdm` 을 포함한다. 별도 파일 수정 없음 |
| 12 | m-mcm Tailwind `@source` | `app/globals.css:12` — `@source "../../shared/src"` 1건뿐(shared 소스 직접 스캔용) | **손대지 않는 이유** — 업무 모듈별 `@source` 항목이 없다(m-mqc/m-mls 도 없음). m-mdm 화면의 Tailwind 클래스는 shared 공통 컴포넌트를 통해서만 노출되면 이 구조로 충분, 화면 자체에서 직접 신규 유틸 클래스를 쓰지 않는 한(샘플 빈 화면은 안 씀) 추가 불필요 |
| 13 | m-mcm `tsconfig.json` paths | `paths: { "@/*": ["./*"] }` 만 존재(25-29행) — `@dk-oasis/*` 매핑 없음, pnpm workspace 심링크 + 각 패키지 `exports` 필드로 해석 | **손대지 않는 이유** — m-mls/m-mqc 도 tsconfig paths 항목이 없다. m-mdm 패키지의 `exports`(§2.3 package.json)만 m-mls 패턴대로 맞추면 됨 |
| 14 | `src/frontend/package.json`(루트) `dev`·`build:libs` | `pnpm --filter @dk-oasis/shared build && ... m-mpn ... m-mpp ... m-mqc ... m-mls ... m-analog ...`(6-9,24행) — m-mdm 없음 | **손댈 곳** — 두 스크립트 모두에 `--filter @dk-oasis/m-mdm build` 추가(§2.7) |
| 15 | `pnpm-workspace.yaml` | `packages:` 가 `m-mcm/shared/m-mpn/m-mpp/m-mqc/m-mls/m-analog/m-design-dummy` 명시적 나열(glob 아님) | **손댈 곳** — `- m-mdm` 1행 추가(§2.7) |
| 16 | 포트 `8096` 사용 여부 | 리포 전체(코드·스크립트) grep 결과 실사용 0건, 문서(TRD·wbs·spec)에만 예정값으로 등장 | **손댈 곳(신규 배정)** — 충돌 없이 mdm 전용으로 확정 가능(§5 규칙 7) |
| 17 | DB 프로파일 3종(local/local-db/wildfly) 선례 | mqc/mpp/mls/mpn 은 `local`(SQLite) 단일 프로파일뿐. 3종을 실제로 가진 곳은 **mcm 하나**(application.yml·-local.yml·-local-db.yml·-wildfly.yml) | **참고(패턴 복제)** — mcm 의 biz 단일 DS 부분만 축소 적용(§1 표, §6.3) |
| 18 | Flyway 위치 방언 분리(`{sqlite,mssql}`) 선례 | **재검증 시 정정(초안의 잘못된 서술)**: `aps-core` 는 방언 분리가 없다(`db/migration/aps-core/` 단일 폴더). `mcm-core` 는 방언별 폴더가 있긴 하지만 `db/migration/{mcm-core, sqlite}` 형태(모듈명 폴더=디폴트, `sqlite`=대안 방언 형제 폴더)로, mdm 이 쓰려는 `db/migration/mdm/{sqlite,mssql}`(모듈 폴더 **아래** 방언 분기) 구조와 다르다. **더 결정적으로**: mcm/api 의 `application.yml:37-38`(재검증 확인) 이 `spring.flyway.enabled: false` 를 명시하고, "`mcm-core/.../sqlite/` 의 V*.sql 은 **이력 참고용이며 런타임 적용 대상이 아니다**"·"켜 두면 각 모듈 sample 마이그레이션과 버전 번호가 겹쳐 부팅이 실패한다"고 주석에 직접 밝힌다 — 즉 mcm 은 Flyway 를 **아예 쓰지 않는다**(스키마는 `ddl-auto: update` + DataInitializer 멱등 DDL 로 관리). `local-db`/`wildfly` 프로파일에서 Flyway `locations` 를 실제로 켜서 쓰는 선례는 이 리포에 **하나도 없다** | **신규 패턴(리포 최초, 선례 없음)** — mdm 은 TRD §4.3("새 모듈이므로 Flyway 를 쓴다")에 따라 처음부터 Flyway 를 켠다. mcm 을 본뜬 것은 §6.3 의 datasource 연결 정보(url/driver/username/password 형태)뿐이고, Flyway locations 방언 분리 자체는 **참고할 선례가 없는 신규 설계**다(§5 규칙 3·4 로 직접 고정). mcm-core 의 이력용 sqlite 폴더와 버전 번호가 겹칠 위험은 mcm 의 Flyway 가 꺼져 있어(스캔 자체를 안 함) 실질적으로 없다 |
| 19 | 헬스 체크 엔드포인트 | 모든 모듈이 `management.endpoints.web.exposure.include` 미설정(Actuator 기본값=health 만 노출), `cactus-core/.../CactusWebSecurityAutoConfiguration.java:108`·`ClientKeyFilter.java:62-66` 이 `/actuator/health` 를 인증·클라이언트키 양쪽에서 기본 permitAll/skip 처리 | **손대지 않는 이유** — cactus-core 를 의존하는 것만으로 `/actuator/health` 가 인증 없이 응답한다. mdm 이 별도 엔드포인트나 보안 예외를 만들 필요 없음(§6.3 재검증 메모) |
| 21 | `screenId`/`mdmSample` 를 막는 화이트리스트가 있는가(재검증 추가 조사) | ① `04-cases-checklist-menu.md` §13-2 `insertMcmSecMenuIfAbsent` 의 `^[a-z][a-zA-Z0-9]*$` — `mdmSample` 통과. ② `shared/src/portal-shell/module.ts` 의 `isValidPageNamePath`/`isValidPagePath` — 모듈 화이트리스트 없음, 일반 경로 세그먼트 검사만. ③ `(mcm|mpp|mqc|mls|...)` 형태의 하드코딩 모듈 나열 배열을 `src/frontend/shared`·`m-mcm/app`·`mcm/api` 전역 grep — 0건. ④ `docs/guide/design/identifier-dictionary/04-decision-table-dispatch.md:112` 의 `^TB_(mpn\|mpp\|mls\|mqc\|mcm)_[a-z][a-z0-9_]*$` — 이것만 `mdm` 을 막는다(테이블명 대상, 분기 1 "MES 화면 설계" 정합체크서 검증용 **문서 체크리스트**이지 런타임/빌드 코드가 아니다) | **손대지 않는 이유(런타임 무관) + 알려진 후속 과제**: 위 ①②③은 mdm/mdt/mdmSample 을 막지 않는다. ④는 TRD.md:71 이 이미 "전사 아키텍처 설계 Task 에서 `mdm` 추가" 로 후속 조치를 못박아 뒀고, 이 Task 는 category=infra 로 분기 1(화면 설계) 밖이라 정합체크서 검증 대상이 아니다(D5 근거와 동일) — 다만 향후 mdm 화면이 분기 1 을 거칠 때 `TB_MDM_*` 테이블명이 이 정규식에 걸려 ✗ 판정을 받을 수 있다는 것을 여기 남겨 둔다 |
| 22 | DataInitializer 메뉴·권한 시드 확장 지점 | `DataInitializer.java:412` `seedAnalogMenus();` 호출 직후 414행 "확장 지점" 주석. `seedAnalogMenus()` 본문(810-833행)을 재검증 시 원문 그대로 재확인 — `insertMpnFld`/`insertMcmSecObjIfAbsent`/`insertMcmSecMenuIfAbsent`/`insertIfAbsentComposite` 시그니처와 AUDIT_COLS/VALS·`MCMAPUSER` 스키마·`SYSDATETIME()` 전부 §6.6 스니펫과 일치 확인 | **손댈 곳** — `seedMdmMenus()` 신설 + 호출 추가(§2.5·§6.6). 모듈 번호 `5`(analog=4 다음) 는 `insertMpnFld` 전수 grep 으로 미사용 확인 완료 |
| 23 | `testAll` 이 lib+api 분할 모듈의 서브프로젝트 테스트를 실제로 실행하는가(D9, §6.1b) | **확정(기존 testAll 실행 산출물 실측)** — `find src/backend -path '*/build/test-results/test/*.xml'` 결과가 `aps-core`(1)·`cactus-core`(41)·`caravan-core`(13)·`caravan-hub`(33) 에만 있고 `mqc`/`mpp`/`mls`/`mpn`/`mcm`/`localKafka`/`analog` 는 0건, `<testcase>` 총합이 정확히 386 = state.json 기준선과 일치. `testAll` 은 `gradle.includedBuild(it).task(':test')`(루트 test) 하나에만 의존하고 lib+api 분할 모듈은 루트에 소스가 없어 이 태스크가 서브프로젝트를 끌어오지 못한다 | **손댈 곳(방어적, mdm 한정) + 확정된 리포 전체 결함 보고** — mdm 의 루트 `build.gradle` 에만 §6.1b 의 명시 집계 블록을 추가해 mqc 와 다르게 간다. 기존 mqc/mpp/mls/mpn/mcm/analog 자체를 고치는 것은 이 Task 범위 밖(D9) — 별도 과제로 보고 권장 |

## 8. Build 착수 순서

Build Phase 가 그대로 따를 수 있는 순서다. 각 단계 커밋은 `--trailer "DFlow-Order: 12cbcc4e-ed40-454f-8041-c99e08487d0b"`(state.json `order`)를 붙인다.

1. **D7 확인** — 담당자 확인이 오면 그 결과로, 안 오면 이 design.md 의 (a) 결정(원천 설계 패키지 `kr.dongkuk.maru.mdm.engine.*`)으로 진행한다. 이 결정이 뒤집히면 이후 전부가 rename 비용을 지므로 가장 먼저 확정한다.
2. **엔진(`maru-mdm-engine`) 먼저**: §3.1 의 `ExpressionEvaluatorTest`·`MaruMdmEngineArchitectureTest` 를 TDD 로 — 테스트를 먼저 쓰고 실패를 확인한 뒤 `ExpressionEvaluator`·`package-info.java` 5개를 만든다. `mdm` 과 독립적으로 완결되므로(§1) 여기서 끝낸다.
3. **mdm 백엔드**: `settings.gradle`(§6.1)·`build.gradle`(§6.1b, 서브프로젝트 test 집계 블록 **필수** — D9 확정 근거 참고)·`lib`/`api` 의 `build.gradle`(§6.2)·`application*.yml`(§6.3)·Flyway V1 2벌·`MdmApplicationHealthTest`·`MdmFlywayVersionParityTest`·`MdmEngineDependencySmokeTest`(§3.1)를 만든다. 루트 `settings.gradle`/`build.gradle`(§2.4)에 등록한 뒤 `cd src/backend && ./gradlew testAll` 로 §4 AC #1 의 "최우선 확인"(`:mdm:lib:test`·`:mdm:api:test`·`:maru-mdm-engine:test` 가 출력에 나타나는지)부터 본다.
4. **프론트 m-mdm + pnpm 워크스페이스**: `pnpm-workspace.yaml`·루트 `package.json`(§2.7)을 먼저 고친 뒤, `cd src/frontend && pnpm install`(**non-frozen**, `--frozen-lockfile` 옵션 없이)을 실행해 `pnpm-lock.yaml` 갱신분을 만든다. **이 lockfile 변경은 별도 커밋으로 미루지 않고 같은 Build 커밋에 함께 넣는다** — `.issues` 가 기록한 대로 신규 워커 워크트리는 lockfile 만으로 `pnpm install --frozen-lockfile` 하므로, lockfile 이 누락되면 그 워커의 설치 자체가 실패한다. 이어서 `m-mdm` 패키지(§2.3, §6.9 tsup 설정 포함)와 `tsup-entries.smoke.test.ts`(§3.2)를 만들고 `pnpm build:libs` → `pnpm --filter @dk-oasis/m-mdm test`/`lint`(§4 AC #3 선행조건 참고)로 확인한다.
5. **시드·포털 등록**: `DataInitializer.seedMdmMenus()`(§2.5·§6.6)와 m-mcm 포털 등록(§2.6·§6.7·§6.8)을 함께 넣는다(§4 AC #4 — 한쪽만 넣으면 404 또는 403). `be-run.sh`(§2.7·§6.10) 7곳을 반영한다.
6. **E2E**: `./be-run.sh --mcm` + `./fe-run.sh --all -q` 로 서버를 띄운 뒤 `e2e/mdm-sample-smoke.spec.ts`(§3.3)를 작성·실행하고 스크린샷을 남긴다.
7. **엔진 단독 검증**: `cd src/backend/maru-mdm-engine && ../gradlew test` 로 §4 AC #5 를 별도 확인하고, §5 불변 규칙 1·2 의 변이 검증(§4 AC #5 문구 그대로)을 1회씩 수행한 뒤 되돌린다.

## 담당자 확인 필요 결정

### D1 — RULE.md "모듈 폴더 임의 생성 금지" vs spec 의 명시적 생성 지시
- **질문**: `src/backend/mdm`·`maru-mdm-engine`·`src/frontend/m-mdm` 새 폴더를 이번 Task 에서 바로 생성해도 되는가, 아니면 RULE.md 의 "모듈 폴더 임의 생성 금지"에 걸려 사람 승인을 먼저 받아야 하는가?
- **선택지**: (a) spec 우선, `src/backend/mdm`·`maru-mdm-engine`·`src/frontend/m-mdm` 생성 진행 (b) 생성 보류, 사람 승인 대기
- **택한 것**: (a)
- **근거(spec 본문 > 승인된 선행 산출물 > 기존 관례 순)**: spec.md requirements 가 "`src/backend/mdm`(lib+api) 생성"을 명문으로 지시하고, TRD.md:8 "모듈 배치(사용자 결정 2026-09-23: 새 `mdm` 모듈)"가 이미 사람 승인을 거친 선행 산출물이다. RULE.md §"작업 분기" 32행의 "모듈 폴더가 소스에 없으면 임의 생성하지 않고 사용자에게 확인한다"는 **임의** 생성을 막는 규칙이지, 이미 승인된 TRD 의 명시적 지시를 막는 규칙이 아니라고 읽었다.
- **반려되면 재작업 방향**: 폴더 생성 자체를 되돌리고, TSK-01-01 을 승인 대기(pending) 상태로 두거나 별도 승인 절차(AskUserQuestion 은 이 Phase 에서 금지이므로 사람이 직접 state.json 또는 issue-brief 로 승인)를 거친 뒤 재개.

### D2 — `pnpm lint` 수용 기준의 해석
- **질문**: 수용 기준 3번 "`pnpm lint` 통과"를 전역 문자 그대로(m-mcm 기존 23 errors 포함) 요구하는가, m-mdm 범위로 좁혀 읽어도 되는가?
- **선택지**: (a) 전역 문자 그대로("`pnpm lint` 가 통과") — 불가능(m-mcm 기존 23 errors 로 이미 실패, mdm 무관) (b) m-mdm 자체 lint 통과 + 전역 기준선 대비 신규 에러 0건 (c) m-mdm 만 별도로 `pnpm --filter @dk-oasis/m-mdm lint` 를 돌리고 전역 `pnpm lint` 는 검증에서 뺀다
- **택한 것**: (b)
- **근거**: 오케스트레이터가 이미 측정한 기준선(state.json `frontend_lint_preexisting`: "m-mcm eslint 23 errors / 44 warnings")이 이 Task 와 무관한 기존 부채임을 명시했고, spec acceptance 문구를 "전역 그대로 통과"로 읽으면 애초에 충족 불가능한 조건이 된다. (b)가 spec 의 의도(mdm 이 lint 를 깨지 않는다)를 살리면서 실제로 검증 가능하다.
- **반려되면 재작업 방향**: m-mcm 기존 23 errors 를 이번 Task 범위로 끌어들여 함께 고친다(범위 확장, 별도 승인 필요) 또는 acceptance 문구 자체를 wbs.md/spec.md 에서 수정.

### D3 — `be-run.ps1`/`.cmd`·`local-run.*`·`dmes-up.ps1` 동등 지원 여부
- **질문**: `.sh` 계열(`be-run.sh`)만 mdm 을 등재하고 Windows/`local-run`/`dmes-up` 계열은 이번 범위 밖으로 남겨도 되는가?
- **재검증(2026-09-23, 원문 직접 확인)**: 네 파일군 모두 mqc 문자열이 실재한다 — `be-run.ps1:6,15,37,48,137,146`(머리 주석·포트 표·플래그 파싱·색상, `.sh` 와 완전히 대응하는 구조), `be-run.cmd`(전체 3줄, `be-run.ps1` 을 그대로 호출하는 wrapper — 자체 로직 없음), `local-run.sh:15,73` 및 `local-run.ps1:13,77`(모듈 플래그 화이트리스트에 `mqc` 등 5개만 나열, `mdm` 넣지 않으면 `--mdm` 을 받아도 무시), `dmes-up.ps1:30,40,41,163`(포트 표·`$Modules`·`$BePorts` 해시에 mqc 등 6개 모듈 하드코딩, `dmes-up.cmd` 는 `.ps1` wrapper). 즉 이 네 파일군에 mdm 을 넣지 않으면 "Windows 개발자 또는 `local-run`/`dmes-up` 경로로 기동하는 사람"에게는 `--mdm` 이 조용히 무시되거나 오류가 난다.
- **선택지**: (a) `be-run.sh` 만 수정, 나머지 세 파일군(be-run.ps1/.cmd, local-run.sh/ps1/cmd, dmes-up.ps1/cmd)은 이번 범위 밖으로 남기고 갭으로 기록 (b) 네 파일군 전부 `.sh` 와 동시에 수정
- **택한 것**: (a)
- **근거**: spec.md·wbs.md·TRD.md 모두 `be-run.sh --mdm` 만 명시하고 ps1/cmd/local-run/dmes-up 은 언급이 없다. TSK-01-01 의 "기준선(오케스트레이터 측정)"에도 Windows 경로 검증이 없어 이번 Task 가 그 경로를 깨뜨렸는지조차 게이트로 확인할 수 없다 — 범위를 넓히면 검증 못 하는 변경이 늘어난다.
- **반려되면 재작업 방향**: `be-run.ps1`(§6.10 부록과 동일한 7곳: 머리 주석·플래그 파싱·색상·`$BePorts`·인자 매칭·오류 메시지)과 `local-run.sh`/`local-run.ps1`(모듈 화이트리스트 1곳씩)·`dmes-up.ps1`(포트 표·`$Modules`·`$BePorts` 3곳)을 `.sh` 와 동시에 고친다. `local-run.cmd`/`dmes-up.cmd` 는 각각의 `.ps1` wrapper 라 자체 수정 불필요.

### D4 — spec 제목의 "+ CI"가 의미하는 것
- **질문**: spec 제목의 "+ CI"를 새 CI 워크플로 파일 신설로 볼지, 기존 `testAll` 집계 등록으로 충분하다고 볼지?
- **선택지**: (a) `testAll`/`includedProjectNames` 등록 자체가 이 리포의 유일한 CI 게이트이므로 그것으로 충분 (b) 별도 CI 워크플로 파일 신설
- **택한 것**: (a)
- **근거**: `.github/workflows`, `Jenkinsfile`, `.gitlab-ci.yml` 리포 전체에 **0개**(확인 완료) — 이 표준 템플릿 저장소 자체가 외부 CI provider 파일을 갖고 있지 않다. `.git/hooks`(common dir 포함)에도 `.sample` 외 활성 훅이 없다 — `core.hooksPath` 미설정. dev-discipline 의 "G1~G4 훅"은 `/dflow-dev` 도구 자신의 push 래퍼이지 이 리포의 git 설정이 아니다. 따라서 이 리포에서 "CI" 가 가리킬 수 있는 유일한 기존 실체는 `testAll` 집계 태스크뿐이다.
- **반려되면 재작업 방향**: 신규 CI 워크플로 파일(예: `.github/workflows/backend-test.yml`)을 어느 provider 로 만들지부터 사람이 결정해야 한다(이 리포에 provider 선례가 전혀 없어 스캐폴드 Task 혼자 판단할 근거가 없음).

### D5 — 샘플 화면의 그룹·screenId·화면 설계 산출물(분석리포트 등 5종) 면제 여부
- **질문**: 스캐폴드 검증용 샘플 화면에 화면 설계 산출물 5종(분석리포트·기능·디자인·BPMN·정합체크)을 요구할지, 그룹·screenId 는 무엇으로 확정할지?
- **선택지**: (a) 그룹 `mdt`, screenId `mdmSample`, 화면 설계 산출물 5종은 면제(스캐폴드용 빈 화면이라 실제 업무 화면이 아님) (b) TRD §5 그룹 코드가 "가정"이므로 그룹 없이(`sample` 단독 톱레벨) 배치 (c) 이 Task 에서는 화면 자체를 만들지 않고 다음 Task 로 미룬다
- **택한 것**: (a)
- **근거**: spec.md·wbs.md acceptance 가 "샘플 빈 화면 1개가 m-mcm 포털에서 열린다"를 이 Task(TSK-01-01) 자체의 조건으로 못박아 (c)는 spec 위반이다. TRD §5 는 그룹 코드 표를 "가정(전사 아키텍처 설계에서 확정)"이라 적었지만 5개 후보 중 하나를 고르지 않으면 `pages/{group}/{screenId}/page.tsx` 규칙(TRD:75, 리포 전체 관례)을 지킬 수 없어 (b)는 규칙과 충돌한다. `mdt`(02 영역, 용어·도메인·컬럼·단위)를 고른 것은 TRD §5 표의 첫 항목이라는 것 외에 강한 근거는 없다 — **가장 임의적인 선택이라 재작업 위험이 가장 크다.** 화면 설계 산출물 5종은 RULE.md §"작업 분기"가 요구하는 것이 "MES 개발"(분기 3) 진입 조건이고, 이 Task 는 category=infra 로 그 분기 밖(스캐폴드)이라고 판단해 면제했다.
- **screenId 명명 재검토(재검증 시 추가 확인)**: `04-cases-checklist-menu.md` §11-Y 는 `mpp`/`mqc`/`mls`/`mas` 4모듈에 한해 "serviceId 는 모듈명 prefix 없는 단일 토큰"을 MUST 로 강제한다(예: `mlsPlateSlittingMgmt` 형태 금지). `mdmSample` 은 문자열 형태상 이 금지 패턴(`{module}{Screen}`)과 닮았다. 다만 이 규칙 표는 **`mdm` 을 아직 나열하지 않는다**(§13-3/§11-Y 원문에 mdm 행 없음, 재검증 grep 확인) — 즉 이번 Task 시점에는 문자 그대로는 위반이 아니다. `mdmSample` 에 붙은 것은 그룹(`mdt`)이 아니라 **모듈 접두어(`mdm`)** 다 — 즉 §11-Y 가 금지하는 "모듈명 prefix 부착형" 패턴과 문자 그대로 같은 모양이다. 그럼에도 이번엔 유지하기로 한 근거는 두 가지뿐이다: ① §11-Y/§13-3 원문 표에 `mdm` 이 아직 없다(재검증 grep 확인, 이번 Task 시점엔 문자 그대로 위반이 아니다), ② OBJECT_ID·screenId 는 전역에서 유일해야 하는데(§13-3 "screenId 정본" 규칙) 스캐폴드 검증용 이름을 `sample` 처럼 짧게 두면 다른 모듈의 향후 screenId 와 충돌할 위험이 더 크다. mdm 이 §11-Y 표에 추가되는 시점(전사 아키텍처 설계)에 이 이름이 재검토 대상이 될 수 있음을 명시해 둔다.
- **반려되면 재작업 방향**: 그룹 코드가 TSK-01-02(전사 아키텍처 설계)에서 `mdt` 가 아닌 다른 값으로 확정되거나 §11-Y 표에 mdm 이 추가돼 prefix 형 screenId 가 금지되면, `mdmSample` 의 그룹 폴더·FULL_SEQ·FE 경로 전부를 리네임한다(OBJECT_ID·componentPath·tsup entry·PAGE_REGISTRY 키 4곳 동시 변경, §5 불변 규칙 6 참고). 화면 설계 산출물이 필요하다고 판단되면 이 화면만 별도로 분기 1(MES 화면 설계)을 먼저 통과시킨 뒤 재작업한다.

### D6 — `wildfly`(JNDI) 프로파일에서 Flyway 를 켤지
- **질문**: 운영(wildfly/JNDI) 프로파일 부팅 시 Flyway 가 자동으로 마이그레이션을 적용하게 둘지, 스키마를 사전 관리 대상으로 보고 꺼 둘지?
- **선택지**: (a) `wildfly` 프로파일은 `spring.flyway.enabled: false`(사전 관리 스키마 전제, 운영 DBA 가 직접 마이그레이션 적용) (b) `wildfly` 도 부팅 시 자동 migrate 허용(`enabled: true`, `locations: classpath:db/migration/mdm/mssql`)
- **택한 것**: (a)
- **근거**: mcm 의 `application-wildfly.yml`(재검증 시 원문 재확인, `src/backend/mcm/api/src/main/resources/application-wildfly.yml:10-15`)이 `ddl-auto: none` + Flyway 를 아예 건드리지 않는 방식으로 "개발계/운영계 모두 스키마 사전 관리"를 전제하고 있다 — 유일한 wildfly 선례가 이미 (a) 쪽이다. 이번 Task 는 로컬에 MSSQL/WildFly 인스턴스가 없어 `local-db`·`wildfly` 두 프로파일 모두 **설정 리뷰로만** 검증 가능하고(TRD §12 인수 조건도 "로컬 SQLite 기동"만 실측 가능하다고 보는 것이 안전), 운영에서 스키마를 부팅이 자동으로 바꾸게 두는 것은 이 스캐폴드 Task 혼자 결정하기엔 파급이 크다.
- **반려되면 재작업 방향**: `application-wildfly.yml` 의 `spring.flyway.enabled` 를 `true` 로 바꾸고 `locations: classpath:db/migration/mdm/mssql` 를 추가한 뒤, 실제 WildFly/MSSQL 환경에서 부팅 1회로 V1 이 적용되는지 확인한다(로컬 환경엔 그 인스턴스가 없어 이번 Task 범위에서는 실측 불가).

### D7 — maru-mdm-engine 의 Java 패키지 root: `kr.dongkuk.maru.mdm.engine.*` vs `com.dongkuk.dmes.mdm.engine.*`

> **질문**: 엔진 jar 의 group/루트 패키지를 원천 설계 원문(`kr.dongkuk.maru.mdm`)대로 둘지, TRD 요약(`com.dongkuk.dmes.mdm`, 저장소 관례)으로 바꿀지 담당자가 확인해야 한다. 아래 재검증(Design 에이전트가 두 원문 파일을 직접 `sed -n`으로 다시 읽어 인용을 줄 단위로 재확인함)으로 결론은 유지했지만, 서버 패키지와 겹치는 이름을 굳이 원문대로 두는 것이 맞는지는 저장소 전역 일관성과 상충하는 트레이드오프라 담당자 확인을 남긴다.

- **선택지**: (a) 원천 설계(06-business-rule.md:453-461 「모듈 하나, 패키지 다섯」) 원문이 명시한 `kr.dongkuk.maru.mdm.engine.{expr,rule,domain,code,spi}` 를 그대로 쓴다 (b) TRD.md:18 요약이 적은 `com.dongkuk.dmes.mdm.engine.{expr,rule,domain,code,spi}`(저장소 관례, 11개 기존 모듈 전부와 일치)를 쓴다
- **택한 것**: (a) — §0·§2.2·§5·§6.1·§6.2·§6.4·§6.5 전부 이 값으로 작성했다.
- **(a) 근거**: 이 워크트리에서는 `docs/mdm/design` 심볼릭 링크가 없어 prd_ref 원문에 접근 못 한다(§0). 다만 링크 대상 디렉터리(`/Users/jji/project/mdm/docs/design/basic/`)가 워크트리 밖에 실재해 절대경로로 읽을 수 있다 — 2026-09-23 재검증 시 `grep -n` 으로 다시 확인: `01-mdm-overview.md:379-381`("엔진을 서버 안의 패키지가 아니라 별도 모듈 `maru-mdm-engine`으로 빌드해서 배포한다"), `06-business-rule.md:451-461`("모듈 하나, 패키지 다섯" — 다섯 패키지 전부 `kr.dongkuk.maru.mdm.engine.{expr,rule,domain,code,spi}` 로 명시). 원문은 두 가지를 명시적으로 정한다 — ① 기존 샘플 코드 `js/AstExporter.java` 의 패키지가 이미 `kr.dongkuk.maru.mdm.expr` 였고 이 모듈이 그 패키지를 그대로 옮겨 쓴다는 것, ② **"서버 애플리케이션과 패키지 이름이 겹치지 않게 모듈 패키지는 모두 `engine` 아래에 둔다"**(06-business-rule.md:453, 원문 그대로)는 명시적 설계 제약. PRD.md §2 규칙 1("영역 문서 02~06 이 우선한다")·규칙 3("01 은 출처일 뿐이고 02~06 이 조정한 내용이 우선한다")에 따라 영역 문서(06)의 이 명시적 결정이 TRD 요약보다 우선한다.
- **(b) 를 지지하는 반대 근거(기각하되 정직하게 남긴다)**: 리포의 다른 결정(PRD.md §2 규칙 6, `MD_UNIT` → `TB_MDM_UNIT`)이 보여주듯, 이 프로젝트는 원천 설계를 dmes-standard 저장소 관례로 의식적으로 바꿔 적는 선례가 있다(그때는 원천 설계 문서 자체도 2026-09-23 에 함께 개정됐다 — PRD.md:70). 리포의 기존 11개 모듈(mqc·mcm·mls·mpn·mpp·analog·localKafka·aps-core·mcm-core·cactus-core, oasis 계열 제외 전부)이 예외 없이 `com.dongkuk.dmes.*` 를 쓰는 저장소 전역 일관성도 (b) 를 지지한다.
- **(b) 를 기각한 이유**: 테이블명 rename 때는 원천 설계 문서 자체가 같은 날 함께 개정됐다는 명시적 실행 흔적이 있다(PRD.md:70 "원천 설계 문서·HTML 시안·sql 도 2026-09-23 에 TB_MDM_* 로 바꿨다"). 반면 엔진 패키지는 `06-business-rule.md` 가 지금도 `kr.dongkuk.maru.mdm.engine` 그대로다 — 즉 "의식적으로 다시 쓰기로 한 결정"이라는 증거가 없다. 더 결정적으로, **TRD 요약 (b) 는 원문이 요구한 제약을 실제로 어긴다**: `com.dongkuk.dmes.mdm.engine.*` 는 TRD.md:17 이 정한 mdm 서버 애플리케이션 자체의 패키지(`com.dongkuk.dmes.mdm.{group}.{screenId}`)의 문자 그대로의 하위 패키지이므로, 원문이 명시한 "서버 애플리케이션과 겹치지 않게"를 만족하지 못한다. TRD.md:5 가 스스로 "이 문서에 적은 명령은... 실행해 확인하지 않았다"고 밝힌 점도, 이 항목이 사람이 검토한 결정이 아니라 저장소 관례로의 추정 기입이었을 가능성을 뒷받침한다. `maru-mdm-engine` 이 사내 Maven 저장소로 별도 배포될 전제(TRD T5, 06 의존성 규칙 4 "jar는... 사내 Maven 저장소로 나간다")도, 이 jar 가 dmes-standard 특정적이지 않은 독립 group 을 갖는 편이 자연스럽다는 정황과 맞는다.
- **반려되면 재작업 방향**: (b)로 되돌릴 경우 §2.2 파일 경로(`kr/dongkuk/maru/mdm/engine/*` → `com/dongkuk/dmes/mdm/engine/*`), §5 불변 규칙 1·2 의 ArchUnit 허용/금지 패키지 문자열, §6.1 dependencySubstitution 모듈 좌표, §6.2 `api` 좌표, §6.4 `group`, §6.5 ArchUnit `importPackages`/`resideInAPackage` 문자열을 전부 되돌린다. Build 착수 전 패키지 root 하나만 고치는 것이라 코드가 없는 이 시점(Design 종료)에는 비용이 0에 가깝다 — Build 가 시작된 뒤에 뒤집히면 전체 파일 rename 비용이 든다. 그래서 Build Phase 시작 전에 이 결정만은 먼저 확인받기를 권한다.

### D8 — MSSQL(`local-db`/`wildfly`) 에서 다른 모듈과 Flyway 이력 테이블이 충돌하는가
- **질문**: mdm 의 `local-db`/`wildfly` 프로파일이 다른 모듈(특히 mcm)과 같은 MSSQL 물리 DB 를 공유할 때, Flyway 스키마 이력 테이블(`flyway_schema_history`)이 충돌해 `spring.flyway.table` 로 모듈별 이력 테이블명을 분리해야 하는가?
- **재검증(2026-09-23, 원문 직접 확인)**: `mcm/api/src/main/resources/application-local-db.yml:9-11`(`datasource.url: jdbc:sqlserver://${DB_HOST}:${DB_PORT:1433};databaseName=${DB_NAME}`) — `DB_HOST`/`DB_PORT`/`DB_NAME` 이 전부 값 없는 환경변수라 **운영자가 같은 값을 여러 모듈에 줄 경우 물리 DB 자체를 공유할 수 있다.** 다만 같은 파일 주석("biz — MCMAPUSER 스키마")과 `docs/guide/Common/Workspace-Structure.md` 의 사이트 모듈 분리 원칙에 따르면, 모듈마다 별도 DB 계정/스키마(mcm 은 `MCMAPUSER`)를 쓰는 것이 기존 관례다. Flyway 의 기본 이력 테이블(`flyway_schema_history`)은 **연결에 쓰는 스키마 안에 생성되므로**, mdm 이 MSSQL 자체 계정(가칭 `MDMAPUSER`, DB_USERNAME 환경변수로 주입)을 쓰면 물리 DB 를 공유해도 이력 테이블은 스키마 단위로 자연히 분리된다. `spring.flyway.table` 커스터마이즈 선례는 리포 어디에도 없다(재검증 grep 0건).
- **선택지**: (a) 커스터마이즈하지 않는다 — mdm 도 다른 모듈처럼 자체 DB 계정/스키마를 쓰는 것을 전제로 하고, 이력 테이블은 스키마 분리로 자동 해소된다고 본다 (b) 방어적으로 `spring.flyway.table: flyway_schema_history_mdm` 을 `local-db`/`wildfly` 프로파일에 명시해 스키마 공유 시나리오까지 대비한다
- **택한 것**: (a)
- **근거**: 재검증 결과 `local-db`/`wildfly`(MSSQL) 프로파일 자체를 실제로 가진 모듈은 **mcm 하나뿐**이다(mls·analog 는 SQLite 단일 프로파일이라 이 논의 대상이 아니다 — D8 최초 작성 시 "mls·analog 도 이 방식" 이라 적었던 것은 부정확한 서술이라 재검증 시 바로잡는다). 그 mcm 하나가 이력 테이블명 커스터마이즈 없이 계정/스키마 분리(`MCMAPUSER`)만으로 운영되고 있고, `spring.flyway.table` 커스터마이즈 선례는 리포 어디에도 없다. (b)를 기본값으로 넣으면 이 리포에 없는 새 관례를 mdm 혼자 시작하는 것이라 다른 담당자가 관례를 찾을 때 오히려 혼란을 준다. **전제 조건**: mdm 의 `local-db`/`wildfly` DB 계정(`DB_USERNAME`/JNDI 대상)의 기본 스키마가 `dbo` 가 아니라 mdm 전용 스키마(가칭 `MDMAPUSER`)여야 이 결론이 성립한다 — `application-local-db.yml`/`application-wildfly.yml` 배포 시 운영자가 이 전제를 지키는지 확인이 필요하다(§6.3 스니펫 주석에 명시). `local`(SQLite) 은 모듈별 파일 자체가 분리돼 있어 이 논의와 무관하다(§5 불변 규칙 5).
- **반려되면 재작업 방향**: `application-local-db.yml`/`application-wildfly.yml` 의 `spring.flyway` 블록에 `table: flyway_schema_history_mdm` 1행을 추가하고, §6.3 스니펫과 §4 수용 기준 매핑 1번(testAll)·2번(헬스체크)의 검증 문구에도 이력 테이블명을 반영한다.

### D9 — `testAll` 이 lib+api 분할 모듈의 서브프로젝트 테스트를 실제로 실행하는지(mdm 한정 방어 vs 리포 전체 원인 규명)

- **질문**: `testAll` 이 lib+api 분할 모듈의 서브프로젝트 테스트를 실제로 실행하지 않는다는 것이 확인됐다 — mdm 만 방어적으로 고치고 끝낼지, 리포 전체(기존 모듈)의 원인 규명·수정을 별도 과제로 분리할지 승인자가 정해야 한다.
- **확정 증거(코드 추론이 아니라 기존 산출물 실측, gradle 실행 없이 확인)**: 워크트리에 오케스트레이터가 이미 실행해 둔 `testAll` 결과 XML(`.issues` 의 "gradle-wrapper.jar 복사" 기록과 시점이 맞음, 전부 2026-09-23 생성)이 남아 있어 이것으로 확정했다 — `find src/backend -path '*/build/test-results/test/*.xml'` 결과가 **`aps-core`(1)·`cactus-core`(41)·`caravan-core`(13)·`caravan-hub`(33) 디렉터리에만 존재하고 `mqc`/`mpp`/`mls`/`mpn`/`mcm`/`localKafka`/`analog` 에는 0건**이며, 전체 `<testcase>` 원소 수를 세면 정확히 **386개** — state.json 의 `baseline.backend_testAll.tests: 386` 과 정확히 일치한다. 즉 기준선 386 은 전적으로 **단일-프로젝트 4개 빌드**(root 에 직접 `src/`가 있는 aps-core·cactus-core·caravan-core·caravan-hub)에서만 나왔고, `lib`/`api`(또는 `core`/`api`) 로 쪼개진 나머지 모듈들의 서브프로젝트 테스트는 `testAll` 을 통해 **단 한 번도 실행되지 않았다**. 구조적 근거: ① `mqc`(`src/backend/mqc/src` 없음)·`analog`(동일) 모두 루트에 소스가 없다. ② 두 모듈 다 루트 `build.gradle` 이 `plugins { id 'java' ... }` 를 subprojects 블록이 아니라 **직접** 적용해 루트 자신의(빈) `:test` 태스크를 갖지만, `subprojects` 의 `:lib:test`/`:api:test`(또는 `:core:test`)를 끌어오는 배선은 어디에도 없다. ③ `analog/build.gradle` 머리 주석(`// 사용 예: ./gradlew :core:test`, `./gradlew :api:test`)도 "서브프로젝트를 직접 지정해서 돌려라"를 안내한다. ④ `analog`·`mls` 는 `includedProjectNames` 배열 자체에도 없다(D3/§7 항목 6 과 별개 사실).
- **선택지**: (a) mdm 의 루트 `build.gradle` 에만 §6.1b 의 명시 집계 블록을 추가해 mdm 자신은 이 결함에서 벗어나고, 기존 mpn/mpp/mqc/mcm(+ includedProjectNames 밖의 mls/analog)의 수정은 별도 이슈로 분리해 이번 Task 범위 밖에 둔다 (b) 이번 Task 안에서 기존 6개 모듈의 `build.gradle` 도 함께 고쳐 리포 전체의 `testAll` 신뢰성을 바로잡는다 (c) mdm 도 mqc 를 문자 그대로 복제해 이 결함을 그대로 물려받는다(§6.1b 집계 블록을 넣지 않는다)
- **택한 것**: (a)
- **근거**: 이 Task 의 spec·수용 기준은 mdm 스캐폴드에 한정된다 — 기존 6개 모듈의 `testAll` 배선을 고치면 그 모듈들의 실제 테스트가 처음으로 도는 것이므로 기준선(386건) 자체가 큰 폭으로 바뀌는 별도 변경이다. 이 Task 하나로 조용히 끼워 넣으면 "기준선 대비 신규 실패 0" 판정이 다른 모듈들의 (지금까지 한 번도 실행된 적 없는) 테스트 실패까지 떠안게 돼 이 Task 의 책임 범위를 벗어난다(dev-discipline Verify 규율과 충돌). (c)는 확정된 결함을 알면서도 방치하는 것이라 §4 AC 1·2·6 을 거짓 통과시켜 기각한다. (a)가 이 Task 의 acceptance("mdm 포함으로 testAll 통과")를 실제로 만족시키면서 범위를 지킨다.
- **반려되면 재작업 방향**: (b)를 택하면 `mpn`/`mpp`/`mqc`/`mcm`/`mls`/`analog` 6개 모듈의 루트 `build.gradle` 에 동일한 서브프로젝트 test 집계 블록을 추가하고(`mls`/`analog` 는 `includedProjectNames` 자체에도 추가), 6개 모듈의 실제 테스트가 처음으로 `testAll` 에 편입되면서 총 tests 수·소요 시간·잠재적 기존 실패(지금까지 한 번도 실행되지 않아 숨어 있었을 수 있는 실패)가 드러날 것을 전제로 새 기준선을 다시 측정한다. 이 발견 자체는 이번 Task 완료 보고 시 issue-brief 로 정리해 별도 과제화할 것을 권한다(이미 이 design.md 가 근거 문서 역할을 한다).
