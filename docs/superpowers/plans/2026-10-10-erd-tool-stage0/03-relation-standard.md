# ERD 도구 단계 0 — Task 5~6: 관계 명령·표준 판정기

> 공통 제약(Global Constraints)·스펙과 다르게 정한 점(P1~P10)·Review Focus·파일 구조는 [README](README.md) 에 있다. 이 문서의 모든 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [02-model-engine.md](02-model-engine.md) · [README](README.md) · 다음: [04-version.md](04-version.md)

### Task 5: 명령 엔진 2 — 관계

**Files:**
- Modify: `.../dma/erdEdit/engine/ErdRelationOps.java`
- Test: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/engine/ErdCommandEngineRelationTest.java`

**Interfaces:**
- Consumes: Task 4 `Ctx`, `ErdCommandEngine.addColumn/deleteColumn`, `ErdCommand.AddRelation` 등.
- Produces: 관계 명령 5종 동작. `AddRelation` 규칙:
  - `parentRef` 가 있으면 다른 모델 관계다. `dbFk=true` 면 INVALID. `pairs` 를 반드시 줘야 한다(자식 컬럼 id, 다른 모델 컬럼 id).
  - `pairs` 가 없으면 부모 PK 컬럼을 자식에 복사한다. 자식에 같은 물리명 컬럼이 있으면 `onNameClash` 에 따라: `ASK`(기본) → `NEEDS_CHOICE`(choices 에 겹친 컬럼 목록), `REUSE` → 그 컬럼을 짝으로 쓴다, `RENAME` → `{부모표물리명에서 TB_ 뗀 앞부분}_` 접두를 붙인 새 컬럼을 만든다.
  - `identifying=true` 면 짝의 자식 컬럼들을 자식 PK 에 더한다(PK 가 없으면 만든다).
  - 새 관계의 `state` 는 `CONFIRMED`, `dbFk` 기본값은 `parentRef == null`.

- [ ] **Step 1: 실패하는 시험 작성**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ErdCommandEngineRelationTest {

    final ErdCommandEngine engine = new ErdCommandEngine(ErdNaming.NONE);

    /** ROLE(PK ROLE_ID) · MAPPING(OBJECT_ID, ROLE_ID 없음) */
    ErdModel base(boolean childHasRoleId) {
        var cmds = new java.util.ArrayList<ErdCommand>(List.of(
                new AddTable("t-r", "TB_MCM_SEC_ROLE", "역할", ""),
                new AddColumn("c-r1", "t-r", "ROLE_ID", "역할아이디", null, "VARCHAR2", 30, null, true, null, "", null),
                new SetPrimaryKey("t-r", List.of("c-r1"), null),
                new AddTable("t-m", "TB_MCM_SEC_ROLE_MAPPING", "역할권한매핑", ""),
                new AddColumn("c-m1", "t-m", "OBJECT_ID", "객체아이디", null, "VARCHAR2", 50, null, true, null, "", null),
                new SetPrimaryKey("t-m", List.of("c-m1"), null)));
        if (childHasRoleId) {
            cmds.add(new AddColumn("c-m2", "t-m", "ROLE_ID", "역할아이디", null, "VARCHAR2", 30, null, false, null, "", null));
        }
        return ((ApplyOutcome.Applied) engine.apply(ErdModel.empty("mcm", "S"), 0, 1, "s-a", cmds)).next();
    }

    @Test
    void identifyingRelationCopiesParentPkIntoChildPk() {
        var out = (ApplyOutcome.Applied) engine.apply(base(false), 1, 2, "s-a",
                List.of(new AddRelation("r-1", "t-m", "t-r", null, true, null, null, null)));
        ErdModel m = out.next();
        var rel = m.relations.get("r-1");
        String childCol = rel.pairs.get(0).get(0);
        assertThat(m.columns.get(childCol).phys).isEqualTo("ROLE_ID");
        assertThat(rel.pairs.get(0).get(1)).isEqualTo("c-r1");
        assertThat(m.keys.values()).filteredOn(k -> "t-m".equals(k.table) && "PK".equals(k.kind))
                .singleElement().satisfies(k -> assertThat(k.columns).containsExactly("c-m1", childCol));
        assertThat(rel.state).isEqualTo("CONFIRMED");
        assertThat(rel.dbFk).isTrue();
        assertThat(out.changes()).extracting(ErdChange::kind).contains("column", "relation", "key", "table");
    }

    @Test
    void nameClashAsksByDefault() {
        var out = engine.apply(base(true), 1, 2, "s-a",
                List.of(new AddRelation("r-1", "t-m", "t-r", null, false, null, null, null)));
        var rej = ((ApplyOutcome.Rejected) out).rejection();
        assertThat(rej.code()).isEqualTo("NEEDS_CHOICE");
        assertThat(rej.choices().toString()).contains("c-m2");
    }

    @Test
    void nameClashReuseUsesExistingColumn() {
        var out = (ApplyOutcome.Applied) engine.apply(base(true), 1, 2, "s-a",
                List.of(new AddRelation("r-1", "t-m", "t-r", null, false, null, "REUSE", null)));
        assertThat(out.next().relations.get("r-1").pairs).containsExactly(List.of("c-m2", "c-r1"));
    }

    @Test
    void crossModelRelationCannotBeDbFk() {
        var out = engine.apply(base(true), 1, 2, "s-a", List.of(new AddRelation("r-1", "t-m", null,
                new ErdParentRefArg("mdm", "t-x", List.of("c-x")), false, List.of(List.of("c-m2", "c-x")), null, true)));
        assertThat(((ApplyOutcome.Rejected) out).rejection().code()).isEqualTo("INVALID");
    }

    @Test
    void confirmAndRejectChangeStateOnly() {
        ErdModel m = ((ApplyOutcome.Applied) engine.apply(base(true), 1, 2, "s-a",
                List.of(new AddRelation("r-1", "t-m", "t-r", null, false, null, "REUSE", null)))).next();
        m.relations.get("r-1").state = "INFERRED";
        ErdModel rejected = ((ApplyOutcome.Applied) engine.apply(m, 2, 3, "s-a", List.of(new RejectRelation("r-1")))).next();
        assertThat(rejected.relations.get("r-1").state).isEqualTo("REJECTED");
        assertThat(rejected.relations).containsKey("r-1");
    }

    @Test
    void deleteParentTableRemovesRelationsAndUndoRestoresAll() {
        var withRel = (ApplyOutcome.Applied) engine.apply(base(false), 1, 2, "s-a",
                List.of(new AddRelation("r-1", "t-m", "t-r", null, true, null, null, null)));
        var del = (ApplyOutcome.Applied) engine.apply(withRel.next(), 2, 3, "s-a", List.of(new DeleteTable("t-r")));
        assertThat(del.next().relations).isEmpty();
        assertThat(del.next().tables).doesNotContainKey("t-r");
        ErdModel back = ((ApplyOutcome.Applied) engine.apply(del.next(), 3, 4, "s-a", del.inverse())).next();
        assertThat(back.tables).containsKey("t-r");
        assertThat(back.relations).containsKey("r-1");
        assertThat(back.keys.values()).filteredOn(k -> "t-r".equals(k.table)).hasSize(1);
    }

    @Test
    void updateRelationCardinality() {
        ErdModel m = ((ApplyOutcome.Applied) engine.apply(base(true), 1, 2, "s-a",
                List.of(new AddRelation("r-1", "t-m", "t-r", null, false, null, "REUSE", null)))).next();
        var out = (ApplyOutcome.Applied) engine.apply(m, 2, 3, "s-a", List.of(new UpdateRelation("r-1",
                Map.of("cardinality", Map.of("parent", "ZERO_OR_ONE", "child", "ONE_OR_MORE")))));
        assertThat(out.next().relations.get("r-1").cardinality.child).isEqualTo("ONE_OR_MORE");
    }
}
```

