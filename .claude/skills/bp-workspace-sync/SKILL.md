---
name: bp-workspace-sync
description: "BP(bpgoat / Bpmn)의 협의·분석·설계·회의록·BPMN·ERD 문서를 근거로 조회·분석·정합체크하는 작업의 진입 규칙. 라이브 bp CLI 를 직접 조회하지 않고, 먼저 bp CLI 를 설치·최신화한 뒤 `./tools/bp-sync --if-stale` 로 `docs/external/BP/{CLIENT}/` 로컬 미러에 캐싱하고 그 미러를 Read/Grep 으로 사용한다. 사용 시점: bp/bpgoat/BP 워크스페이스 문서를 근거로 삼는 모든 작업, 'BP 회의록·협의·설계 참고', 'bpgoat에서 가져와', 'bp sync', 'BP 미러' 요청 시. 예: BP 협의 문서 기반 설계, BP BPMN/ERD 대조, {CLIENT} 워크스페이스 근거 조회."
---

# BP 워크스페이스 sync-first 조회

BP(`bpgoat` / `Bpmn`, {CLIENT} 워크스페이스)의 문서를 **근거로 읽어 무언가 하는** 모든 작업의 진입 규칙이다.
라이브 `bp` CLI 로 문서를 매번 직접 조회하지 말고, **먼저 로컬 미러에 캐싱한 뒤 그 미러를 읽는다.**

- 정본 상세 가이드: [docs/guide/Common/BP-Workspace-Sync.md](../../../docs/guide/Common/BP-Workspace-Sync.md)
- 상위 규칙: `RULE.md` §"공통 규칙"(BP 근거 작업 = `./tools/bp-sync --if-stale` + `docs/external/BP/{CLIENT}/` 사용)
- BP CLI 명령 레퍼런스: 글로벌 `bp` 스킬(`/bp`) — **쓰기·미러 미커버 항목에만** 사용

---

## 핵심 원칙

1. BP 문서를 **읽기·분석·대조·정합체크**하는 작업은 라이브 CLI 조회 대신 **로컬 미러**를 쓴다.
2. 작업 시작 시 딱 한 번 미러를 최신화한다: `./tools/bp-sync --if-stale`.
3. 그 다음부터는 `docs/external/BP/{CLIENT}/` 아래 파일을 `Read`/`Grep`/`Glob` 으로 조회한다.
4. 라이브 `bp` CLI 직접 호출은 **쓰기**(문서·BPMN·ERD 생성/수정)와 **미러가 못 담는 항목**(첨부 바이너리 등)으로 제한한다.

이유: 라이브 전량 조회는 BP 서버 throttle(버스트 401/429)을 유발하고 느리다. 미러는 조건부 GET 으로 캐싱돼 빠르고(정상 상태 수 초) 재현 가능하다.

---

## 언제 이 스킬을 적용하나

다음 중 하나라도 해당하면 적용한다.

- 사용자가 BP / bpgoat / Bpmn / {CLIENT} 워크스페이스 문서를 **근거로** 조회·분석·설계·정합체크하라고 요청.
- 회의록·협의·분석·설계(To-Be)·BPMN·ERD 등 BP 산출물의 내용을 확인해야 하는 작업.
- "bp sync", "BP 미러", "bpgoat에서 가져와", "BP 문서 참고" 같은 표현.

적용하지 않는 경우:

- BP 문서를 **새로 만들거나 수정**하는 작업(쓰기) → 글로벌 `bp` 스킬(`/bp`)로 라이브 CLI 사용.
- BP 와 무관한 로컬 코드/문서 작업.

---

## 절차

### 0. bp CLI 설치·최신화 (최초 1회 / 버전 미달 시)

미러 래퍼 `tools/bp-sync` 는 네이티브 `bp sync` 를 감싼다. **bp CLI `0.4.2` 이상**(= `0.4.2` 와 같거나 더 최신)이 필요하며, 미달·미설치면 래퍼가 실행을 거부하고 안내를 출력한다. (`0.4.2` 에서 조건부 GET throttle 근본해소가 반영됐다. `0.4.1` 은 sync 는 되지만 throttle 실패가 남으므로 하한에서 제외한다.)

