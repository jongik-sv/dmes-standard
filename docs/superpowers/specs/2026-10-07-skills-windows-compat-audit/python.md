# python 스크립트 → node 이식 조사표 (읽기 전용 조사)

> 현재 상태(2026-10-07): 이 조사표는 조사 당시 기록이다. 이식 완료(L1 `04b6c524a`, L3 `292dd47dc`, L4 `961bc7057`, L5 `6984c55ce`, L6 `b78edcd7e`): oasis-contract-check·flyway-migration-add·adr-write·dflow-export·dflow-wbs·dflow-wbs-nlevel 의 python 스크립트, 인라인 python 5곳, `junit-count.sh` 는 모두 node(`.mjs`)로 옮겼고 python 원본은 `tests/golden/legacy/` 의 골든 비교용 동결 사본으로만 남았다. 죽은 코드 3개(D3)와 dflow-wbs 구판 3개(D4)는 삭제했다. 남은 것은 mantine-aggrid-ui 3개(L2 진행 중)와 `tools/bp-sync*`(D5, 별도 지시)뿐이다. 계획서 §7 의 「진행 현황」을 본다.

- 조사 대상: `/Users/jji/project/dmes-wt/skills-win/.claude/skills` 아래 `*.py` (`find` 결과 **28개**, 합계 10,707줄. 요청서의 「29개」는 실제로는 28개다 — 스킬별 2+1+2+8+2+5+2+3+3).
- 조사 시점 브랜치 `fix/skills-win-audit`. 파일은 수정하지 않았다.
- 표기: 근거 없는 판단은 「추정」. 크기 S ≤150줄 / M ≤400줄 / L 그 이상 또는 복잡. 이식 후 줄 수는 python 줄 수의 1.0~1.3배로 가정(추정).
- 호출 지점 줄 번호는 모두 `skills-win` 리포 루트 기준 상대 경로.

---

## 0. 핵심 발견 (먼저 읽기)

