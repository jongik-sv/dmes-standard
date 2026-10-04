# 구조 변경 기록 — 빌드·스크립트 레인 (refactor/build)

이 문서는 1b 레인(`refactor/build`)의 구조 변경을 적는다. 형식은 [README.md](./README.md) §6.1 을 따른다.

- 이번 1차 머지 범위: `af572b93..HEAD` (15개 커밋 + 레인 내부 머지 1개).
- E2E(8번)·버전 카탈로그(2번)·build-logic(3번)은 다음 머지에서 이어 적는다.
- 스크립트 경로 표기: `be-run.sh`·`fe-run.sh`·`local-run.sh`·`be-run.ps1`·`dmes-up.ps1` 등은 저장소 루트에 있고, 공통 부품은 `scripts/lib/` 에 있다.
- ps1 변경은 이 PC 에 pwsh 가 없어 구문 분석·실행 모두 미검증이다. Windows 에서 확인해야 한다(S3·S4·S5 해당).

| 번호 | 제목 |
|---|---|
| S1 | restart-all.sh 를 scripts/archive 로 보관 |
| S2 | frontend test-results 산출물 추적 해제 |
| S3 | be-run --all 선빌드와 dmes-up.ps1 직렬 warm-up 제거 |
| S4 | be-run 종료 때 전역 gradlew --stop 제거, 이 체크아웃의 앱 JVM 만 정리 |
| S5 | 공통 함수 scripts/lib 추출, 모듈·포트 단일 원본, 포털 포트 결함 수정 |
| S6 | cactus-core 시험에 sqlite-jdbc 추가 |
| S7 | mdm/api 시험 입력에 mcm 시드 파일 2개 추가 |

## S1. restart-all.sh 를 scripts/archive 로 보관
- 커밋: 5d893cc3
- 바뀌기 전: `scripts/restart-all.sh` 가 있었다.
- 바뀐 뒤: `scripts/archive/restart-all.sh`(`git mv`, 내용 변경 없음)와 `scripts/archive/README.md`(보관 사유·대체 수단).
- 바꾼 이유: mqc 포트가 8300 으로 적혀 있으나 실제는 8093 이고, MSSQL 프로파일을 쓰는 낡은 스크립트다. 쓰면 잘못된 포트를 회수하고 폐기된 DB 방언으로 뜬다. 대체 수단은 루트의 `be-run.sh`·`fe-run.sh`·`local-run.sh` 다.
- 동작 보존 근거: 내용 변경 없는 이동이다(`git show --stat` 에서 rename, 변경 줄은 README 6줄뿐). 빌드·시험 대상이 아니다.
- 영향 범위: `scripts/restart-all.sh` 를 직접 부르던 사람·문서. 저장소 안 호출부는 이 레인에서 확인한 범위에 없다.
- 되돌리는 방법: 5d893cc3 revert (파일이 원래 위치로 돌아온다).

## S2. frontend test-results 산출물 추적 해제
- 커밋: 588d1e5c
- 바뀌기 전: `src/frontend/test-results/**/error-context.md` 4개(1,660줄)가 git 에 추적되고 있었다.
- 바뀐 뒤: 4개를 추적에서 뺐고(로컬 파일은 그대로) `src/frontend/.gitignore` 가 `test-results` 디렉터리 전체를 무시한다.
- 바꾼 이유: Playwright 가 실행마다 만드는 산출물이라 커밋에 섞여 diff 를 더럽힌다. 구조 변경이라기보다 저장소 위생 항목이라 짧게만 적는다.
- 동작 보존 근거: 소스·빌드 입력이 아닌 산출물이다. 앱·시험 동작에 영향이 없다.
- 영향 범위: E2E 를 돌리는 사람. 다음 실행에서 만들어지는 파일이 더는 `git status` 에 뜨지 않는다.
- 되돌리는 방법: 588d1e5c revert (4개 파일이 추적으로 돌아온다. 이후 로컬 파일과 충돌할 수 있다).

