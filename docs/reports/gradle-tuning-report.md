# 빌드·테스트 부하 개선 보고서

2026-09-26 · @찌니

mdm 백엔드 테스트가 약 4배 빨라졌고, CPU·메모리 사용량은 절반 가까이 줄었습니다.

- 작업 브랜치: chore/gradle-tuning
- 팀장 검토를 거쳐 dev 에 머지되었습니다(머지 커밋 94583685).
- 테스트는 하나도 지우거나 건너뛰지 않았고, 기대값도 바꾸지 않았습니다.

## 한눈에 보는 결과

가장 큰 효과는 mdm/api 테스트에서 나왔습니다.

- 다른 팀원의 작업이 거의 없던 시간(부하 평균 1\~2)에 측정했습니다.
- 개선 전 dev 와 개선 후 브랜치를 같은 방법으로 비교했습니다.
- 테스트는 양쪽 모두 1060건이며, 모두 통과했습니다.

| 항목 | 개선 전 | 개선 후 | 변화 |
| --- | --- | --- | --- |
| 테스트 JVM 실행 시간 | 161초 | 41초 | 약 4배 빨라짐 |
| 전체 경과 시간 | 183초 | 49초 | 약 3.7배 빨라짐(아래 주의 참고) |
| CPU 사용 시간 | 182초 | 89초 | 51% 감소 |
| Spring 테스트 앱 기동 횟수 | 88회 | 39회 | 56% 감소 |
| 힙 사용량 최대 | 1.49GB | 0.77GB | 48% 감소 |
| 프로세스 메모리(RSS) 최대 | 2.27GB | 1.24GB | 45% 감소 |

표를 읽을 때 주의할 점이 있습니다.

- 개선 전 경과 시간에는 테스트 코드를 다시 컴파일한 시간이 포함되어 있습니다.
- 그래서 테스트 JVM 실행 시간(161초 → 41초)이 더 정확한 비교값입니다.

그 밖의 주요 효과는 다음과 같습니다.

- **백엔드 컴파일**: 빌드 캐시가 적중하면 CPU 사용 시간이 절반 이하로 줄었습니다(74초 → 35초).
- **프런트 m-mdm 테스트**
  - 개선 전: 부하가 높으면 성능 테스트가 자주 실패했습니다.
  - 개선 후: 같은 부하에서도 779건이 모두 통과합니다.
- **프런트 준비 빌드**: 필요한 패키지만 빌드하도록 바꿔, 44초 걸리던 빌드가 약 25초로 줄었습니다.
- **경로별 게이트**: 프런트 m-mdm 만 바뀌었다면 게이트가 25초 만에 끝납니다. 전체 게이트에서 프런트 부분에 걸리던 97초보다 약 4배 짧습니다.

## 왜 느렸나

팀원 여러 명이 같은 PC 에서 게이트를 동시에 실행해서 부하가 크게 올랐습니다.

- 게이트는 코드를 합치기 전에 돌리는 빌드·테스트 검사입니다.
- 부하 평균이 20\~30 까지 올랐습니다.
- 이 PC 는 10코어이므로, 코어 수의 2\~3배에 이르는 작업이 실행을 기다리고 있었다는 뜻입니다.

원인은 다섯 가지였습니다.

1. **Gradle 설정 파일이 없었습니다.**
   - 리포에도 사용자 홈에도 gradle.properties 가 없어서, 모든 설정이 기본값으로 동작했습니다.
   - 빌드 캐시가 꺼져 있어서, 워크트리마다 모든 모듈을 처음부터 컴파일했습니다.
   - 빌드 하나가 10개 코어를 모두 사용했습니다.
2. **테스트 JVM 이 최적화 컴파일러(C2 JIT)에 CPU 를 많이 썼습니다.**
   - 테스트는 금방 끝나기 때문에, 최적화된 코드가 쓰일 시간이 거의 없습니다.
   - 그런데도 최적화 컴파일 작업이 CPU 를 350%(코어 3.5개분) 가까이 사용했습니다.
3. **mdm/api 테스트가 클래스마다 Spring 애플리케이션을 새로 띄웠습니다.**
   - 테스트 클래스마다 자기 전용 DB 파일을 지정했습니다.
   - 그래서 Spring 이 이미 띄운 애플리케이션을 재사용하지 못했습니다.
   - 테스트 JVM 실행 시간의 약 70% 가 앱 기동에 쓰였습니다.
   - 띄운 애플리케이션이 메모리에 계속 쌓여서, 힙이 1536MB 인데도 메모리 부족(OOM)이 발생했습니다.
