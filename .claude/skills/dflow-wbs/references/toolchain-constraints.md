# 툴체인 제약 (dflow-wbs 에서 옮김)

> SKILL.md `### 출력 검증` 절의 제약 표와 `## 상태` 절의 dep-analysis 주의(끝)를 분리. 4단계 생성 시 절차는 SKILL.md 에 남김.

> ⚠️ **툴체인 제약 — 실측 기준. 검증 결과를 곧이곧대로 믿지 말 것.**
>
> - `wbs-parse`·`wbs-validate`·`dep-analysis` = `/dflow-export` 스킬 node 판 (`.claude/skills/dflow-export/scripts/*.mjs`).
> - 옛 동봉 snapshot(3단계만 인식·`[xx]` 단독 판정·stdin 불가) 제거됨.
> - 3단계 한정·stdin 불가 = 「해소됨」. `[xx]` 단독 판정 = 「부분 해소」(대상 리포가 6상태 정의를 둘 때만 해소).
> - `merge-wbs-status.py`·`wbs-transition.py` = 이 리포 밖(dev-workflow) 스크립트라 제약 그대로.
>
> | 제약 | 근거 | 생성 시 영향 | 해소 |
> |---|---|---|---|
> | ~~`wbs-validate` 는 3단계만 인식~~ | export 판은 `#{3,5}` + `TSK-숫자(-숫자)+` 로 3·4단계 모두 읽음 | 4단계 WBS 도 `task_count` 에 잡힘 — 0 이면 헤딩을 못 읽은 것, 실패로 봄 | **해소됨 (dflow-export 판 사용)** |
> | `merge-wbs-status.py` 도 3단계만 인식 | `merge-wbs-status.py:37` 정규식 `^###\s+(TSK-\d+-\d+):` | 4단계에서 상태 merge 가 조용히 무동작 | DEV-03 |
> | merge 상태 어휘가 5개 | `merge-wbs-status.py:28-33` + `:172` `.get(v, -1)` | 어휘 밖 상태는 랭크 −1 로 `[ ]`(0)보다도 낮게 취급 → **조용히 덮임** | DEV-01 |
> | 전이 스크립트 상태 어휘가 5개 | `wbs-transition.py:353` `{"[ ]","[dd]","[im]","[ts]","[xx]"}` | 파일에 `[as]` 같은 진행 상태를 쓰면 `unknown status in wbs.md` 로 **거부** | DEV-01 |
> | 의존 완료 판정 기본값이 `[xx]` 단독 | `dep-analysis.mjs` — `--docs-dir` 없으면 `[xx]` 만 충족, 있으면 상태머신이 정함(6상태 정의면 `[im]` 이상, 5상태면 `[xx]` 만) | 진행 중 WBS 를 `--docs-dir` 없이 재분석하면 완료 판정이 문서 기준(`[im]` 이상)보다 좁음 | **부분 해소 (`--docs-dir {DOCS_DIR}` 사용 — 임계는 프로젝트 상태머신 정의가 정함)** |
> | Task ID 정규식은 숫자만 | export 판 `_TSK_HEADING_RE` = `TSK-숫자(-숫자)+:` | `TSK-02-01a` 같은 letter suffix 는 **조용히 무시** — 쓰지 않음 | — |
> | ~~`dep-analysis` 는 stdin 불가~~ | export 판은 파일 경로 인자·표준입력(파이프) 모두 받음 | `wbs-parse.mjs … --tasks-all` 출력을 바로 파이프해도 됨 | **해소됨 (dflow-export 판 사용)** |
>
- ⚠️ `dep-analysis.mjs` 는 `--docs-dir` 없으면 `[xx]` 만 완료로 셈.
  - 진행 중 WBS 재분석 시 `--docs-dir {DOCS_DIR}` 를 붙여 상태머신이 충족 임계를 정하게 함 (6상태 정의면 `[im]` 이상, 5상태면 `[xx]` 만).
  - 생성 시점엔 전 Task `[ ]` 라 영향 없음.