1. **살아 있는 경로는 5개 스킬**: oasis-contract-check(훅+게이트), mantine-aggrid-ui(FE 가이드가 강제), flyway-migration-add·adr-write(RULE.md 라우팅), dflow-export(D'Flow 업로드). dflow-wbs·dflow-wbs-nlevel 은 SKILL.md 가 부르는 경로지만 사용 빈도는 낮다(추정).
2. **죽은 코드 3개(1,589줄)**: `analyze-queries/orchestrator.py`(681)는 `docs/common/tools/query-cache` 의 `query_cache` 를 import 하는데 그 폴더가 리포에 없어 **지금도 import 에서 즉사**한다. `analyze-service/phase2-generator.py`(458)·`phase3-generator.py`(450)는 SKILL.md:93 이 「호출하지 않는다」고 명시. 어떤 SKILL.md·스크립트·훅도 부르지 않는다 → **이식하지 말고 삭제/보관 결정**(삭제는 사용자 결정).
3. **중복 복사본**: `dflow-export` 의 wbs-parse·wbs-validate·dep-analysis 는 `dflow-wbs` 복사본의 **상위집합**(4단계 ACT·`--export`·펜스 인식·상태머신 충족 임계)이다. dflow-wbs/SKILL.md:76·466 이 스스로 「동봉 스냅샷은 구판」이라 밝힌다. → node 로는 **dflow-export 판 하나만** 이식하고 dflow-wbs 는 그것을 가리키게 하는 것이 최선(§4).
4. **훅이 가장 아프다**: `.claude/settings.json` 의 PostToolUse(`Edit|Write`) 훅이 `python3 hook_post_edit.py` 를 **모든 편집마다** 부른다. python 이 없으면 편집 때마다 훅 오류가 난다(차단은 안 함 — PostToolUse 의 비정상 종료는 비차단, 추정). `.dflow-gates` 의 OASIS 계약 검사 줄도 python3 직접 호출이다.
5. **python 전용 정규식 문법 2종**: 인라인 `(?i)` 접두(aggrid_docs.py 8곳)·`\Z`(phase2-generator.py 4곳, 죽은 코드). JS 에서는 문법 오류/의미 변경. 그 외 `\w`·`\b` 는 python3 str 에서 유니코드 인식, JS 는 ASCII 전용.
6. **CRLF 처리 차이가 윈도우의 최대 함정**: python `read_text`/`open(text)` 는 CRLF→LF 로 자동 정규화하지만 node `readFileSync(...,'utf8')` 는 그대로 둔다. 모든 정규식(`^…$`, `re.M`)과 `ui_docs coverage` 의 생성물 byte 비교가 영향받는다. 공용 `readText()` 로 `\r\n→\n` 강제 필요.
7. **python 이 아닌 곳에도 python 의존이 있다(28개 밖)**: SKILL.md 속 인라인 python 블록 5곳(yaml 읽기·xlsx 읽기/쓰기·`python3 -` 봉투 조립 2곳), `dflow-dev/scripts/junit-count.sh`(python 필수, 없으면 `JUNIT_SUMMARY_NOPY` exit 2), `tools/bp-sync*`. xlsx 읽기·쓰기는 node 에 zip 표준 API 가 없어 **직접 구현이 필요한 유일한 항목**이다.
8. **문서 모순**: `_shared/platform-support.md`·`coordinator/references/contract.md:244`·`dflow-dev/references/dev-discipline.md:621` 은 python3 를 「선택」이라 쓰지만, `README.md:119` 는 「필요한 명령: … python3」, `oasis-contract-check/SKILL.md:100` 은 「필요한 것은 python3 뿐」, junit-count.sh 는 필수다. 이식 후 platform-support.md 표를 고쳐야 한다.
9. **시험은 `selftest.py` 3종 + unittest 4파일(80건)**. 라이브러리 호출형(wbs-parse·validate·nlevel)은 `importlib` 로 하이픈 파일을 로드하므로 node 에서는 `export` 구조로 짜면 오히려 쉬워진다. selftest 3종은 CLI 서브프로세스형이라 `spawnSync(process.execPath, …)` 로 거의 1:1 이식된다.
10. **권장 순서**: 공용 헬퍼 → oasis(훅·게이트 직격) → flyway·adr → mantine → dflow-export → dflow-wbs 잔여·nlevel → 인라인 xlsx. 죽은 3개는 제외(§8).

---

## 1. 공통 사실

### 1.1 의존성
- 28개 전부 **표준 라이브러리만** 쓴다(서드파티 import 0). 로컬 모듈 의존은 둘뿐:
  - dflow-export 내부: `_wbs_md.py`·`_wbs_status.py` → `wbs-parse.py`·`wbs-validate.py`·`dep-analysis.py`·test_*.py 가 `sys.path.insert` 후 import.
  - `analyze-queries/orchestrator.py` → `query_cache` (**리포에 없음**, §5).
- subprocess: `sys.executable` 로 python 자신을 다시 부르는 곳 9파일(selftest 3종·`hook_post_edit`·`ui_docs`·phase2/3 generator·test_wbs_parse_export·test_wbs_validate). `git`·`sed`·`find` 를 부르는 python 스크립트는 **없다**. `ui_docs.py` 만 `node_modules/.bin/tsc` 를 부른다(§2.8).
- 네트워크(urllib): `aggrid_docs.py`·`mantine_docs.py` 만. node 18+ 의 전역 `fetch` 로 대체 가능.
- `dataclass` 사용 0건(전수 grep).

### 1.2 호출 지점 총람 (`python3 …` 직접 호출, 줄 번호)

| 스크립트 | 호출 지점 |
|---|---|
| `.claude/settings.json` | **훅**: PostToolUse `Edit\|Write` → `python3 "$CLAUDE_PROJECT_DIR/.claude/skills/oasis-contract-check/scripts/hook_post_edit.py"` (줄 8, timeout 60) |
| `.dflow-gates` | 줄 18(`full`), 24(oasis 폴더 변경), 34~39·44~49(모듈별 게이트 끝에 `check_oasis_contract.py --root .`) — `heavy.sh bash -c` 로 실행(줄 4 주석). 같은 줄에 macOS 전용 `JAVA_HOME=/opt/homebrew/...` 도 있어 윈도우 게이트는 어차피 별도 정비 필요 |
| `RULE.md` | 줄 61(oasis 스킬 라우팅), 62(flyway 스킬 라우팅) — 스킬 경유 |
| `README.md:119` | 「필요한 명령: git · curl · jq · python3 · gh」 |
| adr-write | `SKILL.md:48,56,106,112,120`(`adr_tool.py status/new/lint/index`), `:155`(selftest) |
| flyway-migration-add | `SKILL.md:50`(status), `:67,80,81`(scaffold), `:143`(selftest) |
| oasis-contract-check | `SKILL.md:22`(검사), `:83`(selftest), `:96-100`(훅 설명) |
| mantine-aggrid-ui | `SKILL.md:34`(M/A/U 약기), `:38-46`, `references/aggrid.md:3`, `references/mantine-catalog.md:5`, `references/mantine-v9-changes.md:3`, `references/screen-patterns.md:222`(check-examples), `dflow-dev/references/phase-verify.md:38`(`aggrid_docs.py audit`), `docs/guide/FrontEnd/README.md:32,33`(audit), `docs/guide/FrontEnd/Screen-Performance-Guide.md:20,363`, `docs/guide/FrontEnd/UI-Visual-Standard.md:120`, 루트 `CLAUDE.md`(공통 컴포넌트 등록 시 mantine-aggrid-ui 문서·색인 갱신 = `ui_docs.py`) |
| dflow-export | `SKILL.md:51`(`wbs-validate.py validate`), `:57-58`(`wbs-parse.py --tasks-all \| dep-analysis.py --docs-dir`), `:65`(`wbs-parse.py --export`), `:73`(**`python3 -` 인라인 봉투 조립**), `:119`(`python3 -m pytest`) |
| dflow-wbs | `SKILL.md:47,48`(`prd-validate.py`), `:51`(`decision-log.py append`), `:56,57`(`wbs-parse.py - --dev-config`, `wbs-validate.py`), `:287`(**인라인 pyyaml**), `:294~`(**인라인 xlsx 읽기**), `:502~`(**인라인 xlsx 쓰기**), `:458-459`(`wbs-parse.py … --json` N회 호출), `:591,592`(`wbs-parse.py --tasks-all`, `dep-analysis.py --graph-stats`) |
| dflow-wbs-nlevel | `SKILL.md:210`(validate), `:221`(export), `:225`(**`python3 -` 인라인 봉투**) |
| analyze-queries / analyze-service | **호출 지점 없음**(§5). `analyze-service/SKILL.md:93` 은 오히려 「호출하지 않는다」 |
| dflow-merge / dflow-dev | `decision-log.py` 를 **형식 정본으로 문장에서만 언급**(`dflow-merge/scripts/decisions.sh:5,8`, `dflow-merge/references/script-details.md:8,9`, `dflow-dev/references/dev-discipline.md:445,457`). 쉘이 직접 부르지는 않는다 |
| 다른 스크립트→python | `dflow-dev/scripts/junit-count.sh:49,89-92`(python3/python 필수, 임베드 pyscript), `dflow-dev/scripts/free-port.sh:13,32`(python 선택, node 폴백 이미 있음) |

---

## 2. 스크립트별 조사표

(열: a 줄수/의존 · b 호출 · c 계약 · d python 전용 의존 · e 시험 · f 크기 · g 빈도/중요도)

### 2.1 adr-write (2개)

| 파일 | a | b | c | d | e | f | g |
|---|---|---|---|---|---|---|---|
| `adr_tool.py` | 353줄, stdlib(argparse·re·pathlib) | SKILL.md:48,56,106,112,120 | 서브커맨드 `status\|new\|lint\|index` + `--root --module --slug --title --status --date --tags --all paths…`. **exit 0/1/2**(2=사용 오류, lint 위반=1). stdout 한국어 평문(기계 파싱 입력 아님) | `argparse`(서브명령·`choices`); `Path.glob`+`sorted`; `re.S/re.M`, 룩어헤드 `(?=…)` 2곳(JS 지원); `re.fullmatch`; `read_text/write_text(encoding=utf-8)`(CRLF 자동 정규화 의존); `{n:04d}`; `.git` 찾아 올라가기 | selftest.py | M | RULE.md 라우팅 대상(ADR 발행 시). 마지막 변경 2026-09-02(템플릿 초기 스냅샷 1커밋) → 사용 빈도 낮음(추정) |
| `selftest.py` | 202줄, stdlib(subprocess·tempfile·re) | SKILL.md:155 | PASS/FAIL, 실패 시 exit 1 | `subprocess.run([sys.executable, TOOL, …], text=True)`(인코딩 미지정 → 윈도우 로캘), `TemporaryDirectory` | 자체가 시험 | M, node:test 이식 난이도 **하** | 도구 건강 확인용 |

### 2.2 analyze-queries (1개) — **죽은 코드**

| 파일 | a | b | c | d | e | f | g |
|---|---|---|---|---|---|---|---|
| `orchestrator.py` | 681줄. **로컬 모듈 `query_cache`(QueryCacheDB·DEFAULT_DB_PATH·DEFAULT_QUERY_DIR) 의존** — `../../../../docs/common/tools/query-cache` 를 `sys.path` 에 넣고 import(줄 13-18). 그 폴더는 리포에 **없다**(`ls` 확인) → 실행 즉시 ImportError | 호출 0. `analyze-queries/SKILL.md:26`: 「query-cache·orchestrator 의존성은 SampleErp 환경에서 제거되었다」. 호출하는 건 죽은 `phase3-generator.py:92` 뿐 | 서브커맨드 `prepare·fetch-batch·save-batch·fetch-queries·save-queries·classify·table-info·status`, stdin JSON, JSON 출력(`.glue_sql`·Oracle 캐시 SQLite 전제, 부산 시절 GLUE 전용) | argparse 서브파서, `sys.stdin.read`, `OrderedDict`, `re.IGNORECASE` 다수 | 없음 | L(681) — **이식 가치 없음** | 사용 0(추정). 이식 제외 + 삭제 후보 |

### 2.3 analyze-service (2개) — **죽은 코드**

| 파일 | a | b | c | d | e | f | g |
|---|---|---|---|---|---|---|---|
| `phase2-generator.py` | 458줄, stdlib. 외부 `docs/common/tools/sql_mapping_integration.py` 를 subprocess 로 부름(줄 314, 없으면 WARN 후 건너뜀) | 호출 0. `SKILL.md:93`: 「부산용 phase1-analyzer.js / phase2-generator.py / phase3-generator.py 는 GLUE/Oracle 전용으로 SampleErp 입력에 호환되지 않으므로 호출하지 않는다」 | `SERVICE-ID SERVICE-TYPE PROJECT-ROOT [--force]`, exit 0/1/2(2=stderr JSON) | **`\Z` 정규식 4곳**(줄 78,84,165,189), `re.DOTALL`·동적 `%` 포맷 정규식 | 없음 | L | 사용 0 |
| `phase3-generator.py` | 450줄. `query_cache.py sync`(줄 69)·`orchestrator.py fetch-queries`(줄 92)를 subprocess 로 부름 — 둘 다 죽음 | 호출 0 | 동일 CLI, exit 0/1/2 | subprocess·`sys.executable` | 없음 | L | 사용 0 |
- 참고: 최근 커밋 `fix(skills): dflow·coordinator 스크립트의 macOS 전용 요소를 걷어낸다`(2026-10-07)가 이 폴더를 건드렸으나 호출 경로가 아니라 문서 정리로 보인다(추정).

### 2.4 dflow-export (8개) — 현역 정본

| 파일 | a | b | c | d | e | f | g |
|---|---|---|---|---|---|---|---|
| `_wbs_md.py` | 61줄, stdlib(re) | 내부 import | 순수 함수 `FENCE_RE`·`_fenced_ranges`·`_in_ranges`·`line_start_offsets` | 펜스 정규식 `^[ ]{0,3}(?:`{3,}\|~{3,})` `re.MULTILINE`; **`str.splitlines(keepends=True)` 로 오프셋 계산 — python 은 `\n` 외에 `\r`·`\x0b`·`\x0c`·`\x1c-\x1e`·`\x85`·` /9` 에서도 끊는다**; python 오프셋은 코드포인트, JS 는 UTF-16(한 쪽 단위만 일관되게 쓰면 무방) | wbs-validate 시험에 간접 포함 | S | 핵심 공용 |
| `_wbs_status.py` | 101줄, stdlib(json·os) | 내부 import | 상태 어휘표 `STAGE_CODE`·`satisfied_states`·`resolve_state_machine`(탐색: `WBS_STATE_MACHINE` 환경변수 → `{docs}/state-machine.json` → 한 단계 위 → `CLAUDE_PLUGIN_ROOT`/스크립트폴더 `references/state-machine.json`) | `os.environ`, JSON 로드. **`scripts/references/state-machine.json` 을 반드시 같이 옮겨야 함**(SKILL.md:109 경고) | `test_wbs_status.py`(13건) | S | export·dep-analysis 의 의존 임계 정의, stage 코드 계약 v2.1 정본 |
| `wbs-parse.py` | **1,214줄**, stdlib(sys·os·re·json)+위 두 모듈 | SKILL.md:57,65. dflow-wbs/SKILL.md 가 구판을 호출. `dflow-work/references/api-contract.md:416` 이 「`wbs-parse.py --export` 출력 v2」를 서버 계약으로 명시 | **가장 강한 계약**: 위치 인자 `<wbs> <ID\|-> [모드]` + 모드 12종(`--block --field --tasks --tasks-pending --tasks-all --export --feat-tasks --resumable-wps --phase-start --dev-config --complexity --json`)과 `--feat <dir> …`. 실패는 stderr `ERROR: …` + exit 1. **`--export` 출력은 D'Flow `POST /wbs/import` 계약 v2.1(`schema_version`·`nodes` 17키 고정 shape)이며 「재실행 = byte 동일」이 계약**(test_export_is_deterministic). `--tasks-all` 출력은 dep-analysis 입력, `--dev-config` 출력은 wbs-validate `--dev-config-json` 입력 | `re.match` 14곳(시작 앵커 내장 — JS 는 `^` 명시), `re.IGNORECASE/DOTALL/MULTILINE`; 한글 키워드 정규식(복잡도 점수 `아키텍처\|마이그레이션…`); `json.dumps(ensure_ascii=False, indent=2)` 는 JS 와 동일하나 **들여쓰기 없는 호출(줄 936·1206)은 python 이 `", "`·`": "` 공백을 넣어 `JSON.stringify` 와 다르다**; 키 순서 = dict 삽입순(JS 와 동일, 단 **정수형 문자열 키는 JS 가 오름차순 재배치**); `os.environ` 3곳; `--dev-config` 템플릿 경로가 `…/skills/wbs/references/dev-config-template.md`(옛 플러그인 구조) — 이 리포에 없는 경로라 항상 **내장 폴백 문자열**이 쓰인다(추정, 이식 시 정리 기회) | `test_wbs_parse_export.py`(18건) | **L** | **높음**: dflow-export 부트스트랩 업로드의 핵심(빈도는 최초 업로드·재업로드 때, 추정). 서버 계약이 걸려 정확도 요구 최고 |
| `dep-analysis.py` | 494줄, stdlib(heapq·json·re·sys·os)+`_wbs_status` | SKILL.md:58(`wbs-parse --tasks-all \| dep-analysis.py --docs-dir`) | 입력: stdin 또는 파일의 JSON 배열; 모드 기본(위상정렬 레벨)·`--graph-stats`·`--docs-dir DIR`. 출력 JSON(`levels`·`completed`·`circular`·`total`·`pending`·`satisfied_states`…). **파이프 연결 계약**(`wbs-parse` stdout → 이 stdin) | **`heapq`**(줄 173-196, 위상정렬 큐 — 동률 처리 순서가 출력에 영향하므로 요소 순서 규칙을 그대로 복제), `sys.stdin.read()`, 정수 문자열 키 | 전용 시험 없음 | L(494, 복잡도는 M급) | 중간 |
| `wbs-validate.py` | 285줄, stdlib(argparse·json·re·pathlib)+`_wbs_md` | SKILL.md:51 | `validate --wbs FILE [--dev-config-json STR]`; 출력 JSON(`ok`·`issues`·`target`), **exit 0=ok / 1=이슈 / 2=사용 오류**(stderr JSON) | **명명 그룹 `(?P<level>…)`**(→ `(?<level>…)`), `re.MULTILINE`, 펜스 구간 계산, argparse 서브파서(필수) | `test_wbs_validate.py`(30건) | M | 중간 |
| `test_wbs_parse_export.py` | 336줄 | `SKILL.md:119` pytest | unittest 18건. `importlib.util.spec_from_file_location` 로 하이픈 파일 로드 + CLI 서브프로세스(`--export` 봉투·결정성·부모 그래프 폐쇄성) | `tempfile`, `pathlib`, `subprocess.run([sys.executable, …])` | — | M. 이식 난이도 **중**: 합성 wbs.md 픽스처(줄 18-150)·상태머신 임시 디렉터리 구성, 단언은 `assert.deepStrictEqual` 로 1:1 | 시험 |
| `test_wbs_status.py` | 133줄 | 〃 | unittest 13건, `os.environ` 조작·임시 디렉터리 | `tempfile`·`os.environ` | — | S, 난이도 **하** | 시험 |
| `test_wbs_validate.py` | 460줄 | 〃 | unittest 30건: 3·4단계·**펜스 코드(닫히지 않음·엇갈림·들여쓴 펜스)** 회귀 | `importlib`, CLI 서브프로세스 3곳 | — | L급 줄 수, 난이도 **중**(펜스 회귀 케이스가 `splitlines`/오프셋 로직과 맞물림 — 같은 입력으로 결과 동일해야 함) | 시험 |

### 2.5 dflow-wbs (5개) — 구판 스냅샷 3 + 단독 도구 2

| 파일 | a | b | c | d | e | f | g |
|---|---|---|---|---|---|---|---|
| `wbs-parse.py` | 1,023줄, stdlib | SKILL.md:56,458-459,591 등. **구판**(3단계 `TSK-\d+-\d+` 숫자 2세그먼트만, `--export` 없음) | export 판과 CLI 모드 동일(단 `--export` 없음) | 위와 동일 | **없음** | L | §4 |
| `wbs-validate.py` | 248줄 | SKILL.md:47-57,601 | 3단계만 인식(SKILL.md:64: 「4단계는 task_count 0 + ok:true」). exit 0/1/2 | `(?P<…>)`, argparse | 없음 | M | §4 |
| `dep-analysis.py` | 464줄 | SKILL.md:591-592 | `[xx]` 만 완료 판정(`--docs-dir` 없음). stdin·파일 둘 다 가능 — 그런데 SKILL.md:70 은 「stdin 불가」라 적어 **문서가 코드(줄 339 `sys.stdin.read`)와 어긋난다** | `heapq` | 없음 | L | §4 |
| `decision-log.py` | 334줄, stdlib(argparse·datetime·json·re·pathlib) | `dflow-wbs/SKILL.md:51`(`append`). 형식은 `dflow-merge/scripts/decisions.sh`(셸 재구현)·`dflow-dev/references/dev-discipline.md:445-457` 이 정본으로 인용 | `append\|list\|validate`; `decisions.md` 머리 `## D-NNN (UTC)` + 4필수필드(Phase·Decision needed·Decision made·Rationale) + phase 화이트리스트 9종; **`validate` 가 D-001 부터 끊김 없는 순번을 요구** — decisions.sh 가 이 규칙에 의존. 출력 JSON | `_write` 가 `newline="\n"` 강제(node 기본이 LF 라 자연 일치), 읽을 때 CRLF 제거 필요; UTC 타임스탬프 `strftime` → `toISOString()` 변환; `re.MULTILINE` 정규식 2개 | 없음 | M | 중간. **상호 호환 시험 필요**(python 판이 쓴 파일을 node 판이 validate, 반대도) |
| `prd-validate.py` | 236줄, stdlib | SKILL.md:47,48 | `validate --target FILE [--required-sections …]` → JSON. exit 코드는 wbs-validate 와 동형으로 보이나 main 끝까지는 확인 안 함 | `re.IGNORECASE` 4곳, `datetime.now(utc)`(Assumptions 템플릿 날짜) | 없음 | M | 낮음(PRD/TRD 생성 때만) |