## S3. be-run --all 선빌드와 dmes-up.ps1 직렬 warm-up 제거
- 커밋: 5f545cfa(선빌드 도입, sh·ps1), 4cbd6d9c(dmes-up.ps1 warm-up 제거), f71b7c4a(선빌드 실패 처리·신호 정리·dmes-up.ps1 보완)
- 바뀌기 전:
  ```
  be-run --all
    ├─ gradle bootRun (mls)     ─┐
    ├─ gradle bootRun (mqc)      │ 모듈 7개의 Gradle 프로세스가
    ├─ ...                       ├ 공유 includeBuild(cactus-core·mcm-core·maru-mdm-engine 등)를
    └─ gradle bootRun (analog)  ─┘ 동시에 컴파일하며 서로의 build/classes·jar 를 덮어썼다
  ```
  Windows `dmes-up.ps1` 은 이 경합을 피하려고 모듈마다 `gradlew :api:classes` 를 차례로 도는 직렬 warm-up 을 임시 방편으로 두었다.
- 바뀐 뒤:
  ```
  be-run --all (모듈 2개 이상)
    1) 포트 회수
    2) src/backend 루트 composite 에서 gradle -m 으로 계획: 선택 모듈의 :<m>:api:bootRun 의 태스크 목록(--all 기준 84개)
    3) 목록에서 bootRun 만 빼고 gradle 한 번으로 선빌드(각 모듈 api:classes·resolveMainClassName·lib:jar, includeBuild 의 jar)
    4) 모듈별 bootRun 기동 (선빌드가 끝난 상태라 UP-TO-DATE, 컴파일 없음)
  ```
  - 모듈 1개이거나 `BE_PREBUILD=0` 이면 선빌드를 건너뛴다(단일 모듈 경로는 종전과 같다).
  - `--dry-run` 옵션을 더했다. 이전 인스턴스 종료·포트 회수·종료 트랩보다 앞에서 끝나고 선빌드 명령·태스크 목록·기동 순서만 출력한다.
  - 선빌드나 계획이 실패하면 기동하지 않고 `exit 1`(f71b7c4a). 5f545cfa·4cbd6d9c 초판의 "실패해도 기동"은 뒤집었다. 실패한 채 띄우면 bootRun 들이 공유 includeBuild 를 다시 동시에 빌드해 경합이 되살아나기 때문이다. 우회는 `BE_PREBUILD=0`(종전 방식) 또는 `BE_PREBUILD_CONTINUE=1`(명시적 옵트인일 때만 실패해도 기동).
  - sh 선빌드는 백그라운드로 띄워 wait 하고, 그동안만 임시 TERM·INT 트랩을 건다. 신호를 받으면 서브셸·gradlew 클라이언트·awk 를 정리하고 143/130 으로 끝난다(종전에는 고아 프로세스가 남을 수 있었다).
  - `dmes-up.ps1` 의 직렬 warm-up 과 쓰이지 않게 된 `$Modules` 를 지웠다. `-Warmup` 은 호환용으로 받기만 하고 안내 한 줄을 낸다. `-Clean` 은 `-Full` 과 같다. `-Detach` 의 8분 포트 대기 안에 이제 선빌드 시간이 들어간다.
- 바꾼 이유: 7개 Gradle 이 같은 includeBuild 를 동시에 컴파일하면 CPU·메모리를 7배로 쓰고 산출물 덮어쓰기 경합이 생긴다. 컴파일을 1회로 줄이고 경합을 없앤다.
- 기동 방식을 모듈별 bootRun 으로 유지한 이유:
  - includeBuild 의 실행 기록은 각 빌드 폴더의 `.gradle` 에 남는다. 루트 composite 선빌드 뒤 모듈 폴더에서 같은 태스크를 돌리면 mls 18/18·mdm 19/19·mcm 17/17·analog 6/6 이 UP-TO-DATE 였다. 그래서 bootRun 은 컴파일 없이 기동만 하고 프로파일·`--args`·workingDir·JVM 옵션·로그 접두어·포트·종료 로직이 그대로다.
  - `java -jar` 는 고르지 않았다. 모듈이 war+providedRuntime 톰캣이라 bootWar 클래스패스가 bootRun(classes 디렉터리 + lib 출력)과 다르고, analog 의 jvmArgs·workingDir 도 따로 옮겨야 해 동작이 바뀐다. bootWar(87~170MB) 도 만들지 않게 된다.
  - `--offline` 은 의존성 해석 방식을 바꾸므로 고르지 않았다.
  - Gradle 한 번에 bootRun 7개를 띄우는 방식은 `org.gradle.workers.max=3` 때문에 3개만 동시에 돌아 쓰지 않았다.
