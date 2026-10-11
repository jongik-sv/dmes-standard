# ERD UX 정비 1.5 — Task 5: 마감

> 공통 제약·결정(U55-U73)·Review Focus·인터페이스는 [README](README.md). 이 Task 는 README Global Constraints 를 따른다.
> 이전: [01-multiselect.md](01-multiselect.md) · 1차 마감(도우미·서버 전환 원본): [UX 1차 03-close.md](../2026-10-11-erd-ux1/03-close.md), [단계 2 07-close.md](../2026-10-11-erd-tool-stage2/07-close.md)

### Task 5: 1.5 마감 — 전체 시험, 복제 PDB 브라우저 확인, 문서

레인 UX15 가 dev 에 머지된 뒤에 한다. 제품 코드는 고치지 않는다. 확인하고 문서를 쓴다.

**판정 원칙:** 화면 동작은 ego-browser 로 본 DOM(testid·글·`data-tip`)과 스크린샷, 저장은 `view sinceRev` 델타(rev 하나·건수)로 판정한다.

**멈추고 조정 세션(없으면 사용자)에게 묻는 일:** 사용자 서버 내리기, 넓은 `pkill`, `pdb.mjs drop`, L_MAIN 에 쓰기, push, 도커, 머지된 V 파일 수정, ego-browser 사용자 프로필.

**결함이 나오면:** `rec defect.<이름> "재현"` 으로 적고 그 자리에서 고치지 않는다. 조정 세션에 보고. 고치기로 하면 레인 파일을 고치는 `fix(erd…)` 별도 커밋(실패 시험 먼저).

**Files:**
- Modify: `docs/mdm/screens/erdEdit/erdEdit_사용자도움말.md`(README "도움말 반영 표" + 레인 보고 메모)
- Modify: `docs/mdm/screens/erdEdit/erdEdit_기능설계서.md`(새 절 "## 8. UX 정비 1.5 — 여러 표 동시 처리". 1차 §7 이 없으면 다음 번호)
- Modify: `docs/erd-tool/deferred.md`(새 절 "9. UX 정비 1.5 에서 미룬 것", 번호는 1차 마감이 쓴 마지막 번호 다음)
- Modify: 이 계획 `README.md` "1.5 구현 결정" 표
- 만들지만 커밋하지 않음: `tmp/erd-ux15-close/`. 끝에 `~/.coord/<run-id>/close/` 로 복사(조정 run-id 가 없으면 `~/.coord/erd-ux15-1011/close/`).

---

- [ ] **Step 0: 작업 위치·도우미**

```bash
cd /Users/jji/project/dmes-standard
test -d ../dmes-standard-wt/erd-ux15-close || /usr/bin/git worktree add ../dmes-standard-wt/erd-ux15-close -b erd-ux15-close dev
cd ../dmes-standard-wt/erd-ux15-close
for f in src/frontend/m-mdm/pages/dma/erdEdit/canvas/erd-multi.ts src/frontend/m-mdm/pages/dma/erdEdit/canvas/MultiDialogs.tsx \
  src/frontend/m-mdm/tests/dma/erdEdit/erd-canvas-multi.test.ts src/frontend/m-mdm/tests/dma/erdEdit/multi-dialogs.test.ts; do
  test -f "$f" && echo "있음 $f" || echo "없음 $f"; done
```
"없음" 이 있으면 멈추고 보고. `tmp/erd-ux15-close/env.sh` = 1차 `tmp/erd-ux1-close/env.sh`(1차 마감 worktree, 지워졌으면 단계 2 07-close Step 0-2)를 복사해 `CLOSE=$PWD/tmp/erd-ux15-close`, `ERD_PDB=L_UX1C`. 필요한 도우미 `erd`·`erdAs`(M7 다른 세션)·`rv`·`rec`. ego-browser 스킬 `SKILL.md` 를 먼저 끝까지 읽는다.

- [ ] **Step 1: 전체 시험**

```bash
cd /Users/jji/project/dmes-standard-wt/erd-ux15-close/src/frontend
pnpm install --frozen-lockfile
pnpm --filter "@dk-oasis/m-mdm^..." build && pnpm --filter @dk-oasis/m-mdm test && pnpm --filter @dk-oasis/m-mdm lint
```
서버는 안 바뀌었다(U55) → `:lib:test`·Oracle 시험은 돌리지 않는다. 알려진 기존 실패(deferred 50·80)는 결함 아님. `rec test.fe "<통과/실패 수>"`.