4. **시간을 재는 프런트 테스트가 다른 테스트와 CPU 를 다퉜습니다.**
   - "100ms 안에 끝난다"처럼 경과 시간을 확인하는 테스트가 있습니다.
   - 이런 테스트가 다른 테스트와 병렬로 실행되어, 부하가 높을 때마다 실패했습니다.
   - 그때마다 팀원은 테스트를 다시 실행하거나, 부하가 내려가기를 기다려야 했습니다.
5. **게이트가 필요 없는 작업까지 수행했습니다.**
   - 프런트 게이트는 m-mdm 이 쓰지 않는 라이브러리까지 포함해, 7개를 모두 빌드했습니다.
   - Gradle 은 테스트가 읽는 외부 파일을 알지 못했습니다. 그래서 "바뀐 것이 없으니 건너뛴다"는 판정을 믿을 수 없었습니다.
   - 결국 팀원들은 모든 모듈을 다시 컴파일하는 `--rerun-tasks` 옵션으로 테스트를 다시 실행했습니다.

## 백엔드 빌드 설정

Gradle 설정 파일을 만들고 테스트 JVM 옵션을 조정해, 빌드 하나가 PC 전체를 차지하지 않게 했습니다.

| 설정 | 바꾼 값 | 이유 |
| --- | --- | --- |
| 빌드 캐시(org.gradle.caching) | 끔 → 켬 | 워크트리가 달라도 입력이 같으면 컴파일 결과를 재사용한다 |
| 동시 작업 수(org.gradle.workers.max) | 10 → 3 | 빌드 하나가 코어를 모두 쓰지 않게 한다 |
| 데몬 대기 시간(org.gradle.daemon.idletimeout) | 3시간 → 10분 | 쉬고 있는 Gradle 프로세스가 메모리를 오래 차지하지 않게 한다 |
| 테스트 JIT(-XX:TieredStopAtLevel=1) | C1 까지만 | 짧게 끝나는 테스트에서 효과가 없는 최적화 컴파일을 생략한다 |
| 테스트 코드 캐시(-XX:ReservedCodeCacheSize) | 240MB | C1 만 쓰면 기본값이 48MB 로 줄어들므로, 원래 크기로 되돌린다 |
| mdm 테스트 힙(maxHeapSize) | 1536MB → 1GB | 구조를 개선한 뒤 힙 사용량이 0.64GB 로 줄었다 |
| mdm 테스트 컨텍스트 캐시 상한 | 32 → 4 | 띄워 둔 테스트 앱이 메모리에 쌓이지 않게 한다 |
| mdm 테스트 DB 연결 풀 | 10 → 2 | SQLite 는 한 번에 쓰기 하나만 처리하므로 2개로 충분하다 |

설정 파일은 여러 곳에 두었습니다.

- Gradle 은 실행한 최상위 빌드의 gradle.properties 만 읽습니다.
- 팀원들은 `cd src/backend/mdm && ../gradlew …` 처럼 모듈 폴더에서 직접 실행하기도 합니다.
- 그래서 최상위 폴더(src/backend)와, 모듈 폴더에서 단독으로 실행하는 사례가 확인된 모듈 9곳에 같은 내용을 두었습니다.

```properties
# src/backend/gradle.properties (같은 내용을 mdm 등 9개 모듈에도 둔다)
org.gradle.caching=true
org.gradle.workers.max=3
org.gradle.daemon.idletimeout=600000
```

테스트 JVM 옵션은 composite 빌드에 포함된 15개 모듈의 build.gradle 끝에 같은 블록으로 추가했습니다.

```groovy
allprojects {
    tasks.withType(Test).configureEach {
        // 테스트 결과는 빌드 캐시에 넣지 않는다
        outputs.doNotCacheIf('선언되지 않은 외부 입력에 기대는 테스트') { true }
        // C1 JIT 까지만 쓰고, 줄어드는 코드 캐시는 원래 크기로 둔다
        jvmArgs '-XX:TieredStopAtLevel=1', '-XX:ReservedCodeCacheSize=240m'
    }
}
```

