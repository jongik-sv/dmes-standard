# ERD UX 정비 1차 — Task 5-8: 서버·큰 모델 읽기·캔버스·입력 칸 (레인 FE2)

> 공통 제약·결정(U1-U54)·Review Focus·인터페이스(정본)는 [README](README.md). 이 문서의 모든 Task 는 README Global Constraints 를 따른다.
> 이전: [01-fe1-frame.md](01-fe1-frame.md) · 마감: [03-close.md](03-close.md)

레인 FE2 순서: Task 5(서버, 언제든 머지 가능) → Task 6 Step 1-6 → (FE1 Task 1 dev 머지 확인, rebase) → Task 6 Step 7-8 → Task 7 → Task 8.

경로 줄임: `S/` = `src/frontend/m-mdm/pages/dma/erdEdit/`, `T/` = `src/frontend/m-mdm/tests/dma/erdEdit/`, `E/` = `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/`, `LT/` = `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/`.

서버 명령(`src/backend/mdm` 에서):

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
unset BACKEND_CLIENT_KEY
../gradlew :lib:test --max-workers=2 --tests '*ErdUserHintsTest' --tests '*ErdConfirmCheckClassifyTest'
```

프런트 명령은 [01-fe1-frame.md](01-fe1-frame.md) 머리와 같다.

FE2 가 고치지 않는 파일: `S/ErdViewer.tsx`·`S/types.ts`·`S/api.ts`·`S/edit-context.ts`·`S/state/*`·`S/labels.ts`·`S/canvas/erd-styles.ts`·`S/panels/{TopBar,ReviewPanel,ChangeLog,ConfirmDialog,DiagramTree,NoticeBar,VersionBar,core-styles}`. 필요한 것이 빠졌으면 레인 보고 → 조정자 → FE1.

---

### Task 5: 서버 — 감사 컬럼 확정 규칙, `userHint`, 변경 기록 `at`, 가져오기 격자 행 높이

**Files:**
- Modify: `E/service/ErdConfirmCheck.java` (판정을 `classify` 로 빼고 감사 컬럼은 경고)
- Create: `E/engine/ErdUserHints.java`; Modify: `E/engine/ErdRejection.java` (`userHint()` JSON 메서드)
- Modify: `E/stream/ErdDelta.java` (`at` 칸 + 옛 생성자), `E/service/ErdCommandLogStore.java`(`C_AT` 읽기), `E/service/ErdCommandService.java`(실시간 delta), `E/service/ErdReloadMarker.java`
- Modify: `E/importing/ErdImportBuilder.java` (격자 행 높이)
- Test: 새 `LT/service/ErdConfirmCheckClassifyTest.java`, 새 `LT/engine/ErdUserHintsTest.java`, `LT/importing/ErdImportBuilderTest.java`(격자 기대값), `LT/service/ErdChangesSinceFromRevTest.java`·`LT/stream/ErdEventHubQueueTest.java`·api `ErdEventHubGapRowVersionTest.java`(생성자 컴파일만)

**Interfaces:**
- Produces: README "서버 API" 표(`userHint`, `at`, 확정 검사 규칙). 화면은 가짜 응답으로 먼저 썼다(FE1 Task 1·4).

- [ ] **Step 1: 실패하는 시험 — `classify`**

`LT/service/ErdConfirmCheckClassifyTest.java`(Oracle 안 씀, 순수):
```java
package com.dongkuk.dmes.mdm.dma.erdEdit.service;

class ErdConfirmCheckClassifyTest {
    /** Review Focus 5: 두 번째 확정에서 새 표의 감사 컬럼 위반은 경고, 같은 묶음의 일반 컬럼 위반은 오류(U29). */
    @Test
    void auditColumnsNeverBlockConfirm() {
        ErdModel m = model(table("t-1", "TB_A"), col("c-1", "t-1", "NAME_X"), col("c-a", "t-1", "C_AT"));
        Map<String, ErdColumnStatus> st = Map.of("c-1", ErdColumnStatus.MISS, "c-a", ErdColumnStatus.DOMAIN);
        var r = ErdConfirmCheck.classify(m, st, Set.of("c-1", "c-a"), false);
        assertThat(r.errors()).extracting(MdmCheckIssue::itemKey).containsExactly("c-1");
        assertThat(r.warnings()).extracting(MdmCheckIssue::itemKey).contains("c-a");
        assertThat(r.warnings()).filteredOn(i -> "c-a".equals(i.itemKey())).extracting(MdmCheckIssue::code).containsExactly("ERD_STD_DOMAIN");
    }
    @Test
    void firstVersionWarnsOnly() { /* firstVersion=true → errors 비고 둘 다 warnings */ }
    @Test
    void unchangedViolationIsWarning() { /* changed 에 없으면 일반 컬럼도 warnings */ }
    @Test
    void inferredLeftStaysWarning() { /* INFERRED 관계 1개 → ERD_INFERRED_LEFT 경고 1건 */ }
}
```
`model`·`table`·`col` 도우미는 `ErdModel` 필드를 직접 채운다(`ErdModel.empty("m","S")` 뒤 `tables.put`·`columns.put`, 필드 이름은 `ErdModel`·`ErdTable`·`ErdColumn` 소스를 보고 맞춘다). 실행 → `classify` 없음으로 실패.

- [ ] **Step 2: `ErdConfirmCheck.classify`**

`check` 의 `statuses.forEach` 부터 `return` 까지를 정적 메서드로 옮긴다:
```java
/** 확정 검사 판정(순수). D19: 첫 버전은 모두 경고. 감사 컬럼(ErdAuditColumns) 위반은 늘 경고 — UX 1차 U29(사용자 결정 10-11). */
static ConfirmCheckResult classify(ErdModel now, Map<String, ErdColumnStatus> statuses, Set<String> changed, boolean firstVersion) {
    List<MdmCheckIssue> errors = new ArrayList<>();
    List<MdmCheckIssue> warnings = new ArrayList<>();
    statuses.forEach((id, st) -> {
        if (!st.blocksConfirm()) return;
        ErdColumn c = now.columns.get(id);
        ErdTable t = now.tables.get(c.table);
        String where = (t == null ? c.table : t.phys) + "." + c.phys;
        MdmCheckIssue issue = new MdmCheckIssue("ERD_STD_" + st.name(), where + " 표준 위반(" + st.name() + ")", "column", id);
        boolean blocks = !firstVersion && changed.contains(id) && !ErdAuditColumns.isAudit(c.phys);
        (blocks ? errors : warnings).add(issue);
    });
    long inferred = now.relations.values().stream().filter(r -> "INFERRED".equals(r.state)).count();
    if (inferred > 0) warnings.add(new MdmCheckIssue("ERD_INFERRED_LEFT", "검토하지 않은 추정 관계 " + inferred + "개", "relation", null));
    return new ConfirmCheckResult(errors, warnings);
}
```
`check` 는 `return classify(now, ErdStandardJudge.judge(now, dictionaries.load()), changed, firstVersion);`. `ErdAuditColumns` 는 public(패키지 `engine`) — import 만. 시험 통과. (U29 를 "아예 뺌" 으로 바꿀 때는 `blocks` 줄 앞에 `if (ErdAuditColumns.isAudit(c.phys)) return;` 를 넣는다 — 승인 표 A9.)

- [ ] **Step 3: 실패하는 시험 — `ErdUserHints`**

`LT/engine/ErdUserHintsTest.java`:
```java
class ErdUserHintsTest {
    private static final Pattern MACHINE = ErdUserHints.MACHINE;

