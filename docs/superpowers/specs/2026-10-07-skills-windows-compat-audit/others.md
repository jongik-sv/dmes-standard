# 윈도우 호환 점검 (스크립트 없는 스킬·설치·시험) — audit-others

기준일 2026-10-07 · 대상 리포 `/Users/jji/project/dmes-wt/skills-win/.claude/skills` · 읽기만 함(수정 없음).
전제: 대상 PC 에는 node + Git Bash(bash·sed·grep·gawk·find·sort·tr·cut·date·stat·mktemp·curl·base64·xargs·openssl)만 있다. python·perl·jq·lsof·pgrep·pkill·flock·macOS 명령은 없다.
python 파일 내부는 읽지 않았다. 호출 위치(SKILL.md 줄)만 적었다. 근거 없는 판단은 「추정」으로 표시했다.

핵심 한 줄: 문서에 적힌 셸 명령은 대부분 Git Bash 에서 돈다. 깨지는 것은 (a) `python3` 호출 전부(윈도우에는 `python3` 이름이 없고 python 자체가 없다고 보는 전제), (b) `weekly-report` 의 BSD `date -v`, (c) `./tools/bp-sync` (python shebang 스크립트), (d) 시험 스크립트의 jq 의존이다.

---

## 1. 스킬별 표

심각도: 실행불가 = 그 기능이 윈도우에서 아예 못 돈다 / 일부기능 = 일부 단계만 깨진다 / 문서만 = 안내 문구 정정이면 된다.
크기: S = 몇 줄 / M = 파일 한두 개 손질 / L = 별도 이전 작업.

