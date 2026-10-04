# scripts/build-verify: 의존성 해석 결과·빌드 설정 불변 판정 도구

빌드 파일을 정리하는 커밋(버전 카탈로그 도입, convention plugin 으로 옮기기, 버전 통일 등)의 앞뒤에서
"해석 결과와 빌드 설정이 바뀌지 않았다"를 **diff 0** 으로 보이기 위한 덤프·비교 도구다.
2차 빌드 정리(2026-10, ① 카탈로그·③ build-logic·C1·C2·② mybatis 통일)의 판정에 썼다.

| 파일 | 하는 일 |
|---|---|
| `dump-deps.sh` | `src/backend` 의 included build 모듈마다 gradle 을 1회 돌려 덤프를 남긴다 |
| `dump-deps.init.gradle` | 해석 가능한 모든 구성의 `dependencies` 보고("선언 -> 해석")와 buildscript classpath |
| `dump-settings.init.gradle` | 플러그인·java·extensions·카탈로그 확장·ext·저장소·Test·JavaCompile·jar/war/bootJar/bootWar·JavaExec·구성 선언 |
| `compare.sh` | 두 덤프 폴더 비교(요약, 허용 차이 줄 거르기, `--flat`) |
| `allow-cat1.txt`, `allow-logic3.txt`, `allow-j4.txt` | 2차(2026-10) 판정에 쓴 허용 차이 패턴(아래 §3) |
| `known-errors-15.txt` | 2차(2026-10) 판정에 쓴 15개 전체 덤프의 알려진 `_errors.txt`(caravan-hub 단독 해석 불가, §4) |

## 1. 덤프: `dump-deps.sh`

```bash
# 이 스크립트가 든 저장소의 src/backend, 모듈 15개 전부
scripts/build-verify/dump-deps.sh <출력폴더>

# 다른 워크트리를 뜬다(BACKEND 는 <리포>/src/backend)
BACKEND=<다른 워크트리>/src/backend scripts/build-verify/dump-deps.sh <출력폴더>

# 일부 모듈만
scripts/build-verify/dump-deps.sh <출력폴더> mpn mdm
```

- 출력 폴더는 비어 있거나 없어야 한다. 남은 파일이 diff 를 더럽히지 않게 거절하며, 지우지는 않는다.
- 기본 모듈 15개는 루트 `src/backend/settings.gradle` 의 `includeBuild` 목록과 같다.
  data-migration 은 includeBuild 도 빌드 파일도 없어 빠진다. oasis 는 cactus-core 의 하위 프로젝트로 나타난다.
- 모듈마다 `cd <BACKEND>/<모듈> && ../gradlew -q --max-workers=2 --console=plain --continue --no-configuration-cache …` 로 1회 돈다.
  그 모듈이 루트 빌드가 되며, 그 모듈이 includeBuild 하는 다른 모듈은 덤프하지 않는다.
- 환경은 `env -i` 로 비우고 다음만 넘긴다. 그래서 `CI`·`BACKEND_CLIENT_KEY`·`CACTUS_JWT_SECRET`·`MDM_EMBEDDING_MODEL_DIR`·`NEXUS_*` 는 빠진다.
  - 언제나: `HOME PATH USER LOGNAME TMPDIR`, `LANG/LC_ALL=en_US.UTF-8`, `TERM=dumb`, `DMES_TEST_SLOTS`(아래)
  - 호출 환경에 있을 때만: `JAVA_HOME`, `DFLOW_HEAVY_DIR`, `DFLOW_HEAVY_SLOTS`, `GRADLE_USER_HOME`, `CLAUDE_PID`
  - `JAVA_HOME` 이 없으면 PATH 의 java 를 쓰고, heavy 변수가 없으면 gradlew 가 감싸는 heavy.sh 의 기본값(`~/.dflow/locks/heavy`, 칸 수는 RAM 기준)을 쓴다. 넘긴 `JAVA_HOME` 은 `_meta.txt` 의 `java-home` 줄에 남는다.
- 전용 heavy 칸으로 돌리는 예(값은 PC·작업마다 바꾼다):
  ```bash
  JAVA_HOME=<JDK 21 경로> \
  DFLOW_HEAVY_DIR=$HOME/.dflow/locks/heavy-<칸 이름> DFLOW_HEAVY_SLOTS=1 \
    scripts/build-verify/dump-deps.sh <출력폴더> mpn
  ```
  `<출력폴더>.logs/<모듈>.stderr` 의 `HEAVY_SLOT slot-1 k=1` 줄로 그 칸을 잡았는지 확인할 수 있다.