- [ ] **Step 2: 시험이 실패하는지 확인**

Run: `cd src/backend/mdm && ../gradlew :lib:test --max-workers=2 --tests '*ErdCommandEngineRelationTest'`
Expected: FAIL("아직 지원하지 않습니다").

- [ ] **Step 3: `ErdRelationOps` 구현**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.*;
import com.fasterxml.jackson.databind.node.ArrayNode;
import java.util.*;

/** 관계 명령(스펙 4.1·D7·D8). */
final class ErdRelationOps {

    private static final Set<String> PARENT_CARD = Set.of("ONE", "ZERO_OR_ONE");
    private static final Set<String> CHILD_CARD = Set.of("ZERO_OR_MORE", "ONE_OR_MORE", "ZERO_OR_ONE", "ONE");

    private ErdRelationOps() {
    }

    static void add(ErdCommandEngine e, Ctx c, AddRelation a) {
        ErdTable child = c.table(a.child());
        String id = c.newIdOrGiven(a.id(), 'r');
        boolean cross = a.parentRef() != null;
        boolean dbFk = a.dbFk() == null ? !cross : a.dbFk();
        if (cross && dbFk) throw c.invalid("다른 모델 표와의 관계는 DB FK 로 만들 수 없습니다(ADR 0003)", "dbFk 를 false 로 두세요", id, "dbFk");
        List<List<String>> pairs = new ArrayList<>();
        if (cross) {
            if (a.pairs() == null || a.pairs().isEmpty()) throw c.invalid("다른 모델 관계는 pairs 가 필요합니다", "[[자식 컬럼 id, 부모 컬럼 id]] 를 넣으세요", id, "pairs");
            for (List<String> p : a.pairs()) { c.column(p.get(0)); pairs.add(List.copyOf(p)); }
        } else if (a.pairs() != null && !a.pairs().isEmpty()) {
            c.table(a.parent());
            for (List<String> p : a.pairs()) { c.column(p.get(0)); c.column(p.get(1)); pairs.add(List.copyOf(p)); }
        } else {
            ErdTable parent = c.table(a.parent());
            List<String> parentPk = c.m.keys.values().stream()
                    .filter(k -> a.parent().equals(k.table) && "PK".equals(k.kind))
                    .findFirst().map(k -> k.columns).orElse(List.of());
            if (parentPk.isEmpty()) throw c.invalid("부모 표에 PK 가 없습니다: " + parent.phys, "부모 표의 PK 를 먼저 정하세요", a.parent(), null);
            String mode = a.onNameClash() == null ? "ASK" : a.onNameClash();
            ArrayNode clashes = com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec.MAPPER.createArrayNode();
            Map<String, String> sameName = new LinkedHashMap<>();
            for (String pcid : parentPk) {
                ErdColumn pc = c.m.columns.get(pcid);
                child.columnOrder.stream().filter(cid -> pc.phys.equals(c.m.columns.get(cid).phys)).findFirst()
                        .ifPresent(cid -> { sameName.put(pcid, cid); clashes.addObject().put("parentColumn", pcid).put("childColumn", cid).put("phys", pc.phys); });
            }
            if (!sameName.isEmpty() && mode.equals("ASK")) {
                throw c.needsChoice(id, "onNameClash", "자식 표에 같은 이름의 컬럼이 있습니다",
                        "onNameClash 를 REUSE(그 컬럼을 쓴다) 또는 RENAME(접두를 붙여 새로 만든다)으로 다시 보내세요", clashes);
            }
            for (String pcid : parentPk) {
                ErdColumn pc = c.m.columns.get(pcid);
                String childCol = sameName.get(pcid);
                if (childCol == null || mode.equals("RENAME")) {
                    String phys = childCol == null ? pc.phys : prefix(parent.phys) + "_" + pc.phys;
                    String newId = ErdIds.newId('c');
                    e.addColumn(c, new AddColumn(newId, a.child(), phys, pc.logical, pc.domainId, pc.dataType,
                            pc.length, pc.scale, a.identifying(), null, "", null));
                    childCol = newId;
                }
                pairs.add(List.of(childCol, pcid));
            }
        }
        if (a.identifying()) {
            List<String> pk = new ArrayList<>(c.m.keys.values().stream()
                    .filter(k -> a.child().equals(k.table) && "PK".equals(k.kind))
                    .findFirst().map(k -> k.columns).orElse(List.of()));
            for (List<String> p : pairs) if (!pk.contains(p.get(0))) pk.add(p.get(0));
            e.dispatchPublic(c, new SetPrimaryKey(a.child(), pk, null));
        }
        c.touch("relation", id);
        ErdRelation r = new ErdRelation();
        r.child = a.child();
        r.parent = cross ? null : a.parent();
        r.parentRef = cross ? new ErdParentRef(a.parentRef().model(), a.parentRef().table(), a.parentRef().columns()) : null;
        r.pairs = pairs;
        r.identifying = a.identifying();
        r.dbFk = dbFk;
        r.state = "CONFIRMED";
        c.m.relations.put(id, r);
        c.m.tombstones.remove(id);
        c.stamp(r.rev, Set.of("identifying", "cardinality", "dbFk", "state"));
    }

