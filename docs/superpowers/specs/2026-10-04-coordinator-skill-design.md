# 조정자(coordinator) 스킬 설계

- 작성일: 2026-10-04 (갱신 2026-10-05: §3.e 모델 등급·GLM 기동 절차, Q13)
- 상태: 초안(설계만, 구현·설치 없음)
- 출발점: 2026-10-04 시스템 리팩토링 5레인 조정(조정 세션 dmes-standard-cb, 레인 a8·b9·a6·1b·c3)에서 사람이 손으로 하던 조정 일을 스킬로 옮긴다.
- 근거 표기: 본문의 `[근거: …]` 는 직접 읽은 파일·명령 결과다. 확인하지 못한 것은 **미확인**, 추정은 **추정** 이라고 적는다.

주요 근거 파일

| 약칭 | 경로 |
|---|---|
| README | `docs/refactor-2026-10/README.md` (레인 공통 규칙, §1 Workflow 단계별 모델 표, §4 머지 절차, §6 기록 문서) |
| 5레인 정본 | `~/.claude/projects/-Users-jji-project-dmes-standard/memory/refactor-5lanes-2026-10-04.md` |
| 메모 | 같은 폴더의 `coordinator-keep-lanes-busy.md`, `dev-merge-coordinator.md`, `wake-sessions-timer.md`, `close-finished-agent-panes.md`, `verify-agent-spawn.md`, `opencode-worker-management.md`, `no-sendmessage-to-workflow-agents.md`, `workflow-resume-prefix-cache.md`, `workflow-model-per-stage.md`, `finish-to-the-end-when-told.md`, `kit-no-pc-specific-names.md`, `dev-machine-macbook-air-m5.md` |
| heavy.sh | `.claude/skills/dflow-dev/scripts/heavy.sh` (PC 전역 무거운 명령 슬롯, 머리 주석이 사양) |
| test-slot | `src/backend/gradle/test-slot.gradle` (Gradle Test 태스크 PC 전역 슬롯 `~/.gradle/dmes-test-slots`, `DMES_TEST_SLOTS`) |
| capacity.sh | `.claude/skills/dflow-team/scripts/capacity.sh` (입장 제어·주간 사용량 판정) |
| backends.md | `.claude/skills/dflow-team/references/backends.md` (「statusLine 덤프」 203행 부근) |
| dflow-team | `.claude/skills/dflow-team/SKILL.md` (팀장 스킬, 1337행. 구조 참고) |
| wake | `~/bin/wake-sessions.sh`, `~/bin/wake-sessions.targets` |
| statusline | `~/.claude/statusline-command.sh`, `~/.claude/settings.json` |
| cb 기록 | `~/.claude/projects/-Users-jji-project-dmes-standard/f733ea8c-9350-4a0f-98e8-603ba013c51d.jsonl` |
| Orca | `orca skills get orca-cli` (Orca 1.4.219), `orca terminal <cmd> --help`, `orca orchestration worker-start --help` |
| 사용자 전역 | `~/.claude/CLAUDE.md` 「Orca 로 opencode 워커 띄우기」 |
| GLM·탭 메모 | 같은 메모 폴더의 `glm-claude-worker.md`(alias `glm` 기동·통신 실측), `worker-sessions-in-new-tab.md`, `weak-worker-partial-takeover.md`, `zcode-worker-launch.md` |

---

## 1. 목표와 범위

### 1.1 목표

큰 업무 하나를 여러 Claude Code 세션(레인)과 임시 워커(Pane)에 나눠 맡기고, 조정 세션 하나가 다음 일을 맡는다.

1. 업무 분해·레인 할당, 레인 사이 조율, dev 머지 순서 배정과 머지 게이트
2. 레인 모니터링: 진도율, idle 감시, 놀고 있는 레인에 자동 배정(§3.i)
3. 고부하 작업(Gradle·Test·빌드·E2E·측정) 조절. 팬 없는 MacBook Air M5(P4+E6, 16GB)에서 부하가 너무 오르지 않게 한다 [근거: dev-machine-macbook-air-m5.md]
4. 필요하면 세션·Pane 을 새로 열어 일을 시키고, 끝나면 정리한다
5. 5시간·1주일 사용량을 보고 일의 양을 조절한다
6. 컨텍스트 사용률이 임계값(기본 40%)을 넘은 세션을 안전한 때에 `/compact` 시킨다(§3.j)
7. 스킬로 띄운 세션은 Workflow 도구를 기본으로 쓰게 하고, 단계마다 model·effort 를 지정하게 한다(§3.k)

### 1.2 범위

- Orca 앱 안의 Claude Code 대화형 세션(레인)과 Orca 터미널 탭·pane(임시 워커, opencode 포함)
- 한 PC, 한 저장소, dev 통합 브랜치 하나
- 조정자는 대화형 Claude Code 세션 하나다. 판단은 조정자 모델이 하고, 상태 수집·판정 보조는 셸 스크립트가 한다(토큰 절약)

### 1.3 넣지 않는 것

- 레인 안의 구현 규율(TDD·리뷰 루프). 레인 세션의 몫이고 README §1·§3 이 정한다
- D'Flow 작업 수명주기(claim·stage 전이). 이미 `dflow-team` 이 한다. 조정자 스킬은 D'Flow 를 몰라도 돈다
- dev push·main 반영. 사용자가 지시할 때만 한다 [근거: dev-merge-coordinator.md 「dev push 는 사용자 지시가 있을 때만」]
- 삭제(DB 행·브랜치 -D·워크트리 --force). 사용자 결정 사항으로 올린다 [근거: README §4-5, MEMORY 「삭제 외 자율 처리」]
- 서버 기동·브라우저 확인의 세부 방법. 프로젝트 config 가 정한다(킷에 도구 이름을 넣지 않는다, §5.3)
- 원격 PC·여러 PC 조정

---

## 2. 역할 모델과 통신 규약

### 2.1 역할

| 역할 | 실체 | 하는 일 | 하지 않는 일 |
|---|---|---|---|
| **조정자** | 대화형 Claude Code 세션 1개(예: dmes-standard-cb) | 분해·할당, 머지 허가, 측정 창 운영, 감시 루프, 세션·Pane 생성과 정리, 사용량 띠 판정, 다른 세션 compact, 서버 기동·브라우저 확인(통합 확인), SUMMARY·마감 보고 | 레인 소유 파일 수정(통합 확인 중 아주 작은 것 빼고) |
| **레인 세션** | 사용자가 띄웠거나 조정자가 띄운 Claude Code 세션. 레인 하나에 브랜치·워크트리 하나 | 자기 레인 일을 Workflow 로 진행, 진행 보고, 머지 요청·머지·정리, 자기 정본 메모 유지 | dev 에 허가 없이 머지, 메인 저장소 서버 재기동, 남의 소유 파일 수정 |
| **임시 워커(Pane)** | 조정자나 레인이 띄운 Orca 터미널 탭(작업 세션은 새 탭이 기본). Claude Code(Anthropic 모델 또는 GLM)·ZCode·opencode·agy 등 | 짧은 단일 과제(교차 리뷰, 조사, 측정 실행, 문서 대조) | 머지, 다른 워커 관리 |
| **서브에이전트·Workflow agent** | 각 세션 안의 Agent·Workflow 하위 에이전트 | 세션 안 단계 작업 | 조정자와 직접 통신하지 않는다(세션이 대신 보고) |

통신 수단

- 세션 사이: Claude Code cross-session `SendMessage`(이름 또는 `uds:/tmp/cc-socks/<pid>.sock` 주소)와 `ListAgents`. 이름은 바뀔 수 있으므로 주소를 함께 기록한다 [근거: dev-merge-coordinator.md 「조정 세션 이름이 shell-hook-integration 으로 바뀌었다(주소 … 그대로)」]
- Orca 터미널 입력: `orca terminal send`. 슬래시 명령(`/compact`)을 넣을 때와 opencode 워커에 지시할 때만 쓴다
- 실행 중인 Workflow 하위 에이전트에는 `SendMessage` 를 보내지 않는다(§3.k.4)

### 2.2 메시지 형식(정본)

모든 메시지의 첫 줄은 `[보내는쪽→받는쪽] <종류>: …` 이다. 조정자는 첫 줄의 `<종류>` 로 분기한다. README §4 형식은 그대로 둔다.

| 종류 | 방향 | 형식 |
|---|---|---|
| 착수 지시 | 조정자→레인 | `착수 지시: 레인 / 브랜치 / 워크트리 / 할 일 목록(번호) / 소유 파일 / 금지 파일 / 의존(기다릴 것) / 무거운 작업 칸 / Workflow 단계별 model·effort / 보고 방식` (§3.k.1 템플릿) |
| 진행 보고 | 레인→조정자 | `진행 보고: 항목 번호 / 커밋 / 시험 결과(명령과 통과·실패 수) / 진도율 N%(끝난 항목/전체, 가중치면 그렇게) / 다음 항목` [근거: README §5, cb 기록 「[cb→전 레인] 사용자가 레인별 진행률을 묻습니다 … 끝난 항목 수 / 전체 항목 수」] |
| 질문·승인 요청 | 레인→조정자 | `질문: 배경 / 선택지 / 기본안` (기본안으로 계속할지 그 단계만 멈출지 함께) |
| 머지 요청 | 레인→조정자 | `머지 요청: 세션 이름 / 원본 브랜치 / 대상 dev / 커밋 수·변경 요약 / 겹칠 수 있는 파일·모듈 / 머지 전 시험 결과(명령과 통과·실패 수)` [근거: README §4-2] |
| 머지 허가·대기 | 조정자→레인 | `머지 허가: 예상 트리 <hash> / 조건(재기동·시험) / 머지 뒤 다음 일` 또는 `대기: 사유 / 그동안 할 일` |
| 머지 완료 | 레인→조정자 | `머지 완료: 머지 커밋 / 트리 / 머지 뒤 빌드·시험 결과(충돌·실패도 그대로)` [근거: README §4-4] |
| 정리 완료 | 레인→조정자 | `정리 완료: 지운 워크트리·브랜치 / 남긴 것과 이유` [근거: README §4-5] |
| 측정 시작·끝 | 조정자→측정 레인 | `측정 시작: 항목 / 창 끝 예정 시각 / 쓸 칸(--exclusive)` · `측정 끝 확인` |
| 무거운 작업 금지·재개 | 조정자→나머지 레인 | `무거운 작업 금지: 사유(측정·이동 등) / 예상 끝 / 그동안 할 수 있는 가벼운 일` · `무거운 작업 재개` |
| 사용량 띠 변경 | 조정자→전 레인 | `사용량 조정: 띠 / 동시 agent 상한 / model·effort 하향 / 새 Workflow 금지 여부` |
| 정본 갱신 요청·완료 | 조정자↔레인 | `정본 갱신 요청: compact 예정` → `정본 갱신 완료: 경로 / 남은 일 3줄` (§3.j) |
| compact 뒤 확인 | 조정자↔레인 | `재개 확인: 남은 일 3줄로 답해 달라` → 답 |
| 자기 신원 | 레인→조정자 | 착수 때 한 번: `신원: 이름 / 세션ID / Orca 핸들 / pid / 워크트리` (§3.e.4) |

---

## 3. 기능별 설계

### a. 업무 분해·레인 할당