    /** Review Focus 6: 조사로 모은 기계 hint 전부 → userHint 에 기계 용어가 없다. 정본 표(README) 값과 같다. */
    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "CONFLICT|getChangesSince(212) 로 최신 값을 읽고 다시 보내세요|화면이 최신 값으로 바뀌었습니다. 확인한 뒤 다시 고치세요.",
        "CONFLICT|getChangesSince 로 확인한 뒤 직접 고치세요|그 뒤에 바뀐 값이 있어 되돌릴 수 없습니다. 변경 기록에서 다른 변경을 고르거나 직접 고치세요.",
        "NOT_FOUND|getChangesSince 로 최신 모델을 읽으세요|다른 사람이 지운 요소입니다. 화면이 최신 상태로 바뀌었는지 확인하세요.",
        "NOT_FOUND|getModelText 로 id 를 확인하세요|화면을 새로 고친 뒤 다시 하세요.",
        "INVALID|getChangesSince 가 준 rev 를 쓰세요|화면을 새로 고친 뒤 다시 하세요.",
        "INVALID|지금 DRAFT 에서 한 변경만 되돌리세요. getChangesSince 가 reload 를 주면 모델을 다시 읽으세요|지금 DRAFT 에서 한 변경만 되돌릴 수 있습니다.",
        "INVALID|compare kind=DB_DIFF 로 차이를 다시 읽고 고르세요|[DB 다시 가져오기] 탭에서 [새로 읽기] 한 뒤 다시 고르세요.",
        "INVALID|import kind=FROM_DB 로 첫 가져오기를 하세요|[DB 에서 가져오기] 로 먼저 가져오세요.",
        "NOT_EDITOR|copy 로 새 버전을 먼저 만드세요|[버전 ▾] 에서 [새 버전] 을 만드세요.",
        "INVALID|setPrimaryKey 로 바꾸세요|PK 는 [PK 추가] 로 바꾸세요.",
        "INVALID|confirmRelation 또는 updateRelation 으로 기존 관계를 쓰세요|이미 있는 관계입니다. 추정 관계면 [맞음] 으로 확정하세요.",
    })
    void mapsMachineHints(String code, String hint, String expected) {
        assertThat(ErdUserHints.of(code, hint, null)).isEqualTo(expected);
        assertThat(MACHINE.matcher(expected).find()).isFalse();
    }
    @Test void addEditorUsesOwner() {
        assertThat(ErdUserHints.of("NOT_EDITOR", "소유자(41000132)에게 공동 편집자 등록(execute kind=ADD_EDITOR)을 요청하세요", "41000132"))
            .isEqualTo("소유자(41000132)에게 공동 편집자 등록을 요청하세요.");
    }
    @Test void humanHintPassesThrough() { assertThat(ErdUserHints.of("INVALID", "다른 물리명을 쓰세요", null)).isEqualTo("다른 물리명을 쓰세요"); }
    @Test void requestShapeHintsGiveNull() {
        assertThat(ErdUserHints.of("INVALID", "op 를 넣으세요", null)).isNull();
        assertThat(ErdUserHints.of("INVALID", "명령 JSON 의 모양과 값 형식을 확인하세요", null)).isNull();
        assertThat(ErdUserHints.of("INVALID", null, null)).isNull();
    }
    /** 엔진·서비스의 hint 문자열을 grep 으로 모아 붙인 목록(조사 표 전부) — userHint 가 null 이거나 기계 용어가 없다. */
    @Test void userHintNeverLeaksMachineTerms() { /* 위 CSV 와 조사 표의 나머지 hint(약 25개)를 List.of 로 → 모두 검사 */ }
    @Test void jsonCarriesUserHintAndKeepsHint() throws Exception {
        var r = new ErdRejection("CONFLICT", 0, "m", "getChangesSince(3) 로 최신 값을 읽고 다시 보내세요", "c-1", "logical", 3L, "s", null, null);
        JsonNode j = ErdModelCodec.MAPPER.valueToTree(r);
        assertThat(j.path("hint").asText()).startsWith("getChangesSince(3)");
        assertThat(j.path("userHint").asText()).isEqualTo("화면이 최신 값으로 바뀌었습니다. 확인한 뒤 다시 고치세요.");
    }
}
```
`userHintNeverLeaksMachineTerms` 의 목록은 `grep -rn '"[^"]*\(getChangesSince\|getModelText\|kind=\|baseRev\|setPrimaryKey\|copy 로\|op 를\|JSON\)' E/` 결과에서 hint 인 문자열을 그대로 옮긴다(조사 표: Ctx 66·91·197·200, ErdCommandEngine 505·514·557·593, ErdIntegrity 102, ErdDiagramStore 223·334, ErdCommandService 108·203·217·226·236-239·261·302·378·394·399·414, ErdCommandEngine 38·45·56·432, ErdRelationOps 233). 실행 → 실패.

- [ ] **Step 4: `ErdUserHints` + `ErdRejection.userHint()`**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

/**
 * 사람용 다음 할 일(UX 1차 U27). hint 는 MCP·CLI(LLM)용 글이라 그대로 두고, 화면은 이 값만 보인다.
 * 기계 용어가 없으면 hint 그대로, 있으면 정본 표의 사람 글, 맞는 글이 없으면 null(화면에 안내 없음).
 */
public final class ErdUserHints {
    public static final Pattern MACHINE = Pattern.compile(
            "getChangesSince|getModelText|baseRev|\\bview\\b|kind=|restore|undo\\(|\\bop\\b|JSON|setPrimaryKey|confirmRelation|updateRelation|copy 로");
    private static final String REFRESH = "화면을 새로 고친 뒤 다시 하세요.";
    private ErdUserHints() {}

    public static String of(String code, String hint, String ownerId) {
        if (hint == null || hint.isBlank()) return null;
        if (!MACHINE.matcher(hint).find()) return hint;
        if (hint.contains("getChangesSince(") && hint.contains("다시 보내세요")) return "화면이 최신 값으로 바뀌었습니다. 확인한 뒤 다시 고치세요.";
        if (hint.contains("getChangesSince 로 확인한 뒤 직접 고치세요")) return "그 뒤에 바뀐 값이 있어 되돌릴 수 없습니다. 변경 기록에서 다른 변경을 고르거나 직접 고치세요.";
        if (hint.contains("getChangesSince 로 최신 모델을 읽으세요")) return "다른 사람이 지운 요소입니다. 화면이 최신 상태로 바뀌었는지 확인하세요.";
        if (hint.contains("getChangesSince 가 준 값을 그대로") || hint.contains("restore 값은")) return null;
        if (hint.contains("지금 DRAFT 에서 한 변경만 되돌리세요")) return "지금 DRAFT 에서 한 변경만 되돌릴 수 있습니다.";
        if (hint.contains("getModelText 로") || hint.contains("가 준 rev") || hint.contains("로 받은 rev")
                || hint.contains("view 가 준 rev") || hint.contains("reload 를 주면 모델을 다시 읽고")) return REFRESH;
        if (hint.contains("compare kind=DB_DIFF")) return "[DB 다시 가져오기] 탭에서 [새로 읽기] 한 뒤 다시 고르세요.";
        if (hint.contains("import kind=FROM_DB")) return "[DB 에서 가져오기] 로 먼저 가져오세요.";
        if (hint.contains("execute kind=ADD_EDITOR"))
            return ownerId == null ? "소유자에게 공동 편집자 등록을 요청하세요." : "소유자(" + ownerId + ")에게 공동 편집자 등록을 요청하세요.";
        if (hint.contains("copy 로 새 버전")) return "[버전 ▾] 에서 [새 버전] 을 만드세요.";
        if (hint.contains("setPrimaryKey 로")) return "PK 는 [PK 추가] 로 바꾸세요.";
        if (hint.contains("confirmRelation 또는 updateRelation")) return "이미 있는 관계입니다. 추정 관계면 [맞음] 으로 확정하세요.";
        return null;
    }
}
```
순서 주의: "지금 DRAFT 에서 한 변경만" 줄은 "reload 를 주면" 보다 먼저. `ErdRejection` 에:
```java
/** 사람용 다음 할 일(U27). JSON 에만 나간다(읽기 전용) — 생성자·hint 는 그대로. */
@JsonProperty(value = "userHint", access = JsonProperty.Access.READ_ONLY)
public String userHint() { return ErdUserHints.of(code, hint, ownerId); }
```
(`com.fasterxml.jackson.annotation.JsonProperty`.) 이 record 를 JSON 에서 읽는 곳이 있으면 READ_ONLY 로 무시된다 — `grep -rn "ErdRejection.class" src/backend/mdm` 로 확인. 시험 통과.