### 2.6 dflow-wbs-nlevel (2개)

| 파일 | a | b | c | d | e | f | g |
|---|---|---|---|---|---|---|---|
| `wbs-nlevel-parse.py` | 443줄, stdlib(argparse·json·datetime·re·sys) | SKILL.md:14,210,221 | `validate --wbs F --role pl\|skeleton`, `export --wbs F [--skeleton F] [--attach-ref X]`. **export 출력은 import v2.2 payload**(`> file` 저장 후 전송, SKILL.md:221). validate errors 0 이 통과. 계약 정본 `references/wbs-nlevel-md-contract.md` | **정규식 14개**(수제 frontmatter YAML 파서 `^\s*-\s*\{(.+)\}\s*$` 등); `datetime.date.fromisoformat`+`weekday()`(영업일 `next_business_day` — JS 는 **UTC 로 계산**해야 TZ 이동 오류 없음); `json.dumps(indent=1)`(JS `JSON.stringify(x,null,1)` 가능); 오류 JSON 을 stderr 로; 한글 경로(`docs/mes/조업/wbs.md`) | `test_wbs_nlevel_parse.py`(19건, `parse_wbs`·`validate`·`export_payload`·`next_business_day` 직접 호출) | M~L | 낮음~중간(대형 N단 WBS 전용, 추정) |
| `test_wbs_nlevel_parse.py` | 208줄 | 시험 | unittest 19건, 서브프로세스 없음 | `importlib` 로드 | — | M, 난이도 **하** | 시험 |

