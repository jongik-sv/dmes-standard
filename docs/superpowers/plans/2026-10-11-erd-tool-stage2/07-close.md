# ERD 도구 단계 2 — Task 16: 마감

> 공통 제약(Global Constraints)·단계 2 에서 정한 점(S2-1~S2-28)·Review Focus·인터페이스는 [README](README.md) 에 있다. 이 문서의 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [06-frontend-grid-diff.md](06-frontend-grid-diff.md) · [README](README.md) · 단계 1 마감: [06-close.md](../2026-10-10-erd-tool-stage1/06-close.md)

### Task 16: 단계 2 마감 — 전체 시험, 새 TPL_DATA 복제, 사람 2명·Claude 2세션, 충돌·되돌리기·확정, MCP 크기, 문서

모든 레인(BE1·BE2·S·FE1·FE2·FE3)이 dev 에 머지된 뒤에 한다. 이 Task 는 코드를 고치지 않는다. 확인하고, 재고, 결과를 문서에 적는다.

**판정 원칙:** 결과는 LLM 이 쓴 글이나 화면 글자가 아니라 서버 기록으로 판정한다. 서버 기록은 `view sinceRev` 델타(rev·userId·session·source·changes)와 `TB_MDM_ERD_CMD_LOG`(ERD_MODEL_ID, REV, USER_ID, SESSION_NM, SOURCE, CMD_JSON, INVERSE_JSON, CHANGES_JSON)다. 화면·Claude 출력은 "보였는가" 만 판정한다.

**멈추고 조정 세션(없으면 사용자)에게 묻는 일:** 사용자 서버 내리기(Step 2-1), 넓은 `pkill`, `pdb.mjs drop`, L_MAIN 에 모델 등록·쓰기, push, 도커, 머지된 V 파일 수정, ego-browser 두 번째 프로필.

**Files:**
- Modify: `docs/superpowers/specs/2026-10-10-erd-tool-design.md` (5절 표에 "단계 2 결과" 열, 7절 표 뒤에 단계 2 확인 결과)
- Modify: `docs/erd-tool/deferred.md` ("처리" 칸, 새 절 "7. 단계 2 에서 미룬 것")
- Modify: `docs/superpowers/plans/2026-10-11-erd-tool-stage2/README.md` ("단계 2 구현 결정" 절, "착수 전" 해시)
- Modify: `docs/mdm/screens/erdEdit/erdEdit_기능설계서.md` ("6. 단계 2 — 편집·동시 편집")
- 만들지만 커밋하지 않는 것: `tmp/erd-close2/` (`.gitignore` 의 `/tmp/`). 끝에 `~/.coord/erd-stage2-1011/t16-evidence/` 로 복사한다.

**Interfaces:**
- Consumes: Task 1~15 전부와 README "인터페이스 (정본)". OASIS `erdEdit` 의 `reg`·`import`(FROM_DB·APPLY_DIFF)·`view`(sinceRev·STATUS)·`validate`·`confirm`·`copy`·`lock`·`execute`(ADD_EDITOR·CLAIM)·`save`·`restore`·`compare`(DB_DIFF), SSE `/api/mdm/erd/stream/mcm`(`version`·`change`·`presence`·`claim`·`reload`), `.mcp.json` 의 `erd` 서버(도구 12개), `scripts/erd/erd-cli.mjs`.
- Produces: 스펙 5절 "단계 2 결과" 열과 7절 결과, deferred.md 처리 기록과 새 행, README "단계 2 구현 결정", 기능설계서 6절. 코드 산출물은 없다.

**결함이 나왔을 때:** 확인 단계에서 이번 변경 때문에 생긴 결함이 나오면 이렇게 한다.
1. 결함 내용과 재현 명령을 `rec defect.<이름> "…"` 로 적는다.
2. 그 자리에서 고치지 않는다. 조정 세션에 보고한다. 고치기로 하면 원래 레인 파일을 고치는 별도 커밋(`fix(erd…): …`)으로 하고, 먼저 실패 시험을 쓴다.
3. Oracle 시험을 다시 돌려야 하면 먼저 `node scripts/oracle/pdb.mjs close L_ERD2C` 로 칸을 비운다(열린 PDB 상한 3). 시험 뒤 `node scripts/oracle/pdb.mjs open L_ERD2C` 로 다시 열고 Step 2-3 의 BE 기동을 다시 한다.
4. 기대와 다른 측정값, 환경 차이, 아래 "알려진 기존 실패" 는 결함이 아니다. 결과로 적고 deferred 새 행 후보로 둔다.

**알려진 기존 실패(새 실패가 아니다, 단계 1 마감 실측):** (1) `CodeCateEditPerformanceSqliteTest` AC4(가운데 값 약 1046ms > 800ms), (2) m-mdm `ui-meta-lock.test.ts`(cmq/userQuery 차이), (3) mcm eslint 오류 18개(ERD 와 무관한 파일), (4) mcm build 전제(`pnpm --filter "@dk-oasis/mcm^..." build` 와 `AUTH_SECRET`), (5) `erd-hints --check` 의 줄 번호 차이(다시 만들면 된다). m-mdm `lint` 는 `tsc --noEmit` 이다.

---

- [ ] **Step 0: 작업 위치, 도우미, 의존성**

0-1. 마감 워크트리를 만든다(조정 세션이 이미 만들었으면 건너뛴다). 모든 레인 파일이 있는지 본다.

```bash
cd /Users/jji/project/dmes-standard
test -d ../dmes-standard-wt/erd-stage2-close || /usr/bin/git worktree add ../dmes-standard-wt/erd-stage2-close -b erd-stage2-close dev
cd ../dmes-standard-wt/erd-stage2-close && /usr/bin/git status --short && /usr/bin/git log --oneline -12
for f in src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/standard/ErdTypeMapping.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/importing/ErdDiffApplier.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/stream/ErdVersionEvent.java \
  scripts/erd/lib/commands.mjs scripts/erd/lib/results.mjs scripts/erd/erd-cli.mjs \
  src/frontend/shared/src/components/react-flow/auto-layout.ts \
  src/frontend/m-mdm/pages/dma/erdEdit/state/pending.ts src/frontend/m-mdm/pages/dma/erdEdit/canvas/useCanvasEditing.ts \
  src/frontend/m-mdm/pages/dma/erdEdit/panels/GridInputBar.tsx src/frontend/m-mdm/pages/dma/erdEdit/panels/DbDiffApply.tsx \
  src/frontend/m-mdm/pages/dma/erdEdit/panels/ConfirmDialog.tsx; do test -f "$f" && echo "있음 $f" || echo "없음 $f"; done
```
Expected: 작업 트리가 깨끗하고 "없음" 이 0줄이다. 하나라도 없으면 그 레인이 머지되지 않은 것이다. 멈추고 조정 세션에 알린다.

0-2. 기록장과 도우미를 만든다. 이후 모든 Bash 호출은 첫 줄에 `cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh` 를 둔다(호출마다 셸 상태가 사라진다). Bash 도구 셸은 zsh 이므로 아래 함수는 bash·zsh 에서 함께 돈다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close
mkdir -p tmp/erd-close2/claude tmp/erd-close2/ui
cat > tmp/erd-close2/env.sh <<'EOF'
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
unset ERD_USER ERD_SESSION   # Claude·CLI 호출마다 따로 준다
export CLOSE="$PWD/tmp/erd-close2" ERD_PDB=L_ERD2C ERD_BASE=http://localhost:8096 ERD_ROLE=MDM_STEWARD
export BACKEND_CLIENT_KEY=dmes-bff-local-client-key-2026      # .mcp.json 의 키 변수 이름(ERD_KEY 아님)
export ERD_TOOLS=getModelText,getCurrentView,getChangesSince,listViolations,listInferredRelations,getDbDiff,apply,confirmRelation,rejectRelation,undo,claimTable,releaseTable
# erdAs <사용자> <역할> <액션> '<params json>' : 8096 OASIS erdEdit 직접 호출(BFF 헤더). erd = admin(MDM_STEWARD).
erdAs() { curl -sS -m 180 -X POST "$ERD_BASE/api/mdm/oasis/erdEdit/$3" -H 'Content-Type: application/json' \
  -H "X-Client-Key: $BACKEND_CLIENT_KEY" -H "X-Authenticated-User: $1" -H "X-Authenticated-Role: $2" \
  -d "{\"meta\":{\"menuId\":\"erdEdit\"},\"params\":$4}"; }
erd() { erdAs admin MDM_STEWARD "$1" "$2"; }
v() { erd view '{"modelId":"mcm"}'; }
rv() { v | jq -r '.data.result.rev'; }
# deltas <sinceRev> : 서버 판정용 델타 목록(rev, 사용자, 세션, 출처, 바뀐 요소). 이 경로의 rowVersion 은 늘 null 이다(S2-16).
deltas() { erd view "{\"modelId\":\"mcm\",\"sinceRev\":$1}" | jq -r '.data.result | if .reload then "reload rev=\(.rev)" else (.deltas[] | "\(.rev)\t\(.userId)\t\(.session)\t\(.source)\t\([.changes[] | "\(.kind):\(.op):\(.id)"] | join(","))") end'; }
# lastrv : SSE 감시의 마지막 change 의 rowVersion(모델 명령이면 수, 다이어그램만이면 null)
lastrv() { awk '$1=="change"' "$CLOSE/sse-probe.txt" | tail -1 | cut -d' ' -f2- | jq -c '{rev, rowVersion}'; }
# colv <컬럼id> <속성> : 지금 모델의 컬럼 속성 값
colv() { v | jq -r --arg c "$1" --arg p "$2" '.data.result.model | fromjson | .columns[$c][$p]'; }
tgt() { jq -r "$1" "$CLOSE/targets.json"; }
rec() { printf '%s\t%s\n' "$1" "$2" >> "$CLOSE/results.tsv"; echo "기록 $1"; }
sum() { grep -ho '<testsuite [^>]*' "$@" | sed -E 's/.*tests="([0-9]+)" skipped="([0-9]+)" failures="([0-9]+)" errors="([0-9]+)".*/\1 \2 \3 \4/' | awk '{t+=$1;s+=$2;f+=$3;e+=$4} END{print "tests="t" skipped="s" failures="f" errors="e}'; }
# sq·sqm : 복제 PDB($ERD_PDB)에서 MDMAPUSER·MCMAPUSER 로 SQL 을 돌린다(L_MAIN 아님).
sq()  { { echo "set pagesize 0 feedback off heading off linesize 400 trimspool on"; cat; } | podman exec -i oracle-26ai-free sqlplus -s "MDMAPUSER/dmes_password_123@//localhost:1521/$ERD_PDB"; }
sqm() { { echo "set pagesize 0 feedback off heading off linesize 400 trimspool on"; cat; } | podman exec -i oracle-26ai-free sqlplus -s "MCMAPUSER/dmes_password_123@//localhost:1521/$ERD_PDB"; }
# cl <라벨> <ERD_USER> <ERD_SESSION> <허용 erd 도구, 쉼표> <max-turns> <지시> : 묶은 claude -p 한 번.
# --allowedTools 는 자동 승인일 뿐이라(단계 1 마감) 나머지 erd 도구와 파일·셸 도구를 --disallowedTools 로 막고 permission-mode default 를 준다.
cl() {
  local id="$1" user="$2" ses="$3" allow="$4" turns="$5" q="$6" t A="" D="Bash,Read,Grep,Glob,Edit,Write,WebFetch,WebSearch,Agent,NotebookEdit"
  for t in $(echo "$ERD_TOOLS" | tr ',' ' '); do
    case ",$allow," in *",$t,"*) A="$A,mcp__erd__$t" ;; *) D="$D,mcp__erd__$t" ;; esac
  done
  ERD_USER="$user" ERD_SESSION="$ses" claude -p "$q" --mcp-config .mcp.json --strict-mcp-config --permission-mode default \
    --allowedTools "${A#,}" --disallowedTools "$D" --max-turns "$turns" --no-session-persistence \
    --output-format stream-json --verbose < /dev/null > "$CLOSE/claude/$id.jsonl" 2>&1
  clshow "$id"
}
# clshow <라벨> : 도구 호출 순서, 오류 결과 수, 도구 결과 글자 수, 파일로 빠진 수, 마지막 답.
clshow() { local f="$CLOSE/claude/$1.jsonl"
  echo "== $1 도구: $(jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .name | sub("mcp__erd__";"")' "$f" | tr '\n' ' ')"
  echo "   오류 결과 $(jq -r 'select(.type=="user") | .message.content[]? | select(.type=="tool_result" and .is_error==true) | .tool_use_id' "$f" | wc -l | tr -d ' ')건 · 결과 글자 수 $(jq -r 'select(.type=="user") | .message.content[]? | select(.type=="tool_result") | (.content | if type=="array" then (map(.text // "") | join("")) else . end) | length' "$f" | tr '\n' ' ')· 파일로 빠짐 $(grep -c 'Output too large' "$f")"
  jq -r 'select(.type=="result") | .result // ("ERROR " + .subtype)' "$f"; }
# clout <라벨> : 도구 결과 글 전부(판정에서 CONFLICT·CLAIMED 문구를 찾을 때)
clout() { jq -r 'select(.type=="user") | .message.content[]? | select(.type=="tool_result") | (.content | if type=="array" then (map(.text // "") | join("")) else . end)' "$CLOSE/claude/$1.jsonl"; }
EOF
: > tmp/erd-close2/results.tsv
```

0-3. 의존성. 루트 설치가 없으면 MCP 서버가 뜨지 않는다(S2-7).

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
pnpm install --frozen-lockfile && (cd src/frontend && pnpm install --frozen-lockfile); echo exit=$?
node -e 'import("@modelcontextprotocol/sdk/client/index.js").then(()=>console.log("sdk ok"))'
```
Expected: `exit=0`, `sdk ok`. `--frozen-lockfile` 이 실패하면 레인이 lock 파일을 커밋하지 않은 것이다. 멈추고 알린다.

