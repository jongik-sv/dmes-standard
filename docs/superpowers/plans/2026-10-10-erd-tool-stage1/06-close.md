# ERD 도구 단계 1 — Task 12: 마감

> 공통 제약(Global Constraints)·단계 1 에서 정한 점(S1~S17)·Review Focus·인터페이스는 [README](README.md) 에 있다. 이 문서의 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [05-scripts.md](05-scripts.md) · [README](README.md)

### Task 12: 단계 1 마감 — 전체 시험, 실제 가져오기, 브라우저·MCP 확인, 문서

세 레인(BE·FE·S)이 `erd-stage1` 브랜치에 합쳐진 뒤에 한다. 이 Task 는 코드를 거의 고치지 않는다. 확인하고, 재고, 결과를 문서에 적는다. 확인에서 결함이 나오면 그 자리에서 고치지 않고, 아래 "결함이 나왔을 때" 규칙을 따른다.

**Files:**
- Modify: `docs/superpowers/specs/2026-10-10-erd-tool-design.md` (5절 표에 "단계 1 결과" 열)
- Modify: `docs/erd-tool/deferred.md` ("처리" 칸, 새 미룬 항목)
- Modify: `docs/superpowers/plans/2026-10-10-erd-tool-stage1/README.md` ("단계 1 구현 결정" 절, Global Constraints 의 패키지 이름 오타)
- Modify: `docs/mdm/screens/erdEdit/erdEdit_기능설계서.md` (5절 "단계 1" 추가)
- 만들지만 커밋하지 않는 것: `tmp/erd-close/` (저장소 `.gitignore` 의 `/tmp/` 에 걸린다. 명령 기록장·응답·로그가 들어간다)

**Interfaces:**
- Consumes: Task 1~11 전부. OASIS `erdEdit` 의 `search`·`view`(`kind=STATUS`)·`reg`·`import`·`compare`(`kind=DB_DIFF`)·`save`·`execute`, SSE `/api/mdm/erd/stream/{modelId}`, 포털 경로 `/api/mdm/rest/erdEdit/view/api/mdm/erd/stream/{modelId}`, `.mcp.json` 의 `erd` 서버.
- Produces: 스펙 5절의 "단계 1 결과" 열, deferred.md 의 처리 기록, README 의 "단계 1 구현 결정" 절. 코드 산출물은 없다.

**결함이 나왔을 때:** 이 Task 의 확인 단계에서 이번 변경 때문에 생긴 결함이 나오면 이렇게 한다.
1. 결함 내용과 재현 명령을 `tmp/erd-close/results.tsv` 에 `defect.<번호>` 키로 적는다.
2. L_MAIN 에서 재현하지 않는다. 같은 입력을 시험 PDB(`-Pdmes.ora.test=clone`)의 자동 시험으로 재현하는 실패 시험을 먼저 쓴다.
3. 고친 뒤 해당 Task 의 시험과 이 Task 의 Step 1 을 다시 돈다. 수정은 원래 Task 의 파일을 고치는 별도 커밋(`fix(erd): …`)으로 둔다.
4. 3번에 해당하지 않는 것(측정 결과가 기대와 다름, 운영 환경 차이)은 결함이 아니다. 결과로 기록하고 deferred.md 에 새 행을 더한다.

---

- [ ] **Step 0: 작업 환경과 기록장**

0-1. 작업 위치와 상태를 확인한다. 워크트리 경로가 다르면 실제 경로로 바꿔 읽는다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1
/usr/bin/git status --short
/usr/bin/git log --oneline dev..HEAD
```
Expected: 작업 트리가 깨끗하고, `dev..HEAD` 에 Task 1~11 커밋이 보인다. 더럽거나 Task 가 빠졌으면 멈추고 조정 세션에 알린다.

0-2. 이번 작업 폴더와 명령 도우미를 만든다. 이후 모든 Bash 호출은 첫 줄에 `cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh` 를 둔다(호출마다 셸 상태가 사라진다).

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1
mkdir -p tmp/erd-close/truth tmp/erd-close/answers
cat > tmp/erd-close/env.sh <<'EOF'
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
export CLOSE="$PWD/tmp/erd-close"
export ERD_BASE=http://localhost:8096
export ERD_KEY=dmes-bff-local-client-key-2026
export ERD_USER=admin
export ERD_ROLE=MDM_STEWARD
# erd <action> '<params json>' : OASIS erdEdit 호출. 본문 전체를 stdout 으로 낸다.
erd() {
  curl -sS -m 180 -X POST "$ERD_BASE/api/mdm/oasis/erdEdit/$1" \
    -H 'Content-Type: application/json' -H "X-Client-Key: $ERD_KEY" \
    -H "X-Authenticated-User: $ERD_USER" -H "X-Authenticated-Role: $ERD_ROLE" \
    -d "{\"meta\":{\"menuId\":\"erdEdit\"},\"params\":$2}"
}
# rec <키> <값> : 결과 기록장에 한 줄 적는다. 문서 단계(Step 5)가 이 파일을 읽는다.
rec() { printf '%s\t%s\n' "$1" "$2" >> "$CLOSE/results.tsv"; echo "기록 $1"; }
# sum <JUnit XML…> : 시험 수·건너뜀·실패·오류 합계 한 줄.
sum() { grep -ho '<testsuite [^>]*' "$@" | sed -E 's/.*tests="([0-9]+)" skipped="([0-9]+)" failures="([0-9]+)" errors="([0-9]+)".*/\1 \2 \3 \4/' | awk '{t+=$1;s+=$2;f+=$3;e+=$4} END{print "tests="t" skipped="s" failures="f" errors="e}'; }
# sq : 표준 입력의 SQL 을 L_MAIN 에서 읽기 전용으로 돌린다(MDMAPUSER 는 SELECT ANY TABLE 이 있다).
sq() { { echo "set pagesize 0 feedback off heading off linesize 400 trimspool on"; cat; } \
  | podman exec -i oracle-26ai-free sqlplus -s "MDMAPUSER/dmes_password_123@//localhost:1521/L_MAIN"; }
EOF
: > tmp/erd-close/results.tsv
```
`ERD_USER=admin` 으로 등록·가져오기를 해야 하는 이유: 모델과 첫 DRAFT 의 소유자가 호출 사용자가 된다. 브라우저에서 로그인하는 계정(`admin` / `admin123`)과 같아야 Step 3 의 확정·기각이 `NOT_EDITOR` 로 막히지 않는다. 역할 `MDM_STEWARD` 는 `ErdEditOasisHttpTest` 와 같다.

0-3. 의존성을 맞춘다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
(cd src/frontend && pnpm install --frozen-lockfile)
pnpm install --frozen-lockfile
```
Expected: 둘 다 성공한다. 두 번째 줄은 저장소 루트 `package.json` 의 MCP 의존성(S16)을 설치한다. `--frozen-lockfile` 이 실패하면 Task 11 이 루트 `pnpm-lock.yaml` 을 커밋하지 않은 것이므로 멈추고 알린다.

---

- [ ] **Step 1: 바뀐 모듈 전체 시험**

Oracle 시험은 PC 전체에서 한 번에 하나만 돈다. 아래 1-2 → 1-3 → 1-4 순서로 하나씩 돈다. `:api:test` 전체는 10분을 넘기므로 `run_in_background` 로 로그 파일에 받고, 끝 알림을 기다린다. 통과 판정은 콘솔이 아니라 JUnit XML 의 실패 수로 한다.

1-1. mdm `:lib:test` (DB 없는 단위 시험).

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
cd src/backend/mdm && ../gradlew :lib:test --max-workers=2 > "$CLOSE/mdm-lib-test.log" 2>&1; echo exit=$?
```
Expected: `exit=0`. Bash timeout 600000ms.

1-2. mdm `:api:test` 전체 (Oracle 복제 PDB). 백그라운드로 돌린다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
cd src/backend/mdm && DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone > "$CLOSE/mdm-api-test.log" 2>&1; echo exit=$? >> "$CLOSE/mdm-api-test.log"
```
끝나면 실패 수를 센다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
sum src/backend/mdm/api/build/test-results/test/*.xml
grep -lE '<(failure|error) ' src/backend/mdm/api/build/test-results/test/*.xml
```
Expected: `failures=0 errors=0`. 알려진 기존 실패는 `CodeCateEditPerformanceSqliteTest`(성능 시험, 이번 변경과 무관) 하나뿐이다. 이 시험만 실패 목록에 있으면 아래 1-2a 로 기존 실패임을 증명한다. 다른 시험이 실패하면 "결함이 나왔을 때" 규칙으로 간다.

1-2a. (위 실패가 있을 때만) dev 체크아웃에서 같은 시험이 실패하는지 본다. 메인 체크아웃은 읽기만 하고 파일을 고치지 않는다.

```bash
cd /Users/jji/project/dmes-standard/src/backend/mdm && DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*CodeCateEditPerformanceSqliteTest' > /Users/jji/project/dmes-standard-wt/erd-stage1/tmp/erd-close/perf-on-dev.log 2>&1; echo exit=$?
```
Expected: dev 에서도 `exit` 가 0 이 아니다. 같으면 `rec test.mdmApi "tests=… failures=1 (CodeCateEditPerformanceSqliteTest, dev 에서도 실패)"` 로 적는다. dev 에서는 통과하면 이번 변경 때문에 생긴 결함이다.

1-2b. 통과한 집계를 기록한다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
rec test.mdmLib "$(sum src/backend/mdm/lib/build/test-results/test/*.xml)"
rec test.mdmApi "$(sum src/backend/mdm/api/build/test-results/test/*.xml)"
```
(`sum` 은 0-2 의 `env.sh` 가 정의한 셸 함수다.)

1-3. mcm 시드 시험 (메뉴 leaf `erdEdit` 와 지문 골든은 Task 9 가 고쳤다).

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
cd src/backend/mcm && DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests 'com.dongkuk.dmes.mcm.init.*' > "$CLOSE/mcm-init-test.log" 2>&1; echo exit=$?
```
Expected: `exit=0`. `DataInitializerSeedFingerprintTest` 가 통과해야 한다. 지문 골든이 어긋나면 Task 9 의 leaf 한 줄과 `data-initializer-fingerprint.golden.txt` 가 맞지 않는 것이다. mdm 쪽 `MdmOasisActionVocabularyTest`(15개 액션)·`DmaBpmnActionTest` 는 1-2 에 들어 있다.

