# _shared/bin: 동봉 실행 파일(윈도우용 jq)

윈도우에는 node 와 Git Bash 만 있다고 보므로, 스킬 스크립트가 쓰는 `jq` 를 이 폴더에 동봉한다. 설치 단계가 필요 없다.

## 구성

| 파일 | 내용 |
|---|---|
| `jq.exe` | jq 1.7.1 공식 윈도우 64비트 빌드(`jq-windows-amd64.exe`). arm64 윈도우는 에뮬레이션으로 돈다. |
| `jq` | POSIX sh 래퍼. `jq.exe -b "$@"` 로 실행한다. `-b` 는 윈도우에서 출력 줄끝이 CRLF 로 바뀌는 것을 막는다. |
| `jq-LICENSE.txt` | jq 1.7.1 의 `COPYING`(MIT 와 포함 라이브러리 고지). 재배포 때 함께 둔다. |

## 출처와 무결성

- 내려받은 곳: `https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-windows-amd64.exe`
- 같은 릴리스의 `sha256sum.txt` 와 대조해 일치했다.
- SHA-256: `7451fbbf37feffb9bf262bd97c54f0da558c63f0748e64152dd87b0a07b6d6ab`
- 크기: 985,088 바이트
- 확인 명령(macOS·Git Bash): `sha256sum .claude/skills/_shared/bin/jq.exe`(macOS 는 `shasum -a 256`). 값이 다르면 쓰지 말고 조정자에게 알린다.
- 버전을 올릴 때는 이 표와 위 값을 함께 고친다. 새 릴리스의 `sha256sum.txt` 와 대조한 뒤 커밋한다.

## 어떻게 켜지나

윈도우(Git Bash)에서만 이 폴더를 PATH 앞에 둔다. macOS·Linux 는 PATH 를 건드리지 않으므로 기존 jq 를 그대로 쓴다.

- coordinator 스크립트: `coordinator/scripts/lib/compat.sh` 가 `COMPAT_WIN=1` 일 때 PATH 앞에 둔다(`common.sh` 가 source).
- dflow-* 스크립트: 각 진입 스크립트 머리말에 같은 한 줄이 있다.
  `case "${COMPAT_FORCE_OS:-$(uname -s)}" in windows|MINGW*|MSYS*|CYGWIN*) PATH="<_shared>/bin:$PATH" ;; esac`
- 시험에서 윈도우를 흉내 낼 때는 `COMPAT_FORCE_OS=windows` 와 `SKILLS_JQ_EXE=<mac 의 jq 경로>` 를 준다.

## 알려진 한계

- `.exe` 는 `.gitattributes` 에서 `binary` 로 지정했다. 지정을 빼면 줄끝 변환으로 바이너리가 깨진다.
- 네이티브 jq.exe 에 `/` 로 시작하는 인자를 주면 MSYS 가 윈도우 경로로 바꿀 수 있다(`--arg` 값이 `C:/…` 로 보임). 파일 경로 인자는 이 변환이 필요하고, 문자열 비교용 `--arg` 값은 git 이 내는 `C:/…` 꼴과 맞는다. 문제가 보이면 그 호출만 `MSYS_NO_PATHCONV=1` 로 막는다.
- 실제 윈도우 실행은 이 저장소의 macOS 개발 PC 에서 확인하지 못했다. 윈도우에서 `printf a | jq -r . | od -c` 로 줄끝에 `\r` 이 없는지 한 번 확인한다.
