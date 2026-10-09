# /dflow-dev 단계 — 기준선·모델 결정

SKILL.md 「단계 지도」 가 가리킬 때 읽음. 다 읽기 전 단계 시작 금지. 모든 단계 공통 규칙(게이트 집행 원칙·상태 모델·서버 통신) = SKILL.md.

4. **게이트 기준선 기록**: dev-discipline 기준선 절차 실행, state.json 에 저장 (`api_base` 아직 없으면 함께 기록. `.claude/skills/dflow-dev/references/state-model.md`).
   기준선 명령은 하나씩 캐시 스크립트로 감싸 실행 (dev-discipline 「기준선 캐시」 — 같은 기점·같은 명령은 한 번만 측정).
   ```bash
   node .claude/skills/dflow-dev/scripts/baseline.mjs list --base <기점>   # 이 기점에서 이미 잰 명령. 같은 일을 재는 명령이 있으면 그 문자열·cwd 를 글자 그대로 쓴다
   node .claude/skills/dflow-dev/scripts/baseline.mjs run --base <기점> --task-dir <TASKS>/<TSK> -- '<테스트 명령>' 2>&1 | tail -30
   ```
   - `<기점>` = 3번 `git switch -c` 에 준 기점
   - 새로 쟀으면(`BASELINE_MEASURED ... key=`) 총수·실패 목록을 `baseline.mjs note` 로 추가. 재사용했으면(`BASELINE_REUSED`) `BASELINE_SUMMARY` 수 사용
   - state.json `baseline` 에 명령마다 `"cmd"`·`"source"`·`"cache_key"`·`"measured_at"` 기록. 형식·끄기(`DFLOW_BASELINE_CACHE=0`)·다시 재기(`DFLOW_BASELINE_CACHE=refresh`) = dev-discipline 「기준선 캐시」
   - Phase 프롬프트(`{VERIFY_CMDS}`)와 게이트로 옮기는 「기준선에서 실제로 돌린 명령 줄」 = **`--` 뒤 명령**. 감싼 줄을 옮기면 게이트가 캐시된 기준선을 자기 결과로 받음
   - 리포 최상위에 `.dflow-gates` 있으면 기준선 명령 = 그 `full` 줄 명령(들), 리포 최상위에서 측정
   - state.json `baseline` 에 `"base": "<기점 sha>"` 기록 — 재개 세션도 게이트 범위 판정(`gate-scope.mjs --base`)에 같은 기점 사용
   - module 명령 기준선은 여기서 안 재고 Design 게이트 뒤에 잼(`orch/design.md` 「Design 게이트」)
5. spec.md 읽기(필수) + 복잡도 판정(dev-discipline 점수표) → 설계 모델 결정, 한 줄 출력.
   이어서 Build 모델: 배정표로 `build_model_base` 결정. state.json 에 `build_model_trial` 없을 때만 `node .claude/skills/dflow-dev/scripts/build-trial.mjs <external_ref> <build_model_base>` 로 test 여부 판정, 두 값을 state.json 에 기록.
   - commit 안 함 (Design 산출물 commit 에 실림)
   - 이미 있으면(재개) 다시 판정 안 함
   - 한 줄 출력: `Build 모델: <sonnet|opus> (배정 <base>, 시험 <BUILD_TRIAL 줄의 on|off·reason>)`
   - 규칙 = dev-discipline 「Build 모델 시험(build_model_trial)」
   - `build_model_base`·`build_model_trial`(Phase 01 5번) = 배정표가 정한 Build 모델·Build 모델 test 여부(`true`|`false`). 한 번 적으면 재개해도 재판정 안 함
   - 범위 `build` 면 Design 서브에이전트 안 띄움 → 설계 모델 결정 안 함 (복잡도 판정은 Build 모델 배정에 사용)
6. **준비 끝 표시**: state.json `phase` = `prepare` 면 `design` 으로 변경 (Design 서브에이전트 띄우기 전, commit 안 함). 빠뜨리면 Design 동안 좌석이 계속 「준비」로 보임.

**다음 단계**: `orch/phase-common.md` → `orch/design.md`.
