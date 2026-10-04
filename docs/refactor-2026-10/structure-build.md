# 구조 변경 기록 — 빌드·스크립트 레인 (refactor/build)

이 문서는 1b 레인(`refactor/build`)의 구조 변경을 적는다. 형식은 [README.md](./README.md) §6.1 을 따른다.

- 이번 1차 머지 범위: `af572b93..HEAD` (문서를 추가한 83a14e90 자신을 포함해 15개 커밋 + 레인 내부 머지 1개).
- E2E(8번)는 이번 머지에 들어간다(S10~S13, 범위 `af572b93..HEAD -- src/frontend/e2e src/frontend/playwright.config.ts`, 커밋 13개). 버전 카탈로그(2번)·build-logic(3번)은 2차에서 S18~S23 으로 이어 적었다.
- 2차(S18~S23) 커밋 12개: ① 1adfcf85, ③ d456a866·00461248·03abab9b·d77c94d9·25b89567, ④ 01c3d678, C1 8bb30ee4, C2 5c6f2383, 주석 54e6f2ca, ② 2a95c5e7, 판정 도구 7cf41d92. 레인 내부 dev 합침은 제외했다. 모두 dev 머지 대기 중이다.
- 2차 판정에 쓴 덤프·시험 결과 파일은 저장소 밖 작업 폴더에 있다. 같은 판정을 다시 하는 절차는 S23 의 `scripts/build-verify/README.md` 에 있다.
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
| S8 | mcm-core 시험 입력에 mcm/api 시드 소스 세 파일 선언 |
| S9 | cactus-core 시험의 sqlite-jdbc 를 실행 범위로 옮기고 hibernate SQLite 방언 추가 (S6 후속) |
| S10 | 일회성 스펙 17개 e2e/archive 이동과 testIgnore |
| S11 | E2E 공통 헬퍼 통합(로그인·메뉴·그리드 셀렉터·대기 상수·조건 대기) |
| S12 | dmd 소속 편집 팝업 TransferList testid 반영 |
| S13 | E2E 기본값 결함 수정(포털 주소·기본 아이디) |
| S14 | README 실행 안내 보강(선빌드·드라이런·이전 인스턴스 종료·.run.env 우선순위·dmes-up 옵션) |
| S15 | dmes-up.ps1 -Detach 에서 백엔드가 먼저 끝나면 FE 정리(동작 변경, 미검증) |
| S16 | Windows ps1 확인 체크리스트 문서 |
| S17 | E2E mdm 스모크 스크린샷 기본 출력 위치 이동(동작 변경) |
| S18 | 백엔드 버전 카탈로그 gradle/libs.versions.toml 도입(버전 불변) |
| S19 | build-logic convention plugin(dmes.test-conventions·dmes.business-module)과 settings 헬퍼 도입 |
| S20 | buildAll·testAll·cleanAll 에 mcm-core·mls·caravan-console·analog 추가(동작 변경) |
| S21 | 시험 입력 정리: mdm/api 에서 DataInitializer.java 제거, mcm-core 에 BPMN 2개 선언(C1·C2) |
| S22 | mybatis-spring-boot-starter 3.0.5 통일(동작 변경, 해석 버전 변화) |
| S23 | 빌드 불변 판정 도구 scripts/build-verify 보관 |

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
  - `dmes-up.ps1` 의 `-Detach` 대기 중 백엔드 런처가 포트를 열기 전에 끝나면 8분을 기다리지 않고 exit 1 로 끝난다(종전 warm-up 의 fail-fast 를 되살림, f71b7c4a).
  - `dmes-up.ps1` 의 직렬 warm-up 과 쓰이지 않게 된 `$Modules` 를 지웠다. `-Warmup` 은 호환용으로 받기만 하고 안내 한 줄을 낸다. `-Clean` 은 `-Full` 과 같다. `-Detach` 의 8분 포트 대기 안에 이제 선빌드 시간이 들어간다.
- 바꾼 이유: 7개 Gradle 이 같은 includeBuild 를 동시에 컴파일하면 CPU·메모리를 7배로 쓰고 산출물 덮어쓰기 경합이 생긴다. 컴파일을 1회로 줄이고 경합을 없앤다.
- 기동 방식을 모듈별 bootRun 으로 유지한 이유:
  - includeBuild 의 실행 기록은 각 빌드 폴더의 `.gradle` 에 남는다. 루트 composite 선빌드 뒤 모듈 폴더에서 같은 태스크를 돌리면 mls 18/18·mdm 19/19·mcm 17/17·analog 6/6 이 UP-TO-DATE 였다. 그래서 bootRun 은 컴파일 없이 기동만 하고 프로파일·`--args`·workingDir·JVM 옵션·로그 접두어·포트·종료 로직이 그대로다.
  - `java -jar` 는 고르지 않았다. 모듈이 war+providedRuntime 톰캣이라 bootWar 클래스패스가 bootRun(classes 디렉터리 + lib 출력)과 다르고, analog 의 jvmArgs·workingDir 도 따로 옮겨야 해 동작이 바뀐다. bootWar(87~170MB) 도 만들지 않게 된다.
  - `--offline` 은 의존성 해석 방식을 바꾸므로 고르지 않았다.
  - Gradle 한 번에 bootRun 7개를 띄우는 방식은 `org.gradle.workers.max=3` 때문에 3개만 동시에 돌아 쓰지 않았다.
- 선빌드가 `DFLOW_GRADLEW_NO_HEAVY=1` 로 heavy 슬롯을 우회하는 이유: gradlew 는 bootRun 이 아닌 실행을 PC 전역 heavy 슬롯에 줄 세운다. 이 경로는 사용자가 서버를 띄우는 경로이고, 종전 bootRun 7개도 슬롯 없이 컴파일했다. 부하 평균 43 에서 선빌드가 슬롯을 17분 넘게 기다렸다(기동 대기가 새로 생기면 안 된다). 부하는 7회 컴파일 대신 1회가 되므로 오히려 준다. 근거는 커밋 5f545cfa 본문(부하 평균 43, 슬롯 17분 대기)이다. 조정 세션의 동의 여부는 커밋·diff 에 기록이 없어 이 문서에서 확인하지 못했다(확인되면 이 줄에 근거를 덧붙인다).
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
- 동작 보존 근거: 다른 워크트리에서 engine test 가 실행되는 동안 정리 경로를 호출했을 때 `BUILD SUCCESSFUL`, 데몬 수 감소 없음. 실측 요약(저장소 밖 세션 로그에서 옮김): 호출 전 Gradle 데몬 3개가 떠 있었고(다른 워크트리의 mdm `:api:test`·mcm-core `:test` 가 test 슬롯 점유), 이 체크아웃의 maru-mdm-engine `:test` 를 슬롯 2초 대기 뒤 실행하는 동안 정리 경로(`cleanup`)를 호출했다. 정리는 `종료 신호 수신 → 정리 완료(Gradle 데몬은 그대로 둔다)` 로 rc=0 이었고, 엔진 시험은 두 번 모두 `BUILD SUCCESSFUL`(21초·18초)이었다. 그 로그는 머지 뒤 독자가 열 수 없으므로 정식 확인은 P3 측정으로 한다. 서버 종료 자체의 동작(내 모듈 포트 해제)은 조건에 맞는 JVM 에 한정해 유지된다. ps1 은 미검증.
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
- 되돌리는 방법: 커밋 역순 revert(aa139e31, fa746e92, 8d91843f, ca48ef8f, e9a28ff5, 98f4ecb8). ps1 포털 포트는 8d91843f 이후 `modules.conf`(5100)에서 읽으므로 e9a28ff5 만 되돌리면 충돌하거나 효과가 없다. 포털 포트를 5000 으로 복원하려면 8d91843f 를 먼저 되돌려야 한다.

## S6. cactus-core 시험에 sqlite-jdbc 추가
- 커밋: 5cc32833
- 바뀌기 전: cactus-core 시험 클래스패스에 SQLite 드라이버가 없었다. 트랜잭션 재현 시험(a8 요청)이 cactus-core 에서 SQLite 를 쓰는데 드라이버가 없어 실행할 수 없었다.
- 바뀐 뒤: `src/backend/cactus-core/build.gradle` 에 `testImplementation 'org.xerial:sqlite-jdbc:3.45.3.0'` 선언(주석 1줄 포함 2줄 추가, 다른 모듈 mcm/lib 등과 같은 선언). 실제 해석 버전이 선언과 다를 수 있다(Spring Boot BOM 이 관리하면 BOM 버전이 이긴다). 해석 버전은 `dependencies` 로 확인해 다음 머지에서 적는다.
- 바꾼 이유: 위 시험 실행. 시험 전용 의존성이라 운영 산출물에는 들어가지 않는다.
- 동작 보존 근거: `testImplementation` 이라 main·런타임 클래스패스가 바뀌지 않는다.
- 영향 범위: cactus-core 시험 클래스패스. 선언 버전과 해석 버전이 다를 수 있으므로 버전을 고정하려면 BOM 의 관리를 벗어나는 지정이 필요하다(2번 버전 카탈로그 작업에서 정리).
- 되돌리는 방법: 5cc32833 revert (해당 시험이 드라이버를 못 찾아 실패한다).

