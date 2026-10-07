# BP 워크스페이스 동기화

BP의 `{CLIENT} (케이에스엠)` 워크스페이스 전체 문서를 로컬 worktree에 읽기 전용으로 미러링한다. BP가 정본이며, 로컬 파일은 Agent 검색과 설계 근거 확인을 위한 생성물이다.

미러링 엔진은 bp CLI 의 **네이티브 `bp sync`** 명령이다. `tools/bp-sync` 는 이를 감싸 `.bp-sync.json` 설정·TTL(`--if-stale`)·삭제 반영·버전 점검만 담당하는 얇은 래퍼다. (과거의 자체 미러링 엔진 `tools/bp_sync.py` 를 대체했다.)

## 요구 버전

`tools/bp-sync` 는 python 3 스크립트이므로 python 3 가 필요하다. 윈도우 사용자는 python 3 를 설치해서 쓴다. 정기 실행기 `tools/bp-sync-schedule` 은 macOS launchd 전용이라 윈도우에서는 쓰지 않는다.

`bp sync` 는 bp CLI `0.4.0` 이상에서 동작하지만, 래퍼가 쓰는 throttle 대응 옵션(`--delay`/`--retries`)과 401/429 재시도는 **`0.4.1` 이상**에서만 제공된다. 따라서 최소 요구 버전은 **`0.4.1`** 이다. 구버전이면 `./tools/bp-sync` 가 실행을 거부하고 안내 메시지를 출력한다. 최신 버전으로 업데이트한다.

```bash
# 현재 버전 확인
bp --version

# 최신 버전으로 업데이트
npm install -g @cothe/bp@latest
```

## 대상과 출력

- 설정: 루트 [`.bp-sync.json`](../../../.bp-sync.json)
- 워크스페이스: `69ae23002c4f49cfa7033531`
- 출력: `docs/external/BP/{CLIENT}/`
- 상태: `docs/external/BP/{CLIENT}/.bp-sync/manifest.json`
- 범위: 루트부터 시작하는 전체 폴더와 전체 문서

유형별 출력은 다음과 같다.

| BP 유형 | 로컬 출력 |
|---|---|
| 일반 문서 | 검색용 `.md` + 손실 없는 `.doc.json` |
| BPMN | `.bpmn` |
| ERD | `.erd.json` |
| 그 외 유형 | 유형명 기반 `.json`, `.xml` 또는 `.txt` |

일반 문서의 이미지는 원격 URL을 유지한다. 첨부 바이너리까지 내려받는 기능은 현재 범위에 포함하지 않는다.

## 실행

BP CLI 로그인 상태에서 저장소 루트에서 실행한다.

```bash
# 설정된 4시간 TTL이 지난 경우에만 확인
./tools/bp-sync --if-stale

# 원격 변경 여부만 확인하고 파일은 쓰지 않음
./tools/bp-sync --check

# 즉시 증분 동기화
./tools/bp-sync

# revision과 무관하게 전체 문서 재생성
./tools/bp-sync --force
```

`--if-stale 30m`처럼 설정값을 일시적으로 덮어쓸 수 있다.

## 증분 및 안전 규칙

`bp sync` 는 `.bp-sync/manifest.json` 을 기준으로 증분 동작한다.

1. manifest 와 비교해 변경이 없는 문서는 다시 쓰지 않는다(`unchanged`). 변경·신규 문서만 본문을 다시 받는다.
2. 로컬에서 직접 수정한 파일은 덮어쓰지 않고 건너뛴다(`skippedLocalModified`). 원격 내용으로 강제 반영하려면 `--force` 로 실행한다.
   - (구 엔진은 로컬 수정 감지 시 **전체 동기화를 중단**했으나, 네이티브 `bp sync` 는 **해당 파일만 건너뛰고** 나머지는 계속 미러링한다.)
3. 원격에서 삭제된 문서는 기본적으로 고아(`orphaned`) 경고만 남긴다. `.bp-sync.json` 의 `deleteRemoved: true` 이면 래퍼가 `bp sync pull --prune` 로 실행해 로컬 파일까지 삭제한다.
4. 문서 조회는 기본 동시성 6 으로 병렬화한다(`bp sync --concurrency`).
5. `bp sync` 는 출력 디렉터리 잠금으로 정기 실행과 수동 실행의 중복을 차단한다.
6. 권한이 없는 문서는 조회에 실패하고 경고로 남는다(`UNAUTHORIZED`). 이때 해당 문서의 기존 로컬 파일은 그대로 두고, 결과 요약의 경고 건수로 노출된다.

생성 디렉터리는 `.gitignore` 대상이다. 원격 협의 원문과 API 응답을 실수로 커밋하지 않는다.

## 서버 throttle 대응 (pacing · 재시도)

BP 서버는 짧은 시간의 요청 버스트를 `401`("API key required") 또는 `429` 로 되돌려주고 잠시 뒤 회복한다(레이트리밋). 이를 완화하기 위해 두 계층이 동작한다.

- **bp CLI 재시도**: `apiClient` 가 멱등 조회(GET)를 `429`/`5xx`/네트워크 오류, 그리고 *키가 설정된 상태의* `401`(=throttle) 에 대해 지수 백오프로 자동 재시도한다. `bp sync pull --retries <n>` 으로 조정한다.
- **pacing**: `bp sync pull --delay <ms>` 로 문서 조회 배치 사이에 지연을 넣어 버스트 자체를 줄인다.

래퍼는 `.bp-sync.json` 값을 CLI 옵션으로 넘긴다.

| 설정 키 | 의미 | 권장 |
|---|---|---|
| `concurrency` | 동시 문서 조회 수 → `--concurrency` | throttle 환경은 `1`(완전 순차) |
| `requestDelaySeconds` | 배치 사이 지연 → `--delay`(ms 환산) | `0.25` |
| `maxRetries` | 래퍼의 pull 반복 횟수(증분이라 실패분만 재수집) | `5` |

동시성 `1` + 지연 `0.25s` 조합이면 구 엔진과 동등하게 대부분의 문서가 한 번에 들어온다. throttle 로 소수(수 건)가 남으면 이후 실행에서 회수된다(실패 문서 집합은 실행마다 바뀌며, 이는 영구 권한 오류가 아니라 일시적 throttle 임을 뜻한다).

## Agent 사용 규칙

BP의 협의·분석·설계 문서를 근거로 사용하는 작업은 시작 시 다음 명령을 한 번 실행한다.

```bash
./tools/bp-sync --if-stale
```

동기화가 실패하면 기존 로컬 미러의 `.bp-manifest.json`에서 `lastSyncedAt`을 확인하고, 오래된 자료를 사용했다는 사실을 결과에 명시한다.

## 정기 실행

macOS 사용자 세션의 `launchd`에 기본 4시간 간격 작업을 등록한다.

```bash
./tools/bp-sync-schedule install
./tools/bp-sync-schedule status
./tools/bp-sync-schedule uninstall
```

설치 도구는 `bp`와 Python의 절대 경로를 기록하므로 NVM의 비대화형 `PATH` 문제를 피한다. BP 인증이 유효하지 않으면 작업을 등록하지 않는다. 실행 간격은 `.bp-sync.json`의 `scheduleIntervalSeconds`로 조정한다. 정기 실행은 Git 파일을 수정하지 않고, Git에서 제외된 로컬 미러만 갱신한다.