1. **입력**: 큰 업무 설명, 조사 결과(조정자가 Explore 등으로 만든 것), 레인 수(사용자가 띄운 세션 수 또는 사용량 띠가 허용하는 수).
2. **항목 표 만들기**: 항목마다 `id·제목·예상 크기(S/M/L)·건드릴 파일·모듈·선행 항목·무거운 명령 여부·측정 대상 여부` 를 적는다.
3. **레인 묶기 규칙**
   - 건드릴 파일이 겹치는 항목은 한 레인에 둔다. 겹침을 못 피하면 **소유 레인**을 하나 정하고, 다른 레인은 요청만 한다(예: build.gradle·settings.gradle·gradle.properties·libs.versions.toml 은 1b 만 고친다 [근거: README §3]).
   - 공용 자원(shared 공개 API, 공용 DB, 메인 서버)은 소유자를 지정하거나 조정자 전용으로 둔다(서버 기동·브라우저 확인은 조정자만 [근거: README §2]).
   - 레인 크기는 비슷하게 맞추되, 의존이 긴 레인에는 기다리는 동안 할 수 있는 독립 일을 섞는다.
4. **의존 그래프**: `항목 A → 항목 B`(B 는 A 가 dev 에 들어간 뒤) 형태로 상태 파일 `deps` 에 둔다. 머지 순서·측정 순서·대기 작업 배정에 쓴다. 실제 예: 「1b 2차는 a8·a6 이 들어간 뒤」, 「a6 메뉴 캐시는 a8 3b 뒤 통합 시험 다시」, 「c3 오류 상세 화면 확인은 a8 errors[] 머지 뒤」 [근거: README §4-1].
5. **착수 지시**는 §3.k.1 템플릿으로 보낸다. 지시 메시지가 그 레인의 할 일·소유 파일·금지 파일의 정본이다 [근거: README 서두 「조정 세션이 보낸 지시 메시지가 정본」]. 지시 원문은 상태 폴더 `lanes/<레인>/brief.md` 에도 남긴다(compact 뒤 복구용).
6. **공통 규칙 문서**: 레인 공통 규칙(작업 공간, 규율, 머지 절차, 보고, 기록 문서)은 저장소 문서 하나(`docs/<업무>/README.md`)에 두고 착수 지시에서 링크한다. 이번 README 가 견본이다. 스킬은 이 문서의 뼈대 템플릿을 갖는다.

### b. 머지 순서 배정과 머지 게이트

**순서 원칙**: 「준비된 레인부터」를 기본으로 하고, 의존 그래프가 막는 것만 뒤로 미룬다 [근거: README §4-1, 5레인 정본 「cb 결정: 머지 순서 "준비된 레인부터"」]. dev 를 바꾸는 머지는 **한 번에 하나만** 허가하고, 완료 보고를 받은 뒤 다음을 허가한다 [근거: dev-merge-coordinator.md].

**게이트(조정자가 허가 전에 확인하는 것)**, 보조 스크립트 `merge-gate.sh <브랜치>` 가 기계적 부분을 낸다.

1. **충돌**: `git merge-tree --write-tree dev <브랜치>` 로 충돌 유무와 예상 트리 해시를 얻는다. 허가 메시지에 예상 트리를 넣고, 완료 보고의 머지 커밋 트리와 대조한다(10-03~04 머지 수십 건이 「트리 예상과 같음」으로 확인됐다 [근거: dev-merge-coordinator.md 기록]).
2. **범위**: `git diff --name-only dev...<브랜치>` 를 레인의 소유·금지 파일 목록과 대조한다. 금지 파일이 있으면 「대기」로 답하고 사유를 묻는다. shared 기존 공개 API·props·동작 변경은 사용자 승인 기록(그 세션 jsonl 의 사용자 입력이나 AskUserQuestion 답)을 직접 확인한 뒤에만 허가한다 [근거: 5레인 정본·dev-merge-coordinator.md 「사용자 승인 기록을 직접 확인」].
3. **시험 근거**: 머지 요청에 적힌 명령과 통과·실패 수가 있는지, 요청 직전에 dev 최신을 합쳐 다시 돌렸는지(README §4-1 마지막 줄) 본다. 숫자가 없으면 「대기: 시험 결과를 붙여 달라」.
4. **기록 문서**: 이번 머지 항목이 레인의 기록 문서(structure·perf)에 들어 있는지(README §6). 프로젝트 config 에서 끌 수 있다.
5. **재기동 영향**: 바뀐 파일이 실행 중 서버가 물고 있는 산출물(예: 메인 build/libs jar)에 닿는지. 닿으면 허가 메시지에 「세 서버 모두 내린 뒤 jar 빌드·재기동」 같은 조건을 붙인다 [근거: dev-merge-coordinator.md 「세 서버 모두 메인 build/libs 의 … jar 를 엶」]. 판단표는 프로젝트 config(`restart-rules`)에 둔다.
6. **무거운 작업 창**: 측정 창이 열려 있으면 머지 뒤 빌드·시험이 창을 깨므로 허가를 창 끝 뒤로 미룬다.

**허가 메시지에는 늘 「머지 뒤 다음 일」을 붙인다** [근거: coordinator-keep-lanes-busy.md]. 머지 → 완료 → 정리 완료까지 받으면 상태 파일의 머지 기록을 닫는다.

### c. 모니터링: 주기 점검, 진도율

**주기 수단 비교와 선택**

| 수단 | 성질 | 쓰는 곳 |
|---|---|---|
| `CronCreate`(세션 한정 cron) | 정해진 분마다 조정자 세션에 프롬프트를 넣는다. 세션이 바쁘면 다음 턴에 들어간다. compact 뒤에도 남는지 확인이 필요하다 [근거: 5레인 정본 「compact 뒤에도 살아 있는지 CronList 로 확인, 없으면 다시 생성」] | **기본 감시 틱**(예: 매시 7·27·47분, 20분 간격). 실제로 쓰였다 [근거: cb 기록 CronCreate 「[cb 자체 점검] …」] |
| `ScheduleWakeup` | 한 번 깨우기 | 정해진 시각 한 번(측정 창 끝 확인, 이동 전 점검 등). cb 는 09:26 이동 준비 점검을 CronCreate 1회로 썼다 |
| `Monitor` | 백그라운드 셸 조건을 기다렸다가 깨운다 | 짧은 동안 특정 조건 대기(예: 다른 세션 compact 끝 = 화면에 "Compacting" 사라짐, 측정 레인의 heavy 잡 끝) |
| 셸 타이머(`wake-sessions.sh` 방식) | Claude 토큰을 안 쓴다 | 사용 한도 초기화 뒤 깨우기(§3.f). `autoContinueAtUsageLimit: true` 가 켜져 있어 보조 수단이다 [근거: settings.json, wake-sessions-timer.md] |

틱 한 번에 하는 일(조정자 프롬프트 고정 문구, 순서대로)

1. `coord-status.sh` 를 돌려 한 화면짜리 상태표를 얻는다(아래 표의 칸). 이 스크립트가 토큰을 쓰지 않고 대부분을 모은다.
2. 처리 안 한 메시지(머지 요청·질문)가 있으면 그것부터 처리한다.
3. idle 판정과 자동 배정(§3.i).
4. 컨텍스트 임계값 검사와 compact(§3.j).
5. 사용량 띠 변화 처리(§3.f).
6. 측정 창·금지 통지의 끝 처리(§3.d).
7. 바뀐 것이 없으면 아무 말 없이 턴을 끝낸다(사용자 화면을 어지럽히지 않는다 [근거: cb cron 문구 「모든 레인이 busy 이고 처리할 메시지가 없으면 아무 말 없이 끝낸다」]).

`coord-status.sh` 출력 칸(레인마다 한 줄)

`레인 · 세션 이름 · status(busy/idle) · status 지속 시간 · 마지막 보고 시각 · 마지막 커밋 시각(브랜치) · dev 대비 앞선 커밋 수 · 백그라운드 신호(heavy RUN·잡·Workflow) · 컨텍스트 % · 의도된 대기 표식`

PC 줄 하나: `load1 · 코어 수 · heavy held/waiting · test-slot 보유 · 스왑 · 5시간 % · 1주 % · 띠`

**진도율 집계**

- 출처는 레인의 진행 보고에 든 「끝난 항목/전체 항목(가중치)」다. 조정자는 보고 뒤 들어온 커밋으로 보정하되, 보정한 값은 「추정」이라고 적는다 [근거: cb 기록 「진도율은 … 레인 보고와 커밋 상태를 보고 제가 추정한 값」].
- 상태 파일에 레인별 `items: [{id, weight, done}]` 를 두고, 진행 보고를 받을 때마다 갱신한다. 전체 진도율 = 레인 진도율의 가중 평균(레인 가중치는 남은 항목 크기 합). 사용자가 「진도율」을 물으면 이 표로 즉시 답한다(레인에 다시 묻지 않는다). 레인에 다시 묻는 것은 마지막 보고가 1시간보다 오래됐을 때만이다.
- 마감 단계(측정·SUMMARY·정리)도 항목으로 넣는다. 「코드 100%」인데 측정·정리가 남은 상태를 구분하기 위해서다(5레인 정본의 표가 「코드 ✅ 끝 / 남은 일」 두 칸이었다).

### d. 고부하 작업 조절

**현재 자원**(이 PC 실측·코드 근거)

| 장치 | 무엇을 막나 | 기본값 | 근거 |
|---|---|---|---|
| `heavy.sh` 일반 슬롯 | 감싼 명령(전체 시험·빌드·E2E 서버) PC 전체 동시 K개 | K = max(1, RAM_GB/8) = 16GB 에서 2. `~/.dflow/locks/heavy` | heavy.sh 머리 주석, `ls ~/.dflow/locks` → `heavy/ heavy-1b/` |
| `heavy.sh` 부하 검사 | 1분 load > 코어 × 1.5(10코어면 15) 일 때 새 슬롯 미룸 | `DFLOW_HEAVY_LOAD_MAX=1.5` | heavy.sh 「부하 검사」 |
| `heavy.sh --exclusive` | K개를 한꺼번에 잡아 다른 heavy.sh 명령과 겹치지 않게 | 명령 하나 동안만 | heavy.sh. **회차 사이에 풀린다**(아래 사고) |
| `heavy.sh --detach`/`wait` | 10분 넘는 명령 | 잡 폴더 `~/.dflow/jobs` | heavy.sh |
| `heavy.sh snapshot` | 기계 출력 `PC K held waiting load1 cpus` · `RUN …` · `WAIT …` | | heavy.sh |
| Gradle test-slot | heavy.sh 를 안 거치는 세션의 Gradle Test 태스크까지 PC 전체 2개 | `DMES_TEST_SLOTS=2`, `~/.gradle/dmes-test-slots` | test-slot.gradle 머리 주석 |
| 레인 전용 칸 | 특정 레인에 공용과 따로 슬롯 1개 | `DFLOW_HEAVY_DIR=~/.dflow/locks/heavy-1b DFLOW_HEAVY_SLOTS=1 DMES_TEST_SLOTS=0` | 5레인 정본 「1b 전용 칸」 |
| 레인 안 규칙(지시문) | 레인당 무거운 작업 1개, gradle·vitest workers 2, 동시 agent 3 안팎 | | 5레인 정본 「자원 제한」 |

**설계**