## S7. mdm/api 시험 입력에 mcm 시드 파일 2개 추가
- 커밋: fa6bfec4
- 바뀌기 전: `src/backend/mdm/api/build.gradle` 의 `:api:test` 입력(`mcmDataInitializer`)이 mcm 의 `DataInitializer.java` 한 파일뿐이었다.
- 바뀐 뒤: 같은 입력에 `mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/seed/MdmMenuSeeder.java`·`CoreRbacSeeder.java` 를 더했다. `propertyName` 은 그대로이고 init 폴더 전체는 잡지 않았다.
- 바꾼 이유: `MdmOasisActionVocabularyTest` 가 mcm 의 메뉴·버튼 시드를 읽는데, a6 2단계부터 시드가 이 두 파일로 나뉜다. 입력에 없으면 시드가 바뀌어도 시험이 UP-TO-DATE 로 건너뛴다.
- 동작 보존 근거: 입력 파일 선언만 늘었다. `src/backend/mdm` 에서 `:api:test --dry-run` 이 `BUILD SUCCESSFUL in 7s`, `:api:test` SKIPPED 였다. 두 파일은 a6 2단계 머지 뒤에 생기며 지금은 없어도 구성 단계가 실패하지 않았다. 시험 실행은 하지 않았다.
- 영향 범위: mdm `:api:test` 의 최신 여부 판정(캐시 키). 코드 동작 변화 없음.
- 되돌리는 방법: fa6bfec4 revert (a6 2단계 머지 뒤에는 시드 변경이 시험을 다시 돌리지 못하는 상태로 돌아간다).

## S8. mcm-core 시험 입력에 mcm/api 시드 소스 세 파일 선언
- 커밋: e08cb0f7
- 바뀌기 전: `src/backend/mcm-core/build.gradle` 의 `test` 태스크는 `useJUnitPlatform()` 만 있었고, 시험이 직접 읽는 mcm/api 소스가 입력으로 선언돼 있지 않았다.
- 바뀐 뒤: `test` 에 `inputs.files(...)` 로 `mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/seed/CoreRbacSeeder.java`, `.../init/seed/ScreenUsageSchemaArtifacts.java`, `.../init/DataInitializer.java` 를 `propertyName` `mcmSeedSources`, 경로 민감도 RELATIVE 로 선언했다. 경로는 `rootProject.file('../mcm/api/...')` 로 적었다. 단독 실행과 루트 composite(includeBuild 의 rootProject 가 mcm-core)에서 모두 `src/backend/mcm/api/...` 로 풀린다.
- 바꾼 이유: `ScreenUsageOasisContractTest`(`../mcm/api/src/main/resources/services` 와 `DataInitializer.java`)와 `ScreenUsageMssqlDdlTest`(`DataInitializer.java`)가 작업 디렉터리(mcm-core) 기준 상대 경로로 mcm/api 소스를 읽는다. 입력에 없으면 시드가 바뀌어도 시험이 UP-TO-DATE 로 건너뛴다. `ScreenUsageSchemaArtifacts.java` 와 `CoreRbacSeeder.java` 는 a6 2단계 머지 뒤 시험이 읽게 될 파일을 미리 넣은 것이다(지금 소스에는 이름으로 읽는 코드가 없고, 없는 경로는 빈 입력으로 취급한다).
- 동작 보존 근거: 입력 선언만 늘었고 시험 코드·클래스패스는 그대로다. `test --dry-run` 이 mcm-core 단독과 루트 composite 두 곳에서 BUILD SUCCESSFUL 이었다. dry-run 은 구성 단계만 확인하므로 실제 시험은 돌리지 않았다. Test 태스크는 build.gradle 상단 주석대로 이미 캐시 대상에서 빠져 있어(`doNotCacheIf`) 이 선언은 up-to-date 판정에만 영향을 준다.
- 영향 범위: mcm-core `:test` 의 최신 여부 판정. 코드 동작 변화 없음. 미결: `ScreenUsageOasisContractTest` 가 읽는 `mcm/api/src/main/resources/services` 폴더는 이번 선언에 없다. 이 폴더까지 입력으로 둘지는 결정 대기다.
- 되돌리는 방법: e08cb0f7 revert (시드 변경이 mcm-core 시험을 다시 돌리지 못하는 상태로 돌아간다).

## S9. cactus-core 시험의 sqlite-jdbc 를 실행 범위로 옮기고 hibernate SQLite 방언 추가 (S6 후속)
- 커밋: 7af5a32e
- 바뀌기 전: `src/backend/cactus-core/build.gradle` 에 `testImplementation 'org.xerial:sqlite-jdbc:3.45.3.0'` 만 있었다(S6). SQLite 방언 의존은 없었다.
- 바뀐 뒤: sqlite-jdbc 를 `testRuntimeOnly` 로 옮기고, `testRuntimeOnly 'org.hibernate.orm:hibernate-community-dialects'` 를 버전 없이 추가했다. 주석을 용도에 맞게 고쳤다.
- 바꾼 이유: a8 레인의 SQLite 재현 시험이 `hibernate.dialect=org.hibernate.community.dialect.SQLiteDialect` 를 문자열로 지정한다. 다른 모듈(aps-core 등)과 같은 범위로 맞춘다.
- 동작 보존 근거: dev 의 시험 소스 grep 에서 cactus-core 에는 `org.sqlite`·`org.hibernate.community` import 가 없다(org.sqlite import 는 mcm/lib 시험에만, 방언은 문자열 지정뿐). `testRuntimeClasspath` 해석: hibernate-community-dialects 7.2.12.Final, hibernate-core 7.2.12.Final(같은 버전), sqlite-jdbc 3.45.3.0 -> 3.50.3.0(BOM 이 올림). `testCompileClasspath` 에는 두 의존이 없다. `compileTestJava` BUILD SUCCESSFUL. 시험 실행은 하지 않았다.
- 영향 범위: cactus-core 시험 런타임 클래스패스만. main·운영 산출물 변화 없음. S6 에서 걱정한 선언과 해석 버전 차이는 위 값으로 확인됐다(3.50.3.0).
- 되돌리는 방법: 7af5a32e revert (a8 의 SQLite 방언 시험이 방언 클래스를 못 찾아 실패한다).

## S10. 일회성 스펙 17개 e2e/archive 이동과 testIgnore
- 커밋: b389e91c
- 바뀌기 전: `src/frontend/e2e/` 바로 아래에 일회성 검증·스냅샷 스펙이 정식 스모크와 섞여 있었다. `playwright test --list` 기본 217개.
- 바뀐 뒤: 17개 스펙을 `src/frontend/e2e/archive/` 로 `git mv`(내용 변경 없음)하고 `playwright.config.ts` 에 `testIgnore: ["**/archive/**"]` 를 더했다. `archive/README.md`(보관 규칙·되살리는 법) 추가. 이동한 스펙 17개: auto-search-csa, commRoleMng-debug, mpp-ppd-revision-verify, phase12-quick, phase12-verify, round2-verify, round3-phase1-verify, round4-verify, round6-verify, round7-verify, round7b-fld-grid, round8-verify, round8b-detail-formurl, six-screens-snap, snapshot-9, snapshot-w5, w5-propagation-verify. 남은 스펙이 이 파일을 가리키던 주석 2곳(domainMng-grid-height, portal-tab-history)은 `archive/` 경로로 고쳤다.
- 바꾼 이유: 한 번 쓰고 끝난 스펙이 실행 목록과 컴파일 대상에 섞여 정식 회귀의 소음이 됐다. 이동은 조정 세션 승인을 받았다.
- 남긴 3개와 근거(이름만 보면 일회성 같지만 남김): w4-refactor-smoke 는 `docs/guide/.../part-d-mpn-shared-catalog.md:163` 이 E2E 스모크 정본으로 지정한다. phase2-planning-smoke 는 렌더 스모크다. rule-layout-diag 는 이름은 diag 지만 레이아웃 회귀 expect 가 있다. mpp-ppd-revision-verify 는 경계 사례였으나 정식 스모크 mpp-ppd-all-smoke 가 같은 화면을 맡고 있어 보관으로 옮겼다.
- 동작 보존 근거: `--list` 기본 217 -> 175(보관한 42개 테스트만 빠지고 나머지는 그대로). 스펙 파일 내용은 이동만 했다.
- 영향 범위: E2E 실행 목록. 보관 스펙은 실행·컴파일되지 않으므로 support 헬퍼를 바꿔 import 가 깨져도 고치지 않는다.
- 되돌리는 방법: b389e91c revert (17개가 `e2e/` 로 돌아오고 testIgnore 가 사라져 217개로 복귀).

