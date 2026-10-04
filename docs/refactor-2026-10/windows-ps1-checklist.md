# Windows 확인 체크리스트 — 빌드·스크립트 레인 ps1 변경 (refactor/build)

> **이 문서의 항목은 아직 아무것도 확인하지 않았다.** 이 레인이 일하는 PC(macOS)에는 `pwsh` 가 없고, 조정 세션 결정으로
> 설치하지 않았다. 그래서 아래 ps1 변경은 구문 분석조차 돌려 보지 못했다(커밋 메시지에도 "미검증"으로 적었다).
> 이 PC 에 `pwsh` 를 설치해 구문만이라도 볼지는 **사용자 선택**이다. 실제 동작 확인은 Windows PC(Windows PowerShell 5.1)에서 한다.

- 대상: `be-run.ps1`, `fe-run.ps1`, `local-run.ps1`, `dmes-up.ps1`, `dmes-down.ps1`, `scripts\lib\modules.ps1` (+ 공용 카탈로그 `scripts\lib\modules.conf`)
- 범위: 1b 레인 1차·2차 커밋 중 ps1 동작을 바꾼 것 — `5f545cfa` `4cbd6d9c` `f71b7c4a` `be51ac2e` `8d91843f` `e9a28ff5` `aa139e31` `4aa617fe`
  (`98f4ecb8`·`ca48ef8f`·`fa746e92` 는 sh 쪽만 바꿨다. `modules.conf` 는 `ca48ef8f` 에서 생겨 ps1 도 읽는다.)
- 동작 설명은 루트 [README.md](../../README.md) §"빌드·실행" 의 하위 절(선빌드·드라이런·재실행·`.run.env` 우선순위·dmes-up)과 같다.
- 결과는 각 항목의 `결과:` 칸에 적는다(통과 / 실패 + 관찰 내용 / 건너뜀 + 사유).

## 0. 준비와 안전 수칙

- Windows PowerShell 5.1(`powershell.exe`), JDK 21(`~\.jdks\*21*` — dmes-up 이 찾는 위치), Node.js·pnpm.
- 저장소를 **확인 전용으로 따로 clone** 해서 쓴다. 실패 경로(선빌드 실패·lib 없음)는 소스를 일부러 깨야 하므로 그 사본에서만 한다.
- `be-run.ps1` 은 명령줄에 `be-run.ps1` 이 든 **PC 의 모든 프로세스**를 이전 인스턴스로 보고 끝낸다(B9). 같은 PC 에서 다른 체크아웃의 be-run.ps1 이 돌고 있으면 먼저 멈춘다.
- 포트: 포털 5100 · mls 8092 · mqc 8093 · mpp 8094 · mpn 8095 · mcm 8100 · analog 8191. 확인 전에 비어 있어야 한다.
- 포트 확인 명령(이하 "포트 확인"):
  ```powershell
  5100,8092,8093,8094,8095,8100,8191 | % { $c = Get-NetTCPConnection -LocalPort $_ -State Listen -EA SilentlyContinue; "$_ " + ($(if ($c) { "LISTEN pid=$($c.OwningProcess)" } else { 'free' })) }
  ```

## 1. 구문·인코딩

### 1-1. 여섯 파일 구문 분석
- 실행:
  ```powershell
  foreach ($f in 'be-run.ps1','fe-run.ps1','local-run.ps1','dmes-up.ps1','dmes-down.ps1','scripts\lib\modules.ps1') {
    $e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $f), [ref]$null, [ref]$e); "$f errors=$($e.Count)" }
  ```
- 기대: 여섯 줄 모두 `errors=0`.
- 확인 방법: 출력. 오류가 있으면 `$e | fl` 로 줄 번호를 남긴다.
- 관련 커밋: 전부(특히 손으로 고친 `4aa617fe` `f71b7c4a` `5f545cfa`).
- 결과:

