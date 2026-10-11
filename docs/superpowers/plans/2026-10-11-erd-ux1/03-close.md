# ERD UX 정비 1차 — Task 9: 마감

> 공통 제약·결정(U1-U54)·Review Focus·인터페이스는 [README](README.md). 이 Task 는 README Global Constraints 를 따른다.
> 이전: [02-fe2-canvas-server.md](02-fe2-canvas-server.md) · 단계 2 마감(도우미·서버 전환 원본): [07-close.md](../2026-10-11-erd-tool-stage2/07-close.md)

### Task 9: 1차 마감 — 전체 시험, 복제 PDB, 항목별 브라우저 확인, 면적 재기, 직관성 5과제, 렌더 하네스, 문서

FE1·FE2 가 dev 에 모두 머지된 뒤에 한다. 제품 코드는 고치지 않는다. 확인하고, 재고, 문서를 쓴다.

**판정 원칙:** 화면 동작은 ego-browser 로 본 DOM(testid·글·계산 스타일)과 스크린샷으로, 서버 동작은 `view sinceRev` 델타·`validate` 응답으로 판정한다. 면적은 `measure.js` 숫자로만.

**멈추고 조정 세션(없으면 사용자)에게 묻는 일:** 사용자 서버 내리기, 넓은 `pkill`, `pdb.mjs drop`, L_MAIN 에 쓰기, push, 도커, 머지된 V 파일 수정, ego-browser 사용자 프로필.

**결함이 나오면:** `rec defect.<이름> "재현"` 으로 적고 그 자리에서 고치지 않는다. 조정 세션에 보고. 고치기로 하면 원래 레인 파일을 고치는 `fix(erd…)` 별도 커밋(실패 시험 먼저). 기대와 다른 측정값·환경 차이는 결함이 아니라 결과로 적는다.

**Files:**
- Modify: `docs/mdm/screens/erdEdit/erdEdit_사용자도움말.md`(README "도움말 반영 표" + 레인 보고 메모 전부)
- Modify: `docs/mdm/screens/erdEdit/erdEdit_기능설계서.md`(새 절 "## 7. UX 정비 1차")
- Modify: `docs/erd-tool/deferred.md`(새 절 "8. UX 정비 1차에서 미룬 것", 81번부터)
- Modify: `docs/erd-tool/ux-2026-10-11/README.md`("다음 회차 제안" 표 1차 행 아래 "1차 결과" 한 줄 + 측정 표)
- Modify: 이 계획 `README.md` "1차 구현 결정" 표
- 만들지만 커밋하지 않음: `tmp/erd-ux1-close/`. 끝에 `~/.coord/erd-ux1-1011/close/` 로 복사(스크린샷 포함, 저장소 밖).

---

- [ ] **Step 0: 작업 위치·도우미**

0-1. worktree `../dmes-standard-wt/erd-ux1-close`(branch `erd-ux1-close`, dev 에서). 레인 파일 확인:
```bash
cd /Users/jji/project/dmes-standard
test -d ../dmes-standard-wt/erd-ux1-close || /usr/bin/git worktree add ../dmes-standard-wt/erd-ux1-close -b erd-ux1-close dev
cd ../dmes-standard-wt/erd-ux1-close
for f in src/frontend/m-mdm/pages/dma/erdEdit/state/prefs.ts src/frontend/m-mdm/pages/dma/erdEdit/state/viewport.ts \
  src/frontend/m-mdm/pages/dma/erdEdit/labels.ts src/frontend/m-mdm/pages/dma/erdEdit/panels/StartPanel.tsx \
  src/frontend/m-mdm/pages/dma/erdEdit/canvas/erd-split.ts src/frontend/m-mdm/pages/dma/erdEdit/canvas/SplitDialog.tsx \
  src/frontend/m-mdm/pages/dma/erdEdit/canvas/erd-minimap.ts \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/engine/ErdUserHints.java; do
  test -f "$f" && echo "있음 $f" || echo "없음 $f"; done
```
"없음" 이 있으면 멈추고 보고.