## S11. E2E 공통 헬퍼 통합
- 커밋: c37fb04a(로그인·메뉴·PASSWORD), fc7c8e57(ag-grid 셀렉터), 39abfef7(대기 숫자 T 상수), ce8a8d0a(waitForTimeout 조건 대기), e1bd277f·dcab5073·9ffc450b(mdm-user 여정의 중복·셀렉터·대기 숫자), b905e2fc(FORMAT 선택 팝업 대기 상한 11초 복원·안 쓰는 BASE_URL import 제거), df1ad1e1(gridRowById 숫자 인자 String() 정리)
- 바뀌기 전: 스펙마다 로그인·메뉴 이동 함수와 PASSWORD 상수를 따로 갖고 있었다. ag-grid 본문 행 셀렉터(`.ag-center-cols-container .ag-row`)가 스펙에 직접 박혀 있었고, 대기 시간 숫자(20_000 등)가 흩어져 있었다. 기다릴 대상이 분명한 곳에도 고정 `waitForTimeout` 이 있었다. mdm-user 여정(dma~dme)은 로그인·오류 모달·resetClicks·closeTabs 를 파일마다 복사해 두었다.
- 바뀐 뒤:
  - 로그인·메뉴 이동·PASSWORD 를 `e2e/support/common.ts` 로 모았다(34개 파일, 282줄 추가·584줄 삭제).
  - ag-grid 본문 행·칸 셀렉터를 `e2e/support/grid.ts`(gridRows·gridRowById·gridRowByIndex·gridCells)로 모았다. mdm-user 쪽 직접 사용 52건도 같은 셀렉터 문자열을 만드는 헬퍼로 바꿨다. 컨테이너 없는 `.ag-row`·고정 열·컨테이너 안 testid 셀렉터는 의미가 달라 그대로 뒀다.
  - 대기 숫자를 T 상수로 올렸다(mdm-user: 20_000 -> T.UI 351건, 30_000 -> T.LONG 72건, 60_000 -> T.SLOW 30건). playwright 설정의 기본값과 같은 10_000(`playwright.config.ts` 쪽)·15_000(mdm-user 설정의 expect.timeout)은 인자에서 뺐다. 설정값과 다른 10_000·5_000·2_000 은 그대로 뒀다.
  - 기다릴 대상이 분명한 고정 쉼은 조건 대기로 바꿨다(7개 파일, 10줄 추가·12줄 삭제). 대상이 불분명하거나 부정 단언 앞의 쉼은 그대로 뒀다.
  - mdm-user 의 중복(로그인·expectErrorModal·resetClicks·closeAllTabs·VIEWPORT)을 `mdm-user/support.ts` 로 모았다. dmc 의 지역 gridRowById 는 공용 이름과 겹쳐 rowById 로 바꿨다.
  - b905e2fc 는 FORMAT 선택 팝업 대기 상한을 11초로 되돌린 fix 이고, 불필요한 BASE_URL import 를 지웠다. df1ad1e1 은 gridRowById 숫자 인자를 String() 으로 맞췄다.
- 바꾼 이유: 같은 코드를 스펙마다 고치던 비용을 줄이고, 대기 시간을 한 곳에서 조정하게 한다.
- 동작 보존 근거: `--list` 가 175(mdm-user 설정은 217)로 전후 동일. 서버를 띄워 실행한 결과 A군(일반 스펙) 회귀 0건이다. 실패 10건은 모두 리팩토링 전 스펙도 같은 오류로 실패했다(환경·데이터·메뉴 미시드). C군 mdm-user 여정은 217개 중 211 통과·1 실패·5 건너뜀이다. 실패한 TC-DMA-COL-02 는 공용 DB 의 용어 사전 데이터 상태 때문이다('판정값E2EX' 가 사전 적재 용어로 쪼개져 UNKNOWN 토큰 자리가 달라진다). 시험 코드는 전후 동일하다. dmd TC-DMD-CATE-04·05·08 은 통과했다.
- 영향 범위: E2E 스펙·support 코드. 앱 코드 변화 없음. 새 스펙은 support/common·support/grid·T 상수를 써야 한다.
- 되돌리는 방법: 위 커밋 revert. 앞 커밋 일부만 되돌리면 뒤 커밋이 support 헬퍼를 참조해 깨지므로 역순으로 되돌린다.

## S12. dmd 소속 편집 팝업 TransferList testid 반영
- 커밋: d825e20d
- 바뀌기 전: `mdm-user/dmd.user.ts` 가 소속 편집 팝업의 옛 testid 와 선택 뒤 이동 버튼 활성 조건을 따랐다.
- 바뀐 뒤: 팝업이 TransferList 로 바뀐 새 testid 와 이동 버튼 활성 조건에 맞췄다(1개 파일, 17줄 추가·16줄 삭제).
- 바꾼 이유: c3 레인 2차 커밋(72a0b65b)이 팝업을 TransferList 로 바꿨다. 이 시험이 따라가지 않으면 dmd 여정이 깨진다. c3 교차 리뷰에서 고칠 점 없음.
- 동작 보존 근거: dmd TC-DMD-CATE-04·05·08 통과(S11 의 C군 실행).
- 영향 범위: dmd 여정 시험만. 앱 코드 변화 없음. 이 시험은 c3 의 72a0b65b 이후 화면을 전제한다.
- 되돌리는 방법: d825e20d revert (c3 2차 이후 화면에서 dmd 소속 편집 시험이 실패한다).

## S13. E2E 기본값 결함 수정 (동작 변경)
- 커밋: ad7ba83a, 67610840
- 바뀌기 전: 포털 주소 기본값이 `127.0.0.1` 이었고 로그인 기본 아이디가 `admin@dmes.com` 이었다. master-rule-data·data-list·data-upload·frame 스펙은 `SMOKE_LOGIN_USER!`·`SMOKE_LOGIN_PASSWORD!` 를 기본값 없이 읽어 환경변수가 없으면 undefined 를 입력했다.
- 바뀐 뒤: 포털 주소 기본값을 `localhost`(`http://localhost:5100`), 기본 아이디를 `admin` 으로 고쳤다(ad7ba83a, 21개 파일). master-rule 4개 스펙은 `support/common` 의 LOGIN_USER·PASSWORD(기본 admin/admin123, 환경변수로 덮음)와 DEFAULT_BASE_URL 을 쓴다(67610840, 4개 파일).
- 바꾼 이유: 이것은 리팩토링이 아니라 fix 이며 동작이 달라진다. 원래 결함: 포털이 `127.0.0.1` 접속을 `localhost` 로 되돌려 세션이 끊겼고, `admin@dmes.com` 은 401 이었다. master-rule 4개는 환경변수 없이 돌리면 로그인할 수 없었다.
- 동작 보존 근거: 보존이 아니라 결함 수정이다. 환경변수로 값을 직접 주던 실행은 그대로이고, 기본값에 기대던 실행만 바뀐다. S11 의 서버 실행에서 기본값으로 로그인이 통과했다.
- 영향 범위: 환경변수 없이 E2E 를 돌리는 사람. 주소·계정이 다르면 환경변수로 덮어야 한다.
- 되돌리는 방법: ad7ba83a·67610840 revert (옛 결함이 돌아온다. 되돌릴 이유가 없다).

## S14. README 실행 안내 보강
- 커밋: b14822a3, 7d384f14 (README.md 한 파일, 스크립트 동작은 바꾸지 않음)
- 바뀌기 전: README 에 be-run 선빌드·`--dry-run`·재실행 때 이전 인스턴스 종료·`.run.env`/환경변수 우선순위·`dmes-up` 옵션이 없었다. Windows 문단은 ".run.env 는 셸 판과 동일" 이라고 적혀 있었다.
- 바뀐 뒤: 스크립트 표에 `--dry-run`·선빌드 링크와 `dmes-up`(Windows 전용) 줄을 더하고, 절 다섯 개를 추가했다(98줄 추가).
  - 백엔드 선빌드: 모듈 2개 이상이면 루트 `gradlew -m` 으로 계획 → Gradle 1회 선빌드 → 모듈별 bootRun. 계획·선빌드가 실패하면 아무 모듈도 띄우지 않는다(sh 종료 코드 1, ps1 은 계획 실패 1·빌드 실패 Gradle 코드). `BE_PREBUILD=0` 으로 끄고 `BE_PREBUILD_CONTINUE=1` 이면 실패해도 띄운다.
  - 드라이런: 서버·포트를 건드리지 않고 계획만 출력하되, 선빌드 대상이면 `gradlew -m` 을 한 번 부른다. 모듈 1개나 `BE_PREBUILD=0` 이면 부르지 않는다.
  - 모듈을 나중에 하나 더 띄울 때: 같은 체크아웃의 이전 be-run 을 TERM(최대 30초 대기 뒤 KILL)으로 끝낸다. ps1 판 `Stop-PreviousBeRuns` 는 체크아웃을 가리지 않는다. local-run 과의 상호작용은 코드를 읽어 적은 것이며 실측이 아니다.
  - `.run.env`·환경변수 우선순위 표: sh 는 source(같은 이름은 마지막 줄, `BE_PREBUILD*` 는 `.run.env` 가 환경변수를 덮음), ps1 은 줄 파싱(첫 줄, `BE_PREBUILD*` 는 환경변수 우선, `*_RUN_ARGS` 는 `.run.env` 만).
  - `dmes-up` 옵션 표: `-Detach`·`-Be`·`-Fe`·`-Full`·`-Clean`, `-Warmup` 은 아무 동작도 하지 않는다(`-Be` 일 때만 안내를 내고 `-Fe` 만 줄 때는 출력이 없다). 7d384f14 가 이 안내 조건과 이전 인스턴스 종료 설명을 코드에 맞게 고쳤다.
  - Windows 문단에서 ".run.env 는 셸 판과 동일" 을 고치고 S16 체크리스트를 링크한다.