- [ ] **Step 5: `ErdDelta.at`**

```java
public record ErdDelta(String modelId, long rev, String userId, String session, String source, Long rowVersion,
                       List<ErdChange> changes, String at) {
    /** at 없는 모양(시험·옛 호출). at 은 null. */
    public ErdDelta(String modelId, long rev, String userId, String session, String source, Long rowVersion, List<ErdChange> changes) {
        this(modelId, rev, userId, session, source, rowVersion, changes, null);
    }
    private static final DateTimeFormatter AT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    /** 명령 기록 시각 → "yyyy-MM-ddTHH:mm:ss"(서버 지역 시각, 초 단위. toString 은 초 0 을 줄여 쓰지 않음). */
    public static String atOf(LocalDateTime t) { return t == null ? null : AT.format(t); }
}
```
시험 하나로 초 0 시각(`2026-10-11T14:03:00`)이 그대로 나오는지 고정. 생성 지점:
- `ErdCommandLogStore.since`: SELECT 에 `C_AT` 를 더하고 `atOf(rs.getTimestamp("C_AT").toLocalDateTime())`.
- `ErdCommandService` 실시간 delta(조사 `:333`): `atOf(LocalDateTime.now())`(기록 INSERT 가 `SYSTIMESTAMP` 라 초 단위로 같다).
- `ErdReloadMarker`(`:48`): 그 표시 행을 쓸 때의 `LocalDateTime.now()`.
- 시험 3곳(`ErdChangesSinceFromRevTest`, `ErdEventHubQueueTest`, api `ErdEventHubGapRowVersionTest`)은 7인자 생성자라 그대로 컴파일된다.
- SSE·`view` JSON 에 `"at"` 이 더해지는지 시험 하나: `ErdChangesSinceFromRevTest` 에 `ErdCommandLogStore` 흉내가 at 을 주면 결과 delta `at()` 이 그 값.

- [ ] **Step 6: 가져오기 격자 행 높이(U24)**

`ErdImportBuilder`:
```java
static final int NODE_HEAD = 30, NODE_ROW = 20, GRID_GAP_Y = 60;
/** 감사 컬럼을 뺀 컬럼 수로 어림한 노드 높이(화면 기본은 감사 컬럼 숨김). */
private int estHeight(String tableId) { … 30 + 20 × (그 표 컬럼 중 !ErdAuditColumns.isAudit(phys) 수) }
```
놓기 루프: 행(`i / GRID_COLS`)마다 그 행 표들의 `estHeight` 최댓값을 구하고, `y` 는 앞 행들의 (최댓값 + 60) 합. `GRID_DY` 상수는 지운다(다른 참조가 있으면 남기고 보고). `ErdImportBuilderTest.diagramPlacesTablesInNameGrid` 의 기대 `nodes/8/y` 를 `30 + 20 * 1 + 60 = 110` 으로 바꾸고, 시험 하나 더함 `gridRowHeightFollowsTallestTable`(행 0 에 컬럼 10개 표 하나 → 다음 행 y = 30 + 200 + 60 = 290).

- [ ] **Step 7: MCP·CLI 시험**

리포 루트에서 `pnpm install --frozen-lockfile`(없으면) → `node --test scripts/erd/tests/`. `at`·`userHint` 가 더해져 정확한 모양 비교가 깨지면 그 시험의 기대값만 고친다(스크립트 코드는 안 고침). 결과 글이 바뀌면 안 된다.

- [ ] **Step 8: 넓은 lib 시험**

`../gradlew :lib:test --max-workers=2 --tests '*erdEdit*'` (Oracle 안 씀). hint 글자를 보는 기존 시험 4건(조사 표)이 그대로 통과해야 한다.