- 선빌드가 `DFLOW_GRADLEW_NO_HEAVY=1` 로 heavy 슬롯을 우회하는 이유: gradlew 는 bootRun 이 아닌 실행을 PC 전역 heavy 슬롯에 줄 세운다. 이 경로는 사용자가 서버를 띄우는 경로이고, 종전 bootRun 7개도 슬롯 없이 컴파일했다. 부하 평균 43 에서 선빌드가 슬롯을 17분 넘게 기다렸다(기동 대기가 새로 생기면 안 된다). 부하는 7회 컴파일 대신 1회가 되므로 오히려 준다. 조정 세션 동의를 받았다. 에이전트가 E2E 때문에 be-run 을 부르는 경로는 없다.
- 동작 보존 근거:
  - 명령 수준: `/bin/bash`(3.2) `-n`, `--help`, `--all --dry-run`(84 태스크), `--mcm --dry-run`, `BE_PREBUILD=0 --keep-port --dry-run`, 인자 없는 `--dry-run`(→ `--all`), `BE_RUN_ARGS="--mcm --mdm" --dry-run`, `--bogus`(exit 2).
  - 선빌드 함수만 떼어 실행: 84 태스크 중 56 up-to-date, 콜드(`--rerun-tasks --no-build-cache`, 기본 데몬 힙) 56 태스크 26초 성공. 스텁 gradlew 로 성공(계속)·빌드 실패(exit 1)·계획 실패(exit 1)·`BE_PREBUILD_CONTINUE=1`(계속)·TERM(143)·INT(130) 확인, 신호 뒤 빌드 프로세스가 남지 않음을 pgrep 으로 확인.
  - 모듈 기동 후 UP-TO-DATE 여부는 위 모듈별 실측(18/18 등)이다.
  - 서버 기동·종료·포트 회수 경로는 이 레인에서 실행하지 않았다(P1 측정 때 확인).
- 영향 범위: `be-run.sh`·`be-run.ps1`·`dmes-up.ps1`, 이를 부르는 `local-run.sh`(be-run 종료를 감지해 FE 까지 정리). 동작이 바뀌는 점: 선빌드 실패 시 기동하지 않음(종전 bootRun 은 모듈별로 각자 실패), `dmes-up.ps1` 의 `-Detach` 8분 대기에 선빌드 포함(`~/.gradle` 이 빈 새 PC 에서는 "not up after 8 min" 이 뜰 수 있으나 서비스는 뜨는 중), `-Warmup` 무동작. ps1 은 pwsh 가 없어 구문 분석 미검증이다.
- 되돌리는 방법: f71b7c4a → 4cbd6d9c → 5f545cfa 순으로 revert. 임시로는 `BE_PREBUILD=0`.

