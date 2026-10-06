# compact·재개 관리

설계 절: §3.g(정본 메모), §3.j(임계값·자동 compact), Q1·Q6.

## 1. 정본 메모 규칙

- 레인마다 **정본 메모**(메모리 파일 또는 scratchpad `resume-*.md`)를 하나 두게 한다. 형식: 지금 상태, 남은 순서, 결정, 조정 세션 이름, 다음 단계. 착수 지시에 정본 메모 경로를 정하라고 넣고 state `lanes.<레인>.memo` 에 기록한다(첫 `lane-add` 에 `memo` 로 함께 넣는다. 비면 compact 문구가 「정본은 -」 로 나가고 `lane-add` 가 경고한다: `decompose.md` §5).
- 조정자의 정본은 state 폴더(`state.json`, `summary.md`)와 사람이 읽는 메모 하나다. compact 전과 주요 결정 뒤 갱신한다(`coord-state.sh summary`).
- compact 뒤 스킬 전체를 다시 부르지 않게 SKILL.md 맨 위에 재독 세트 인용문이 있다(`resume.md`).

## 2. 사용률 읽기

기본은 transcript 계산이다: `scripts/ctx-usage.sh --lane <레인>`(또는 `<session-id>`, `--pid <pid>`, `--window N`).

출력: `CTX <session-id> tokens=<n> window=<n> pct=<n> src=transcript|dump at=<iso>` 또는 `CTX <id> unknown <사유>`.

- transcript 의 마지막 비 sidechain assistant 메시지의 사용량 합으로 센다. 창 크기는 transcript 에 없으므로 state `session.window` 나 설정 `compact.default_window`(200000)로 정한다. 파일 크기는 쓸모없다(compact 전 기록이 남는다).
- `statusline-dump.sh` 의 덤프(`src=dump`)는 **스킬이 띄우는 세션에만** 쓰는 선택 기능이다. 있으면 스크립트가 그쪽을 우선한다. 사용자 전역 statusline 은 건드리지 않는다.
- `unknown` 이면 이번 틱은 그 레인을 건너뛰고 사유를 이벤트에 남긴다.
- 틱마다 결과를 `coord-state.sh set '.lanes.<레인>.ctx' '{"tokens":…,"window":…,"pct":…,"src":…,"at":…}'` 로 기록한다.

## 3. 임계값

| 설정 | 기본 | 뜻 |
|---|---|---|
| `compact.threshold_pct` | 40 | 기본 임계 % |
| `compact.threshold_tokens` | null | 토큰 임계(둘 다 있으면 먼저 닿는 쪽) |
| `compact.by_window` | `{"1000000":{"pct":40},"200000":{"pct":70}}` | 창 크기별 덮어쓰기 |
| `compact.hard_pct` | 70 | Workflow 중이라도 사용자에게 알리는 % |
| `compact.cooldown_min` | 30 | 같은 레인 compact 최소 간격 |
| `compact.wait_max_min` | 10 | Compacting 사라짐 대기 상한 |

1M 창에서 40% 는 약 400K, 200K 창에서 40% 는 약 80K 로 의미가 다르다. 그래서 200K 창은 70% 로 덮어쓴다. 새로 띄우는 세션에는 백스톱으로 `--autocompact <tokens>` 를 줄 수 있다.

## 4. 안전한 실행 시점(모두 만족할 때만)

`compact-lane.sh` 가 확인하고 어긋나면 `COMPACT_REFUSED` 를 낸다. 조정자도 아래를 이해하고 있어야 한다.

- 사용자 입력 대기(선택 창·질문 창)·Compacting·백그라운드(Workflow·gradle·잡)가 없다(`idle-check.sh` 의 거부와 같다).
- 머지 중이 아니다(`merge.in_flight` 의 레인이 아님).
- 측정 창의 측정 레인이 아니다.
- `tui-idle` 이 만족되고(최대 300초 대기) 화면 아래에 「esc to interrupt」 가 없다.

## 5. 준비와 실행