### 2.7 flyway-migration-add (2개)

| 파일 | a | b | c | d | e | f | g |
|---|---|---|---|---|---|---|---|
| `migration_tool.py` | 272줄, stdlib(argparse·re·pathlib) | SKILL.md:50,67,80,81 | `status\|scaffold --module --slug --title --dialect a,b --root`; **exit 0/2**; `V<번호>__<slug>.sql` 파일 생성(쓰기). 번호는 방언 폴더·공통 폴더 전체를 보고 채번 | `Path.glob("V*.sql")`·`iterdir`·`is_dir`; `re.fullmatch`; `write_text`(UTF-8, **윈도우 python 은 `\n`→`\r\n` 으로 써서 CRLF 파일**; node 는 LF — 기존 마이그레이션의 줄끝과 혼재 가능, `.gitattributes` 확인 필요(추정)); ROOT_CANDIDATES 경로 템플릿 | `selftest.py`(4함수) | M | RULE.md:62 라우팅 — DB 스키마 변경 때 필수. 중간 빈도(추정) |
| `selftest.py` | 132줄 | SKILL.md:143 | 서브프로세스형 | `subprocess(text=True)`·`tempfile` | — | S, 난이도 **하** | 도구 건강 확인 |

### 2.8 mantine-aggrid-ui (3개) — 활발히 개발 중(git 38커밋, 최종 2026-10-07)