- 바꾼 이유: 1b 1차·2차에서 바뀐 실행 동작이 문서에 없어 사용자가 선빌드 실패 중단·재실행 때 종료 같은 동작을 코드를 읽어야만 알 수 있었다.
- 동작 보존 근거: 문서만 바꿨다. 내용은 be-run.sh·be-run.ps1·local-run.*·fe-run.*·dmes-up.ps1·scripts/lib 를 읽고 적었다.
- 영향 범위: README 독자만. 코드·설정 변화 없음.
- 되돌리는 방법: b14822a3·7d384f14 revert (README 만 이전으로 돌아간다).

## S15. dmes-up.ps1 -Detach 에서 백엔드가 먼저 끝나면 FE 정리 (동작 변경)
- 커밋: 4aa617fe
- 바뀌기 전: `-Detach` 는 백엔드·프런트를 동시에 WMI 로 띄운다. be-run.ps1 선빌드가 실패해 백엔드 런처가 포트를 열기 전에 끝나면 대기 루프가 exit 1 로 빠졌지만 프런트(fe-run.ps1 → pnpm/node)는 남아 "화면은 뜨는데 백엔드는 없는" 상태가 됐다. 포그라운드 local-run.ps1 은 이때 FE 까지 정리한다.
- 바뀐 뒤: 그 분기에서 `$Fe` 이고 프런트 pid 가 있으면 `Stop-Tree $fePid` 로 트리를 끊고, `Stop-Prior` 를 두 번 더 쓴다(`_launch-frontend.ps1` 심, 이 저장소 `src\frontend` 의 node·pnpm. 3단계의 `-Fe` 이전 실행 정리와 같은 대상). 반환 개수는 `$null` 로 받는다. 머리말도 이에 맞게 고쳤고, `BE_PREBUILD`·`BE_PREBUILD_CONTINUE` 는 `-Detach` 에서 `.run.env` 에 두라고 적었다(WMI 로 만든 프로세스가 이 창의 환경변수를 물려받지 않을 수 있다, 미검증). 14줄 추가·2줄 삭제.
- 바꾼 이유: 포그라운드와 같게 백엔드 없이 FE 만 남지 않도록 한다(리뷰 낮은 지적 반영).
- 동작 보존 근거: 보존이 아니라 동작 변경이다. 구문 분석·실행 모두 하지 못했다(이 PC 에 pwsh 가 없고 설치하지 않기로 했다). 확인 항목은 S16 체크리스트에 있다.
- 영향 범위: `dmes-up.ps1 -Detach` 에서 백엔드가 포트를 열기 전에 끝난 경우. 한계: 대기 시간 초과(8분) 분기는 바꾸지 않아 FE(5100)·node 가 그대로 남는다 — 이때는 `dmes-down.cmd` 로 정리해야 한다. 파일은 ASCII·CRLF 그대로다.
- 되돌리는 방법: 4aa617fe revert (옛 잔류 FE 문제가 돌아온다).

## S16. Windows ps1 확인 체크리스트 문서
- 커밋: 83378e9b, 7d384f14 (`docs/refactor-2026-10/windows-ps1-checklist.md` 신규 238줄, 7d384f14 가 6줄 추가·1줄 삭제)
- 바뀌기 전: 1b 레인 1·2차에서 바뀐 ps1 동작을 Windows 에서 확인할 목록이 없었다.
- 바뀐 뒤: be-run.ps1·fe-run.ps1·local-run.ps1·dmes-up.ps1·dmes-down.ps1·scripts/lib/modules.ps1 의 변경을 항목별로(실행 명령·기대 결과·확인 방법·관련 커밋·결과 칸) 모았다. 첫머리에 "이 PC 에 pwsh 가 없고 설치하지 않으므로 하나도 확인하지 못했다, 설치는 사용자 선택" 을 적었다. 구문 분석·인코딩, 카탈로그, be-run 드라이런·선빌드·실패 경로·종료 정리·이전 인스턴스 종료, dmes-up `-Warmup`·`-Detach`, dmes-down, fe-run 5100, local-run 인자 분류를 다룬다.
  - 코드를 읽어 찾은 의심 항목을 확인 거리로 남겼다(고치지 않음): dmes-up 3단계 Stop-Prior 의 `^javaw?$` 가 `java.exe` 와 맞지 않을 수 있음, Stop-PreviousBeRuns 가 체크아웃을 가리지 않음, be-run.ps1 `--help` 의 도움말 키워드 부재, `-Detach` 의 환경변수 전달, `.run.env` 줄 파서.
  - 7d384f14: 3-9 항목에 `Stop-PreviousBeRuns` 가 `/F` 없는 `taskkill /T` 후 30초 대기 뒤 `/F` 로 넘어가므로 창 B 가 30초 멈출 수 있고, 강제 종료되면 앱 JVM 이 남을 수 있다는 점을 단정하지 않는 확인 거리로 더했다. `-Detach` 항목에 8분 시간 초과 분기의 한계(S15)를 더했다.
- 바꾼 이유: pwsh 없이 바뀐 ps1(S3·S4·S5·S15)을 Windows 에서 확인할 때 쓸 근거를 남기기 위해서다.
- 동작 보존 근거: 문서만 추가했다.
- 영향 범위: 없음(문서). 체크리스트 결과 칸은 비어 있다.
- 되돌리는 방법: 83378e9b·7d384f14 의 체크리스트 부분 revert (7d384f14 는 README 도 고쳤으므로 파일 단위로 되돌린다).

## S17. E2E mdm 스모크 스크린샷 기본 출력 위치 이동 (동작 변경)
- 커밋: 32b6827b
- 바뀌기 전: `mdm-sample-smoke.spec.ts`·`mdm-shell-rbac-smoke.spec.ts` 가 돌 때마다 추적 중인 `docs/mdm/tasks/TSK-01-02·TSK-01-03/screens/*.png` 를 덮어써 시험만 돌려도 작업 트리가 더러워졌다.
- 바뀐 뒤: `support/common.ts` 에 `WRITE_TASK_SCREENS` 와 `taskScreenshotPath(taskId, name)` 를 더했다. 기본은 `test.info().outputPath(name)` 즉 `src/frontend/test-results/<시험>/` (`src/frontend/.gitignore` 의 `test-results/` 로 git 제외). `E2E_WRITE_TASK_SCREENS=1` 일 때만 종전 경로 `<저장소 루트>/docs/mdm/tasks/<taskId>/screens/<name>` 에 쓴다. 두 스펙이 이 도우미를 쓰고 머리말·주석에 안내를 적었다(3개 파일, 33줄 추가·16줄 삭제). 단언·시험 수는 그대로다.
- 바꾼 이유: 시험 실행이 추적 파일을 덮어쓰는 부작용 제거. 승인용 화면을 일부러 갱신할 때만 옵트인한다.
- 동작 보존 근거: 시험 로직은 그대로이고 저장 위치만 바뀌었다. 실제 시험 실행은 하지 않았다(서버 기동·공용 DB 를 건드리지 않음).
  - `playwright test --list`: 175개(40 파일), `-c playwright.mdm-user.config.ts --list`: 217개(7 파일). 바꾸기 전과 목록이 같다(두 스펙의 줄 번호만 다름). `E2E_WRITE_TASK_SCREENS=1` 에서도 175개.
  - `git check-ignore -v src/frontend/test-results/x/a.png` → `src/frontend/.gitignore:20:test-results/` 로 제외됨.
  - 임시 옵션(tsc --noEmit --strict --module commonjs)으로 바뀐 세 파일만 타입 검사해 통과.