0-2. `tmp/erd-ux1-close/env.sh`: 단계 2 [07-close.md](../2026-10-11-erd-tool-stage2/07-close.md) Step 0-2 의 `env.sh` 를 복사해 `CLOSE=$PWD/tmp/erd-ux1-close`, `ERD_PDB=L_UX1C` 로 바꾼다. 필요한 도우미: `erd`·`erdAs`·`rv`·`rec`·`sqm`. Claude·CLI 도우미(`cl` 등)는 지운다. 기록장 `rec <키> "<값>"` → `$CLOSE/record.tsv`.

0-3. ego-browser 측정 도우미 `$CLOSE/measure.js` = `docs/erd-tool/ux-2026-10-11/scripts/measure.js` 복사. 크기 바꾸기는 `await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })`(1920×1080 도 같게). ego-browser 스킬 `SKILL.md` 를 먼저 끝까지 읽는다.

- [ ] **Step 1: 전체 시험(복제 PDB 를 열기 전)**

```bash
cd /Users/jji/project/dmes-standard-wt/erd-ux1-close/src/frontend
pnpm install --frozen-lockfile
pnpm --filter "@dk-oasis/m-mdm^..." build && pnpm --filter @dk-oasis/m-mdm test && pnpm --filter @dk-oasis/m-mdm lint
cd ../backend/mdm && export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home && unset BACKEND_CLIENT_KEY
../gradlew :lib:test --max-workers=2
DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone \
  --tests '*ErdVersionServiceTest' --tests '*ErdEditOasisHttpTest' --tests '*ErdConcurrentSaveHttpTest' --tests '*ErdStreamTest'
cd ../../.. && node --test scripts/erd/tests/
```
1-0. **B0 — L_MAIN 배치 원인(읽기만, 서버 전환 전).** 사용자 서버(L_MAIN)가 떠 있는 지금 `erd view '{"modelId":"mcm"}'`(쓰기 없음)로 기본 다이어그램 노드 x·y 를 읽어 폭·높이·같은 x 층 수를 기록한다(U23 판정 근거: 폭 약 1,700·높이 약 6,000 이 층 2-3개 모양인가). `rec b0.layout "…"`. L_MAIN 에 쓰는 명령은 금지.

알려진 기존 실패(단계 2 deferred 50·80: m-mdm `ui-meta-lock` 1건, shared `grid-mdm-group-strict` 흔들림)는 결함이 아니다. 그 밖의 실패는 결함. `rec test.* "<통과/실패 수>"`.

- [ ] **Step 2: 서버 전환·복제 PDB**

단계 2 07-close Step 2-1·2-2·2-3·2-5 를 그대로 하되 PDB 이름 `L_UX1C`, 기록 폴더 `$CLOSE`. 사람 계정 넣기(2-4)는 하지 않는다(admin 하나로 확인). **2-1(사용자 서버 내리기)은 조정 세션 허가 뒤.** `node scripts/oracle/pdb.mjs clone TPL_DATA L_UX1C`. 열린 PDB 상한 3 을 넘으면 멈추고 보고.

- [ ] **Step 3: 모델 준비**

07-close Step 3-1 처럼 `erd reg`(mcm) → `erd import FROM_DB` → DB_DIFF 0. 이어서:
- 3-2 첫 확정(`warningsAcknowledged=true`, `applyFrom` = 1분 전) → 지금 버전 RELEASED. **이 상태에서 Step 4-A(읽기 전용 칩)를 먼저 본다.**
- 3-3 `copy`(MINOR) → 새 DRAFT. `view` 의 `ownerId` 가 admin 이 아니면 `lock`. 이후 admin = DRAFT 소유자(편집 가능).
- `rec setup.* …`.

3-4. **E(감사 컬럼 확정, U29)를 여기서 먼저 한다** — C·D 의 편집이 같은 DRAFT 의 컬럼을 CHANGED·ADDED 로 만들어 확정을 다른 이유로 막기 전에. 아래 Step 4 의 E 표를 이 자리에서 돈다. E2 로 확정하면 다시 `copy`(MINOR) → 새 DRAFT 를 만들고(소유자 admin 확인) 나머지 Step 4 를 그 DRAFT 에서 한다.

- [ ] **Step 4: 항목별 브라우저 확인(1440×900 기준, 표시한 것은 1920×1080 도)**