- `DUMP_DMES_TEST_SLOTS=<0 이상 정수>`(기본 0): gradle 에 넘길 `DMES_TEST_SLOTS` 값이며, `_meta.txt` 의 `test-slots` 줄에 남는다.
  - 0 이면 `src/backend/gradle/test-slot.gradle` 이 BuildService 등록을 건너뛰므로 Test 에 슬롯 흔적이 없다.
  - test-slot 적용 위치를 옮기는 변경은 양쪽을 `DUMP_DMES_TEST_SLOTS=2` 로 한 번 더 떠서 비교한다.
    기대 줄은 `requiredServices = [dmesTestSlot-<rootProject 이름>]` 이고, `actions` 가 0 일 때보다 2 많다.
  - 2 를 줘도 덤프 중에 슬롯을 잡지 않는다. 슬롯 잡기는 Test 의 doFirst 안에서만 일어나는데, 덤프는 Test 를 실행하지 않는다.
- `DUMP_GRADLE_ARGS='--no-daemon'` 처럼 gradle 인자를 덧붙일 수 있다(결정성 확인용).
- 경로는 `<BACKEND>`·`<REPO>`·`<GRADLE_USER_HOME>`·`~` 로 바꾼다. 그래서 워크트리가 달라도 내용이 같으면 출력이 같다.
- 종료코드는 끝까지 돌았고 `_errors.txt` 가 비어 있으면 `0`, `_errors.txt` 에 무언가 있으면 `1`, 사용 오류(인자 없음, BACKEND 없음, 출력 폴더가 비어 있지 않음)면 `2` 다.

출력 구조는 다음과 같다. `<프로젝트>` 는 `:` 가 `_root`, `:api` 가 `api`, `:a:b` 가 `a_b` 다.

```
<out>/_errors.txt                      비어 있어야 정상(gradle 실패·누락 파일·' FAILED'·'!ERROR'·'<error ' 표시)
<out>/_projects.txt                    "<모듈> <프로젝트 경로>" 정렬
<out>/<모듈>/deps/<프로젝트>/<구성>.txt   canBeResolved 인 모든 구성의 dependencies 보고
<out>/<모듈>/buildEnvironment/<프로젝트>.txt
<out>/<모듈>/settings/_settings.txt, settings/<프로젝트>.txt
<out>/<모듈>/configurations/<프로젝트>.txt
<out>.logs/                            diff 대상 밖: gradle stdout/stderr, _timing.txt, _meta.txt
```

`_meta.txt` 에는 date·BACKEND·REPO·HEAD·HEAD^·dirty 수·java-home·Gradle 배포 URL·heavy.sh 와 `~/.gradle` init.d·gradle.properties 해시·`.dflow-agent` 표식·도구 해시(`tools`)·모듈·test-slots·`finished` 줄이 남는다.

## 2. 비교: `compare.sh`

```bash
scripts/build-verify/compare.sh <A> <B> [--ignore-file <패턴파일>]... [-I <정규식>]... [--flat] [--show-ignored] [-q]
```

- 다른 파일 수, 한쪽에만 있는 파일, 파일별 바뀐 줄 수를 요약하고 diff 본문을 붙인다(`-q` 면 요약만).
- `--ignore-file`: 맞는 **줄만** 양쪽에서 빼고 비교한다. 여러 번 주면 준 순서대로 패턴 번호가 이어진다.
  패턴별로 걸러낸 줄 수(A / B)를 늘 출력하고, 한 줄도 맞지 않은 패턴은 경고한다. `--show-ignored` 는 걸러낸 줄 전체를 보여 준다.
- 패턴 형식은 POSIX ERE(`LC_ALL=C`, `\d` 대신 `[0-9]`)이며, 한 줄에 하나씩 적는다.
  ```
  # 주석
  <줄 정규식>                     모든 파일
  @<경로 정규식> <줄 정규식>        덤프 폴더 기준 상대경로가 맞는 파일만(첫 공백이 구분자)
  ```