- 영향 범위: 이 두 스펙을 돌리는 사람. 기본 실행으로는 docs 의 png 가 더는 갱신되지 않으므로, 승인 화면을 갱신하려면 `E2E_WRITE_TASK_SCREENS=1` 을 줘야 한다. docs/mdm/tasks 에 쓰는 다른 스펙 15개(mdm-termMng·domainMng·columnMng·codeMng 등)는 범위 밖이라 그대로다. 같은 도우미로 옮길 수 있다.
- 되돌리는 방법: 32b6827b revert (실행마다 추적 png 를 덮어쓰는 옛 동작이 돌아온다).

### S14~S17 검증 요약 (이 브랜치 5개 커밋, 범위 `dd3f59e5..HEAD`)
- `playwright test --list` 175개·217개 불변(S17 커밋 메시지에 기록된 실행 결과).
- `git check-ignore`: `test-results/` 제외 확인.
- `bash -n be-run.sh fe-run.sh local-run.sh` 통과(이 브랜치는 셸 스크립트를 바꾸지 않았다).
- pwsh 미검증: S15 의 dmes-up.ps1 변경과 S14·S16 이 서술한 ps1 동작은 구문 분석·실행 모두 하지 못했다.
- gradle·서버 기동·playwright 시험 실행은 하지 않았다.

## 2차 공통: 판정 방법과 기준선 (S18~S23)

2차 항목의 "동작 보존 근거"는 아래 두 가지 판정을 공통으로 쓴다. 도구와 절차는 S23 이 저장소에 남겼다.

- 덤프 두 종류의 diff: `src/backend` 의 includeBuild 모듈 15개(프로젝트 32개, 의존성 파일 244개)마다 Gradle 을 1회 돌려, 해석 가능한 모든 구성의 의존성 해석 결과(deps·buildEnvironment·configurations)와 설정값(플러그인·Test jvmArgs·inputs·JavaCompile 인자·jar/war 활성 여부 등)을 파일로 남기고 앞뒤를 비교한다. 비교 대상은 404개 파일이다. 허용 차이는 판정 전에 패턴 파일로 고정한다.
- 시험: 루트 `testAll` 은 서브프로젝트 시험을 돌리지 않으므로(S20), 모듈별로 `:lib:test`·`:api:test` 같은 서브프로젝트 test 태스크를 직접 나열해 돌리고, 실행된 시험 수와 실패 목록을 기준선과 비교한다. 로그에서 `:test FROM-CACHE` 가 0건인지도 확인한다(Test 캐시 제외 유지 확인).
- 기준선은 2차 직전 dev(`dd3f59e5`, 덤프 폴더 pre2)다. 이 기준선의 시험 수는 mcm-core 887, mcm lib 18·api 43, mls lib 8·api 50, mdm lib 1652·api 1638, mpn·mpp·mqc lib 각 2, cactus-core 853(건너뜀 1)·oasis-core 686(건너뜀 1), caravan-hub 78, aps-core 3, caravan-core 102, caravan-console 58, maru-mdm-engine 1606 이고 모두 실패 0이다. analog 는 core 158·api 30 가운데 83건(core 79, api 4)이 기준선에서도 실패한다.
- 기존 빌드 실패 2건은 2차 이전부터 있었고 2차에서 고치지 않았다.
  - cactus-core 를 자기 폴더에서 `build` 하면 `:oasis-core:checkstyleTest` 가 `cactus-core/config/checkstyle/checkstyle.xml` 이 없어 실패한다(2차 직전 dev 에서도 같은 실패를 확인했다). 루트 composite 의 `buildAll` 로 돌리면 이 실패는 나지 않는다.
  - caravan-hub 는 `com.dongkuk.caravan:caravan-core:3.0.0` 을 루트 composite 의 includeBuild 치환으로만 풀기 때문에 자기 폴더에서 단독으로 빌드하거나 해석할 수 없다. 그래서 15개 전체 덤프의 오류 14줄은 항상 이 caravan-hub 단독 해석 불가이고, 기준선·2차 모든 덤프에서 `known-errors-15.txt` 와 바이트 단위로 같다. caravan-hub 시험은 루트 `src/backend` 에서 `:caravan-hub:test` 로 돌린다.
- 리팩토링 전 기준점(`b557ccbd`, 덤프 base2)과 2차 직전 dev(`dd3f59e5`, 덤프 pre2)의 덤프는 4개 파일이 다르다. 이 차이는 2차가 아니라 1차(S6·S9, cactus-core 시험의 sqlite-jdbc·hibernate 방언)에서 생겼다. 해석 버전이 바뀐 좌표 3개는 sqlite-jdbc(선언 3.45.3.0, 해석 3.50.3.0), hibernate-community-dialects(해석 7.2.12.Final), jboss-logging(hibernate-community-dialects 아래 새로 생긴 전이 줄, 선언 3.6.1.Final, 해석 3.6.3.Final)이고, 모두 cactus-core 의 시험 런타임 클래스패스에만 나타난다. 나머지 두 파일은 S7·S8 의 시험 입력 선언 줄이다.

## S18. 백엔드 버전 카탈로그 도입 (버전 불변)
- 커밋: 1adfcf85 (43개 파일, 568줄 추가·313줄 삭제)
- 바뀌기 전: includeBuild 모듈 14개의 `build.gradle` 이 의존성 좌표와 버전을 문자열로 직접 적고(예: `org.xerial:sqlite-jdbc:3.45.3.0`), 플러그인 `version` 도 파일마다 따로 적었다. 같은 좌표의 버전이 모듈마다 다른 곳도 있었다. 카탈로그는 analog 만 자기 것을 갖고 있었다.
- 바뀐 뒤:
  - `src/backend/gradle/libs.versions.toml` 을 새로 만들었다(versions 8·libraries 89·plugins 2). 버전은 `version`·`version.ref` 로만 적고(`strictly`·`enforcedPlatform` 은 쓰지 않는다), 버전을 Spring Boot BOM 이 정하던 선언은 `module` 만 둔다. BOM 은 `platform()` 그대로다. `sqlite-jdbc 3.45.3.0` 처럼 BOM 이 덮어쓰는 선언 버전도 값을 그대로 적었다.
  - included build 14개의 `build.gradle` 선언을 `libs.*` 참조로, 플러그인 `version` 을 alias 로 바꿨다. 각 included build 의 `settings.gradle` 에 `versionCatalogs { libs { from(files('../gradle/libs.versions.toml')) } }` 를 더했다. 루트 `src/backend` 는 `gradle/libs.versions.toml` 을 자동으로 가져오므로 다시 선언하지 않는다.
  - 모듈마다 버전이 다른 좌표 6개는 별칭을 나눠 값을 그대로 뒀다: mybatis-spring-boot-starter(`-v304`·`-v305`), cactus-core(소비판 `cactus-core-v1020` 과 자기판 `versions.cactus-core`), jackson-databind(`-managed`·`-v2182`), hibernate-community-dialects(`-managed`·`-v705`), caffeine(`-managed`·`-v320`), maru-mdm-engine(`-versioned`·`-unversioned`). 이 가운데 mybatis 만 S22 에서 하나로 합쳤고 나머지 5개는 그대로 남아 있다.
  - analog 는 카탈로그를 쓰지 않는다. 자기 `gradlew` wrapper 와 자기 `gradle/libs.versions.toml` 을 가진 별도 빌드라서 루트 카탈로그를 가져오지 않는다. oasis 빌드 파일과 oasis 가 읽는 cactus-core 의 `ext` 값도 고치지 않았다(oasis 는 하드코딩이 남아 있다).
  - cactus-core 는 자기 판이 `1.0.22-SNAPSHOT`, 다른 모듈이 소비하는 선언 판이 `1.0.20-SNAPSHOT` 으로 값이 둘이다. includeBuild 가 프로젝트로 치환하므로 해석에는 영향이 없다. 두 값을 맞추는 일은 이 항목의 범위 밖이라 별건으로 남겼고 S22 도 건드리지 않았다.
- 바꾼 이유: 버전을 한 파일에서 보고 고치게 하고, 이후 build-logic(S19)과 버전 통일(S22)의 바탕을 만든다. 이 항목은 버전을 바꾸지 않는다.
- 동작 보존 근거: 의존성 해석 덤프와 설정값 덤프를 2차 직전 dev(pre2)와 비교했다. 404개 파일이 모두 같다(허용 차이만 제외).
  - 허용 차이는 두 가지다. 하나는 카탈로그가 생긴 표시(settings 덤프의 `versionCatalogs` 줄과 프로젝트별 `catalog.libs` 줄, 각 15줄·32줄이 양쪽에 같은 수로 걸러졌다). 다른 하나는 caravan-hub 의 `ext.camelVersion = 4.20.0` 삭제(카탈로그 `versions.camel` 로 옮겼다)이고 pre2 쪽 1줄이다.
  - 덤프 도구가 caravan-hub 단독 해석 불가 때문에 종료코드 3(판정 불가)을 내므로, `_errors.txt` 14줄이 `known-errors-15.txt` 와 바이트 단위로 같은지를 확인해 "동일" 로 판정했다.
  - `build -x test`: 모듈 12개가 exit 0 이고, cactus-core(checkstyle 설정 없음)와 caravan-hub(단독 빌드 불가) 2건은 기존 실패라 pre2 와 같다.