ego-browser TaskSpace 하나(`erd-ux1-close`)로 5100 로그인(admin/admin123) → 마루 MDM > 용어·도메인 > ERD 설계. 크기: A3-A8·B1·B2·D3·D5 는 1440×900 과 1920×1080 둘 다(배치·폭에 따라 달라짐). 나머지(글·동작)는 크기와 무관해 1440 에서만. 항목마다 스크린샷 `$CLOSE/ui/<번호>-<크기>-<이름>.png`, 판정 `rec ui.<번호> "통과|실패 — 근거"`. 키는 `page.keyboard.press`(CDP 키는 Chrome 단축키를 거치지 않는다 — Alt+M 등이 Chrome 에 먹히는지는 사람 확인 항목).

**A. 공간·첫 화면(U10-U22·U45·U53)**

| # | 확인 | 기대(DOM·값) |
|---|---|---|
| A1 | 처음 연 화면(새 프로필, prefs 없음) | `erd-start` 에 `erd-start-model-mcm`. 클릭 → 캔버스 |
| A2 | RELEASED 상태 읽기 전용 | `erd-readonly-chip` 있음, `title` "확정된 버전", 처음 한 번 `erd-readonly-pop` 저절로 열림. 노란 띠 없음. 도구 막대 꺼진 단추 tip 이 "… — 확정된 버전"(긴 문장 아님). 새로 고친 뒤 다시 열면 팝오버가 저절로 열리지 않음 |
| A3 | 위 막대 | `.erd-area-bar` 높이 ≤ 44px(1440·1920), 한 줄, `erd-summary` 글 `표 n · 관계 n(추정 n) · 고칠 위반 n`, `rev ` 글 없음. 화면 제목 "ERD 설계" 안 보임, 꼬리 breadcrumb 보임. 다른 탭(컬럼 사전)을 열어 그 제목은 보임 |
| A4 | 검토 패널 기본 접힘 | `erd-review-strip` 높이 ≤ 32px, `erd-review` 없음. `erd-tab-history` 누름 → 펼침·변경 기록. 막대 끌어 높이 바꿈 → 새로 고침 뒤 같은 높이·펼침 상태 |
| A5 | 속성 패널 | 고른 표 없음 = `.erd-area-grid` 없음. 표 고름 → 400px 패널, 고른 노드가 캔버스 안. 막대 끌기·더블클릭 기본값. [›] 접기 → `erd-props-rail`, 새로 고침 뒤 유지. 입력 칸 초점 + 선택 해제 → 남음, 초점 빼면 사라짐 |
| A6 | 왼쪽 목록 접기 | `erd-side-rail`, 새로 고침 뒤 유지 |
| A7 | 최대화 | Alt+M 과 `erd-maximize` 둘 다. 왼쪽·속성·검토 없음, 고른 표가 있으면 `erd-props-float`. 다시 Alt+M → 돌아옴(1440·1920) |
| A8 | 첫 viewport | 큰 다이어그램("전체", 자동 배치 전)을 처음 열면 배율 1(`.react-flow__viewport` scale 1). 움직이고 새로 고침 → 같은 viewport |
| A9 | 마지막 모델·모드·프리셋 | 물리·E-R 개요로 바꾸고 새로 고침 → 같은 모델·모드·프리셋으로 열림 |
| A10 | Zoom 단추 | `erd-zoom-in`·`erd-zoom-out` title 한국어 |
| A11 | toast | 관계 [맞음] 뒤 오른쪽 아래 toast "관계를 확정했습니다.", 메시지 줄 칸 없음 |
| A12 | 비활성 [확정] | RELEASED 상태 버전 팝오버의 `erd-ver-confirm` 계산 배경이 `erd-ver-lock`(꺼짐) 과 같은 회색 계열. 아니면 결과로 적고 승인 표 A2 |

**B. 큰 모델 읽기(U23·U49-U53)**