    @SuppressWarnings("unchecked")
    static void update(Ctx c, UpdateRelation u) {
        ErdRelation r = c.relation(u.id());
        c.requireKnownKeys(u.set(), ErdCommandEngine.RELATION_PROPS, u.id());
        c.checkConflict(r.rev, u.set().keySet(), u.id(), c.node(r));
        c.touch("relation", u.id());
        for (var e : u.set().entrySet()) {
            switch (e.getKey()) {
                case "identifying" -> r.identifying = Boolean.TRUE.equals(e.getValue());
                case "dbFk" -> {
                    boolean v = Boolean.TRUE.equals(e.getValue());
                    if (v && r.parentRef != null) throw c.invalid("다른 모델 표와의 관계는 DB FK 로 만들 수 없습니다", "dbFk 를 false 로 두세요", u.id(), "dbFk");
                    r.dbFk = v;
                }
                case "cardinality" -> {
                    Map<String, String> card = (Map<String, String>) e.getValue();
                    String p = card.getOrDefault("parent", r.cardinality.parent), ch = card.getOrDefault("child", r.cardinality.child);
                    if (!PARENT_CARD.contains(p) || !CHILD_CARD.contains(ch)) throw c.invalid("카디널리티 값이 틀렸습니다", "parent: " + PARENT_CARD + ", child: " + CHILD_CARD, u.id(), "cardinality");
                    r.cardinality.parent = p;
                    r.cardinality.child = ch;
                }
                default -> throw new IllegalStateException();
            }
        }
        c.stamp(r.rev, u.set().keySet());
    }