- `--flat`: `deps/`·`buildEnvironment/` 파일에서 트리 기호와 끝의 `(*)` 를 떼고 정렬·중복 제거한 줄 집합으로 비교한다.
  선언 순서만 바뀐 경우와 해석 결과가 바뀐 경우를 가르는 용도이며, 허용 패턴은 평탄화 전 원래 줄에 적용된다.
- 양쪽에 `_meta.txt` 가 있으면 A.HEAD 가 B.HEAD^ 인지, `gradle`·`java-home`·`guh-file`·`dflow-agent`·`tools`·`dirty`·`test-slots` 줄이 같은지 경고로 알린다. 경고는 종료코드를 바꾸지 않는다.

종료코드는 다음과 같다.

| 코드 | 뜻 |
|---|---|
| `0` | 동일(허용 차이를 뺀 뒤 차이 0, 판정 불가 조건 없음) |
| `1` | 다름. 아래 판정 불가 조건이 함께 있으면 경고만 출력한다 |
| `2` | 사용 오류, 패턴 오류, diff 오류 |
| `3` | 내용은 같지만 **판정 불가**: 어느 쪽 `_errors.txt` 가 비어 있지 않거나 없음, 원본 트리에 `' FAILED'`·`'!ERROR'`·`'<error '` 줄이 있음(허용 패턴으로 숨길 수 없다), 옆 `<폴더>.logs/_meta.txt` 에 `finished` 줄이 없음(끊긴 덤프) |

3 은 "허용되는 오류" 통로가 아니다. 오류 문구를 읽고 고칠 곳(빌드 또는 덤프 도구)을 정한 뒤에 판정한다.
유일한 예외 절차는 §4 의 caravan-hub 사실이며, `known-errors-15.txt` 로만 판정한다.

## 3. 판정 절차와 2차 판정 기록

1. A 는 B 의 바로 앞 커밋이어야 하고(`_meta.txt` 의 A.HEAD = B.HEAD^), 양쪽 `dirty` 는 0 이어야 한다.
2. 양쪽 `_meta.txt` 의 `gradle`·`java-home`·`guh-file`·`dflow-agent`·`tools` 가 같아야 한다. `heavy.sh` 는 줄 세우기만 하므로 달라도 된다.
3. 처음 한 번은 같은 커밋을 두 번 떠서 `compare.sh A A2` 가 0 인지 본다(결정성).
4. 단계에 맞는 허용 패턴으로 비교하고, compare.sh 출력(패턴별 걸러낸 줄 수 포함)을 커밋 메시지나 레인 기록에 붙인다.
5. 실행 순서는 `mpn` 단독, `mdm` 단독, 15개 전체 순서가 안전하다.

`allow-*.txt` 는 **2차(2026-10) 판정에 쓴 패턴**이다. 판정 전에 고정한 기록으로 두며, 다른 변경을 판정할 때는 이 파일을 본보기로 새 패턴 파일을 만든다.
각 패턴 위 주석에 근거와 기대 줄 수(A / B)가 있다.

| 단계 | 명령 |
|---|---|
| ① 버전 카탈로그 | `compare.sh <①앞> <①> --ignore-file scripts/build-verify/allow-cat1.txt`(deps 트리만 다르면 `--flat` 을 더한다) |
| ③ build-logic | `compare.sh <①> <③> --ignore-file scripts/build-verify/allow-logic3.txt --flat`(`--flat` 필수) |
| C1·C2 Test 입력 | `compare.sh <③> <C2> --ignore-file scripts/build-verify/allow-j4.txt` |
| 누적 비교 | `--ignore-file` 을 단계 순서대로 여러 번 준다. 이때 "A 가 B 의 바로 앞 커밋이 아니다" 경고는 정상이다 |
| ② 버전 통일 | 불변이 목표가 아니다. 허용 파일 없이 diff 본문이 의도한 좌표에만 있는지 검토한다 |