0-4. 화면 선택자 목록을 만들어 정본과 맞춘다. 단계 2 화면의 `data-testid` 정본은 04-frontend-core.md 끝 "화면 testid"(FE1), 05-frontend-canvas.md Task 13 "`data-testid` 정본"(FE2), 06-frontend-grid-diff.md 앞 "`data-testid` (정본)"(FE3) 표다. 이 문서의 브라우저 단계는 그 이름을 쓴다. 머지된 코드에 그 이름이 있는지 먼저 본다. 없는 이름이 있으면 레인이 이름을 바꾼 것이다. 레인 보고에서 바뀐 이름을 찾아 이 문서의 선택자를 고친 뒤 진행한다. `page.snapshot()` 은 정본 표에 없는 요소(ag-grid 칸 편집기 등)를 찾을 때만 쓴다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
grep -rhoE 'data-testid=(\{`[^`]*`\}|"[^"]*")' src/frontend/m-mdm/pages/dma/erdEdit src/frontend/m-mdm/src/shell/VersionActionBar.tsx | sort -u > "$CLOSE/testids.txt"; wc -l < "$CLOSE/testids.txt"
for id in erd-notice erd-notice-message erd-notice-copy erd-undo- erd-avatar- erd-version-bar erd-ver-confirm erd-confirm-dialog erd-confirm-ack \
  erd-confirm-apply-from erd-confirm-send erd-confirm-errors erd-canvas-host erd-tag- erd-toolbar erd-column-jump erd-colgrid \
  erd-grid-input erd-diff-apply erd-diff-apply-run erd-diff-apply-result erd-diff-apply-note; do
  grep -q -- "$id" "$CLOSE/testids.txt" || grep -rq -- "$id" src/frontend/m-mdm/pages/dma/erdEdit || echo "없음 $id"
done
```
Expected: 단계 1 의 `erd-model-*`·`erd-fit`·`erd-rev`·`erd-presence`·`erd-tab-diff`·`erd-tab-history`·`erd-node-*`·`erd-col-*` 가 그대로 있고, "없음" 줄이 0 이다. `erd-find-widget` 은 shared `FindWidget` 이 `testId="erd-find"` 에 `-widget` 을 붙여 만드는 이름이라 소스에 글자로 없다. 목록에서 빼고 6-7 의 키 확인으로 본다.

---

- [ ] **Step 1: 바뀐 모듈 전체 시험 (복제 PDB 를 열기 전)**

Oracle 시험은 PC 전체에서 하나씩 돈다. 1-2 는 10분 가까이 걸리므로 Bash 의 `run_in_background` 로 돌리고 끝 알림을 기다린다. 통과 판정은 JUnit XML 의 실패 수로 한다. 단계 1 실측: mdm api 8분 32초, m-mdm vitest 약 5분, shared 단위 시험 약 2분 30초.

1-1. mdm `:lib:test`.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
cd src/backend/mdm && ../gradlew :lib:test --max-workers=2 > "$CLOSE/mdm-lib-test.log" 2>&1; echo exit=$?
```
Expected: `exit=0`. Bash timeout 600000ms.

1-2. mdm `:api:test` 전체(TPL_EMPTY 복제 T_*). 백그라운드로 돌린다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
cd src/backend/mdm && DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone > "$CLOSE/mdm-api-test.log" 2>&1; echo exit=$? >> "$CLOSE/mdm-api-test.log"
```
끝나면 센다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
tail -1 "$CLOSE/mdm-api-test.log"; sum src/backend/mdm/api/build/test-results/test/*.xml
grep -lE '<(failure|error) ' src/backend/mdm/api/build/test-results/test/*.xml
rec test.mdmLib "$(sum src/backend/mdm/lib/build/test-results/test/*.xml)"
rec test.mdmApi "$(sum src/backend/mdm/api/build/test-results/test/*.xml)"
```
Expected: 실패 파일이 없거나 `CodeCateEditPerformanceSqliteTest` 하나다(알려진 기존 실패 1). 다른 파일이 있으면 "결함이 나왔을 때" 로 간다. 기존 실패가 있으면 `rec` 값 끝에 `; 기존 실패 CodeCateEditPerformanceSqliteTest` 를 붙인다.

1-3. 계약 정적 검사와 mcm 컴파일.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
node .claude/skills/oasis-contract-check/scripts/check_oasis_contract.mjs --root . ; echo exit=$?
(cd src/backend/mcm && ../gradlew :api:compileJava --max-workers=2 -q; echo exit=$?)
```
Expected: ERROR 0, 두 `exit=0`.

1-4. 프런트. 포털 빌드에는 전제 두 가지가 있다(알려진 기존 실패 4).

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close/src/frontend
pnpm --filter @dk-oasis/shared build && pnpm --filter @dk-oasis/shared test:unit > ../../tmp/erd-close2/fe-shared.log 2>&1; echo shared=$?
pnpm --filter "@dk-oasis/m-mdm^..." build && pnpm --filter @dk-oasis/m-mdm test > ../../tmp/erd-close2/fe-mdm.log 2>&1; echo mdm=$?
pnpm --filter @dk-oasis/m-mdm lint > ../../tmp/erd-close2/fe-mdm-lint.log 2>&1; echo lint=$?
pnpm --filter @dk-oasis/mcm test > ../../tmp/erd-close2/fe-mcm.log 2>&1; echo mcm=$?
pnpm --filter "@dk-oasis/mcm^..." build > /dev/null 2>&1 && AUTH_SECRET=close-dummy pnpm --filter @dk-oasis/mcm build > ../../tmp/erd-close2/fe-mcm-build.log 2>&1; echo build=$?
cd ../.. && /usr/bin/git diff --exit-code src/frontend/m-mcm/lib/generated/page-registry.ts; echo registry-diff=$?
/usr/bin/git status --short
```
Expected: `shared=0 lint=0 mcm=0 build=0 registry-diff=0`. `mdm` 은 0 이거나, 실패가 `ui-meta-lock.test.ts` 하나뿐이다(`grep -E 'FAIL|✗' tmp/erd-close2/fe-mdm.log`). `status` 에 `next-env.d.ts` 만 바뀌었으면 `/usr/bin/git checkout -- src/frontend/m-mcm/next-env.d.ts` 로 되돌린다. 각 로그의 마지막 합계 줄로 `rec test.frontend "shared <n>/<n> / m-mdm <n>/<n> / mcm <n>/<n> / lint 0 / build 0"` 을 적는다.

1-5. 스크립트와 문서 도구.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
node --test --test-reporter=spec scripts/erd/tests/ > "$CLOSE/node-test.log" 2>&1; echo node=$?; tail -8 "$CLOSE/node-test.log"
node scripts/erd/erd-hints.mjs --check; echo hints=$?
node .claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs coverage; echo uidocs=$?
```
Expected: 세 값 모두 0. `hints` 가 0 이 아니면 `node scripts/erd/erd-hints.mjs` 로 다시 만들고 `chore(erd): 추정 근거 파일 재생성` 으로 커밋한다(알려진 기존 실패 5). `rec test.node "<pass>/<total>, hints <0|재생성>, ui_docs ok"`.

1-6. Review Focus 시험과 단계 2 핵심 시험이 실제로 돌았는지 이름으로 본다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
for t in physicalOfRoundTripsThroughJudgeAndImport deleteTableConflictsWhenPeerChangedChildColumn fkAddedKeepsDecidedRelationState \
         dryRunRollsBackWithoutLogOrEvent mcpWriteAppearsInPresenceAndExpires applyDiffRejectsStaleItemIds \
         saveAndRestoreFitInOneConnection burstOfSavesAndUnrelatedReadDoNotStall mixedBatchDiagramRejectionLeavesNothing; do
  printf '%s %s\n' "$t" "$(grep -l "testcase name=\"$t" src/backend/mdm/*/build/test-results/test/*.xml | wc -l | tr -d ' ')"
done
grep -c 'testcase' src/backend/mdm/api/build/test-results/test/TEST-*MdmOasisActionVocabularyTest.xml
grep -c 'sessionNameDerivesFromClaudeSessionId' "$CLOSE/node-test.log"
cd src/frontend && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit tests/shell/version-action-bar.test.ts --reporter=verbose > ../../tmp/erd-close2/fe-mdm-erd.log 2>&1; echo erd=$?
grep -cE 'pendingHoldsResultUntilStreamCatchesUp|pendingDropsBatchWhenEchoArrivesFirst' ../../tmp/erd-close2/fe-mdm-erd.log
pnpm --filter @dk-oasis/shared exec vitest run tests/unit/react-flow-dist-exports.unit.test.ts tests/unit/react-flow-auto-layout.unit.test.ts > ../../tmp/erd-close2/fe-shared-rf.log 2>&1; echo rf=$?
```
Expected: Java 9개가 각각 1 이상이고, 액션 어휘 시험이 있다. node 와 vitest 이름이 각각 1 이상(vitest 는 2), `erd=0`, `rf=0`. 0 인 이름이 있으면 시험이 이름을 바꿨거나 빠진 것이다. 레인 보고(`~/.coord/erd-stage2-1011/lanes/*/reports.md`)에서 찾고, 없으면 조정 세션에 묻는다. `rec test.focus "Review Focus 9/9, deferred 27 HTTP 3/3, 액션 어휘 시험 통과"`.

---

- [ ] **Step 2: 서버 전환 — 사용자 서버 내리기, 새 복제 PDB, 사람 계정**

2-1. 사용자 서버를 기록하고 PID 로 내린다. **조정 세션 허가를 먼저 받는다.** 넓은 `pkill` 은 쓰지 않는다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
{ date; for p in 8096 8100 8191 5100; do lsof -nP -iTCP:$p -sTCP:LISTEN -Fp | sed -n 's/^p//p' | head -1 | while read pid; do
    echo "port $p pid $pid cwd $(lsof -a -p $pid -d cwd -Fn | sed -n 's/^n//p')"
    q=$pid; while [ "${q:-1}" -gt 1 ]; do ps -o pid=,ppid=,command= -p $q | cut -c1-200; q=$(ps -o ppid= -p $q | tr -d ' '); done
  done; done; } | tee "$CLOSE/user-servers.txt"
```
기록에서 두 루트를 찾는다. (a) 명령줄에 `be-run.sh` 가 있는 bash 프로세스(8096·8100·8191 JVM 의 조상), (b) `src/frontend` 에서 돈 `pnpm dev`(5100 node 의 조상). 그 두 PID 에만 TERM 을 보낸다. be-run 은 TERM 을 받으면 자기 JVM 을 정리한다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
kill -TERM <be-run PID> <pnpm dev PID>
```
`Monitor` 로 네 포트가 비기를 기다린다: `until ! lsof -nP -iTCP:8096 -iTCP:8100 -iTCP:8191 -iTCP:5100 -sTCP:LISTEN >/dev/null 2>&1; do sleep 3; done; echo free`. 60초 안에 비지 않으면 남은 listener PID 를 `lsof` 로 보고 그 PID 만 `kill -TERM` 한다. 되살리는 명령은 Step 10 에 있다. `rec env.userServers "내림: <PID 목록>"`.

2-2. 새 TPL_DATA 복제본을 연다. L_ERD12(단계 1)는 모델이 이미 있어 쓰지 않는다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
node scripts/oracle/pdb.mjs list | tail -1
t0=$(date +%s); node scripts/oracle/pdb.mjs clone TPL_DATA L_ERD2C; echo "clone 초=$(( $(date +%s) - t0 ))"
node scripts/oracle/pdb.mjs list | grep -E 'L_ERD2C|열린'
```
Expected: 복제 전 `열린 PDB 2 / 상한 3`, 복제 뒤 `L_ERD2C READ WRITE` 와 `3 / 상한 3`. 이 뒤로는 Oracle 시험을 돌리지 않는다. `rec env.pdb "L_ERD2C(TPL_DATA 복제) 복제 <초>초"`.

2-3. 이 워크트리에서 BE 를 띄운다. Bash 의 `run_in_background` 로 실행한다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
./be-run.sh --mcm --mdm --pdb=L_ERD2C > "$CLOSE/be-run.log" 2>&1
```
`Monitor` 로 `until lsof -nP -iTCP:8096 -sTCP:LISTEN >/dev/null 2>&1 && lsof -nP -iTCP:8100 -sTCP:LISTEN >/dev/null 2>&1; do sleep 5; done; echo up` 를 기다린다(최대 5분, 단계 1 실측 mdm 6.4초·mcm 9.9초 + 빌드). mcm 이 뜨면서 admin 비밀번호 행(admin123)과 `erdEdit` 권한을 시드한다.

2-4. 사람 계정을 넣는다(S2-9). 파일에 COMMIT 이 없으므로 붙인다. 오류가 나면 바로 멈추게 한다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
for f in mdm-rbac-users mdm-ruleEdit-users; do
  { echo "whenever sqlerror exit failure rollback"; cat src/frontend/e2e/fixtures/$f.sql; echo "commit;"; } | sqm; echo "$f exit=$?"