    static void setState(Ctx c, String id, String state) {
        ErdRelation r = c.relation(id);
        c.checkConflict(r.rev, Set.of("state"), id, c.node(r));
        c.touch("relation", id);
        r.state = state;
        c.stamp(r.rev, Set.of("state"));
    }

    static void delete(Ctx c, String id, boolean checkConflict) {
        ErdRelation r = c.relation(id);
        if (checkConflict) c.checkConflict(r.rev, r.rev.keySet(), id, c.node(r));
        c.touch("relation", id);
        c.m.relations.remove(id);
        c.m.tombstones.put(id, new PropRev(c.newRev, c.session));
    }

    /** TB_MCM_SEC_ROLE → MCM_SEC_ROLE (RENAME 접두). */
    static String prefix(String tablePhys) {
        return tablePhys.startsWith("TB_") ? tablePhys.substring(3) : tablePhys;
    }
}
```

`ErdCommandEngine` 에 관계 연산이 SetPrimaryKey 를 부를 수 있도록 package-private 메서드를 더한다.
```java
    void dispatchPublic(Ctx c, ErdCommand cmd) {
        dispatch(c, cmd);
    }
```
`addColumn` 의 접근 수준이 package-private 인지 확인한다(Task 4 코드 그대로면 이미 그렇다). 관계 `rev` 에는 `state` 도 찍으므로 `ErdCommandEngine.RELATION_PROPS` 는 고치지 않는다(`state` 는 confirm/reject 명령으로만 바꾼다).

- [ ] **Step 4: 시험 통과 확인**

Run: Step 2 명령과 Task 4 시험. Expected: 둘 다 PASS.

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/backend/mdm/lib
/usr/bin/git commit -m "feat(mdm): ERD 명령 엔진 — 관계 추가·식별 관계 PK 복사·이름 충돌 선택·다른 모델 관계"
```

---

### Task 6: 표준 판정기와 논리명 자동 채움

