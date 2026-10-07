# _shared/bin: 동봉 실행 파일(윈도우용 jq)

윈도우에는 node 와 Git Bash 만 있다고 보므로, 스킬 스크립트가 쓰는 `jq` 를 이 폴더에 동봉한다. 설치 단계가 필요 없다.

## 구성

| 파일 | 내용 |
|---|---|
| `win64/jq.exe` | jq 1.8.2 공식 윈도우 64비트 빌드(`jq-windows-amd64.exe`). arm64 윈도우는 에뮬레이션으로 돈다. |
| `jq` | POSIX sh 래퍼. `jq.exe -b "$@"` 로 실행한다. `-b` 는 윈도우에서 출력 줄끝이 CRLF 로 바뀌는 것을 막는다. |
| `jq-LICENSE.txt` | jq 1.8.2 의 `COPYING`(MIT 와 포함 라이브러리 고지, 1.8 에서 NetBSD `strptime` 고지가 추가되었다). 재배포 때 함께 둔다. |

## 출처와 무결성

- 내려받은 곳: `https://github.com/jqlang/jq/releases/download/jq-1.8.2/jq-windows-amd64.exe`
- 받은 날짜: 2026-10-07. 같은 릴리스의 `sha256sum.txt` 와 대조해 일치했고, 릴리스 증명서도 `gh attestation verify jq-windows-amd64.exe --bundle jq-attestation.json -R jqlang/jq` 로 통과했다.
- SHA-256: `a6fc67fedaf9128a3309a1e2ebb8b986aeccf70122ee46d2cb4849e423f0c627`
- 크기: 1,035,264 바이트
- 확인 명령(macOS·Git Bash): `sha256sum .claude/skills/_shared/bin/win64/jq.exe`(macOS 는 `shasum -a 256`). 값이 다르면 쓰지 말고 조정자에게 알린다.
- 버전을 올릴 때는 이 표와 위 값을 함께 고친다. 새 릴리스의 `sha256sum.txt` 와 대조한 뒤 커밋한다.

## 어떻게 켜지나

윈도우(Git Bash)에서만 이 폴더를 PATH 앞에 둔다. macOS·Linux 는 PATH 를 건드리지 않으므로 기존 jq 를 그대로 쓴다.

- coordinator 스크립트: `coordinator/scripts/lib/compat.sh` 가 `COMPAT_WIN=1` 일 때 PATH 앞에 둔다(`common.sh` 가 source).
- dflow-* 스크립트: 각 진입 스크립트 머리말에 같은 한 줄이 있다.
  `case "${COMPAT_FORCE_OS:-$(uname -s)}" in windows|MINGW*|MSYS*|CYGWIN*) PATH="<_shared>/bin:$PATH" ;; esac`
- 시험에서 윈도우를 흉내 낼 때는 `COMPAT_FORCE_OS=windows` 와 `SKILLS_JQ_EXE=<mac 의 jq 경로>` 를 준다.

## 알려진 한계

- 해결됨: 각 문서 앞의 PATH 안내(`platform-support.md` 「문서 속 인라인 jq」). 스크립트 안에서만 PATH 가 바뀌므로, 스킬 문서에 적힌 인라인 `… | jq …` 예시(`dflow-team/SKILL.md`, `dflow-merge/SKILL.md`, `dflow-team/references/restart.md`·`backends.md` 등 약 30곳)를 에이전트가 Bash 도구로 직접 칠 때는 **호출마다** 같은 호출 맨 앞에 `export PATH="$PWD/.claude/skills/_shared/bin:$PATH";` 를 붙여야 한다(Bash 도구는 호출 사이에 셸 환경을 유지하지 않는다). macOS·리눅스는 필요 없다. `coordinator/` 문서의 인라인 예시는 별도 레인이 정리한다.
- 이 폴더(`_shared`)를 빼고 `dflow-*` 폴더만 다른 저장소에 심링크하거나 복사하면 머리말이 `_shared/bin` 을 찾지 못해 조용히 꺼진다. `_shared` 를 함께 배포한다(머리말은 `cd -P` 로 실제 경로 기준 `../../_shared` 를 찾는다).
- 1.7.1 에서 1.8.2 로 올렸다(2026-10-07). 1.7.1 의 CVE-2024-23337·CVE-2024-53427·CVE-2025-48060 은 1.8.0 에서, 그 뒤 CVE 20여 건(힙 버퍼 오버플로·NUL 잘림·스택 오버플로 등)은 1.8.2 에서 고쳐졌다. 윈도우 동봉본만 올렸고 macOS 는 시스템 jq(1.7.1)를 그대로 쓰므로 두 환경의 jq 버전이 다르다. macOS 도 올리려면 `brew install jq` 로 1.8.x 를 받아 PATH 앞에 둔다(이 저장소는 시스템 jq 를 바꾸지 않는다).
- 1.8 에서 달라진 동작 중 이 저장소 필터에 영향이 있던 것은 `and`·`+` 같은 연산자 뒤에 괄호 없이 붙은 `as $x` 바인딩(우선순위가 바뀌어 `dflow-work/scripts/dflow.sh` 의 `_jok` 가 항상 실패했다. 괄호로 감싸 1.7.1·1.8.2 양쪽에서 같은 결과가 나오게 고쳤다)이고, 앞으로 영향을 줄 수 있는 것은 `ltrimstr`·`rtrimstr` 가 문자열이 아닌 입력에 오류를 내는 것(`coordinator/scripts/coord-state.sh` 의 id 채번)과 `tonumber` 가 앞뒤 공백이 있는 문자열을 거부하는 것(`dflow-work/scripts/dflow-lease.sh`, `dflow.sh` 의 `--limit`)뿐이다. 나머지(문자열 `index` 의 코드포인트 기준, `limit` 음수 오류 등)는 쓰는 곳이 없다. macOS 에서 같은 1.8.2 공식 바이너리로 쓰는 시험을 돌려 회귀가 없음을 확인했고, 윈도우 빌드의 실제 실행은 `docs/superpowers/specs/2026-10-07-skills-windows-compat.md` §8.2 의 19번에 실기 확인으로 남겼다.

- `jq.exe` 를 `win64/` 아래에 둔 것은 같은 폴더의 래퍼 `jq` 와 이름이 겹쳐 PATHEXT 로 찾는 쪽이 `jq.exe` 를 직접 집어 `-b` 를 잃는 일을 막기 위해서다.
- `.exe` 는 `.gitattributes` 에서 `binary` 로 지정했다. 지정을 빼면 줄끝 변환으로 바이너리가 깨진다.
- 네이티브 jq.exe 에 `/` 로 시작하는 인자를 주면 MSYS 가 윈도우 경로로 바꿀 수 있다(`--arg` 값이 `C:/…` 로 보임). 파일 경로 인자는 이 변환이 필요하고, 문자열 비교용 `--arg` 값은 git 이 내는 `C:/…` 꼴과 맞는다. 문제가 보이면 그 호출만 `MSYS_NO_PATHCONV=1` 로 막는다.
- 실제 윈도우 실행은 이 저장소의 macOS 개발 PC 에서 확인하지 못했다. 윈도우에서 `printf a | jq -r . | od -c` 로 줄끝에 `\r` 이 없는지 한 번 확인한다.