done
sqm <<'SQL'
select m.USER_ID||' '||m.ROLE_GROUP_ID||' pwd='||(select count(*) from TB_MCM_SEC_USER_PWD p where p.USER_ID=m.USER_ID) from TB_MCM_SEC_USER_MAPPING m where m.USER_ID in ('admin','e2e_mdm_stdadmin','e2e_mdm_steward','e2e_mdm_steward2') order by 1;
select 'erdEdit '||ROLE_ID||' '||PERM_ID from TB_MCM_SEC_ROLE_MAPPING where OBJECT_ID='erdEdit' order by 1;
SQL
```
Expected: 두 `exit=0`. `e2e_mdm_stdadmin ROLE_GROUP_MDM_STD_ADMIN pwd=1`, `e2e_mdm_steward ROLE_GROUP_MDM_STEWARD pwd=1` 가 보이고, `erdEdit` 권한이 3행(SYSADMIN·MDM_STD_ADMIN·MDM_STEWARD)이다. 칼럼 이름이 다르면(`ORA-00904`) `src/frontend/e2e/fixtures/mdm-rbac-users.sql` 의 INSERT 칼럼 목록으로 고쳐 다시 돈다. 한글 USER_NM 이 깨져도 표시만 영향을 받는다. `rec env.users "admin, e2e_mdm_stdadmin(STD_ADMIN), e2e_mdm_steward, e2e_mdm_steward2 — 비밀번호 admin123"`.

2-5. 이 워크트리에서 FE 를 5100 에 띄운다(`run_in_background`).

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
./fe-run.sh --mdm --install --build > "$CLOSE/fe-run.log" 2>&1
```
`Monitor` 로 `until lsof -nP -iTCP:5100 -sTCP:LISTEN >/dev/null 2>&1; do sleep 5; done; echo up` 를 기다린다. 리스너 cwd 가 이 워크트리인지 본다: `lsof -a -p $(lsof -nP -iTCP:5100 -sTCP:LISTEN -Fp | sed -n 's/^p//p' | head -1) -d cwd -Fn`.

---

- [ ] **Step 3: 모델 준비 — 가져오기 → 첫 확정 → 새 DRAFT → 공동 편집자 (S2-2)**

3-1. 등록과 가져오기. 이어서 SSE 감시 연결을 하나 열어 둔다(`version`·`reload`·`claim` 을 서버 쪽에서 확인한다).

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
erd search '{}' | jq -c '[.. | objects | select(has("modelId")) | .modelId]'
erd reg '{"modelId":"mcm","moduleId":"mcm","schemaName":"MCMAPUSER","modelName":"MCM 스키마"}' | jq -c '{s:.meta.success,r:.data.result}'
t0=$(date +%s); erd import "{\"modelId\":\"mcm\",\"kind\":\"FROM_DB\",\"baseRev\":$(rv),\"session\":\"close-import\",\"source\":\"CLI\"}" > "$CLOSE/import.json"
jq -c '{applied:.data.result.applied, rev:.data.result.rev, rowVersion:.data.result.rowVersion, rejection:.data.result.rejection, summary:.data.result.summary}' "$CLOSE/import.json"; echo "초=$(( $(date +%s) - t0 ))"
erd compare '{"modelId":"mcm","kind":"DB_DIFF"}' | jq -c '{items:(.data.result.items|length)}'
```
Expected: 첫 줄 `[]`(복제본에 모델이 없다). `applied:true`, `rowVersion` 이 null 이 아닌 수(Task 4 계약), `summary.tables` 는 단계 1 실측 57 근처, DB_DIFF 0. `rec setup.import "<summary jq -c>, <초>초, rowVersion <값>"`.

SSE 감시 연결(`run_in_background`, Step 9 끝까지 둔다):

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
curl -sSN -H "X-Client-Key: $BACKEND_CLIENT_KEY" -H "X-Authenticated-User: admin" -H "X-Authenticated-Role: MDM_STEWARD" \
  "$ERD_BASE/api/mdm/erd/stream/mcm?session=close-probe&source=CLI" \
  | awk '/^event:/{e=substr($0,7)} /^data:/{print e, substr($0,6); fflush()}' > "$CLOSE/sse-probe.txt"
```
읽는 법: 한 줄이 `<이벤트 이름> <data JSON>` 이다. `awk '$1=="version"' "$CLOSE/sse-probe.txt" | cut -c1-200`. 첫 `version` 줄에 `"reason":"SUBSCRIBE"` 가 있어야 한다(S2-12). 이 연결이 끝나 있으면(`reload` 뒤 서버가 닫았거나 큐가 넘침) 같은 명령으로 다시 연다.

3-2. 확정 검사 묶음과 첫 확정. `confirm` 은 `applyFrom`(형식 `yyyy-MM-dd HH:mm:ss`)이 필수다. 적용 시각이 미래면 다음 `copy` 가 MDM006 으로 막히므로 1분 전 시각을 준다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
erd validate '{"modelId":"mcm"}' | jq -c '{errors:(.data.result.errors|length), warnings:(.data.result.warnings | group_by(.code) | map({(.[0].code): length}) | add)}' | tee "$CLOSE/validate1.txt"
for i in 1 2 3 4 5 6; do erd view '{"modelId":"mcm","kind":"STATUS"}' | jq -r '.data.result.elapsedMs'; done | tee "$CLOSE/status.ms"
V=$(v); VER=$(jq -r .data.result.ver <<<"$V"); RW=$(jq -r .data.result.rowVersion <<<"$V"); AF=$(date -v-1M '+%Y-%m-%d %H:%M:%S')
erd confirm "{\"modelId\":\"mcm\",\"ver\":\"$VER\",\"rowVersion\":$RW,\"applyFrom\":\"$AF\",\"warningsAcknowledged\":false}" | jq -c '{code:.meta.code, n:(.errors // [] | length)}'
erd confirm "{\"modelId\":\"mcm\",\"ver\":\"$VER\",\"rowVersion\":$RW,\"applyFrom\":\"$AF\",\"warningsAcknowledged\":true}" | jq -c '{s:.meta.success, code:.meta.code, r:.data.result}'
v | jq -c '.data.result | {ver, status, ownerId, rowVersion}'
```
Expected: `errors:0`, 경고는 `ERD_STD_DOMAIN`·`ERD_STD_MISS`·`ERD_STD_TYPE`·`ERD_INFERRED_LEFT` 코드별 수(합 약 700, 단계 1 실측 MCM 737 + 1). 확인 없는 확정은 `MDM014`, 확인한 확정은 `s:true`. 확정 뒤 SSE 감시에 `version` `reason:"CONFIRM"` 이 한 줄 생긴다. `rec setup.validate1 "$(cat "$CLOSE/validate1.txt")"`, `rec status.mcm2 "첫 <ms>, 가운데 <ms>, 최대 <ms>"`(6개 중 2~6번째 가운데 값), `rec setup.confirm1 "확인 없음 MDM014 → 확인 뒤 확정, applyFrom $AF"`.

3-3. 새 DRAFT 와 공동 편집자.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
erd copy '{"modelId":"mcm","verKind":"MINOR"}' | jq -c '{code:.meta.code, r:.data.result}'
v | jq -c '.data.result | {ver, status, ownerId, rowVersion, rev}'
```
`ownerId` 가 `admin` 이 아니고 null 이면 선점한다(R7-1): `V=$(v); erd lock "{\"modelId\":\"mcm\",\"ver\":\"$(jq -r .data.result.ver <<<"$V")\",\"rowVersion\":$(jq -r .data.result.rowVersion <<<"$V")}"`. `copy` 가 MDM006 이면 3-2 의 `applyFrom` 이 미래였다. 결함이 아니라 절차 오류다. 멈추고 기록한다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
for u in e2e_mdm_stdadmin erd-mcp-a erd-mcp-b; do erd execute "{\"modelId\":\"mcm\",\"kind\":\"ADD_EDITOR\",\"userId\":\"$u\"}" | jq -c '{s:.meta.success, r:.data.result}'; done
v | jq -c '.data.result | {ver, status, ownerId, editors, rowVersion}'
awk '$1=="version" || $1=="reload"' "$CLOSE/sse-probe.txt" | cut -c1-160
```
Expected: `status` 가 DRAFT, `ownerId` admin, `editors` 3명. SSE 감시에 `reload`(copy) 한 줄과 `version` `ADD_EDITOR` 세 줄이 있다. `rec setup.draft "ver <ver>, owner admin(선점 <함|안 함>), editors 3"`, `rec sse.version "<감시에 나온 reason 목록>"`.

3-4. 시험 대상을 고른다. 공동 편집이 기존 TYPE·DOMAIN·MISS 컬럼을 건드리면 두 번째 확정이 막힌다(README 마감 순서 7). 그래서 상태가 OK·ALIAS·NEW 인 컬럼만 고른다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
v > "$CLOSE/model0.json"; erd view '{"modelId":"mcm","kind":"STATUS"}' > "$CLOSE/status0.json"
jq -n --slurpfile m "$CLOSE/model0.json" --slurpfile s "$CLOSE/status0.json" '
  ($m[0].data.result.model | fromjson) as $M | $s[0].data.result.statuses as $S
  | ([$M.columns[] | .phys] | group_by(.) | map({(.[0]): length}) | add) as $cnt
  | [$M.tables | to_entries[] | {id:.key, phys:.value.phys, ok:[.value.columnOrder[] | select(. as $i | ["OK","ALIAS","NEW"] | index($S[$i] // "OK"))]}]
  | sort_by(.phys) | map(select(.ok | length >= 6)) as $c
  | ($c[2].ok | map(select($cnt[$M.columns[.].phys] == 1)) | .[0]) as $p
  | {T1:{id:$c[0].id, phys:$c[0].phys}, C:[$c[0].ok[0:6][] | {id:., phys:$M.columns[.].phys, logical:$M.columns[.].logical}],
     T2:{id:$c[1].id, phys:$c[1].phys}, C7:{id:$c[1].ok[0], phys:$M.columns[$c[1].ok[0]].phys},
     D19:{table:$c[3].id, tablePhys:$c[3].phys, phys:$M.columns[$p].phys, srcType:$M.columns[$p].dataType, srcLen:$M.columns[$p].length},
     diag:$m[0].data.result.nodes[0].diagram}' | tee "$CLOSE/targets.json"
```
Expected: 모든 칸이 null 이 아니다. `C` 는 6개(C1~C6: `.C[0]`~`.C[5]`)다. 쓰임: C1 충돌, C2 다른 속성 합치기, C3 되돌리기 성공, C4 되돌리기 충돌, C5 사람·Claude 충돌 알림, C6 사람 B 편집. T2·C7 은 작업 중 표시와 CLI. D19 는 Step 7 의 확정 막힘 컬럼(D19.phys 를 D19.table 에 다른 타입으로 더한다). null 이 있으면 조건(`>= 6`, 유일 물리명)을 하나씩 풀어 다시 고르고 그 사실을 기록한다.

---

- [ ] **Step 4: 브라우저 두 사용자 (ego-browser, 첫 확인 = 쿠키 분리)**

ego-browser 스킬을 쓴다. 사용자 프로필을 고르지 않는다(두 번째 프로필 금지). TaskSpace 는 하나만 쓰고 `spaceId` 를 출력해 둔다. 요소는 0-4 의 정본 testid 로 고른다. 모달 안 요소는 포털이라 `document` 에서 찾는다. 여러 개가 맞는 선택자에 `waitForSelector` 를 쓰지 않고 `waitForFunction` 을 쓴다. React Flow 는 화면 밖 노드를 그리지 않으므로 개수는 맞춤 단추(`erd-fit`) 뒤에 센다.

4-1. p1 = `localhost` 의 admin, p2 = `127.0.0.1` 의 `e2e_mdm_stdadmin`. p2 로그인 뒤 p1 사용자가 그대로인지 다시 본다.

```bash
ego-browser nodejs <<'EOF'
const task = await taskSpace("erd-stage2-close");
console.log("spaceId", task.spaceId);
async function login(page, origin, id) {
  await page.goto(origin + "/login");
  await page.fill("loc=css:#login-user-id", id);
  await page.fill("loc=css:#login-password", "admin123");
  await page.click("loc=css:button[type=submit]");
  await page.waitForFunction(() => !location.pathname.startsWith("/login"), undefined, { timeout: 60000 });
  const landed = await page.evaluate(() => location.origin);
  if (landed !== origin) await page.goto(origin + "/portal");      // NEXTAUTH_URL 이 localhost 로 보낼 수 있다
  return { landed, me: await page.evaluate(async () => (await fetch("/api/auth/me")).json()) };
}
const a = task.page("p1");
const b = await task.newPage();
console.log("p2 label", b.label);
console.log("A", JSON.stringify(await login(a, "http://localhost:5100", "admin")));
console.log("B", JSON.stringify(await login(b, "http://127.0.0.1:5100", "e2e_mdm_stdadmin")));
console.log("A 다시", JSON.stringify(await a.evaluate(async () => (await fetch("/api/auth/me")).json())));
EOF
```
판정:
- 통과: B 의 `me` 가 `e2e_mdm_stdadmin`, "A 다시" 의 `me` 가 `admin` 이다. `rec env.cookieSplit "통과 — localhost=admin, 127.0.0.1=e2e_mdm_stdadmin, B 로그인 뒤 도착 origin <landed>"`.
- 실패(둘이 같은 사용자, 로그인 오류, 127.0.0.1 에서 화면이 안 열림): 두 번째 사람은 HTTP 클라이언트로 대신한다. p2 는 `localhost` 에 admin 으로 두 번째 창을 연다(창 두 개 확인용). 이후 "사람 B 편집" 은 `erdAs e2e_mdm_stdadmin MDM_STD_ADMIN save …` 로 보낸다. 이 경로는 포털 RBAC 를 지나지 않는다. `rec env.cookieSplit "대체 — 사람 B 는 BFF 헤더 HTTP(8096), 이유: <관찰>"`.

4-2. 두 창에서 화면을 연다. 메뉴는 `마루 MDM > 용어·도메인 > ERD 설계` 이고 leaf 를 직접 누른다.