| 스킬 | 필요 런타임 | 깨지는 지점(파일:줄·명령) | 심각도 | 수정 방향 | 크기 |
|---|---|---|---|---|---|
| weekly-report | bash, git, date | `weekly-report/SKILL.md:39-40` `date -v-${back}d -v-6d` (BSD 전용, GNU date 는 `-v` 를 몰라 오류). 44줄에 「GNU 면 `date -d` 로 바꾼다」 안내만 있고 대체 코드는 없음 | 일부기능(기간 계산 단계) | GNU 판 한 줄 병기: `start=$(date -d "-${back} days -6 days" +%F)`·`end=$(date -d "-${back} days" +%F)`. 또는 `date -v` 시도 후 `date -d` 로 넘기는 분기(`date -v-0d >/dev/null 2>&1 &&` BSD / 아니면 GNU). 인자로 기간을 주면 이 단계를 건너뛰므로 우회도 가능 | S |
| bp-update-intake | bash, find, grep, sort, **python**(`./tools/bp-sync`) | `bp-update-intake/SKILL.md:41` `./tools/bp-sync` — `tools/bp-sync` 는 `#!/usr/bin/env python3` 스크립트(1줄). 윈도우에는 python 이 없고 shebang 도 쓰지 않으므로 직접 실행 불가. 42줄 `find … -newermt "<날짜>"` 는 GNU find(Git Bash) 지원이라 OK | 실행불가(미러 동기화 단계) | `tools/bp-sync` 를 node 로 이전하거나(다른 조사 범위), 윈도우용 호출 한 줄 `node tools/bp-sync.mjs` 안내를 병기. `bp` CLI 의 `bp sync` 직접 호출 안내를 대체 경로로 문서화 | M(코드 이전은 L) |
| bp-workspace-sync | bash, **python**(`./tools/bp-sync`), npm, bp CLI | `bp-workspace-sync/SKILL.md:20,60,71,77-80,121-123` `./tools/bp-sync …` 전부 같은 문제. 64줄 `~/projects/dkowork/cli`(소유자 개인 경로, 윈도우 사용자에게 무의미·`npm link` 심링크 설명). 89줄 `ls`, 91줄 `grep -rn` 는 Git Bash 에서 OK | 실행불가(미러 단계) / 64줄은 문서만 | 위와 동일. 64줄 개인 경로는 `<CLI 소스 경로>` 로 바꾸고 「윈도우는 `npm link` 가 junction 이라 …」 같은 단정은 하지 않는다(추정이므로 삭제 권장) | M |
| classify-by-system | bash(for·ls) | `classify-by-system/SKILL.md:70-73` `for module in $(ls {areaId}/); do … ls …/screens/*.md` — Git Bash 에서 문제없음. PowerShell 이면 문법이 다름. `178`,`194` 는 설명 문구 | 문서만(PowerShell 로 읽을 때) | 「Git Bash 기준」 한 줄 표기, 또는 `ls`·`for` 대신 Glob 도구 사용 지시(어차피 에이전트가 Glob 으로 할 수 있음) | S |
| analyze-service | 없음(LLM 이 Read/Glob 으로 수행). 죽은 코드: node, python | `analyze-service/SKILL.md:93` 「phase1-analyzer.js / phase2-generator.py / phase3-generator.py 는 호출하지 않는다」 — **호출하는 곳 없음**(`SKILL.md:93`, `references/phase1.md:9`, `references/phase3.md:200` 은 설명 언급만). 아래 2절 참조. 그 밖의 셸 예시는 `SKILL.md:72-74` 의 `glob:` 표기뿐이라 문제 없음. `SKILL.md:254`·`references/phase3.md:321` 의 `psql·sqlcmd` 는 「쓰지 말라」 문구 | 문제 없음(스크립트는 사문) | 수정 불필요. 윈도우 설치 대상에서 `scripts/` 를 빼거나 「사용 안 함」 표기 | S |
| analyze-queries | python(`scripts/orchestrator.py`) — **호출 문서 없음** | `analyze-queries/SKILL.md:26` 에서 query-cache·orchestrator 의존 제거됨이라고 명시. orchestrator.py 는 `docs/common/tools/query-cache` 에 의존(리포에 없을 가능성, 「추정」) | 문제 없음(사문) | 수정 불필요 | S |
| adr-write | **python3** | `adr-write/SKILL.md:48,56,106,112,120,155` `python3 …adr_tool.py|selftest.py` | 실행불가(린트·채번·인덱스) | python → node 이전 결과가 나오면 호출줄 6곳을 `node …/adr_tool.mjs` 로 교체. 이전 전까지는 SKILL.md 에 「python3 없으면 `py -3`」 같은 임시 병기(python 설치 전제라 전제와 충돌 → 비권장) | M(호출줄) + L(스크립트) |
| flyway-migration-add | **python3**, Java·gradlew | `flyway-migration-add/SKILL.md:50,67,80,81,143` `python3 …migration_tool.py|selftest.py`. **114줄** `JAVA_HOME=~/.sdkman/candidates/java/21.0.10-sapmchn ../gradlew …` — sdkman 은 윈도우에 없고 버전 디렉터리까지 박힘(macOS 개인 경로) | 실행불가(스크립트) / 114줄은 일부기능 | 114줄: `JAVA_HOME` 접두를 지우고 「JDK 21 이 PATH·JAVA_HOME 에 잡혀 있어야 함」 으로 바꾼다. 윈도우는 `../gradlew.bat` 이 아니라 Git Bash 에서 `../gradlew` 도 동작(`gradlew` sh 래퍼 사용, 추정). python 호출줄은 node 이전 후 교체 | S(114줄) + M |
| dflow-wbs | **python3**, 임의 xlsx 읽기용 인라인 python, curl | `dflow-wbs/SKILL.md:47,48,56,57,591,592` `python3 …/prd-validate.py|wbs-parse.py|wbs-validate.py|dep-analysis.py`. **`56-57` `/tmp/dev-config.json`**(Git Bash 는 `/tmp` 가 있어 동작하나 에이전트가 PowerShell 로 쓰면 실패, 규칙 6 은 `${TMPDIR:-/tmp}` 우선). `287` `python3 -c "import yaml,json …"`(pyyaml 의존). `294-` 인라인 python(zipfile·ET 로 xlsx 읽기), `502-` 인라인 python(zipfile 로 xlsx 쓰기 — `--export-xlsx`) | 실행불가 | 호출줄은 node 이전 뒤 교체. 56-57 은 `{scratchpad}` 로(591줄과 통일). 287·294·502 는 node 로 재작성(`js-yaml`, `exceljs`/`adm-zip` 은 새 의존 → 사용자 결정 필요)하거나 윈도우는 `--export-xlsx`·xlsx 입력 미지원이라고 명시 | M(56-57) + L |
| dflow-wbs-nlevel | **python3**, curl | `dflow-wbs-nlevel/SKILL.md:210,221` `python3 …wbs-nlevel-parse.py`, `225` `python3 - <<EOF`(JSON 봉투 조립). 단 heredoc 에서 `$SCRATCHPAD` 치환은 Git Bash OK | 실행불가 | node 이전 후 교체. 225-229 heredoc 은 `node -e` 또는 export 가 `--project-id` 를 받게 하는 방식 권장(dflow-export 의 `--project-id` 옵션과 통일) | M + L |
| dflow-export | **python3**, curl | `dflow-export/SKILL.md:51,57,58,65` `python3 …wbs-validate|wbs-parse|dep-analysis.py`, `73` `python3 - <<EOF`, `119` `python3 -m pytest`(시험). 46줄에 `/tmp` 금지·scratchpad 사용을 이미 명시(좋음). 85줄 curl+`-d @"$SCRATCHPAD/…"` 는 Git Bash OK(경로가 `C:\` 형이면 `cygpath -m` 필요할 수 있음, 추정) | 실행불가 | 위와 동일. 73줄 인라인 python 은 `jq` 도 없으므로 `node -e` 로 | M + L |
| mantine-aggrid-ui | **python3**(문서 조회 스크립트 3종), node/pnpm | `mantine-aggrid-ui/SKILL.md:34,38-46` `python3 $D/mantine_docs.py|aggrid_docs.py|ui_docs.py`, `references/aggrid.md:3`, `references/mantine-catalog.md:5`, `references/mantine-v9-changes.md:3`, `references/screen-patterns.md:222` 도 같은 호출. `SKILL.md:34` 「결과는 `~/.cache/` 에 7일간 캐시」(Git Bash 의 `~` 는 동작하나 파이썬 내부 구현은 미확인). `SKILL.md:50` `grep -n … node_modules/.pnpm/@mantine+core@*/…` glob 은 Git Bash OK. ts 는 `references/examples/*/api.ts·types.ts` 뿐(예제 코드, 실행 대상 아님). `package.json` 없음 | 일부기능(설치본 .d.ts·문서 조회가 막힘, 코드 작성 지침은 유효) | python → node 이전 대상. 이전 전에는 SKILL.md 에 「python 없으면 mantine.dev/llms.txt 를 curl 로 직접」 폴백 한 줄. `~/.cache` 는 node 이전 때 `os.homedir()` 로 | L |
| oasis-project-support | 없음(문서·참조 중심), `rg` | `oasis-project-support/SKILL.md:12` `rg --files -g '*.bpmn'` 등 ripgrep 예시 — Git Bash 에 rg 는 기본 없음(Claude Code 가 grep 도구를 내장하므로 「추정」 실사용엔 영향 작음). `README.md:15,19` `mkdir -p ~/.claude/skills && cd …`(Git Bash OK). `references/upstream/*` 의 `~/oasis/…`, `./gradlew build` 는 업스트림 원문 | 문서만 | 12줄에 「rg 없으면 grep -rn」 병기 | S |
| bpmn-skill | node(bpmn-tool), curl | 2절 참조 | 문서만 | 2절 참조 | S |
| generate-bpa | bpmn-tool(npm), bash | `generate-bpa/SKILL.md:476-478` `echo '<json>' \| bpmn-tool create > …`, `cat … \| bpmn-tool create`. Git Bash 에서는 동작(npm 전역 bin 은 sh 래퍼가 함께 설치됨, 「추정」). PowerShell 이면 `echo` 파이프가 UTF-16/BOM 을 넣어 한글 JSON 이 깨질 수 있음(「추정」). 317줄 `wc -l` OK | 문서만 | 「Git Bash 에서 실행」 한 줄. 한글 JSON 은 임시 파일 경유를 기본으로(이미 478줄에 권장 있음) | S |
| git-commit | git | `git-commit/SKILL.md:29-31,125-127` git status·diff·add·commit 뿐. 127줄 `-m "…" -m "…"` 따옴표 여러 줄은 Git Bash OK, PowerShell 은 줄바꿈 인용 규칙이 다름(「추정」) | 문서만 | 수정 불필요(Git Bash 전제). 여러 줄 메시지는 `-m` 반복이 이미 안전 | S |

### 문제 없는 스킬(한 줄 모음)

analyze-custom-class(`mcp__serena__…`·Read/Grep 지시뿐, 셸 명령 없음) · analyze-plsql · analyze-table-schema · analyze-trigger · analyze-view · define-process-groups · generate-legacy(`/generate-bpa` 위임 안내뿐) · generate-process-group · issue-brief · meeting-minutes · _shared(`platform-support.md` 는 정본 문서이며 명령 예시 없음).
위 스킬은 SKILL.md·references·templates 에서 macOS 전용 명령(open·pbcopy·sed -i ''·stat -f·date -v·osascript), `/Users/…` 하드코딩, `/tmp` 지시를 찾지 못했다. `generate-legacy/templates/legacy_analysis_report_template.md:69-72` 의 `find` 는 C# 서비스 메서드 이름(findXxx)이지 셸 명령이 아니다.

---

## 2. 설치 스크립트·node 코드·python subprocess

### bpmn-skill/install.sh · install.ps1

| 파일 | 윈도우 동작 | 비고 |
|---|---|---|
| `bpmn-skill/install.sh` (7줄) | Git Bash 에서 동작. `$HOME` 은 `C:\Users\<이름>` 의 MSYS 경로(`/c/Users/<이름>`)로 풀리고 `mkdir -p`·`curl -fsSL` 도 Git Bash 에 있음. 파일이 `$HOME/.claude/skills/bpmn-skill/SKILL.md` 로 저장되어 `%USERPROFILE%\.claude\skills\` 와 같은 폴더(홈이 같을 때) | 문제 없음. 홈이 OneDrive 로 리디렉션된 PC 는 `$HOME` 과 `%USERPROFILE%` 이 어긋날 수 있다(「추정」) |
| `bpmn-skill/install.ps1` (8줄) | PowerShell 5.1 이상에서 동작. `$env:USERPROFILE`, `New-Item`, `Invoke-WebRequest` 는 표준. PS 5.1 의 `Invoke-WebRequest -OutFile` 은 UTF-8 본문을 바이트 그대로 저장하므로 한글 SKILL.md 도 안전 | 문제 없음. 두 스크립트 모두 **리포 안의 SKILL.md 가 아니라 GitHub 원본(thecodinglog/bpmn-skill)을 내려받는다**. 리포에 이미 SKILL.md 가 들어 있으므로 설치 불필요(`bpmn-skill/README.md` 가 안내하는 사용자 레벨 설치용). 실행 정책(ExecutionPolicy) 때문에 `.ps1` 직접 실행이 막히면 `irm … \| iex` 형태를 쓴다(README 가 이미 그렇게 안내) |
| `bpmn-skill/SKILL.md` | `bpmn-tool` 은 `npm install -g @cothe/bpmn-tool`(Node ≥ 18). 윈도우에서도 동작. 28-51줄 `echo '<json>' \| bpmn-tool create > out.bpmn` 도 Git Bash OK | 한글 JSON 은 PowerShell `echo` 파이프 인코딩 주의(`generate-bpa` 항목과 동일) |

### analyze-service/scripts/phase1-analyzer.js (498줄)

- 호출처 없음(위 표 참조: `SKILL.md:93` 이 「호출하지 않는다」 명시). 부산 시절 GLUE 전용 코드.
- 코드 자체의 윈도우 문제: **거의 없음**. `fs`·`path` 만 사용하고 모든 경로를 `path.join`·`path.normalize`·`path.dirname` 으로 조립(`:48,62,102,296,297,313,363,417,458,466`). `child_process`·`execSync`·`spawn` 호출 없음. 하드코딩 `/` 분할(`split('/')`) 없음. 전부 상대경로(`docs/analysis/service/…`)라 cwd 가 리포 루트면 동작.
- 걸릴 만한 곳: 출력에 이모지(`console.log('✅ …')`, `:305,473-492`)가 있어 cp949 콘솔에서 글자가 깨질 수 있다(「추정」, 동작엔 영향 없음). `:244` `serviceName.replace('-service','')` 는 경로 구분자와 무관.
- 결론: 수정 불필요(사문). 윈도우에서도 돈다.

### analyze-service phase2/3 python 의 subprocess

- `analyze-service/scripts/phase2-generator.py:314` `subprocess.run([sys.executable, 'docs/common/tools/sql_mapping_integration.py', …], timeout=30)` — 인터프리터는 `sys.executable` 이라 윈도우에서도 python 만 있으면 맞다. 대상 스크립트 `docs/common/tools/sql_mapping_integration.py` 는 이 리포에 없을 가능성이 높다(`if not os.path.exists … return` 으로 건너뜀).
- `phase3-generator.py:69` `[sys.executable, 'docs/common/tools/query-cache/query_cache.py', 'sync']`, `:92` `[sys.executable, '.claude/skills/analyze-queries/scripts/orchestrator.py', 'fetch-queries', …]` — 외부 셸 명령 없이 python 만 부름. 경로는 `os.path.join` 이라 구분자 문제 없음.
- 외부 명령(셸·git 등)을 부르는 subprocess 없음. 다만 이 python 들은 SKILL.md 가 호출하지 않는 사문이며, 호출한다 해도 python 이 없는 대상 PC 에서는 못 돈다.
- `analyze-queries/scripts/orchestrator.py` 도 호출 문서 없음(`SKILL.md:26`).

### mantine-aggrid-ui/scripts

- 파일: `aggrid_docs.py`(44.8K)·`mantine_docs.py`(11.7K)·`ui_docs.py`(13.5K)·`audit-exceptions.json`. **ts 파일·package.json 은 scripts 에 없다**(리포 전체 `mantine-aggrid-ui` 아래에도 package.json 없음).
- 호출 방식: 전부 `python3 $D/…py` (`SKILL.md:34,38-46`). 윈도우에서는 python 이전이 해결되기 전까지 `M search/get/grep`, `A search/get/types/audit`, `U index/get/check-examples` 가 모두 안 돈다. 스킬 §6 의 **필수 단계**(`M audit`·`A audit` — `SKILL.md:95`)도 막히므로 영향이 크다 → L.
- 내용 미확인(지시): `~/.cache/` 캐시 경로, `src/frontend/node_modules/.pnpm/...` 탐색이 python 내부에서 어떻게 구현됐는지는 읽지 않았다. node 이전 조사 쪽에서 `os.path.expanduser('~')`, 경로 구분자, `.pnpm` 의 `@mantine+core@*` glob 처리를 확인해야 한다.

### bp-sync 계열(스킬 문서가 호출하는 리포 도구, 범위 밖이지만 영향이 커서 기록)

- `tools/bp-sync`(python 스크립트, 확장자 없음) — 윈도우에서 `./tools/bp-sync` 불가. 호출: `bp-update-intake/SKILL.md:41`, `bp-workspace-sync/SKILL.md:20,60,71,77-80,121-123`. 이전 대상(별도 조사 필요).
- `tools/bp-sync-schedule`, `tools/e2e-clean-data.sh` 는 읽지 않았다.

---

## 3. 시험 스크립트 요약 (Git Bash 가정)

공통 사실: 거의 모든 coordinator 시험이 `lib/compat.sh` 를 source 하고 `mktemp -d "${TMPDIR:-/tmp}/…"` 를 쓰며 격리용 가짜 `orca` 를 PATH 맨 앞에 둔다. `jq` 는 **제품 코드 자체가 쓰는 전제 도구**라(`_shared/platform-support.md` 표: 윈도우에서도 jq 설치 필요) 이 전제(「python·perl·jq 없음」)에서는 jq 줄이 있는 시험이 전부 막힌다. 아래는 jq 외의 차단 요인 위주다. 「nc」 로 보인 것은 `jq -nc` 옵션이며 실제 netcat 호출은 없었다.

| 시험 파일 | 줄 수 | 윈도우 Git Bash 판정 |
|---|---|---|
| coordinator/tests/compat.sh | 160 | compat.sh 자체 시험으로 GNU·Git Bash 경로를 흉내 낸다(문서에 윈도우 시험 의도 명시). 시험 안의 `pgrep`·`pkill`·`ps -axo`·`stat -f`·`lsof` 는 가짜 PATH 로 재현하는 대상(15·6·6·1·6곳)이라 실행엔 필요 없을 가능성이 높다(「추정」). `ln -s` 2곳과 `/Users/x` 4곳은 문자열. jq 사용은 없음. **일부 돈다(최우선 실기 확인 대상)** |
| coordinator/tests/console-keys-off.sh | 184 | jq 11곳·`tmux` 가짜(send-keys 로그)·가짜 orca. jq 필수 → **jq 없으면 불가**, 있으면 가짜 도구만 쓰므로 가능 |
| coordinator/tests/console-keys.sh | 1022 | jq 42곳, `python3 evil.py`(850,941줄)는 가림 시험용 문자열이라 실행 안 함, `sed -i` 는 설명 주석만(942줄 「쓰지 않는다」), `touch -t` 1곳(BSD·GNU 공통 형식), `ln -s` 1곳(244줄, 심볼릭 링크 시험 → Git Bash 기본이 복사라 **그 케이스는 의미가 달라짐**), `pkill` 1곳. **jq 있어야 함 + 심링크 케이스 불일치** |
| coordinator/tests/console-poll.sh | 847 | jq 42곳, `compat_pgrep_s`·`compat_pkill_s`(compat.sh 가 제공) 사용, GNU `timeout`·`kill -0` 6곳(네이티브 pid 에서 부정확 가능, `platform-support.md` 규칙 5). 폴러 후손 종료(`pgrep -P`)는 알려진 한계. **부분 통과 예상** |
| coordinator/tests/console-redact.sh | 395 | jq 없음. `ln -s "$(command -v tr)"`·`openssl`·`gawk` 로 PATH shim 구성(343,362,389줄) → Git Bash 의 `ln -s` 는 복사라 **shim 은 되지만 동작이 같은지 확인 필요**(복사된 `tr.exe` 는 DLL 경로 문제 가능, 「추정」). 가림 대상 문자열의 `/tmp/npm` 은 입력값. **가장 jq 없이 돌 가능성이 높은 시험** |
| coordinator/tests/deps-sh-no-main-write.sh | 94 | `ln -s` 6곳이 시험의 본질(심링크 node_modules). Git Bash 기본(복사)에서는 시험 의도(메인 쓰기 사고)가 재현되지 않는다. `pnpm` 없으면 스스로 건너뜀(15줄). **윈도우에서는 의미 없음/건너뛰기 권장** |
| coordinator/tests/lessons.sh | 108 | jq 3곳 → **jq 필요**, 나머지는 mktemp·chmod 정도 |
| coordinator/tests/office-locks.sh | 124 | jq 4곳, `compat_pgrep`·`pkill` 3·2곳, `kill -0` 1곳 → jq + 프로세스 판정(네이티브 pid 한계) |
| coordinator/tests/office-sh.sh | 465 | jq 26곳, `pkill`·`kill -0` → **jq 필요 + 프로세스 판정 한계** |
| coordinator/tests/office-summary.sh | 306 | jq 75곳. `/Users/secret`·`/Users/jji`(47,273,280줄)은 가림 시험용 문자열이라 이식성 문제 아님. **jq 필요** |
| coordinator/tests/prompt-watch.sh | 88 | jq 3곳 → **jq 필요**(작음) |
| coordinator/tests/run-close.sh | 115 | jq 3곳 → **jq 필요**(작음) |
| coordinator/tests/screen-cache.sh | 411 | jq 25곳, `chmod` 12곳(Git Bash 에서 `chmod` 권한 비트는 NTFS 에서 무효, 「추정」 → 실행권한 시험이 어긋날 수 있음), `ln -s` 1곳, `touch -t`, `pkill`·`kill -0` → **jq 필요 + chmod·심링크 케이스 불일치** |
| coordinator/tests/term-send-safe-busy.sh | 148 | jq 3곳, GNU `timeout` 1곳 → **jq 필요** |
| coordinator/tests/term-send-safe-input-state.sh | 25 | jq·python·macOS 명령 모두 없음(고정 화면 파일 + `bash term-send-safe.sh` 만). **그대로 돈다** |
| dflow-dev/tests/mutate.sh | 69 | node 만 필요(문서 주석 「node 필요, 네트워크·도커 없음」), `mktemp -d "${TMPDIR:-/tmp}…"`. jq·python 없음. **돌 가능성 높음**(신호 한계는 `platform-support.md` 에 기록됨) |
| dflow-work/tests/console-cmds.sh | 104 | jq 12곳(44,46줄 등), `chmod`·가짜 curl → **jq 필요** |
| dflow-work/tests/watch-summary.sh | 88 | jq 4곳, `chmod` → **jq 필요** |

요약: jq 를 요구하지 않는 시험은 `compat.sh`(일부)·`console-redact.sh`·`deps-sh-no-main-write.sh`(의미 없음)·`term-send-safe-input-state.sh`·`dflow-dev/tests/mutate.sh` 5개뿐이다. 나머지 12개는 jq 가 없으면 첫 단계에서 실패한다. `/tmp` 하드코딩은 시험 안에 없다(전부 `${TMPDIR:-/tmp}`). `perl`·`lsof`·`flock`·`osascript`·`pbcopy`·`md5`·`shasum` 호출은 시험에서 발견되지 않았다. `pgrep`·`pkill` 은 `compat_pgrep_s`·`compat_pkill_s` 래퍼 경유 또는 compat.sh 시험의 재현 대상이다.

---

## 4. 확실한 몇 줄 수정 목록

(이 파일은 점검 보고서이며 아무것도 수정하지 않았다. 아래는 적용 시 바꿀 내용.)

| 파일:줄 | 바꿀 내용 |
|---|---|
| `weekly-report/SKILL.md:39-40` | `date -v-${back}d -v-6d …` 아래에 GNU 판 병기: `start=$(date -d "${back} days ago -6 days" +%Y-%m-%d)` / `end=$(date -d "${back} days ago" +%Y-%m-%d)`. 또는 `if date -v-1d >/dev/null 2>&1; then BSD; else GNU; fi` 분기. 44줄의 「GNU 면 바꾼다」 문장을 실제 코드로 대체 |
| `flyway-migration-add/SKILL.md:114` | `JAVA_HOME=~/.sdkman/candidates/java/21.0.10-sapmchn ../gradlew :aps-core:test` 에서 `JAVA_HOME=…` 접두 삭제하고 「JDK 21 을 JAVA_HOME 으로 지정해 둔 상태에서」 라는 문장으로 교체(개인 sdkman 경로 제거) |
| `dflow-wbs/SKILL.md:56-57` | `/tmp/dev-config.json` → `{scratchpad}/dev-config.json`(591-592줄과 같은 표기로 통일). jq 없는 환경에서 `"$(cat …)"` 는 Git Bash OK |
| `bp-workspace-sync/SKILL.md:64` | 개인 경로 `~/projects/dkowork/cli` 와 `npm link` 설명을 `<CLI 소스 저장소>` 로 일반화(소유자 개발 PC 전용 문구) |
| `oasis-project-support/SKILL.md:12` | `rg` 예시 뒤에 「rg 가 없으면 `grep -rn`」 한 줄 추가 |
| `classify-by-system/SKILL.md:69-74` | 코드블록 위에 「Git Bash 기준. 에이전트는 Glob 도구로 대체 가능」 한 줄 |
| `generate-bpa/SKILL.md:478` | 「Git Bash(또는 임시 파일 경유)에서 실행, PowerShell `echo` 파이프는 한글 JSON 이 깨질 수 있음」 한 줄 추가(「추정」 근거를 적어 단정하지 않을 것) |
| `analyze-service/SKILL.md:93` 주변 | `scripts/*.js·*.py` 가 사용되지 않음을 한 줄로 못박기(윈도우 설치 시 제외 가능) — 이미 93줄이 설명하므로 선택 사항 |

python 호출줄(`adr-write`·`flyway-migration-add`·`dflow-wbs`·`dflow-wbs-nlevel`·`dflow-export`·`mantine-aggrid-ui`)은 `.py` → node 이전과 한 묶음으로 바뀌어야 하므로 몇 줄 수정 목록에 넣지 않았다. 호출 위치는 1절 표의 줄 번호를 그대로 쓰면 된다. 인라인 `python3 -`/`-c`/```python 블록: `dflow-export/SKILL.md:73`, `dflow-wbs-nlevel/SKILL.md:225`, `dflow-wbs/SKILL.md:287,294,502`.