**Files:**
- Create: `.../dma/erdEdit/standard/{ErdColumnStatus,ErdDictionary,ErdDictionaryLoader,ErdStandardJudge}.java`
- Modify: `.../dma/erdEdit/engine/ErdColumnFill.java`
- Test: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/standard/ErdStandardJudgeTest.java`

**Interfaces:**
- Consumes: `ColumnNameComposer(TermDictionary)`, `forward/reverse : NameComposition`, `TermDictionary.of(List<TermEntry>)`, `DomainSuggester.suggest/recommended`, `DomainEntry`, `TermDictionaryLoader.load(MdmTermRepository)`.
- Produces:
  - `enum ErdColumnStatus { OK, ALIAS, NEW, TYPE, DOMAIN, MISS }` — 뒤일수록 나쁘다. `blocksConfirm()` 는 `TYPE`, `DOMAIN`, `MISS` 에서 true.
  - `final class ErdDictionary implements ErdNaming` — 생성자 `ErdDictionary(TermDictionary terms, Set<String> columnPhys, Set<String> aliasPhys, Map<Long, ErdDomainSpec> domains, List<DomainEntry> domainEntries)`.
  - `ErdStandardJudge.judge(ErdModel m, ErdDictionary d) : Map<String, ErdColumnStatus>` (모델 전체), `judge(ErdModel, ErdDictionary, Collection<String> columnIds)`.
  - `@Component ErdDictionaryLoader` — `ErdDictionary load()` 를 요청마다 부른다(계획 P3, 캐시 없음).

- [ ] **Step 1: 실패하는 시험 작성**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.naming.DomainEntry;
import com.dongkuk.dmes.mdm.dma.naming.TermDictionary;
import com.dongkuk.dmes.mdm.dma.naming.TermEntry;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class ErdStandardJudgeTest {

    static ErdDictionary dict() {
        TermDictionary terms = TermDictionary.of(List.of(
                new TermEntry(1L, "역할", 1, "", null, "Role", "ROLE", "[]", "[]"),
                new TermEntry(2L, "아이디", 1, "", null, "Id", "ID", "[]", "[]"),
                new TermEntry(3L, "명", 1, "", null, "Name", "NM", "[]", "[]"),
                new TermEntry(4L, "일자", 1, "", null, "Date", "DT", "[]", "[]"),
                new TermEntry(5L, "주문", 1, "", null, "Order", "ORD", "[]", "[]"),
                new TermEntry(6L, "주문", 2, "", null, "Order", "ODR", "[]", "[]")));
        var idDomain = new ErdDomainSpec(10L, "아이디", "VARCHAR2", 30, null);
        var dtDomain = new ErdDomainSpec(30L, "일자", "VARCHAR2", 8, null);
        return new ErdDictionary(terms, Set.of("ROLE_ID"), Set.of("ROLE_NM"),
                Map.of(10L, idDomain, 30L, dtDomain),
                List.of(new DomainEntry(10L, "아이디", "ID"), new DomainEntry(30L, "일자", "DT")));
    }

    ErdModel model(ErdNaming naming, ErdCommand... cmds) {
        var out = new ErdCommandEngine(naming).apply(ErdModel.empty("mcm", "S"), 0, 1, "s", List.of(cmds));
        return ((ApplyOutcome.Applied) out).next();
    }

    @Test
    void statusesForEachKind() {
        ErdDictionary d = dict();
        ErdModel m = model(ErdNaming.NONE,
                new AddTable("t-1", "TB_A", "에이", ""),
                new AddColumn("c-ok", "t-1", "ROLE_ID", "역할아이디", 10L, "VARCHAR2", 30, null, true, null, "", null),
                new AddColumn("c-al", "t-1", "ROLE_NM", "역할명", null, "VARCHAR2", 100, null, false, null, "", null),
                new AddColumn("c-new", "t-1", "ROLE_DT", "역할일자", 30L, "VARCHAR2", 8, null, false, null, "", null),
                new AddColumn("c-dom", "t-1", "ID", "아이디", 10L, "VARCHAR2", 255, null, false, null, "", null),
                new AddColumn("c-miss", "t-1", "BIZ_CD", "업무코드", null, "VARCHAR2", 10, null, false, null, "", null),
                new AddTable("t-2", "TB_B", "비", ""),
                new AddColumn("c-ty", "t-2", "ROLE_DT", "역할일자", null, "NUMBER", 8, null, false, null, "", null));
        Map<String, ErdColumnStatus> s = ErdStandardJudge.judge(m, d);
        assertThat(s.get("c-ok")).isEqualTo(ErdColumnStatus.OK);
        assertThat(s.get("c-al")).isEqualTo(ErdColumnStatus.ALIAS);
        assertThat(s.get("c-dom")).isEqualTo(ErdColumnStatus.DOMAIN);
        assertThat(s.get("c-miss")).isEqualTo(ErdColumnStatus.MISS);
        assertThat(s.get("c-ty")).isEqualTo(ErdColumnStatus.TYPE);
        assertThat(s.get("c-new")).isEqualTo(ErdColumnStatus.TYPE); // 같은 물리명 ROLE_DT 가 다른 표에서 NUMBER
    }

    @Test
    void addColumnFromLogicalFillsPhysAndDomain() {
        ErdModel m = model(dict(), new AddTable("t-1", "TB_A", "에이", ""),
                new AddColumn("c-1", "t-1", null, "역할아이디", null, null, null, null, true, null, "", null));
        assertThat(m.columns.get("c-1").phys).isEqualTo("ROLE_ID");
        assertThat(m.columns.get("c-1").domainId).isEqualTo(10L);
        assertThat(m.columns.get("c-1").length).isEqualTo(30);
    }

    @Test
    void ambiguousTokenNeedsChoice() {
        var out = new ErdCommandEngine(dict()).apply(ErdModel.empty("mcm", "S"), 0, 1, "s", List.of(
                new AddTable("t-1", "TB_A", "에이", ""),
                new AddColumn("c-1", "t-1", null, "주문일자", null, null, null, null, false, null, "", null)));
        var rej = ((ApplyOutcome.Rejected) out).rejection();
        assertThat(rej.code()).isEqualTo("NEEDS_CHOICE");
        assertThat(rej.choices().toString()).contains("ORD").contains("ODR");
    }

    @Test
    void addColumnWithUnknownTokenNeedsChoice() {
        var out = new ErdCommandEngine(dict()).apply(ErdModel.empty("mcm", "S"), 0, 1, "s", List.of(
                new AddTable("t-1", "TB_A", "에이", ""),
                new AddColumn("c-1", "t-1", null, "역할 (예비)", null, null, null, null, false, null, "", null)));
        var rej = ((ApplyOutcome.Rejected) out).rejection();
        assertThat(rej.code()).isEqualTo("NEEDS_CHOICE");
        assertThat(rej.choices().toString()).contains("UNKNOWN");
    }

    @Test
    void engineWarnsOnlyForTouchedColumns() {
        var engine = new ErdCommandEngine(dict());
        ErdModel m = model(ErdNaming.NONE, new AddTable("t-1", "TB_A", "에이", ""),
                new AddColumn("c-miss", "t-1", "BIZ_CD", "업무코드", null, "VARCHAR2", 10, null, false, null, "", null),
                new AddColumn("c-ok", "t-1", "ROLE_ID", "역할아이디", 10L, "VARCHAR2", 30, null, true, null, "", null));
        var out = (ApplyOutcome.Applied) engine.apply(m, 1, 2, "s",
                List.of(new UpdateColumn("c-ok", Map.of("comment", "설명"))));
        assertThat(out.warnings()).isEmpty();
    }
}
```