- 영향 범위: 백엔드 빌드 파일 14개의 선언 방식. 새 의존성은 `libs.*` 로 적는다. 해석 결과·산출물은 같다. 기존 빌드 실패 2건(cactus-core 단독 빌드의 oasis checkstyle 설정 파일 없음, caravan-hub 단독 빌드 불가)은 그대로다.
- 되돌리는 방법: 1adfcf85 revert. 단 S19 의 dmes.business-module 과 S22 가 카탈로그를 읽으므로 S22, S19, S18 순으로 역순 되돌린다.

## S19. build-logic convention plugin 과 settings 헬퍼 도입
- 커밋: d456a866(③-a), 00461248(③-b), 03abab9b(③-c), d77c94d9(③-d), 25b89567(③-e)
- 바뀌기 전:
  - 14개 모듈의 루트 `build.gradle` 끝에 같은 Test 관례 블록(캐시 제외 사유 `doNotCacheIf` 와 JIT 옵션 `-XX:TieredStopAtLevel=1 -XX:ReservedCodeCacheSize=240m`)이 복사돼 있었다.
  - mpn·mpp·mqc·mls·mcm 다섯 모듈의 루트 `build.gradle` 은 diff 0 으로 같은 본문이었다(group·version·저장소, Java 21, 컴파일 인코딩·`-parameters`, lombok·시험 의존, `useJUnitPlatform()`).
  - `settings.gradle` 마다 `includeBuild` 와 `dependencySubstitution` 블록이 반복됐다(루트 `settings.gradle` 은 includeBuild 15개분을 펼쳐 적었다).
  - 일부 빌드 파일 주석이 사실과 달랐다.
- 바뀐 뒤:
  - ③-a: `src/backend/build-logic` 을 만들었다(`groovy-gradle-plugin` 의 precompiled script plugin 빌드, Gradle API·Groovy 만 쓰고 외부 의존·저장소가 없다). `dmes.test-conventions` 는 위 Test 블록을 줄 그대로 옮겼다. 적용 범위는 그대로 allprojects 이고(cactus-core 가 끌어오는 oasis-core·oasis-core-api 포함), 루트 프로젝트가 아닌 곳에 적용하면 실패하게 막았다. 14개 모듈(aps-core·caravan-core·caravan-hub·caravan-console·mcm-core·cactus-core·maru-mdm-engine·mdm·localKafka·mpn·mpp·mqc·mls·mcm)의 `plugins {}` 에 `id 'dmes.test-conventions'` 를, `settings.gradle` 맨 앞에 `pluginManagement { includeBuild('../build-logic') }` 를 더했다. 루트 `src/backend`·analog·oasis 는 바꾸지 않았다. 낡은 주석(`gradle.properties` 10개의 "각 모듈 build.gradle 에서 캐시에서 뺐다")과 `docs/guide/BackEnd/Backend-Implementation-Guide.md` 10.1.2 의 새 모듈 안내 한 줄도 이 커밋에서 고쳤다.
  - ③-b: 다섯 업무 모듈의 같은 본문을 `dmes.business-module` 로 합쳤다(6개 파일, 79줄 추가·180줄 삭제). precompiled plugin 에는 카탈로그 접근자가 없어 같은 `libs` 카탈로그를 `findLibrary` 로 찾는다. 루트 `plugins {}` 순서는 java, spring 두 플러그인(`apply false`), `dmes.business-module`, `dmes.test-conventions` 이고 원래 스크립트 실행 순서와 같다. lib·api 서브프로젝트는 합치지 않았다(lib 는 모듈마다 의존성이 다르고 `SpringBootPlugin.BOM_COORDINATES` 를 써서 build-logic 이 spring-boot 플러그인에 의존해야 하며, api 는 war 이름과 boot·war 적용 순서에 기대기 때문이다). mdm·localKafka 루트는 본문이 달라 대상이 아니다.
  - ③-c: `src/backend/gradle/include-builds.settings.gradle` 이 `dmesIncludeBuild(경로, 좌표)` 헬퍼를 만든다. 본문은 원래 블록(`includeBuild(경로) { dependencySubstitution { substitute module(좌표) using project(':') } }`)과 같고 치환을 늘 명시한다. 루트 `src/backend`(15개)·mpn(4)·mcm(4)·mpp·mqc·mls·mdm(각 3)·cactus-core(1)에 적용했다(9개 파일, 82줄 추가·182줄 삭제). 모듈마다 포함 대상 집합·순서와 좌표 예외(`com.dongkuk.caravan:caravan-console·caravan-core·caravan-hub`, `kr.dongkuk.maru.mdm:maru-mdm-engine`)는 그대로이고, 전후 (경로, 좌표) 목록을 스크립트로 대조해 같음을 확인했다.
  - ③-d: mdm/build.gradle 과 cactus-core/settings.gradle 의 낡은 주석을 사실대로 고쳤다. ③-e: `dmes.test-conventions` 에 "모듈 test 블록에서 `jvmArgs` 를 `=` 로 대입하면 관례가 덮이니 추가 형태로 쓴다" 는 주석 한 줄을 더했다(지금 대입하는 곳은 analog/api 뿐이고 analog 는 이 플러그인을 쓰지 않는다).
- 제약 한 줄: Gradle 9.3.1 에서는 precompiled script plugin 안에서 `apply from` 을 부르면 구성 단계에서 ClassLoaderScope 오류(`UnknownServiceException`)가 나므로, `test-slot.gradle` 은 플러그인으로 옮기지 못하고 각 모듈 루트 `build.gradle` 끝의 `apply from: file('../gradle/test-slot.gradle')` 로 남겼다(analog 와 함께 쓰는 단일 구현이라 `gradle/test-slot.gradle` 은 그대로다). 가이드 10.1.2 의 새 모듈 안내가 이 제약과 settings·plugins·끝 `apply from` 세 곳을 적는다.
- 커밋 체인을 다시 썼다: 처음에는 test-slot 도 플러그인으로 옮겼으나(체인 e48a0303·7831ad2f·e57e5538·3fcbad11·044d632c) 판정에서 위 오류로 실패했다. 그래서 ③-a 를 고쳐 쓰고 뒤 커밋을 다시 얹었다. 옛 체인은 브랜치 `archive/1b-build-logic-pre-slotfix` 에 보존했다(삭제 여부는 마감 보고에서 사용자가 정한다).
- 바꾼 이유: 같은 블록을 14곳·5곳에 복사해 두면 한 곳만 고치고 나머지를 빠뜨리기 쉽다. 의존성 없는 관례만 플러그인으로 모아 한 곳에서 고치게 한다.
- 동작 보존 근거:
  - 덤프 비교: ① 결과 대 ③ 결과, 그리고 pre2 대 ③ 결과 모두 404개 파일이 같다(허용 차이만 제외, pre2 대 ③ 은 A 54줄·B 80줄 걸러냄). 허용 차이는 모듈 루트의 플러그인 줄 `dmes.test-conventions` 14개·`dmes.business-module` 5개, 루트 buildEnvironment 의 build-logic 항목 14개(9+5), 루트 classpath 가 비어 있던 6개 모듈의 "No dependencies" 줄뿐이다. lib·api 서브프로젝트 파일에는 차이가 없다. 허용 패턴은 판정 전에 고정했다.
  - test-slot 이전은 `DMES_TEST_SLOTS=2` 로 뜬 덤프 쌍(caravan-hub 제외 14개 모듈)에서 387개 파일이 같다(`requiredServices` 줄 포함).
  - `build -x test`: analog 포함 13개 모듈과 루트 composite 의 buildAll 계획(`-m`)이 exit 0 이고, cactus-core 만 기존 실패다.
  - 시험: 14개 모듈(S19 대상)과 analog 의 시험 수·실패 목록이 기준선과 같다(위 기준선 수치와 일치, analog 는 158+30 중 실패 83건 동일·새 실패 0). 로그에서 test 태스크 `FROM-CACHE` 0건이고 캐시 제외 사유 문구가 같다(`doNotCacheIf` 유지).
