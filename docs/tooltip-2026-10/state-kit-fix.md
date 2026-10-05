# 정본 메모 — kit-fix 레인

- 지시: kit-fix-1 (`/Users/jji/.coord/tooltip-2026-10-05/lanes/kit-fix/brief.md`)
- 브랜치·워크트리: `fix/coord-kit-followup` / `/Users/jji/project/dmes-standard-wt/kit-fix` (기준 dev 6e80a51e)
- 조정 세션: dmes-standard-0f

## 항목 상태 (2026-10-05)

| 항목 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| E1 spawn-lane.sh | 구현·실기동 확인·리뷰 반영 | 34ace0e1, a88a5561 | 구조 기록 S1 |
| E2 term-send-safe.sh | 구현·고정 화면 시험 8건 통과·리뷰 반영 | d4573552, a88a5561 | 시험 tests/term-send-safe-input-state.sh |
| E3 deps.sh | 구현·픽스처 시험 17건 통과·1차 리뷰 반영 | e5cba4f8, f09be591 | 구조 기록 S2, 시험 tests/deps-sh-no-main-write.sh |
| E4 apply_mdm_self.py | 경고만 | 4c2b911b, a88a5561 | META_REV 직접 삽입은 하지 않음 |
| E5 마감 | 재리뷰 중 | c5d5487e(구조 기록) | 1차 리뷰: deps.sh 높음 1·중간 2·낮음 1, 나머지 중간 1·낮음 다수 → 반영. 재리뷰(opus/sonnet) → 머지 요청 |

## E2 원인 (실제 화면으로 확인)
`claude -n <이름>` 으로 띄우면 입력창 위 가로줄에 세션 이름이 붙는다(`─────── kitfix-probe ─`). `input_state` 의 `is_rule` 은 「─ 만 남는 줄」 만 가로줄로 봐서 입력창을 못 찾았다(`unknown` → 「판정이 애매하다」). 안내 문구 `Try "…"` 처리는 이미 있었다. 줄 맨 앞이 ─ 이고 ─ 가 10개 이상이면 가로줄로 보도록 고쳤다. 한계: 사용자가 `Try "…"` 모양으로 시작하는 글을 쳐 두면 안내 문구와 구별하지 못해 빈 입력창으로 본다.

## E3 결함 근거 (고치기 전 동작)
- 지시문은 deps.sh 1-1 단계가 메인의 node_modules 심링크를 복제한다고 적었지만, 현재 코드(`case … */node_modules|…`)는 node_modules 경로를 이미 건너뛴다. 그 건너뜀은 10-01 커밋(4778516c)부터 있었다. 이 PC 메인 체크아웃의 `src/frontend/m-*/node_modules` 는 지금 실제 폴더이고 심링크는 `docs/mdm/design` 하나뿐이다.
- 사고 경로는 다른 데 있다: 워크트리에 **이미 있던** node_modules 심링크(만든 주체는 deps.sh 가 아닌 것으로 보임)를 pnpm 워크스페이스 install 이 따라가 쓴다. 이 레인에서 소형 픽스처(워크스페이스 a·b, b→a 의존)로 재현했다: 워크트리의 `a/node_modules`·`b/node_modules` 를 메인 쪽으로 심링크하고 수정 전 deps.sh 를 돌리자 메인의 `b/node_modules/a` 가 `../../a` 에서 `../../../wt-old/a` 로 바뀌었다(= 포털이 깨진 증상과 같다).
- 고친 뒤 같은 입력에서 심링크만 지워지고(`DEPS_UNLINKED`) 메인 픽스처 지문(find+stat+shasum)이 그대로이며 워크트리에 독립 node_modules 가 생긴다.
- 실제 리포 확인: 이 레인 워크트리에서 deps.sh 를 돌린 뒤에도 메인 `src/frontend/node_modules/.modules.yaml` 시각이 10-03 02:32 로 그대로다.
- 호출부(dflow-team `resolve-prompt.md`·dflow-dev `worker-mode.md`)는 exit 0 이 아니면 `failed deps`, 75 면 재호출로 해석한다. 새 코드는 심링크를 지우고 계속하므로(exit 0) 호출부를 바꾸지 않았다.
- 미해결: 워크트리에 그 심링크를 만든 주체는 찾지 못했다. 재발하면 `DEPS_UNLINKED` 줄이 단서가 된다.

## E4 판단
`TB_MDM_META_REV` 는 `(TARGET_TYPE, TARGET_KEY, CHANGE_KIND, 감사 9칼럼)` 구조이고 키는 컬럼 별칭뿐 아니라 LAYOUT·DOMAIN 으로도 펼쳐진다(`MetaRevisionRecorder`). SQL 로 맞추기 어려워 경고만 넣었다(독스트링·실행 뒤 stderr·README).

## 리뷰 지적 처리 요약
- deps.sh(opus): 심링크 탐색의 `-maxdepth` 구멍(높음, 깊이 5 배치에서 메인 링크가 다시 써짐 재현) → 제한 제거. 루트 node_modules 가 있고 패키지 링크만 메인을 가리키는 섞인 상태에서 재설치 누락(중간) → 재설치 표식. 파일·끊어진 링크 대상 판정(중간) → `link_target_any`. 시험 보강(낮음) → 17건.
- spawn-lane(sonnet): 기본 세션 폴더가 메인 체크아웃이 되는 문제(중간) → `CD_PATH` 를 조정자 현재 워크트리로. 상대경로·`~` 거부, opencode 방식 통일, dry-run 인용.
- term-send-safe: `Try "x" 로 다시 해 줘` 같은 글 오판 → 안내문 전체 모양(`Try "…"` 로 끝남)일 때만 빈 입력창.
- 바꾸지 않은 것(낮음): `worktree list` 한도 확인, opencode 의 cd 실패 감지, `search.sh` 의 `--worktree active`·spawn.md 의 `worker-start --worktree current` 안내(조정자 폴더가 Orca 에 등록돼 있으면 문제 없음).

## 남은 일
1. 리뷰 결과 반영
2. 머지 요청 → 허가 → dev 머지 → 정리
3. 시험 탭 2개(kitfix-probe·kitfix-spawn-test)는 이미 닫았다