| 파일 | a | b | c | d | e | f | g |
|---|---|---|---|---|---|---|---|
| `aggrid_docs.py` | **913줄**, stdlib(urllib·argparse·html·shutil·functools·time·json) | SKILL.md:38-46, `aggrid.md:3`, `phase-verify.md:38`, FE README:33, Screen-Performance-Guide:20,363 | 서브커맨드 `version·search·get·types·recommendations·audit·refresh`. **`audit <경로…>` 는 FE 검수 게이트**: 오류 exit 1·경고 exit 0(FE README:55). 출력 한국어 평문. `get`/`types` 는 문서 본문을 stdout 으로 | **인라인 `(?i)` 접두 8곳**(줄 372,378,392,394,596,765,768 → `/…/i`), 룩비하인드·`(?!` 7곳(V8 지원), `re.S/M/I/P`·`re.finditer`, `re.search` 33곳, `functools.lru_cache`, `html.unescape`(엔티티 디코더 직접 작성), `urllib`+UA 위조(줄 36: ag-grid.com 이 기본 UA 를 403), TTL 캐시 `~/.cache/aggrid-docs`(`Path.home()`→`os.homedir()`), `shutil.rmtree`, pnpm `node_modules/.pnpm/ag-grid-community@*/…` glob(줄 73, 윈도우 pnpm junction 구조 주의), `rglob("*.d.ts")`, audit 의 `rglob("*")`+`suffix` 필터 | 없음(`audit-exceptions.json` 만) | **L**(audit 규칙 40여 개가 줄 수 대부분; 규칙마다 오탐/미탐 민감) | **높음**: FE 개발 전반 |
| `mantine_docs.py` | 239줄, stdlib | SKILL.md:38-41, `mantine-catalog.md:5`, `mantine-v9-changes.md:3`, FE README:32 | `version·search·get·grep·official·audit·refresh`; `audit` 는 CSS 색 직접 사용 등 점검(UI-Visual-Standard:120) | `urllib`(UA `mantine-ui-skill`), 4.5MB `llms-full.txt` 캐시 후 줄 grep(`-C N`), `(?P<…>)` 3곳 | 없음 | M | 높음 |
| `ui_docs.py` | 311줄, stdlib | SKILL.md:34(U 약기), `screen-patterns.md:222`, **루트 CLAUDE.md 공통 컴포넌트 행동강령(등록 시 색인 갱신)** | `index·get·full [--write]·coverage·check-examples`. **`full --write`·`coverage` 가 `components/llms.txt`·`llms-full.txt` 를 생성하고 byte 비교**(줄 232-233 `p.read_text() != builder()`) → CRLF 가 끼면 늘 「생성물 낡음」 | `subprocess.run([tsc, "--noEmit"…])` — **`node_modules/.bin/tsc` 는 윈도우에서 `tsc.cmd`/`tsc.ps1`**(직접 실행 불가 → `shell:true` 또는 `process.execPath` 로 `typescript/bin/tsc` 호출), 같은 폴더의 `mantine_docs.py`·`aggrid_docs.py` 를 `sys.executable` 로 호출(줄 262-263 → 이식 후엔 import 직접 호출), `shutil.copytree`, `Path.unlink(missing_ok=True)`, 한글 그룹 정의 | 없음 | M | 높음(공통 컴포넌트 등록·`coverage` 검수) |

### 2.9 oasis-contract-check (3개) — 훅·게이트 직격