테스트 결과를 빌드 캐시에서 제외한 이유는 다음과 같습니다.

- 일부 테스트가 작업 트리 밖의 파일과 환경 변수를 읽습니다.
- 일부 모듈은 값이 계속 바뀌는 SQLite 파일(../data/\*.db)을 씁니다.
- 이런 테스트를 캐시하면, 다른 워크트리의 "통과" 기록이 실제 실패를 가릴 수 있습니다.
- 컴파일 같은 나머지 작업은 그대로 캐시합니다.

이 설정만 적용했을 때 얻은 효과는 다음과 같습니다.

- mdm/api 테스트: 경과 시간은 거의 같았지만, CPU 사용 시간은 268초에서 201초로 25% 줄었습니다.
- 컴파일: 캐시가 적중하면 CPU 사용 시간이 절반 이하로 줄었습니다(74초 → 35초).

## mdm 테스트 구조 개선

테스트 클래스들이 Spring 테스트 앱을 함께 쓰도록 바꿨습니다. 이번 작업에서 효과가 가장 컸던 변경입니다.

### 무엇이 문제였나

- Spring 은 설정이 같은 테스트끼리는 이미 띄운 앱(컨텍스트)을 재사용합니다.
- 그런데 mdm 테스트는 클래스마다 자기 DB 파일을 `@DynamicPropertySource` 로 지정했습니다.
- 이 메서드가 클래스마다 다르면, Spring 은 "설정이 다르다"고 판단해 앱을 새로 띄웁니다.
- 그래서 93개 클래스 중 73개가 각자 앱을 띄웠습니다.

### 어떻게 바꿨나

공통 기반 클래스 `AbstractMdmSharedDbTest` 를 만들고, 테스트 클래스가 이를 상속하게 했습니다.

```java
public abstract class AbstractMdmSharedDbTest {

    // 모든 하위 클래스가 이 메서드 하나를 물려받는다 → Spring 이 같은 설정으로 본다
    @DynamicPropertySource
    static void mdmSharedDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MdmSharedTestDb::url);
    }

    // 클래스가 시작할 때마다 DB 와 테스트용 가짜 빈을 처음 상태로 되돌린다
    @BeforeAll
    protected static void resetMdmSharedDb(@Autowired ApplicationContext context) {
        MdmSharedTestDb.resetForTestClass(context);
    }
}
```

각 테스트 클래스에서는 DB 를 지정하던 코드를 지우고, 기반 클래스 상속만 추가했습니다. 예를 들어 `RuleMngServiceTest` 는 다음과 같이 바뀌었습니다.

```diff
 @SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
 @ActiveProfiles("local")
 @Import(DmeTestSupport.Config.class)
-class RuleMngServiceTest {
-
-    @TempDir
-    static Path tempDir;
+class RuleMngServiceTest extends AbstractMdmSharedDbTest {

     @Autowired
     RuleMngService service;
 ...
-    @DynamicPropertySource
-    static void overrideDatasource(DynamicPropertyRegistry registry) {
-        Path dbFile = tempDir.resolve("mdm-rule-mng-test.db");
-        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
-    }
```

### 테스트끼리 값이 섞이지 않게 한 방법

앱을 함께 쓰면 앞 클래스가 남긴 데이터가 뒤 클래스에 보일 수 있습니다. 그래서 클래스가 시작할 때마다 다음 작업을 수행합니다.

- DB 의 테이블·트리거·뷰를 모두 지우고, Flyway 마이그레이션을 다시 적용합니다.
- 테스트용 가짜 사용자·시계처럼 상태가 바뀌는 빈 5종을 처음 상태로 되돌립니다.
- 앱이 기동할 때 DB 에서 미리 읽어 두는 용어 추천 캐시를 다시 불러옵니다.
- 초기화는 48회를 합쳐도 3.6초(1회 약 0.08초)입니다. 앱을 한 번 띄우는 시간(1\~2초)보다 훨씬 짧습니다.

테스트 클래스의 실행 순서를 무작위로 섞어 다시 실행했고, 모두 통과했습니다. 실행 순서에 의존하는 테스트가 없다는 뜻입니다.

### 단계별 효과

**단계별 앱 기동 횟수와 메모리** (heavy.sh 슬롯 안 --no-daemon 실측 · 2026-09-26 03:08~03:16 · 부하 8~21)