- [ ] **Step 9: Oracle 시험은 마감에서**

`ErdVersionServiceTest`(확정 검사 통합)는 마감 Task 9 Step 1 에서 돈다. 레인에서 돌리려면 heavy 슬롯.

- [ ] **Step 10: 커밋**

`feat(erd): 확정 검사에서 감사 컬럼은 경고만·사람용 userHint·변경 기록 시각·가져오기 격자 행 높이`. 보고: 기계 hint 목록 수, `userHint` 가 null 인 hint 목록, 바꾼 시험.

---

### Task 6: 큰 모델 읽기 ① — 2-D 배치, 단계별 그리기, 미니맵, Shift+1/2, 자기 참조 알림, 노드 위반 수

**Files:**
- Modify: `S/canvas/erd-layout.ts`, `S/canvas/erd-geometry.ts`, `S/canvas/ErdTableNode.tsx`, `S/canvas/ErdRelationEdge.tsx`, `S/canvas/erd-flow.ts`, `S/canvas/useCanvasEditing.ts`, `S/canvas/erd-shortcuts.ts`(필요하면), `S/canvas/erd-edit-styles.ts`
- Create: `S/canvas/erd-minimap.ts`
- Test: `T/erd-canvas-commands.test.ts`·`T/audit-columns.test.ts`(배치 기대값), 새 `T/erd-layout-2d.test.ts`, `T/erd-canvas-editing.test.ts`, `T/erd-flow.test.ts`, `T/erd-canvas.test.ts`

**Interfaces:**
- Consumes: README "큰 모델 읽기" 정본, U23·U38·U42·U50·U51, FE1 Task 1 의 `state/violations.ts`(Step 7).
- Produces: `layoutTables`·`autoLayoutCommand` 새 서명(마법사·Task 7 나누기가 씀), `ZOOM_OVERVIEW`·`lodTier`, `.react-flow[data-lod]`·`--erd-zoom`.

- [ ] **Step 1: 실패하는 시험 — 2-D 배치**

`T/erd-layout-2d.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { components, layoutTables, packShelves, wrapRanks } from "../../../pages/dma/erdEdit/canvas/erd-layout";
import type { ErdModelJson } from "../../../pages/dma/erdEdit/types";

/** 부모 1 → 자식 40, 외톨이 16(MCM 모양). 표 크기 240×(30+20×n). */
function bigModel(): ErdModelJson { /* tables t-p, t-c0..t-c39, t-i0..t-i15 / relations r-i: child t-ci → parent t-p (state DB) */ }
const size = (id: string) => ({ width: 240, height: id.startsWith("t-i") ? 110 : 250 });
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("2-D 자동 배치(U23)", () => {
  it("layoutTables2dKeepsAspectAndOrder — 캔버스 비 1.77 에서 가로세로 비 0.88-3.5, 겹침 0, 같은 결과, 부모가 자식 왼쪽", () => {
    const m = bigModel();
    const ids = Object.keys(m.tables);
    const pos = layoutTables(m, ids, size, { x: 0, y: 0 }, 1.77);
    const boxes = ids.map((id) => ({ id, x: pos[id].x, y: pos[id].y, w: 240, h: size(id).height }));
    const w = Math.max(...boxes.map((b) => b.x + b.w)) - Math.min(...boxes.map((b) => b.x));
    const h = Math.max(...boxes.map((b) => b.y + b.h)) - Math.min(...boxes.map((b) => b.y));
    expect(w / h).toBeGreaterThanOrEqual(0.88);
    expect(w / h).toBeLessThanOrEqual(3.5);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j])).toBe(false);
    expect(layoutTables(m, [...ids].reverse(), size, { x: 0, y: 0 }, 1.77)).toEqual(pos);
    for (let k = 0; k < 40; k++) expect(pos["t-p"].x).toBeLessThan(pos[`t-c${k}`].x);
  });
  it("components — 관계로 이어진 묶음, 물리명 순으로 흔들리지 않음", () => { /* 두 묶음 + 외톨이 */ });
  it("wrapRanks — 높이 상한을 넘는 층을 옆 열로 나누고 층 순서를 지킨다", () => { /* 한 층 10개 × 250, 상한 1000 → 열 3개 */ });
  it("packShelves — 줄 폭을 넘으면 다음 줄, 큰 상자 먼저", () => { /* 상자 4개 */ });
});
```
`bigModel` 은 `erd-fixtures.ts` 의 표·관계 모양(`menuModel` 참고)으로 만든다. 실행 → 실패.

- [ ] **Step 2: `erd-layout.ts` 2-D**

알고리즘(정본 서명 README):
1. `list` = 물리명 순. `edges = relationEdges(model, set)`.
2. `components(list, edges)`: 무방향 연결 묶음(BFS, 시작은 물리명 순). 표 하나짜리는 외톨이.
3. 목표: `area = Σ (w + 40) × (h + 40)`, `aspect` 기본 1.6, `targetH = sqrt(area / aspect)`, `rowWidth = targetH × aspect`.
4. 묶음(2개 이상)마다 `autoLayout(nodes, edges, { direction: "LR", nodeGap: 40, rankGap: 100 })` → 묶음 높이가 `max(targetH, 가장 큰 노드 높이)` 를 넘으면 `wrapRanks(pos, size, maxH, 40, 100)`.
   - `wrapRanks`: 노드를 `x` 로 층으로 묶는다(같은 x). 층 순서대로, 층 안은 y 순. 열에 노드를 쌓다 `y + h > maxHeight` 면 새 열(x += 그 열 최대 폭 + 40). 층이 끝나면 x += 100(rankGap). 결과 왼쪽 위 = (0,0).
   - 그러면 앞 층 모든 열이 다음 층보다 왼쪽 → "부모 x < 자식 x" 유지(LR 에서 부모가 앞 층).
5. 상자 목록 = 묶음마다 경계 상자 + 외톨이 표마다 상자. `packShelves(boxes, rowWidth, 60)`: 면적 내림차순(같으면 id), 줄에 놓다 `x + w > rowWidth` 이고 줄이 비어 있지 않으면 다음 줄(y += 그 줄 최대 높이 + 60).
6. 최종 = `origin + 상자 자리 + 묶음 안 자리`, 정수로 반올림.
- `autoLayoutCommand(state, diagramId, measured, showAudit, aspect)` 는 `aspect` 를 `layoutTables` 로 넘긴다. `useCanvasEditing.layout` 이 `const { width, height } = storeApi.getState(); const aspect = width > 0 && height > 0 ? width / height : 1.6;` 를 넘긴다. `wizardPlacement` 의 auto 도 같은 `layoutTables`(aspect 기본).
- 기존 시험 `erd-canvas-commands.test.ts` 169·186줄, `audit-columns.test.ts` 204줄 기대값이 바뀌면, 바뀐 것이 "부모 왼쪽·왼쪽 위 유지·이미 그 자리면 null" 성질이면 그 성질로 다시 쓰고 좌표 숫자 비교는 새 결과로 고친다. 고친 이유를 보고.
- 시험 통과(t6a 커밋).