```bash
# 1) 설치 여부·버전 확인
bp --version            # 미설치면 command not found

# 2) 설치 또는 최신화 (0.4.2 미만이거나 미설치일 때)
npm install -g @cothe/bp@latest

# 3) 재확인
bp --version            # 0.4.2 이상인지 확인
```

- `bp` 가 아예 없거나 `0.4.2` 미만이면 `./tools/bp-sync` 가
  `"sync 를 지원하는 최신 bp CLI 가 필요합니다 … npm install -g @cothe/bp@latest 로 업데이트한 뒤 다시 실행하세요."`
  를 출력한다. 이 메시지를 보면 위 2)를 실행한다.
- 설치 후 **BP 로그인 상태**여야 pull 이 성공한다: `bp auth status -q` 로 확인하고, 비어 있으면 사용자에게 `bp login` 을 요청한다(대화형 로그인이라 에이전트가 대신 못 한다 → `! bp login …` 안내).
- ⚠️ 개발 머신 주의: 이 저장소 소유자의 `bp` 는 CLI 소스(`~/projects/dkowork/cli`)에 **npm link** 된 심볼릭 링크일 수 있다. 이 경우 `npm install -g @cothe/bp@latest` 는 링크를 끊고 배포판으로 교체한다. CLI 자체를 개발 중이라면 대신 CLI 저장소에서 `npm run build`(tsup) 로 로컬 반영한다. 일반 사용자는 `npm install -g` 가 정답.

### 1. 미러 최신화

저장소 루트에서 한 번 실행한다.

```bash
./tools/bp-sync --if-stale     # TTL(4h) 지났을 때만 pull, 최신이면 즉시 종료
```

상황별 변형:

```bash
./tools/bp-sync --check        # 파일 안 쓰고 변경/삭제 예정만 확인
./tools/bp-sync                # 즉시 증분 동기화
./tools/bp-sync --force        # revision·로컬수정 무관 전체 재수신 (throttle 유의)
./tools/bp-sync --if-stale 30m # TTL 임시 오버라이드
```

### 2. 로컬 미러에서 조회

이후 모든 근거 확인은 `docs/external/BP/{CLIENT}/` 에서 한다. **라이브 `bp doc get` / `bp search` 를 반복 호출하지 않는다.**

```bash
# 트리 훑기
ls docs/external/BP/{CLIENT}/
# 내용 검색 (Grep 도구 권장)
grep -rn "검색어" docs/external/BP/{CLIENT}/
```

미러 파일 유형:

| BP 유형 | 로컬 파일 |
|---|---|
| 일반 문서 | 검색용 `*.md` + 손실 없는 `*.doc.json` |
| BPMN | `*.bpmn` |
| ERD | `*.erd.json` |
| 그 외 | 유형명 기반 `*.json` / `*.xml` / `*.txt` |
| 상태 | `docs/external/BP/{CLIENT}/.bp-sync/manifest.json` |

일반 문서 이미지는 원격 URL 을 유지하고, 첨부 바이너리는 미러 범위 밖이다 → 이 둘이 필요하면 그때만 라이브 `bp` 사용.

### 3. 실패·stale 대응

- sync 가 실패하면 중단하지 말고, `docs/external/BP/{CLIENT}/.bp-sync/manifest.json` 의 `pulledAt` 으로 마지막 동기화 시점을 확인한다.
- **오래된 미러를 근거로 썼다는 사실을 작업 결과에 명시한다.**
- 조회 실패가 **소수(수 건)이고 실행마다 실패 집합이 바뀌면** 영구 권한 오류가 아니라 일시적 throttle 이다 → 재실행/스케줄로 수렴한다. throttle 상세는 정본 가이드 §"서버 throttle 대응" 참조.

---

## 명령 요약

| 목적 | 명령 |
|---|---|
| bp 버전 확인 | `bp --version` |
| bp 설치·최신화 | `npm install -g @cothe/bp@latest` |
| 로그인 상태 | `bp auth status -q` |
| 미러 최신화(작업 시작) | `./tools/bp-sync --if-stale` |
| 변경만 확인 | `./tools/bp-sync --check` |
| 전체 재수신 | `./tools/bp-sync --force` |
| 근거 조회 | `docs/external/BP/{CLIENT}/` 를 Read/Grep |

> 생성 미러(`docs/external/BP/{CLIENT}/`)는 `.gitignore` 대상이다. 원격 원문·API 응답을 커밋하지 않는다.