1-4. 정적 계약 검사와 mcm 컴파일.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
node .claude/skills/oasis-contract-check/scripts/check_oasis_contract.mjs --root . ; echo exit=$?
(cd src/backend/mcm && ../gradlew :api:compileJava --max-workers=2 -q; echo exit=$?)
```
Expected: ERROR 0, 두 `exit=0`. 기록: `rec test.mcmInit "$(sum src/backend/mcm/api/build/test-results/test/*.xml)"`.

1-5. 프런트: shared·m-mdm·mcm(포털) 시험, 린트, 빌드. README 의 `@dk-oasis/m-mcm` 은 오타이고 포털 패키지의 실제 이름은 `@dk-oasis/mcm` 이다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1/src/frontend
pnpm --filter @dk-oasis/shared build
pnpm --filter @dk-oasis/shared test:unit
pnpm --filter "@dk-oasis/m-mdm^..." build && pnpm --filter @dk-oasis/m-mdm test
pnpm --filter @dk-oasis/m-mdm lint
pnpm --filter @dk-oasis/mcm test
pnpm --filter @dk-oasis/mcm lint
pnpm --filter @dk-oasis/mcm build
cd .. && /usr/bin/git diff --exit-code src/frontend/m-mcm/lib/generated/page-registry.ts; echo registry-diff=$?
```
Expected: 모두 성공하고 마지막 `registry-diff=0` 이다. `next build` 의 `prebuild` 가 `page-registry.ts` 를 다시 만든다. 차이가 나면 Task 9 가 재생성 결과를 커밋하지 않은 것이므로, 바뀐 파일을 `fix(erd-viewer): page-registry 재생성 반영` 으로 커밋한다. 각 명령의 마지막 합계 줄을 `rec test.frontend "shared <n> / m-mdm <n> / mcm <n>"` 으로 적는다.