| # | 확인 | 기대 |
|---|---|---|
| B0 | L_MAIN 배치 원인 | Step 1-0 에서 했다(기록만 옮김) |
| B1 | [자동 배치](1920×1080 기본 상태) | 결과 경계 상자 가로세로 비가 캔버스 비의 0.5-2배. [화면 맞춤] 배율 ≥ 0.25. 스크린샷 |
| B2 | 개요 단계 | 배율 0.3 근처에서 노드 `data-lod="overview"`(`.react-flow` 요소), 노드 이름 글자 화면 크기 = `parseFloat(getComputedStyle(el).fontSize) × zoom ≥ 11`. 선 끝 모양 안 보임. 0.4 에서 `names` 이고 머리 이름 글자도 화면 ≥ 11px, 0.6 에서 `detail` |
| B3 | 미니맵 | 57개 다이어그램에서 `erd-minimap` 기본 켜짐, `erd-tool-minimap` 으로 끄기 → 새로 고침 뒤 꺼짐 유지 |
| B4 | 주제별 나누기 | `erd-tool-split` → `erd-split-dialog` 묶음 목록(묶음마다 5-20개, 기타 하나만 5 미만 허용). [만들기] → 다이어그램 n개 생김, 첫 새 다이어그램이 열림, 왼쪽 목록 "주제별" 업무영역. 다이어그램 하나를 [화면 맞춤] → 배율 ≥ 0.5(이름·컬럼 보임) |
| B5 | 첫 다이어그램 | prefs 를 지우고(`localStorage.removeItem("dmes:erdEdit:v1:admin")`) 새로 고침 → 모델을 열면 "전체" 가 아니라 30개 이하 첫 다이어그램 |

**C. 문구(U19·U25·U27·U30-U36·U39)**

| # | 확인 | 기대 |
|---|---|---|
| C1 | 기계 용어 | 네 탭·알림·확정 창을 연 상태마다 `document.body.innerText` 에 `getChangesSince`·`baseRev`·`getModelText`·`ERD_STD_`·`NAME_RULE`·`SQL_JOIN`·`rev `·`ui-` 가 없음 |
| C2 | 충돌 알림 | 표준 상태 OK 인 컬럼을 고른다(`erd view '{"modelId":"mcm","kind":"STATUS"}'`). `erdAs` 로 다른 세션(`close-peer`)이 그 컬럼 논리명을 먼저 바꾸고, 화면에서 낡은 값으로 고침 → `erd-notice` 글 "admin 님이 먼저 바꿨습니다. 지금 값: …", `erd-notice-hint` = userHint 정본 글 |
| C3 | 위반 수 하나 | `erd-summary` 의 고칠 위반 = `erd-tab-violations` 건수 = 왼쪽 목록 "전체" 수(감사 보기 끔). 감사 보기 켜면 셋이 같이 늘어남 |
| C4 | 위반 행 → 컬럼 | 위반 행 클릭 → 속성 그리드에서 그 컬럼 행이 골라짐 |
| C5 | 추정 관계 | 근거 칸 "SQL 조인 V1__baseline.sql:…" 등, 단추 [맞음]·[아님], 판정 칸 머리 |
| C6 | 변경 기록 | 시각·번호·사람(나)·출처(화면)·내용(이름), 세션 칸 없음, 빈 머리 없음, 새 표 추가 행에 "감사 컬럼 8" |
| C7 | 확정 창 | 묶음 머리 한국어, `ERD_INFERRED_LEFT` 묶음 없음, "(MDM006)" 없음 |
| C8 | 범례 | `erd-legend` 색 견본 행 9개, `erd-legend-open` 팝오버 같음. 물리 모드 바탕색이 사전 없음 행 색과 다름 |
| C9 | DB 다시 가져오기 | 탭 이름·반영 단추 글 |

**D. 작은 것들(U37-U44)** — 쓰기가 생기는 D1·D5·D7 은 확인 뒤 Ctrl+Z 로 되돌린다(이 DRAFT 는 확정하지 않지만 다음 확인을 흐리지 않게).