| 파일 | a | b | c | d | e | f | g |
|---|---|---|---|---|---|---|---|
| `check_oasis_contract.py` | 344줄, stdlib(argparse·json·re·pathlib) | SKILL.md:22, `.dflow-gates:18,24,34-49`, 훅(hook_post_edit 경유) | `--root --module(반복) --json --all --severity ERROR\|WARN\|INFO`. **exit 0=위반 없음 / 1=기준 이상 위반 / 2=BPMN 0건**; `--json` 출력은 `hook_post_edit.py` 입력(`findings[].severity/rule/target/detail`, `counts`, `scanned`) — **필드명 계약 유지 필수** | `rglob("*.bpmn"/"*.java"/"*.ts"/"*.tsx")`+폴더 제외 — 대형 트리 순회 성능(훅 주석 기준 python 1.3초; node 도 비슷하게 가능, `readdirSync({recursive:true})` 는 18.17+/20.1+); `read_text(errors="ignore")`(잘못된 바이트 삭제 — node 는 U+FFFD 치환, 정규식 영향 작음); 주석·문자열 제거 정규식(`re.S`); `re.sub` 콜백(camelCase 변환 람다); **`\w` 가 python3 은 유니코드, JS 는 ASCII** — BPMN 속성·Java 식별자는 대개 ASCII(추정) | `selftest.py`(합성 위반 5종 변이) | M | **최고**: 훅 + 모든 모듈 게이트 + RULE.md 필수 |
| `hook_post_edit.py` | 119줄, stdlib | `.claude/settings.json:8` | **훅 입력 계약**: stdin JSON `{tool_input.file_path, tool_response.filePath}`; 출력 JSON `{systemMessage, hookSpecificOutput:{hookEventName:"PostToolUse", additionalContext}}` 또는 무음. **항상 exit 0**(차단 안 함). 검사기 실패도 `systemMessage` 로 알림 | `sys.stdin` JSON, `subprocess.run([sys.executable, CHECKER…], timeout=60, text=True)` → node 에선 검사기를 **같은 프로세스에서 import 호출**하면 자식 프로세스·인코딩 문제 소멸; 경로 `\`→`/` 정규화(줄 38, 윈도우 입력 이미 고려); `HERE.parents[3]` 리포 루트; **`print(json, ensure_ascii=False)` — 윈도우 python 의 파이프 stdout 은 로캘(cp949) 인코딩이라 훅 출력 한글이 깨지거나 `UnicodeEncodeError`(추정), node 는 UTF-8 이라 오히려 개선** | selftest 는 훅을 안 본다(검사기만) | S | **최고** |
| `selftest.py` | 193줄 | SKILL.md:83 | 합성 Java/BPMN/TS 픽스처(줄 43-80)+변이 5종 → 기대 rule 확인, 서브프로세스로 검사기 호출 | `subprocess`·`tempfile`·`shutil`·`text=True`(인코딩 미지정) | — | M(S), 난이도 **하** | 도구 건강 확인 |

---

## 3. 보충

### 3.1 python 전용 기능 의존 한눈표 (d)

| 기능 | 위치 | node 대응 |
|---|---|---|
| `argparse` 서브파서·`choices`·`required` | adr_tool·migration_tool·wbs-validate·nlevel·decision-log·prd-validate·aggrid/mantine/ui_docs·check_oasis | `util.parseArgs`(18.3+) 또는 소형 손 파서 → **공용 헬퍼 1개**. 사용 오류 종료코드 2 규약(argparse 동일) 유지 |
| `heapq` | dep-analysis ×2 | 간단 이진 힙 ~15줄 |
| `tempfile` | selftest 3·test 3 | `fs.mkdtempSync(path.join(os.tmpdir(),…))` |
| `subprocess`+`sys.executable` | 9파일 | `spawnSync(process.execPath, […])`, 또는 함수 import |
| `urllib` | aggrid_docs·mantine_docs | 전역 `fetch`, UA 헤더, `AbortSignal.timeout(60000)` |
| 정규식 방언 | §0-5, §7 | `(?i)`→플래그, `\Z`→`$(?![\s\S])`, `re.match`→`^`, `(?P<n>)`→`(?<n>)`, `re.fullmatch`→`^(?:…)$`, python `$` 는 끝 `\n` 앞도 매치 |
| 파일 인코딩 기본값 | 거의 모든 `open`/`read_text` 에 `encoding="utf-8"` 명시(양호). 예외: **selftest 3종의 `subprocess.run(..., text=True)`**·phase generator 의 `text=True`(로캘 인코딩) | node 기본 UTF-8 |
| 줄끝 | `read_text`/`open('r')` = CRLF→LF 자동. `write_text`(adr·migration·ui_docs)는 윈도우 python 에서 CRLF 로 기록. `decision-log` 만 `newline="\n"` 명시 | 공용 `readText`(CRLF 정규화)·`writeText`(LF) |
| `str.splitlines()` | `_wbs_md.py:56` 등 | `split(/\r\n|\r|\n/)`. python 이 `\x0b\x0c\x1c-\x1e\x85  ` 에서도 끊는 점은 wbs.md 에 거의 없을 것(추정) |
| 정수 키 JSON | dep-analysis `levels` | JS 객체는 정수형 문자열 키를 오름차순 재배치 — 결과가 숫자순이라 대개 무해, 보존하려면 `Map`/배열 |
| 날짜 | nlevel `weekday()`, prd-validate/decision-log UTC | `Date.UTC`·`getUTCDay()` |
| `functools.lru_cache`·`html.unescape`·`shutil.copytree/rmtree` | aggrid_docs·ui_docs | `Map` 캐시·간단 엔티티 치환·`fs.cpSync/rmSync` |

### 3.2 계약 요약 — 다른 도구의 입력이 되는 출력
- `wbs-parse --export` → `POST /wbs/import`(서버 계약 v2.1, `dflow-work/references/api-contract.md:416`): **byte 동일·결정적**. `SKILL.md:73` 봉투 조립(`project_id`·`module` 추가)도 같은 JSON.
- `wbs-nlevel-parse export` → import v2.2.
- `wbs-parse --tasks-all` → `dep-analysis` 입력(파이프). `wbs-parse --dev-config` → `wbs-validate --dev-config-json` 입력.
- `check_oasis_contract --json` → `hook_post_edit` 입력.
- `decision-log.py` 형식 ↔ `dflow-merge/scripts/decisions.sh`(셸 재구현) 상호 호환.
- 나머지(adr·flyway·mantine·ui)는 사람/LLM 이 읽는 평문 — 줄 단위 일치는 불필요, exit code 는 유지.

---

## 4. 중복 복사본 비교: `dflow-export` vs `dflow-wbs`

| 파일 | diff 줄(`<`·`>` 합) | 차이 요약 |
|---|---|---|
| `dep-analysis.py` | 36 | export 판 = `_wbs_status` import + **`--docs-dir`** + 의존 충족 임계를 상태머신으로 결정(6상태면 `[im]` 이상, 5상태/미지정이면 `[xx]`만) + 출력에 `satisfied_states`. dflow-wbs 판은 `[xx]` 고정(`dep-analysis.py:388`, SKILL.md:68·142 가 이 한계를 경고) |
| `wbs-validate.py` | 61 | export 판 = **4단계 지원**(`#{3,5}` + `TSK-\d+(?:-\d+)+`), 블록 경계를 「자기 이하 레벨의 다음 헤딩」으로 계산, **펜스 코드 인식**(`_wbs_md`), 닫히지 않은 펜스의 silent undercount 방어. dflow-wbs 판은 3단계만 |
| `wbs-parse.py` | 201 | export 판 = `_wbs_status`·`_wbs_md` 사용, **`--export` 모드 신설**(전 계층 Phase/WP/ACT/Task 17키 노드, `parse_nodes` 외 약 140줄), 펜스 인식 블록 추출, `state.json` 덮어쓰기. 나머지 모드는 동일 |

**정본 판단 (SKILL.md 근거)**
- `dflow-wbs/SKILL.md:72-77`: 「DEV-02·DEV-03 해소판 스크립트는 `/dflow-export` 스킬에 동봉… 위 제약 표는 이 스킬의 동봉 스냅샷(`dflow-wbs/scripts/`) 기준으로 여전히 유효」.
- `dflow-wbs/SKILL.md:466`: 「`/dflow-export` 에 구현… **이 스킬의 동봉 스냅샷은 구판**이라 N회 호출 절차를 유지한다 — 스냅샷을 신판으로 교체할 때 이 절차를 한 번의 `--export` 호출로 대체한다」 → **교체는 계획돼 있었으나 아직 안 됨**.
- `dflow-wbs-nlevel/SKILL.md:3,10`: 「3~4단 기존 흐름은 dflow-wbs(**동결**)」 — 동결은 규약·스킬 범위 선언이며 스크립트가 안 쓰인다는 뜻이 아니다(dflow-wbs/SKILL.md 가 지금도 `dflow-wbs/scripts/*.py` 를 호출: :47,48,51,56,57,591,592).
- → **정본 = dflow-export(신판)**. dflow-wbs 판 3개(`wbs-parse`·`wbs-validate`·`dep-analysis`)는 export 판의 부분집합이므로 node 이식은 **export 판 하나만** 만들고 `dflow-wbs/SKILL.md` 의 호출 경로를 export 쪽 node 스크립트로 바꾸는 것(= :466 이 예고한 교체)이 가능하다. 단점: 구판 동작과의 차이(4단계 인식·`[xx]` 외 충족 판정·ID 정규식이 `TSK-\d+(?:-\d+)+` 로 넓어짐)가 dflow-wbs 흐름에 반영된다 — SKILL.md:62-77 제약 표도 함께 고쳐야 한다. **사용자 결정 필요**.
- `decision-log.py`·`prd-validate.py` 는 export 쪽에 사본이 **없다**(dflow-wbs 에만 존재) → 별도 이식.