- [ ] **Step 3: 확인 — 57개 모델 맞춤 배율**

시험 하나 더함 `fitOf57Is25PercentOrMore`: `layoutTables(bigModel, …, 1018/574)` 경계 상자에 `getViewportForBounds(b, 1018, 574, 0.1, 1, 0.1).zoom >= 0.25`(1920 기본 캔버스 크기 = C 측정). 못 넘으면 간격(40·60·100)을 줄여 맞추고 값 보고. 커밋.

- [ ] **Step 4: 단계별 그리기(U50)**

- `erd-geometry.ts`: `ZOOM_OVERVIEW = 0.35`, `LodTier`, `lodTier(z) = z >= ZOOM_NAMES_ONLY ? "detail" : z >= ZOOM_OVERVIEW ? "names" : "overview"`, `OVERVIEW_FONT_PX = 12`, `OVERVIEW_FONT_MAX_FLOW = 60`.
- `ErdTableNode.tsx`: `export const overviewSelector = (s) => s.transform[2] < ZOOM_OVERVIEW` 를 더해 불리언 두 개만 구독. `overview` 면:
  ```tsx
  <div className="erd-node" data-lod="overview" style={{ height: data.boxHeight }} data-testid={`erd-node-${id}`}>
    <div className="erd-node__ov"><div className="erd-node__ov-l">{data.logicalName}</div><div className="erd-node__ov-p">{data.physName}</div></div>
  </div>
  ```
  `data.boxHeight`·`logicalName`·`physName` 은 `buildFlow`(`erd-flow.ts`)가 `namesOnly` 와 상관없이 채운다(`boxHeight` = `namesOnly` 가 아닐 때의 `initialHeight`). 손잡이(관계 끝점)는 그대로 둔다.
- `erd-edit-styles.ts`:
  ```css
  .erd-node[data-lod="overview"] { display: flex; align-items: center; justify-content: center; background: var(--color-bg-header); }
  .erd-node__ov { padding: 0 var(--spacing-xs); text-align: center; overflow: hidden;
    font-size: min(calc(12px / var(--erd-zoom, 1)), 60px); line-height: 1.15; word-break: break-all;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
  .erd-node__ov-p { font-family: var(--font-family-mono); color: var(--color-text-muted); }
  .react-flow[data-lod="names"] .erd-node[data-names-only] .erd-node__title { font-size: min(calc(12px / var(--erd-zoom, 1)), 34px); }
  .react-flow[data-lod="overview"] .erd-rel__end, .react-flow[data-lod="overview"] .erd-rel__zero,
  .react-flow[data-lod="overview"] .erd-rel__label { display: none; }
  .react-flow[data-lod="overview"] .erd-rel .erd-rel__line { stroke-width: min(calc(1.5px / var(--erd-zoom, 1)), 8px); }
  ```
  (12px·60px 은 OVERVIEW_FONT_* 상수와 같은 값. CSS 에 숫자를 쓰는 것은 토큰 규칙의 색 금지와 무관.)
- `useCanvasEditing.ts`: 효과 하나 — `storeApi.subscribe` 로 `transform[2]` 를 받아 `domNode`(`.react-flow` 요소)에 `style.setProperty("--erd-zoom", String(z))` 와 `dataset.lod = lodTier(z)` 를 쓴다(값이 같으면 안 씀). 노드 React 렌더를 일으키지 않는다.
- 시험 `lodTierRerendersOnlyOnTierChange`(`T/erd-canvas.test.ts`, Review Focus 8): 노드 렌더 수를 세는 흉내(`ErdTableNode` 를 감싼 spy 나 React Profiler) — 어려우면 순수 시험 `lodTier` 경계 값 + `useCanvasEditing` 이 `data-lod` 를 쓰는지 DOM 시험으로 갈음하고 보고.
- `names` 단계(0.35-0.5)도 머리 이름 글자를 키운다(위 CSS 첫 줄, 34px = 12 / 0.35). 그래서 첫 화면 맞춤 문턱(U22, 0.35)에서 열린 다이어그램도 읽힌다.
- 마감 확인 값: 1920 기본, MCM 57개 자동 배치 뒤 화면 맞춤 → 노드 글자 화면 높이 11px 이상(ego-browser `getComputedStyle(...).fontSize × zoom`). 배율 0.4·0.3 두 곳에서.

- [ ] **Step 5: 미니맵(U51)**

- `erd-minimap.ts`: README 정본. `loadShowMiniMap(n)`: try `localStorage.getItem(KEY)` → `"1"` true, `"0"` false, 없으면 `n >= 30`. 실패하면 `n >= 30`. `saveShowMiniMap` try/catch. `miniMapNodeColor(n)`: `n.selected` → `"var(--color-primary)"`, `n.data.violations > 0` → `"var(--color-danger-soft)"`, 그 밖 `"var(--color-bg-header)"`.
- `useCanvasEditing`: `const [miniMap, setMiniMap] = useState(() => loadShowMiniMap(tableCount))`. `overlay` 에 `miniMap && h(MiniMap, { position: "bottom-right", pannable: true, zoomable: true, nodeColor: miniMapNodeColor, ariaLabel: "미니맵", style: { bottom: 48 }, className: "erd-minimap", "data-testid": "erd-minimap" })` — `MiniMap` 은 `@dk-oasis/shared/react-flow` 에서 import(`@xyflow/react` 다시 내보냄). `overlay` 는 `ReactFlowProvider` 안이라 store 를 읽는다. 위치가 Controls 와 겹치면 `style` 로 띄운다.
- 도구 막대에 [미니맵] 아이콘 토글(`erd-tool-minimap`, `aria-pressed`, tip "미니맵 — 켜짐/꺼짐"). 누르면 `setMiniMap(!v)`+`saveShowMiniMap`.
- 시험(`T/erd-canvas-editing.test.ts`): 표 30개 다이어그램, 저장값 없음 → `erd-minimap` 있음; 토글 → 없음 + localStorage `"0"`.

- [ ] **Step 6: Shift+1/2(U38)·자기 참조 알림(U42)**