```bash
SPACE_ID=<id> ego-browser nodejs <<'EOF'
const task = await taskSpace(Number(process.env.SPACE_ID));
for (const label of ["p1", "p2"]) {
  const p = task.page(label);
  await p.goto((await p.evaluate(() => location.origin)) + "/portal");
  if (!(await p.evaluate(() => document.body.innerText.includes("ERD 설계")))) await p.click("text=용어·도메인");
  await p.click("text=ERD 설계");
  await p.click("loc=css:[data-testid=erd-model-mcm]");
  await p.waitForFunction(() => document.querySelectorAll(".react-flow__node").length > 0, undefined, { timeout: 60000 });
  await p.click("loc=css:[data-testid=erd-fit]");
  await p.waitForTimeout(800);
  console.log(label, JSON.stringify(await p.evaluate(() => ({ nodes: document.querySelectorAll(".react-flow__node").length,
    rev: document.querySelector("[data-testid=erd-rev]")?.textContent, presence: document.querySelector("[data-testid=erd-presence]")?.textContent,
    readonly: document.querySelector("[data-testid=erd-banner-readonly]")?.textContent ?? null }))));
}
EOF
```
```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
v | jq -c '[.data.result.presence[] | {session, userId, source}]'
```
Expected: 두 창 모두 노드 수가 `summary.tables` 와 같고, 읽기 전용 띠가 없다(둘 다 편집자). 서버 `presence` 에 `source:"UI"` 세션 2개가 있고 `userId` 가 `admin`·`e2e_mdm_stdadmin`(대체 경로면 둘 다 admin)이다. `rec ui.open "노드 <n>, presence UI <사용자 목록>"`.

---

- [ ] **Step 5: Claude 세션 2개 준비**

5-1. MCP 설정과 도구를 확인한다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
jq -c '.mcpServers | keys' .mcp.json; jq -r '.mcpServers.erd.env | to_entries[] | "\(.key)=\(.value)"' .mcp.json
claude --help | grep -E "mcp-config|strict-mcp-config|allowedTools|disallowedTools|permission-mode|output-format|no-session-persistence"
cl tools erd-mcp-a claude-a "getCurrentView" 5 "erd MCP 서버의 도구 이름만 쉼표로 나열해라. 도구를 부르지 마라."
```
Expected: 서버 키 `erd`, `ERD_SESSION=${ERD_SESSION:-auto}`, 도구 12개가 답에 나온다. 플래그 이름이 다르면 `env.sh` 의 `cl` 을 그 이름으로 고친다. 도구가 안 보이면 `node scripts/erd/erd-mcp.mjs < /dev/null` 의 stderr 를 본다.

5-2. 세션 이름 자동 결정(S2-7). `ERD_SESSION=auto` 로 중첩 `claude -p` 두 개를 띄워 각각 한 번 읽게 한다. 이름은 서버 접속자 항목으로 판정한다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
for k in 1 2; do cl auto$k erd-mcp-a auto "getModelText" 5 "getModelText(modelId=mcm, tables=[\"$(tgt .T1.phys)\"]) 를 한 번 부르고 머리줄만 옮겨라."; done
v | jq -c '[.data.result.presence[] | select(.source=="MCP") | {session, userId, expiresAt}]'
```
Expected: `source:"MCP"` 항목에 `claude-` + 8글자 이름이 두 개 있고 서로 다르다. `expiresAt` 은 약 600초 뒤다. `rec mcp.sessionAuto "<두 이름>, expiresAt 있음"`. 같은 이름이면 S2-7 결함이다.

---

- [ ] **Step 6: 공동 편집 — 충돌·합치기·작업 중 표시·되돌리기 (사람 2명 + Claude 2세션)**

각 소단계 앞에서 `R=$(rv)` 로 rev 를 적고, 끝에서 `deltas $R` 로 판정한다. Claude A 는 `ERD_USER=erd-mcp-a ERD_SESSION=claude-a`, B 는 `erd-mcp-b`·`claude-b` 다. 프로세스는 매번 새로 띄운다. 충돌 판정은 세션 이름으로 하므로 이어 쓰기(`--resume`)가 필요 없다. MCP 도구는 지연 로드라 자식이 먼저 `ToolSearch` 로 한 턴을 쓴다. 그래서 `--max-turns` 는 5 이상이다. 결과가 `ERROR error_max_turns` 면 제품 결과가 아니다. 턴을 늘려 그 호출만 다시 한다.

6-1. 같은 속성 충돌(C1.logical). A 가 읽고, B 가 바꾸고, A 가 낡은 baseRev 로 보낸다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
T1=$(tgt .T1.phys); C1="$T1.$(tgt '.C[0].phys')"; R=$(rv); echo "R=$R"
cl c1-a-read erd-mcp-a claude-a "getModelText" 6 "getModelText(modelId=mcm, tables=[\"$T1\"]) 로 읽고 머리줄의 rev 와 $C1 의 논리명을 답해라."
cl c1-b erd-mcp-b claude-b "apply" 6 "apply 를 한 번 불러라. modelId=mcm, baseRev=$R, commands=[{\"op\":\"updateColumn\",\"id\":\"$C1\",\"set\":{\"logical\":\"동시편집B\"}}]. 결과 첫 줄을 옮겨라."
cl c1-a erd-mcp-a claude-a "apply,getChangesSince,getModelText" 10 "너는 rev $R 에서 $T1 을 읽었다. apply 로 $C1 의 logical 을 '동시편집A' 로 바꿔라(baseRev=$R). 거절되면 결과 글의 '다음:' 지시를 따르고 다시 보내라. 마지막 결과 첫 줄을 옮겨라."
deltas $R; lastrv; clout c1-a | grep -m3 -E 'CONFLICT|바꾼 사람'
```
Expected(서버): `R+1 erd-mcp-b claude-b MCP` 와 `R+2 erd-mcp-a claude-a MCP` 두 델타만 있고, 둘 다 `column:upsert:<C1 id>` 다. Claude A 의 도구 순서는 `apply getChangesSince … apply` 이고 첫 `apply` 결과가 오류다. 그 글에 `CONFLICT`, `erd-mcp-b`(byUserId), `claude-b`, `rev R+1` 이 있다. `colv <C1 id> logical` 이 `동시편집A` 다. `lastrv` 의 `rowVersion` 이 수다(실시간 `change` 에만 값이 있다, S2-16). `rec mcp.conflict "CONFLICT(byUserId erd-mcp-b, rev <R+1>) → getChangesSince → 다시 보내 rev <R+2> 반영"`.

6-2. 다른 속성 합치기(C2). 같은 baseRev 로 A 는 comment, B 는 logical 을 바꾼다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
C2="$(tgt .T1.phys).$(tgt '.C[1].phys')"; R=$(rv)
cl c2-a erd-mcp-a claude-a "apply" 6 "apply 한 번: modelId=mcm, baseRev=$R, commands=[{\"op\":\"updateColumn\",\"id\":\"$C2\",\"set\":{\"comment\":\"합치기A\"}}]. 결과 첫 줄을 옮겨라."
cl c2-b erd-mcp-b claude-b "apply" 6 "apply 한 번: modelId=mcm, baseRev=$R, commands=[{\"op\":\"updateColumn\",\"id\":\"$C2\",\"set\":{\"logical\":\"합치기B\"}}]. 결과 첫 줄을 옮겨라."
deltas $R; echo "comment=$(colv "$(tgt '.C[1].id')" comment) logical=$(colv "$(tgt '.C[1].id')" logical) rev=$(rv)"
```
Expected: 델타 2개(claude-a, claude-b), `comment=합치기A logical=합치기B`. B 의 결과에 `baseRev 뒤 다른 세션 변경` 줄이 있다. 이어서 화면이 Claude 쓰기를 받는지 본다: `SPACE_ID=<id> REV=<위 rev> ego-browser nodejs` 로 `task.page("p1").waitForFunction((r) => (document.querySelector("[data-testid=erd-rev]")?.textContent || "").includes(String(r)), Number(process.env.REV), { timeout: 10000 })` 를 돌린다. 10초 안에 끝나야 한다. `rec mcp.merge "다른 속성 둘 다 반영(rev <n>,<n>), A 창 반영 확인"`.

6-3. 작업 중 표시(T2). A 가 잡고, B 가 T2 를 고치고, A 가 놓고, B 가 다시 고친다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
T2=$(tgt .T2.phys); C7="$T2.$(tgt .C7.phys)"
cl claim-a erd-mcp-a claude-a "claimTable" 5 "claimTable(modelId=mcm, tables=[\"$T2\"]) 를 한 번 불러라. 결과를 옮겨라."
awk '$1=="claim"' "$CLOSE/sse-probe.txt" | tail -1 | cut -c1-200
cl claim-b1 erd-mcp-b claude-b "apply" 6 "apply 한 번: modelId=mcm, baseRev=$(rv), commands=[{\"op\":\"updateColumn\",\"id\":\"$C7\",\"set\":{\"comment\":\"잡힌 표\"}}]. 결과 글 전체를 옮겨라."
clout claim-b1 | grep -E 'CLAIMED|작업 중'
cl claim-rel erd-mcp-a claude-a "releaseTable" 5 "releaseTable(modelId=mcm, tables=[\"$T2\"]) 를 한 번 불러라."
cl claim-b2 erd-mcp-b claude-b "apply" 6 "apply 한 번: modelId=mcm, baseRev=$(rv), commands=[{\"op\":\"updateColumn\",\"id\":\"$C7\",\"set\":{\"comment\":\"풀린 표\"}}]. 결과 글 전체를 옮겨라."
clout claim-b2 | grep -cE 'CLAIMED'
v | jq -c '[.data.result.presence[] | select(.source=="MCP") | {session, userId, selectedTables}]'
```
Expected: SSE `claim` 목록에 `claude-a` 가 T2 id 를 쥔다. `claim-b1` 결과에 `CLAIMED` 와 `claude-a (erd-mcp-a)`, 만료 시각이 있다. 놓은 뒤 `claim-b2` 의 `CLAIMED` 수는 0 이다. 접속자에 `claude-a`·`claude-b` 가 있고 `selectedTables` 에 건드린 표 id 가 있다(S2-11). `rec mcp.claim "CLAIMED 경고(claude-a) → 놓은 뒤 없음, presence MCP 2개 selectedTables <값>"`.

6-4. 되돌리기 성공(C3)과 일부러 만든 되돌리기 충돌(C4, S2-5). 되돌릴 대상은 뒤에 아무도 건드리지 않는 속성이다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
C3="$(tgt .T1.phys).$(tgt '.C[2].phys')"; C4="$(tgt .T1.phys).$(tgt '.C[3].phys')"; O3=$(colv "$(tgt '.C[2].id')" logical); R=$(rv)
cl undo-ok erd-mcp-a claude-a "apply,undo" 6 "두 번 불러라. 1) apply: modelId=mcm, baseRev=$R, commands=[{\"op\":\"updateColumn\",\"id\":\"$C3\",\"set\":{\"logical\":\"되돌릴값\"}}]. 2) undo(modelId=mcm) 를 rev 없이 불러 방금 반영을 되돌려라. 두 결과 첫 줄을 옮겨라."
deltas $R; echo "C3 원래=$O3 지금=$(colv "$(tgt '.C[2].id')" logical)"
R=$(rv)
cl undo-c1 erd-mcp-a claude-a "apply" 6 "apply 한 번: modelId=mcm, baseRev=$R, commands=[{\"op\":\"updateColumn\",\"id\":\"$C4\",\"set\":{\"logical\":\"되돌림충돌A\"}}]."
RA=$((R+1))
cl undo-c2 erd-mcp-b claude-b "apply" 6 "apply 한 번: modelId=mcm, baseRev=$RA, commands=[{\"op\":\"updateColumn\",\"id\":\"$C4\",\"set\":{\"logical\":\"되돌림충돌B\"}}]."
R2=$(rv)
cl undo-c3 erd-mcp-a claude-a "undo" 5 "undo(modelId=mcm, rev=$RA) 를 한 번 불러라. 결과 글 전체를 옮겨라."
echo "rev 전=$R2 후=$(rv) C4=$(colv "$(tgt '.C[3].id')" logical)"; clout undo-c3 | head -3
```
Expected: 첫 부분 델타 2개(둘 다 claude-a, 두 번째는 되돌리기)이고 `C3 지금` 이 원래 값과 같다. 둘째 부분은 `rev 전=후`, `C4=되돌림충돌B` 이고 `undo-c3` 결과가 `CONFLICT` 와 `erd-mcp-b`, `claude-b` 를 적는다. `rec mcp.undoOk "rev <n> 되돌림 성공, 값 원복"`, `rec mcp.undoConflict "rev $RA 되돌리기 CONFLICT(뒤에 claude-b 가 같은 속성), rev 불변"`.

6-5. 사람 편집과 화면 반영. 먼저 `rv > "$CLOSE/r65.txt"` 로 시작 rev 를 적는다(여러 호출에 걸친다). 사람 B(p2)가 C6 논리명을 그리드에서 바꾸고 T1 노드를 끈다. 사람 A(p1)가 새로 고침 없이 따라오는지 본다. 그리드에서 고칠 수 있는 칸은 논리명·물리명·타입·NN 이다(주석은 그리드 칸이 아니다, 06 Task 14). 그리드 행은 `[data-testid=erd-colgrid] .ag-row[row-id="<컬럼 id>"]`, 칸은 그 안의 `[col-id="logical"]` 이다(`erd-col-<id>` 는 캔버스 노드 안의 행이다). 칸 편집 방법(더블클릭 또는 F2, 입력, Enter)은 FE3 레인 보고(06 Task 14 Step 10)를 따른다. 대체 경로(4-1 실패)면 B 편집은 `erdAs e2e_mdm_stdadmin MDM_STD_ADMIN save` 로 보내고 노드 끌기는 p2(admin 두 번째 창)에서 한다.

```bash
SPACE_ID=<id> T1ID=<targets .T1.id> C6ID=<targets .C[5].id> ego-browser nodejs <<'EOF'
const task = await taskSpace(Number(process.env.SPACE_ID));
const a = task.page("p1"), b = task.page("p2");
await b.click(`loc=css:[data-testid=erd-node-${process.env.T1ID}]`);
const sel = `[data-testid=erd-colgrid] .ag-row[row-id="${process.env.C6ID}"] [col-id="logical"]`;
await b.waitForFunction((x) => !!document.querySelector(x), sel, { timeout: 10000 });
await b.dblclick(`loc=css:${sel}`);     // 칸 편집기가 열리지 않으면 b.click 뒤 F2(FE3 레인 보고)
await b.keyboard.press("Control+a"); await b.keyboard.type("사람B논리"); await b.keyboard.press("Enter");
await b.waitForTimeout(1000);
console.log("C6 칸", await b.evaluate((x) => document.querySelector(x)?.textContent, sel));
EOF
```
이어 B 에서 T1 노드 머리를 (dx 120, dy 80) 끈다. A 는 `erd-rev` 가 서버 rev 와 같아질 때까지 기다린다.