---

## 5. 죽은 코드 후보 (이식 제외 권고)

| 파일 | 근거 |
|---|---|
| `analyze-queries/scripts/orchestrator.py`(681) | ① 필수 모듈 `query_cache`(경로 `docs/common/tools/query-cache`)가 리포에 없음 → ImportError. ② `analyze-queries/SKILL.md:26`: query-cache·orchestrator 의존성 제거됨. ③ 호출처 grep 0건(죽은 phase3-generator 제외) |
| `analyze-service/scripts/phase2-generator.py`(458), `phase3-generator.py`(450) | `analyze-service/SKILL.md:93` 「호출하지 않는다」, `references/phase3.md:200` 주석 언급뿐, 의존 대상(`sql_mapping_integration.py`·`query_cache.py`·`orchestrator.py`)이 없거나 죽음 |

합계 1,589줄(전체의 15%). 이식 대신 삭제·보관 이동을 사용자에게 제안(삭제는 사용자 승인 필요).

---

## 6. python 이 없는 윈도우에서의 실패 양상

전제: 윈도우에는 node 만 있음. `python3` 은 「명령 없음」(Git Bash exit 127) 또는 Microsoft Store 스텁(스토어 안내 후 실패 — `free-port.sh:13` 주석이 같은 문제를 언급)이다.