- 영향 범위: 백엔드 빌드 파일(모듈 14개의 `build.gradle`·`settings.gradle`, 루트 `settings.gradle`), 가이드 10.1.2 한 줄(`docs/guide/BackEnd/Backend-Implementation-Guide.md`). 새 모듈을 추가하는 사람은 `pluginManagement` 와 `id 'dmes.test-conventions'` 와 끝 `apply from` 을 모두 넣어야 한다. lib·api 의 중복(③-b 에서 뺀 것)은 그대로 남아 있다. 기존 빌드 실패 2건(cactus-core 단독 빌드, caravan-hub 단독 빌드)은 영향이 없다.
- 되돌리는 방법: 체인 역순으로 revert(25b89567 부터 d456a866 까지). ③-b 는 ③-a 의 `dmes.test-conventions` 를 쓰고 ③-c 는 settings 앞부분을 공유하므로 일부만 되돌리면 깨진다.

## S20. buildAll·testAll·cleanAll 에 mcm-core·mls·caravan-console·analog 추가 (동작 변경)
- 커밋: 01c3d678, 54e6f2ca(루트 build.gradle 주석 한 줄 포함, 나머지는 S21)
- 바뀌기 전: 루트 `src/backend/build.gradle` 의 `includedProjectNames` 가 11개(mpn·aps-core·cactus-core·mpp·mqc·mcm·localKafka·caravan-core·caravan-hub·mdm·maru-mdm-engine)였고 `settings.gradle` 의 `dmesIncludeBuild` 는 15개였다. mcm-core·mls·caravan-console·analog 는 `buildAll`·`testAll`·`cleanAll` 에 없었다. 주석은 "5개 프로젝트" 라고 적혀 있었다.
- 바뀐 뒤: `includedProjectNames` 를 15개로 늘려 `settings.gradle` 의 집합과 같게 했다(11줄 추가·4줄 삭제, `tasks.register` 세 블록은 그대로). 낡은 주석을 고치고, `testAll` 이 각 included build 루트의 `:test` 만 부른다는 한계를 주석으로 적었다. 54e6f2ca 는 그 한계 목록에 cactus-core 의 oasis-core·oasis-core-api 를 더했다.
- 바꾼 이유: 루트에서 `buildAll` 을 돌려도 네 모듈이 빠져 있어 빌드 실패나 시험 회귀를 그 자리에서 못 잡았다.
- 동작 보존 근거: 보존이 아니라 동작 변경이다. 실측 결과는 다음과 같다.
  - `gradlew -m buildAll testAll` 태스크 목록은 pre2 와 비교해 44줄이 늘었고(analog 12·caravan-console 12·mls 12·mcm-core 8) 모두 `:analog:`·`:caravan-console:`·`:mls:`·`:mcm-core:` 접두다. 빠진 줄은 빈 줄 하나뿐이다.
  - 설정값·의존성 덤프는 pre2 대비 허용 차이 외 diff 0 이다(S19 판정에 포함).
  - `buildAll` 을 실제로 1회 돌렸다(1b 칸, ④ 이후 트리): BUILD SUCCESSFUL in 1m 52s, 74 actionable tasks(46 실행·21 캐시·7 최신). `:mcm-core:build`·`:mls:build`·`:caravan-console:build`·`:analog:build` 가 모두 실행되어 네 개가 포함됨을 확인했다. mcm-core·caravan-console 는 `:test` 도 실행됐고 mls·analog 의 루트 `:test` 는 NO-SOURCE 다.
- 영향 범위: 루트에서 `buildAll`·`testAll`·`cleanAll` 을 쓰는 사람과 `.dflow-gates` 의 full 게이트(`testAll`). 빌드·시험·정리 대상이 네 모듈만큼 늘어 시간이 늘어난다. 기존 빌드 실패 2건은 루트 composite 에서는 나타나지 않았다(composite 의 `buildAll` 에서 cactus-core·caravan-hub 가 모두 성공했다).
  - 한계(④b 후속): `testAll` 은 각 included build 루트의 `:test` 만 부른다. mpn·mpp·mqc·mcm·mls·analog 는 루트에 시험 소스도 서브프로젝트 집계도 없어 루트 `:test` 가 NO-SOURCE 이므로 lib·api 시험이 돌지 않고, 집계하는 곳은 mdm/build.gradle 한 곳뿐이다. cactus-core 의 oasis-core·oasis-core-api 도 돌지 않는다. 그래서 이 항목으로 `testAll` 에서 실제로 늘어나는 시험은 단일 프로젝트인 mcm-core(887)와 caravan-console(58)뿐이다. `.dflow-gates` 의 `:mcm:test` 등도 같은 이유로 서브프로젝트 시험을 돌리지 않는다(저장소를 읽어 정적으로 확인했고 이번 판정에서 시험 수로도 확인했다). 서브프로젝트 시험 집계(④b)는 `testAll` 시간을 크게 늘리는 동작 변경이라 넣지 않았고, 조정 세션이 후속으로 정했다.
- 되돌리는 방법: 01c3d678 revert (목록이 11개로 돌아간다). 54e6f2ca 의 주석 부분은 한계 목록 한 줄이라 따로 되돌릴 필요가 없다.

## S21. 시험 입력 정리: mdm/api 의 DataInitializer.java 제거, mcm-core 의 BPMN 2개 선언 (C1·C2)
- 커밋: 8bb30ee4(C1, mdm), 5c6f2383(C2, mcm-core), 54e6f2ca(관련 주석 두 곳)
- 바뀌기 전: `mdm/api/build.gradle` 의 `test` 입력 `inputs.files(…)`(propertyName `mcmDataInitializer`)에 mcm/api 의 `init/DataInitializer.java` 가 들어 있었다. mdm 시험 소스(api·lib)에는 이 파일을 읽는 곳이 0건이다. 반대로 mcm-core 의 `ScreenUsageOasisContractTest` 는 `mcm/api/src/main/resources/services/audit/screenUsage.bpmn`·`csa/screenUsageStat.bpmn` 을 읽는데 입력으로 선언되지 않았다.
- 바뀐 뒤:
  - C1: mdm/api 시험 입력에서 `DataInitializer.java` 한 줄을 뺐다(2줄 추가·3줄 삭제). `seed/MdmMenuSeeder.java`·`seed/CoreRbacSeeder.java` 두 개와 propertyName 은 그대로다(덤프 줄 이름과 a6 레인의 `.dflow-gates` 주석이 가리키는 이름을 유지). `MdmOasisActionVocabularyTest` 가 mcm/api `init` 아래에서 읽는 파일은 이 두 시드뿐이다.
  - C2: mcm-core 시험에 `inputs.files(…)`(propertyName `mcmScreenUsageBpmn`, 경로 민감도 RELATIVE)로 위 BPMN 2개를 더했다(4줄 추가). 기존 `mcmSeedSources`(DataInitializer 포함)는 `ScreenUsageMssqlDdlTest` 가 읽으므로 그대로다.
  - 54e6f2ca: `dmes.test-conventions` 의 외부 입력 예시를 C1·C2 에 맞게 고치고, mcm-core 의 "ScreenUsageSchemaArtifacts.java 가 없을 수 있다" 는 낡은 주석(a6 2단계 머지로 파일이 있다)을 지웠다.
- 바꾼 이유: Gradle 은 선언된 입력이 바뀌지 않으면 시험을 다시 돌리지 않는다. 읽지 않는 파일을 입력에 두면 쓸데없이 다시 돌고, 읽는 파일을 입력에 안 두면 그 파일을 고쳐도 시험이 UP-TO-DATE 로 건너뛴다.
- 동작 보존 근거: 시험 코드와 시험 수는 그대로이고 입력 선언만 바뀐다.
  - 덤프 비교(③ 결과 대 C1·C2 이후): 404개 파일이 같고 허용 패턴 3줄만 걸러졌다(A 1줄·B 2줄). 설정 덤프에서 mdm api 의 `mcmDataInitializer` 줄에서 `DataInitializer.java` 항목만 빠지고, mcm-core 설정에 `mcmScreenUsageBpmn` 줄 한 개가 생겼다. 의존성 덤프 diff 는 0 이다.
  - 이 트리에서 `mcm-core :test`(13초)와 `mdm :api:test`(1분 29초)를 실제로 돌려 BUILD SUCCESSFUL 이고 UP-TO-DATE 로 건너뛰지 않았다. S22 이후 시험(mcm-core 887, mdm lib 1652·api 1638)도 기준선과 같다.
- 영향 범위: mdm `:api:test` 와 mcm-core `:test` 의 최신 여부 판정. 이제 `DataInitializer.java` 만 고쳐도 `:mdm:api:test` 는 다시 돌지 않고(읽지 않으므로 정당), 두 BPMN 만 고쳐도 `:mcm-core:test` 가 건너뛰지 않는다. `.dflow-gates` 줄의 갱신은 a6 레인이 맞춘다(C1·C2 변경은 a6 레인에 통지한다).
- 되돌리는 방법: 8bb30ee4 또는 5c6f2383 을 각각 revert (둘은 서로 독립이다). 54e6f2ca 는 주석이라 되돌릴 필요가 없다.