1-6. 스크립트와 문서 도구.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
node --test scripts/erd/tests/ ; echo exit=$?
node scripts/erd/erd-hints.mjs --check ; echo exit=$?
node .claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs coverage ; echo exit=$?
```
Expected: 세 `exit=0`. `erd-hints.mjs --check` 는 커밋된 `erd/hints/*.json` 이 현재 코드·문서로 다시 만든 것과 같은지 본다. 다르면 `node scripts/erd/erd-hints.mjs` 로 다시 만들어 `chore(erd): 추정 근거 파일 재생성` 으로 커밋한다. 기록: `rec test.node "<node --test 의 pass/fail 수>"`.

1-7. README Review Focus 의 다섯 시험이 실제로 돌았는지 이름으로 확인한다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1
for t in readerJoinsEveryDictionaryViewOnOwner importBuildsCompositeUniqueAndSelfReference secondImportIsInvalid; do
  printf '%s: ' "$t"; grep -l "name=\"$t" src/backend/mdm/*/build/test-results/test/*.xml | wc -l
done
grep -rln "streamReloadRefetchesModel" src/frontend/m-mdm/tests; grep -rln "zoomBelowHalfRendersNamesOnly" src/frontend/m-mdm/tests
```
Expected: 세 Java 시험은 각각 1 이상이고, 두 프런트 시험 이름은 파일 하나씩에서 찾힌다. 0 이 나오면 시험이 이름을 바꿨거나 빠진 것이다. 그 Task 의 담당 레인에 확인을 요청한다.

---

- [ ] **Step 2: 로컬 서버(L_MAIN)에서 실제 가져오기**

**주의 — 되돌릴 수 없다.** 모델 지우기 액션이 없고 확정한 적 없는 모델의 첫 DRAFT 는 지울 수 없다(deferred 40). 모듈당 모델은 하나뿐이다. 그래서 `mcm`·`mdm` 두 모델의 등록과 가져오기는 한 번만 한다. 시작 전에 조정 세션(없으면 사용자)에게 "L_MAIN 의 MDM 스키마에 ERD 모델 행 두 개가 영구히 남는다" 고 알리고 허가를 받는다. L_MAIN 에서는 파괴적인 시험을 하지 않는다. 이 Step 이 L_MAIN 에 쓰는 것은 모델 등록·가져오기뿐이고, 그 밖에는 읽기만 한다.

2-1. 서버 점검과 기동.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1
lsof -nP -iTCP:8096 -iTCP:8100 -iTCP:5100 -sTCP:LISTEN
node scripts/oracle/pdb.mjs list
```
- 8096·8100·5100 에 이미 서버가 있으면 메인 체크아웃(dev)의 서버일 수 있다. `be-run.sh` 는 대상 포트를 쥔 프로세스를 내린다. 이 브랜치의 코드(가져오기·메뉴 leaf)는 dev 에 없으므로 이 워크트리에서 띄워야 하지만, 남의 서버를 끊기 전에 조정 세션의 허가를 받는다.
- `L_MAIN` 이 `READ WRITE` 이고 열린 PDB 가 3개를 넘지 않아야 한다. 2-1 이후에는 Oracle 시험을 돌리지 않는다(PDB 칸이 모자란다).

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
./be-run.sh --mcm --mdm --pdb=L_MAIN > "$CLOSE/be-run.log" 2>&1 &
echo $! > "$CLOSE/be-run.pid"
```
`.run.env` 는 git 에 없어서 이 워크트리에는 없다. 모듈 플래그를 반드시 직접 준다(안 주면 `--all` 로 7개를 띄운다). `Monitor` 로 두 포트가 열릴 때까지 기다린다.

```bash
until lsof -nP -iTCP:8096 -sTCP:LISTEN >/dev/null 2>&1 && lsof -nP -iTCP:8100 -sTCP:LISTEN >/dev/null 2>&1; do sleep 5; done; echo up
```
Expected: `up`. 최대 5분. 안 뜨면 `tail -80 "$CLOSE/be-run.log"` 로 원인을 본다. mdm 이 뜨면서 L_MAIN 에 `V6__erd_model.sql` 이 적용되고, mcm 이 뜨면서 `DataInitializer` 가 `erdEdit` 메뉴 leaf 를 시드한다(둘 다 멱등).

2-2. 기준 수치를 L_MAIN 딕셔너리에서 읽는다. 기대값을 문서에서 옮기지 않고 지금 잰다(연구 때 값은 MCM 55표·MDM FK 53개였으나 스키마가 바뀌었다).

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
sq <<'SQL' | tee "$CLOSE/truth/dict-counts.txt"
select 'V6표 '||count(*) from all_tables where owner='MDMAPUSER' and table_name like 'TB_MDM_ERD_%';
select o.owner||' 표 '||count(*) from all_tables o where o.owner in ('MCMAPUSER','MDMAPUSER') and o.table_name not like 'BIN$%' and upper(o.table_name)<>'FLYWAY_SCHEMA_HISTORY' group by o.owner;
select c.owner||' 칼럼 '||count(*) from all_tab_columns c join all_tables t on t.owner=c.owner and t.table_name=c.table_name where c.owner in ('MCMAPUSER','MDMAPUSER') and t.table_name not like 'BIN$%' and upper(t.table_name)<>'FLYWAY_SCHEMA_HISTORY' group by c.owner;
select owner||' 제약 '||constraint_type||' '||count(*) from all_constraints where owner in ('MCMAPUSER','MDMAPUSER') and constraint_type in ('P','U','R') and table_name not like 'BIN$%' and upper(table_name)<>'FLYWAY_SCHEMA_HISTORY' group by owner, constraint_type order by 1;
SQL
```
Expected: `V6표 7`(V6 이 적용됐다). 나머지는 이번 실행의 기준값이다. 아래 2-5 에서 가져오기 요약과 대조한다. 대조식은 `tables = 표`, `columns = 칼럼`, `relations.DB = R 제약 수`(복합 FK 하나가 관계 하나)다. `V6표` 가 0 이면 mdm 이 L_MAIN 에 붙지 않은 것이다(`be-run.log` 의 접속 URL 을 본다).

2-3. 사전 점검 — 이미 등록된 모델이 있으면 멈춘다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
erd search '{}' | tee "$CLOSE/search-before.json" | jq -r '.. | objects | select(has("modelId")) | .modelId'
```
Expected: `meta.success` 가 true 이고 출력이 비어 있다(`mcm`·`mdm` 이 없다). 둘 중 하나라도 이미 있으면 등록과 가져오기를 건너뛰고, 있는 모델로 2-5 부터 한다(이미 가져온 모델이면 2-4 의 `import` 는 보내지 않는다). 호출이 `UnreachableError`/연결 거부면 서버가 아직 안 뜬 것이다.

2-4. 등록과 가져오기. 모델 ID 는 `mcm`·`mdm` 으로 고정한다. 한 모델씩, 각 응답을 파일로 남긴다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
for spec in "mcm|MCMAPUSER|MCM 스키마" "mdm|MDMAPUSER|MDM 스키마"; do
  IFS='|' read -r id schema name <<<"$spec"
  erd reg "{\"modelId\":\"$id\",\"moduleId\":\"$id\",\"schemaName\":\"$schema\",\"modelName\":\"$name\"}" > "$CLOSE/reg-$id.json"
  jq -c '{success:.meta.success, result:.data.result, msg:.meta.message}' "$CLOSE/reg-$id.json"
  rev=$(erd view "{\"modelId\":\"$id\"}" | tee "$CLOSE/view0-$id.json" | jq -r '.data.result.rev')
  echo "$id baseRev=$rev"
  t0=$(date +%s)
  erd import "{\"modelId\":\"$id\",\"kind\":\"FROM_DB\",\"baseRev\":$rev,\"session\":\"close-import\",\"source\":\"CLI\"}" > "$CLOSE/import-$id.json"
  echo "$(( $(date +%s) - t0 ))" > "$CLOSE/import-$id.time"
  jq -c '{success:.meta.success, applied:.data.result.applied, rev:.data.result.rev, rejection:.data.result.rejection, summary:.data.result.summary, warnings:(.data.result.warnings|length)}' "$CLOSE/import-$id.json"
  echo "$id 가져오기 걸린 시간(초)=$(cat "$CLOSE/import-$id.time")"
done
```
Expected: 모델마다 `applied:true` 와 `summary` 가 나온다. `rejection` 이 null 이 아니면 멈춘다. 이미 가져온 모델이면 `INVALID` 다(이 경우는 2-3 의 건너뛰기 규칙을 따른다). 걸린 시간(초)을 기록한다: `rec import.mcm.seconds "…"`, `rec import.mdm.seconds "…"`.

2-5. 요약을 기준값과 대조하고 기록한다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
for id in mcm mdm; do
  jq -r --arg id "$id" '"\($id) 요약 tables=\(.data.result.summary.tables) columns=\(.data.result.summary.columns) keys=\(.data.result.summary.keys) DB=\(.data.result.summary.relations.DB) INFERRED=\(.data.result.summary.relations.INFERRED) diagram=\(.data.result.summary.diagramId)"' "$CLOSE/import-$id.json"
done
cat "$CLOSE/truth/dict-counts.txt"
```
대조 규칙(다르면 결함 후보다):
- `tables`·`columns` 가 2-2 의 `표`·`칼럼` 과 같다.
- MCM `DB` = 0 (MCM 은 물리 FK 가 없다). MDM `DB` = 2-2 의 `MDMAPUSER 제약 R` 수(V1 53 + V6 6 = 59 가 예상이다. 숫자를 외우지 말고 SQL 값과 비교한다).
- MCM 표 수는 연구 때 55 였고 지금 58 이다. 스키마가 자랐다는 사실을 `rec schema.drift "MCM 표 연구 55 → 가져온 <tables>"` 로 적는다.

```bash
rec import.mcm.summary "$(jq -c .data.result.summary "$CLOSE/import-mcm.json")"
rec import.mdm.summary "$(jq -c .data.result.summary "$CLOSE/import-mdm.json")"
```

2-6. 추정 관계를 모델 JSON 에서 센다. `summary.relations.INFERRED` 는 관계 행의 수이고(허브 후보 포함), 연구의 "표 짝 104" 와 같은 단위가 아니다. 방향을 무시한 서로 다른 표 짝으로 센다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
for id in mcm mdm; do
  erd view "{\"modelId\":\"$id\"}" > "$CLOSE/view1-$id.json"
  jq -c --arg id "$id" '.data.result.model | fromjson | . as $m
    | [.relations[] | {s:.state, rank:(.candidateRank // 1), kinds:[.evidence[].kind],
        pair:([$m.tables[.child].phys, $m.tables[.parent].phys] | sort | join(">"))}] as $r
    | {model:$id,
       상태별:($r | group_by(.s) | map({(.[0].s): length}) | add),
       추정_표짝_전체:([$r[] | select(.s=="INFERRED") | .pair] | unique | length),
       추정_표짝_그려짐:([$r[] | select(.s=="INFERRED" and .rank<=1) | .pair] | unique | length),
       접힌_후보_행:([$r[] | select(.s=="INFERRED" and .rank>1)] | length),
       근거종류:([$r[] | select(.s=="INFERRED") | .kinds[]] | group_by(.) | map({(.[0]): length}) | add),
       DB_표짝:([$r[] | select(.s=="DB") | .pair] | unique | length)}' "$CLOSE/view1-$id.json" | tee "$CLOSE/pairs-$id.json"
done
```
읽는 법과 기록:
- MCM `추정_표짝_전체` 를 연구의 표 짝 합집합 약 104(칼럼명 규칙 99 + 문서·SQL 근거 보강)와 견준다. 크게 다르면(±30% 밖) 원인을 `근거종류` 로 본다: `DOC`·`SQL_JOIN` 이 0 이면 `erd/hints/mcm.json` 이 클래스패스에 없는 것이다(Task 10 산출물 확인).
- `추정_표짝_그려짐` 은 허브 접기 뒤에 화면이 실제로 그리는 점선 수다. 연구는 접으면 75 → 40~50 으로 추정했으나 재 본 적이 없었다. 이 두 수가 deferred 16 번의 답이다.
- MDM `상태별.DB` 가 2-5 의 기대 `DB` 와 같고, 그 관계의 `dbFk` 가 모두 true 인지 한 번 더 본다.

```bash
jq -r '.data.result.model | fromjson | [.relations[] | select(.state=="DB") | .dbFk] | {개수:length, dbFk_true:(map(select(.)) | length)}' "$CLOSE/view1-mdm.json"
rec pairs.mcm "$(cat "$CLOSE/pairs-mcm.json")"
rec pairs.mdm "$(cat "$CLOSE/pairs-mdm.json")"
```
Expected: `개수` 와 `dbFk_true` 가 같다. MDM 의 `INFERRED` 는 FK 를 일부러 안 건 논리 참조(`TB_MDM_CODE_CATE_ITEM`·`TB_MDM_DATA_CATE_ITEM` 계열)와 칼럼명 규칙의 거짓 양성이다. 개수만 기록한다.

2-7. 표준 검사기 일괄 판정 시간(스펙 5절 해당 행). 사전이 채워진 L_MAIN(컬럼 사전 약 8천 행, 별칭 약 1만 1천 행)에서 모델마다 6번 잰다. 첫 호출은 서버가 방금 떠서 JIT 가 덜 데워진 값이고, 나머지 5번의 가운데 값이 표준이다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
for id in mcm mdm; do
  : > "$CLOSE/status-$id.ms"
  for i in 1 2 3 4 5 6; do
    erd view "{\"modelId\":\"$id\",\"kind\":\"STATUS\"}" > "$CLOSE/status-$id.json"
    jq -r '.data.result.elapsedMs' "$CLOSE/status-$id.json" >> "$CLOSE/status-$id.ms"
  done
  echo "$id 첫 호출=$(sed -n 1p "$CLOSE/status-$id.ms")ms 나머지 가운데=$(sed -n '2,6p' "$CLOSE/status-$id.ms" | sort -n | sed -n 3p)ms 최대=$(sort -n "$CLOSE/status-$id.ms" | tail -1)ms"
  jq -c '.data.result.counts' "$CLOSE/status-$id.json"
done
sq <<'SQL'
select 'TB_MDM_COLUMN '||count(*) from MDMAPUSER.TB_MDM_COLUMN;
select 'TB_MDM_COLUMN_SYSTEM '||count(*) from MDMAPUSER.TB_MDM_COLUMN_SYSTEM;
SQL
```
판정:
- `elapsedMs` 는 사전 적재와 판정을 합친 서버 측 시간이다. 가운데 값이 3000ms 이하면 "일괄 판정은 요청마다 사전을 읽는 지금 방식으로 충분하다" 로 기록한다.
- 3000ms 를 넘으면 스펙의 안 될 때 대안(표 단위로 나눠 비동기로 채우기)이 필요하다는 뜻이다. 고치지 말고 deferred.md 에 새 행으로 올린다(Step 5-3).
- `counts` 에서 `MISS` 가 대부분인 것은 정상이다(MCM 컬럼명 중 사전에 있는 것은 약 14% 뿐이다).

```bash
rec status.mcm "첫 호출 <ms>, 가운데 <ms>, 최대 <ms>, counts <jq 출력>"
rec status.mdm "첫 호출 <ms>, 가운데 <ms>, 최대 <ms>, counts <jq 출력>"
rec status.dict "컬럼 사전 <n>행, 별칭 <n>행"
```
(꺾쇠 자리는 바로 위 출력의 실제 값으로 바꿔 적는다.)

2-8. 다른 두 읽기 점검.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
echo "--- 가져온 직후 DB 차이(0이어야 한다)"
for id in mcm mdm; do erd compare "{\"modelId\":\"$id\",\"kind\":\"DB_DIFF\"}" | jq -c --arg id "$id" '{model:$id, 항목:(.data.result.items|length), 처음5:[.data.result.items[:5][]|.id]}'; done
echo "--- 같은 모델에 가져오기를 한 번 더(INVALID 이고 rev 는 그대로여야 한다)"
rev0=$(erd view '{"modelId":"mcm"}' | jq -r '.data.result.rev')
erd import "{\"modelId\":\"mcm\",\"kind\":\"FROM_DB\",\"baseRev\":$rev0,\"session\":\"close-import\",\"source\":\"CLI\"}" | jq -c '{applied:.data.result.applied, code:.data.result.rejection.code, msg:.data.result.rejection.message}'
echo "rev 전=$rev0 후=$(erd view '{"modelId":"mcm"}' | jq -r '.data.result.rev')"
```
Expected: 차이 항목 0개 두 모델 모두. 둘째 가져오기는 `applied:false`, `code:"INVALID"`, rev 전후가 같다. 차이 항목이 0 이 아니면 Task 4(가져오기)와 Task 5(차이)가 같은 DB 를 다르게 읽는다는 뜻이므로 결함이다. 처음 5개 id 와 함께 조정 세션에 보고하고 멈춘다.

```bash
rec dbdiff.afterImport "mcm 0 / mdm 0"
rec import.second "INVALID, rev 불변"
rec crossSchema.read "MDM 서버(MDMAPUSER)가 ALL_* 뷰로 MCMAPUSER 의 표 <n>·FK <n>을 읽었다(로컬 SELECT ANY TABLE). 운영 권한은 확인하지 않았다"
```
(`<n>` 은 2-5 출력으로 채운다.)

---

- [ ] **Step 3: 브라우저 확인 (ego-browser)**

CLAUDE.md 지침대로 ego-browser 스킬을 쓴다. TaskSpace 는 이 Step 전체에서 하나만 쓰고 `spaceId` 를 출력해 둔다. 다음 라운드는 `taskSpace(<id>)` 로 이어 간다. 요소를 고를 때는 먼저 `page.snapshot()` 을 보고, 아래의 선택자(xyflow 가 붙이는 클래스, 눈에 보이는 글자)를 그 결과에 맞게 확인한다. 이 계획은 `data-testid` 를 만들지 않았다.

3-1. 프런트 기동 (dev 모드).

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
./fe-run.sh --mdm --install --build > "$CLOSE/fe-run.log" 2>&1 &
echo $! > "$CLOSE/fe-run.pid"
```
`m-mcm/.env` 가 없으면 `fe-run.sh` 가 만든다. 포트 5100 이 열릴 때까지 `Monitor` 로 기다린다.

```bash
until lsof -nP -iTCP:5100 -sTCP:LISTEN >/dev/null 2>&1; do sleep 5; done; echo up
```

3-2. 로그인과 화면 열기. 메뉴 이름은 시더에서 읽는다(Task 9 가 정한 이름을 계획이 가정하지 않는다).

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1
grep -n '"erdEdit"' src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/seed/MdmMenuSeeder.java | head -3
```
```bash
ego-browser nodejs <<'EOF'
const fs = await import("node:fs/promises");
const seeder = await fs.readFile("/Users/jji/project/dmes-standard-wt/erd-stage1/src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/seed/MdmMenuSeeder.java", "utf8");
const leaf = seeder.match(/insertMcmSecMenuIfAbsent\("erdEdit",\s*"[^"]*",\s*"[^"]*",\s*"([^"]+)"/)[1];
const task = await taskSpace("erd-stage1-close");
console.log("spaceId", task.spaceId, "leaf", leaf);
const page = task.page("p1");
await page.goto("http://localhost:5100/login");
await page.fill("loc=css:#login-user-id", "admin");
await page.fill("loc=css:#login-password", "admin123");
await page.click("loc=css:button[type=submit]");
await page.waitForFunction(() => !location.pathname.startsWith("/login"), undefined, { timeout: 60000 });
console.log("me", JSON.stringify(await page.evaluate(async () => (await fetch("/api/auth/me")).json())));
await page.click("text=용어·도메인");
await page.click(`text=${leaf}`);
await page.waitForSelector("text=MCM 스키마", { state: "visible", timeout: 60000 });
console.log(await page.snapshot());
EOF
```
Expected: `me` 에 `admin` 이 보인다. 사용자 ID 가 `admin` 이 아니면 모델 소유자(`ERD_USER=admin`)와 다른 사람이므로, 이 사람을 공동 편집자로 올린다: `erd execute '{"modelId":"mcm","kind":"ADD_EDITOR","userId":"<me 의 사용자 ID>"}'` 와 `mdm` 에도 같은 호출. 화면이 열리고 모델 목록에 `MCM 스키마` 가 보여야 한다. 메뉴가 안 보이면 mcm 서버가 이 브랜치로 떴는지(`MdmMenuSeeder` leaf), 로그인 계정의 권한(`erdEdit` OBJECT)을 본다.

`SPACE_ID=<id>` 는 3-2 가 출력한 `spaceId` 숫자를 넣으라는 뜻이다. ego-browser 스크립트가 환경변수를 읽지 못하면 `Number(process.env.SPACE_ID)` 자리에 숫자를 직접 쓴다.

3-3. 캔버스 확인. 모델 `MCM 스키마` 를 연 뒤 같은 TaskSpace 에서 이어 간다(`taskSpace(<spaceId>)`).

```bash
SPACE_ID=<id> ego-browser nodejs <<'EOF'
const task = await taskSpace(Number(process.env.SPACE_ID));
const page = task.page("p1");
await page.click("text=MCM 스키마");
await page.waitForSelector("loc=css:.react-flow__node", { state: "visible", timeout: 60000 });
const probe = () => page.evaluate(() => {
  const paths = [...document.querySelectorAll(".react-flow__edge-path")];
  const dashed = paths.filter((p) => { const d = getComputedStyle(p).strokeDasharray; return d && d !== "none" && d !== "0px"; });
  const vp = document.querySelector(".react-flow__viewport");
  const n0 = document.querySelector(".react-flow__node");
  return { nodes: document.querySelectorAll(".react-flow__node").length, edges: paths.length, dashed: dashed.length,
           transform: vp && vp.style.transform, firstNodeText: n0 && n0.innerText.slice(0, 60), firstNodeH: n0 && n0.offsetHeight,
           canvasBg: getComputedStyle(document.querySelector(".react-flow")).backgroundColor };
});
const base = await probe(); console.log("기본", JSON.stringify(base));
await page.keyboard.press("F3");
await page.waitForTimeout(500);
const phys = await probe(); console.log("F3 후", JSON.stringify(phys));
await page.keyboard.press("F3");
await page.screenshot();
EOF
```
Expected 와 기록:
- `nodes` > 0, `dashed` > 0 이고 `dashed` ≤ `edges` (MCM 은 추정 관계뿐이라 그려진 선이 거의 모두 점선이다).
- F3 뒤 `canvasBg` 가 바뀌고(논리 푸른색 ↔ 물리 붉은색) `firstNodeText` 의 이름 줄이 바뀐다(논리명 ↔ 물리명). 한 번 더 눌러 원래대로 돌린다.
- `rec ui.canvas "노드 <n>, 선 <n> 중 점선 <n>, F3 배경/이름 전환 확인"`.

3-4. 보기 프리셋, 축소, 컬럼 그리드.

```bash
SPACE_ID=<id> ego-browser nodejs <<'EOF'
const task = await taskSpace(Number(process.env.SPACE_ID));
const page = task.page("p1");
const h = () => page.evaluate(() => document.querySelector(".react-flow__node").offsetHeight);
const full = await h();
await page.click("text=E-R 개요");        // 프리셋 3개: 기본 / E-R 개요 / 논리+물리 동시
await page.waitForTimeout(500);
console.log("프리셋 E-R 개요: 노드 높이", full, "→", await h());
await page.click("text=기본");
await page.click("text=논리+물리 동시");
await page.waitForTimeout(500);
console.log("논리+물리: 노드 텍스트", await page.evaluate(() => document.querySelector(".react-flow__node").innerText.slice(0, 120)));
await page.click("text=기본");
// 축소: Ctrl+휠로 확대율 50% 밑까지
const box = await page.evaluate(() => { const r = document.querySelector(".react-flow").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.move(box.x, box.y);
await page.keyboard.down("Control");
let scale = 1;
for (let i = 0; i < 40 && scale >= 0.45; i++) {
  await page.mouse.wheel(0, 300);
  scale = await page.evaluate(() => Number((document.querySelector(".react-flow__viewport").style.transform.match(/scale\(([\d.]+)\)/) || [0, 1])[1]));
}
await page.keyboard.up("Control");
console.log("확대율", scale, "노드 높이", await h(), "컬럼 행 DOM 수(노드 안 텍스트 줄):", await page.evaluate(() => document.querySelector(".react-flow__node").innerText.split("\n").length));
EOF
```
Expected: 프리셋 `E-R 개요` 에서 노드 높이가 줄어든다(표 이름만). `논리+물리 동시` 노드 글자에 논리명과 물리명이 함께 있다. 확대율이 0.5 밑이면 노드 글자가 이름 한 줄이다. 프리셋 단추 이름이 다르면 `snapshot` 의 글자로 바꿔 쓴다. 기록: `rec ui.zoom "확대율 <값>에서 이름만 그림(노드 높이 <값>)"`. 확대율을 원래대로 돌리는 방법: 화면의 맞추기 단추나 `Ctrl+휠` 반대 방향.

컬럼 그리드(오른쪽):

```bash
SPACE_ID=<id> ego-browser nodejs <<'EOF'
const task = await taskSpace(Number(process.env.SPACE_ID));
const page = task.page("p1");
await page.click("text=TB_MCM_SEC_MENU");   // 노드 헤더. 논리 모드면 논리명 '메뉴' 글자일 수 있다. snapshot 으로 확인.
await page.waitForTimeout(800);
console.log(await page.snapshot());
await page.screenshot();
EOF
```
Expected: 오른쪽 그리드에 `TB_MCM_SEC_MENU` 의 컬럼이 24행(Step 2-2 의 `ALL_TAB_COLUMNS` 수와 같다) 나오고, 표준 상태 열에 상태 글자가 보인다. `MENU_ID` 행은 PK 표시가 있다. 기록: `rec ui.grid "TB_MCM_SEC_MENU 24행, 표준 상태 열 표시"`.

3-5. 검토 패널에서 추정 관계 확정·기각.

```bash
SPACE_ID=<id> ego-browser nodejs <<'EOF'
const task = await taskSpace(Number(process.env.SPACE_ID));
const page = task.page("p1");
const dashed = () => page.evaluate(() => [...document.querySelectorAll(".react-flow__edge-path")].filter((p) => { const d = getComputedStyle(p).strokeDasharray; return d && d !== "none" && d !== "0px"; }).length);
console.log("확정 전 점선", await dashed());
await page.click("text=검토");                       // 아래 검토 패널 탭
await page.waitForTimeout(500);
console.log(await page.snapshot());
EOF
```
스냅샷에서 추정 관계 행과 그 행의 `확정`/`기각` 단추 ref 를 찾아, 다음 라운드에서 첫 행의 `확정` 을, 둘째 행의 `기각` 을 누른다. 그 뒤 서버 상태로 검증한다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
erd view '{"modelId":"mcm"}' | jq -c '.data.result.model | fromjson | [.relations[] | .state] | group_by(.) | map({(.[0]): length}) | add'
```
Expected: `CONFIRMED` 1, `REJECTED` 1 이 생기고 `INFERRED` 는 그만큼 줄었다. 화면에서는 확정한 선이 실선으로 바뀌고 기각한 선이 사라진다(점선 수가 2 줄어든다). 허브 후보가 접힌 칸("다른 후보 n개")이 보이면 한 번 펼쳐서 접힌 후보도 패널에 있는지 본다. 기록: `rec ui.review "확정 1·기각 1 반영, 점선 <전>→<후>"`.

3-6. 창 두 개의 동시 보기. 같은 TaskSpace 에서 두 번째 Page 를 연다. 같은 브라우저 프로필이라 로그인 쿠키를 공유한다.

```bash
SPACE_ID=<id> LEAF=<3-2 가 출력한 leaf 글자> ego-browser nodejs <<'EOF'
const task = await taskSpace(Number(process.env.SPACE_ID));
const a = task.page("p1");
const b = await task.newPage();
await b.goto("http://localhost:5100/portal");
await b.click("text=용어·도메인");
await b.click(`text=${process.env.LEAF}`);
await b.click("text=MCM 스키마");
await b.waitForSelector("loc=css:.react-flow__node", { state: "visible", timeout: 60000 });
console.log("b label", b.label);
await a.waitForTimeout(2000);
console.log("A 접속자 표시:", await a.evaluate(() => [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && /ui-|admin/i.test(e.textContent || "")).map((e) => e.textContent.trim()).slice(0, 8)));
EOF
```
```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
erd view '{"modelId":"mcm"}' | jq -c '.data.result.presence'
```
Expected: `presence` 에 `source:"UI"` 세션이 2개 있고, 두 창 모두 상대의 이름표(접속자 표시)를 보여 준다. 이어서 B 창에서 추정 관계 하나를 확정하고, A 창이 새로 고침 없이 따라 바뀌는지 본다.

```bash
SPACE_ID=<id> ego-browser nodejs <<'EOF'
const task = await taskSpace(Number(process.env.SPACE_ID));
const a = task.page("p1"), b = task.page("p2");
const dashed = (p) => p.evaluate(() => [...document.querySelectorAll(".react-flow__edge-path")].filter((e) => { const d = getComputedStyle(e).strokeDasharray; return d && d !== "none" && d !== "0px"; }).length);
const before = await dashed(a);
await b.click("text=검토");
console.log(await b.snapshot());       // 여기서 '확정' 단추 ref 를 고른다. 다음 줄의 selector 를 그 ref 로 바꾼다.
EOF
```
다음 라운드에서 B 의 첫 `확정` 단추를 누르고 A 에서 점선 수가 `before - 1` 이 될 때까지 기다린다.

```bash
SPACE_ID=<id> BEFORE=<위의 before> ego-browser nodejs <<'EOF'
const task = await taskSpace(Number(process.env.SPACE_ID));
const a = task.page("p1"), b = task.page("p2");
const t0 = Date.now();
await b.click("<B 의 확정 단추 selector>");
await a.waitForFunction((n) => [...document.querySelectorAll(".react-flow__edge-path")].filter((e) => { const d = getComputedStyle(e).strokeDasharray; return d && d !== "none" && d !== "0px"; }).length === n, Number(process.env.BEFORE) - 1, { timeout: 10000 });
console.log("A 가 B 의 확정을 반영하기까지 ms:", Date.now() - t0);
EOF
```
Expected: 10초 안에 반영된다. 값(ms)을 `rec ui.liveDelta "…ms, presence UI 세션 2개, 이름표 표시"` 로 적는다. 반영되지 않으면 SSE 가 포털에서 막힌 것이므로 3-7 로 간다.

3-7. SSE 가 2분 넘게 살아 있는지(S15)와 압축 지연. 화면과 따로, 포털 같은 경로로 프로브 연결을 하나 열어 둔다. 확정 호출은 같은 스크립트 안에서 BE 로 직접 보낸다(Node `fetch`). 이 확인은 **dev 서버와 `next start` 에서 한 번씩** 한다(3-7a, 3-7b).

```bash
SPACE_ID=<id> ego-browser nodejs <<'EOF'
const task = await taskSpace(Number(process.env.SPACE_ID));
const page = task.page("p1");
const URL = "/api/mdm/rest/erdEdit/view/api/mdm/erd/stream/mcm?session=close-probe&sinceRev=-1&source=CLI";
// 응답 머리: 압축 여부
console.log("머리", JSON.stringify(await page.evaluate(async (u) => {
  const c = new AbortController(); const r = await fetch(u, { signal: c.signal, headers: { Accept: "text/event-stream" } });
  const o = { status: r.status, type: r.headers.get("content-type"), encoding: r.headers.get("content-encoding"), cache: r.headers.get("cache-control") };
  c.abort(); return o;
}, URL)));
// 프로브 연결
await page.evaluate((u) => {
  const s = (window.__sse = { opens: 0, errors: 0, events: [] });
  const es = (window.__es = new EventSource(u));
  es.onopen = () => { s.opens++; s.events.push(["open", Date.now()]); };
  es.onerror = () => { s.errors++; s.events.push(["error", Date.now()]); };
  for (const n of ["hello", "change", "reload", "presence", "claim", "ping"]) es.addEventListener(n, (e) => s.events.push([n, Date.now()]));
}, URL);
await page.waitForTimeout(125000);       // 120초 제한 시절이면 이 안에 끊겼을 것이다
// 확정 하나를 BE 로 직접 보내고 도착 지연을 잰다
const view = await (await fetch("http://localhost:8096/api/mdm/oasis/erdEdit/view", { method: "POST", headers: { "Content-Type": "application/json", "X-Client-Key": "dmes-bff-local-client-key-2026", "X-Authenticated-User": "admin", "X-Authenticated-Role": "MDM_STEWARD" }, body: JSON.stringify({ meta: { menuId: "erdEdit" }, params: { modelId: "mcm" } }) })).json();
const m = JSON.parse(view.data.result.model);
const rid = Object.entries(m.relations).find(([, r]) => r.state === "INFERRED" && (r.candidateRank ?? 1) <= 1)[0];
const t0 = Date.now();
const res = await (await fetch("http://localhost:8096/api/mdm/oasis/erdEdit/save", { method: "POST", headers: { "Content-Type": "application/json", "X-Client-Key": "dmes-bff-local-client-key-2026", "X-Authenticated-User": "admin", "X-Authenticated-Role": "MDM_STEWARD" }, body: JSON.stringify({ meta: { menuId: "erdEdit" }, params: { modelId: "mcm", baseRev: view.data.result.rev, session: "close-probe-writer", source: "CLI", commandsJson: JSON.stringify([{ op: "confirmRelation", id: rid }]) } }) })).json();
console.log("save applied", res.data?.result?.applied, "rel", rid);
await page.waitForFunction((t) => window.__sse.events.some((e) => e[0] === "change" && e[1] >= t), t0, { timeout: 30000 }).catch(() => console.log("change 이벤트가 30초 안에 오지 않았다"));
const s = await page.evaluate(() => window.__sse);
const ch = s.events.find((e) => e[0] === "change" && e[1] >= t0);
console.log("opens", s.opens, "errors", s.errors, "ping 수", s.events.filter((e) => e[0] === "ping").length, "change 지연 ms", ch ? ch[1] - t0 : "없음");
await page.evaluate(() => window.__es.close());
EOF
```
판정:
- 통과: `opens` 1, `errors` 0(125초 넘게 재접속 없이 산다), `change 지연` 이 1000ms 안쪽이다. 확정 호출 응답 `applied` 가 true 여야 한다. 이 확정은 시험 데이터라 되돌리지 않는다(2-6 의 추정 수가 하나 더 줄었다는 것만 3-5 의 기록에 덧붙인다).
- `errors` > 0 이거나 `opens` > 1 이면 `be-proxy.ts` 의 S15 분기(24시간)가 적용되지 않은 것이다. `backendTimeoutMs("GET", "/api/mdm/erd/stream/mcm")` 의 반환값을 Task 6 의 시험 이름으로 확인한다.
- `change` 지연이 `ping` 간격(15초)에 가깝거나 `ping` 수가 125초에 8개보다 훨씬 적으면 중간 버퍼링이다. `머리` 의 `encoding` 이 `gzip` 이면 압축이 원인이다.

3-7a. dev 서버 결과: `rec sse.dev "머리 <encoding>, 125초 재접속 <opens-1>회·오류 <errors>, change 지연 <ms>ms, ping <n>개"`.

3-7b. 운영 방식(`next start`)으로 같은 확인을 되풀이한다. dev 서버를 내리고 빌드 산출물로 5100 을 다시 띄운다. 압축은 dev 에서 꺼져 있어 gzip 지연은 이 방식에서만 드러난다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
kill "$(cat "$CLOSE/fe-run.pid")" 2>/dev/null; sleep 3; lsof -nP -iTCP:5100 -sTCP:LISTEN
(cd src/frontend && pnpm --filter @dk-oasis/mcm build > "$CLOSE/mcm-build.log" 2>&1 && pnpm --filter @dk-oasis/mcm start > "$CLOSE/next-start.log" 2>&1 &)
until lsof -nP -iTCP:5100 -sTCP:LISTEN >/dev/null 2>&1; do sleep 3; done; echo up
```
`fe-run.sh` 의 종료가 남은 자식(`next dev`)을 놓았으면 `lsof` 에 5100 이 남는다. 그 PID 를 `kill` 한 뒤 다시 띄운다. `next start` 가 `output: "standalone"` 경고를 내도 그대로 돈다(`next.config.ts` 의 압축 기본값이 같다). 운영(`NODE_ENV=production`)에서는 BE→BFF 권한 캐시 무효화 호출이 로컬 비밀 때문에 거절된다. 이 확인에는 영향이 없다. 브라우저는 새 서버에 다시 로그인해야 할 수 있다(3-2 의 로그인 줄을 다시 쓴다). 3-7 의 스크립트를 그대로 한 번 더 돌린다.

3-7c. `next start` 결과를 기록한다. 지연이 크면(`change` 지연이 5초를 넘거나 `ping` 이 모아서 온다) 원인이 gzip 이다. 이때의 고침은 이 Task 에서 하지 않는다. 증거(머리·지연·ping 수)와 고칠 방법 후보 둘을 deferred.md 새 행으로 올린다: (a) BE 의 `ErdStreamController` 응답에 `Cache-Control: no-cache, no-transform` 을 붙인다(`be-proxy.ts` 가 `cache-control` 을 그대로 넘기므로 Next 의 압축이 건너뛴다), (b) `next.config.ts` 의 `compress: false`.
`rec sse.prod "머리 <encoding>, … (3-7a 와 같은 형식)"`. 지연이 없으면 `rec sse.gzip "gzip 지연 없음"`, 있으면 `rec sse.gzip "gzip 지연 <ms>ms, 후속 필요"`.

3-8. 브라우저 작업 공간을 닫는다.

```bash
SPACE_ID=<id> ego-browser nodejs <<'EOF'
const task = await taskSpace(Number(process.env.SPACE_ID));
await task.finish({ keep: [] });
console.log("닫음");
EOF
```
Expected: `닫음`. 서버(be-run·next start)는 Step 4 에서 쓰므로 아직 끄지 않는다.

---

- [ ] **Step 4: Claude MCP 확인 (스펙 시험 10)**

4-1. `.mcp.json` 은 Task 11 이 커밋했다. 만들지 않고 읽는다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
cat .mcp.json
jq -r '.mcpServers | keys[]' .mcp.json
jq -r '.mcpServers.erd.env // {} | to_entries[] | "\(.key)=\(.value)"' .mcp.json
```
`env` 의 `${…}` 이름을 모두 셸에 내보낸다(사용자 ID `admin`, 서버 주소 `http://localhost:8096`, 클라이언트 키 `dmes-bff-local-client-key-2026`, 세션 이름이 있으면 `claude-erd-close`). 서버 키(보통 `erd`)가 도구 이름 `mcp__<키>__getModelText` 의 중간이 된다. 서버가 뜨는지 먼저 본다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
claude --help | grep -E "mcp-config|strict-mcp-config|allowedTools|disallowedTools|max-turns|output-format|--tools"
claude -p "erd MCP 서버의 도구 이름만 나열해라" --mcp-config .mcp.json --strict-mcp-config --max-turns 3 2>&1 | head -20
```
Expected: 도구 6개(`getModelText`, `getCurrentView`, `getChangesSince`, `listViolations`, `listInferredRelations`, `getDbDiff`)가 나온다. 위 `--help` 에서 플래그 이름이 다르면 이 Step 의 명령을 그 이름으로 바꿔 쓴다. 서버가 안 뜨면 `node scripts/erd/erd-mcp.mjs < /dev/null` 의 stderr 를 본다(stdout 은 프로토콜 전용이라 비어 있어야 한다).

4-2. 정답표를 만든다. 정답은 L_MAIN 딕셔너리(물리 사실)와 모델 JSON·STATUS(관계·상태)에서 뽑는다. 모델 텍스트가 만든 답과 독립인 출처다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
sq <<'SQL' > "$CLOSE/truth/q1-4-6.txt"
select 'Q1 '||listagg(cc.column_name, ',') within group (order by cc.position) from all_constraints c join all_cons_columns cc on cc.owner=c.owner and cc.constraint_name=c.constraint_name where c.owner='MCMAPUSER' and c.table_name='TB_MCM_SEC_MENU' and c.constraint_type='P';
select 'Q2 '||data_type||'('||nvl(char_length,data_length)||')' from all_tab_columns where owner='MCMAPUSER' and table_name='TB_MCM_SEC_MENU' and column_name='MENU_NM';
select 'Q3 '||count(*) from all_tab_columns where owner='MCMAPUSER' and table_name='TB_MCM_SEC_MENU';
select 'Q4 '||listagg(column_name, ',') within group (order by column_id) from all_tab_columns where owner='MCMAPUSER' and table_name='TB_MCM_SEC_MENU' and nullable='N';
select 'Q6 '||listagg(t.table_name, ',') within group (order by t.table_name) from all_tables t where t.owner='MCMAPUSER' and t.table_name not like 'BIN$%' and upper(t.table_name)<>'FLYWAY_SCHEMA_HISTORY' and not exists (select 1 from all_constraints c where c.owner=t.owner and c.table_name=t.table_name and c.constraint_type='P');
SQL
echo "Q5 $(jq -r .data.result.summary.tables "$CLOSE/import-mcm.json")" > "$CLOSE/truth/q5.txt"
erd view '{"modelId":"mcm"}' > "$CLOSE/truth/model.json"
erd view '{"modelId":"mcm","kind":"STATUS"}' > "$CLOSE/truth/status.json"
jq -r '.data.result.model | fromjson | . as $m
  | [.relations[] | select(.state!="REJECTED" and (.candidateRank // 1) <= 1)
     | {c:$m.tables[.child].phys, p:$m.tables[.parent].phys, cols:[.pairs[] | "\($m.columns[.[0]].phys)>\($m.columns[.[1]].phys)"]}] as $r
  | "Q7 " + ([$r[] | select(.c=="TB_MCM_SEC_MENU") | select(.cols | any(startswith("OBJECT_ID>"))) | .p] | unique | join(",")),
    "Q8 " + ([$r[] | select(.p=="TB_MCM_SEC_OBJ") | .c] | unique | join(","))' "$CLOSE/truth/model.json" > "$CLOSE/truth/q7-8.txt"
jq -r --slurpfile st "$CLOSE/truth/status.json" '.data.result.model | fromjson | . as $m
  | [ $m.tables | to_entries[] | select(.value.phys=="TB_MCM_SEC_MENU") | .key ] as $tid
  | [ $m.columns | to_entries[] | select(.value.table == $tid[0]) | {n:.value.phys, s:($st[0].data.result.statuses[.key])} | select(.s != "OK" and .s != "ALIAS") ]
  | "Q9 " + (length|tostring) + " : " + (map("\(.n)=\(.s)") | join(","))' "$CLOSE/truth/model.json" > "$CLOSE/truth/q9.txt"
cat "$CLOSE/truth/"q*.txt
```
Expected: Q1 `MENU_ID`, Q2 `VARCHAR2(300)`, Q3 `24`, Q4 `MENU_ID`, Q5 가져온 표 수, Q6 PK 없는 표(연구 시점 `TB_MCM_CODE_CATEGORY`·`TB_MCM_CODE_DETAIL`·`TB_MCM_CODE_MASTER`, 지금 값으로 확인), Q7 `TB_MCM_SEC_OBJ`(문서 근거 `csa-menu.dbml` 의 Ref), Q8 자식 표 목록, Q9 비표준 컬럼 수와 상태. Q7·Q8 은 기각·접힘(`candidateRank`>1) 후보를 뺀 것이다. 이는 `getModelText` 가 보여 주는 범위와 같다(README).

4-3. 질문 10개. 질문마다 새 `claude -p` 세션을 쓰고, 도구는 `erd` 서버의 두 읽기 도구로만 막는다(저장소 파일·Bash 로 답을 찾지 못하게 한다). Q10 은 화면에서 표를 골라 둔 뒤에 한다(4-4).

| # | 질문 | 정답 출처 | 판정 |
|---|---|---|---|
| Q1 | `TB_MCM_SEC_MENU` 표의 PK 컬럼 물리명은? | `truth/q1-4-6.txt` | 같은 집합 |
| Q2 | `TB_MCM_SEC_MENU.MENU_NM` 의 타입과 길이는? | `q1-4-6.txt` | 타입·길이 일치 |
| Q3 | `TB_MCM_SEC_MENU` 에는 컬럼이 모두 몇 개인가? | `q1-4-6.txt` | 숫자 일치 |
| Q4 | `TB_MCM_SEC_MENU` 에서 NOT NULL 인 컬럼은? | `q1-4-6.txt` | 같은 집합 |
| Q5 | MCM 모델에는 표가 모두 몇 개인가? | `truth/q5.txt` | 숫자 일치 |
| Q6 | MCM 모델에서 PK 가 없는 표를 모두 말해라. | `q1-4-6.txt` | 같은 집합 |
| Q7 | `TB_MCM_SEC_MENU.OBJECT_ID` 는 어느 표를 부모로 하는 관계가 있는가? | `truth/q7-8.txt` | 같은 집합 |
| Q8 | `TB_MCM_SEC_OBJ` 를 부모로 하는 관계의 자식 표를 모두 말해라. | `q7-8.txt` | 같은 집합 |
| Q9 | `TB_MCM_SEC_MENU` 컬럼 중 표준 상태가 OK·ALIAS 가 아닌 것은 몇 개이고 각각 어떤 상태인가? | `truth/q9.txt` | 개수와 컬럼별 상태 일치 |
| Q10 | 지금 화면에서 사용자가 선택한 표는 무엇이고, 그 표의 PK 컬럼은? | 4-4 에서 고른 표 + SQL | 표 이름과 PK 일치 |

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
cat > "$CLOSE/questions.txt" <<'EOF'
Q1|TB_MCM_SEC_MENU 표의 PK 컬럼 물리명은?
Q2|TB_MCM_SEC_MENU.MENU_NM 의 타입과 길이는?
Q3|TB_MCM_SEC_MENU 에는 컬럼이 모두 몇 개인가?
Q4|TB_MCM_SEC_MENU 에서 NOT NULL 인 컬럼은?
Q5|MCM 모델에는 표가 모두 몇 개인가?
Q6|MCM 모델에서 PK 가 없는 표를 모두 말해라.
Q7|TB_MCM_SEC_MENU.OBJECT_ID 는 어느 표를 부모로 하는 관계가 있는가?
Q8|TB_MCM_SEC_OBJ 를 부모로 하는 관계의 자식 표를 모두 말해라.
Q9|TB_MCM_SEC_MENU 컬럼 중 표준 상태가 OK·ALIAS 가 아닌 것은 몇 개이고 각각 어떤 상태인가?
EOF
S=$(jq -r '.mcpServers | keys[0]' .mcp.json)
while IFS='|' read -r id q; do
  claude -p "erd MCP 도구(modelId=mcm)만 써서 답해라. 추측하지 말고 도구 결과에 있는 값만 쓴다. 질문: $q" \
    --mcp-config .mcp.json --strict-mcp-config \
    --allowedTools "mcp__${S}__getModelText,mcp__${S}__getCurrentView" \
    --disallowedTools "Bash,Read,Grep,Glob,Edit,Write,WebFetch,WebSearch,Agent" \
    --max-turns 6 > "$CLOSE/answers/$id.txt" 2>&1
  echo "== $id"; cat "$CLOSE/answers/$id.txt"
done < "$CLOSE/questions.txt"
```
`claude --help` 의 플래그 이름이 다르면 맞춰 쓴다. `getModelText` 응답이 크면(표 58개, 컬럼 약 700행) Claude 가 `diagram` 인자를 쓰지 않고 전체를 읽는 것이 정상이다. 각 답을 정답표와 눈으로 맞춘다. 집합 질문은 답의 물리명 집합이 정답 집합과 정확히 같아야 맞다(빠지거나 더해지면 틀림). 답이 도구 결과를 틀리게 옮겼으면 "형식 문제"로, 도구 결과 자체가 틀렸으면 "모델 문제"로 적는다.

4-4. Q10 — 화면에서 고른 표를 Claude 가 아는지(`getCurrentView`). 브라우저(ego-browser)에서 화면을 다시 열고(Step 3 은 3-8 에서 닫았으니 새 TaskSpace 에서 3-2 의 로그인·화면 열기 스크립트를 한 번 돌린다) `TB_MCM_SEC_USER` 노드를 클릭해 선택한다. `SET_VIEW` 는 1초에 한 번 이하로 나가므로 2초 이상 기다린 뒤에 확인한다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
sleep 3
erd view '{"modelId":"mcm"}' | jq -c '.data.result.presence[] | select(.source=="UI") | {session, userId, diagramId, selectedTables}'
sq <<'SQL' > "$CLOSE/truth/q10.txt"
select 'Q10 TB_MCM_SEC_USER / '||listagg(cc.column_name, ',') within group (order by cc.position) from all_constraints c join all_cons_columns cc on cc.owner=c.owner and cc.constraint_name=c.constraint_name where c.owner='MCMAPUSER' and c.table_name='TB_MCM_SEC_USER' and c.constraint_type='P';
SQL
cat "$CLOSE/truth/q10.txt"
S=$(jq -r '.mcpServers | keys[0]' .mcp.json)
claude -p "erd MCP 도구(modelId=mcm)만 써서 답해라. 추측하지 말고 도구 결과에 있는 값만 쓴다. 질문: 지금 화면에서 사용자가 선택한 표는 무엇이고, 그 표의 PK 컬럼은?" \
  --mcp-config .mcp.json --strict-mcp-config --allowedTools "mcp__${S}__getModelText,mcp__${S}__getCurrentView" \
  --disallowedTools "Bash,Read,Grep,Glob,Edit,Write,WebFetch,WebSearch,Agent" --max-turns 6 | tee "$CLOSE/answers/Q10.txt"
```
Expected: `presence` 의 UI 세션에 `selectedTables` 로 `TB_MCM_SEC_USER` 의 표 UUID 가 들어 있고, 답이 `TB_MCM_SEC_USER` 와 그 PK 를 정확히 말한다. 이것이 완료 기준 "Claude 가 화면에서 고른 표를 알아본다" 의 확인이다. 선택을 지우고(빈 곳을 클릭) 다시 물으면 "선택한 표 없음" 으로 답하는지도 한 번 본다.

4-5. 채점과 기록. 정답률 = 맞은 수 / 10.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
rec mcp.score "<맞은 수>/10 (틀린 질문: <번호와 원인 분류, 없으면 없음>)"
rec mcp.getCurrentView "<Q10 맞음|틀림>, presence selectedTables=<값>"
```
(꺾쇠는 4-3·4-4 의 채점 결과로 채운다.)
- 9/10 이상이면 통과: 스펙 5절 "getModelText 형식의 정확도" 는 "형식 수정 불필요" 로 닫는다.
- 8/10 이하이거나 Q10 이 틀리면, 원인이 "형식 문제" 인 질문에 한해 `scripts/erd/lib/model-text.mjs` 를 고친다. `scripts/erd/tests/model-text.test.mjs` 에 그 질문을 재현하는 실패 시험을 먼저 쓰고(그 표의 입력 조각과 기대 텍스트 줄), 고친 뒤 `node --test scripts/erd/tests/` 와 틀린 질문 재질문으로 확인한다. 커밋은 `fix(erd-mcp): getModelText 형식 보강 — <질문 번호>` 로 따로 둔다. "모델 문제" 면 결함 규칙 1~3 번으로 간다.

4-6. 서버를 정리한다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1 && . tmp/erd-close/env.sh
pkill -f "next start" ; kill "$(cat "$CLOSE/be-run.pid")" 2>/dev/null
sleep 5; lsof -nP -iTCP:5100 -iTCP:8096 -iTCP:8100 -sTCP:LISTEN
```
Expected: 세 포트에 listen 이 없다. be-run 은 Ctrl+C 와 같은 신호로 자식 JVM 까지 정리한다. 남은 JVM 이 있으면 `lsof` 가 보여 준 PID 를 내린다. 메인 체크아웃의 서버를 허가받고 끊었다면 조정 세션에 "이제 메인 서버를 다시 띄워도 된다" 고 알린다.

---

- [ ] **Step 5: 문서**

문서에 적는 수치는 모두 `tmp/erd-close/results.tsv` 에서 옮긴다. 이 파일에 없는 값은 문서에 쓰지 않는다. 먼저 전체를 읽는다: `cat tmp/erd-close/results.tsv`.

5-1. 스펙 5절 표에 "단계 1 결과" 열을 더한다. 단계 0 열의 글자는 건드리지 않고, 아래 스크립트가 표의 각 행 끝에 칸을 붙인다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1
node - <<'EOF'
import { readFileSync, writeFileSync } from "node:fs";
const R = new Map(readFileSync("tmp/erd-close/results.tsv", "utf8").split("\n").filter(Boolean).map((l) => l.split("\t")));
const need = (k) => { if (!R.has(k)) throw new Error("results.tsv 에 " + k + " 가 없다"); return R.get(k); };
const cells = [
  ["포털(Next.js BFF)을 거쳐 SSE", `단계 1 에서 \`be-proxy.ts\` 의 GET \`/erd/stream/\` 제한을 24시간으로 늘렸다(S15). 브라우저 확인, dev 서버: ${need("sse.dev")}. \`next start\`: ${need("sse.prod")}. ${need("sse.gzip")}.`],
  ["다른 스키마를 읽을 권한", `${need("crossSchema.read")}. 운영 권한은 deferred 17번에 남는다.`],
  ["표준 검사기의 일괄 판정 시간", `L_MAIN 의 \`view kind=STATUS\` \`elapsedMs\`(사전 적재 + 판정). MCM: ${need("status.mcm")}. MDM: ${need("status.mdm")}. 사전 규모: ${need("status.dict")}.`],
  ["MDM 서버를 여러 대로", "확인하지 않았다. 단계 1 도 서버 1대로만 확인했다. 접속자·선택 상태는 서버 메모리의 \`ErdEventHub\` 에 있다."],
  ["`getModelText` 형식의 정확도", `MCM 에 대한 질문 10개: ${need("mcp.score")}. 화면 선택 상태(\`getCurrentView\`): ${need("mcp.getCurrentView")}.`],
];
const path = "docs/superpowers/specs/2026-10-10-erd-tool-design.md";
const lines = readFileSync(path, "utf8").split("\n");
const h = lines.findIndex((l) => l.startsWith("| 항목 | 확인 방법 |"));
if (h < 0) throw new Error("5절 표를 못 찾았다");
if (lines[h].includes("단계 1 결과")) throw new Error("이미 열이 있다");
lines[h] += " 단계 1 결과 |";
lines[h + 1] += "---|";
let n = 0;
for (let i = h + 2; i < lines.length && lines[i].startsWith("|"); i++) {
  const c = cells.find(([key]) => lines[i].startsWith("| " + key));
  if (!c) throw new Error("행을 못 찾았다: " + lines[i].slice(0, 30));
  lines[i] += " " + c[1].replace(/\|/g, "\\|") + " |"; n++;
}
if (n !== cells.length) throw new Error("행 수 불일치 " + n);
writeFileSync(path, lines.join("\n"));
console.log("갱신한 행", n);
EOF
/usr/bin/git diff --stat docs/superpowers/specs/2026-10-10-erd-tool-design.md
```
Expected: `갱신한 행 5`. 스크립트가 "results.tsv 에 … 가 없다" 로 멈추면 그 Step 의 `rec` 를 빠뜨린 것이다. 돌아가서 기록한 뒤 다시 돌린다. 7절의 단계 1 완료 기준 줄은 고치지 않는다.

5-2. 기능설계서에 단계 1 절을 더한다 (`docs/mdm/screens/erdEdit/erdEdit_기능설계서.md` 끝에 붙인다. Task 1 이 1절 `view` 행을 이미 고쳤으면 그 줄은 건드리지 않는다).

```markdown

## 5. 단계 1 — 가져오기·뷰어

- 가져오기: `import`(`kind=FROM_DB`, EDIT). 모델에 표가 있으면 `INVALID`. 딕셔너리 뷰(`ALL_*`)를 OWNER 로 묶어 읽고, DB FK 는 `DB`, 그 밖의 후보는 `INFERRED` 로 넣는다. 추정 근거는 `erd/hints/<module>.json`(`scripts/erd/erd-hints.mjs` 가 만든다)과 칼럼명 규칙이다.
- 읽기 종류: `view` 의 `kind=STATUS`(컬럼별 표준 상태·쓰인 도메인·판정 시간), `kind=SET_VIEW`(화면 선택 상태 공유, READ), `compare` 의 `kind=DB_DIFF`(다시 가져오기 차이, 반영은 단계 2).
- 허브 칼럼: 후보는 모두 `INFERRED` 로 저장하고 `candidateRank` 로 순위를 준다. 화면은 1 순위만 그리고 나머지를 "다른 후보 n개" 로 접는다.
- 화면: 메뉴 `용어·도메인` > `erdEdit`. 캔버스(논리·물리 F3, 보기 프리셋, 확대율 50% 미만이면 이름만), 컬럼 그리드(읽기), 검토 패널(추정 관계 확정·기각).
- 측정 결과(L_MAIN, 2026-10-10): MCM 가져오기 {import.mcm.summary}, MDM {import.mdm.summary}. 표 짝: MCM {pairs.mcm}. `view kind=STATUS`: MCM {status.mcm}.
```
중괄호 자리는 `results.tsv` 의 같은 키 값으로 바꿔서 붙인다.

5-3. `docs/erd-tool/deferred.md` 의 "처리" 칸을 채운다. 커밋 해시는 쓸 수 없다(커밋은 자기 해시를 담지 못하고, 머지 때 합쳐지면 해시가 바뀐다). 안정 참조 `erd-stage1 Task N` 을 쓴다. 이미 채워진 행(Task 1 이 채우는 38번 등)은 건드리지 않는다. 아래 행 가운데 "처리" 칸이 비어 있는 것만 채운다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1
for n in 16 17 30 33 37 38 40; do grep -n "^| $n |" docs/erd-tool/deferred.md | cut -c1-120; done
```
| # | 처리 칸에 쓸 말 (실제 값으로 바꿔 쓴다) |
|---|---|
| 16 | `erd-stage1 Task 12 — MCM 추정 표짝 {pairs.mcm 의 추정_표짝_전체}개 중 그려진 것 {추정_표짝_그려짐}개 (접힌 후보 행 {접힌_후보_행}개)` |
| 17 | 닫지 않는다. 처리 칸은 비워 두고 "근거" 칸 끝에 `로컬 확인: erd-stage1 Task 12 ({crossSchema.read})` 를 덧붙인다 |
| 33 | `erd-stage1 Task 12 — 사전 적재+판정 {status.mcm 의 가운데}ms (규모 {status.dict}). 요청마다 읽는 방식 유지/변경 필요 중 하나` (3000ms 기준, 2-7) |
| 30·37·40 | Task 3·4·9 가 규칙을 정했거나 문구를 넣었는지 SDD 원장의 Rulings 에서 찾는다(5-4 의 명령). 원장에 해당 판정이 있으면 `erd-stage1 Task <n>` 으로 적고, 없으면 비워 둔다 |

새 행을 5절 표 끝에 더한다(번호는 현재 마지막 번호 다음부터). 아래 조건에 해당할 때만 더한다.
- 2-7 에서 가운데 값이 3000ms 를 넘었다: `| 41 | 표준 일괄 판정이 느리다 ({값}ms). 표 단위로 나눠 비동기로 채운다 | 단계 1 마감 측정에서 기준 3000ms 초과 | 스펙 5절 | |`
- 3-7b 에서 gzip 지연이 나왔다: `| 42 | 포털(next start)이 SSE 를 gzip 으로 묶어 이벤트가 {ms}ms 늦다. BE 응답에 Cache-Control no-transform 을 붙이거나 compress:false | 단계 1 마감 확인 | 스펙 5절 | |`
- 3-7 에서 125초 안에 재접속이 있었다: 원인과 재접속 횟수를 적은 새 행.
- 구현 중 원장에 "미룸"으로 적힌 것이 있다: 그 내용을 한 행씩. 단계 2 에서 할 `applyDbDiff`(S3·S4)는 이미 README 개요에 있으므로 올리지 않는다.

5-4. 계획 README 에 "단계 1 구현 결정" 절을 더하고 오타를 고친다. 구현 중 판정은 SDD 원장(`.superpowers/sdd/<계획 이름>/progress.md`, 워크트리마다 따로 있고 git 에 없다)의 Rulings 에서 온다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1
ls .superpowers/sdd/*/progress.md
grep -n -i "ruling" .superpowers/sdd/*/progress.md | head -60
```
원장이 이 워크트리에 없으면 레인 워크트리(`dmes-standard-wt/erd-stage1-*`)에서 찾고, 그래도 없으면 조정 세션에 요청한다(원장 없이 "구현 결정" 을 지어내지 않는다).

README 의 `## 뒤 단계 개요 — 단계 2 (편집·동시 편집)` 바로 앞에 아래 절을 넣는다. 형식은 단계 0 README 와 같다(`# | 결정 | 이유 | 틀렸을 때 비용`). 고정 행 4개는 이 Task 가 쓰고, 그 뒤에 원장 Rulings 를 한 행씩 옮긴다. 비슷한 작은 수정은 단계 0 처럼 "수정 라운드에 넣은 작은 수정(요약)" 한 행으로 묶는다.

```markdown
## 단계 1 구현 결정

구현 중 검토에서 나온 판정이다. 스펙 결정(D1~D20)과 "단계 1 에서 정한 점"(S1~S17)은 바꾸지 않았다. 작업 기록은 SDD 원장에 있다.

| # | 결정 | 이유 | 틀렸을 때 비용 |
|---|---|---|---|
| 마감-L_MAIN | `mcm`·`mdm` 모델을 L_MAIN 에 등록하고 가져왔다. 모델 ID 는 모듈 ID 와 같다. | 완료 기준(MCM 표를 가져와 점선으로 그린다)을 실제 데이터로 확인해야 했다. | 모델 지우기 액션이 없어(deferred 40) 되돌리려면 TB_MDM_ERD_* 행을 손으로 지워야 한다. |
| 마감-판정 시간 | 표준 일괄 판정은 {status.mcm 의 가운데}ms 로 요청마다 사전을 읽는 방식을 유지한다/바꾼다(2-7 결과대로 하나만 남긴다). | 스펙 5절 해당 행. | 사전이 커지면 화면이 느려진다(deferred 33). |
| 마감-허브 접기 | 허브 접기 뒤 점선은 {추정_표짝_그려짐}쌍이다(접기 전 {추정_표짝_전체}쌍). | deferred 16. | 접힌 후보를 못 보는 사용자는 검토 패널로 찾는다. |
| 마감-포털 SSE | {sse.dev} / {sse.prod} | S15, 스펙 5절 해당 행. | 끊기면 `sinceRev` 재접속으로 이어진다. |
| (원장 Rulings 를 여기에 한 행씩) | | | |
```
마지막 줄은 위치 표시이므로 실제 행으로 바꿔 넣는다(원장 판정이 하나도 없으면 줄을 지운다).

그 뒤 Global Constraints 의 패키지 이름 오타를 고친다.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1
sed -i '' 's/pnpm --filter @dk-oasis\/m-mcm test/pnpm --filter @dk-oasis\/mcm test/' docs/superpowers/plans/2026-10-10-erd-tool-stage1/README.md
grep -n "dk-oasis/m-mcm\|dk-oasis/mcm" docs/superpowers/plans/2026-10-10-erd-tool-stage1/README.md
```
Expected: `@dk-oasis/mcm test` 가 보이고 `@dk-oasis/m-mcm test` 는 없다(m-mcm 폴더 경로 표기는 그대로 둔다).

5-5. 문서 점검.

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1
grep -n "{[a-zA-Z.]*}\|<맞은\|<값>\|<n>" docs/superpowers/specs/2026-10-10-erd-tool-design.md docs/erd-tool/deferred.md docs/mdm/screens/erdEdit/erdEdit_기능설계서.md docs/superpowers/plans/2026-10-10-erd-tool-stage1/README.md
```
Expected: 출력 없음(채우지 않은 자리표시가 남지 않았다). 있으면 `results.tsv` 값으로 채운다.

---

- [ ] **Step 6: 커밋**

파일을 하나씩 지정해서 올린다(`tmp/`·`.superpowers/` 는 무시 대상이고, 다른 변경을 섞지 않는다).

```bash
cd /Users/jji/project/dmes-standard-wt/erd-stage1
/usr/bin/git status --short
/usr/bin/git add docs/superpowers/specs/2026-10-10-erd-tool-design.md docs/erd-tool/deferred.md docs/mdm/screens/erdEdit/erdEdit_기능설계서.md docs/superpowers/plans/2026-10-10-erd-tool-stage1/README.md
/usr/bin/git commit -m "$(cat <<'EOF'
docs(erd): 단계 1 마감 — L_MAIN 가져오기·브라우저·MCP 확인 결과 기록

스펙 5절에 단계 1 결과 열을 더하고, deferred 처리 칸과 계획 README 의
단계 1 구현 결정을 채웠다. README 의 포털 패키지 이름 오타를 고쳤다.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
)"
/usr/bin/git status --short
```
Expected: 커밋 하나가 만들어지고 `status` 가 깨끗하다. Step 1 에서 `fix(...)`·`chore(...)` 커밋이 따로 생겼다면 그것들과 함께, 머지 전에 `node .claude/skills/_shared/node/squash-branch.mjs --onto dev --rebase` 로 하나로 합친다. 합치기·dev 머지는 조정 세션의 허가 뒤에 한다(push 금지, 머지는 `--ff-only`). deferred.md 처리 칸의 `erd-stage1 Task 12` 는 머지한 뒤 필요하면 실제 커밋 해시로 바꾼다.

---

## 계획 작성자 메모

- README Global Constraints 의 `pnpm --filter @dk-oasis/m-mcm test` 는 오타다. 포털 패키지 이름은 `@dk-oasis/mcm`(`src/frontend/m-mcm/package.json`)이다. Step 1-5 와 5-4 가 고친다.
- L_MAIN 에 모델을 등록하는 일은 되돌릴 수 없다(모델 삭제 액션 없음, deferred 40). Step 2 앞머리가 조정 세션 허가를 요구한다. 허가가 안 나면 Step 2~4 를 `TPL_DATA` 복제 PDB(`L_<레인>`)로 옮겨 하고, 스펙 5절 결과에 "L_MAIN 아님" 을 적는다.
- `be-run.sh` 는 대상 포트를 쥔 프로세스를 내린다. 메인 체크아웃(dev)의 8096·8100·5100 서버가 돌고 있으면 끊기므로 Step 2-1 이 허가를 요구한다. `.run.env` 는 git 에 없어 이 워크트리에는 없다. 그래서 모듈 플래그를 직접 준다.
- 브라우저 스크립트의 버튼 글자(`E-R 개요`, `검토`, `확정`, `기각`)와 접속자 이름표 모양은 04-frontend-viewer.md 가 정한다. 이 계획을 쓸 때 그 파일이 아직 없어 README 용어와 xyflow 클래스(`.react-flow__node`, `.react-flow__edge-path`)로 썼다. 04 가 다른 글자를 쓰면 Step 3 의 `text=` 선택자를 맞춘다.
- `.mcp.json` 의 서버 키·환경변수 이름은 Task 11 이 정한다. Step 4 는 파일에서 읽어 쓰고 `claude -p` 플래그를 `claude --help` 로 확인하게 했다. 서버가 프로젝트 `.mcp.json` 승인 절차를 요구하면 `--mcp-config` 직접 지정으로 건너뛰는 것을 가정했다.
- deferred.md "처리" 칸에는 커밋 해시를 쓸 수 없다(자기 해시를 커밋에 담지 못하고 squash 로 바뀐다). `erd-stage1 Task N` 을 쓰고 머지 뒤 바꾸게 했다.
- SDD 원장(`.superpowers/sdd/…/progress.md`)은 워크트리마다 따로 있고 git 에 없다. 단계 1 원장의 정확한 폴더 이름은 실행 때 `ls` 로 찾는다. 원장이 없으면 "단계 1 구현 결정" 의 Rulings 행은 채울 수 없다.
- `next start` 는 `output: "standalone"` 설정에서 경고를 낸다. 배포는 `standalone/server.js` 이지만 압축 기본값이 같아 `next start` 결과를 대표로 쓴다(Step 3-7b).
- 스펙 5절의 "다른 스키마 읽기 권한" 은 로컬 확인만 한다. 운영 권한(deferred 17)은 닫지 않는다.

### 마감 실행에서 확인한 계획 결함 (2026-10-11)

마감 실행(L_ERD12, TPL_DATA 복제)에서 이 계획대로는 되지 않았던 곳이다. 다음 단계 마감 계획을 쓸 때 반영한다.

- Step 1-5: m-mcm build 는 계획 명령만으로 되지 않는다. `pnpm --filter "@dk-oasis/mcm^..." build`(m-analog·m-mdm dist)와 `AUTH_SECRET` 환경변수(값은 임의)가 먼저 있어야 한다.
- Step 2: L_MAIN 대신 TPL_DATA 복제 PDB L_ERD12 를 썼다(사용자 위임 2026-10-11, L_MAIN 등록 금지).
- 2-6 jq: 한글 객체 키에 따옴표가 없어 compile error 가 난다. 키를 따옴표로 감싸야 한다.
- 2-7: "MISS 가 대부분" 이라는 기대는 TPL_DATA 사전 기준으로 낡았다. MCM 891 컬럼 중 642 컬럼이 사전 도메인을 받는다.
- 3-3·3-6 `waitForSelector('.react-flow__node')`: ego-browser 는 선택자가 한 개만 맞아야 한다. 노드가 57개라 ambiguity 오류가 난다. `waitForFunction`(`querySelectorAll` 길이 > 0)으로 바꿔야 한다.
- 3-3·3-6 모델 단추: `click('text=MCM 스키마')` 대신 `[data-testid=erd-model-mcm]` 을 쓴다. 메뉴는 `마루 MDM > 용어·도메인 > ERD 설계` 이고 leaf `ERD 설계` 를 직접 누른다.
- 3-5·3-6 검토 탭: 탭 글자는 `검토` 가 아니라 `추정 관계 검토(n)`(`data-testid=erd-tab-inferred`)다. 확정·기각 단추는 `data-testid=erd-confirm-<relId>`·`erd-reject-<relId>` 다.
- 3-3~3-6 점선 수: React Flow 는 화면 밖 노드·선을 그리지 않는다. 확대율 0.1 로 전체를 보이게 한 뒤 세야 한다.
- 3-7b: dev 서버를 내리지 않아도 된다. 같은 빌드를 `next start --port 5101` 로 띄우면 같은 host 라 로그인 쿠키도 공유된다.
- 4-1 `.mcp.json`: `ERD_USER` 기본값은 `erd-mcp` 다. 키 환경변수 이름은 `ERD_KEY` 가 아니라 `BACKEND_CLIENT_KEY` 다. `--max-turns` 는 `claude --help` 에 없지만 동작한다.
- 4-3 `--allowedTools`: 자동 승인 목록일 뿐 화이트리스트가 아니다. 나머지 erd 도구와 `Read` 를 `--disallowedTools` 에 넣고 `--permission-mode default` 를 줘야 실제로 막힌다(사용자 기본 모드가 auto 다).