- `onKeyDown` 의 `handlers` 에:
  ```ts
  fitView: () => fitTo(rf.getNodes().map((n) => n.id)),
  fitSelection: () => { const ids = selectedIds(); if (ids.length === 0) { ctxRef.current.notify("표를 먼저 고르세요.", "info"); return undefined; } fitTo(ids); },
  ```
  `fitTo(ids)` = `getViewportForBounds(rf.getNodesBounds(ids), width, height, minZoom, 1, 0.1)` → `rf.setViewport(vp, { duration: 200 })`(Local-Rules §33, `ErdViewer.fitAll` 과 같은 방식). `ERD_CANVAS_SHORTCUTS` 에 이미 `fitView`·`fitSelection`(shared) 이 있다.
- `flowProps` Pick 에 `"onConnectStart" | "onConnectEnd" | "onNodeClick"` 를 더한다(`ErdViewer` 는 `{...editing.flowProps}` 로 펼치므로 FE1 파일 변경 없음).
- `onConnectEnd = (_e, cs) => { if (relationToolRef && cs.fromNode && cs.toNode && cs.fromNode.id === cs.toNode.id) ctxRef.current.notify(SELF_REF_TEXT, "warn"); }`. `SELF_REF_TEXT` = README U42 글. `isValidConnection` 은 그대로.
- 시험(`T/erd-canvas-editing.test.ts`): `onConnectEnd` 를 `flowProps` 에서 꺼내 같은 노드 연결 상태로 부르면 `notify` 가 경고로 불림. Shift+2 고른 표 없음 → 안내. Shift+1 → `setViewport` 불림(rf 흉내).
- 통과·커밋(t6b).

- [ ] **Step 7: 노드 위반 수(U25) — FE1 Task 1 머지 뒤**

dev rebase. `erd-flow.ts:337` 근처 `violations` 를 `countTableViolations(m, t, i.statuses, i.showAudit)` 로(`state/violations.ts`). `BAD_STATUSES` 를 다른 파일이 쓰면 `BLOCKING_STATUSES` 로 바꾼다(FE1 파일이면 남기고 보고). 시험 `T/erd-flow.test.ts`: 감사 컬럼 DOMAIN 하나 + 일반 MISS 하나 → 감사 숨김이면 1, 보이면 2.

- [ ] **Step 8: 통과 확인·커밋(t6c)**

`pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/`, lint, audit. 커밋 `feat(erd): 큰 모델 읽기 — 2-D 자동 배치·개요 단계 그리기·미니맵·Shift+1/2·자기 참조 알림`. 보고에 도움말 반영 메모(§3.1·§3.2·§4.3·§4.4·§5).

---

### Task 7: 큰 모델 읽기 ②(주제별 나누기) + 도구 막대·메뉴·안내 줄·새 표 창

**Files:**
- Create: `S/canvas/erd-split.ts`, `S/canvas/SplitDialog.tsx`
- Modify: `S/canvas/erd-commands.ts`(`tablePrefix`), `S/canvas/ErdToolbar.tsx`, `S/canvas/useCanvasEditing.ts`, `S/canvas/CanvasDialogs.tsx`, `S/canvas/erd-edit-styles.ts`
- Test: 새 `T/erd-split.test.ts`, `T/erd-canvas-editing.test.ts`, `T/erd-canvas-commands.test.ts`

**Interfaces:**
- Consumes: FE1 Task 1(`ErdNav.startColumnAdd`·`selectDiagram`, `shortReason`), README U40-U44·U52·U53, Task 6 `layoutTables`.
- Produces: testid `erd-tool-addcol`·`erd-tool-addpk`·`erd-tool-relmenu`·`erd-tool-split`·`erd-tool-hint`·`erd-split-*`·`erd-newtable-preview`.

- [ ] **Step 1: 실패하는 시험 — `tablePrefix`·`subjectGroups`**

`T/erd-split.test.ts`:
```ts
describe("주제별 나누기(U52)", () => {
  it("tablePrefix — 절반 넘는 표의 TB_<X>_", () => { /* TB_MCM_* 40 + TB_X 2 → "TB_MCM_" ; 절반 이하 → "" */ });
  it("subjectGroupsBoundedAndStable — 5-20개, 표마다 한 묶음, 같은 결과", () => {
    // TB_MCM_SEC_* 12, TB_MCM_CODE_* 3(SEC 와 관계 2개), TB_MCM_JOB_* 25(관계 묶음 2개: 15 + 10), 기타 17(각자 다른 첫 토막, 관계 없음)
    const g = subjectGroups(m, ids);
    expect(new Set(g.flatMap((x) => x.tables)).size).toBe(ids.length);
    expect(g.flatMap((x) => x.tables)).toHaveLength(ids.length);
    for (const x of g) expect(x.tables.length).toBeLessThanOrEqual(20);
    const small = g.filter((x) => x.tables.length < 5);
    expect(small.every((x) => x.key.startsWith("기타"))).toBe(true);
    expect(small.length).toBeLessThanOrEqual(1);
    expect(g.map((x) => x.name)).toContain("SEC");           // CODE 3개는 관계가 많은 SEC 에 붙음(12+3=15)
    expect(g.filter((x) => x.name.startsWith("JOB"))).toHaveLength(2);
    expect(subjectGroups(m, [...ids].reverse())).toEqual(g);
  });
  it("splitCommands — 묶음마다 addDiagram + placeTables, 한 묶음 200 이하", () => { /* wizardCommands 모양, sortSeq 는 nextSortSeq 부터 */ });
});
```
실행 → 실패.

- [ ] **Step 2: `erd-split.ts`·`tablePrefix`**

- `tablePrefix(model)`(`erd-commands.ts`): 물리명 `^TB_[A-Z0-9]+_` 를 세어 가장 흔한 것이 표 수의 절반 초과면 그것, 아니면 `""`.
- `subjectGroups(model, tables, { min = 5, max = 20 })`: README U52 규칙 (1)-(4). 세부:
  - 열쇠: `phys.slice(prefix.length).split("_")[0]` (빈 글이면 phys 그대로).
  - (2) 나누기: 묶음 안 관계(`relationEdges`)로 `components` → 큰 것부터 담되 20 넘으면 그 덩어리를 물리명 순 20개씩. 이름 `${key} 1`·`${key} 2`(나뉠 때만 번호).
  - (3) 붙이기: 5 미만 묶음 A 마다, 다른 묶음 B 와 걸린 관계 수(REJECTED 제외)를 세어 가장 많은 B(같으면 이름순) 가 `|A| + |B| ≤ max` 면 B 에 붙임(B 의 이름 유지). 붙일 곳이 없으면 "기타" 로. "기타" 는 물리명 순 20개씩 `기타 1`…(하나면 `기타`).
  - 결과 정렬: 이름순, 표는 물리명 순.