## S4. be-run 종료 때 전역 gradlew --stop 제거, 이 체크아웃의 앱 JVM 만 정리
- 커밋: be51ac2e
- 바뀌기 전: `be-run.sh` 종료 정리(`stop_gradle_daemons`)가 `gradlew --stop` 을 불렀다. 같은 사용자·같은 Gradle 버전(9.3.1, analog 자기 wrapper 도 같은 버전)의 데몬이 전부 멈춰, 다른 워크트리에서 돌던 gradle 빌드·시험이 `Gradle build daemon has been stopped` 로 실패했다. `other_checkout_be_run_alive` 는 다른 be-run 만 봐서 이를 막지 못했다. 잔존 포트 리스너는 체크아웃 구분 없이 죽였다.
- 바뀐 뒤:
  - `stop_gradle_daemons` 와 `other_checkout_be_run_alive`(호출처가 그것 하나뿐임을 `git grep` 으로 확인)를 없앴다. 데몬은 `org.gradle.daemon.idletimeout`(10분)으로 스스로 내려간다.
  - bootRun 앱 JVM 은 Gradle 데몬의 자식이라 실행기만 끊으면 남는다. 그래서 `terminate_backend_ports` 가 모듈 포트를 LISTEN 중인 pid 중 `is_own_backend_jvm` 에 맞는 것만 TERM → 대기(실행기·앱 JVM pid 함께) → 재스캔 후 KILL 한다.
  - 고르는 조건: 프로세스 이름이 java 이고 작업 디렉터리가 이 체크아웃의 `$BACKEND_DIR/<모듈>` 과 정확히 같을 것(`pwd -P` 도 비교). 작업 디렉터리를 알 수 없을 때만 명령줄 classpath 항목이 그 모듈 폴더 아래로 시작하는지 본다.
  - 부수 수정: cleanup 의 배열 전개가 bash 3.2 + `set -u` 에서 빈 배열로 죽지 않게 고쳤고, `--keep-port` 안내의 `gradlew --stop` 권유를 뺐다.
  - `be-run.ps1`: `Stop-GradleDaemons`(`gradlew.bat --stop`)를 없애고 잔존 포트 리스너 정리를 `Test-OwnBackendJvm`(java(w), 명령줄 또는 @인자 파일에 `<BackendDir>\<모듈>\` 포함)으로 이 체크아웃 것만 고른다. `dmes-down.ps1` 은 `gradlew.bat --stop` 과 그것만 쓰던 `JAVA_HOME` 설정을 뺐다.
- 바꾼 이유: 한 체크아웃의 서버 종료가 다른 워크트리의 빌드·시험을 죽이는 것을 막는다(레인이 여럿 도는 지금 직접 문제다).
- 동작 보존 근거: 다른 워크트리에서 engine test 가 실행되는 동안 정리 경로를 호출했을 때 `BUILD SUCCESSFUL`, 데몬 수 감소 없음. 로그: `/private/tmp/claude-501/-Users-jji-project-dmes-standard/eb9d7416-ff24-436f-a576-8ba7f537b70f/scratchpad/stopfix/`. 서버 종료 자체의 동작(내 모듈 포트 해제)은 조건에 맞는 JVM 에 한정해 유지된다. ps1 은 미검증.
- 영향 범위: `be-run.sh`·`be-run.ps1`·`dmes-down.ps1`. 동작이 바뀌는 점: 데몬이 종료 직후 곧바로 내려가지 않고 최대 10분 유휴 뒤 내려간다(메모리를 잠시 더 쓴다). 다른 체크아웃이 띄운 같은 포트의 JVM 은 더 이상 죽이지 않는다.
- 되돌리는 방법: be51ac2e revert. 단 다른 워크트리 빌드 실패가 다시 생긴다.

## S5. 공통 함수 scripts/lib 추출과 모듈·포트 단일 원본
- 커밋:
  - 98f4ecb8 공통 함수 추출(sh)
  - ca48ef8f 모듈·포트 카탈로그 `modules.conf` + `modules.sh`
  - 8d91843f ps1 다섯 개가 카탈로그를 읽음(`modules.ps1`)
  - e9a28ff5 포털 포트 5100 결함 수정(fix, 아래 따로)
  - fa746e92, aa139e31 lib 부재 시 실패 처리(fix)
- 바뀌기 전: `be-run.sh`·`fe-run.sh`·`local-run.sh` 가 같은 이름의 로그·프로세스·인자 함수를 각자 복제해 들고 있었다. 모듈 목록·포트·로그 색(`BE_ALL_MODULES`·`be_module_port`·`be_module_color`)은 be-run.sh 에, 포털 포트는 fe-run.sh 등에, ps1 쪽은 `be-run.ps1`·`fe-run.ps1`·`dmes-up.ps1`·`dmes-down.ps1`·`local-run.ps1` 이 저마다 리터럴로 적어 값이 갈라졌다(ps1 이 mdm 과 포털 5100 을 놓친 것이 그 예).
- 바뀐 뒤:
  ```
  scripts/lib/
    log.sh        DEV_LOG_COLOR 판정, dev_log_tag_color·dev_log_print·dev_log_error·dev_log_run·dev_log_prefix_stream
    proc.sh       terminate_pid_tree·wait_for_exit·terminate_cmdline_stragglers(경로를 인자로 받음)
    args.sh       load_default_args·has_scope_arg
    modules.conf  kind name port color platforms 공백 구분 표 (단일 원본)
    modules.sh    표를 읽어 BE_ALL_MODULES·PORTAL_PORT·be_module_port·be_module_color 제공
    modules.ps1   platforms 에 ps1 이 있는 줄만 $DmesBeModules·$DmesBeTagColors·$DmesPortalPort 제공
  ```
  - 각 sh 스크립트는 자기 위치 기준 `scripts/lib` 를 `.run.env` 를 읽은 뒤 source 한다. be-run 의 모듈 플래그는 손으로 적은 `--mpn|--mcm|...` 대신 카탈로그에 있는 `--<모듈>` 이면 받는다(없으면 종전처럼 "알 수 없는 옵션" exit 2).
  - 형식은 공백 구분 표 하나로 골랐다. JSON 은 bash 3.2 에서 jq 없이 읽기 어렵고, `.psd1` 은 bash 가 못 읽으며, 둘을 따로 두는 방식은 값이 다시 갈라진다.
  - mdm(8096)은 platforms 에 sh 만 표시해 ps1 의 `--all` 은 종전 6개(mls mqc mpp mpn mcm analog)를 유지한다. be-run.ps1 에 `MDM_SAMPLE` 인자가 없고 Windows 에서 확인한 적이 없다. 후속 Windows 확인 뒤 platforms 에 ps1 을 더한다.
  - 같은 이름 함수가 두 벌 다를 때 고른 쪽: `dev_log_prefix_stream`·`dev_log_print` 는 be 판을 골랐고 fe 는 `fe` 태그(청록)로 불러 출력 바이트가 같다. 이름·동작이 다른 `terminate_port_listeners`(fe)·`reclaim_backend_port`(be)와 be-run.sh 의 체크아웃 판별 함수는 옮기지 않았다.
  - fa746e92: sh 세 스크립트가 `scripts/lib` 를 못 찾으면 `[error] scripts/lib 없음` 한 줄과 exit 1(종전에는 파일 심볼릭 링크로 부르면 `No such file` 뒤 `command not found` 가 이어지고 `--help` 가 rc 0). local-run.sh 는 modules.sh 를 `.run.env` 보다 먼저 source 해 fe-run.sh 와 순서를 맞춘다. aa139e31: `dmes-down.ps1` 이 modules.ps1 을 못 찾으면 `[down] missing ...` 와 exit 1(종전에는 "all ports free" 와 rc 0 으로 끝날 수 있었다), `local-run.ps1` 은 FE 범위 이름(--mpn·--mdm)을 BE 전용 목록에서 명시적으로 뺀다.
- 결함 수정(동작이 바뀜, 리팩토링과 분리) — e9a28ff5: 5179c778(포털 기본 포트 5000→5100)이 sh 와 안내문만 바꾸고 `fe-run.ps1`·`dmes-up.ps1` 의 값 두 개를 놓쳤다. `src/frontend/m-mcm/package.json` 의 dev 는 `next dev --port 5100` 이다. 그 결과 `fe-run.ps1` 은 포털이 쓰지 않는 5000 리스너를 정리하고 정작 5100 의 이전 next dev 는 남겨 EADDRINUSE 가 났고, `dmes-up.ps1 -Detach` 는 5000 이 LISTEN 될 때까지 기다려 프론트가 떠도 8분 뒤 "not up" exit 1 이었다. 고친 뒤에는 fe-run.sh 와 같은 동작으로, `fe-run.ps1` 의 기동 전 정리와 `dmes-up.ps1` 의 포트 회수가 5000 대신 5100 리스너를 어느 체크아웃 것이든 정리한다(aa139e31 본문이 초판 설명을 정정). Windows 확인 항목이다.
- 바꾼 이유: 복제된 함수와 포트 목록이 갈라지며 실제 결함을 만들었다. 한 곳에서 읽으면 모듈 추가·포트 변경이 한 줄이다.
- 동작 보존 근거(리팩토링 커밋 98f4ecb8·ca48ef8f):
  - `bash -n`(macOS `/bin/bash` 3.2) 통과, be-run.sh `--help`/`-h`·`--dry-run` 여러 조합(모듈 1개·mdm 샘플 on/off·`BE_PREBUILD=0 --all`·`BE_RUN_ARGS` 기본값·`DEV_LOG_COLOR=never`), 인자 오류(be·fe·local), fe-run.sh·local-run.sh `--help` 출력이 바꾸기 전과 바이트까지 같다.
  - 로그 색은 `DEV_LOG_COLOR` always/never/auto 각각에서 태그 12개 색·`dev_log_print`·`dev_log_prefix_stream`(샘플 19줄)이 바꾸기 전 함수와 같다.
  - 카탈로그 리더는 CRLF 사본·마지막 줄바꿈 없는 사본·다른 작업 디렉터리에서 같은 값을 낸다.
  - `proc.sh` 는 직접 띄운 sleep 트리로만 스모크했다. 서버 기동·종료 경로는 실행하지 않았다.
  - ps1(8d91843f 등)은 pwsh 부재로 구문 분석·실행 미검증. 값은 종전 ps1 과 같게 옮겼다(`--all` 6개 같은 순서, 포털은 e9a28ff5 이후 5100).
- 영향 범위: `be-run.sh`·`fe-run.sh`·`local-run.sh`·`be-run.ps1`·`fe-run.ps1`·`dmes-up.ps1`·`dmes-down.ps1`·`local-run.ps1`, 신규 `scripts/lib/*`. `scripts/lib` 없이 스크립트만 복사해 쓰면 실패한다(한 줄 오류). 심볼릭 링크는 파일 링크가 아니라 디렉터리 단위로 걸어야 한다.
- 되돌리는 방법: 커밋 역순 revert(aa139e31, fa746e92, 8d91843f, ca48ef8f, e9a28ff5, 98f4ecb8). e9a28ff5 만 되돌리면 ps1 포털 포트가 5000 으로 돌아가 결함이 재현된다.

## S6. cactus-core 시험에 sqlite-jdbc 추가
- 커밋: 5cc32833
- 바뀌기 전: cactus-core 시험 클래스패스에 SQLite 드라이버가 없었다. 트랜잭션 재현 시험(a8 요청)이 cactus-core 에서 SQLite 를 쓰는데 드라이버가 없어 실행할 수 없었다.
- 바뀐 뒤: `src/backend/cactus-core/build.gradle` 에 `testImplementation 'org.xerial:sqlite-jdbc:3.45.3.0'` 한 줄(다른 모듈 mcm/lib 등과 같은 선언). 실제 해석 버전은 Spring Boot BOM 이 정해 3.50.3.0 이다.
- 바꾼 이유: 위 시험 실행. 시험 전용 의존성이라 운영 산출물에는 들어가지 않는다.
- 동작 보존 근거: `testImplementation` 이라 main·런타임 클래스패스가 바뀌지 않는다.
- 영향 범위: cactus-core 시험 클래스패스. 선언 버전과 해석 버전이 다르므로 버전을 고정하려면 BOM 의 관리를 벗어나는 지정이 필요하다(2번 버전 카탈로그 작업에서 정리).
- 되돌리는 방법: 5cc32833 revert (해당 시험이 드라이버를 못 찾아 실패한다).

## S7. mdm/api 시험 입력에 mcm 시드 파일 2개 추가
- 커밋: fa6bfec4
- 바뀌기 전: `src/backend/mdm/api/build.gradle` 의 `:api:test` 입력(`mcmDataInitializer`)이 mcm 의 `DataInitializer.java` 한 파일뿐이었다.
- 바뀐 뒤: 같은 입력에 `mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/seed/MdmMenuSeeder.java`·`CoreRbacSeeder.java` 를 더했다. `propertyName` 은 그대로이고 init 폴더 전체는 잡지 않았다.
- 바꾼 이유: `MdmOasisActionVocabularyTest` 가 mcm 의 메뉴·버튼 시드를 읽는데, a6 2단계부터 시드가 이 두 파일로 나뉜다. 입력에 없으면 시드가 바뀌어도 시험이 UP-TO-DATE 로 건너뛴다.
- 동작 보존 근거: 입력 파일 선언만 늘었다. `src/backend/mdm` 에서 `:api:test --dry-run` 이 `BUILD SUCCESSFUL in 7s`, `:api:test` SKIPPED 였다. 두 파일은 a6 2단계 머지 뒤에 생기며 지금은 없어도 구성 단계가 실패하지 않았다. 시험 실행은 하지 않았다.
- 영향 범위: mdm `:api:test` 의 최신 여부 판정(캐시 키). 코드 동작 변화 없음.
- 되돌리는 방법: fa6bfec4 revert (a6 2단계 머지 뒤에는 시드 변경이 시험을 다시 돌리지 못하는 상태로 돌아간다).