1. 임계 초과 레인을 찾으면 조건 4 를 본다. Workflow 가 돌면 `coord-state.sh set '.lanes.<레인>.compact.pending' true` 로 세우고 끝난 뒤 첫 틱에 한다(Workflow 결과를 세션이 처리해 정본을 갱신한 다음이어야 한다).
2. `protocol.md` 3.8 `정본 갱신 요청` 을 보낸다.
3. 답 `정본 갱신 완료: 경로 / 남은 일 3줄` 을 받으면 「남은 일 3줄」을 `lanes.<레인>.compact.pre_compact` 에 적는다. **30분 안에 답이 없으면 이번 틱은 넘긴다**(다음 틱에 다시, 최대 2회 뒤 사용자 알림).
4. `scripts/compact-lane.sh <레인>`(`--dry-run` 가능). 스크립트가 안전 확인 → `/compact <레인> 진행 중. 정본은 <경로>. 조정 세션 <이름>(<주소>). 다음 단계: <한 줄>` 전송 → Compacting 사라짐 대기 → 사용률 재측정을 한다. 출력: `COMPACT_REFUSED <레인> <사유>` · `COMPACT_DONE <레인> before=<n> after=<n|->` · `COMPACT_TIMEOUT <레인>`. 문구에 `!` 를 넣지 않는다. 정본 갱신 확인이 없으면 `--force-no-memo` 없이는 거절된다. 입력창이 회색 추천 문구 때문에 `draft-in-input` 으로 거절되면 `approvals.md` 의 「입력창의 회색 추천 문구」 조건을 확인하고 `--over-draft` 로 다시 부른다(조건: 조정자가 화면을 읽고 추천 문구라고 판단한 때만).

**Workflow·agent 가 도는 동안 임계를 넘으면 compact 를 미룬다.** 도는 중에 정본 갱신 요청을 보내지 않고 `compact.pending` 만 세운다(위 1). 레인이 머지 요청을 앞두고 있으면 정본 갱신 요청에 「머지 요청 뒤에는 입력 대기로 있어라」 를 함께 지시한다: 머지 직후 세션이 바로 입력 대기가 되어 머지 완료·정리 완료 보고를 받은 그 틱에 compact 할 수 있다(web 레인에서 효과를 봤다). 단 `compact.hard_pct` 를 넘으면 7 의 예외를 따른다.

## 6. compact 뒤 확인

1. `COMPACT_DONE` 이면 사용률이 크게 줄었는지 본다(보통 10% 아래). **스크립트의 재측정 숫자를 그대로 믿지 않는다.** compact 직후에는 transcript 가 아직 갱신되지 않아 `before` 와 `after` 가 같게 나온 일이 있다. 같게 나오면 `compact-lane.sh` 가 화면 상태줄의 ctx % 로 `after` 를 어림하고(stderr 에 `COMPACT_NOTE`), 그것도 못 읽으면 화면의 `Compacted` 문구만 확인한 채 `after=-` 로 낸다. `after=-` 이거나 `COMPACT_NOTE` 가 있으면 화면(`terminal read --screen`)에서 ctx % 나 「Compacted」 를 직접 보고, 몇 분 뒤 `ctx-usage.sh --lane <레인>` 으로 한 번 더 잰 값으로 `compact.history` 를 바로잡는다. `COMPACT_TIMEOUT` 이면 화면을 읽어 상태를 확인하고 사용자에게 알린다.
2. `protocol.md` 3.9 `재개 확인` 을 보낸다. 답을 `pre_compact` 와 대조한다. 크게 다르면 정본 경로를 다시 짚어 준다.
3. compact 기록(`at`, before, after)을 `compact.history` 와 `last_at` 에 남긴다. 같은 레인은 compact 뒤 최소 `compact.cooldown_min`(30분)은 다시 하지 않는다. `compact.pending` 은 끈다.

## 7. 예외

- opencode·agy 처럼 `/compact` 가 다른 워커는 대상에서 뺀다(tui-idle 을 믿을 수 없다).
- Workflow 가 도는 세션은 Workflow 가 끝난 뒤에 한다. 단 컨텍스트가 `compact.hard_pct` 를 넘으면 세션이 Workflow 결과를 받기 전에 넘칠 수 있으므로 사용자에게 알린다(강제로 끊지 않는다).
- 임시 워커는 compact 하지 않고 일을 끝내면 닫는다.

## 8. 조정자 자기 compact

조정자는 자기 턴 안에서 자기 터미널에 `/compact` 를 보내지 않는다(입력이 대기열에 쌓인다). 틱에서 자기 사용률이 임계값을 넘으면:

1. 정본 메모와 state(`summary.md`)를 갱신한다.
2. 사용자에게 **한 줄로 알린다**: 「조정자 compact 필요(컨텍스트 N%). 정본은 <경로>」. 사용자가 `/compact` 를 친다.
3. compact 뒤에는 `resume.md` 의 재독 세트만 읽고 `CronList` 로 감시 cron 을 확인한다.

같은 알림을 틱마다 반복하지 않는다(`run` 이벤트에 알렸다고 남긴다).