| 단계 | 앱 기동 횟수 | 힙 최대 | RSS 최대 |
|---|---|---|---|
| 개선 전 | 73회 | 1.29GB | 1.85GB |
| 캐시 4·풀 2 | 73회 | 0.99GB | 1.45GB |
| 공유 테스트 DB | 36회 | 0.64GB | 1.07GB |

- 1단계(캐시 상한 4·DB 연결 풀 2)만으로도 메모리가 줄었습니다. 띄워 둔 앱이 쌓이지 않기 때문입니다.
- 2단계(공유 테스트 DB)에서 기동 횟수 자체가 절반으로 줄었습니다.
- 메모리 사용량이 줄어서 테스트 힙을 1536MB 에서 1GB 로 낮췄습니다. 768MB 에서도 통과했지만, 여유를 두어 1GB 로 정했습니다.

다음 클래스는 공유 DB 로 옮기지 않았습니다.

- 마이그레이션 자체를 검증하는 `*MigrationTest`
- 그 클래스만의 속성이나 `@Import` 설정을 쓰는 테스트
- 클래스마다 클라이언트 키가 다른 HTTP 테스트(`*OasisHttpTest` 등)

## 테스트 입력 선언

테스트가 읽는 외부 파일을 Gradle 에 입력으로 선언해서, "바뀐 것이 없으면 건너뛴다"는 판정을 믿을 수 있게 했습니다.

### 왜 필요했나

- Gradle 은 입력이 바뀌지 않은 테스트를 다시 돌리지 않습니다(UP-TO-DATE).
- 그런데 일부 테스트는 다른 모듈의 파일을 직접 읽었습니다.
- Gradle 은 이 파일을 모르므로, 파일이 바뀌어도 테스트를 건너뛰었습니다.
- 그래서 팀원들은 결과를 믿지 못하고, 모든 모듈을 다시 컴파일하는 `--rerun-tasks` 옵션을 썼습니다.

### 선언한 입력

| 테스트 | 읽는 파일·값 |
| --- | --- |
| DmdScreenMessageParityTest | 프런트 m-mdm 의 화면 메시지 파일(messages.ts) |
| MdmOasisActionVocabularyTest | mcm 의 메뉴·버튼 시드(DataInitializer.java) |
| RuleAnalysisCorpusTest | maru-mdm-engine 의 분석 코퍼스(analysis-corpus.json) |
| NoopTermEmbeddingEncoderTest | mdm api 모듈의 application.yml |
| HTTP·보안 테스트 여러 개 | 환경 변수 BACKEND\_CLIENT\_KEY, CACTUS\_JWT\_SECRET |

### 코드 예시

```groovy
// src/backend/mdm/api/build.gradle
tasks.named('test') {
    // 파일 내용이 바뀌면 테스트를 다시 돌린다(경로는 상대 경로로만 비교)
    inputs.files(rootProject.file('../../frontend/m-mdm/pages/dmd/dataItemMng/messages.ts'))
            .withPropertyName('mdmScreenMessages').withPathSensitivity(PathSensitivity.RELATIVE)
    // 환경 변수는 값 대신 SHA-256 을 넣는다(비밀값을 실행 이력에 남기지 않는다)
    inputs.property('env.BACKEND_CLIENT_KEY.sha256', rootProject.mdmEnvFingerprint.call('BACKEND_CLIENT_KEY'))
}
```

### 확인 결과

- 아무것도 바꾸지 않고 다시 실행하면 lib·api 테스트를 모두 건너뜁니다(6초).
- messages.ts 를 바꾸면 api 테스트만 다시 실행됩니다. 이때 Gradle 은 다시 실행한 이유로 바뀐 입력의 이름(mdmScreenMessages)을 출력합니다.
- 코퍼스 파일을 바꾸면 lib 테스트만 다시 실행됩니다.
- 환경 변수 입력도 같은 방식으로 선언했지만, 실제로 실행해서 확인하지는 않았습니다.

## 프런트 테스트·빌드

프런트에서는 "부하 때문에 실패하는 테스트"와 "필요 없는 빌드"를 줄였습니다.

### 성능 테스트 분리