- `splitCommands(state, groups, areaName, newId, showAudit, aspect)`: `sortSeq = nextSortSeq(state.diagrams)` 부터 묶음마다 `wizardCommands({ id: newId(), areaName, diagramName: g.name, sortSeq: seq++, nodes: layoutTables 결과 })`. 배열 하나가 `MAX_BATCH`(200)를 넘지 않게 묶음 단위로 나눠 `ErdCommandJson[][]` 로 돌려준다(README 정본).
시험 통과.

- [ ] **Step 3: `SplitDialog`**

shared `Modal`(`title="주제별로 나누기"`, `size="md"`), 본문 `data-testid="erd-split-dialog"`:
- 위: "표 이름 앞부분(예: SEC, CODE)으로 5-20개씩 나눠 다이어그램을 만듭니다. 만든 뒤에는 보통 다이어그램처럼 고칩니다."
- 업무영역 칸(기본 "주제별").
- 묶음 목록(`AgDataGrid height="auto"` — Part B: 목록은 AgDataGrid): 칸 [만들기 체크] · 이름 · 표 수 · 앞 표 3개. 같은 이름 다이어그램이 그 업무영역에 있으면 체크 끄고 칸 "이미 있음". 행 `data-testid` 는 그리드 rowKey 로 `erd-split-group-{key}`(어려우면 체크 칸 render 의 span testid).
- [만들기](`erd-split-ok`, 고른 묶음이 없거나 `!rights.diagram.ok` 면 끔 + title 이유).
- 보내기: `ctx.apply(commands, "주제별로 나누기")`. 여러 배열이면 차례로, 하나라도 거절이면 멈추고 알림(앞 것은 남음 — 창에 "n개 만들었습니다, 나머지는 실패" 글). 끝나면 닫고 `ctx.nav.selectDiagram(첫 새 id)`, `notify("다이어그램 n개를 만들었습니다.")`.

- [ ] **Step 4: 나누기 연결·시험(t7a)**

- 도구 막대 [주제별 나누기] 아이콘(`erd-tool-split`, `IconLayoutGrid` 같은 tabler 아이콘, tip "주제별로 나누기 — 표 이름별 작은 다이어그램", 꺼지면 `— ${shortReason}`).
- 빈 곳 메뉴 항목 `{ id: "split", label: "주제별로 나누기…" }`.
- 시험: 창을 열고 [만들기] → `apply` 명령에 `addDiagram` n개, 그 뒤 `nav.selectDiagram` 불림. 권한 없으면 단추 꺼짐.
- 커밋.

- [ ] **Step 5: 도구 막대 글자 단추(U43)**

`ErdToolbar.tsx`:
- 앞쪽에 글자 단추: [표 추가](`erd-tool-table`, 도구 2 그대로), [관계 ▾](`erd-tool-relmenu` → `ContextMenu` 두 항목 "비식별 관계 (4)"·"식별 관계 (5)", 지금 `erd-tool-relation`·`erd-tool-identifying` 아이콘 단추는 남겨 testid 를 지킨다), [컬럼 추가](`erd-tool-addcol`), [PK 추가](`erd-tool-addpk`). 글자 단추는 shared `Button size="sm"`. 꺼진 단추는 감싼 `span title`.
- [컬럼 추가]·[PK 추가]: 고른 표가 정확히 하나이고 `rights.model.ok` 일 때만. 누르면 `onAddColumn(pk)` → `useCanvasEditing` 이 `ctx.nav.startColumnAdd(selectedIds()[0], pk)`.
- `tipOf` 의 이유를 `shortReason(r.reason)` 로(U19). 예: "표 추가 (2) — 공동 편집자 아님".
- 막대가 좁은 캔버스(538px)에서 넘치면 `flex-wrap: wrap`(`erd-edit-styles.ts`).

- [ ] **Step 6: 표 오른쪽 클릭 메뉴(U44)**

`onNodeContextMenu` 항목 앞에(표 하나일 때):
```ts
{ id: "addcol", label: "컬럼 추가", run: () => ctxRef.current.nav.startColumnAdd(node.id, false), ...off(r.model) },
{ id: "addpk", label: "PK 컬럼 추가", run: () => ctxRef.current.nav.startColumnAdd(node.id, true), ...off(r.model) },
{ id: "rel-start", label: "관계 시작", children: [
  { id: "rel-start-n", label: "비식별 관계", run: () => startRelationFrom(node.id, false), ...off(r.model) },
  { id: "rel-start-i", label: "식별 관계", run: () => startRelationFrom(node.id, true), ...off(r.model) },
] },
```
`off` 의 `title` 도 `shortReason`. `startRelationFrom(table, identifying)`: 도구를 relation/identifying 로, `fromTable` 상태를 둔다. `onNodeClick(_e, node)`: `fromTable` 이 있으면 — 같은 표면 자기 참조 알림(U42) 후 유지, 다르면 `addRelation(fromTable, node.id, identifying, "ASK")` 후 `fromTable=null`. Esc 는 `fromTable` 도 지운다(`escape` 에 더함).

- [ ] **Step 7: 안내 줄(U41)**

`overlay` 에 도구가 select 가 아니면:
```ts
h("div", { className: "erd-tool-hint", role: "status", "data-testid": "erd-tool-hint" }, hintText(tool, started))
```
`hintText`(순수, export): table → "표를 놓을 빈 곳을 누르세요 · Esc 취소"; relation·identifying 이고 시작 전 → `${identifying ? "식별 관계: " : ""}부모 표에서 자식 표로 끌거나, 부모 표 → 자식 표 순서로 누르세요 · Esc 취소`; 시작 뒤(`onConnectStart` 이후 또는 `fromTable`) → "자식 표를 누르세요 · Esc 취소". `onConnectEnd` 에서 `started=false`. CSS(`erd-edit-styles.ts`): 캔버스 위 가운데 `position:absolute; top: var(--spacing-sm); left:50%; transform:translateX(-50%); z-index:5;` 토큰 색 `--color-primary-soft` 바탕. 도구 막대와 겹치면 `top` 을 막대 아래로.

- [ ] **Step 8: 새 표 창 논리명 먼저(U40)**