- [ ] **Step 2: 시험이 실패하는지 확인**

Run: `cd src/backend/mdm && ../gradlew :lib:test --max-workers=2 --tests '*ErdStandardJudgeTest'`
Expected: 컴파일 실패.

- [ ] **Step 3: 구현**

```java
// ErdColumnStatus.java
package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

/** 컬럼 표준 상태(스펙 2.1-3, 계획 P4). 선언 순서 = 나쁜 순서(뒤가 나쁨). */
public enum ErdColumnStatus {
    OK, ALIAS, NEW, TYPE, DOMAIN, MISS;

    public boolean blocksConfirm() {
        return this == TYPE || this == DOMAIN || this == MISS;
    }

    public ErdColumnStatus worse(ErdColumnStatus other) {
        return other.ordinal() > ordinal() ? other : this;
    }
}

// ErdDictionary.java
package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.*;
import com.dongkuk.dmes.mdm.dma.naming.*;
import java.util.*;

/** 요청 하나 동안 쓰는 사전 묶음(계획 P3). 엔진에는 ErdNaming 으로 들어간다. */
public final class ErdDictionary implements ErdNaming {

    private final ColumnNameComposer composer;
    final Set<String> columnPhys;
    final Set<String> aliasPhys;
    private final Map<Long, ErdDomainSpec> domains;
    private final List<DomainEntry> domainEntries;

    public ErdDictionary(TermDictionary terms, Set<String> columnPhys, Set<String> aliasPhys,
                         Map<Long, ErdDomainSpec> domains, List<DomainEntry> domainEntries) {
        this.composer = new ColumnNameComposer(terms);
        this.columnPhys = columnPhys;
        this.aliasPhys = aliasPhys;
        this.domains = domains;
        this.domainEntries = domainEntries;
    }

    @Override
    public Optional<NameComposition> forward(String logical) {
        return Optional.of(composer.forward(logical));
    }

    public NameComposition reverse(String phys) {
        return composer.reverse(phys);
    }

    @Override
    public Optional<ErdDomainSpec> domain(Long domainId) {
        return Optional.ofNullable(domains.get(domainId));
    }

    @Override
    public Optional<ErdDomainSpec> recommendDomain(String physName) {
        DomainEntry rec = DomainSuggester.recommended(DomainSuggester.suggest(physName, domainEntries));
        return rec == null ? Optional.empty() : domain(rec.domainId());
    }

    @Override
    public List<ErdWarning> warnings(ErdModel model, List<String> columnIds) {
        List<ErdWarning> out = new ArrayList<>();
        ErdStandardJudge.judge(model, this, columnIds).forEach((id, st) -> {
            switch (st) {
                case MISS -> out.add(new ErdWarning("STD_MISS", id, "사전에 없는 단어가 있습니다(***)"));
                case DOMAIN -> out.add(new ErdWarning("STD_DOMAIN", id, "도메인의 타입·길이와 다릅니다"));
                case TYPE -> out.add(new ErdWarning("STD_TYPE", id, "같은 물리명의 다른 컬럼과 타입이 다릅니다"));
                case NEW -> out.add(new ErdWarning("STD_NEW", id, "컬럼 사전에 아직 없는 이름입니다"));
                default -> { }
            }
        });
        return out;
    }
}

// ErdStandardJudge.java
package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.*;
import java.util.*;

/** 컬럼 표준 판정(스펙 2.1-3). 저장하지 않고 읽을 때 계산한다. */
public final class ErdStandardJudge {

    private ErdStandardJudge() {
    }

    public static Map<String, ErdColumnStatus> judge(ErdModel m, ErdDictionary d) {
        return judge(m, d, m.columns.keySet());
    }

    public static Map<String, ErdColumnStatus> judge(ErdModel m, ErdDictionary d, Collection<String> columnIds) {
        Map<String, Set<String>> typesByPhys = new HashMap<>();
        for (ErdColumn c : m.columns.values()) typesByPhys.computeIfAbsent(c.phys, k -> new HashSet<>()).add(typeKey(c));
        Map<String, ErdColumnStatus> out = new LinkedHashMap<>();
        for (String id : columnIds) {
            ErdColumn c = m.columns.get(id);
            if (c == null) continue;
            ErdColumnStatus s;
            if (d.columnPhys.contains(c.phys)) s = ErdColumnStatus.OK;
            else if (d.aliasPhys.contains(c.phys)) s = ErdColumnStatus.ALIAS;
            else if (d.reverse(c.phys).placeholder()) s = ErdColumnStatus.MISS;
            else s = ErdColumnStatus.NEW;
            if (c.domainId != null) {
                var dom = d.domain(c.domainId);
                if (dom.isPresent() && !sameType(c, dom.get().dataType(), dom.get().length(), dom.get().scale())) s = s.worse(ErdColumnStatus.DOMAIN);
            }
            if (typesByPhys.getOrDefault(c.phys, Set.of()).size() > 1) s = s.worse(ErdColumnStatus.TYPE);
            out.put(id, s);
        }
        return out;
    }

    static String typeKey(ErdColumn c) {
        return c.dataType + "(" + c.length + "," + c.scale + ")";
    }

    static boolean sameType(ErdColumn c, String dataType, Integer length, Integer scale) {
        return Objects.equals(c.dataType, dataType) && Objects.equals(c.length, length) && Objects.equals(c.scale, scale);
    }
}
```