### 1-2. 인코딩·줄 끝
- 실행: `Format-Hex .\be-run.ps1 -Count 3` (fe-run.ps1·local-run.ps1·scripts\lib\modules.ps1 도), dmes-up.ps1·dmes-down.ps1 은 첫 바이트가 `23`(`#`)인지.
- 기대: 한글이 든 네 파일은 `EF BB BF`(UTF-8 BOM), dmes-up.ps1·dmes-down.ps1 은 BOM 없이 ASCII. 여섯 파일 모두 CRLF(clone 직후 `git ls-files --eol *.ps1 scripts/lib/*.ps1` 이 `w/crlf`).
- 확인 방법: 각 스크립트를 실행했을 때 한글 로그가 깨지지 않는다(2절 이후 항목에서 함께 본다).
- 관련 커밋: `8d91843f`(modules.ps1 신설), `4aa617fe`(dmes-up.ps1 ASCII 유지).
- 결과:

## 2. 모듈 카탈로그 (`scripts\lib\modules.ps1`)

### 2-1. modules.conf 읽기
- 실행: `. .\scripts\lib\modules.ps1; $DmesBeModules; $DmesBeTagColors; $DmesPortalPort`
- 기대: `$DmesBeModules` 순서대로 mls 8092 · mqc 8093 · mpp 8094 · mpn 8095 · mcm 8100 · analog 8191 (**mdm 없음** — modules.conf 에서 sh 전용). 색은 be-mls Cyan · be-mqc Yellow · be-mpp Green · be-mpn Magenta · be-mcm Blue · be-analog DarkGray. `$DmesPortalPort` 는 5100.
- 확인 방법: 출력. CRLF 체크아웃에서도 이름·포트에 `\r` 이 붙지 않는다(`$DmesBeModules.Keys | % { $_.Length }` 가 3·3·3·3·3·6).
- 관련 커밋: `8d91843f`, `ca48ef8f`.
- 결과:

### 2-2. mdm 은 ps1 에서 받지 않는다
- 실행: `.\be-run.ps1 --mdm --dry-run`; `$LASTEXITCODE`
- 기대: `[error] 알 수 없는 옵션: --mdm`, 종료 코드 2.
- 관련 커밋: `8d91843f`.
- 결과:

## 3. be-run.ps1

### 3-1. 도움말
- 실행: `.\be-run.ps1 --help`
- 기대: 머리말(사용법·선빌드·BE_PREBUILD 안내)이 보이고 종료 코드 0.
- 확인 방법: 출력. **주의할 점** — 머리말 주석에 `.SYNOPSIS` 같은 도움말 키워드가 없어 `Get-Help -Detailed` 가 이름·구문만 보일 수 있다(1b 이전부터 있던 구조). 그렇게 나오면 "기존 동작" 으로 적고 별도 개선 거리로 남긴다.
- 관련 커밋: `5f545cfa`(머리말 선빌드 안내 추가).
- 결과:

### 3-2. 드라이런 — 2개 이상
- 실행: 포트 확인 → `.\be-run.ps1 --all --dry-run`; `$LASTEXITCODE` → 포트 확인
- 기대:
  - `[dry-run] 기동 대상: mls mqc mpp mpn mcm analog`, `이전 be-run 인스턴스 종료 뒤 포트 회수: 8092 … 8191`
  - `[dry-run] 1) 선빌드 계획: (cd …\src\backend) …\gradlew.bat :mls:api:bootRun … -m -q --console=plain`
  - `[dry-run] 2) 선빌드 (Gradle 1회, 태스크 N개)` 아래 태스크 목록(`:` 로 시작, `bootRun` 없음). 참고로 sh 판 7개 모듈은 84개였다 — 6개 모듈이면 조금 적다.
  - `계획·선빌드가 실패하면 아무 모듈도 띄우지 않고 종료 (우회: …)`, 이어서 모듈별 `cmd /c ""…gradlew.bat" :api:bootRun --args=--spring.profiles.active=local --console=plain"`
  - 종료 코드 0. 앞뒤 포트 확인 결과가 같다(아무것도 띄우거나 끄지 않음).