| 스킬 | 실패 양상 | 범위 |
|---|---|---|
| **oasis-contract-check** | ① `.claude/settings.json` 훅이 **편집마다** 비정상 종료(편집 자체는 진행 — PostToolUse 비차단, 추정). 검사 결과가 모델에 주입되지 않아 **계약 위반 조기 탐지가 사실상 꺼진다**. ② `.dflow-gates` 의 OASIS 검사 줄(full·모듈 12줄)이 실패 → 게이트 명령 비정상 종료(게이트 통과 불가인지 건너뜀인지는 heavy.sh 미확인). ③ 수동 실행·selftest 불가 | **전체 기능 불가** |
| **mantine-aggrid-ui** | 3개 도구 전부 실행 불가: 버전 맞춤 문서 조회·`audit`(FE 검수 필수, Screen-Performance-Guide §7-11)·`ui_docs coverage/full`(공통 컴포넌트 등록 시 필수). references/*.md 지식은 그대로 읽을 수 있어 **검수 자동화만 사라진다** | 도구 불가, 문서 열람 가능 |
| **flyway-migration-add** | `status`·`scaffold`(채번·파일 생성)·selftest 불가. 수동 채번 시 방언 간 번호 드리프트 위험(스킬 존재 이유) | 전체 불가 |
| **adr-write** | `status/new/lint/index` 전부 불가(수동 작성은 가능) | 전체 불가 |
| **dflow-export** | `wbs-validate`·`wbs-parse --export`·`dep-analysis`·봉투 조립(`python3 -`) 전부 불가 → **WBS 업로드 경로 차단**, pytest 불가 | 전체 불가 |
| **dflow-wbs** | 생성 후 검증(`prd-validate`·`wbs-parse --dev-config`·`wbs-validate`·`dep-analysis`)·결정 로그(`decision-log append`)·yaml/xlsx 입출력 불가. **WBS 문서 생성 자체(LLM 작성)는 가능** | 일부(생성 가능, 검증·입출력 불가) |
| **dflow-wbs-nlevel** | validate·export·봉투 조립 불가 → 생성은 가능하나 **업로드 게이트 통과 불가** | 일부 |
| **analyze-queries / analyze-service** | 영향 없음(스크립트를 쓰지 않음) | 영향 없음 |
| 스킬 밖 | `dflow-dev/scripts/junit-count.sh`: python 없으면 `JUNIT_SUMMARY_NOPY` exit 2(테스트 집계 불가). `free-port.sh` 는 node 폴백이 있어 무영향 | 일부 |

---

## 7. 이식 시 주의 체크리스트 (모든 레인 공통)

1. **인코딩·줄끝**: `readText(p)` = `readFileSync(p,'utf8')` + BOM 제거 + `\r\n?`→`\n`. `writeText` 는 LF. (CSV 입력은 `utf-8-sig` — dflow-wbs/SKILL.md:290.)
2. **종료코드 보존**: argparse 사용 오류 = 2, 검사 위반 = 1. 큰 JSON 을 파이프로 쓰는 `wbs-parse --export` 는 `process.exit()` 직접 호출 전에 stdout 플러시(`process.exitCode` 사용 권장).
3. **JSON 출력 형식**: `indent=2` 호출은 `JSON.stringify(x,null,2)` 와 동일. 들여쓰기 없는 호출(wbs-parse 줄 936·1206, decision-log 줄 316·326 등)만 공백 차이 — 바이트 비교 대상이 아니면 무해. `--export` 는 indent=2 라 안전.
4. **골든 대조(권장)**: macOS 에는 python 이 있으므로 **같은 입력(`docs/mdm/wbs.md` 등 실제 wbs + 합성 픽스처)으로 python 판과 node 판 stdout 을 diff** 하는 시험을 둔다. 계약 v2.1 export 가 byte 동일이어야 하는 이유. oasis 도 `--json` 결과 diff.
5. **`\w`·`\b` 유니코드**: 한글이 식별자·ID 에 들어가는 곳(nlevel 제목·wbs-parse `_slugify`)은 JS `u` 플래그 + `\p{L}\p{N}_` 치환 여부를 케이스별 판단.
6. **`re.match`/`re.fullmatch`/`$`**: JS 에서 앵커를 명시 변환.
7. **파일 열거 순서**: `glob`/`rglob` 순서는 보장 없음 — 스크립트가 `sorted()` 를 쓰므로 JS 도 코드포인트 순(`<` 비교)으로 정렬(`localeCompare` 금지).
8. **Node 최소 버전**: platform-support.md 는 node 18+ 선언. `node:test`(18+), `fetch`(18+), `util.parseArgs`(18.3+), `readdirSync recursive`(18.17+/20.1+), `fs.cpSync`(16.7+), `zlib.crc32`(22.2+ — xlsx 쓰기엔 CRC 테이블 직접 구현) → **하한 18.17** 권장.
9. **파일 형식**: `.mjs`(근처 `package.json` 의 `type` 에 의존 안 함) 권장. 하이픈 파일명은 ESM import 문제없음 → 시험이 `importlib` 트릭 없이 `import { parseNodes } from './wbs-parse.mjs'`.
10. **윈도우 `.bin` 실행**: `ui_docs check-examples` 의 tsc 호출은 `process.platform==='win32'` 분기.
11. **호출 문서도 같은 크기의 작업**: SKILL.md·README·RULE.md·FE 가이드·`.dflow-gates`·`settings.json` 의 `python3 …` 를 `node …` 로 바꾸는 작업(§1.2 표가 변경 목록). platform-support.md 의 「python3 선택」 표기도 정리.

---

## 8. 묶음(레인) 제안

크기 = 이식(+시험 포함) 후 예상 줄 수.

| 레인 | 포함 | 예상 줄 수 | 크기 | 선후·의존 | 비고 |
|---|---|---|---|---|---|
| **L0 공용 헬퍼** | `readText/writeText`, 인자 파서(또는 `parseArgs` 래퍼+종료코드 2 규약), 이진 힙, 정렬 walk, CLI 시험 헬퍼 | ~200 | S | 선행(다른 레인이 import). 인터페이스만 합의하면 병렬 시작 가능 | 위치 후보 `.claude/skills/_shared/node/`(추정; `_shared/` 이미 존재) |
| **L1 oasis-contract-check** | `check_oasis_contract.mjs`·`hook_post_edit.mjs`(검사기 import 호출)·selftest, `settings.json`·`.dflow-gates`·SKILL.md·RULE.md 수정 | 코드 ~650 + 문서 | **M** | 독립. **가장 먼저** | 훅 전환 시 mac 에서 python 판과 `--json` diff. 훅 JSON 출력 계약 유지 |
| **L2 mantine-aggrid-ui** | `aggrid_docs.mjs`(audit 규칙 포함)·`mantine_docs.mjs`·`ui_docs.mjs` + 문서 호출 12곳 수정 | 코드 ~1,500 | **L** | L0 의존. 내부 분할 가능(aggrid 단독 1레인 + mantine·ui 1레인) | audit 규칙은 같은 샘플 소스로 python/node 출력 diff 로 검증. `~/.cache/*` 캐시 포맷은 호환 유지 권장 |
| **L3 flyway + adr** | `migration_tool.mjs`·`adr_tool.mjs` + selftest 2 | 코드 ~600 | **M** | L0 의존, 독립 | 줄끝 정책(`.gitattributes` 확인 후 LF 고정) |
| **L4 dflow-export 계열(정본)** | `_wbs_md`·`_wbs_status`(+`state-machine.json` 동봉 유지)·`wbs-parse`·`wbs-validate`·`dep-analysis` + 시험 3파일(61건) | 코드 ~2,200 + 시험 ~930 | **L**(최대) | L0 의존. 내부 분할: ⓐ `_wbs_md`·`_wbs_status`·`wbs-validate`+시험(≈600) ⓑ `wbs-parse` 비-export 모드(≈650) ⓒ `wbs-parse --export`+`dep-analysis`+시험(≈800) | **export 출력은 서버 계약** — 골든 대조 필수. SKILL.md 인라인 `python3 -` 봉투 조립(:73)도 포함 |
| **L5 dflow-wbs 잔여 + nlevel** | `decision-log`·`prd-validate`·`wbs-nlevel-parse`+시험 19건, dflow-wbs SKILL.md 호출을 L4 산출물로 교체(§4) | 코드 ~1,000 + 시험 ~250 | **M~L** | L4 의 `readText`·상태 어휘 재사용(구판 3개는 이식 안 함) | `decision-log` 는 python 판 decisions.md 와 상호 validate 시험. 구판 폐기는 사용자 결정 |
| **L6 인라인 python → node** | SKILL.md 인라인 5곳: yaml 읽기(node 에 yaml 파서 없음 → 소형 파서 또는 JSON 변환 요청으로 문서화), xlsx 읽기(zip 중앙디렉터리+`zlib.inflateRawSync`), xlsx 쓰기(`deflateRawSync`+CRC32), `python3 -` 봉투 2곳(→ `node -e`), `junit-count.sh` 임베드 python | ~400 | M | L4 와 독립, 후순위 | 「의존성 0」(dflow-wbs/SKILL.md:296) 유지하려면 zip 직접 구현 |
| **제외** | `orchestrator.py`·`phase2/3-generator.py`(1,589줄) | 0 | — | 삭제/보관 사용자 결정 | §5 |

- **합계(추정)**: 이식 코드 ≈ 6,000줄 + 시험 ≈ 1,500줄. python 28개 10,707줄에서 죽은 1,589줄과 dflow-wbs 구판 3개 1,735줄을 빼면 7,383줄(×1.0~1.1).
- **권장 투입 순서**: L0 → (L1 ∥ L3) → L2 → L4 → L5 → L6. 윈도우 사용자 영향이 큰 순서(훅·FE 게이트·번호 채번 → 업로드 → 부가).
- **전환 방식(권장)**: python 판을 즉시 지우지 말고 레인마다 ① node 판 추가+골든 대조 시험 통과 ② 호출 문서를 node 로 교체 ③ python 판 삭제는 별도 커밋(사용자 승인).

---

## 9. 28개 밖의 python 의존 (참고, 조사만)

- `dflow-dev/scripts/junit-count.sh`: python3/python 필수(줄 49·89-92), 임베드 pyscript 를 임시 파일로 만들어 실행. 없으면 `JUNIT_SUMMARY_NOPY` → L6.
- `dflow-dev/scripts/free-port.sh`: python 첫 선택, node 폴백 이미 구현 — 무조치.
- `tools/bp-sync`·`tools/bp-sync-schedule`: 확장자 없는 python 스크립트(plist 생성 → macOS launchd 성격, 추정). 이번 범위 밖.
- `scripts/perf/framework/*.sh`·`scripts/db-snapshot/import.sh`: python 호출 포함(미조사, 범위 밖).
- `.claude/skills/bpmn-skill/install.sh`: junit-count.sh 주석이 python3 필수 요구라 하나 열어보지 않았다(미확인).

## 10. 미확인·추정 사항

- `.dflow-gates` 를 처리하는 `heavy.sh` 가 명령 비정상 종료를 어떻게 취급하는지(게이트 실패 vs 건너뜀) 열어보지 않았다.
- 윈도우 Claude Code 의 훅 실행 셸(`$CLAUDE_PROJECT_DIR` 확장)과 PostToolUse 비정상 종료의 비차단 여부는 문서·경험 기반 추정이며 실기 확인 안 했다.
- `wbs-parse.py` dev-config 템플릿 경로가 옛 플러그인 구조 잔재라 항상 내장 폴백이 쓰인다는 판단은 코드 읽기만으로의 추정.
- `prd-validate.py` 종료코드와 `aggrid_docs.py` audit 규칙 40여 개의 정규식 호환성은 하나씩 점검하지 않았다(비호환 문법 `(?i)`·`\Z` 등은 grep 으로 전수 확인).
- 사용 빈도 판단(g)은 SKILL.md·RULE.md·가이드의 강제 문구와 git 이력(`adr-write`·`oasis` 1커밋=템플릿 스냅샷, `mantine-aggrid-ui` 38커밋=활발) 기준의 추정이다.