2차 판정은 도구 해시 `91715d590272ce22` 로 했다. 이 폴더의 `dump-deps.sh` 는 그 판에서 경로·환경 처리만 바꿨다.
BACKEND 기본값을 스크립트 위치에서 계산하고, JAVA_HOME·heavy 변수를 호출 환경에서 받고, `java-home` 메타 줄을 더하고, 인자 없음을 종료코드 2 로 낸다.
두 init 스크립트는 첫 줄 주석과 덤프 태스크 description 의 `tools2` 를 `build-verify` 로 바꾼 것뿐이며, 이 문자열은 덤프에 나타나지 않는다.
그래서 해시는 다르지만(이 판 `0122bb21c81e45ad`), 같은 커밋(dd3f59e5)의 mpn 덤프가 2차 덤프와 `compare.sh` 0(원본 diff 도 0)으로 같음을 옮긴 뒤 확인했다.
옛 덤프와 새 덤프를 비교하면 `tools`·`java-home` 경고가 나오는 것이 정상이다.

## 4. 한계

- **caravan-hub 는 단독으로 해석되지 않는다.** `implementation 'com.dongkuk.caravan:caravan-core:3.0.0'` 은 루트 composite 의 `includeBuild('caravan-core')` 치환에서만 풀린다.
  caravan-hub/settings.gradle 에는 includeBuild 가 없고 `~/.m2` 에도 없어서, 15개 전체 덤프의 `_errors.txt` 는 늘 14줄이고 compare.sh 는 3 을 낸다.
  - 나타나는 곳: caravan-hub deps 5개의 `caravan-core:3.0.0 FAILED` 줄, settings `_root.txt` 의 bootJar·bootWar·war `!ERROR registered inputs`.
  - 덤프 도구는 빌드를 고치지 않는다(치환을 주입하면 판정 대상이 바뀐다). 그래서 15개 전체에서 3 이 나오면 다음 셋이 모두 참일 때만 "동일(caravan-hub 단독 해석 불가 사실 동반)"으로 기록한다.
    1. `cmp <A>/_errors.txt scripts/build-verify/known-errors-15.txt` 가 같다.
    2. `cmp <B>/_errors.txt scripts/build-verify/known-errors-15.txt` 가 같다.
    3. compare.sh 출력이 "내용 동일(… 판정 불가 (종료코드 3)" 이다.
  - 하나라도 어긋나면 판정 불가이며 원인부터 진단한다. 이 절차로 잃는 범위는 caravan-hub 안의 caravan-core 아래 전이 트리와 caravan-hub 보관 태스크의 담기는 파일 집합이다. caravan-core 자체의 해석 결과는 caravan-core 덤프에 남는다.
  - `known-errors-15.txt` 는 2차(2026-10) 판정 때 dd3f59e5 에서 두 번 떠서 바이트 단위로 같았던 내용이다. 모듈 구성이 바뀌면 다시 떠서 확인한다.
- 각 모듈을 자기 폴더에서 루트 빌드로 돌린다. 루트 composite(`src/backend`)에서만 생기는 설정(`buildAll` 등)은 덤프 대상이 아니다.
- bootJar/bootWar 의 실제 mainClass 는 `build/` 아래 산출물에서 파생되어 빌드 여부에 따라 갈리므로 덤프하지 않는다. 대신 `mainClass(configured)` 와 manifest 를 남긴다.
- 저장소의 `content { includeGroup … }` 필터와 `metadataSources`, Test 의 `testLogging` 은 덤프하지 않는다.
- `--flat` 은 트리 구조(누가 누구를 끌어오는가)를 버리고 해석된 좌표 집합이 같다는 것만 보인다.
- Test `actions` 수는 `~/.gradle/init.d/dflow-test-jvm.gradle` 영향을 받는다. 빌드 루트나 조상에 `.dflow-agent` 가 있으면 doFirst 가 하나 늘어나므로 `_meta.txt` 의 `dflow-agent` 줄을 맞춰 비교한다.
- `JAVA_HOME` 을 고정하지 않으므로, 양쪽을 다른 JDK 로 뜨면 toolchain 관련 줄이 다를 수 있다. 비교할 두 덤프는 같은 `java-home` 으로 뜬다.
- `compare.sh` 는 macOS(BSD) `mktemp -d -t` 형식을 쓴다. 2차 판정은 macOS 에서만 돌렸다.
- 2026-10 실측 범위: mpn·mdm 단독 덤프 `_errors` 0, 일부러 바꾼 다섯 사례(일반 의존 버전, BOM 이 덮는 선언, Test jvmArgs, 저장소 순서, JavaCompile encoding)가 모두 1 로 잡힘, 같은 커밋 재덤프·`--no-daemon` 재덤프 diff 0, 15개 전체 두 번 diff 0(404개 파일).