- [ ] **Step 2: 서버 전환·복제 PDB(U73)**

1차 03-close Step 2 와 같되 PDB 는 새로 만들지 않고 `node scripts/oracle/pdb.mjs open L_UX1C`. 열린 PDB 상한 3 을 넘으면 멈추고 보고. **사용자 서버 내리기는 조정 세션 허가 뒤.** BE·FE 는 이 worktree 로 띄운다(1차 `be-run.sh --mcm --mdm --pdb=L_UX1C`). L_UX1C 의 mcm 모델 = 1차 마감이 남긴 DRAFT(admin 소유, 시험 표 `TB_MCM_UX1_TASK`·`TB_MCM_UX1_T` 있음). `erd view '{"modelId":"mcm"}'` 로 `ownerId`·`status` 확인 → admin DRAFT 가 아니면 1차 03-close Step 3-3 처럼 `copy`(MINOR)·`lock`. 다이어그램이 하나뿐이면 화면 [새 다이어그램](마법사)으로 표 3개짜리 `UX15 대상` 을 하나 만든다. `rec setup.* …`.

- [ ] **Step 3: 항목별 브라우저 확인(1440×900)**

ego-browser TaskSpace 하나(`erd-ux15-close`)로 5100 로그인(admin/admin123) → 마루 MDM > 용어·도메인 > ERD 설계 → mcm. 항목마다 스크린샷 `$CLOSE/ui/<번호>-<이름>.png`, 판정 `rec ui.<번호> "통과|실패 — 근거"`, 저장 판정은 `rv` 로 그 rev 의 델타 건수. 쓰기 항목은 확인 뒤 ⌘Z 로 되돌리고 되돌린 rev 도 적는다. 키는 `page.keyboard.press`. 표 누르기는 도구 막대에 가리지 않은 노드(`elementFromPoint` 로 확인, 1차 메모).

| # | 확인 | 기대 |
|---|---|---|
| M1 | 고르기 | ⌘+클릭 3개, Shift+빈 곳 끌기 사각형, 캔버스 빈 곳 누른 뒤 ⌘A = 다이어그램 표 모두(`.react-flow__node.selected` 수 = 다이어그램 표 수) |
| M2 | 속성 패널 머리 | 2개 이상 고르면 `erd-props-multi` 글 `속성 · 고른 표 n개 중 <물리명>` |
| M3 | 정렬 | 3개 고름 → [정렬 ▾] 8항목. 왼쪽 맞춤 → rev 하나(diagramNode 바뀐 표 수만큼), ⌘Z 한 번에 제자리. 가로 간격 같게 → 표 사이 빈 칸이 같음(노드 `getBoundingClientRect` 로 잼). 2개만 고르면 간격 항목 꺼짐 |
| M4 | 정렬(이름만 배율) | 배율 0.4 에서 중간 맞춤 → 노드 세로 가운데가 한 줄(±2px, 화면 좌표) |
| M5 | 다른 다이어그램에 넣기 | 대상에 이미 1개 있는 3개를 고름 → `erd-place-info` "표 2개를 넣습니다. 이미 있는 1개는 그대로 둡니다." → [넣기] → rev 하나(diagramNode upsert 2), 대상에 있던 표 자리 그대로(앞뒤 `view` 노드 x·y 비교), 지금 다이어그램 그대로·toast. 대상을 열어 표가 오른쪽에 놓였는지 스크린샷. ⌘Z 한 번에 2개 빠짐 |
| M6 | 같은 컬럼 | 2개 고름 → [컬럼 추가] → 창 → 논리명 "사용여부" → 물리명 미리보기 → [추가] → rev 하나(column 추가 2 + 표 columnOrder), 두 표 끝(감사 컬럼 앞)에 컬럼. ⌘Z 한 번에 두 표 모두 사라짐. 한 표에 이미 있는 물리명 → 건너뜀 1 |
| M7 | 같은 컬럼 거절 | 다른 세션(`erdAs close-peer`)이 고른 표 하나의 컬럼을 고친 뒤(rev 진행) 창에서 보냄 → 거절이면 창 안 문구, 두 표 모두 컬럼 없음(`view`). 거절이 안 나면(서버가 표 단위 충돌을 안 봄) 결과로 적는다 — 결함 아님 |
| M8 | 접기·빼기·삭제 일괄 | 3개 고름 → [키 컬럼만] = rev 하나(setFold 3), Delete = rev 하나(delete 3), ⌥⌫ → 확인 창 "표 3개를" → 취소. 각각 ⌘Z 한 번 |
| M9 | 툴팁 | 고른 표 없음 → 접기 3·빼기·삭제 단추 위에 마우스 → CSS 툴팁이 보이고 글 끝 "— 표를 먼저 고르세요"(스크린샷). 안 보이면 `defect.disabledTipHidden`(꺼진 `ToolButton` 툴팁, shared 변경 = 승인 사항) — U68 |
| M10 | 다이어그램 바꾸기 | 표 고름 → 그 표가 없는 다이어그램 염 → 속성 패널 없음. 그 다이어그램 표 하나 누름 → 패널 = 그 표(1차 `defect.staleSelectionAcrossDiagram` 재현 경로 그대로) |
| M11 | 확정된 버전 | (선택) RELEASED 를 볼 수 있으면: 소유자로 [정렬 ▾]·[넣기] 켜짐, [컬럼 추가] 꺼짐 tip "컬럼 추가 — 확정된 버전". 볼 수 없으면 단위 시험 `releasedAllowsDiagramOpsOnly` 만으로 적고 통과로 세지 않음 |
| M12 | Windows Ctrl+클릭 | 사람 확인 항목(Mac 만 있음). 아침 보고에 넣음 |
| M13 | 도구 막대 폭 | 1440×900, 왼쪽 목록·속성 패널(400) 열림, 표 2개 고름 → `.erd-toolbar` 높이·줄 수 기록 + 스크린샷. [정렬 ▾]·[넣기] 가 더해져 줄을 넘겨 노드를 가리면 `defect.toolbarWrap` 후보로 적는다(이 회차에서 막대를 다시 짜지 않음) |