- 시간을 재는 테스트 3개(evalex-perf, sections-render, transfer)를 따로 묶었습니다.
- 이 묶음은 프로세스 하나에서 파일을 차례로 실행합니다. 그래서 다른 테스트와 CPU 를 다투지 않습니다.
- 기준값(100ms · 200ms · 5초)과 테스트 수는 그대로입니다.

```ts
// src/frontend/m-mdm/vitest.perf.config.ts
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: PERF_TEST_FILES,          // 성능 테스트 3개만
    exclude: configDefaults.exclude,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },  // 프로세스 하나
    fileParallelism: false,            // 파일을 차례로
    maxWorkers: 1,
  },
});
```

`pnpm --filter @dk-oasis/m-mdm test` 는 두 묶음을 차례로 실행하고, 마지막에 합계를 한 줄로 출력합니다.

```text
[m-mdm test 합계] Test Files 85 · Tests 988 (passed 988 · failed 0 · skipped 0) — 일반 + 성능 스위트
```

- vitest 요약은 묶음마다 한 번씩, 모두 두 번 출력됩니다. 테스트 총수는 이 합계 줄에서 확인합니다.
- 이전: 부하 속에서 evalex-perf 1건이 실패했습니다(779건 중 778건 통과).
- 개선: 같은 부하에서 779건이 모두 통과했습니다.

### 필요한 패키지만 빌드

- 이전 게이트는 `pnpm build:libs` 로 라이브러리 7개를 모두 빌드했습니다.
- m-mdm 이 실제로 쓰는 패키지는 shared 하나뿐입니다.
- 그래서 m-mdm 이 의존하는 패키지만 빌드하는 명령으로 바꿨습니다.

```bash
# 이전
cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test
# 개선(새 Task 부터)
cd src/frontend && pnpm --filter "@dk-oasis/m-mdm^..." build && pnpm --filter @dk-oasis/m-mdm test
```

**프런트 게이트 시간** (heavy.sh 슬롯 안 실측 · 2026-09-26 · 부하 8~28)

| 항목 | 이전 | 개선 |
|---|---|---|
| 준비 빌드 | 44초 | 25초 |
| m-mdm 만 바뀐 게이트 | 97초 | 25초 |

### 그 밖의 설정

- **vitest 워커 제한**: m-mdm 과 shared 의 병렬 프로세스 수를 기본 9개에서 4개로 줄였습니다. 환경 변수 `VITEST_MAX_WORKERS` 로 더 줄일 수 있습니다.
- **타입 선언 파일 생성 끄기**: `TSUP_DTS=0` 을 주면 타입 선언 파일(.d.ts)을 만들지 않습니다. 이때 의존 빌드 시간이 25.5초에서 1초로 줄었습니다.
  - 단, lint 가 들어간 게이트에서는 쓰지 않습니다. m-mdm 의 타입 검사가 shared 의 .d.ts 를 읽기 때문입니다.
- **E2E 워커 1개**: Playwright 의 기본 워커 수를 1로 정했습니다. 여러 워커가 동시에 로그인하면서 SQLite 잠금 오류(SQLITE\_BUSY)가 나던 문제를 막기 위해서입니다. E2E 는 이번 작업에서 실행하지 않았습니다.

## 게이트 대응표와 문서 규칙

바뀐 경로에 맞는 게이트만 돌리도록 대응표를 만들고, 팀원이 지킬 규칙을 문서에 적었습니다.

### 게이트 대응표(.dflow-gates)

- 리포 최상위에 둔 파일입니다. 한 줄에 "바뀐 경로"와 "실행할 명령"을 탭으로 나눠 적습니다.
- 여러 줄이 맞으면 먼저 나온 줄이 적용됩니다. 그래서 구체적인 경로를 위에 둡니다.
- 대응표에 없는 경로가 바뀌면 전체 게이트(full)를 돌립니다.
- 여러 모듈이 의존하는 공용 모듈(cactus-core, mcm-core 등)은 일부러 적지 않았습니다. 이런 모듈이 바뀌면 안전하게 전체 게이트가 실행됩니다.

```text
# .dflow-gates (발췌, <경로><TAB><명령>)
prepare	cd src/frontend && pnpm --filter "@dk-oasis/m-mdm^..." build
docs/	-
src/frontend/m-mdm/pages/dmd/dataItemMng/messages.ts	(m-mdm test·lint) && (mdm api test)
src/backend/maru-mdm-engine/	(엔진 test + mdm test) && (m-mdm test)
src/backend/mdm/	cd src/backend && ./gradlew :mdm:test ... && (OASIS 계약 검사)
src/frontend/m-mdm/	cd src/frontend && pnpm --filter @dk-oasis/m-mdm test && pnpm --filter @dk-oasis/m-mdm lint
```