1. **두 겹 통제**: (가) 기계 장치(heavy.sh·test-slot)는 감싼 명령만 막는다. (나) 그래서 **통지**가 꼭 필요하다. heavy.sh 를 안 거친 vitest·tsc·tsup 은 통지로만 막을 수 있다.
2. **레인 우선순위**: 상태 파일 `priority` 로 정한다(머지 임박 > 측정 > 일반 구현 > 대기 작업). 슬롯이 모자라면 조정자가 낮은 레인에 「무거운 작업 금지」를 보낸다. heavy.sh 자체에는 우선순위가 없다(먼저 잡는 쪽이 이긴다).
3. **측정 창(독점)**: 벽시계 성능 측정은 다른 무거운 일과 겹치면 값이 의미 없다(이 PC 는 같은 설정 반복 측정도 2배 흔들린다 [근거: dev-machine-macbook-air-m5.md]).
   - 순서: ① 측정 레인 외 모든 레인에 `무거운 작업 금지`(사유·예상 끝·그동안 할 가벼운 일) → ② 진행 중인 무거운 명령이 끝나기를 기다린다(`heavy.sh snapshot` 의 RUN 0, `ps` 에 GradleWrapperMain·vitest·playwright 없음, load1 < 코어 × 0.5 정도가 2분 유지) → ③ 측정 레인에 `측정 시작` → ④ 측정 레인이 회차마다 `uptime` load 를 남기게 한다(README §6.2) → ⑤ `측정 끝` 보고를 받으면 상태 파일의 창을 닫고 전 레인에 `무거운 작업 재개`.
   - **사고 반영**: `heavy.sh --exclusive` 는 명령 하나 동안만 K개를 쥔다. ABAB 회차 사이에 슬롯이 풀려 b9 gradle 이 끼어든 일이 있었다(10-04 12:1x) [근거: 5레인 정본 「heavy.sh --exclusive 만 믿지 않는다」]. 그래서 창은 통지로 연다. 기계 보강안(선택, 열린 질문 Q4): 조정자가 `heavy.sh --exclusive --detach sleep <창 길이>` 로 공용 칸을 창 내내 붙잡고, 측정 레인은 자기 전용 DIR(`DFLOW_HEAVY_DIR=~/.dflow/locks/heavy-measure DFLOW_HEAVY_SLOTS=1`)로 돈다. 이렇게 해도 heavy.sh 밖 명령과 test-slot 은 못 막으므로 통지는 그대로 한다. test-slot 까지 막으려면 조정자가 `~/.gradle/dmes-test-slots/slot-*` 를 잡아야 하는데 그 형식은 gradle 쪽 사양이라 스킬이 건드리지 않는다.
   - 창이 끝나지 않을 때(측정 레인이 멈춤): 창 예정 끝 + 15분에 측정 레인 상태를 보고, 화면 읽기로 이유를 확인한 뒤 연장이나 중단을 정한다.
4. **load 기반 판단**: 틱마다 `load1 / 코어 수` 를 본다. 이 값이 1.5 를 넘으면(heavy.sh 와 같은 기준) 새 Workflow·새 무거운 명령 착수 지시를 미루고, 2.0 을 넘는 상태가 두 틱 이어지면 우선순위가 가장 낮은 레인에 「무거운 작업 금지」를 보낸다. 0.8 아래로 두 틱 내려오면 푼다(값은 config). 측정 창에서는 load 기준을 따로 둔다. 참고: 이 PC 에서는 load 14~17(코어당 약 1.5)에서 이미 m-mdm 시험이 5000ms 시간 초과로 연쇄 실패했다 [근거: dev-merge-coordinator.md 「부하(load 14~17) 때 5000ms 시간 초과+연쇄 실패」]. 그래서 heavy.sh 기본 1.5 보다 낮은 값(예: 1.2)이 맞을 수 있다. 이 값은 Q2 에서 함께 정한다.
5. **예외 허용**: 특정 레인에 전용 칸을 줄 수 있다(사용자 지시 「1b는 빌드/시험 하나 별도로 허용해줘」 [근거: cb 기록 2026-10-03T23:10]). 전용 칸은 상태 파일 `lanes.<레인>.heavy_env` 에 환경 변수 묶음으로 기록하고, 착수 지시에 그대로 넣는다. 전용 칸이 있으면 PC 전체 상한이 K+1 이 되므로, 측정 창 동안에는 전용 칸 레인에도 금지를 보낸다 [근거: 5레인 정본 「1b 는 heavy-1b 만 쓰니 c3 측정과 겹치면 1b 도 보류 요청」].
6. **이동·외출 창**: 사용자가 정한 시각부터 무거운 명령 금지(「9시 20분부터 gradle 시험 돌리지 말라고」 [근거: cb 기록 23:19]). 측정 창과 같은 장치로 처리하고, 끝나면 재개 통지를 한다.

### e. 세션·Pane 생성과 정리

**모델 등급과 실행 수단**(2026-10-05 사용자 지시)

조정자는 세션·워커를 띄우기 전에 일의 난이도로 등급을 정하고, 등급에 맞는 모델과 실행 수단을 고른다. Workflow 안 `agent()` 의 단계별 모델(README §1)도 같은 등급 표를 따른다.

| 등급 | 쓰는 일 | 모델 | 실행 수단 |
|---|---|---|---|
| **Fable** | 사용자가 Fable 을 요청한 경우에만 | `claude-fable-5-1` | Claude Code 세션(`--model claude-fable-5-1`) |
| **Opus** | 어려운 일: 설계 판정, 리뷰(동작 보존 판정), 보안, 트랜잭션·동시성 정합성, 원인 모를 결함 조사, 측정 판정 | `claude-opus-5-5` | Claude Code 세션 / `agent({model:'opus'})` |
| **Sonnet** | 일반 작업: 구현·수정, 시험 작성, 조사·위치 찾기, 문서 갱신 | `claude-sonnet-5-5` | Claude Code 세션 / `agent({model:'sonnet'})` |
| **GLM** | 일반 작업 중 **쉬운 일**(Sonnet 보다 쉽고 Haiku 보다 어려운 일): 본보기가 이미 있는 같은 패턴의 반복 적용(예: 다른 화면에 이미 들어간 상세 폼 분리 구조를 다음 화면에 적용), 정해진 형식의 문서·표 정리, 범위가 좁고 시험으로 바로 검증되는 수정 | GLM-5.3(Z.ai) | **새 탭**의 Claude Code 세션을 `glm -n <이름>` 으로 띄운다(아래 GLM 기동 절차). Claude Code 이므로 SendMessage·머지 요청 절차가 Claude 세션과 같다 |
| **Haiku** | 쉬운 일: 기계적 치환, 결과 확인·집계, 상태 읽기, 형식 검사 | `claude-haiku-4-5-20251001` | `agent({model:'haiku'})` 위주 |

- 경계가 애매하면 한 등급 위를 고른다. GLM 에 맡긴 일이 같은 문제에 20분 넘게 막히거나 방향이 틀어지면, 막힌 단계만 Sonnet·Opus Claude 세션(새 탭)에 넘기고 나머지는 GLM 이 계속한다 [근거: 메모 `weak-worker-partial-takeover.md`].
- GLM 은 Workflow `agent()` 의 model 값으로 고를 수 없다(같은 세션 안 서브에이전트는 그 세션의 API 공급자를 따른다). GLM 등급 일은 **세션 단위**로만 맡긴다.
- 작업 세션은 pane 분할이 아니라 **새 탭**으로 연다: `orca terminal create --worktree active --title <세션 이름> --json` → handle 에 실행 명령 send [근거: 메모 `worker-sessions-in-new-tab.md`].

**GLM 기동 절차 — Z.ai 로 가는지 먼저 확인한다**

회사 PC·회사망에서는 GLM 이 동작하지 않는다(사용자 확인, 2026-10-05). 그래서 GLM 세션을 띄우기 전에 아래 사전 확인을 반드시 거치고, 하나라도 실패하면 GLM 을 쓰지 않고 **Sonnet 세션으로 대신 띄운 뒤 사용자에게 한 줄로 알린다**("GLM 사전 확인 실패(<단계>) → Sonnet 으로 진행").