```bash
SPACE_ID=<id> T1ID=<…> ego-browser nodejs <<'EOF'
const task = await taskSpace(Number(process.env.SPACE_ID));
const a = task.page("p1"), b = task.page("p2");
const box = await b.evaluate((id) => { const r = document.querySelector(`[data-testid=erd-node-${id}]`).getBoundingClientRect(); return { x: r.x + 30, y: r.y + 10 }; }, process.env.T1ID);
const t0 = Date.now();
await b.mouse.move(box.x, box.y); await b.mouse.down(); await b.mouse.move(box.x + 60, box.y + 40, { steps: 5 }); await b.mouse.move(box.x + 120, box.y + 80, { steps: 5 }); await b.mouse.up();
const rev = await (await fetch("http://localhost:8096/api/mdm/oasis/erdEdit/view", { method: "POST", headers: { "Content-Type": "application/json", "X-Client-Key": "dmes-bff-local-client-key-2026", "X-Authenticated-User": "admin", "X-Authenticated-Role": "MDM_STEWARD" }, body: JSON.stringify({ meta: { menuId: "erdEdit" }, params: { modelId: "mcm" } }) })).json();
await a.waitForFunction((r) => (document.querySelector("[data-testid=erd-rev]")?.textContent || "").includes(String(r)), rev.data.result.rev, { timeout: 10000 });
console.log("A 반영 ms", Date.now() - t0, "rev", rev.data.result.rev);
EOF
```
```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
deltas $(cat "$CLOSE/r65.txt"); lastrv; v | jq -c --arg t "$(tgt .T1.id)" '[.data.result.nodes[] | select(.table==$t) | {x,y}]'; colv "$(tgt '.C[5].id')" logical
```
Expected: 델타에 `e2e_mdm_stdadmin <ui-세션> UI` 의 `column:upsert:<C6>` 와 노드 이동(다이어그램 변경)이 있다. 노드 이동 직후 `lastrv` 의 `rowVersion` 은 null 이다. 논리명이 `사람B논리` 이고 노드 좌표가 바뀌었다. A 는 10초 안에 따라왔다. `rec ui.humanEdit "사람 B 그리드 논리명·노드 끌기 반영, A 반영 <ms>ms"`.

6-6. 사람과 Claude 의 충돌 알림(C5). A(admin)가 그리드에서 C5 논리명을 바꾸고(rev rH), Claude B 가 같은 속성을 바꾼 뒤, A 가 Ctrl+Z 로 자기 마지막 명령을 되돌린다.

먼저 6-5 와 같은 방법(`[data-testid=erd-colgrid] .ag-row[row-id="<C5 id>"] [col-id="logical"]`)으로 p1 에서 T1 을 고르고 C5 논리명 칸을 `사람A논리` 로 바꾼다. 서버에서 `deltas` 로 rH(admin, UI)를 확인한 뒤 Claude B 를 보낸다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
C5="$(tgt .T1.phys).$(tgt '.C[4].phys')"
cl c5-b erd-mcp-b claude-b "apply" 6 "apply 한 번: modelId=mcm, baseRev=$(rv), commands=[{\"op\":\"updateColumn\",\"id\":\"$C5\",\"set\":{\"logical\":\"클로드B논리\"}}]."
```
```bash
SPACE_ID=<id> T1ID=<targets .T1.id> ego-browser nodejs <<'EOF'
const task = await taskSpace(Number(process.env.SPACE_ID));
const a = task.page("p1");
await a.waitForTimeout(1500);
await a.keyboard.press("Escape");
await a.click("loc=css:.react-flow__pane");
await a.keyboard.press("Control+z");
await a.waitForFunction(() => !!document.querySelector("[data-testid=erd-notice]"), undefined, { timeout: 10000 });
console.log("알림", JSON.stringify(await a.evaluate(() => {
  const t = (id) => document.querySelector(`[data-testid=${id}]`)?.textContent ?? null;
  return { code: document.querySelector("[data-testid=erd-notice]")?.getAttribute("data-code"), message: t("erd-notice-message"),
    hint: t("erd-notice-hint"), mine: t("erd-notice-mine"), copy: !!document.querySelector("[data-testid=erd-notice-copy]") };
})));
console.log("A 접속자", JSON.stringify(await a.evaluate(() => [...document.querySelectorAll("[data-testid^=erd-avatar-]")]
  .map((e) => ({ id: e.getAttribute("data-testid"), source: e.getAttribute("data-source"), title: e.getAttribute("title") })))));
console.log("T1 이름표", JSON.stringify(await a.evaluate((id) => [...document.querySelectorAll(`[data-testid=erd-node-${id}] [data-testid^=erd-tag-]`)]
  .map((e) => ({ id: e.getAttribute("data-testid"), source: e.getAttribute("data-source"), claimed: e.getAttribute("data-claimed") })), process.env.T1ID)));
EOF
```
Expected: 서버 rev 가 바뀌지 않는다(`rv` 전후 같음). 알림의 `code` 가 `CONFLICT` 이고 `message` 에 `erd-mcp-b`(byUserId)·rev rH+1·지금 값 `클로드B논리` 가 있으며, 알림에 "변경 기록에서 다른 변경을 고르세요" 가 붙는다. `mine` 이 `사람A논리` 이고 `copy` 가 true 다. 접속자(`erd-avatar-<세션>`)에 `claude-a`·`claude-b`(`data-source="llm"`)와 `e2e_mdm_stdadmin`(대체 경로면 admin)의 UI 세션이 있다. T1 노드 이름표(`erd-tag-<세션>`)에 Claude 세션이 있는지 적는다. `rec ui.notice "Ctrl+Z → CONFLICT 알림(byUserId erd-mcp-b, rev <n>), rev 불변"`, `rec ui.presence "<A 접속자 표시 글>, 노드 이름표 <있음|없음>"`.

6-7. 단축키(S2-8). CDP 로 보낸 키는 브라우저 자체 단축키(Chrome 의 Ctrl/⌘+T 새 탭)를 거치지 않는다. 그래서 이 확인은 "페이지가 받는가" 만 판정한다. Chrome 이 실제로 가로채는지는 사람이 직접 눌러 봐야 한다.

```bash
SPACE_ID=<id> ego-browser nodejs <<'EOF'
const task = await taskSpace(Number(process.env.SPACE_ID));
const a = task.page("p1");
const open = (id) => a.evaluate((x) => !!document.querySelector(`[data-testid=${x}]`), id);
for (const [k, id] of [["Control+k", "erd-find-widget"], ["Control+t", "erd-find-widget"], ["Alt+o", "erd-column-jump"], ["Control+o", "erd-column-jump"]]) {
  await a.click("loc=css:.react-flow__pane"); const before = await open(id);
  await a.keyboard.press(k); await a.waitForTimeout(500);
  console.log(k, id, before, "→", await open(id)); await a.keyboard.press("Escape"); await a.waitForTimeout(300);
}
await a.click("loc=css:[data-testid=erd-canvas-host]"); await a.keyboard.press("Control+f"); await a.waitForTimeout(500);
console.log("캔버스 초점 Ctrl+F", await open("erd-find-widget")); await a.keyboard.press("Escape");
EOF
```
Expected: 네 키 모두 `false → true` 다(Ctrl+K·T 는 `erd-find-widget`, Alt+O·Ctrl+O 는 `erd-column-jump`). 캔버스 초점의 Ctrl+F 도 `true` 다(S2-27). `rec ui.keys "CDP 입력: Ctrl+K <열림>, Ctrl+T <열림>, Alt+O <열림>, Ctrl+O <열림>, 캔버스 Ctrl+F <열림>. Chrome 의 Ctrl/⌘+T·O 가로채기는 자동으로 확인할 수 없어 사람 확인 항목(아침 보고의 사용자 확인 목록)"`.

6-8. CLI 스모크(스펙 시험 7). 기본 시험 실행, `--apply`, 충돌, 사용 오류, 빈 되돌리기(S2-24), `dryRun` 무흔적(Review Focus 3)을 본다. 기본 시험 실행도 서버가 편집자 검사를 하므로 `ERD_USER` 는 공동 편집자(`erd-mcp-b`)로 준다(README CLI 절. 기본 사용자 `erd-mcp` 면 NOT_EDITOR 다).

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
C7="$(tgt .T2.phys).$(tgt .C7.phys)"; R=$(rv); RW=$(v | jq .data.result.rowVersion)
L0=$(echo "select count(*) from TB_MDM_ERD_CMD_LOG where ERD_MODEL_ID='mcm';" | sq | tr -d ' ')
echo "{\"modelId\":\"mcm\",\"baseRev\":$R,\"commands\":[{\"op\":\"updateColumn\",\"id\":\"$C7\",\"set\":{\"comment\":\"CLI 주석\"}}]}" > "$CLOSE/cli-batch.json"
ERD_USER=erd-mcp-b node scripts/erd/erd-cli.mjs apply --model mcm --file "$CLOSE/cli-batch.json"; echo exit=$?
echo "dry 뒤 rev=$(rv)(전 $R) rowVersion=$(v | jq .data.result.rowVersion)(전 $RW) log=$(echo "select count(*) from TB_MDM_ERD_CMD_LOG where ERD_MODEL_ID='mcm';" | sq | tr -d ' ')(전 $L0)"
node scripts/erd/erd-cli.mjs apply --model mcm --file "$CLOSE/cli-batch.json" --apply; echo "apply 사용자 없음 exit=$?"
ERD_USER=erd-mcp-b node scripts/erd/erd-cli.mjs apply --model mcm --file "$CLOSE/cli-batch.json" --apply --session cli-close; echo exit=$?
RC=$(rv); deltas $R
ERD_USER=erd-mcp-a node scripts/erd/erd-cli.mjs apply --model mcm --file "$CLOSE/cli-batch.json" --apply --session cli-close-2; echo "충돌 exit=$?"
ERD_USER=erd-mcp-b node scripts/erd/erd-cli.mjs undo --model mcm --rev $RC --apply --session cli-close; echo "되돌리기 exit=$?"
ERD_USER=erd-mcp-b node scripts/erd/erd-cli.mjs undo --model mcm --rev $RC --apply --session cli-close; echo "다시 되돌리기 exit=$?"
node scripts/erd/erd-cli.mjs apply --model mcm; echo "사용 오류 exit=$?"
awk '$1=="change"' "$CLOSE/sse-probe.txt" | tail -4 | cut -c1-120
```
Expected:
- 첫 실행은 첫 줄이 `시험 실행(저장 안 함) · 통과` 이고 `exit=0` 이다. rev·rowVersion·명령 기록 수가 모두 그대로다. SSE 감시에도 그 사이 `change` 가 없다.
- 사용자 없는 `--apply` 는 `exit=2` 다. `ERD_USER` 를 준 `--apply` 는 `exit=0` 이고 델타 하나(`erd-mcp-b cli-close CLI`)가 생긴다.
- 같은 baseRev 로 다른 세션이 보내면 `CONFLICT` 이고 `exit=1` 이다.
- 첫 되돌리기는 `exit=0` 이다. 다시 되돌리기는 `INVALID`("되돌릴 변경이 없습니다…")이고 `exit=1` 이다. 인자 없는 `apply` 는 `exit=2` 다.
- `rec cli.smoke "dry-run 무흔적(rev·rowVersion·log·SSE 불변), --apply 사용자 필수(2), 반영 0, CONFLICT 1, 빈 되돌리기 INVALID 1, 사용 오류 2"`.

6-9. 레인이 넘긴 브라우저 확인 항목과 조정자가 정한 마감 확인 항목. happy-dom 으로 시험하지 못해 레인이 Task 16 으로 넘긴 것이다. 같은 DRAFT 에서 p1(admin)으로 하나씩 보고, 항목마다 `rec ui.check.<이름> "<통과|실패|확인 못함> — <관찰>"` 로 적는다. 실패는 결함 규칙(위)으로 간다. 확인 못한 항목은 사유와 함께 deferred 새 행 후보로 둔다. 바꾼 표·컬럼은 기존 TYPE·DOMAIN·MISS 컬럼이 아니어야 한다(7-1). 만든 것(새 표·관계·다이어그램)은 끝에 화면 Ctrl+Z 나 변경 기록 되돌리기로 지운다.
- FE2(05 Task 13 Step 18 의 1~6): 표 끌기 → 다른 창 반영, 관계 도구 4(누르기·끌기)와 이름 겹침 창 `erd-clash-reuse`, Alt+Delete(`erd-delete-confirm`) 뒤 Ctrl+Z 로 표·컬럼·관계 복귀, [자동 배치](`erd-tool-layout`) 뒤 화면 맞춤, Claude `claimTable` 표의 "작업 중" 이름표(`erd-tag-<세션>` 의 `data-claimed`)와 `releaseTable` 뒤 사라짐, Ctrl/⌘+↑·↓·Alt+↑·↓ 부모·자식 이동.
- FE2 마법사(`erd-diagram-new` → `erd-wiz*`): 같은 업무영역·이름을 화면이 막는지 보고, 서버도 막는지 HTTP 로 본다. `erd save` 에 `[{op:"addDiagram",id:"d-close-dup",areaName:<있는 업무영역>,diagramName:<있는 이름>,sortSeq:99}]` 를 보내 결과를 적는다(반영되면 그 rev 를 `erd restore` 로 되돌리고 deferred 새 행 후보로 둔다).
- FE3(06 Task 14 Step 10·Task 15 Step 5): 칸 편집 방법(더블클릭·F2), 행 끌기 → `moveColumn`(델타 확인), Chrome 에서 Ctrl+Enter·Ctrl+Shift+Enter 가 그리드 칸에서 먹는지, 오른쪽 칸 400px 에서 가로 스크롤 없음(`.erd-area-grid .ag-body-viewport` 의 `scrollWidth - clientWidth` 가 0), 입력 칸이 그리드에 가리지 않음.
- FE3 도메인 찾기: `erd-grid-domain-find` 로 찾기 창(`erd-grid-domain-box`)이 열리고 목록이 오는지 본다(`ruleEdit search(DOMAIN)` 권한, 06 계획 작성자 메모). 막히면 [추천](`erd-grid-recommend`)만 남는다고 적는다.
- 서버 빈 칸(02 계획 작성자 메모): OASIS 응답이 null 칸(`rowVersion`·`rejection`·`summary`)을 빼고 보내도 화면이 null 로 읽는지 본다. 6-5 의 노드 끌기(다이어그램 명령, `rowVersion` null) 뒤 `erd-message`·`erd-notice` 에 오류가 없고 `erd-rev` 가 따라온 것으로 판정한다. `erd save` 응답의 `data.result` 에서 `rowVersion` 키가 빠지는지도 `jq 'has("rowVersion")'` 로 적는다.