- 확인 방법: 출력과 포트 확인. 계획을 위해 Gradle 을 한 번 부르므로 몇 초~수십 초 걸리는 것은 정상.
- 관련 커밋: `5f545cfa`, `f71b7c4a`.
- 결과:

### 3-3. 드라이런 — 1개는 Gradle 을 부르지 않는다
- 실행: `.\be-run.ps1 --mcm --dry-run`
- 기대: `[dry-run] 선빌드 생략 (모듈 1개 또는 BE_PREBUILD=0)`, 곧바로 끝난다. 새 `java.exe` 가 생기지 않는다.
- 확인 방법: 실행 전후 `Get-Process java -EA SilentlyContinue | measure` 개수 비교.
- 관련 커밋: `5f545cfa`.
- 결과:

### 3-4. 옵션만 주면 BE_RUN_ARGS·`--all` 로
- 실행: (a) `.run.env` 없이 `.\be-run.ps1 --dry-run` (b) `.run.env` 에 `BE_RUN_ARGS="--mcm --mpn"` 을 두고 `.\be-run.ps1 --dry-run` (c) `.\be-run.ps1 --bogus`
- 기대: (a) `.run.env 없음 — 기본값 --all 로 진행` 후 6개 대상 (b) `.run.env 기본 옵션 사용: BE_RUN_ARGS=--mcm --mpn`, 대상 mcm mpn (c) `알 수 없는 옵션: --bogus`, 종료 코드 2.
- 관련 커밋: `f71b7c4a`.
- 결과:

### 3-5. BE_PREBUILD 우선순위 (환경변수가 이긴다 — sh 와 반대)
- 실행:
  1. `$env:BE_PREBUILD='0'; .\be-run.ps1 --all --dry-run` → 선빌드 생략
  2. `Remove-Item Env:BE_PREBUILD`; `.run.env` 에 `BE_PREBUILD=0` → 같은 명령 → 선빌드 생략
  3. `.run.env` 의 `BE_PREBUILD=0` 을 둔 채 `$env:BE_PREBUILD='1'` → 같은 명령 → **선빌드 계획이 나온다**(환경변수 우선)
  4. `BE_PREBUILD_CONTINUE` 도 같은 방식: `$env:BE_PREBUILD_CONTINUE='1'` 이면 드라이런 끝에 `계획·선빌드가 실패해도 기동을 이어 간다`
- 기대: 위 화살표대로. 셸 판은 3번에서 `.run.env` 가 이긴다(README 표).
- 관련 커밋: `5f545cfa`, `f71b7c4a`.
- 결과:

### 3-6. 실제 기동 — 선빌드 뒤 bootRun 은 컴파일하지 않는다
- 실행: `.\be-run.ps1 --mcm --mpn` → 기동 완료 뒤 Ctrl+C
- 기대: `[be] 선빌드 시작 (태스크 N개, Gradle 1회)` → `[be-build] …` 로그 → `[be] 선빌드 완료` → `be-mcm`·`be-mpn` 시작 → 8100·8095 LISTEN. bootRun 로그의 `compileJava` 등이 `UP-TO-DATE`.
- 확인 방법: 로그와 포트 확인. 새 clone 첫 실행이면 선빌드가 수 분 걸린다.
- 관련 커밋: `5f545cfa`.
- 결과:

### 3-7. 종료 — 이 체크아웃의 앱 JVM 만, Gradle 데몬은 남긴다
- 실행: 3-6 실행 중에 8100 리스너를 본다:
  `$p = (Get-NetTCPConnection -LocalPort 8100 -State Listen).OwningProcess; (Get-CimInstance Win32_Process -Filter "ProcessId=$p").CommandLine`
  → 그 창에서 Ctrl+C → 포트 확인 → `src\backend\gradlew.bat --status`