`statusesForEachKind` 의 `c-new` 기대값이 `TYPE` 인 이유: 같은 물리명 `ROLE_DT` 가 `t-2` 에서 `NUMBER` 라 타입 불일치가 더 나쁘다. 이 판정 순서를 바꾸지 않는다.

`ErdColumnFill` 완성:

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.dongkuk.dmes.mdm.dma.naming.NameComposition;
import com.dongkuk.dmes.mdm.dma.naming.NameToken;
import com.dongkuk.dmes.mdm.dma.naming.TokenStatus;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;

/** 논리명으로 물리명·도메인을 채운다. 후보가 하나일 때만 채우고, 아니면 NEEDS_CHOICE(스펙 4.1). */
record ErdColumnFill(String phys, Long domainId) {

    static ErdColumnFill fromLogical(ErdNaming naming, Ctx c, String logical, String id) {
        if (logical == null || logical.isBlank()) throw c.invalid("물리명과 논리명이 모두 없습니다", "logical 또는 phys 를 넣으세요", id, "phys");
        NameComposition nc = naming.forward(logical).orElseThrow(() ->
                c.invalid("사전 판정을 쓸 수 없습니다", "phys 를 직접 넣으세요", id, "phys"));
        boolean single = !nc.placeholder() && nc.tokens().stream()
                .allMatch(t -> t.status() == TokenStatus.MATCHED || t.status() == TokenStatus.SYNONYM);
        if (!single) {
            ArrayNode choices = ErdModelCodec.MAPPER.createArrayNode();
            for (NameToken t : nc.tokens()) {
                var o = choices.addObject().put("seq", t.seq()).put("surface", t.surface()).put("status", t.status().name());
                var cands = o.putArray("candidates");
                if (t.candidates() != null) t.candidates().forEach(cd -> cands.add(ErdModelCodec.MAPPER.valueToTree(cd)));
            }
            throw c.needsChoice(id, "phys", "논리명 '" + logical + "' 의 물리명을 하나로 정할 수 없습니다",
                    "choices 에서 토막별 약어를 골라 phys 를 직접 넣으세요", choices);
        }
        Long domainId = naming.recommendDomain(nc.physName()).map(d -> d.domainId()).orElse(null);
        return new ErdColumnFill(nc.physName(), domainId);
    }
}
```

`TermCandidate` 를 JSON 으로 바꿀 때 약어가 들어 있는지 확인한다(`ambiguousTokenNeedsChoice` 가 `ORD`·`ODR` 을 찾는다). `TermCandidate` 에 약어 필드가 없으면 `cands.add(...)` 를 `cd.term().engAbbr()` 같은 실제 필드로 바꾼다(`dma/naming/TermCandidate.java` 를 열어 확인한다).

`ErdDictionaryLoader`:

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdDomainSpec;
import com.dongkuk.dmes.mdm.dma.naming.DomainEntry;
import com.dongkuk.dmes.mdm.dma.support.TermDictionaryLoader;
import com.dongkuk.dmes.mdm.repository.*;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** 요청마다 사전을 새로 읽는다(불변 규칙 I26, 계획 P3). 요청 하나 안에서는 이 묶음 하나로 모든 컬럼을 판정한다. */
@Component
public class ErdDictionaryLoader {

    private final MdmTermRepository terms;
    private final MdmColumnRepository columns;
    private final MdmColumnSystemRepository aliases;
    private final MdmDomainRepository domains;

    public ErdDictionaryLoader(MdmTermRepository terms, MdmColumnRepository columns,
                               MdmColumnSystemRepository aliases, MdmDomainRepository domains) {
        this.terms = terms;
        this.columns = columns;
        this.aliases = aliases;
        this.domains = domains;
    }

    @Transactional(readOnly = true)
    public ErdDictionary load() {
        var domainList = domains.findAll();
        Map<Long, ErdDomainSpec> specs = domainList.stream().collect(Collectors.toMap(
                d -> d.getDomainId(), d -> new ErdDomainSpec(d.getDomainId(), d.getDomainName(), d.getDataType(), d.getLength(), d.getScale())));
        List<DomainEntry> entries = domainList.stream()
                .map(d -> new DomainEntry(d.getDomainId(), d.getDomainName(), d.getStdName())).toList();
        Set<String> phys = columns.findAll().stream().map(c -> c.getPhysName()).collect(Collectors.toSet());
        Set<String> alias = aliases.findAll().stream().map(a -> a.getPhysName()).filter(Objects::nonNull).collect(Collectors.toSet());
        return new ErdDictionary(TermDictionaryLoader.load(terms), phys, alias, specs, entries);
    }
}
```

리포지토리 이름(`MdmColumnSystemRepository` 등)이 다르면 `ls src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/repository` 로 확인해 맞춘다.

- [ ] **Step 4: 시험 통과 확인**

Run: Step 2 명령, Task 4·5 시험. Expected: 모두 PASS.

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/backend/mdm/lib
/usr/bin/git commit -m "feat(mdm): ERD 표준 판정기·논리명 자동 채움(요청마다 사전 로드)"
```