- 한 모듈의 파일을 다른 모듈의 테스트가 읽는다면, 그 파일이 바뀔 때 읽는 쪽 테스트도 함께 실행합니다. 예를 들어 엔진이 바뀌면 m-mdm 프런트 테스트도 실행됩니다.

| 바뀐 경로 | 걸린 시간 | 비고 |
| --- | --- | --- |
| 전체 게이트(full) | 209초 | testAll 112초 + 프런트 97초 |
| src/frontend/m-mdm/ | 25초 | full 의 프런트 부분보다 약 4배 짧다 |
| src/backend/mdm/ | 96초 | testAll(112초)과 차이가 작다. testAll 은 모듈을 병렬로 실행하는데, 그중 mdm 이 가장 오래 걸리기 때문이다 |

### 문서에 적은 규칙

- **프런트 로컬 규칙(Local-Rules.md §2-1)**
  - 단위 게이트는 의존 패키지만 빌드합니다.
  - 새 Task 부터 적용합니다. 이미 기준선을 측정한 Task 는 도중에 명령을 바꾸지 않습니다.
  - m-mdm 테스트 총수는 `[m-mdm test 합계]` 줄에서 확인합니다.
- **백엔드 구현 가이드(§10.1.1)**
  - 새 mdm Spring 테스트는 `AbstractMdmSharedDbTest` 를 상속합니다.
  - 상태가 바뀌는 테스트용 가짜 빈은 `SharedContextResettable` 을 구현합니다.
  - 예외: 마이그레이션 테스트, 고유 속성·`@Import` 를 쓰는 테스트, 클라이언트 키가 다른 HTTP 테스트

## 작업 중 만난 문제와 해결

작업 중에 테스트가 두 번 실패했습니다. 두 번 모두 테스트 내용과 기대값은 그대로 두고, 초기화 코드와 JVM 설정을 고쳐 해결했습니다.

### 1. DB 초기화가 아무것도 지우지 않았다(261건 실패)

- **증상**: 공유 DB 를 처음 적용했을 때 865건 중 261건이 실패했습니다. 대부분 외래키(FK) 위반이었습니다.
- **원인**: Flyway 의 `clean()` 이 이 SQLite 환경에서 "지웠다"는 로그만 남기고, 실제로는 아무것도 지우지 않았습니다. 그래서 앞 클래스의 데이터가 그대로 남아 있었습니다.
- **해결**: 연결 하나에서 외래키 검사를 잠시 끄고, 뷰·트리거·테이블을 직접 지운 뒤 마이그레이션을 다시 적용했습니다.

```java
statement.execute("PRAGMA foreign_keys = OFF");
// sqlite_master 에서 뷰 → 트리거 → 테이블 순으로 DROP
statement.execute("PRAGMA foreign_keys = ON");
context.getBean(Flyway.class).migrate();
```

### 2. 테스트 JVM 의 코드 캐시가 모자랐다(testAll 에서 6건 실패)

- **증상**: dev 의 최신 변경을 반영한 뒤, testAll 에서 `DmeOasisHttpTest` 6건이 실패했습니다. 오류 메시지는 `Out of space in CodeCache for adapters` 였습니다.
- **원인**: 첫 단계에서 넣은 C1 전용 설정(`-XX:TieredStopAtLevel=1`)이었습니다.
  - 이 설정을 주면 JVM 이 코드 캐시 기본값을 240MB 에서 48MB 로 줄입니다.
  - 테스트가 1060건으로 늘어나자 이 한도에 도달했습니다.
- **해결**: 15개 모듈의 테스트 옵션에 코드 캐시 240MB 를 명시했습니다. 다시 돌린 testAll 은 통과했습니다.

```groovy
jvmArgs '-XX:TieredStopAtLevel=1', '-XX:ReservedCodeCacheSize=240m'
```

## 측정 방법과 한계, 남은 과제

수치는 모두 실제로 측정한 값입니다. 다만 다른 팀원의 작업 때문에 측정값이 흔들렸습니다.

### 측정 방법