`CanvasDialogs.tsx` `NewTableModal`:
- 칸 순서 논리명(autoFocus) → 물리명.
- 논리명이 300ms 멈추면 `previewName({ logical })`(요청 순번으로 늦은 응답 버림, §37). 응답 `physName` 이 있고 사용자가 물리명을 직접 고치지 않았으면(`physTouched=false`) 물리명 = `tablePrefix(model) + physName`.
- 미리보기 줄 `erd-newtable-preview`: `물리명 미리보기 ${값} — 사전 기준, 고칠 수 있습니다`. 토막에 사전 없는 단어(`status` 가 `UNKNOWN` 계열, `TokenChoiceModal` 의 판정 함수 재사용)가 있으면 "사전에 없는 단어가 있어 물리명을 직접 넣으세요."
- 물리명 칸을 사용자가 바꾸면 `physTouched=true`. 논리명 칸 Enter = 만들기(물리명 검사 통과일 때).
- `onSubmit(phys, logical)` 서명 그대로.
- 시험(`T/erd-canvas-editing.test.ts` 또는 새 `T/new-table-modal.test.ts`): 논리명 "메뉴 권한" → 미리보기 흉내 `MENU_AUTH` → 물리명 칸 `TB_MCM_MENU_AUTH`; 물리명을 고친 뒤 논리명을 바꿔도 물리명 유지.

- [ ] **Step 9: 시험·lint·audit**

`T/erd-canvas-editing.test.ts` 새 시험: 도구 막대 [컬럼 추가] → `nav.startColumnAdd(tableId, false)`, 표 둘 고르면 꺼짐; 메뉴 `addpk` → `startColumnAdd(id, true)`; 메뉴 `rel-start-n` 뒤 다른 표 `onNodeClick` → `addRelation` 명령; 같은 표 → 경고 알림; 안내 줄 글 세 가지.

- [ ] **Step 10: 커밋(t7b)**

`feat(erd): 주제별로 나누기·글자 도구 단추·표 메뉴 컬럼/PK/관계 시작·관계 안내 줄·새 표 논리명 먼저`. 보고에 도움말 반영 메모(§4.2·§4.3·§4.4).

---

### Task 8: 입력 칸 [물리명도] 끔·경고, 짧은 이유, DB 다시 가져오기 이름

**Files:**
- Modify: `S/panels/GridInputBar.tsx`, `S/panels/ColumnGrid.tsx`(문구만), `S/panels/DbDiffApply.tsx`
- Test: `T/grid-edit.test.ts`, `T/column-grid.test.ts`, `T/db-diff-apply.test.ts`

- [ ] **Step 1: 실패하는 시험 — [물리명도]**

`T/grid-edit.test.ts`:
- 컬럼을 고르면 `물리명도` 체크가 꺼져 있다. [논리명 바꾸기] → `updateColumn.set` 에 `phys` 없음.
- 체크를 켜고 미리보기 `physName` 이 지금 물리명과 다르면 `erd-grid-phys-warn` 글 = `물리명도 MENU_NM → MENU_NAME 으로 바뀝니다(DB 와 달라짐)`. 같으면 경고 없음.
- 다른 컬럼을 고르면 체크가 다시 꺼진다.
실행 → 실패.

- [ ] **Step 2: `GridInputBar`**

- `useState(true)` → `useState(false)`. `useEffect(() => setWithPhysName(false), [focusColumnId])`.
- 경고 줄: `withPhysName && settled && focusCol && settled.physName !== focusCol.phys` 면 `<div data-testid="erd-grid-phys-warn" style={WARN}>물리명도 {focusCol.phys} → {settled.physName} 으로 바뀝니다(DB 와 달라짐)</div>`(WARN = `color: var(--color-warning)`).
- `reason` 줄: `ctx.rights.model.reason` → `읽기 전용 — ${shortReason(reason)}`(긴 글은 위 막대 칩, U19).
- 시험 통과.

- [ ] **Step 3: `ColumnGrid` 문구**

빈 표 안내·그리드 머리 글에 rev·영어 코드가 있으면 쉬운 말로. `STATUS_LABEL` 은 그대로(이미 한국어). 바뀐 것이 없으면 이 Step 건너뜀(보고).

- [ ] **Step 4: `DbDiffApply`**

- 반영 창 제목 "DB 다시 가져오기", 단추 "고른 항목 가져오기", 새로 읽기 단추 "새로 읽기", 빈 글 "DB 와 모델이 같습니다."(띄어쓰기 C 20번).
- 거절 글 = `rejectionText`(FE1 이 `userHint` 로 바꿈) — 직접 `message — hint` 를 만드는 줄(`DbDiffApply.tsx:114` 근처)이 있으면 `rejectionText` 로.
- [고른 항목 가져오기] 가 꺼지면 감싼 `span title` = 고른 항목 없음 "항목을 먼저 고르세요" / 권한 `shortReason`.
- 읽기 전용 긴 문장이 탭 안에 있으면 짧은 이유로.
- `T/db-diff-apply.test.ts` 의 글 비교를 새 글로.

- [ ] **Step 5: 전체 화면 시험·lint·audit**

- [ ] **Step 6: 커밋**

`feat(erd): [물리명도] 기본 끔·물리명 바뀜 경고·짧은 이유·DB 다시 가져오기 이름`. 보고에 도움말 반영 메모(§4.2·§4.6·문제 해결).

---

## 계획 작성자 메모

- 서버를 FE2 첫 Task 로 둔 것은 파일이 겹치지 않고 일이 작아서다(README U1). 서버 레인을 따로 띄우려면 Task 5 를 그대로 떼어 준다.
- `userHint` 는 record 의 JSON 메서드라 생성자 서명이 그대로다. 거절 지점 25곳 넘게 손대지 않는다. 대신 hint 전수 시험(`userHintNeverLeaksMachineTerms`)이 새 기계 hint 를 잡는다.
- `ErdDelta` 는 8번째 칸을 더하고 7인자 생성자를 남겨 시험 3곳이 그대로 컴파일된다.
- 2-D 배치 문턱(목표 비·간격)은 어림이다. Step 3 의 "57개 맞춤 배율 0.25 이상" 시험이 기준이다. 못 넘으면 간격을 줄이고 값을 보고.
- 개요 단계 글자 크기는 CSS `calc(12px / var(--erd-zoom))` 로 한다. 노드 컴포넌트가 배율을 구독하면 확대·축소마다 57개 노드가 다시 그려진다(Local-Rules §19). 그래서 단계 판정만 구독하고 배율 값은 DOM 변수로 쓴다.
- 주제별 나누기는 서버 변경 없이 기존 명령(`addDiagram`·`placeTables`)이다. 다이어그램 권한(`rights.diagram`)이라 확정본에서도 소유자·공동 편집자면 할 수 있다(S2-20).
- 미니맵 기억은 감사 토글과 같은 브라우저 단위 키다(사용자별 prefs 는 FE1 소유라 FE2 가 쓰지 않는다).
