# 엑셀 export (dflow-wbs 에서 옮김)

> SKILL.md `## 엑셀 export (--export-xlsx)` 절에서 분리. 원문 그대로.

## 엑셀 export (`--export-xlsx`) — 보고본

정본 = `wbs.md`. xlsx = **읽기 전용 파생 산출물.** wbs.md 로 되돌리지 않음 (부록 §2.6 — 바이너리는 diff·merge·검수 불가).

**용도 = "import 전 사람 검수" 하나.**
- wbs.md 는 import 후 은퇴 → wbs.md 기준 엑셀 = import 시점 snapshot, 곧 낡음.
- 운영·대외 보고본 = D'Flow export (DB 기준).
- 검수 결과 수정 = **입력 프로그램 리스트나 wbs.md 를 고쳐 재생성.** 엑셀 수정 금지.

### 데이터 출처 — wbs.md 를 직접 파싱하지 않는다

실행 중 Task 는 `docs/tasks/<ID>/state.json` 이 진실 원천, wbs.md 는 파생 사본 (부록 §7.1-F2). 따라서:

1. `node .claude/skills/dflow-export/scripts/wbs-parse.mjs {wbs} --tasks-all` 로 **Task ID 목록** 획득 (이 모드 출력 6필드: `tsk_id`·`title`·`status`·`depends`·`domain`·`category`).
2. 각 ID 에 `node .claude/skills/dflow-export/scripts/wbs-parse.mjs {wbs} {TSK_ID} --json` 호출로 **나머지 필드** 획득: `model`·`priority`·`assignee`·`schedule`·`tags`·`blocked-by`·`note`·`entry-point`·`prd-ref`. N회 호출 = 부록 §2.6 이 DEV-02 전 과도기로 명시한 방식 그대로.
3. **WP/ACT 행 제목만** wbs.md 헤딩 정규식(`^##\s+(WP-\d+):\s*(.*)` · `^###\s+(ACT-\d+-\d+):\s*(.*)`)으로 읽음.
   - 파서가 계층 노드를 안 냄 (부록 §7.1-F5). **헤딩 = 구조라 진실 원천 문제 없음.** 그 블록 필드는 안 읽음.
4. **부모 귀속 = ID 세그먼트로 유도** — 파서가 계층을 안 내므로 유일한 연결 고리 (`## D'Flow 연동 표기` ID 불변 규칙이 기대는 것과 같은 규칙).
   - 4단계: `TSK-03-02-01` → `ACT-03-02` → `WP-03`
   - 3단계: `TSK-03-03` → `WP-03` (ACT 행 없음)
   - 유도한 부모 ID 가 3단계에서 읽은 헤딩 목록에 없으면 **그 Task 를 버리지 않음.** 부모 없이 쓰고 리포트에 나열.

⚠️ `status` 는 어떤 경우에도 wbs.md 텍스트에서 읽지 않음 — 1·2단계 파서 출력만 사용.
- DEV-02(`--export`)는 `/dflow-export` 스킬에 구현돼 있고 이 스킬도 같은 `wbs-parse.mjs` 를 쓰지만, **위 N회 호출 절차는 유지.**
- 이유: `--export` 노드는 D'Flow `stage` 코드(`as|fp|ip|im|xx`·`null`)만 싣고 로컬 상태 코드(`[dd]`·`[ts]` 등)·`note`·`blocked-by` 가 없음. 7·8·17·18번 컬럼(상태 코드·라벨·진척 환산·note)을 못 채움.
- (WP/ACT 제목·부모만 `--export` 로 얻는 변형은 가능하나, 이 절차 의미를 바꾸지 않으려고 적용 안 함.)

### 컬럼