- 모든 측정은 이 PC 의 팀원들이 함께 쓰는 "무거운 명령 슬롯"(heavy.sh) 안에서 실행했습니다.
- Gradle 을 `--no-daemon` 으로 실행해서, 테스트 프로세스의 CPU 시간까지 `/usr/bin/time` 에 집계되게 했습니다.
- 힙 사용량은 테스트 JVM 을 1초마다 `jstat` 으로 샘플링한 최댓값입니다.
- 앱 기동 횟수는 테스트 결과 XML 의 "Started … in N seconds" 줄을 센 값입니다.
- 측정값 옆에는 그때의 부하 평균을 함께 기록했습니다.

### 한계

- 경과 시간과 CPU 시간은 부하에 따라 크게 흔들렸습니다. 같은 설정이 부하 5 에서는 129초, 부하 10 에서는 185초로 측정되기도 했습니다.
- 그래서 기동 횟수·메모리·테스트 JVM 시간을 주 근거로 삼았습니다.
- 워크트리 사이의 빌드 캐시 적중은 측정하지 못했습니다. 다른 워크트리는 건드리지 않기로 했기 때문입니다.
- E2E 워커 설정과 환경 변수 입력 선언은 실행으로 확인하지 않았습니다.

### 남은 과제

- **클래스 실행 순서 정렬**: 공유 앱 기동 12회 중 약 4회는 캐시 상한(4개)에 밀려난 앱을 다시 띄운 것입니다. 설정이 같은 클래스를 이어서 실행하면 기동 횟수를 더 줄일 수 있습니다.
- **다른 모듈의 선언되지 않은 입력**: 이번에는 mdm 모듈만 조사했습니다.
- **테스트 결과 캐시**: mqc·mpn 등이 내용이 바뀌는 SQLite 파일을 쓰는 동안에는, 테스트 결과를 계속 캐시에서 제외해야 합니다.
- **게이트 명령의 JDK 경로**: 대응표 명령에 이 PC 의 JDK 21 경로가 적혀 있어서, 경로가 다른 PC 에서는 그대로 실행되지 않습니다. PC 마다 경로를 따로 받는 방식이 필요합니다.

## 커밋 목록

chore/gradle-tuning 브랜치의 커밋입니다. 최신 커밋이 위에 있으며, 머지 커밋은 목록에서 뺐습니다.

| 커밋 | 내용 |
| --- | --- |
| edac8c76 | 테스트 JVM 코드 캐시 240MB 명시(testAll 실패 수정) |
| 750fd3e9 | dev 에서 새로 들어온 mdm 테스트 13개를 공유 테스트 DB 로 이전 |
| 5fb1b997 | 백엔드 가이드에 "새 mdm Spring 테스트는 공유 DB 기반 클래스 상속" 규칙 추가 |
| 3b41595e | 게이트 대응표 .dflow-gates 추가 |
| 9c5dfacf | vitest 워커 4 · tsup .d.ts 스위치 · playwright 워커 1 |
| 1e35cd85 | mdm 테스트 외부 입력 선언 · 테스트 힙 1GB |
| d767d3f3 | 공유 테스트 DB 기반 클래스로 Spring 테스트 앱 재사용(49개 클래스) |
| 466786f4 | mdm 테스트 컨텍스트 캐시 상한 4 · DB 연결 풀 2 |
| daff3abd | 프런트 규칙에 "단위 게이트는 의존 패키지만 빌드" 추가 |
| 3acdba9b | m-mdm 성능 테스트를 별도 묶음으로 분리 |
| 7c12e49b | Gradle 빌드 캐시 · 워커 3 · 테스트 JVM C1 적용 |

## 다른 컴퓨터에서 똑같이 적용하려면

설정 대부분은 리포에 커밋되어 있습니다. 그래서 dev 브랜치를 받으면 그대로 적용됩니다. 다만 PC 마다 다른 값 몇 가지는 직접 맞춰야 합니다.

### 1. 코드를 받으면 자동으로 적용되는 것

- Gradle 설정(gradle.properties 10곳)과 테스트 JVM 옵션(build.gradle 15곳)
- mdm 공유 테스트 DB 기반 클래스와 테스트 입력 선언
- vitest 성능 테스트 분리·워커 제한, tsup·Playwright 설정
- 게이트 대응표(.dflow-gates)와 문서 규칙

