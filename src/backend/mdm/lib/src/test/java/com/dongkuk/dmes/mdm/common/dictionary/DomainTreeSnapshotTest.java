package com.dongkuk.dmes.mdm.common.dictionary;

import static com.dongkuk.dmes.mdm.common.dictionary.DomainFixtures.node;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

/** design.md §4.1 U2 — DFS 순서·깊이, 조상 보존, withDraft 불변성, 순환·깊이 가드. */
class DomainTreeSnapshotTest {

    private final MdmEvaluator ev = DomainFixtures.evaluator();

    private DomainTreeSnapshot sample() {
        // 중량(1) ─ 코일 중량(2) ─ GROSS(4), 포장(3) / 두께(5) ─ 원재료 코일 두께(6)
        return DomainTreeSnapshot.of(List.of(
                node(1).name("중량").build(ev),
                node(2).name("코일 중량").parent(1L).build(ev),
                node(3).name("포장 중량").parent(2L).build(ev),
                node(4).name("GROSS 중량").parent(2L).build(ev),
                node(5).name("두께").build(ev),
                node(6).name("원재료 코일 두께").parent(5L).build(ev)));
    }

    @Test
    void DFS_순서는_형제를_이름순으로_두고_깊이를_매긴다() {
        List<String> order = new ArrayList<>();
        for (DomainTreeSnapshot.Positioned p : sample().dfs()) {
            order.add(p.depth() + ":" + p.node().domainName());
        }
        assertEquals(List.of("0:두께", "1:원재료 코일 두께", "0:중량", "1:코일 중량", "2:GROSS 중량", "2:포장 중량"), order);
    }

    @Test
    void 체인은_최상위부터_자신까지다() {
        List<Long> ids = sample().chainRootFirst(3L).stream().map(DomainNode::domainId).toList();
        assertEquals(List.of(1L, 2L, 3L), ids);
    }

    @Test
    void 하위_도메인은_자신을_빼고_모두_모은다() {
        assertEquals(List.of(2L, 4L, 3L), sample().descendants(1L));
        assertEquals(List.of(), sample().descendants(4L));
    }

    @Test
    void withDraft_는_원본을_바꾸지_않는다() {
        DomainTreeSnapshot base = sample();
        DomainTreeSnapshot draft = base.withDraft(node(3).name("바뀐 이름").parent(1L).stdRule("value > 0").build(ev));
        assertEquals("포장 중량", base.find(3L).orElseThrow().domainName());
        assertEquals(2L, base.find(3L).orElseThrow().parentDomainId());
        assertEquals("바뀐 이름", draft.find(3L).orElseThrow().domainName());
        assertEquals(List.of(1L, 3L), draft.chainRootFirst(3L).stream().map(DomainNode::domainId).toList());
        DomainTreeSnapshot added = base.withDraft(node(DomainTreeSnapshot.DRAFT_ID).parent(6L).build(ev));
        assertEquals(List.of(5L, 6L, DomainTreeSnapshot.DRAFT_ID),
                added.chainRootFirst(DomainTreeSnapshot.DRAFT_ID).stream().map(DomainNode::domainId).toList());
        assertFalse(base.find(DomainTreeSnapshot.DRAFT_ID).isPresent());
    }

    @Test
    @Timeout(value = 5, unit = TimeUnit.SECONDS)
    void 부모가_자기이거나_되돌아오면_순환이다() {
        DomainTreeSnapshot self = DomainTreeSnapshot.of(List.of(node(1).parent(1L).build(ev)));
        assertTrue(self.cyclic(1L));
        assertThrows(DomainTreeSnapshot.CycleException.class, () -> self.chainRootFirst(1L));
        DomainTreeSnapshot loop = DomainTreeSnapshot.of(List.of(node(1).parent(2L).build(ev), node(2).parent(1L).build(ev)));
        assertTrue(loop.cyclic(1L));
        assertThrows(DomainTreeSnapshot.CycleException.class, () -> loop.chainRootFirst(2L));
        assertEquals(List.of(2L), loop.descendants(1L));
        assertEquals(2, loop.dfs().size(), "순환 행도 목록에서 빠지지 않는다");
        assertFalse(sample().cyclic(3L));
    }

    @Test
    @Timeout(value = 5, unit = TimeUnit.SECONDS)
    void 깊이_가드_50을_넘으면_순환으로_본다() {
        List<DomainNode> deep = new ArrayList<>();
        deep.add(node(1).build(ev));
        for (long i = 2; i <= 52; i++) {
            deep.add(node(i).parent(i - 1).build(ev));
        }
        DomainTreeSnapshot s = DomainTreeSnapshot.of(deep);
        assertFalse(s.cyclic(50L));
        assertTrue(s.cyclic(52L));
    }
}
