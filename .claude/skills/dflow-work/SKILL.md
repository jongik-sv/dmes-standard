---
name: dflow-work
description: D'Flow 작업(내 작업 조회·착수·진행 보고·완료 보고)을 처리할 때 사용. "내 D'Flow 작업", "디플로우 작업", "작업 착수", "진행 보고", "작업 완료" 같은 요청에서 트리거.
---

# D'Flow 작업 처리

> 문체: 산출 문서 → `../_shared/style/Korean-STE-Writing-Guide.md`.

- 모든 호출 = 대상 리포 `node .claude/skills/dflow-work/scripts/dflow.mjs` (cwd = 리포 루트. `DFLOW_SH` env 있으면 그것)
- 이하 `dflow.mjs <인자>` = `node .claude/skills/dflow-work/scripts/dflow.mjs <인자>` (약식)
- 산문 파싱 금지. **exit code 로 분기**:

| exit | 뜻 |
|---|---|
| 0 | 성공 |
| 2 | 사용법·설정·push 미완료 |
| 3 | 인증 실패 |
| 4 | 선행·상태로 인한 진행 불가: 409 충돌·로컬 선행 차단·선행 미충족(403 바디 `code=dependency_not_met` 재매핑) |
| 5 | 권한 부족 (그 밖의 403) |
| 6 | 네트워크·서버·로컬 환경 실패 (응답 파싱·파일 쓰기 포함) |
| 7 | 기능 꺼짐 |
| 10 | 중단됨: 사람이 D'Flow 에서 작업 중단 (409 바디 `code=cancelled`). 재시도 금지, 즉시 멈춤 |
| 11 | 설계 관문: 409 `design_gate`·`design_not_accepted` (계약 2.11). stderr 끝줄 `DESIGN_GATE <code>[ <reason>]`. 재시도 금지. 서버 판단(`action`) 다시 보거나 사람이 「설계 승인」·「설계 확정」 누름 |
| 12 | 다른 PC 도는 중: 409 `runner_active` (계약 2.11). stderr 끝줄 `RUNNER_ACTIVE <runner>`. 이 세션 멈춤 (다른 PC 세션이 이어 감) |

## 시작 절차 (매 세션 1회)

0. 설정: dflow.mjs 가 `.dflow`·`.dflow.local` 을 스스로 읽음 (이미 export 된 env 가 이김)
   → references/subcommands.md §시작 절차: 설정 (원 SKILL.md 「시작 절차」 0단계)
1. `dflow.mjs doctor` 실행 — 모든 프로필 확인, 계약 버전 검증.
   ```bash
   dflow.mjs doctor
   ```
   → references/subcommands.md §시작 절차: doctor 출력과 경고 해석
2. 프로필 여럿이면 `.dflow.local` 의 `as=<prefix>` 가 키를 고정
   → references/subcommands.md §시작 절차: 프로필 여럿

## 워크플로우

### 내 신원 확인

```bash
dflow.mjs me
```

- 현재 사용자 신원·스코프·접근 가능 프로젝트 출력
- 토큰 설정 후 첫 확인용

### 목록 조회

```bash
dflow.mjs [--as <prefix|email>] list [--scope available|claimed|assigned|all] [--all]
```

- 기본 `--scope available` (새 작업)
- 작업 목록 출력. 순번(1~N)을 사용자에게 그대로 보임

→ references/subcommands.md §목록 조회: 옵션·프로젝트 필터·예시

### 상태 확인

```bash
dflow.mjs show <순번>
```

- 특정 작업 상세 조회. JSON 형식
- ref = 순번 또는 UUID 8자 접두

### 착수

```bash
dflow.mjs claim <순번>
```

- 선행·상태로 인한 진행 불가 → **exit 4 차단**. 로컬 선행 차단이든 서버 거부(403 `code=dependency_not_met`)든 같은 코드
- 이 경우 fetch/merge 후 재시도. 우회 금지

성공 시:
- `<DOCS_DIR>/tasks/<TSK>/spec.md` 캐시 생성 — **구현 전 반드시 읽음**
  - DOCS_DIR = project_map 의 그 프로젝트 키, 없으면 docs (`dflow.mjs taskdir <ref>`)
  - 명세 정본 = D'Flow DB. 이 파일 = claim 시점 스냅샷
  - 스크립트가 끝에 `spec 캐시: <경로>` 출력

⚠️ **브랜치는 만들어지지 않는다**
- dflow.mjs 는 git 브랜치를 생성하지 않음 (스크립트에 해당 코드 없음)
- `agent/<주문id 8자>-<slug>` 브랜치 = **호출자가 claim 직후 직접 만듦**:
```bash
git fetch origin && git switch -c agent/<주문id8>-<slug> origin/<기본브랜치>
```
- main·staging 위에서 구현 금지. done 의 push 검증은 현재 브랜치를 그대로 쓰므로, 브랜치 안 만들면 main push 사고로 이어짐