---

- [ ] **Step 7: 확정 검사(D19)와 두 번째 확정 — 화면에서 소유자가 한다**

7-1. 확정을 막는 컬럼을 하나 더한다. TYPE 은 같은 물리명의 타입이 둘 이상이면 늘 생긴다(`ErdStandardJudge`). 그래서 D19.phys 를 다른 타입으로 D19.table 에 더한다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
P=$(tgt .D19.phys); T=$(tgt .D19.table); L=$(tgt '.D19.srcLen // 10'); NL=$((L + 7))
erd save "$(jq -nc --argjson b "$(rv)" --arg t "$T" --arg p "$P" --argjson n $NL '{modelId:"mcm",baseRev:$b,session:"close-d19",source:"CLI",commandsJson:([{op:"addColumn",id:"c-close-d19",table:$t,phys:$p,logical:"마감확정막힘",dataType:"VARCHAR2",length:$n}]|tojson)}')" | jq -c '{applied:.data.result.applied, rev:.data.result.rev, rowVersion:.data.result.rowVersion}'
erd view '{"modelId":"mcm","kind":"STATUS"}' | jq -r '.data.result.statuses["c-close-d19"]'
erd validate '{"modelId":"mcm"}' | jq -c '{errors:[.data.result.errors[] | {code, itemKey}], warnings:(.data.result.warnings|length)}'
```
Expected: `applied:true`, 상태 `TYPE`, `errors` 가 `c-close-d19` 하나다. `errors` 에 다른 컬럼이 있으면 공동 편집이 기존 위반 컬럼을 건드린 것이다. 그 컬럼을 바꾼 rev 를 `deltas` 로 찾아 `erd restore` 로 되돌리고, `rec plan.defect.coeditTouchedBlocking "<컬럼>"` 으로 적는다.

7-2. 화면에서 확정을 시도한다(p1, admin). 버전 막대 확정 단추는 `erd-ver-confirm`, 대화상자는 `erd-confirm-dialog`(포털)다. 적용 시작 칸 `erd-confirm-apply-from` 은 대화상자를 연 시각이 기본값이다. 그대로 둔다(지난 시각이라 8-1 의 `copy` 가 막히지 않는다).

```bash
SPACE_ID=<id> ego-browser nodejs <<'EOF'
const task = await taskSpace(Number(process.env.SPACE_ID));
const a = task.page("p1");
const t = (id) => a.evaluate((x) => document.querySelector(`[data-testid=${x}]`)?.textContent ?? null, id);
const groups = (prefix) => a.evaluate((p) => [...document.querySelectorAll(`[data-testid^=${p}]`)].map((e) => [e.getAttribute("data-testid"), e.textContent.slice(0, 200)]), prefix);
await a.click("loc=css:[data-testid=erd-ver-confirm]");
await a.waitForFunction(() => !!document.querySelector("[data-testid=erd-confirm-summary]"), undefined, { timeout: 60000 });
console.log("요약", await t("erd-confirm-summary"));
console.log("오류 묶음", JSON.stringify(await groups("erd-confirm-errors-")));
console.log("경고 묶음", JSON.stringify(await groups("erd-confirm-warnings-")));
if (await a.evaluate(() => !!document.querySelector("[data-testid=erd-confirm-ack] input"))) await a.click("loc=css:[data-testid=erd-confirm-ack] input");
const blocked = await a.evaluate(() => !!document.querySelector("[data-testid=erd-confirm-send]")?.disabled);
console.log("확정 단추 막힘", blocked);
if (!blocked) { await a.click("loc=css:[data-testid=erd-confirm-send]"); await a.waitForTimeout(3000); }
console.log("대화상자 오류", await t("erd-confirm-error"));
await a.click("loc=css:[data-testid=erd-confirm-cancel]");
EOF
```

Expected: 대화상자가 검사 결과를 코드별 수로 묶고, 코드마다 처음 50건까지만 보인다(S2-28). 오류 칸에 `c-close-d19` 의 표·컬럼 이름이 있다. 확정 단추가 오류 때문에 막혀 있거나, 눌렀으면 MDM010("확정 검사를 통과하지 못했습니다")이 `erd-confirm-error` 에 보인다. 서버 상태는 DRAFT 그대로다(`v | jq .data.result.status`). `rec confirm.block "MDM010, 오류 c-close-d19 1건, 대화상자 코드별 묶음 <코드:수 …>"`.

7-3. 막힌 명령을 화면의 변경 기록에서 되돌린다. 변경 기록 탭(`erd-tab-history`)을 열고 `erd-history-reload` 로 다시 읽은 뒤, `close-d19` 의 rev(7-1 의 `save` 결과) 행에서 [되돌리기] `erd-undo-<rev>` 를 누른다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
erd validate '{"modelId":"mcm"}' | jq -c '{errors:(.data.result.errors|length)}'; deltas $(( $(rv) - 1 ))
```
Expected: `errors:0`. 마지막 델타가 admin·UI 의 되돌리기이고 `c-close-d19` 가 delete 다.

7-4. 화면에서 다시 확정한다. Claude·사람 B 가 그 사이 ROW_VERSION 을 올렸지만 화면은 `version`·`change` 의 `rowVersion` 으로 따라왔으므로 MDM001 이 나오면 안 된다(deferred 39). p2 가 새로 고침 없이 확정 상태를 받는지도 본다.

```bash
SPACE_ID=<id> ego-browser nodejs <<'EOF'
const task = await taskSpace(Number(process.env.SPACE_ID));
const a = task.page("p1"), b = task.page("p2");
const before = await b.evaluate(() => document.querySelector("[data-testid=erd-ver]")?.textContent);
console.log("B 전", before);
await a.click("loc=css:[data-testid=erd-ver-confirm]");
await a.waitForFunction(() => !!document.querySelector("[data-testid=erd-confirm-summary]"), undefined, { timeout: 60000 });
if (await a.evaluate(() => !!document.querySelector("[data-testid=erd-confirm-ack] input"))) await a.click("loc=css:[data-testid=erd-confirm-ack] input");
await a.click("loc=css:[data-testid=erd-confirm-send]");
await a.waitForFunction(() => !document.querySelector("[data-testid=erd-confirm-dialog]") || !!document.querySelector("[data-testid=erd-confirm-error]")?.textContent, undefined, { timeout: 30000 });
console.log("대화상자 오류", await a.evaluate(() => document.querySelector("[data-testid=erd-confirm-error]")?.textContent ?? null));
await b.waitForFunction((x) => document.querySelector("[data-testid=erd-ver]")?.textContent !== x, before, { timeout: 10000 });
console.log("B 뒤", await b.evaluate(() => document.querySelector("[data-testid=erd-ver]")?.textContent),
  "띠", await b.evaluate(() => document.querySelector("[data-testid=erd-banner-readonly]")?.textContent));
EOF
```
"대화상자 오류" 가 null 이 아니면(MDM001 등) 결함 규칙으로 간다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
erd search '{}' | jq -c '[.. | objects | select(has("modelId") and .modelId=="mcm")][0]'
awk '$1=="version"' "$CLOSE/sse-probe.txt" | tail -2 | cut -c1-200
```
Expected: 확정이 한 번에 통과한다(MDM001 없음). 서버 버전 상태가 RELEASED 이고 SSE 감시에 `version` `CONFIRM` 이 있다. p2 는 새로 고침 없이 확정 상태와 읽기 전용 띠("확정된 버전이라 모델을 고칠 수 없습니다…")를 보인다. `rec confirm.second "화면 확정 통과(MDM001 없음), B 창 version 반영, 대화상자 경고 <코드:수>"`.

---

- [ ] **Step 8: 다시 가져오기 반영 (APPLY_DIFF, 화면)**

8-1. 새 DRAFT 를 만들고 모델에서 차이를 만든다. DB 는 고치지 않는다. 이 DRAFT 는 확정하지 않는다. 첫 확정과 같은 이유로 7-4 의 적용 시각이 지나 있어야 `copy` 가 된다(화면이 미래 시각을 보냈으면 MDM006 이다. 그 값을 기록하고 지날 때까지 기다린다).

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
erd copy '{"modelId":"mcm","verKind":"MINOR"}' | jq -c '{code:.meta.code, r:.data.result}'; v | jq -c '.data.result | {ver,status,ownerId}'
v > "$CLOSE/model2.json"
jq -c --slurpfile t "$CLOSE/targets.json" '.data.result.model | fromjson | . as $M | ($t[0] | [.T1.id,.T2.id,.D19.table]) as $used
  | ([$M.tables | to_entries[] | select(.key as $k | $used | index($k) | not)] | sort_by(.value.phys)) as $rest
  | ([$M.relations[] | .child, .parent] | group_by(.) | map({(.[0]): length}) | add // {}) as $rc
  | ([$rest[] | select(($rc[.key] // 0) == 0)][0]) as $d
  | {del:{id:$d.key, phys:$d.value.phys},
     chg:([$rest[] | .value.columnOrder[] | select($M.columns[.].dataType=="VARCHAR2" and $M.columns[.].length != null)] | map(select($M.columns[.].table != $d.key)) | .[0] | {id:., phys:"\($M.tables[$M.columns[.].table].phys).\($M.columns[.].phys)", length:$M.columns[.].length})}' "$CLOSE/model2.json" | tee "$CLOSE/diff-targets.json"
D=$(jq -r .del.id "$CLOSE/diff-targets.json"); C=$(jq -r .chg.id "$CLOSE/diff-targets.json"); N=$(( $(jq -r .chg.length "$CLOSE/diff-targets.json") + 1 ))
erd save "$(jq -nc --argjson b "$(rv)" --arg d "$D" --arg c "$C" --argjson n $N '{modelId:"mcm",baseRev:$b,session:"close-diff",source:"CLI",commandsJson:([{op:"updateColumn",id:$c,set:{length:$n}},{op:"deleteTable",id:$d}]|tojson)}')" | jq -c '{applied:.data.result.applied, rev:.data.result.rev}'
erd compare '{"modelId":"mcm","kind":"DB_DIFF"}' | jq -c '[.data.result.items[].id]'
```
Expected: 새 DRAFT 의 소유자가 admin 이다(null 이면 3-3 처럼 선점). `del.id` 가 null 이 아니다(관계가 하나도 없는 표다. 지운 표가 DB FK 의 부모면 `FK_ADDED` 가 더 생기고 8-2 의 "DB_DIFF 0" 이 깨진다. 관계 없는 표가 없으면 멈추고 기록한 뒤, `FK_ADDED` 까지 세 종류를 모두 골라 반영하는 것으로 바꾼다). 차이 항목이 정확히 `COLUMN_CHANGED:<chg.phys>` 와 `TABLE_ADDED:<del.phys>` 두 개다.

8-2. 화면(p1)에서 고르고 반영한다. `copy` 의 `reload` 로 화면이 모델을 다시 읽었는지 먼저 본다(`erd-ver` 가 새 ver). 차이 탭(`erd-tab-diff`)을 열고, 두 항목의 고르기 칸 `[data-testid=erd-diff-apply] .ag-row[row-id="<항목 id>"] .ag-selection-checkbox input` 을 누른다(항목 id 는 8-1 의 `compare` 출력). 안내 줄 `erd-diff-apply-note` 가 "고른 2건: …" 인지 보고 `erd-diff-apply-run` 을 누른다. 결과 요약 `erd-diff-apply-result` 글을 출력한다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
deltas $(( $(rv) - 1 )); lastrv; erd compare '{"modelId":"mcm","kind":"DB_DIFF"}' | jq -c '[.data.result.items[].id]'
v | jq -c --arg p "$(jq -r .del.phys "$CLOSE/diff-targets.json")" --arg old "$(jq -r .del.id "$CLOSE/diff-targets.json")" '.data.result.model | fromjson | [.tables | to_entries[] | select(.value.phys==$p) | {id:.key, same:(.key==$old), cols:(.value.columnOrder|length)}]'
colv "$(jq -r .chg.id "$CLOSE/diff-targets.json")" length
```
Expected: 마지막 델타가 admin·UI 다. `lastrv` 의 `rowVersion` 이 수다. `erd-diff-apply-result` 가 "rev <n> 에 2건을 반영했습니다 — 표 추가 1 · 컬럼 바뀜 1" 이다. DB_DIFF 가 `[]` 다. 다시 생긴 표는 새 id(`same:false`)이고 컬럼이 모두 있다. 컬럼 길이가 원래 값으로 돌아왔다. `rec diff.apply "화면 반영 2항목(COLUMN_CHANGED·TABLE_ADDED), 요약 <글>, DB_DIFF 0, 새 표 id"`.

8-3. 낡은 항목 id 거절(Review Focus 5 의 실제 서버 확인).

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
R=$(rv); erd import "{\"modelId\":\"mcm\",\"kind\":\"APPLY_DIFF\",\"baseRev\":$R,\"session\":\"close-diff\",\"source\":\"CLI\",\"itemsJson\":\"[\\\"COLUMN_ADDED:TB_X.Y\\\"]\"}" | jq -c '.data.result | {applied, code:.rejection.code, choices:.rejection.choices, summary}'
echo "rev 전=$R 후=$(rv)"
```
Expected: `applied:false`, `code:"INVALID"`, `choices:["COLUMN_ADDED:TB_X.Y"]`, `summary:null`, rev 그대로. `rec diff.stale "INVALID, rev 불변"`.