1. **alias 확인**: `zsh -ic 'alias glm'` 이 있어야 한다. 없으면 실패(그 PC 에는 GLM 설정이 없다).
2. **목적지 확인**: alias 의 `ANTHROPIC_BASE_URL` 호스트가 `api.z.ai` 여야 한다. 다른 호스트(사내 프록시 등)면 실패.
3. **실제 호출 확인**: alias 의 환경 값으로 `POST <ANTHROPIC_BASE_URL>/v1/messages`(모델 `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `max_tokens: 1`, 제한 시간 10초)를 한 번 보내 **HTTP 200** 과 응답 `model` 이 GLM 이름인지 본다. 연결 실패·시간 초과·4xx·5xx 는 실패. 비용은 토큰 몇 개 수준이다. [근거: 2026-10-05 01:3x 이 PC 실측 — `base host: api.z.ai`, `HTTP 200 model glm-5.3-flash 1.2s`]
4. **기동 뒤 확인**: 새 탭에서 `glm -n <이름>` → `terminal wait --for tui-idle` → `terminal read --screen` 에 `glm-5.3` 과 `API Usage Billing` 이 보여야 한다(`Claude Max`·`Opus` 가 보이면 GLM 이 아니라 Anthropic 계정으로 뜬 것이므로 닫고 실패 처리). 이어 시험 지시로 SendMessage 왕복(`<브랜치> / glm-ok / <모델>`)을 한 번 받는다.

- 사전 확인은 스킬 스크립트 `scripts/glm-preflight.sh` 하나로 묶는다(출력: `ok <host> <model> <초>` 또는 `fail <단계> <사유>`). **토큰 값은 출력·로그·이벤트 어디에도 남기지 않는다**(alias 에 평문으로 있으므로 스크립트가 읽어 쓰기만 한다).
- 결과는 상태 파일에 `glm: ok|fail <시각>` 으로 남기고, 같은 조정 회차에서 실패했으면 다시 시도하지 않는다(망이 바뀌었을 때만 재확인).
- 등급이 GLM 인 일을 Sonnet 으로 대신 띄웠으면 마감 보고에 그 사실을 적는다.

**생성 경로 선택**

| 경우 | 명령 흐름 | 근거 |
|---|---|---|
| 새 레인(Claude Code, 오래 감) | `orca terminal create --worktree <sel> --title <레인> --command "<claude 실행 명령> -n <레인 이름> --model <m> --effort <e> [--autocompact <tokens>] \"<첫 지시>\"" --json` → `orca terminal wait --terminal <h> --for tui-idle --timeout-ms 60000 --json`(**`satisfied: true` 확인**) → 첫 지시가 명령줄에 없으면 `orca terminal send --terminal <h> --text "<지시>" --enter --wait-submit 10 --json` | orca-cli 가이드 「Send only when the wait result reports satisfied: true … A prompt typed into a TUI that is still starting is lost」, `claude --help`(-n·--model·--effort·--autocompact) |
| 새 레인, 새 워크트리까지 | `orca worktree create --name <n> --agent claude --prompt "<지시>" --json` 은 모델·effort 를 못 준다 → 모델이 필요하면 `worktree create`(agent 없이) 뒤 위 `terminal create` | orca-cli 가이드 「Custom … model/effort handoff」 |
| 감독형 단일 과제 워커(Claude) | `orca orchestration worker-start --spec "<과제>" --agent claude --model <m> --effort <e> --worktree current --json` → 완료(`worker_done`) → `worker-release` → `check --ack` | `worker-start --help`(`--model`·`--effort` 는 `--terminal` 과 함께 못 씀) |
| opencode 워커 | `orca terminal create --worktree current --title <n> --command "opencode --standalone" --json` → `terminal wait --for tui-idle` 뒤 `terminal read --screen` 으로 빈 입력창 확인 → `worker-start --terminal <h> --worktree current --spec "<지시>"`. 지시문에 `!`·`/`·`@` 금지. `--agent opencode` 는 쓰지 않는다 | 사용자 전역 CLAUDE.md 「Orca 로 opencode 워커 띄우기」 |
| GLM 세션(쉬운 일 등급) | `glm-preflight.sh` 가 `ok` 일 때만: `orca terminal create --worktree active --title <n> --json` → `terminal send --text "cd <리포> && glm -n <n>" --enter` → `terminal wait --for tui-idle` → 화면에 `glm-5.3`·`API Usage Billing` 확인 → 지시 파일 경로 send. `fail` 이면 같은 흐름으로 Sonnet 세션 | 위 「GLM 기동 절차」, 메모 `glm-claude-worker.md` |

- 사용자가 세션을 `orca claude-teams --dangerously-skip-permissions` 로 띄우고 있다 [근거: `orca terminal list` 의 preview]. `orca claude-teams --help` 가 claude 의 help 를 그대로 내므로 claude 플래그가 통과한다고 **추정**한다. 실행 명령은 config(`launch.claude`)로 두고 킷에 박지 않는다.
- 레인 수 상한은 사용량 띠(§3.f)와 입장 제어(capacity.sh 와 같은 판정: free·swap·load)로 정한다. capacity.sh 를 그대로 부를 수 있다(`capacity.sh` 는 dflow-team 자원이므로, 없는 PC 에서는 건너뛴다).

**기동 확인**(Spawned 성공이어도 빈 셸만 남는 일이 있었다 [근거: verify-agent-spawn.md])

1. `terminal wait --for tui-idle` 의 `satisfied` 확인. false 면 한 번 더 길게, 그래도 false 면 「안 떴다」로 처리한다.
2. 프로세스 확인: `~/.claude/sessions/*.json` 에서 `name == <레인 이름>` 인 항목이 생기고 `pid` 가 살아 있는지(`kill -0`) 본다. 없으면 `terminal read --screen` 으로 원인(업데이트 중 Permission denied, 폴더 신뢰 확인 창 등)을 읽고, 빈 셸이면 `terminal close` 뒤 다시 띄운다.
3. 첫 지시 제출 증거: `send --wait-submit` 결과의 `turn_started` 단계.

**세션 ↔ 터미널 핸들 연결**(감시·compact 의 전제)

- 확인한 사실: 각 Orca 터미널 안의 세션 환경에는 `ORCA_TERMINAL_HANDLE=term_…`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_PID`, `CLAUDE_CODE_MESSAGING_SOCKET` 이 있다 [근거: 이 조사 세션의 `env`]. `~/.claude/sessions/<pid>.json` 의 `tmux` 칸은 모든 세션이 `orca:@0.%1` 로 같아 연결에 못 쓴다. 터미널 제목은 Claude 가 진행 표시로 덮어써 `orca terminal rename` 한 제목도 바뀐다(아침에 바꾼 제목이 지금은 「✳ refactor-framework-setup」 등으로 보인다).
- 그래서 **신원 보고**로 연결한다. 착수 지시에 「`echo $ORCA_TERMINAL_HANDLE $CLAUDE_CODE_SESSION_ID $CLAUDE_PID` 결과를 `신원:` 메시지로 보내라」를 넣고, 조정자가 띄운 세션은 생성 결과의 handle 을 그대로 기록한다. 핸들은 Orca 재시작 뒤 바뀔 수 있으므로(`terminal_handle_stale`) 틱마다 `orca terminal list` 에 그 handle 이 있는지 보고, 없으면 레인에 신원 보고를 다시 요청한다.

**정리 절차**(끝난 세션·Pane 은 즉시 닫는다 [근거: close-finished-agent-panes.md, 네 번 지적])

1. 정리 조건: 그 세션의 마지막 산출물(커밋·보고)을 받았고, 머지·정리 완료까지 끝났거나(레인), 결과를 장부에 적었다(임시 워커).
2. 세션이 자기 워크트리를 정리했는지 확인: `git worktree list` 에 없음, `git branch --list` 에 없음(squash 로 `-d` 거부된 브랜치는 남기고 사용자 결정 목록에 올린다).
3. 세션 종료: Claude Code 세션은 `/exit` 를 tui-idle 일 때 `terminal send` 로 넣거나, `orca terminal close --terminal <h>`. orchestration 워커는 `worker-release` → `check --ack` → `terminal close`. Agent 도구로 띄운 팀원은 `shutdown_request`, 남으면 tmux pane 을 직접 닫는다.
4. 확인: `orca terminal list --json` 에서 그 handle 이 사라졌는지, `~/.claude/sessions/` 에 그 pid 항목이 없는지, `orca orchestration worker-list` 의 reclaimable 0. 확인 결과를 상태 파일에 적는다.
5. 브라우저 작업 공간·로컬 서버를 그 세션이 열었다면 먼저 닫게 한다 [근거: MEMORY 「작업 끝나면 브라우저 닫기」].
6. wake 대상 목록(`wake-sessions.targets` 같은 것)이 있으면 갱신한다 [근거: wake-sessions-timer.md 「세션을 새로 띄우면 targets 를 다시 써야 한다」].

### f. 사용량(5시간·1주일) 모니터링과 부하 조절

**데이터 출처**(확인한 것만)

| 출처 | 내용 | 신선도·한계 | 근거 |
|---|---|---|---|
| ① statusLine 입력 JSON 의 `.rate_limits` | `five_hour`·`seven_day` 마다 `used_percentage`·`resets_at`(epoch 초) | 그 세션 TUI 가 statusLine 을 그릴 때마다. 구독자일 때만 | `~/.dflow/limits/4be6eb9f.json` 실물(`{"at":…,"rate_limits":{"five_hour":{"used_percentage":47,"resets_at":1790366400},…}}`), backends.md 203행 |
| ② `/tmp/claude-usage-cache.json` | `five_hour.utilization`·`seven_day.utilization`·`resets_at`(ISO), `limits[]`(kind·percent·severity) | 사용자 개인 statusline 스크립트가 그릴 때 120초 간격으로 OAuth usage API 를 불러 갱신(키체인 토큰 사용). 조사 시점 12:28 갱신, 5시간 24%·1주 42% | `~/.claude/statusline-command.sh`, 파일 실물 |
| ③ `/usage` 슬래시 명령 | 대화형 화면 표시 | 기계가 읽기 어렵다(화면 읽기로만) | **미확인**(실행해 보지 않음) |
| ④ ccusage | 로컬 transcript 로 토큰 집계 | 설치 안 됨(`ccusage not found`). 한도 %가 아니라 토큰 수라 판정에 맞지 않는다 | `which ccusage` |
| ⑤ `~/.dflow/limits/<id8>.json` | ①을 dflow-team 팀원 statusLine 이 덤프한 것 | **지금은 만료**: 마지막 덤프의 `seven_day.resets_at`(1790946000)이 현재(1791084399)보다 이전. `orca claude-teams` 로 띄운 레인은 덤프를 남기지 않는다 → capacity.sh `usage` 는 지금 `CAPACITY_USAGE_UNKNOWN`(막지 않음)이 된다 | 파일 실물, capacity.sh 주석 |

| ⑥ 스킬 전용 세션별 statusLine 덤프 | ①을 `{at, session_id, context_window, rate_limits}` 로 덤프(§3.j-1 (A)) | **미구현**. 열린 질문 Q1 결정 뒤에 생긴다 | — |

**설계**: 스킬은 OAuth API 를 직접 부르지 않는다(토큰을 다루지 않는다). 읽는 순서는 config `usage.sources` 로 정한다. **지금 기본은 ② 캐시 파일**(경로는 config, 이 PC 값 `/tmp/claude-usage-cache.json`) → ⑤ 이고, Q1 이 정해져 ⑥ 이 생기면 ⑥ 을 1순위로 올린다. 모두 없거나 30분보다 오래됐고 창이 이미 지났으면 「모름」으로 보고 막지 않는다(fail-open, capacity.sh 와 같은 원칙). 계정 전체 값이므로 가장 최근 것 하나만 쓴다.

**띠와 행동**(수치는 제안값, config `usage.bands`)

| 띠 | 조건(둘 중 높은 쪽) | 행동 |
|---|---|---|
| G 보통 | 5h < 60% 이고 1주 < 70% | 제한 없음. 레인 Workflow 동시 agent 상한 기본(3) |
| Y 주의 | 5h ≥ 60% 또는 1주 ≥ 70% | 새 레인·새 Pane 생성 금지. 동시 agent 상한 2. 조사·문서·시험 확인 단계는 sonnet/medium 강제(이미 기본), 구현은 opus/high 유지. 대기 작업(교차 리뷰 등) 자동 배정 중단 |
| O 경고 | 5h ≥ 80% 또는 1주 ≥ 85% | 동시 레인 수 줄이기: 우선순위 낮은 레인부터 「지금 항목 끝나면 정본 갱신 뒤 쉬어라」. 동시 agent 상한 1. opus 는 리뷰·판정에만, 구현은 sonnet/high. 새 Workflow 금지(진행 중인 것은 끝까지 둔다 [근거: workflow-model-per-stage.md 「이미 돌고 있는 워크플로는 멈추면 작업이 반쯤 남으므로 끝까지」]) |
| R 정지 | 5h ≥ 95% 또는 1주 ≥ 95% | 모든 레인에 「지금 단계 끝에서 멈추고 정본 갱신」. 머지·정리만 계속. 한도 초기화 시각(`resets_at`)에 재개 예약 |

- 1주 사용량은 남은 날 수로 보정한다(제안): `허용 % = 100 × (7 − 남은 일수) / 7 + 10`. 1주 사용률이 이보다 높으면 한 띠 올린다. 화요일 오전에 60% 를 쓴 것과 일요일 저녁 60% 는 다르다.
- **한도 초기화 뒤 재개**: `autoContinueAtUsageLimit: true` 가 켜져 있으면 각 세션이 스스로 이어 간다 [근거: settings.json]. 조정자는 `resets_at` + 2분에 ScheduleWakeup 을 걸어 레인 status 를 확인하고, 멈춘 레인에만 「계속 진행」을 보낸다. 조정자 자신도 멈춰 있을 수 있으므로 셸 타이머(`wake-sessions.sh` 같은 것, Claude 토큰 안 씀)를 보조로 둔다. 타이머 스크립트 경로는 config 다.
- 띠가 바뀔 때만 전 레인에 `사용량 조정` 을 한 번 보낸다(같은 알림 반복 금지, capacity.sh `--state` notify 원리).

### g. compact·재개 관리(정본 메모)

- 레인마다 **정본 메모**(메모리 파일 또는 scratchpad `resume-*.md`)를 하나 두게 한다. 형식: 지금 상태·남은 순서·결정·조정 세션 이름·다음 단계. 실제 예: `memory/refactor-a8-framework-lane.md`, 1b `scratchpad/resume-compact.md` [근거: MEMORY 색인].
- 조정자의 정본은 상태 파일(§4) + 사람이 읽는 메모 하나(5레인 정본처럼). compact 전·주요 결정 뒤 갱신한다.
- 다른 세션 compact 의 실제 절차는 §3.j 에서 자동화한다. 10-04 cb 가 손으로 한 순서: `orca terminal wait --for tui-idle --timeout-ms 300000` → `terminal send --text "/compact <레인 상태 한 줄, 정본 경로, 조정 세션>" --enter --wait-submit 10` → 화면에 "Compacting" 이 사라질 때까지 폴링 → 재개 지시 [근거: cb 기록 Bash 호출].
- compact 뒤 `/dflow-team` 처럼 스킬 전체를 다시 부르지 않게, SKILL.md 맨 위에 「압축 뒤에는 Skill 을 다시 부르지 말고 재독 세트만 읽는다」를 둔다 [근거: dflow-team SKILL.md 머리 인용문].

### h. 마감: SUMMARY, 정리, 보고

1. 마감 조건: 모든 레인 항목 done, 머지·정리 완료, 측정 끝.
2. 통합 확인: dev 로 서버 재기동·주요 화면 확인(조정자만, 방법은 프로젝트 config). 끝나면 브라우저를 닫는다.
3. SUMMARY: 레인 기록 문서(structure·perf)와 레인이 쓴 요약 초안을 모아 `SUMMARY.md` 하나로 정리한다 [근거: README §6, 5레인 정본 「남은 마감 순서 5」]. 임시 워커(sonnet/medium)에게 초안 모으기를 맡기고 조정자가 대조한다.
4. 정리 확인: `git worktree list`·`git branch` 에 남은 것, Orca 터미널 목록, reclaimable 워커, 감시 cron(`CronDelete`), 측정·금지 창이 모두 닫혔는지.
5. 마감 보고: 머지 목록(해시), 진도 100% 근거, 조정자가 내린 결정(사용자에게 알릴 것), 사용자 결정 대기 목록(삭제 후보 브랜치·DB 잔여 행 등), 후속 후보. 5레인 정본의 「cb 결정」「후속·사용자 결정 대기」 칸이 견본이다.
6. 「끝까지」 지시가 있으면 1~5 를 질문 없이 잇는다. 한도로 멈췄다면 첫 보고에 시각 근거와 함께 밝힌다 [근거: finish-to-the-end-when-told.md].

### i. idle 감시와 자동 작업 배정

**목표**: 진도 점검 틱마다 세션·Pane 이 idle 인지 보고, 진짜 idle 이면 계속 일을 준다. 정해진 다음 일이 있으면 그 일을, 없으면 대기 작업을 준다 [근거: coordinator-keep-lanes-busy.md, 사용자 요구 2026-10-04 03:24 「주기적인 진도 체크 세션/pane이 idle 상태인지도 감시해서 계속 일을 시키는 기능」].

**i-1. 판정 신호**(실제로 읽을 수 있는 것)

| 신호 | 읽는 법 | 의미·한계 | 근거 |
|---|---|---|---|
| S1 세션 상태 | `~/.claude/sessions/<pid>.json` 의 `status`(busy/idle)·`statusUpdatedAt` | 1차 신호. 토큰 안 씀. `peerFeatures` 에 `notify_idle` 이 있다. **백그라운드 Workflow·Bash 가 도는 동안의 값은 미확인**(턴이 끝나면 idle 로 보일 가능성이 크다고 추정) | 파일 실물(6개 세션 모두 busy 였음) |
| S2 ListAgents | 조정자 도구 호출 | busy/idle 을 보여 준다. S1 과 같은 출처로 추정 | cb cron 문구 「ListAgents 로 idle 레인을 찾고」 |
| S3 TUI 상태 | `orca terminal wait --for tui-idle --timeout-ms 3000` | 짧게 기다려 satisfied 면 입력 대기 화면. opencode 에서는 일하는 중에도 먼저 끝난다(믿지 않는다) | orca-cli 가이드, opencode-worker-management.md |
| S4 화면 | `orca terminal read --terminal <h> --screen --json` | 「esc to interrupt」·「Compacting」·선택 창(한도 선택, AskUserQuestion, 권한 확인)·「Waiting for …」 문구 판별 | opencode-worker-management.md, wake-sessions.sh 의 한도 창 판별 |
| S5 터미널 출력 시각 | `orca terminal show` 의 `lastOutputAt` | 화면이 마지막으로 바뀐 시각. 스피너도 출력이라 busy 판별에 보조로만 | `orca terminal show` 실물 |
| S6 `agentWait` | `orca terminal show` 의 `agentWait` 칸 | 이름으로 보아 에이전트가 무언가(사용자 입력?)를 기다리는지 나타낼 것으로 **추정**. 값의 형식은 **미확인**(조사 때 null) | `orca terminal show` 실물 |
| S7 백그라운드 작업 | (가) `heavy.sh snapshot` 의 RUN·WAIT 줄 cwd 가 그 레인 워크트리 (나) `~/.dflow/jobs/*` 살아 있는 잡 (다) 그 세션 `/private/tmp/claude-501/<proj>/<sessionId>/tasks/*.output` 중 최근 N분 안에 바뀐 것(Workflow 출력이 `w*.output` 이라는 것은 파일 이름 접두어만 보고 한 **추정**) (라) `ps` + `lsof -d cwd` 로 레인 워크트리를 cwd 로 둔 GradleWrapperMain·vitest·playwright·tsc | (다)의 "0B 파일 = 실행 중" 여부는 **미확인**, mtime 만 쓴다 | heavy.sh, 1b 세션 tasks 폴더 `ls -lt`, cb 기록의 ps+lsof 집계 명령 |
| S8 마지막 보고 시각 | 상태 파일 `lanes.<레인>.last_report_at`(조정자가 메시지를 받을 때 적음) | 보고가 끊긴 시간 | — |
| S9 브랜치 활동 | `git log -1 --format=%ct <레인 브랜치>` 와 워크트리 `git status --porcelain` 변화 | 커밋·미커밋 변화가 있으면 일하는 중 | cb cron 문구 「브랜치 상태(/usr/bin/git log)」 |
| S10 의도된 대기 표식 | 상태 파일 `lanes.<레인>.hold = {reason, until}` | 측정 대기·머지 허가 대기·사용자 승인 대기·무거운 작업 금지처럼 조정자가 일부러 세운 상태 | — |

**i-2. 판정 규칙**

```
후보 = S1 idle (또는 S2 idle) 이고 S1 statusUpdatedAt 이후 ≥ idle_min(기본 5분)
거부(= idle 아님) 하나라도 맞으면:
  - S7 어느 하나가 그 레인 것 (백그라운드 Workflow·gradle·잡이 돈다)
  - S4 에 선택 창·질문 창·권한 확인이 보인다 → "사용자 입력 대기" (조정자가 대신 답하지 않는다, 사용자에게 한 줄 알림)
  - S4 에 "Compacting" 이 보인다
  - S10 hold 가 있고 until 이 안 지났다 (until 이 지났으면 hold 를 풀고 다시 판정)
  - 조정자가 이 레인에 마지막으로 지시를 보낸 지 cooldown(기본 15분) 안이다
  - 사용량 띠 R (그때는 idle 이 정상)
확정 = 후보이고 거부가 없고, 연속 2틱(또는 한 틱 안에서 2분 간격 두 번) 같은 결과
```

- 거부 사유가 "사용자 입력 대기" 면 조정자는 그 레인에 일을 넣지 않는다. 입력창에 남은 질문 위에 지시를 덮으면 사용자 답이 섞인다.
- 거부 사유가 "S7 백그라운드" 이고 그 상태가 config `stall_max`(기본 90분)를 넘으면 idle 이 아니라 **정체 의심**으로 분류해 그 레인에 「상태 한 줄 보고」만 요청한다.

**i-3. 배정**

1. 다음 할 일이 상태 파일에 있으면(`lanes.<레인>.queue` 첫 항목, 의존이 풀린 것) 그 일을 §3.k.1 템플릿으로 지시한다.
2. 없으면 **대기 작업 풀**(`backlog`)에서 그 레인 범위에 맞는 것을 준다. 풀의 예: 다른 레인 머지 전 교차 리뷰, 기록 문서와 커밋 대조, 통합 확인 체크리스트 작성, 레인 범위 안 기존 결함 정리(동작 변경 없는 것), SUMMARY 초안 [근거: coordinator-keep-lanes-busy.md 「교차 리뷰·통합 확인 체크리스트·범위 안 기존 결함 정리」, 5레인 정본 「c3 대기 작업」]. **범위 밖 일은 자동 배정하지 않는다**(열린 질문 Q8).
3. 풀도 비면 「지금 맡길 일 없음, 정본 갱신하고 쉬어라」를 한 번만 보내고 `hold = {reason: "no-work"}` 를 세운다. 이 레인을 닫을지는 마감 단계에서 정한다.
4. 사용량 띠와의 관계: G 는 1·2 모두, Y 는 1 만(대기 작업 자동 배정 중단), O 는 1 중 머지 임박·측정 항목만, R 은 배정 없음. 띠 때문에 일을 안 준 레인은 hold `usage-band` 로 표시해 다음 틱에 같은 판단을 되풀이하지 않는다.

**i-4. 반복 지시 방지**

- 지시마다 `instr_id`(레인-일련번호)를 붙이고 상태 파일에 `{instr_id, sent_at, kind, ack_at}` 로 남긴다. 레인은 다음 보고 첫 줄에 `instr_id` 를 적는다(착수 지시 템플릿에 규칙으로 넣음).
- 같은 레인에 같은 종류 지시를 cooldown 안에 다시 보내지 않는다. ack 가 없는 지시가 있으면 새 지시 대신 「<instr_id> 받았는지 한 줄 답」만 보낸다(최대 2회, 그 뒤는 화면 읽기로 원인 확인 → 사용자에게 알림).
- 지시는 늘 SendMessage 로 보낸다(대화 기록에 남고 사용자가 레인 화면에서 볼 수 있다). Workflow 가 도는 중이면 보내지 않는다(i-2 거부, §3.k.4).

**i-5. 점검 주기**: 기본 20분(CronCreate, 정각을 피한 분). 머지·측정 처럼 바쁜 구간에는 메시지가 오면 그 턴에 처리하므로 틱을 더 줄이지 않는다. 측정 창 동안에는 측정 레인만 5분 간격 Monitor 로 본다.

### j. 컨텍스트 임계값(기본 40%) 초과 시 자동 /compact

**j-1. 사용률을 읽는 방법**

| 방법 | 확인 정도 | 근거·한계 |
|---|---|---|
| (A) statusLine 입력 JSON 의 `context_window.used_percentage`(없으면 `current_usage.input_tokens`·`total_input_tokens` ÷ `context_window_size`) | 필드 이름은 사용자 statusline 스크립트가 읽고 있어 근거 있음. **실제 값 덤프는 미확인** | `~/.claude/statusline-command.sh` 14~23행. 쓰려면 세션별 덤프가 필요하다 |
| (B) transcript 끝 사용량 | **확인함**: `~/.claude/projects/<proj>/<sessionId>.jsonl` 에서 `isSidechain` 이 아닌 마지막 assistant 메시지의 `message.usage.input_tokens + cache_read_input_tokens + cache_creation_input_tokens`. 조사 때 cb 약 127K, 1b 약 224K | 창 크기는 transcript 에 없다(model 이 `claude-opus-5-5` 로만 찍힘). 창 크기는 config 나 실행 기록(`[1m]` 모델·`--model`)에서 가져온다. transcript **파일 크기**는 쓸모없다(cb 12MB 인데 컨텍스트는 127K. compact 전 기록이 남기 때문) |
| (C) 화면 표시 | 사용자 statusline 이 「ctx: … N%」를 그린다 → `terminal read --screen` 으로 읽을 수 있다 | 사용자 statusline 형식에 묶인다(PC 별) |

**설계**: 기본은 (B)(설정 변경 없이 바로 됨). (A)는 개선안이다: 스킬이 띄우는 세션에 `--settings` 로 statusLine 덤프를 붙여 `{at, session_id, context_window, rate_limits}` 를 `~/.coord/ctx/<sessionId>.json` 에 쓰게 한다(dflow-team 이 `.rate_limits` 를 덤프하는 방식과 같음 [근거: `~/.dflow/limits/4be6eb9f.settings.json`]). 단, `--settings` 의 statusLine 이 사용자 statusline 을 대체하므로, 덤프한 뒤 사용자 스크립트를 이어 부르는 감싸기 스크립트로 한다. 사용자가 이미 띄운 세션은 (B)를 쓴다.

**j-2. 임계값**

- 1M 창 모델에서 40% = 약 400K, 200K 창 모델에서 40% = 약 80K. 의미가 다르다. 1M 에서 40% 는 이미 긴 대화라 응답 품질·비용(캐시 읽기량)에 부담이 크고, 200K 에서 40% 는 아직 여유가 있어 너무 자주 compact 하게 된다.
- config 는 두 가지를 함께 둔다: `compact.threshold_pct`(기본 40)와 `compact.threshold_tokens`(기본 없음). 둘 다 있으면 **먼저 닿는 쪽**. 창 크기별 덮어쓰기 `compact.by_window: {"1000000": {pct: 40}, "200000": {pct: 70}}`(200K 값은 제안).
- 새로 띄우는 세션에는 백스톱으로 `claude --autocompact <tokens>`(100k~1M 토큰)를 준다 [근거: `claude --help` 「--autocompact <auto|tokens> Auto-compact window size」]. 이 값이 정확히 몇 토큰에서 발동하는지는 **미확인**이라 주 경로는 외부 `/compact` 로 둔다.

**j-3. 안전한 실행 시점**(모두 만족할 때만 보낸다)

- §3.i 의 거부 조건 중 "사용자 입력 대기"·"Compacting"·"S7 백그라운드(Workflow·gradle·잡)"가 없다
- 머지 중이 아니다(상태 파일 `merge.in_flight` 가 그 레인이 아님)
- 측정 창의 측정 레인이 아니다
- `orca terminal wait --for tui-idle --timeout-ms 300000` 이 `satisfied: true`
- 화면 아래에 「esc to interrupt」가 없다(바로 앞 확인)

**j-4. compact 전 준비**

1. 조정자 → 레인: `정본 갱신 요청: compact 예정. 정본 메모를 지금 상태로 갱신하고, 끝나면 "정본 갱신 완료: 경로 / 남은 일 3줄" 로 답해 달라.`
2. 답을 받으면 「남은 일 3줄」을 상태 파일 `lanes.<레인>.pre_compact` 에 적는다. 30분 안에 답이 없으면 이번 틱은 넘긴다(다음 틱에 다시, 최대 2회 뒤 사용자 알림).
3. j-3 확인 → `orca terminal send --terminal <h> --text "/compact <레인> 진행 중. 정본은 <경로>. 조정 세션 <이름>(<주소>). 다음 단계: <한 줄>" --enter --wait-submit 10 --json`. 문구에 `!` 를 넣지 않는다.

**j-5. compact 뒤 확인**

1. Monitor 로 화면에서 "Compacting" 이 사라질 때까지 기다린다(최대 10분).
2. 사용률 재측정(B): 크게 줄었는지(예: 10% 아래). 10-04 실측은 compact 뒤 0% 였다 [근거: cb 기록 「compact 뒤 컨텍스트 사용량은 0% 가 됐습니다」].
3. 조정자 → 레인: `재개 확인: 정본을 읽고 남은 일 3줄로 답한 뒤 이어서 진행해 달라.` 답을 `pre_compact` 와 대조한다. 크게 다르면 정본 경로를 다시 짚어 준다.
4. compact 기록(`at, before_tokens, after_tokens`)을 상태 파일에 남긴다. 같은 레인은 compact 뒤 최소 30분은 다시 하지 않는다.

**j-6. 예외**

- opencode·agy 처럼 `/compact` 가 다른 워커는 대상에서 뺀다(tui-idle 을 믿을 수 없다 [근거: opencode-worker-management.md]).
- Workflow 가 도는 세션은 Workflow 가 끝난 뒤에 한다(§3.k.5).
- 임시 워커는 compact 하지 않고 일을 끝내면 닫는다.

**j-7. 조정자 자신의 compact**

- 조정자는 자기 `ORCA_TERMINAL_HANDLE` 을 알지만, 자기 턴 안에서 자기 터미널에 `/compact` 를 보내면 턴이 끝나기 전이라 입력이 대기열에 쌓인다(동작 **미확인**). 그래서 조정자는 스스로 하지 않고 다음 중 하나로 한다.
  - (가) 기본: 틱에서 자기 사용률이 임계값을 넘으면 정본 메모·상태 파일을 갱신하고 사용자에게 「조정자 compact 필요」를 한 줄로 알린다. 사용자가 `/compact` 를 친다(10-04 실제로 사용자가 쳤다 [근거: cb 기록 03:18 `/compact 리팩토링 5레인 조정 중, 정본은 refactor-5lanes 메모`]).
  - (나) 선택: 셸 도우미(`coord-self-compact.sh`, `nohup` 백그라운드)가 조정자 턴이 끝나 tui-idle 이 되기를 기다렸다가 `/compact …` 를 넣는다. 이렇게 하면 사람 없이 돈다. 위험(감시 cron 이 동시에 끼어듦)은 도우미가 tui-idle 을 확인한 직후 보내는 것으로 줄인다. 열린 질문 Q6.
- compact 뒤 조정자는 SKILL.md 를 다시 부르지 않고 재독 세트(상태 파일 → 정본 메모 → 스킬 references 의 「재개」 절)만 읽고, CronList 로 감시 cron 이 살아 있는지 확인한다.

### k. Workflow 기본 사용

**k-1. 지시 템플릿 기본값**: 스킬이 만들거나 지시하는 세션의 착수·작업 지시에는 늘 다음 블록이 들어간다 [근거: README §1 표, workflow-model-per-stage.md].

```text
[작업 방식] 이 일은 Workflow 도구로 돌린다(먼저 workflow-authoring 스킬을 읽는다).
모든 agent() 에 model 과 effort 를 적는다:
- 조사·위치 찾기·문서 갱신·기계적 치환: sonnet / medium
- 특성 테스트 작성·구현·수정: opus / high
- 리뷰(동작 보존 판정)·정합성 결함 수정: opus / high
- 보안·트랜잭션 정합성 판정: opus / xhigh
- 시험 실행·결과 확인: sonnet / medium
항목마다 구현 → 리뷰 → 지적 수정. 리뷰가 clean 이 아니면 다음 항목으로 넘어가지 않는다.
동시 agent 는 {N}개까지(조정자가 사용량·부하 띠로 정한다). 무거운 명령은 {heavy_env} 로 heavy.sh 를 거친다.
보고 첫 줄에 지시 번호 {instr_id} 를 적는다.
```

표는 프로젝트 config `workflow.model_table` 에서 읽는다(킷 기본값은 위 표).

**k-2. 예외**(Workflow 없이 세션이 직접): 한 줄·한 파일 수정, 단순 조회·질문 답, 머지·정리 같은 짧은 git 작업, 측정 실행(사람이 정한 절차를 그대로 돌리는 것), compact·재개 확인 답.

**k-3. 동시 agent 수와 묶기**

- 세션 밖에서 Workflow 의 동시 agent 수를 강제할 수단은 없다(확인한 범위에서). 그래서 상한은 **지시문으로만** 준다. 띠가 바뀌면 `사용량 조정` 메시지로 새 상한을 알리고, 이미 도는 Workflow 는 끝까지 두고 다음 Workflow 부터 적용하게 한다.
- 기본 상한: 레인당 동시 agent 3(5레인 정본 「동시 agent 3 안팎」). 띠 Y=2, O=1, R=0(새 Workflow 없음). load 가 높아 「무거운 작업 금지」 상태인 레인은 시험 단계 agent 를 띄우지 않는다(조사·문서 agent 만).
- Workflow 안의 무거운 단계(시험 실행)는 레인 안에서 한 번에 하나, heavy.sh 를 거친다. 레인 공용 잠금이 필요하면 레인 scratchpad 의 mkdir 잠금(c3-heavy.sh 방식)도 허용한다 [근거: workflow-resume-prefix-cache.md].
- 전체 PC 기준 동시 agent 합은 `레인 수 × 레인 상한` 이다. 사용량 O 띠에서 레인 수 자체를 줄이는 것은 §3.f.

**k-4. 금지·주의**

- 실행 중인 Workflow 하위 에이전트에 SendMessage 를 보내지 않는다. 사본이 새로 떠 같은 파일을 함께 고친다. 규칙을 바꿔야 하면 그 세션에 「Workflow 를 TaskStop 하고 남은 단계만 새로 띄워라」를 지시한다 [근거: no-sendmessage-to-workflow-agents.md].
- 재개 캐시(`resumeFromRunId`)는 앞에서부터 이어지는 같은 호출만 재사용한다. 앞쪽 지시문을 고치면 거의 전부 다시 돈다(c3 에서 동시 agent 9개 사고). 규칙을 더할 때는 journal·워크트리로 남은 일을 확인하고 **남은 단계만 담은 새 스크립트**를 띄우게 한다 [근거: workflow-resume-prefix-cache.md].

**k-5. idle·compact 와의 관계**

- 세션이 백그라운드로 Workflow 를 돌리는 동안은 idle 이 아니다(§3.i S7(다): 그 세션 tasks 폴더에 최근 바뀐 `w*.output` 이 있으면 거부). 세션 status 가 idle 로 보여도 일을 넣지 않는다.
- compact 는 Workflow 가 끝난 뒤에 한다. 임계값을 넘었는데 Workflow 가 돌면 `compact_pending` 을 세우고, 끝난 뒤 첫 틱에 §3.j 를 한다. Workflow 결과를 세션이 처리해 정본을 갱신한 다음이어야 한다.
- 단, 컨텍스트가 매우 높으면(예: 1M 에서 70%) 세션 쪽에서 Workflow 결과를 받기 전에 넘칠 수 있으므로 config `compact.hard_pct` 를 두고, 그때는 사용자에게 알린다(강제로 끊지 않는다).

**k-6. Workflow 가 없는 워커**: opencode·agy·codex 워커에는 k-1 블록을 넣지 않는다. 대신 「한 과제, 끝나면 보고」 형식의 짧은 지시를 주고, 동시 실행 수는 워커 수 자체로 통제한다.

### l. 권한 확인 창(실행 여부 질문) 감시와 응답

2026-10-04 사용자 요청으로 추가했다. 그날 a8 세션은 bypass permissions 모드였는데도, Workflow 하위 에이전트의 셸 명령(heredoc 과 `zsh -c` 가 섞인 복합 명령)에서 "This shell -c script runs rm and could not be checked … Do you want to proceed?" 확인 창이 떴다. 이 창은 일정 시간(그날 약 1분 남짓) 뒤 자동 거부되고, 그동안 Workflow 가 멈춘다. 사용자가 발견해 알렸고, 조정자가 화면을 읽어 명령 전문을 확인한 뒤 `1`(Yes)을 보냈다.

**l-1. 감지**

- 매 감시 틱(§3.c)마다, 그리고 레인이 busy 인데 보고가 오래 없을 때 레인 터미널 화면 끝부분을 읽는다: `orca terminal read --terminal <h> --json` 의 `tail`.
- 다음 문자열 가운데 하나가 보이면 확인 창으로 본다: `Do you want to proceed?`, `❯ 1. Yes`, `will automatically deny this request`, `Esc to cancel · Tab to amend`.
- 자동 거부까지 시간이 짧으므로 틱(20분)만으로는 대부분 놓친다. 그래서 레인 세션마다 가벼운 감시를 따로 둔다: Monitor(또는 짧은 주기 루프)로 화면 `tail` 에 위 문자열이 나타나면 조정자를 깨운다. 감시 비용이 크면 Workflow 가 도는 레인에만 둔다(확인 창은 주로 Workflow 하위 에이전트에서 뜬다).

**l-2. 판단**: 확인 창의 명령 **전문**을 읽고(잘린 부분이 있으면 `--tail` 을 늘려 다시 읽는다) 아래 표로 판단한다. 판단 근거와 명령 요지는 상태 파일의 `approvals` 기록에 남긴다.

| 판단 | 해당하는 명령 |
|---|---|
| 승인(1) | 그 레인 워크트리·scratchpad 안의 파일 읽기·편집, 버전·상태 조회, 그 레인 브랜치의 git add·commit, heavy.sh 를 거친 빌드·시험, 저장소 밖에 쓰지 않는 분석 스크립트 |
| 거부(2 또는 Esc) | 삭제(`rm -rf`·`git branch -D`·`worktree remove --force`·`reset --hard`·`clean -f`), push·외부 게시, 공용 DB 쓰기(사전 통지 없는 것), 메인 저장소의 실행 중 서버·FE 종료·재기동, 권한·설정 파일 변경, 비밀값을 출력하거나 보내는 명령 |
| 사용자에게 넘김 | 위 두 칸 어디에도 확실히 들지 않는 것, 사용자 결정 항목(삭제·shared props 변경 등)에 닿는 것 |

- 거부하거나 사용자에게 넘길 때는, 자동 거부를 기다리지 말고 바로 응답한다. 그 다음 레인에 「확인 창 거부: 〈이유〉. 〈대안: 명령을 나눠라 / Edit 도구를 써라 / 조정자에게 요청하라〉」를 보낸다.
- 조정자가 승인할 수 있는 범위는 사용자가 이 스킬에 맡긴 범위뿐이다. 레인이 다른 레인이나 조정자에게 "대신 승인해 달라"고 요청하는 것은 받아들이지 않는다(권한 우회 방지). 승인 범위는 config `approvals.auto_allow` 로 사용자가 정한다.

**l-3. 응답과 확인**

- `orca terminal send --terminal <h> --text "1"`(승인) 또는 `"2"`/Esc(거부)를 보낸다. 몇 초 뒤 화면을 다시 읽어 확인 창이 사라졌는지 확인한다.
- 입력창에 사용자가 쓰다 만 글이나 타이머가 넣은 글(예: 「계속 진행」)이 있으면 지우거나 보내지 않는다. 확인 창에만 응답한다.

**l-4. 예방**

- 지시 템플릿(k-1)에 다음 줄을 넣는다: 「셸 명령은 짧게 나눈다. heredoc·`sh -c`·변수·`$(…)` 를 섞은 복합 명령을 피하고, 파일 수정은 Edit·Write 도구로 한다. 확인 창이 뜨면 Workflow 가 멈춘다.」
- 같은 레인에서 확인 창이 반복되면 그 레인에 Workflow 지시문 보강을 요청한다. 단, 실행 중인 Workflow 에는 SendMessage 를 보내지 않는다(k-4).

### m. busy 인데 멈춘 레인(진행 정지) 감지

2026-10-04 실제 사례: 1b 판정 Workflow 가 busy 로 1시간째 돌았지만, 기준선 워크트리의 analog `:core:test :api:test` 가 30분째 CPU 0% 였다. jstack 으로 보니 시험 워커는 시험을 끝내고 `MessageHub.stop → awaitTermination` 에서 기다리고 있었다(`--info` 로 출력이 많아 데몬 쪽이 출력 이벤트를 받아 가지 않은 것으로 추정). 이 실행이 레인 전용 heavy 칸을 쥐고 있어 뒤 단계가 모두 막혔다. idle 판정(§3.i)은 이런 상태를 "busy" 로 보므로 따로 잡아야 한다.

- **신호(틱마다)**: ① 레인 산출물 폴더(scratchpad·결과 디렉터리)에서 최근 N분(기본 20) 동안 바뀐 파일이 없음 ② 그 레인이 띄운 gradle·시험 프로세스 트리의 누적 CPU 시간이 두 틱 사이에 거의 늘지 않음(`ps -o time`) ③ heavy 슬롯을 그 레인이 쥐고 있음. 셋이 겹치면 「정지 의심」이다.
- **확인**: 해당 JVM 에 `jstack` 을 떠 대기 위치를 본다(읽기 전용). 시험이 끝난 뒤 출력 전달에서 막혔는지, 교착인지, 외부 자원(DB 잠금·포트)을 기다리는지 가린다.
- **조치**: 조정자는 프로세스를 직접 죽이지 않는다. 근거(pid, 경과, CPU, 대기 위치)와 권고(자기 트리만 종료, `--info` 빼고 출력은 파일로, 결과는 XML 로 판정)를 레인에 보낸다. 메인 서버·공용 데몬은 대상에서 뺀다.
- **예방(지시 템플릿 k-1 에 추가)**: 무거운 단계마다 시간 상한(모듈당 15분, 전체 빌드 40분 등)을 두고, 로그가 5분 넘게 늘지 않으면서 CPU 0% 이면 자기 트리만 TERM 으로 끝내고 blocked 로 보고한다. 긴 gradle 실행에는 `--info` 를 쓰지 않고 출력을 파일로 보낸다.

---

## 4. 상태 저장과 compact 뒤 복구

### 4.1 위치

- 상태 폴더: config `state_dir`(기본 `~/.coord/<run-id>/`). 워크트리 밖에 둔다(워크트리 안에 쓰면 DIRTY 검사·정리가 깨진다는 dflow-team 교훈 [근거: backends.md 「워크트리 밖(~/.dflow/limits)에 쓴다」]).
- 사람이 읽는 정본 메모: 조정자의 메모리 파일(예: `refactor-5lanes-2026-10-04.md`). 상태 파일에서 자동 생성하는 요약 + 사람이 쓰는 결정 칸.

### 4.2 파일

| 파일 | 형식 | 내용 |
|---|---|---|
| `state.json` | JSON(스크립트가 읽고 쓴다, `jq`) | run 정보, 레인 표, 의존, 머지 진행, 창, 띠, 지시 기록 |
| `events.jsonl` | JSON 줄 | 시각순 사건(지시·보고·머지·compact·창 열고 닫기·띠 변경). 상태 재구성 근거 |
| `lanes/<레인>/brief.md` | Markdown | 착수 지시 원문(정본) |
| `lanes/<레인>/reports.md` | Markdown | 받은 보고 요약 누적 |
| `summary.md` | Markdown | 사람이 읽는 현재 상태(정본 메모와 같은 내용, 자동 생성) |

`state.json` 골격

```json
{
  "run": {"id": "refactor-2026-10", "goal": "...", "rules_doc": "docs/refactor-2026-10/README.md",
          "integration_branch": "dev", "coordinator": {"name": "dmes-standard-cb", "addr": "uds:/tmp/cc-socks/3693.sock",
          "session_id": "f733ea8c-…", "handle": "term_0c7e…"}, "cron_id": "19b79692"},
  "lanes": {
    "a8": {"session": {"name": "refactor-framework-setup", "addr": "uds:…/20381.sock", "session_id": "eacbadd8-…",
                       "pid": 20381, "handle": "term_7f39…", "kind": "claude", "window": 1000000},
           "branch": "refactor/framework", "worktree": ".claude/worktrees/framework",
           "owned": ["src/backend/cactus-core/**"], "forbidden": ["**/build.gradle"],
           "heavy_env": null, "priority": 2,
           "items": [{"id": "1", "title": "...", "weight": 2, "done": true}],
           "queue": ["perf-docs"], "hold": {"reason": "measure-wait", "until": "2026-10-04T13:00+09:00"},
           "last_report_at": "...", "last_instr": {"id": "a8-17", "kind": "next-work", "sent_at": "...", "ack_at": null},
           "ctx": {"tokens": 224000, "pct": 22, "at": "..."}, "compact": {"pending": false, "last_at": "..."},
           "memo": "memory/refactor-a8-framework-lane.md"}
  },
  "deps": [["a8:3b", "a6:menu-cache"], ["a8", "1b:phase2"]],
  "merge": {"in_flight": {"lane": "a6", "branch": "refactor/mcm", "expected_tree": "…", "granted_at": "…"},
            "history": [{"lane": "a8", "merge": "bb8ee036", "tree": "…", "cleaned": true}]},
  "windows": [{"kind": "measure", "lane": "c3", "opened_at": "…", "until": "…", "notified": ["a8", "b9", "a6", "1b"]}],
  "usage": {"band": "G", "five_hour": 24, "seven_day": 42, "src": "cache", "at": "…"},
  "backlog": [{"id": "xr-1b-e2e", "kind": "cross-review", "fits": ["c3"], "desc": "1b dmd e2e 교차 리뷰"}],
  "decisions": [{"at": "…", "by": "coordinator", "text": "머지 순서 준비된 레인부터"}],
  "pending_user": [{"text": "브랜치 archive/a8-backup-e71aa0b0 -D 여부"}]
}
```

### 4.3 compact 뒤 복구(조정자)

1. 재독 세트만 읽는다: `state.json` → `summary.md` → 사람 정본 메모 → 스킬 `references/resume.md`.
2. `CronList` 로 감시 cron 확인, 없으면 다시 만든다(id 를 state 에 갱신).
3. `coord-status.sh` 로 현재 상태를 다시 모아 state 와 다른 점(레인 pid 바뀜, handle stale, 머지 진행)을 맞춘다. `events.jsonl` 마지막 이후에 들어온 메시지는 대화에 남은 것으로 처리한다.
4. 진행 중이던 창·머지가 있으면 그 상대 레인에 상태 한 줄 확인을 보낸다.

---

## 5. 스킬 파일 구성안

### 5.1 위치

- 킷은 프로젝트 비의존으로 쓰고, dflow 킷처럼 리포 `.claude/skills/coordinator/` 를 정본으로 둔 뒤 다른 리포·전역에서 링크한다(dflow-* 가 10-01 부터 이 리포 정본 [근거: MEMORY 「로컬 심볼릭 링크 경로」]). 전역(`~/.claude/skills`)에 둘지는 열린 질문 Q3.

### 5.2 파일

```
coordinator/
  SKILL.md                    진입점: 트리거, 인자, 역할, 틱 절차 요약, 금지 목록, 「압축 뒤 재독 세트」 머리 인용
  references/
    protocol.md               §2.2 메시지 형식, 지시 템플릿(착수·다음 일·대기 작업·측정·금지·사용량 조정·compact)
    decompose.md              §3.a 분해 절차, 레인 공통 규칙 문서 뼈대(README 견본)
    merge-gate.md             §3.b 게이트, 재기동 판단 config 형식
    monitor.md                §3.c·§3.i 틱 절차, idle 판정표, 배정 규칙, 반복 방지
    heavy.md                  §3.d 두 겹 통제, 측정 창 순서, 예외 칸
    spawn.md                  §3.e 생성 경로별 명령 흐름(claude·worker-start·opencode), 기동 확인, 신원 보고, 정리 확인
    usage.md                  §3.f 출처·띠·행동, 한도 초기화 재개
    compact.md                §3.j 사용률 읽기, 안전 시점, 준비·확인, 조정자 자기 compact
    workflow.md               §3.k 템플릿, 예외, 상한 묶기, 금지
    closing.md                §3.h 마감
    resume.md                 §4.3 compact 뒤 복구
    config.md                 설정 항목 사양
  scripts/
    coord-status.sh           상태 수집: sessions json·orca terminal list/show·heavy.sh snapshot·tasks mtime·git·ctx·usage → 레인 줄 + PC 줄 (토큰 안 씀)
    coord-state.sh            state.json 읽기·쓰기 보조(jq), events.jsonl 붙이기, summary.md 생성
    idle-check.sh             §3.i 판정(후보·거부·확정), 결과 IDLE <레인> / BUSY <레인> <사유> / HOLD …
    ctx-usage.sh              §3.j-1 (B) transcript 끝 usage 합 + 창 크기 → pct. (A) 덤프가 있으면 그쪽
    usage-band.sh             §3.f 출처 순서대로 읽어 BAND G|Y|O|R five=… week=… src=… 한 줄
    merge-gate.sh             §3.b merge-tree·범위·금지 파일 대조, 예상 트리
    term-send-safe.sh         tui-idle 확인 → 화면에 esc interrupt·선택 창 없음 확인 → send --wait-submit → turn_started 확인
    compact-lane.sh           §3.j-3~5 의 기계 부분(안전 확인·send·Compacting 사라짐 대기·재측정)
    spawn-lane.sh             §3.e 생성·기동 확인(sessions json 의 name·pid 등장 대기)·결과 handle 출력
    measure-window.sh         창 열기·닫기 기록, (선택) heavy.sh --exclusive --detach sleep 보유·해제
    statusline-dump.sh        (선택) 세션별 {at, session_id, context_window, rate_limits} 덤프 후 원래 statusline 이어 부르기
  templates/
    lane-rules-README.md      레인 공통 규칙 문서 뼈대
    brief.md                  착수 지시 뼈대
    config.example.json