- 기대:
  - 명령줄(또는 그 안의 `@인자파일` 내용)에 `<clone>\src\backend\mcm\` 이 들어 있다 — Test-OwnBackendJvm 이 이 문자열로 "이 체크아웃 것" 을 가린다.
  - Ctrl+C 뒤 `be-mcm 포트 8100 앱 JVM 정리 (pid=…)` 로그, `정리 완료. (Gradle 데몬은 그대로 둔다 …)`. 8100·8095 free.
  - `gradle daemon 정리 중...` 같은 `--stop` 흔적이 없고, `--status` 에 데몬이 IDLE 로 남아 있다(10분 뒤 스스로 내려간다).
- 관련 커밋: `be51ac2e`.
- 결과:

### 3-8. 선빌드 실패 → 기동하지 않음 (확인용 clone 에서)
- 준비: 확인용 clone 에서 모듈 하나(예: `src\backend\mls\api\src\main\java\…` 의 아무 클래스)에 컴파일 오류를 넣는다. 끝나면 `git checkout -- .` 로 되돌린다.
- 실행: (a) `.\be-run.ps1 --mls --mcm`; `$LASTEXITCODE` (b) `$env:BE_PREBUILD_CONTINUE='1'; .\be-run.ps1 --mls --mcm` (c) `$env:BE_PREBUILD='0'; .\be-run.ps1 --mls --mcm`
- 기대:
  - (a) `선빌드 실패 (exit=…)` → `선빌드가 실패해 백엔드 모듈을 띄우지 않고 종료한다`, 우회 안내 두 줄, 0 이 아닌 종료 코드(Gradle 코드, 보통 1). `be-mls`·`be-mcm 시작` 줄이 없고 8092·8100 free.
  - (b) `BE_PREBUILD_CONTINUE=1 — 선빌드 실패에도 …` 뒤 두 모듈을 띄우고, mls 는 자기 로그에 같은 컴파일 오류를 내며 끝난다. mcm 은 뜬다.
  - (c) 선빌드 없이 종전처럼 모듈별 bootRun.
- 확인 방법: 출력·종료 코드·포트 확인.
- 계획 실패(`gradlew -m` 실패)는 `src\backend\settings.gradle` 을 일부러 깨면 볼 수 있다: 기대는 `선빌드 계획(gradlew -m) 실패` + 출력 끝 15줄, 종료 코드 1.
- 관련 커밋: `f71b7c4a`.
- 결과:

### 3-9. 이전 인스턴스 종료 (현재 동작 기록)
- 실행: 창 A 에서 `.\be-run.ps1 --mcm` → 기동 뒤 창 B 에서 `.\be-run.ps1 --mpn`
- 기대: 창 B 에 `이전 be-run 인스턴스 종료 대기 (pid …)` 가 찍히고 창 B 는 mpn 을 띄운다. README §"모듈을 나중에 하나 더 띄울 때" 의 의도한 동작은 창 A 의 be-run 이 정리되며 8100 이 내려가는 것이다. 다만 아래 두 가지는 단정하지 말고 결과대로 적는다.
  - be-run.ps1 `Stop-PreviousBeRuns` 는 먼저 `/F` 없는 `taskkill /T` 를 보내고 30초(`Wait-ProcessExit`) 기다린 뒤에야 `/F` 로 죽인다. 창 없는 콘솔 powershell 은 보통 `/F` 없이는 안 끝나므로 창 B 가 30초 멈춰 있다가 강제 종료로 넘어갈 수 있다.
  - 강제 종료되면 창 A 의 정리 블록이 돌지 않아, Gradle 데몬의 자식인 앱 JVM(예: mcm 8100)이 남을 수 있다. 그 경우 이어지는 포트 회수 단계(`Clear-PortListener`)가 대상 모듈 포트만 정리하므로, 대상이 아닌 모듈의 포트는 계속 점유된 채일 수 있다.
- 확인할 거리: (1) 창 B 의 `이전 be-run 인스턴스 종료 대기` 줄 뒤 30초 대기가 생기는지(초 단위로 잰다). (2) 창 B 가 mpn 을 띄운 뒤 8100 이 남아 있는지(`Get-NetTCPConnection -LocalPort 8100`)와 그 프로세스 이름·부모. 남았다면 개선 거리(`/F` 먼저 쓰기, 또는 데몬 자식 정리)로 기록한다.
- 함께 볼 것: 이 판정은 명령줄에 `be-run.ps1` 만 있으면 **다른 체크아웃의 것도** 잡는다(셸 판은 이 체크아웃만). 두 번째 clone 에서 be-run.ps1 을 띄워 둔 상태로 창 B 를 실행했을 때 그쪽도 끝나는지 적는다 — 끝난다면 셸 판처럼 범위를 좁히는 개선 거리다.
- 관련 커밋: `be51ac2e`(cleanup 내용 변경). 판정 범위 자체는 1b 이전부터 같다.
- 결과:

## 4. dmes-up.ps1

### 4-1. `-Warmup` 은 아무 동작도 하지 않는다
- 실행: `.\dmes-up.cmd -Warmup -Be` (끝나면 Ctrl+C)
- 기대: `[up] -Warmup is no longer needed - be-run.ps1 prebuilds on every run` 한 줄. `warmup mcm ...`·`serial gradle warm-up` 같은 직렬 warm-up 로그가 없고 곧바로 be-run.ps1 로 넘어가 선빌드한다.
- 관련 커밋: `4cbd6d9c`.
- 결과:

### 4-2. `-Detach` 정상 경로
- 실행: `.\dmes-up.cmd -Detach` → 끝나면 `.\dmes-down.cmd`
- 기대: `backend started (pid …) -> logs\be.log`, `frontend started …`, `waiting for ports (up to 8 minutes, including the backend prebuild …)`, `up: …` 7줄(6개 모듈 + portal 5100), `all services up`, 포털 주소 `http://localhost:5100`. `logs\be.log` 에 선빌드 시작·완료.
- 확인 방법: 출력, `logs\be.log`, 포트 확인. dmes-up 창을 닫아도 서버가 남는다.
- 관련 커밋: `4cbd6d9c`, `f71b7c4a`, `8d91843f`, `e9a28ff5`.
- 결과:

### 4-3. `-Detach` 선빌드 실패 → FE 도 정리 (미검증 수정)
- 준비: 3-8 과 같이 확인용 clone 에 컴파일 오류.
- 실행: `.\dmes-up.cmd -Detach`; `$LASTEXITCODE` → 포트 확인 →
  `Get-CimInstance Win32_Process | ? { $_.CommandLine -like "*$PWD\src\frontend*" -or $_.CommandLine -like '*_launch-frontend.ps1*' } | select ProcessId, Name`
- 기대: 대기 중 `backend exited before coming up (not up: …) - check logs\be.log`, `prebuild failed? …`, **`stopping the frontend started above`**, 종료 코드 1. 이후 5100 free, 위 프로세스 조회 결과가 비어 있다. `logs\be.log` 에 선빌드 실패 로그.
- 확인 방법: 출력·포트·프로세스 조회. 수정 전에는 5100 과 node 가 남았다.
- 알려진 한계: 4aa617fe 의 FE 정리는 '포트가 열리기 전에 백엔드가 종료된' 분기에만 있다. 8분 대기 시간 초과 분기(`not up after 8 min: …`, 종료 코드 1)는 FE 를 정리하지 않으므로 FE(5100)와 node 가 그대로 남는다. 느린 선빌드로 시간 초과가 났을 때 확인하면 `dmes-down.cmd` 로 정리해야 한다. 개선 거리로만 적고 이 항목의 통과 조건에는 넣지 않는다.
- 함께 볼 것: 이 분기는 선빌드 실패뿐 아니라 "백엔드 런처가 포트를 열기 전에 끝난 모든 경우"(포트 회수 실패 등)에 탄다.
- 관련 커밋: `4aa617fe`(이 레인에서 고쳤고 실행해 보지 못했다), `f71b7c4a`.
- 결과:

### 4-4. `-Detach` 와 환경변수 (확인 필요)
- 실행: 정상 소스에서 `$env:BE_PREBUILD='0'; .\dmes-up.cmd -Detach -Be` → `logs\be.log` 확인 → `dmes-down.cmd` → `Remove-Item Env:BE_PREBUILD`, `.run.env` 에 `BE_PREBUILD=0` → 다시 실행
- 기대: `.run.env` 쪽은 be.log 에 `선빌드 시작` 이 **없다**. 환경변수 쪽은 결과를 그대로 적는다 — `선빌드 시작` 이 보이면 WMI(`Win32_Process.Create`)로 만든 프로세스가 호출 창의 환경변수를 물려받지 않는다는 뜻이고, README·dmes-up 머리말의 "-Detach 에서는 .run.env 에" 안내가 맞다.
- 관련 커밋: `f71b7c4a`(머리말의 "as environment variables or in .run.env"), `4aa617fe`(-Detach 는 .run.env 권장 문구).
- 결과:

### 4-5. 이전 실행 정리의 java 이름 패턴 (기존 결함 의심)
- 실행: `'java.exe' -match '^javaw?$'` 그리고 서버가 떠 있을 때 `Get-CimInstance Win32_Process -Filter "Name='java.exe'" | select -First 1 Name`
- 기대(코드 읽기로 본 예상): 첫 식은 `False`, `Name` 은 `java.exe`. 그렇다면 dmes-up.ps1 3단계 `Stop-Prior -PathNeedle $BackendDir -NamePattern '^javaw?$'` 는 java 를 하나도 잡지 못하고, 포트 회수(리스너만)가 대신한다 — 포트를 아직 열지 않은 java(선빌드 중인 Gradle 등)는 남는다. node 쪽 `'^(node|pnpm)'` 은 `node.exe` 에 맞는다.
- 결과에 따라 `'^javaw?(\.exe)?$'` 로 고치는 별도 항목을 낸다(이 레인에서는 고치지 않았다).
- 관련 커밋: 1b 이전부터 있던 코드(`4cbd6d9c` 가 같은 파일을 고쳤으나 이 줄은 그대로).
- 결과:

### 4-6. 포그라운드
- 실행: `.\dmes-up.cmd` → 기동 뒤 Ctrl+C
- 기대: 포털·모듈 포트 안내(modules.conf 값) 뒤 local-run.ps1 로 BE·FE 기동, Ctrl+C 한 번에 둘 다 정리. 백엔드 대상은 `.run.env` 의 `BE_RUN_ARGS`(없으면 `--all`).
- 관련 커밋: `8d91843f`, `e9a28ff5`.
- 결과:

## 5. dmes-down.ps1

### 5-1. Gradle 데몬을 멈추지 않는다
- 실행: 4-2 뒤 `.\dmes-down.cmd` → `src\backend\gradlew.bat --status`
- 기대: `[down] stopping pid: …` → `[down] all ports free`. 데몬 정지 단계가 없고 `--status` 에 데몬이 남아 있다(쉬면 10분 뒤 내려간다).
- 관련 커밋: `be51ac2e`.
- 결과:

### 5-2. 포트 목록은 modules.conf 에서
- 실행: 아무것도 안 떠 있을 때 `.\dmes-down.cmd`
- 기대: `[down] nothing running from this repo`, `[down] all ports free`. 일부러 5100 을 다른 프로그램으로 물려 두면 `[down] still listening: 5100`.
- 관련 커밋: `8d91843f`.
- 결과:

### 5-3. modules.ps1 이 없으면 실패로 끝난다 (확인용 clone 에서)
- 실행: `Rename-Item scripts\lib\modules.ps1 modules.ps1.bak` → `.\dmes-down.ps1`; `$LASTEXITCODE` → 이름 되돌리기
- 기대: `[down] missing …\scripts\lib\modules.ps1 - cannot check ports`, 종료 코드 1. 프로세스 정리 단계는 그 앞에서 정상으로 돈다. `all ports free` 가 나오면 실패.
- 관련 커밋: `aa139e31`.
- 결과:

## 6. fe-run.ps1

### 6-1. 포털 포트 5100
- 실행: `.\fe-run.cmd --all -q` → 기동 뒤 Ctrl+C
- 기대: 포털이 5100 에서 LISTEN(종전 스크립트의 5000 이 아니다). 5100 을 미리 물려 두면 그 프로세스를 정리한다는 로그에 5100 이 찍힌다.
- 관련 커밋: `e9a28ff5`, `8d91843f`.
- 결과:

## 7. local-run.ps1

### 7-1. 인자 분류
- 실행: (a) `.\local-run.ps1 --mdm` (b) `.\local-run.ps1 --bogus` (c) `.\local-run.ps1 --all -q --mcm`
- 기대: (a)(b) `알 수 없는 옵션: …`, 종료 코드 2 — `--mdm` 이 BE 전용으로 분류돼 조용히 버려지지 않는다. (c) `--mcm` 은 BE 플래그라 무시하고 FE 에 `--all -q` 만 넘긴다(BE 대상은 `.run.env` 의 `BE_RUN_ARGS`). 런처 안내의 포털 주소가 `http://localhost:5100`.
- 관련 커밋: `aa139e31`, `8d91843f`.
- 결과:

### 7-2. 백엔드가 끝나면 FE 도 정리
- 실행: 3-8 의 컴파일 오류 상태에서 `.\local-run.ps1 --all -q`
- 기대: be-run.ps1 이 선빌드 실패로 끝난 뒤 `[launcher] 백엔드(be-run.ps1)가 종료됐습니다 …` → `종료 신호 수신, 자식 스크립트 정리 중...` → `정리 완료.` 5100 free.
- 관련 커밋: `f71b7c4a`(be-run 이 실패 시 0 이 아닌 코드로 끝남).
- 결과:

## 8. `.run.env` 파싱 차이 (기록용)

- 실행: `.run.env` 에 각각 한 줄씩 두고 `.\be-run.ps1 --dry-run` 의 `BE_RUN_ARGS=` 안내를 본다.
  (a) `export BE_RUN_ARGS="--mcm"` (b) `BE_RUN_ARGS="--mcm" # 포털만` (c) `BE_RUN_ARGS="--mcm"` 다음 줄에 `BE_RUN_ARGS="--mpn"`
- 기대(코드 읽기로 본 예상): (a) 그 줄을 읽지 못해 파일이 있어도 `.run.env 없음 — 기본값 --all 로 진행` 이 나오고 6개 대상 (b) 값에 주석이 섞여 `알 수 없는 옵션` 으로 끝난다 (c) 첫 줄 `--mcm` 이 이긴다(셸 판은 마지막 줄 `--mpn`).
- 결과에 따라 README §".run.env 와 환경변수 우선순위" 표를 고친다.
- 관련 커밋: 1b 이전부터 같은 파서(`Read-RunEnvValue`). `5f545cfa`·`f71b7c4a` 가 같은 파서로 `BE_PREBUILD*` 를 읽게 했다.
- 결과:

## 확인 뒤 할 일

- 실패 항목은 조정 세션에 결과와 함께 넘긴다. 4-3(`4aa617fe`)이 실패하면 그 커밋을 되돌리는 것이 먼저다.
- 4-4·4-5·3-9·3-1 결과는 README 와 개선 항목(범위 좁히기·이름 패턴·도움말 키워드)에 반영한다.