---

- [ ] **Step 9: MCP 결과 크기 (S2-21) — 8 의 DRAFT 에서**

9-0. 브라우저 작업 공간을 먼저 닫는다. 9-2 의 저장 500번이 열린 창마다 `change` 500개를 보내 구독 큐(256)가 넘치면 화면이 다시 읽기를 되풀이한다.

```bash
SPACE_ID=<id> ego-browser nodejs <<'EOF'
const task = await taskSpace(Number(process.env.SPACE_ID));
await task.finish({ keep: [] });
console.log("닫음");
EOF
```

이 DRAFT 는 확정하지 않으므로 컬럼을 고쳐도 된다. 쓰기 결과 글은 `WRITE_TEXT_LIMIT` 25,000자를 넘지 않아야 하고, Claude Code 가 결과를 파일로 빼면(`Output too large`) 안 된다. ERD_USER 는 이 DRAFT 의 소유자 admin 이다.

9-1. 200건 `apply` 의 결과 글. LLM 이 200건을 그대로 옮기기 어렵다. 그래서 MCP SDK 클라이언트로 같은 도구를 직접 부른다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
cat > "$CLOSE/mcp-call.mjs" <<'EOF'
// node mcp-call.mjs <도구> <인자 JSON 파일> : erd-mcp.mjs 를 stdio 로 띄워 도구 하나를 부르고 결과 글 크기를 낸다.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync } from "node:fs";
const [, , tool, argFile] = process.argv;
const transport = new StdioClientTransport({ command: process.execPath, args: ["scripts/erd/erd-mcp.mjs"],
  env: { ...process.env, ERD_USER: "admin", ERD_SESSION: "claude-size" }, stderr: "ignore" });
const client = new Client({ name: "close-size", version: "0.0.0" });
await client.connect(transport);
const r = await client.callTool({ name: tool, arguments: JSON.parse(readFileSync(argFile, "utf8")) });
const text = r.content.map((c) => c.text ?? "").join("\n");
const lines = text.split("\n");
console.log(JSON.stringify({ isError: !!r.isError, chars: text.length, bytes: Buffer.byteLength(text), lines: lines.length, first: lines[0], last: lines.slice(-2) }));
await client.close();
EOF
v | jq -c '.data.result as $r | ($r.model | fromjson) as $M | {modelId:"mcm", baseRev:$r.rev,
  commands:([$M.columns | keys[]][0:200] | to_entries | map({op:"updateColumn", id:.value, set:{comment:"마감 크기 시험 한글 주석 \(.key) — 표준 용어와 도메인 확인용"}}) | tojson)}' > "$CLOSE/apply200.json"
node "$CLOSE/mcp-call.mjs" apply "$CLOSE/apply200.json"
```
Expected: `isError:false`, `chars` ≤ 25000, 첫 줄 `반영 rev …`, 끝 줄에 `다음 baseRev:` 가 있다(잘렸으면 그 앞에 `… n줄 더 있습니다` 줄). `rec size.apply200 "<chars>자·<bytes>B·<lines>줄, 잘림 <있음|없음>"`.

9-2. 델타 500건 `getChangesSince`. 다이어그램 이동 500번으로 rev 500개를 만든다(사전 적재가 없어 빠르다).

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
R0=$(rv); DG=$(v | jq -r '.data.result.nodes[0].diagram'); TB=$(v | jq -r '.data.result.nodes[0].table'); b=$R0; t0=$(date +%s)
for i in $(seq 1 500); do
  b=$(erd save "$(jq -nc --argjson b $b --arg d "$DG" --arg t "$TB" --argjson x $((i % 40 * 10)) '{modelId:"mcm",baseRev:$b,session:"close-size",source:"CLI",commandsJson:([{op:"moveNodes",diagram:$d,nodes:[{table:$t,x:$x,y:20}]}]|tojson)}')" | jq -r '.data.result.rev')
done; echo "rev $R0 → $b, 초=$(( $(date +%s) - t0 ))"
erd view "{\"modelId\":\"mcm\",\"sinceRev\":$R0}" | jq -c '.data.result | {reload, n:(.deltas|length)}'
cl size-changes admin claude-size "getChangesSince" 5 "getChangesSince(modelId=mcm, rev=$R0) 를 한 번 불러라. 결과의 첫 줄과 마지막 줄을 그대로 옮겨라."
```
Expected: rev 가 500 올랐고 `reload:false, n:500` 이다(500건이 reload 로 넘어가면 499 로 다시 하고 기록한다). `clshow` 의 결과 글자 수 ≤ 25000, `파일로 빠짐 0`. `rec size.changes500 "<글자 수>자, 파일로 빠짐 0, 루프 <초>초"`.

9-3. 한글이 많은 거절 글. 컬럼 주석을 한글 24,000자로 바꾼 뒤, 다른 세션이 낡은 baseRev 로 같은 속성을 보내 CONFLICT 를 받게 한다. 거절 글의 "지금 값" 이 상한을 시험한다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && . tmp/erd-close2/env.sh
node -e 'process.stdout.write("가나다라마바사아자차카타파하".repeat(2000).slice(0, 24000))' > "$CLOSE/long-ko.txt"
CL=$(v | jq -r '.data.result.model | fromjson | .columns | keys[0]'); RB=$(rv)
erd save "$(jq -nc --argjson b $RB --arg c "$CL" --rawfile k "$CLOSE/long-ko.txt" '{modelId:"mcm",baseRev:$b,session:"close-long",source:"CLI",commandsJson:([{op:"updateColumn",id:$c,set:{comment:$k}}]|tojson)}')" | jq -c '{applied:.data.result.applied, rev:.data.result.rev}'
cl size-reject admin claude-size "apply" 5 "apply 를 한 번만 불러라. modelId=mcm, baseRev=$RB, commands=[{\"op\":\"updateColumn\",\"id\":\"$CL\",\"set\":{\"comment\":\"짧은 값\"}}]. 거절되어도 다시 보내지 말고 결과 첫 줄만 옮겨라."
```
Expected: 거절 `CONFLICT`, 결과 글자 수 ≤ 25000, `파일로 빠짐 0`. 파일로 빠지면 글자 수 상한이 한글 글에 넉넉하지 않다는 뜻이다(S2-21 의 토큰 기준 우려). 결함이 아니라 측정값으로 적고 deferred 새 행 후보로 둔다. `rec size.koreanReject "<글자 수>자, 파일로 빠짐 <0|1>"`.

---

- [ ] **Step 10: 정리 — 브라우저, 감시 연결, 서버, 복제 PDB**

10-1. 브라우저 작업 공간은 Step 9 앞(9-0)에서 이미 닫았다.

10-2. SSE 감시 연결(3-1 의 백그라운드 curl)을 그 Bash 작업 id 로 멈춘다(`TaskStop`). 이 워크트리의 be-run·fe-run 은 각 백그라운드 작업을 멈춰 내린다. 네 포트가 비었는지 본다: `lsof -nP -iTCP:8096 -iTCP:8100 -iTCP:8191 -iTCP:5100 -sTCP:LISTEN`. 남은 리스너가 있으면 그 cwd 가 이 워크트리일 때만 그 PID 를 `kill -TERM` 한다.

10-3. 복제 PDB 를 닫는다(지우지 않는다).

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close && node scripts/oracle/pdb.mjs close L_ERD2C && node scripts/oracle/pdb.mjs list | tail -1
```
Expected: `열린 PDB(시드 제외) 2 / 상한 3`.

10-4. 사용자 서버를 메인 체크아웃에서 되살린다. `user-servers.txt` 의 명령줄과 다르면 기록된 명령을 쓴다. 이 세션이 끝나도 살아 있게 `nohup` 으로 띄운다.

```bash
cd /Users/jji/project/dmes-standard && mkdir -p ~/.coord/erd-stage2-1011
nohup ./be-run.sh --mcm --mdm --analog --pdb=L_MAIN > ~/.coord/erd-stage2-1011/restore-be.log 2>&1 &
cd /Users/jji/project/dmes-standard/src/frontend && nohup pnpm dev > ~/.coord/erd-stage2-1011/restore-fe.log 2>&1 &
```
`Monitor` 로 네 포트(8096·8100·8191·5100)가 열릴 때까지 기다린다. 각 리스너 cwd 가 메인 체크아웃(`/Users/jji/project/dmes-standard/...`)인지 2-1 의 `lsof -a -p <pid> -d cwd -Fn` 으로 본다. `rec env.restore "메인 체크아웃 be-run(--mcm --mdm --analog --pdb=L_MAIN)·pnpm dev 복원, 4포트 확인"`. 조정 세션에 서버를 되살렸다고 알린다.

---

- [ ] **Step 11: 문서**

문서의 수치는 모두 `tmp/erd-close2/results.tsv` 에서 옮긴다. 이 파일에 없는 값은 쓰지 않는다. 먼저 `cat tmp/erd-close2/results.tsv` 로 전체를 읽는다.

11-1. 스펙 5절 표에 "단계 2 결과" 열을, 7절 표 뒤에 단계 2 확인 결과를 넣는다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close
node --input-type=module - <<'EOF'
import { readFileSync, writeFileSync } from "node:fs";
const R = new Map(readFileSync("tmp/erd-close2/results.tsv", "utf8").split("\n").filter(Boolean).map((l) => [l.split("\t")[0], l.split("\t").slice(1).join("\t")]));
const need = (k) => { if (!R.has(k)) throw new Error("results.tsv 에 " + k + " 가 없다"); return R.get(k); };
const cells = [
  ["포털(Next.js BFF)을 거쳐 SSE", `L_ERD2C(TPL_DATA 복제)에서 브라우저 두 창과 Claude 세션 2개가 함께 썼다. 사람 B 편집이 A 창에 반영: ${need("ui.humanEdit")}. 버전 이벤트(\`version\`): ${need("sse.version")}.`],
  ["다른 스키마를 읽을 권한", "단계 2 에서 다시 보지 않았다. deferred 17번에 남는다."],
  ["표준 검사기의 일괄 판정 시간", `L_ERD2C 의 \`view kind=STATUS\`: ${need("status.mcm2")}. 도메인 타입 대응을 한 곳(\`ErdTypeMapping\`)으로 옮긴 뒤 값이다.`],
  ["MDM 서버를 여러 대로", "확인하지 않았다. MCP·CLI 의 시한 접속자 항목(S2-11)도 서버 메모리의 `ErdEventHub` 에 있다."],
  ["`getModelText` 형식의 정확도", `쓰기 결과 상한(S2-21): 200건 apply ${need("size.apply200")}. 델타 500건 getChangesSince ${need("size.changes500")}. 한글 거절 글 ${need("size.koreanReject")}.`],
];
const path = "docs/superpowers/specs/2026-10-10-erd-tool-design.md";
const lines = readFileSync(path, "utf8").split("\n");
const h = lines.findIndex((l) => l.startsWith("| 항목 | 확인 방법 |"));
if (h < 0 || lines[h].includes("단계 2 결과")) throw new Error("5절 머리줄을 못 찾았거나 이미 열이 있다");
lines[h] += " 단계 2 결과 |"; lines[h + 1] += "---|";
let n = 0;
for (let i = h + 2; i < lines.length && lines[i].startsWith("|"); i++) {
  const c = cells.find(([key]) => lines[i].startsWith("| " + key));
  if (!c) throw new Error("행을 못 찾았다: " + lines[i].slice(0, 30));
  lines[i] += " " + c[1].replace(/\|/g, "\\|") + " |"; n++;
}
if (n !== cells.length) throw new Error("행 수 불일치 " + n);
const at = lines.findIndex((l) => l.startsWith("단계마다 함께 할 일:"));
if (at < 0) throw new Error("7절의 \"단계마다 함께 할 일:\" 줄을 못 찾았다");
lines.splice(at, 0, `단계 2 완료 확인(${need("env.pdb")}): 사람 2명(${need("env.cookieSplit")})과 Claude 세션 2개(${need("mcp.sessionAuto")})가 한 DRAFT 를 함께 고쳤다. 충돌: ${need("mcp.conflict")}. 다른 속성: ${need("mcp.merge")}. 화면 충돌 알림: ${need("ui.notice")}. 되돌리기: ${need("mcp.undoOk")} / ${need("mcp.undoConflict")}. 작업 중 표시: ${need("mcp.claim")}. 확정 검사(D19): ${need("confirm.block")}. 확정: ${need("confirm.second")}. 다시 가져오기 반영: ${need("diff.apply")}. 시험 7(CLI): ${need("cli.smoke")}. 시험 8·9: ${need("test.focus")}, ${need("ui.presence")}.`, "");
writeFileSync(path, lines.join("\n"));
console.log("갱신한 행", n);
EOF
```
Expected: `갱신한 행 5`. "results.tsv 에 … 가 없다" 로 멈추면 그 Step 의 `rec` 를 빠뜨린 것이다. 7절의 완료 기준 칸은 고치지 않는다.

11-2. 기능설계서 끝에 6절을 붙인다. 중괄호 자리는 `results.tsv` 의 같은 키 값으로 바꾼다.

```markdown

## 6. 단계 2 — 편집·동시 편집