## S22. mybatis-spring-boot-starter 3.0.5 통일 (동작 변경)
- 커밋: 2a95c5e7 (4개 파일, 4줄 추가·5줄 삭제)
- 바뀌기 전: mybatis-spring-boot-starter 가 cactus-core(`api`)·mcm-core(`compileOnly`)에서는 3.0.4, caravan-hub(`implementation`)에서는 3.0.5 였다. 카탈로그에는 `-v304`·`-v305` 두 항목이 있었다(S18).
- 바뀐 뒤: 카탈로그의 두 항목을 3.0.5 한 항목 `mybatis-spring-boot-starter` 로 합치고, 소비 3곳(cactus-core·mcm-core·caravan-hub)의 별칭을 바꿨다. 다른 통일 후보(cactus-core 1.0.20·1.0.22, jackson-databind, hibernate-community-dialects, caffeine, maru-mdm-engine, mybatis 3.5.16 선언, junit-bom)는 건드리지 않았다. oasis 쪽 시험의 mybatis-spring 3.0.4(cactus-core ext·oasis 하드코딩)도 그대로 남는다.
- 바꾼 이유: 같은 좌표의 판이 둘이면 어느 판이 클래스패스에 올지 모듈 조합에 따라 달라진다. 가장 단순한 통일은 최신 판(3.0.5)이다.
- 동작 보존 근거: 보존이 아니라 해석 버전이 바뀌는 변경이다. 직전 판정 덤프(C1·C2 이후)와 이 커밋 덤프를 비교했다.
  - 다른 파일 69개이고 모두 의도한 곳이다. 해석이 바뀐 좌표는 4개다: mybatis-spring-boot-starter 3.0.4 에서 3.0.5, mybatis-spring-boot-autoconfigure 3.0.4 에서 3.0.5, mybatis-spring 3.0.4 에서 3.0.5, mybatis 3.5.17 에서 3.5.19(이미 3.5.17 에서 3.5.19 로 올라가 있던 구성은 표기만 바뀐다). 영향 모듈은 cactus-core·mcm-core 와 cactus-core 를 `api` 로 쓰는 업무 모듈 mdm·mpn·mpp·mqc·mcm·mls 이다. 설정 덤프 차이는 업무 모듈 6개의 `api` 프로젝트에서 bootJar·bootWar 에 담기는 jar 파일 목록(mybatis 판 이름)뿐이다.
  - caravan-hub 덤프는 diff 0 이다(원래 3.0.5).
  - mybatis 3.0.5 의 pom 이 전이로 선언하는 spring-boot-starter·spring-boot-starter-jdbc·spring-boot-autoconfigure 의 선언 버전이 3.4.0 에서 3.5.0 으로 바뀌었다. 해석 결과는 4.0.6 으로 불변이다(Spring Boot BOM 이 덮는다). 조정 세션이 org.mybatis 변경의 일부로 승인했다.
  - 시험(이 커밋 트리): mcm-core 887, mcm lib 18·api 43, mls lib 8·api 50, mdm lib 1652·api 1638, mpn·mpp·mqc lib 각 2, cactus-core 853(건너뜀 1)·oasis-core 686(건너뜀 1), caravan-hub 78 이고 모두 실패 0 이며 기준선과 같다.
- 영향 범위: mybatis 를 쓰는 업무 모듈(mdm·mpn·mpp·mqc·mcm·mls)과 cactus-core·mcm-core 의 런타임 클래스패스. mybatis 가 3.5.17 에서 3.5.19 로 올라간다. 운영에서는 3.0.4 를 쓰던 모듈이 3.0.5 로 바뀐다는 점을 반영 때 확인해야 한다. 기존 빌드 실패 2건은 영향이 없다.
- 되돌리는 방법: 2a95c5e7 만 revert 한다. 이 커밋이 2차의 마지막 단독 커밋이라 회귀가 생기면 이것만 빼면 된다(카탈로그의 별칭이 `-v304`·`-v305` 로 돌아간다).

## S23. 빌드 불변 판정 도구 scripts/build-verify 보관
- 커밋: 7cf41d92 (9개 파일, 1160줄 추가)
- 바뀌기 전: 2차 판정에 쓴 덤프·비교 도구가 작업 폴더에만 있어 같은 판정을 다시 할 수 없었다.
- 바뀐 뒤: `scripts/build-verify/` 에 다음을 두었다. `dump-deps.sh`(모듈마다 Gradle 1회로 덤프), `dump-deps.init.gradle`(해석 가능한 모든 구성의 의존성 보고와 buildscript classpath), `dump-settings.init.gradle`(플러그인·extensions·카탈로그 확장·ext·저장소·Test·JavaCompile·jar/war 활성 여부·JavaExec·구성 선언), `compare.sh`(두 덤프 비교, 허용 패턴 거르기, `--flat`), 2차 판정에 쓴 허용 패턴 `allow-cat1.txt`·`allow-logic3.txt`·`allow-j4.txt`, 알려진 오류 `known-errors-15.txt`, 사용법 `README.md`. 저장소 위치는 스크립트 위치에서 계산하고 `JAVA_HOME`·heavy 칸 변수는 호출 환경에서만 받으며 PC 마다 다른 경로는 걷어 냈다. `compare.sh` 종료코드는 0(동일)·1(다름)·2(사용 오류)·3(내용은 같으나 판정 불가)이다.
- 판정 절차 요약(README §3):
  1. 같은 커밋을 두 번 떠서 diff 0 인지(결정성) 본다.
  2. 앞뒤를 단계에 맞는 허용 패턴으로 비교해 덤프 두 종류의 diff 가 0 인지 본다. 버전을 일부러 바꾸는 단계(S22 같은 경우)는 허용 파일 없이 diff 본문이 의도한 좌표에만 있는지 읽는다.
  3. `build -x test` 가 통과하는지 본다.
  4. 서브프로젝트 시험을 `:lib:test`·`:api:test` 처럼 직접 나열해 돌려 시험 수와 실패 목록이 기준선과 같은지(새 실패 0) 비교한다. 실패가 기준선에도 있는 것(analog 83건)은 제외하고 비교한다.
- 바꾼 이유: 이후 빌드 정리(버전 통일, 플러그인 이전 등)에서 같은 방법으로 "해석 결과·설정이 불변" 을 보이기 위해서다.
- 동작 보존 근거: 앱·빌드에서 호출하지 않는 도구를 추가했을 뿐이다. 도구 자체는 다음과 같이 확인했다.
  - 민감도: 일반 의존 버전·BOM 이 덮는 선언 버전·Test jvmArgs·저장소 순서·JavaCompile 인코딩을 일부러 바꾼 다섯 사례가 모두 종료코드 1 로 잡혔다.
  - 결정성: 같은 트리 재덤프와 `--no-daemon` 재덤프 diff 0, 15개 전체 두 번 diff 0(404개 파일).
  - 이식: 이 위치로 옮긴 뒤 build 워크트리의 mpn 덤프가 2차 기준 덤프와 `compare.sh` 종료코드 0(39개 파일, 원본 `diff -r` 도 0)이었다. 경고는 도구 해시(2차 판정판 `91715d590272ce22`, 이식판 `0122bb21c81e45ad`)와 `java-home` 두 줄뿐이다. 해시가 다른 이유는 init 스크립트의 첫 줄 주석과 태스크 description 문자열만 고쳤기 때문이다.
  - `bash -n` 이 두 스크립트에서 통과했다.
- 영향 범위: 없다(`scripts/build-verify/` 신규, 다른 코드에서 참조하지 않는다). 한계는 README §4 에 있다: caravan-hub 단독 해석 불가(§ 위 기존 실패), 루트 composite 에서만 생기는 설정(`buildAll` 등)은 덤프 대상이 아니다, macOS 에서만 확인했다.
- 되돌리는 방법: 7cf41d92 revert (`scripts/build-verify/` 가 사라진다).

### S18~S23 검증 요약
- 덤프 판정: ① 대 pre2, ③ 대 ①·pre2, C1·C2 대 ③ 모두 404개 파일이 허용 차이 외 같다. ② 는 의도한 4좌표(와 전이 선언)에만 차이가 있다.
- 시험: 위 기준선 수치와 ③ 뒤·② 뒤가 모두 같고 실패 0 이다(analog 기준선 실패 83건 동일, 새 실패 0). test 태스크 `FROM-CACHE` 는 0건이었다.
- buildAll 1회 실행 성공(S20), 기존 빌드 실패 2건은 변하지 않았다.
- 미실시: 서브프로젝트 시험을 루트 `testAll` 로 집계하는 일(④b, 후속)과 analog 시험 실패 83건 해소는 하지 않았다.