| # | 확인 | 기대 |
|---|---|---|
| D1 | [물리명도] | 컬럼 고름 → 꺼짐. 켜고 다른 이름 → `erd-grid-phys-warn` |
| D2 | Shift+1·Shift+2 | 전체 맞춤·고른 표 맞춤(배율 ≤ 1) |
| D3 | 관계 안내 줄 | [관계 ▾] 비식별 → `erd-tool-hint` 글, 부모 누른 뒤 "자식 표를 누르세요", Esc 로 사라짐 |
| D4 | 자기 참조 | 메뉴 [관계 시작] 뒤 같은 표 누름 → 경고 toast(U42 글), 관계 안 생김 |
| D5 | 글자 단추 | [표 추가]·[관계 ▾]·[컬럼 추가]·[PK 추가]. 표 하나 고름 → [PK 추가] → 입력 칸 PK 모드·초점 |
| D6 | 표 메뉴 | 오른쪽 클릭에 컬럼 추가·PK 컬럼 추가·관계 시작 |
| D7 | 새 표 창 | 논리명 칸이 먼저, "메뉴 권한" → 물리명 `TB_MCM_` 로 시작하는 미리보기 |
| D8 | 비활성 이유 | 꺼진 단추마다 title/tip 에 짧은 이유 |

**E. 감사 컬럼 확정(U29) — Review Focus 5 를 실제 서버로. Step 3-4 에서 C·D 보다 먼저 한다.**

E0. 전제 확인: E1 의 새 표를 만든 뒤 `STATUS` 로 감사 컬럼 8개 상태를 읽는다. TYPE·DOMAIN·MISS 가 하나도 없으면 E 는 실서버에서 시험할 거리가 없다 → `rec e.audit "실서버 미검증(감사 컬럼 위반 없음), lib 시험 auditColumnsNeverBlockConfirm 만"` 으로 적고 통과로 세지 않는다.
E1. DRAFT(3-3)에서 화면으로 새 표 하나(`TB_MCM_UX1_T`, 논리명 "UX 시험", 감사 컬럼 8개 자동) + 그 표에 일반 컬럼 하나(일부러 사전 없는 논리명) → `erd validate` 응답에서 `errors` 에 일반 컬럼만, 감사 컬럼 id 8개 중 위반인 것은 `warnings`. 화면 확정 창에 그 항목 "· 감사 컬럼".
E2. 일반 컬럼을 Ctrl+Z(또는 변경 기록 [되돌리기])로 지움 → `validate` `errors` 0 → 화면에서 확정까지(경고 확인 체크) → 성공. `rec e.audit "…"`.

- [ ] **Step 5: 면적 재기(U5, 기준선 C 「Space / layout」)**

같은 TaskSpace 에서 viewport 마다 `measure.js` 를 돈다. 상태 3개 × 크기 2개:
1. 기본(고른 표 없음, 검토 접힘, 왼쪽 열림)
2. 표 하나 고름(속성 패널 400)
3. 최대화
그리고 참고로 4. 기본 + 포털 메뉴 접힘(◀).

`rec measure.<크기>.<상태> "<canvasShare>% <canvas w×h> fit1=<nodesFitZoom1> bar=<erdBar.h>"`. 기준: 기본 1440 ≥ 40%·1920 ≥ 50%, 최대화 1440 ≥ 60%·1920 ≥ 70%, `erdBar.h ≤ 44`. 표로 정리(이전 16.4%·28.2% 열과 나란히).

- [ ] **Step 6: 직관성 5과제(README "직관성 확인 방법")**

도움말을 보지 않고 Claude(ego-browser)가 해 본다. 클릭·키 수를 센다. 실패하면 어디서 막혔는지 적는다.

| 과제 | 1차 전(B §2) | 1차 뒤(센 값) | 목표 | 메모 |
|---|---|---|---|---|
| 표 하나 + 컬럼 3개 + PK | 11-19 | | 도움말 없이 성공, 절반 이하 | [표 추가]→빈 곳→논리명→만들기→[컬럼 추가]×… |
| 관계 긋기 | 3-5(안내 없음) | | 안내만 보고 성공 | |
| 컬럼 이름 고치기 | 이름 칸 + [논리명 바꾸기] | | 그 자리 편집 1번(2차) | 1차는 그대로일 수 있음 |
| 위반 하나 고치기 | 4-8 | | 2-3 | 위반 행 → 컬럼 선택 |
| 실수 되돌리기 | 1 또는 3-5 + 추측 | | 1, 기록에 이름 | |