- 쓰기: `save`(명령 묶음)·`restore`(되돌리기)에 `dryRun` 이 있다. 결과와 SSE `change` 에 `rowVersion` 이 있다. 바뀐 것이 없는 되돌리기는 INVALID 다.
- 버전 이벤트: SSE `version`(SUBSCRIBE·CONFIRM·LOCK·UNLOCK·HANDOVER·ADD_EDITOR·REMOVE_EDITOR). `copy`·DRAFT 삭제는 `reload` 다.
- 접속자: MCP·CLI 요청은 600초 시한 항목으로 보인다. `selectedTables` 는 마지막 쓰기가 건드린 표와 작업 중 표시 표다.
- 충돌·삭제 거절에 `byUserId` 가 있다. `execute kind=CLAIM` 은 쥔 세션·사용자·만료 시각을 돌려준다.
- 다시 가져오기 반영: `import kind=APPLY_DIFF`(`itemsJson` = `compare kind=DB_DIFF` 의 항목 id). 낡은 id 가 있으면 INVALID 다.
- 화면: 캔버스 편집(끌기·표 추가·관계 도구·Delete/Alt+Delete·자동 배치·마법사), 그리드 편집(논리명 미리보기·토막 고르기·도메인 적용), 버전 막대·확정 대화상자·공동 편집자 관리, 알림 막대·변경 기록 되돌리기·Ctrl+Z.
- Claude: MCP 쓰기 도구 6개(`apply`·`confirmRelation`·`rejectRelation`·`undo`·`claimTable`·`releaseTable`), CLI `scripts/erd/erd-cli.mjs`(기본 시험 실행).
- 마감 확인(L_ERD2C, 2026-10-1x): {mcp.conflict}. {ui.notice}. {confirm.second}. {diff.apply}.
```

11-3. `docs/erd-tool/deferred.md` 의 "처리" 칸을 채운다. 해시는 쓰지 않고 `erd-stage2 Task N` 을 쓴다(squash 로 해시가 바뀐다). 이미 채운 칸(27 등)은 건드리지 않는다. 조건부 행은 증거 명령이 참일 때만 채운다.

| # | 처리 칸 | 채우는 조건(증거) |
|---|---|---|
| 27 | 이미 채워져 있어야 한다(erd-stage2-pre). 비었으면 `/usr/bin/git log dev --format=%h --grep '저장·복원 연결 2개 점유 교착' -1` 의 해시 | `grep -n '^| 27 |' docs/erd-tool/deferred.md` 의 처리 칸 |
| 25 | `erd-stage2 Task 2·5 — touchedTables 로 CLAIMED 를 컬럼 삭제·관계·키까지 넓혔다` | `grep -n touchedTables src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/service/ErdCommandService.java` 가 CLAIMED 경고 부분에 있다 |
| 28 | `erd-stage2 Task 5 — deferred 27 수정이 덮었다(확인)` 또는 비움 | BE2 레인 보고(`~/.coord/erd-stage2-1011/lanes/*/reports.md`)에 28 확인 결과가 있다 |
| 29·30·31·32 | `erd-stage2 Task 2` | 1-6 의 lib 시험 통과 |
| 34 | `fff778c86` | 늘 채운다(S2-4) |
| 36 | `erd-stage2 Task 5 — 실패 경로 HTTP 시험` | `ErdEditOasisHttpTest` 에 Task 5 가 더한 실패 경로 시험이 있다 |
| 37 | `erd-stage2 Task 9 — 권한 문구(permissions.ts)` | `grep -n "소유자가 없어" src/frontend/m-mdm/pages/dma/erdEdit/state/permissions.ts` |
| 39 | `erd-stage2 Task 4 — rowVersion·SSE version, 마감에서 화면 확정 MDM001 없음` | `results.tsv` 의 `confirm.second` |
| 41 | 처리 칸은 비우고 근거 칸 끝에 `CLOB 부분: erd-stage2 Task 1(ErdTypeMapping)` | 1-6 의 `physicalOfRoundTripsThroughJudgeAndImport` |
| 42 | `erd-stage2 Task 1` | 같다 |
| 45 | `erd-stage2 Task 12 — react-flow dist export 시험` | 1-6 의 `rf=0` |
| 47 | `erd-stage2 Task 6·7 — 세션 이름 자동 결정` | `results.tsv` 의 `mcp.sessionAuto` |
| 51 | `erd-stage2 Task 3 — restore 가 candidateRank 를 찍지 않는다`(COLUMN_ID null 부분은 남으면 그대로 적는다) | BE1 레인 보고에 51 고침이 있다 |

새 절 `## 7. 단계 2 에서 미룬 것` 을 문서 끝에 더한다(표 머리는 6절과 같다, 번호는 52부터). 늘 더하는 행:
- 첫 확정 기준선(조사 B 안 A·B)과 두 번째 확정의 "바뀐 컬럼" 범위(주석·논리명만 바꿔도 막힘). 사용자 판단(S2-2).
- 되돌리기의 목록 단위 복원·같은 세션 통과(S2-5). 사용자 판단.
- 다른 모델을 가리키는 회색 참조 노드(D8)와 다시 하기(S2-25).
- `APPLY_DIFF` 로 들어온 새 표의 이름 규칙 추정, MCP `applyDbDiff` 도구.
- 넘기기(handover): 담당자 조회 어댑터가 없어 늘 MDM005 다. 단계 2 는 확인하지 않았다.
- Chrome 의 Ctrl/⌘+T·Ctrl+O 가로채기는 자동 확인이 안 됐다(`ui.keys`). 사람이 직접 눌러 확인한다(S2-8).

조건이 맞을 때만 더하는 행: `size.koreanReject` 가 파일로 빠졌다(한글 글 상한 낮추기), `defect.*` 중 이번 Task 에서 고치지 않은 것, `plan.defect.*`(다음 단계 마감 계획에 반영할 것), 1-4·1-5 에서 알려진 기존 실패 밖의 새 실패.

11-4. 계획 README 를 고친다. (a) "착수 전" 줄의 `deferred 27 수정 커밋(조정자가 머지 뒤 해시 기입)` 이 그대로 있으면 `/usr/bin/git log dev --format=%h --grep '저장·복원 연결 2개 점유 교착' -1` 의 해시로 바꾼다. (b) `## 뒤 단계 개요 — 단계 2 뒤에 남는 것` 바로 앞에 아래 절을 넣는다. 고정 행 4개 뒤에 조정 판정(`jq -r '.decisions[] | "\(.at)\t\(.lane)\t\(.q)\t\(.text)"' ~/.coord/erd-stage2-1011/state.json`)과 레인 보고(`~/.coord/erd-stage2-1011/lanes/*/reports.md`)를 한 행씩 옮긴다. 원장 없이 판정을 지어내지 않는다. 비슷한 작은 수정은 "수정 라운드에 넣은 작은 수정(요약)" 한 행으로 묶는다.

```markdown
## 단계 2 구현 결정

구현 중 검토와 마감 확인에서 나온 판정이다. 스펙 결정(D1~D20)과 "단계 2 에서 정한 점"(S2-1~S2-28)은 바꾸지 않았다. 출처는 조정 기록(decisions)과 레인 보고다. 마감 값은 L_ERD2C(TPL_DATA 복제, L_MAIN 아님)에서 쟀다.

| # | 결정 | 이유 | 틀렸을 때 비용 |
|---|---|---|---|
| 마감-복제 PDB | 마감 시험은 새 TPL_DATA 복제 L_ERD2C 에서 했다. 사람 계정은 e2e 픽스처 SQL 로 이 복제본에만 넣었다. | TPL_DATA 에는 로그인할 수 있는 사람이 admin 하나뿐이다(S2-9). L_MAIN 에는 쓰지 않는다. | L_MAIN 에서 다시 확인해야 한다. |
| 마감-두 사람 | {env.cookieSplit} | 두 번째 프로필은 사용자 승인이 필요하다(S2-9). | 대체 경로면 포털 RBAC 를 지나지 않았다. |
| 마감-확정 순서 | 가져오기 → 확정(경고 확인) → `copy` → 공동 편집 → 확정. 확정 검사: {confirm.block}. | S2-2(R8-1 유지). `confirm` 은 `applyFrom` 이 필수이고, 적용 시각이 미래면 `copy` 가 MDM006 이다. | 첫 DRAFT 에서는 D19 가 막지 않는다(deferred 새 행). |
| 마감-MCP 크기 | {size.apply200} / {size.changes500} / {size.koreanReject} | S2-21. | 상한을 넘으면 Claude 가 결과를 파일로만 받는다. |
| (조정 판정·레인 보고를 여기에 한 행씩) | | | |
```
마지막 줄은 자리 표시다. 실제 행으로 바꾸고, 판정이 없으면 지운다.

11-5. 자리 표시가 남지 않았는지 본다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close
grep -n "{[a-zA-Z0-9.]*}\|<n>\|<값>\|<ms>\|여기에 한 행씩\|조정자가 머지 뒤 해시 기입" docs/superpowers/specs/2026-10-10-erd-tool-design.md docs/erd-tool/deferred.md docs/mdm/screens/erdEdit/erdEdit_기능설계서.md docs/superpowers/plans/2026-10-11-erd-tool-stage2/README.md
```
Expected: 출력 없음.

---

- [ ] **Step 12: 커밋과 증거 보관**

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage2-close
/usr/bin/git status --short
/usr/bin/git add docs/superpowers/specs/2026-10-10-erd-tool-design.md docs/erd-tool/deferred.md docs/mdm/screens/erdEdit/erdEdit_기능설계서.md docs/superpowers/plans/2026-10-11-erd-tool-stage2/README.md
/usr/bin/git commit -m "$(cat <<'EOF'
docs(erd): 단계 2 마감 — 사람 2명·Claude 2세션 공동 편집·확정·MCP 크기 확인 결과 기록

스펙 5절에 단계 2 결과 열을, 7절에 단계 2 확인 결과를 더했다. deferred 처리
칸과 새 절(단계 2 에서 미룬 것), 계획 README 의 단계 2 구현 결정, 기능설계서
6절을 채웠다. 확인은 TPL_DATA 복제 L_ERD2C 에서 했다.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
)"
/usr/bin/git status --short
mkdir -p ~/.coord/erd-stage2-1011/t16-evidence && cp -R tmp/erd-close2/. ~/.coord/erd-stage2-1011/t16-evidence/
```
Expected: 커밋 하나가 생기고 `status` 가 깨끗하다. Step 1 에서 `fix(...)`·`chore(...)` 커밋이 생겼으면 함께, 조정 세션 허가 뒤 `node .claude/skills/_shared/node/squash-branch.mjs --onto dev --rebase` 로 하나로 합치고 메인 체크아웃에서 `--ff-only` 로 머지한다(push 금지). 머지 뒤 `git worktree remove ../dmes-standard-wt/erd-stage2-close`(`--force` 금지), `git branch -d erd-stage2-close`. 복제 PDB L_ERD2C 는 닫힌 채로 두고 지우지 않는다(지우기는 사용자 판단). 조정 세션 최종 보고에 `ui.keys` 의 사람 확인 항목을 넣는다.

---

## 계획 작성자 메모

- README 마감 순서 2 는 사용자 서버를 8096·8100·5100 으로 적었지만 실제 사용자 서버는 8191(analog)도 쓴다. 2-1 과 10-4 는 네 포트를 다룬다.
- `confirm` 은 `applyFrom`(`yyyy-MM-dd HH:mm:ss`)이 필수이고(`RuleConfirmService.parseApplyFrom`), 적용 시각이 미래인 RELEASED 가 있으면 `copy` 가 MDM006 이다(`ErdEditOasisHttpTest.confirmThenCopyNewVersion`). README 정본의 화면 함수 `confirmVersion(modelId, ver, rowVersion, warningsAcknowledged)` 에는 `applyFrom` 이 없다. 판정: README 정본 `confirmVersion` 에 `applyFrom` 을 더했고, FE1 Task 11 확정 대화상자가 연 시각을 기본값으로 보낸다(`erd-confirm-apply-from`).
- README 마감 순서 7 의 "표준에 맞지 않는 컬럼" 은 NEW·ALIAS 면 확정을 막지 않는다(`blocksConfirm` = TYPE·DOMAIN·MISS). 7-1 은 늘 TYPE 이 되는 방법(같은 물리명을 다른 타입으로 더하기)을 쓰고 STATUS 와 `validate` 로 확인한다.
- README 마감 순서에는 스펙 시험 7 의 "로컬 서버 스모크"(CLI 기본 시험 실행·`--apply`·CONFLICT)가 없다. 6-8 에 넣었다.
- CDP 로 보낸 키는 Chrome 자체 단축키를 거치지 않는다. S2-8 의 "Ctrl+T·Ctrl+O 가 실제로 막히는지" 는 자동으로 판정할 수 없어 사람 확인 항목으로 남긴다(6-7).
- 200건 `apply` 결과 크기는 LLM 대신 MCP SDK 클라이언트로 쟀다(9-1). LLM 이 200건을 그대로 옮기는 일이 믿을 만하지 않다. "파일로 빠지는가" 는 `claude -p` 로만 볼 수 있어 9-2·9-3 은 `claude -p` 로 했다.
- 단계 2 화면의 `data-testid` 는 FE 레인 계획이 정한다. 이 계획을 쓸 때 04~06 이 함께 쓰이고 있어 단계 1 의 testid 와 `snapshot` 확인 절차로 썼다. 정합 검토에서 04·05·06 의 정본 testid 표로 선택자를 바꿨다(0-4·6-5·6-6·6-7·7-2~7-4·8-2).
- 이 문서는 약 900줄로 작성 지시의 700줄 상한을 넘는다. 단계 1 마감(900줄)보다 확인 항목(사람 2명, Claude 2세션, CLI, D19, APPLY_DIFF, 크기)이 많다. 반복 코드는 `env.sh` 도우미로 모았다. Task 를 나누지 않은 것은 README 가 마감을 Task 하나로 정했기 때문이다.
- CLI 기본 시험 실행도 서버가 편집자 검사를 하므로 `ERD_USER` 가 편집자여야 "통과" 가 나온다(6-8). 기본 사용자 `erd-mcp` 로 돌리면 NOT_EDITOR 거절이다. README 의 "`--apply` 만 사용자 필수" 규칙과 어긋나지는 않지만 사용 안내에 적을 만하다.