```

### 5.3 프로젝트·PC 비의존

- 킷에는 PC별 도구 이름(브라우저 도구, 서버 기동 스크립트, JDK 경로, rtk 우회 `/usr/bin/git`)을 넣지 않는다 [근거: kit-no-pc-specific-names.md]. 이것들은 config 와 각 PC 의 `~/.claude/CLAUDE.md` 가 정한다.
- config 파일: `<repo>/.coord.local.json`(커밋 안 함) + 리포 공용 `.coord.json`(커밋). 항목 예: `integration_branch`, `git_bin`, `launch.claude`(예: `orca claude-teams --dangerously-skip-permissions`), `heavy.script`(heavy.sh 경로, 없으면 통지만), `heavy.dir`, `test_slot.env`, `usage.sources`(캐시 경로 포함), `usage.bands`, `compact.*`, `workflow.model_table`, `restart_rules`, `integration_check`(서버 기동·화면 확인 방법 문장), `state_dir`, `tick_cron`.
- 터미널 백엔드는 어댑터로 나눈다: `orca`(기본), `tmux`(dflow-team backends.md 의 방식). 스크립트는 `term_list / term_read_screen / term_wait_idle / term_send / term_close` 다섯 함수만 부른다.
- heavy.sh·capacity.sh 가 없는 리포에서는 해당 기능을 「통지만」으로 낮춘다(fail-open).

---

## 6. 단계별 구현 계획

각 단계는 작게, 기존 조정 세션 일을 깨지 않게 진행한다. 지금 도는 레인 조정이 끝난 뒤에 시작한다(그 전에는 읽기 전용 스크립트만 시험).

| 단계 | 내용 | 검증 |
|---|---|---|
| 1 | `coord-status.sh`(읽기 전용) + `ctx-usage.sh` + `usage-band.sh` | 지금 떠 있는 세션들에 돌려 레인 줄이 나오는지, ctx 값이 각 세션 statusline 화면의 ctx% 와 ±2% 안인지, 띠가 캐시 파일 값과 맞는지. 쓰기·send 없음 |
| 2 | `state.json`·`events.jsonl` 형식과 `coord-state.sh`, `summary.md` 생성 | 이번 5레인 정본 메모 내용을 손으로 state.json 으로 옮겨 summary.md 가 메모와 같은 정보를 내는지 |
| 3 | SKILL.md 뼈대 + protocol.md(메시지 형식·템플릿) + workflow.md | 다음 조정 업무에서 사람이 조정하면서 템플릿만 써 본다(자동화 없음). 레인이 형식대로 답하는지 |
| 4 | `idle-check.sh` 와 monitor.md(판정만, 배정은 사람이) | 틱마다 판정 결과를 events 에 남기고, 사람이 본 실제 상태와 비교해 오판(백그라운드 Workflow·사용자 입력 대기·측정 대기)을 표로 집계. 오판 0 이 될 때까지 거부 규칙 보강. S1 status 가 백그라운드 Workflow 중 무엇을 보이는지 여기서 확인 |
| 5 | 자동 배정(queue·backlog) + 반복 방지(instr_id·cooldown) | 시험용 레인 2개(가벼운 문서 일)로 하루 돌려, 같은 지시 중복 0, idle 이 20분 넘게 이어진 레인 0 |
| 6 | `term-send-safe.sh`·`compact-lane.sh` + compact.md | 시험용 세션 하나(임계값을 낮춰 5%)로 정본 갱신 요청 → compact → 재개 확인 흐름. 도구 실행 중·선택 창이 떠 있을 때 보내지 않는지 일부러 만들어 확인 |
| 6b | `prompt-watch.sh`(확인 창 감지·명령 전문 추출) + approvals.md(§3.l 판단 표) | 시험 세션에서 일부러 복합 셸 명령으로 확인 창을 띄워, 감지 지연(자동 거부 전), 승인·거부 판단, 응답 뒤 창이 사라짐, `approvals` 기록을 확인. 입력창의 미전송 글을 건드리지 않는지도 본다 |
| 7 | `spawn-lane.sh` + spawn.md(Claude·worker-start·opencode) + 정리 확인 | 세션 1개·opencode 1개를 띄우고 닫아, 빈 셸 0·reclaimable 0·sessions json 항목 사라짐 확인. claude 업데이트 중 실패 경로는 기록만 |
| 8 | heavy.md + `measure-window.sh`(통지 + 선택적 detach 보유) | 측정 하나를 창으로 운영해 창 동안 다른 레인의 heavy RUN 0, test-slot 보유 0, load 기록 확인 |
| 9 | usage.md 띠 행동 + 한도 초기화 재개 | 띠 수치를 config 로 낮춰(예: Y=20%) 띠 전환 알림이 한 번만 가는지, 레인 상한 변경 메시지가 가는지 |
| 10 | merge-gate.sh + merge-gate.md + closing.md + resume.md | 다음 머지 몇 건을 스크립트 결과와 사람 판단으로 함께 처리해 결과가 같은지. 조정자 compact 뒤 재독 세트만으로 이어 가는지 |
| 11 | 터미널 어댑터 tmux, config 정리, 다른 리포 시범 | 다른 리포에서 config 만 바꿔 1~3단계 동작 |

---

## 7. 위험과 열린 질문

### 7.1 위험

| 위험 | 대응 |
|---|---|
| idle 오판으로 일하는 세션에 지시가 끼어든다(특히 백그라운드 Workflow) | 거부 신호 여러 개 + 2틱 확정 + cooldown. 4단계에서 오판 집계 뒤에만 자동 배정을 켠다 |
| 사용자 입력 대기 화면에 지시나 /compact 가 덮인다 | 화면 읽기로 선택 창 감지 시 보내지 않음. `term-send-safe.sh` 하나로만 보낸다 |
| 바쁜 TUI 에 send 한 글이 입력창에 남아 전송이 안 된다(opencode 사례) | tui-idle + 화면 확인 뒤 보내고, `--wait-submit` 으로 turn_started 확인. 실패 시 재전송하지 않고 화면 확인 |
| `terminal_handle_stale`(Orca 재시작) | 틱마다 handle 존재 확인, 없으면 신원 재보고 요청 |
| 세션 status 의 의미가 버전에 따라 바뀐다 | S1 은 1차 신호일 뿐, 거부 신호로 보완. 버전을 events 에 남긴다 |
| 사용량 출처가 모두 오래돼 판정 불가 | fail-open + 사용자에게 「사용량 모름」 한 줄. 조정자 자신의 statusLine 덤프를 우선 출처로 |
| 측정 창 중 heavy.sh 밖 명령이 끼어든다 | 통지 필수 + 창 동안 ps 감시, 끼어들면 그 회차 무효 처리 |
| 조정자 자기 compact 를 도우미가 넣다 cron 과 겹친다 | 기본은 사용자에게 요청(Q6). 도우미는 tui-idle 직후만 |
| compact 뒤 레인이 맥락을 잃는다 | 정본 갱신 확인 뒤에만 compact, 「남은 일 3줄」 대조 |
| 동시 agent 상한이 지시문뿐이라 지켜지지 않는다 | 레인 보고에 「지금 동시 agent 수」를 넣게 하고, ps 로 claude 하위 프로세스 수를 참고로 센다(정확한 연결은 미확인) |

### 7.2 열린 질문(사용자 결정 필요)

- **Q1 사용률 덤프 방식**: 세션별 컨텍스트·사용량을 정확히 읽으려면 statusLine 덤프가 필요하다. (가) 사용자 전역 `statusline-command.sh` 끝에 덤프 한 줄 추가 (나) 스킬이 띄우는 세션에만 `--settings` 로 감싸기 statusLine (다) 덤프 없이 transcript 계산만. 어느 쪽?
- **Q2 임계값**: 40% 는 1M 창 기준(약 400K)인가, 아니면 창과 무관하게 40% 인가? 200K 모델 세션의 값(제안 70%)은? 사용량 띠 수치(제안 Y 60/70, O 80/85, R 95/95)와 1주 남은 날 보정을 쓸지? load 기준(코어당 1.5 인지 1.2 인지, §3.d-4)도 함께 정한다.
- **Q3 스킬 위치**: 리포 `.claude/skills/coordinator`(dflow 킷처럼 이 리포 정본, 다른 곳은 링크)인가, 전역 `~/.claude/skills` 인가? 이름은 `coordinator` 로 좋은가?
- **Q4 heavy.sh 측정 창 기능**: 측정 창을 기계로도 막기 위해 heavy.sh 에 「창 보유(hold-window)」 기능을 더할지(dflow 킷 수정), 아니면 통지 + `--exclusive --detach sleep` 우회로 둘지?
- **Q5 기존 세션 연결**: 사용자가 직접 띄운 세션은 착수 때 신원 보고(`ORCA_TERMINAL_HANDLE` 등)로 연결한다. 이 방식이 괜찮은가? 또는 세션을 늘 스킬이 띄우게 할까?
- **Q6 조정자 자기 compact**: 사용자에게 알리고 사용자가 치는 방식(기본)과 셸 도우미가 자동으로 넣는 방식 중 무엇?
- **Q7 자동 종료 — 결정됨(2026-10-04)**: 끝난 레인 세션은 조정자가 알아서 닫는다(사용자 지시 "끝난 세션들은 알아서 정리해줘"). 절차: 정본 메모 '완료' 갱신 → 백그라운드 0 확인 → scratchpad 산출물 복사 → 세션이 보고한 `ORCA_TERMINAL_HANDLE` 로 `orca terminal close --terminal <h> --tab` → ListAgents 에서 사라졌는지 확인. 10-04 a6 세션에 실제로 적용했다. 임시 Pane 도 자동으로 닫는다.
- **Q8 자동 배정 범위**: idle 레인에 레인 범위 밖 일(다른 레인 소유 영역의 교차 리뷰 말고 수정)을 줘도 되는가? 지금 설계는 범위 안 일과 읽기 위주 대기 작업만 준다.
- **Q9 사용량 R 띠 행동**: 95% 에서 모든 레인을 단계 끝에 멈추는 것이 맞는가, 아니면 머지 임박 레인은 계속하는가?
- **Q10 감시 틱 간격**: 20분(이번 실사용)이 적당한가? 사용량이 낮을 때 10분으로 줄일지?
- **Q12 확인 창 자동 응답 범위**(§3.l): 조정자가 레인 세션의 실행 여부 질문에 자동으로 승인해도 되는 범위를 판단 표 그대로 둘지, 더 좁힐지(예: 읽기·조회만 자동, 편집·빌드는 알림 후 승인). 감시를 Workflow 가 도는 레인에만 둘지, 모든 레인에 둘지.
- **Q11 dflow-team 과의 관계**: D'Flow 작업을 레인으로 받는 경우 dflow-team 의 capacity.sh·statusLine 덤프·tmux 백엔드를 공유 모듈로 뺄지, 따로 둘지?
- **Q13 GLM 등급 — 결정됨(2026-10-05)**: 일반 작업 중 쉬운 일(Sonnet 보다 쉽고 Haiku 보다 어려운 일)은 새 탭의 GLM Claude Code 세션(`glm`)에 맡긴다. 띄우기 전에 Z.ai 로 실제 호출이 가는지 확인하고(회사 PC 에서는 GLM 이 동작하지 않음), 실패하면 Sonnet 으로 대신한다(§3.e 「모델 등급과 실행 수단」). 남은 결정: GLM 이 API 사용량 과금이므로 하루·조정 회차당 GLM 세션 상한을 둘지.