→ references/subcommands.md §착수: 설계 선행·설계 상태 (`--design-first`·`build-start`·`design-done`·`design-reopen`·`CLAIM_SCOPE`)

### 진행 보고

```bash
dflow.mjs progress <순번> <0-99> "<요약>"
```

- 진행률 **0~99 범위만 허용** (100 은 서버가 400 거부)
- 출력: 현재 상태 (e.g. `claimed`)
- 담당자 결정 대기 직전: `dflow.mjs heartbeat <id8> --phase blocked --note "<질문>"`
  - 답 받은 뒤 첫 heartbeat(훅이든 명시든, `--phase` 가 blocked 아닌 것)가 이 상태를 풂

### 완료 보고

**push 완료가 선행 필수** — push 없이 done 호출하면 exit 2 거부.

```bash
git push origin agent/<주문id 8자>-<slug>
dflow.mjs done <순번> "<요약>" --auto-links --decisions <DOCS_DIR>/tasks/<TSK>/decisions.json
```

- `--auto-links`: git 정보(브랜치·SHA·PR URL) 자동 수집해 서버 보고
- `--decisions <file>` (계약 2.6): 스스로 고른 확인 필요 결정 목록(JSON 배열)을 보고 필드로 실음. 0건이면 `[]`
- 형식이 틀리면 push 확인·전송 전에 exit 2 로 멈춤. 경고 뜻: `references/troubleshooting.md` exit 2 절

- 보고 후 상태 = **reported(승인 대기)**
- 사용자에게 "완료했습니다"가 아니라 "승인 대기로 보고했습니다"로 전달

### 그 밖의 서브커맨드

→ references/subcommands.md §작업 폴더 조회 (`taskdir`) · §담당 작업 폴더 scaffold (`scaffold`) · §heartbeat · §watch · §포기 (`release`)

## 금지사항 (명령형)

다음 엄격히 금지:

- **옵션은 반드시 서브커맨드 앞에** — `dflow.mjs --as bob@example.com list` (O), `dflow.mjs list --as bob@example.com` (X). 뒤에 붙이면 에러 없이 다른 신원으로 조용히 실행되는 오동작 발생.
- **토큰을 echo·파일 기록·명령 문자열에 보간하지 않는다** — env 확장으로만 사용.
- `DFLOW_API_BASE` 기본값을 지어내지 않는다 — 미설정 시 즉시 실패.
- `--pct 100` 또는 `progress 100` 금지. approve 시도 금지(승인은 사람 몫).
- 409 충돌을 재시도로 뚫지 않는다 — 상태를 `dflow.mjs show <순번>` 으로 확인하고 사용자에게 보고.
- 실패를 성공으로 요약하지 않는다 — 정직한 상태 전달.
- git author 를 D'Flow 신원으로 바꾸지 않는다 — 커밋 author 는 PC 주인 그대로.

### 작업 대상이 wbs-web 자신이면

- `git add -A` 금지 — 항상 파일명을 명시해 stage 한다.
- 마이그레이션과 코드를 같은 커밋에 담지 않는다(G1 pre-push 훅이 검사).
- `src/app/globals.css`, `src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `src/components/app/*` 변경 시 'Preview 확인 필요(G2)' 를 사용자에게 경고.

## 세션 복구

로컬 상태 파일에 의존하지 않음. 언제든:

```bash
dflow.mjs list --scope claimed
```

서버에서 claimed 상태 작업을 복원한다.

## 참조

| 문서 | 읽을 때 |
|---|---|
| `references/subcommands.md` | 설정 키 값·`.dflow.local` 키 확인, doctor 경고(계약 major 불일치·확인 불가), 프로필이 여럿일 때 · `list` 옵션·`PROJECT_MISMATCH` · `--design-first`·`build-start`·`design-done`·`design-reopen`·`CLAIM_SCOPE` 사용 · `taskdir`·`scaffold`·`heartbeat`·`watch`·`release` 호출 직전 |
| `references/troubleshooting.md` | exit 2~12 어느 하나로 끝났을 때, cache·상태 복구, 프로필 다중 관리, 브랜치·트레일러 점검 |
| `references/api-contract.md` | 서버 계약 필드·엔드포인트(계약 2.x)를 확인할 때 |
| `references/force-progress-hook.md` | 강제 진행 스텁·승격 관문 pre-push 훅 예시가 필요할 때 |