| # | 컬럼 | 출처 |
|---|---|---|
| 1 | 레벨 (`WP`/`ACT`/`TSK`) | 행 종류 |
| 2 | ID | 헤딩 ID (= D'Flow `external_ref`) |
| 3 | 제목 | 헤딩 |
| 4 | category | `--json` |
| 5 | domain | `--json` |
| 6 | model | `--json` |
| 7 | 상태 코드 | `--tasks-all` 의 `status` (예: `[ ]`) |
| 8 | 상태 | `docs/state-machine.json` 의 `states[코드].label` — **하드코딩 금지, 그 파일에서 읽는다** |
| 9 | 담당 | `--json` 의 `assignee` |
| 10 | 시작일 | `schedule` 의 ` ~ ` 앞 |
| 11 | 종료일 | `schedule` 의 ` ~ ` 뒤 |
| 12 | 영업일 | 시작~종료 영업일 수 (주말 제외) — 숫자 |
| 13 | depends | `--json` |
| 14 | entry-point | `--json` |
| 15 | prd-ref | `--json` |
| 16 | tags | `--json` |
| 17 | 진척(파생) | `docs/state-machine.json` 의 `progress` 블록으로 환산 — 숫자 |
| 18 | note | `--json` |

- **17번 = 파생값.**
  - `category` 가 `progress.agile.applies_to` 에 있으면 `progress.agile.state_weights[상태코드]`.
  - `progress.process.applies_to` 에 있으면 `progress.process` 규칙(`pre_accept_cap` 포함) 적용.
  - **환산표 스킬·스크립트 하드코딩 금지** — `state-machine.json` 의 `progress._comment` 가 금지.
- **`docs/state-machine.json` 이 대상 리포에 없으면**:
  - 8번 = 상태 코드 그대로, 17번 = `[ ]` = 0.
  - 리포트에 그 사실을 남김 (import 전 검수용 snapshot 은 전 Task `[ ]` 라 실질 손실 없음).
- WP/ACT 행:
  - 4-6·9·13-16·18 = 비움.
  - 10·11 = **위 4단계로 귀속된 하위 Task** 의 최소 시작일·최대 종료일.
  - 12·17 = 그 하위 집합에 `progress.rollup` 규칙(영업일 가중 평균) 적용.
  - 하위 없는 WP/ACT = 10-12·17 비우고 리포트에 나열.
- **실적%·진행률 사람 입력 컬럼 만들지 않음.**
- **1행 = 헤더 고정** (도구 호환 — 위에 주석 행 금지). 디스클레이머 = **마지막 데이터 행 다음 한 줄** A열:
  `import 전 검수용이다 — wbs.md 기준이며 D'Flow 실적·배정은 반영되지 않는다. 운영 보고본은 D'Flow export 를 쓴다. 이 파일을 고쳐도 정본에 반영되지 않는다.`

### 쓰기 — 의존성 0

행 배열을 JSON 으로 만들어 스크립트에 넘김 (node 만 필요, 의존성 0 — zip 은 스크립트가 직접 씀):

```bash
node .claude/skills/dflow-wbs/scripts/xlsx-write.mjs --out {경로} < rows.json
```

- 입력 `rows.json` = 행 배열 `[[헤더…], [셀…], …]` (첫 행 = 헤더). 셀 = 문자열 또는 숫자. 파일 경로 인자도 가능 (`… --out {경로} rows.json`). 숫자(12·17번 컬럼) = JSON 숫자.
- 문자열 셀 = `t="s"`(sharedStrings), 숫자 셀 = `t` 속성 없음. 공유 문자열 중복은 하나로 합침. 출력 경로 부모 폴더 없으면 만들고, 파일 있으면 덮어씀.
- **열 최대 26개(A-Z).** 이 문서 표 = 18열이라 충분. 27열 이상이면 종료 코드 1 + 짧은 stderr. 입력 JSON 이 잘못돼도 종료 코드 1, 파일 안 만듦.

XML 이스케이프(`&`·`<`·`>`·`"`·`'`)는 스크립트가 처리 — Task 제목에 `&`·`<` 있어도 XML 안 깨짐.
- XML 이 문자로 허용 안 하는 제어 문자(`0x00~0x08`·`0x0B`·`0x0C`·`0x0E~0x1F`)·`U+FFFE`·`U+FFFF`·짝 없는 서로게이트 = XLSX 관례 `_xHHHH_`(대문자 16진 4자리)로 인코딩.
- 원문의 `_x0041_` 같은 글자는 `_x005F_x0041_` 로 밑줄 이스케이프. `xlsx-read.mjs` 가 읽을 때 되돌림.
- 엑셀은 이 표기를 원래 글자로 열고, 일부 뷰어는 표기 그대로 보임.
- 이 스크립트는 파일이 어느 엑셀·뷰어에서나 열린다고 보장 안 함. 확인한 것 = XML 해석 가능성과 이 저장소 읽기 스크립트로의 왕복뿐 (엑셀 실물 열기 test 안 함).
- 서식(열 너비·틀 고정·색)은 이 절 범위 밖.

### 순서와 실패 처리

- 행 순서 = wbs.md 등장 순서 그대로 — WP → (ACT) → 그 하위 Task.
- `--json` 호출 실패 Task: **건너뛰지 않음.**
  - 그 행을 쓰되 실패한 컬럼 비움.
  - 생성 리포트에 ID 와 함께 나열 (에러 3원칙: 조회 실패를 "데이터 없음"으로 위장 안 함).
- 출력 경로에 파일 있으면 덮어씀. 정본 아니므로 백업 안 함.