사용자 직접 5분 확인은 사람 확인 항목으로 아침 보고에 넣는다.

- [ ] **Step 7: 렌더 하네스(U47, Screen-Performance-Guide §5)**

**조정 세션의 `측정 시작:` 뒤에만.** 5300 production 서버(`next build --profile --no-mangling`, `scripts/perf/render/README.md` 사용법)를 이 worktree·복제 PDB 로 띄운다. admin 이 DRAFT 소유자(3-3)여야 입력 칸이 켜진다.
```bash
RENDER_SCREENS=erdEdit PERF_OUT=$HOME/.coord/erd-ux1-1011/perf node scripts/perf/render/count-renders.mjs
```
판정: `5-form-input` 한 글자당 화면 루트(`ErdViewer`) 렌더 0회, 그리드 셀 다시 그리기 0회, 한 글자 렌더 시간 합 ≤ 16ms. "편집 가능하지 않다 — 건너뛴다" 가 나오면 `formPrepare` 가 표를 못 고른 것 → 결과로 적고 결함 후보. `rec perf.erdEdit "…"`. 끝나면 `측정 끝`.

- [ ] **Step 8: 정리**

TaskSpace `finish({ keep: [] })`. 07-close Step 10 처럼 BE·FE 를 내리고 사용자 서버를 되살린다(2-1 기록대로). `node scripts/oracle/pdb.mjs close L_UX1C`(지우지 않음). `$CLOSE` → `~/.coord/erd-ux1-1011/close/` 복사.

- [ ] **Step 9: 문서**

9-1. 도움말: README "도움말 반영 표" 행마다 + 레인 보고의 도움말 메모. 바꾼 절마다 실제 화면 글(testid 글)과 맞춘다. §5 단축키 표에 Shift+1·Shift+2·Alt+M, 373줄 고침.
9-2. 기능설계서 "## 7. UX 정비 1차": 화면 틀(ContentBody 분할·저장 키), 작업 상태 키, 첫 viewport·첫 다이어그램 규칙, 단계별 그리기 문턱, 주제별 나누기 규칙, 위반 정의(U25), 서버 칸 `userHint`·`at`, 확정 검사 감사 컬럼 규칙(U29).
9-3. deferred 새 절 "8. UX 정비 1차에서 미룬 것"(81번부터): 사람 이름 표시(U8), README 승인 표 A1-A10 중 하지 않은 것, U54(주제 상자·선 묶기·나누기 편집), 위 막대 모델 많을 때 `Select`, MCP `listViolations` 위반 기준(U25), 개요 단계 상자 줄이기, Step 4·6·7 에서 나온 결함 후보.
9-4. UX 조사 README: "다음 회차 제안" 표 아래 "1차 결과(10-1x)" — 면적 표(Step 5), 직관성 표(Step 6), 남은 것은 deferred 번호.
9-5. 이 계획 README "1차 구현 결정": 단계 2 와 같은 표(결정·이유·틀렸을 때 비용). 마감 값 포함(측정·하네스·E1·E2).
9-6. 커밋 `docs(erd): UX 정비 1차 마감 — 도움말·기능설계서·deferred·측정 결과`. 머지는 조정 허가 뒤.

---

## 계획 작성자 메모

- 마감은 admin 하나로 한다. 단계 2 처럼 두 사람·Claude 세션은 필요 없다. 읽기 전용 확인은 RELEASED 상태(첫 확정 직후)를 쓴다 — 공동 편집자가 아닌 두 번째 계정이 필요 없다.
- 개요 단계 글자 크기 판정은 계산 스타일 × 배율로 한다. CSS `min()`·`calc()` 는 계산 스타일에 px 로 나온다.
- 렌더 하네스는 측정 슬롯(조정 세션)을 기다린다. 슬롯을 못 받으면 Step 7 을 다음 회차 첫 일로 넘기고 deferred 에 적는다.
- B0(L_MAIN 배치 원인)은 읽기만 한다. 서버를 내린 뒤에는 L_MAIN 서버로 읽을 수 없으니 Step 2 전에 하거나 SQL 로 읽는다.