- [ ] **Step 4: 정리**

TaskSpace `finish({ keep: [] })`. BE·FE 내리고 사용자 서버를 되살린다(Step 2 기록대로). `node scripts/oracle/pdb.mjs close L_UX1C`(지우지 않음). `$CLOSE` → `~/.coord/…/close/` 복사.

- [ ] **Step 5: 문서**

5-1. 도움말: README "도움말 반영 표" 행마다 + 레인 메모. 실제 화면 글(라벨·알림 정본 표, testid 글)과 맞춘다. §5 단축키 표에 `Ctrl+A`·`⌘A` 줄, Delete 줄 "고른 표 모두". 1차 D9 문구 제안(1차 fe1 메모)을 고르기 소절에 쓴다.
5-2. 기능설계서 "## 8. UX 정비 1.5 — 여러 표 동시 처리": 고르기(xyflow 기본 키), 정렬 규칙(U58), 넣기 규칙과 걸러 보내는 이유(`mergeNode` upsert, U61), 같은 컬럼 규칙(U63), 선택 비우기(U66), 서버 변경 없음.
5-3. deferred 새 절 "9. UX 정비 1.5 에서 미룬 것": README Q1-Q7 중 기본값으로 안 한 것(속성 요약 패널, 여러 표 PK, 고른 표로 새 다이어그램, propsFocusKeep, violationRowFirstClick, newTableEnterPhys, prefsMultiTab), Step 3 결함 후보, 관계선 경유점(2차, 1차 deferred 에 이미 있으면 번호만 가리킴).
5-4. 이 README "1.5 구현 결정": 1차와 같은 표(결정·이유·틀렸을 때 비용). 마감 값 포함(M3·M5·M6 rev·건수).
5-5. 커밋 `docs(erd): UX 정비 1.5 마감 — 여러 표 동시 처리 도움말·기능설계서·deferred`. 사용자 파일 `docs/idea.md` 가 바뀌어 있으면 사용자 메모리 규칙(커밋할 때 함께)대로 조정 세션에 묻고 따른다. 머지는 조정 허가 뒤.

---

## 계획 작성자 메모

- 서버를 안 바꿨으니 Oracle 시험·lib 시험은 돌리지 않는다. 대신 저장 판정은 실제 서버 델타(rev 하나·건수)로 본다 — 화면 시험은 가짜 apply 라 "rev 하나" 를 못 본다.
- M7(같은 컬럼 거절)은 서버가 표 단위 CONFLICT 를 내는지 확실하지 않다(`addColumn` 은 새 요소라 rev 충돌이 없을 수 있음, 추정). 그래서 "거절이 안 나면 결과로 적음" 이다. 묶음 원자성 자체는 서버 `apply` 계약(단계 0)이다.
- 복제 PDB 는 1차 것을 다시 쓴다(U73). 새로 만들면 모델 준비(등록·가져오기·확정·copy)가 30분 더 든다.