```bash
git fetch origin
git switch dev
git pull
```

### 2. 미리 설치할 도구

| 도구 | 버전 | 확인 방법 |
| --- | --- | --- |
| JDK | 21 | `java -version` |
| Gradle | 9.3.1(wrapper 가 자동으로 내려받음) | `./gradlew --version` |
| pnpm | 10.30.3(package.json 의 packageManager) | `corepack enable` 후 `pnpm -v` |
| Python | 3(OASIS 계약 검사용) | `python3 --version` |

- Windows 에서는 게이트 명령과 heavy.sh 를 Git Bash 에서 실행합니다.

### 3. PC 마다 맞춰야 하는 값

| 항목 | 이 PC 의 값 | 다른 PC 에서 할 일 |
| --- | --- | --- |
| JDK 21 경로 | /opt/homebrew/opt/openjdk@21/…(Apple Silicon Mac, Homebrew) | 대응표 명령에 이 경로가 적혀 있다. 경로가 다르면 그 PC 의 JDK 21 경로로 바꿔 실행한다 |
| Gradle 동시 작업 수 | 3(10코어 PC 를 여럿이 함께 쓰는 기준) | 혼자 쓰는 PC 라면 사용자 홈 설정으로 늘린다(아래 예시) |
| vitest 워커 수 | 4 | 환경 변수 VITEST\_MAX\_WORKERS 로 바꾼다 |
| 무거운 명령 슬롯(heavy.sh) | dflow-dev 스킬 안의 스크립트(wbs-web 리포를 심볼릭 링크로 연결) | dflow 스킬을 같은 방식으로 연결한다. 슬롯 수는 RAM 8GB 당 1개가 기본이며, DFLOW\_HEAVY\_SLOTS 로 바꾼다 |
| 빌드 캐시 | \~/.gradle/caches 아래(PC 마다 따로) | PC 사이에는 공유되지 않는다. 첫 빌드는 캐시가 비어 있어 느리고, 두 번째 빌드부터 빨라진다 |
| 테스트용 환경 변수 | BACKEND\_CLIENT\_KEY, CACTUS\_JWT\_SECRET | 값은 PC 마다 달라도 된다. 값이 바뀌면 관련 테스트가 다시 실행될 뿐이다 |

사용자 홈의 Gradle 설정은 리포의 gradle.properties 보다 우선합니다.

- 그래서 리포 파일을 고치지 않고도, 그 PC 에서만 값을 바꿀 수 있습니다.
- 리포의 gradle.properties 는 고치지 않습니다. 고치면 모든 팀원의 PC 에 적용됩니다.

```properties
# ~/.gradle/gradle.properties (Windows: %USERPROFILE%\.gradle\gradle.properties)
# 16코어 PC 를 혼자 쓰는 경우의 예
org.gradle.workers.max=8
```

```bash
# vitest 워커를 이번 실행에서만 2개로 줄이는 예
VITEST_MAX_WORKERS=2 pnpm --filter @dk-oasis/m-mdm test
```

### 4. 처음 한 번 확인하기

1. 프런트 의존성을 설치합니다.
2. 백엔드 mdm 테스트를 실행하고, 모두 통과하는지 확인합니다.
3. 같은 명령을 한 번 더 실행합니다. 입력이 그대로이므로 테스트를 건너뛰고(UP-TO-DATE) 몇 초 안에 끝나야 합니다.
4. 프런트 m-mdm 테스트를 실행하고, 합계 줄에서 failed 0 을 확인합니다.

```bash
# 1단계
cd src/frontend && pnpm install
# 2·3단계: JAVA_HOME 에는 그 PC 의 JDK 21 경로를 넣는다
cd ../backend
JAVA_HOME=/path/to/jdk-21 ./gradlew :mdm:test --no-daemon --console=plain
# 4단계
cd ../frontend
pnpm --filter "@dk-oasis/m-mdm^..." build
pnpm --filter @dk-oasis/m-mdm test
```

- 실행이 느리면 다른 무거운 작업이 동시에 돌고 있는지부터 확인합니다(`uptime` 의 부하 평균).
- 이 보고서의 수치는 10코어 Mac 에서 잰 값입니다. PC 사양이 다르면 절대 시간은 달라지지만, 앱 기동 횟수(88회 → 39회)는 같아야 합니다.
