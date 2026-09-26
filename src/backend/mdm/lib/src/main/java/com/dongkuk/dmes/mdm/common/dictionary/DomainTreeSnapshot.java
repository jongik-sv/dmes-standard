package com.dongkuk.dmes.mdm.common.dictionary;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

/**
 * 도메인 트리 메모리 스냅샷(TSK-04-03 design.md §1·§2). 요청 스레드에서 한 번 읽어 만들고, 그 위에서 조립·검사를
 * 순수 계산으로 한다(불변 I11). 원본은 바꾸지 않는다 — {@link #withDraft} 는 새 스냅샷을 돌려준다.
 *
 * <p>형제 순서는 {@code DOMAIN_NAME}, 같으면 {@code DOMAIN_ID}. 체인은 깊이 가드 {@link #MAX_DEPTH} 를 넘거나 되돌아오면
 * 순환이다(R07).
 */
public final class DomainTreeSnapshot {

    /** 체인 깊이 가드 — 재귀 CTE 와 같은 값. */
    public static final int MAX_DEPTH = 50;

    /** 아직 저장되지 않은 신규 초안의 임시 id. */
    public static final long DRAFT_ID = -1L;

    private static final Comparator<DomainNode> SIBLING_ORDER = Comparator
            .comparing(DomainNode::domainName, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(DomainNode::domainId, Comparator.nullsLast(Comparator.naturalOrder()));

    private final Map<Long, DomainNode> nodes;
    private final Map<Long, List<DomainNode>> children;

    private DomainTreeSnapshot(Map<Long, DomainNode> nodes) {
        this.nodes = nodes;
        Map<Long, List<DomainNode>> idx = new LinkedHashMap<>();
        for (DomainNode n : nodes.values()) {
            if (n.parentDomainId() != null) {
                idx.computeIfAbsent(n.parentDomainId(), k -> new ArrayList<>()).add(n);
            }
        }
        idx.values().forEach(l -> l.sort(SIBLING_ORDER));
        this.children = idx;
    }

    public static DomainTreeSnapshot of(Collection<DomainNode> rows) {
        Map<Long, DomainNode> m = new LinkedHashMap<>();
        rows.forEach(r -> m.put(Objects.requireNonNull(r.domainId(), "domainId"), r));
        return new DomainTreeSnapshot(m);
    }

    public Optional<DomainNode> find(Long id) {
        return id == null ? Optional.empty() : Optional.ofNullable(nodes.get(id));
    }

    public Collection<DomainNode> nodes() {
        return nodes.values();
    }

    public List<DomainNode> children(Long id) {
        return children.getOrDefault(id, List.of());
    }

    /** 한 노드를 대체하거나 더한 새 스냅샷. 원본은 그대로다. */
    public DomainTreeSnapshot withDraft(DomainNode draft) {
        Map<Long, DomainNode> m = new LinkedHashMap<>(nodes);
        m.put(Objects.requireNonNull(draft.domainId(), "domainId"), draft);
        return new DomainTreeSnapshot(m);
    }

    /**
     * 최상위 조상부터 자신까지. 부모 id 가 스냅샷에 없으면 거기서 끝난다.
     *
     * @throws CycleException 되돌아오거나 깊이 가드를 넘을 때
     * @throws IllegalArgumentException id 가 없을 때
     */
    public List<DomainNode> chainRootFirst(Long id) {
        DomainNode cur = find(id).orElseThrow(() -> new IllegalArgumentException("도메인이 없다: " + id));
        Deque<DomainNode> chain = new ArrayDeque<>();
        Set<Long> seen = new HashSet<>();
        while (cur != null) {
            if (!seen.add(cur.domainId()) || chain.size() > MAX_DEPTH) {
                throw new CycleException(id);
            }
            chain.addFirst(cur);
            cur = cur.parentDomainId() == null ? null : nodes.get(cur.parentDomainId());
        }
        return List.copyOf(chain);
    }

    public boolean cyclic(Long id) {
        try {
            chainRootFirst(id);
            return false;
        } catch (CycleException e) {
            return true;
        }
    }

    /** 자신을 뺀 하위 도메인 id — DFS 순서(형제 이름순). 순환 데이터에서도 끝난다. */
    public List<Long> descendants(Long id) {
        List<Long> out = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        seen.add(id);
        collect(id, out, seen);
        return out;
    }

    private void collect(Long id, List<Long> out, Set<Long> seen) {
        for (DomainNode c : children(id)) {
            if (seen.add(c.domainId())) {
                out.add(c.domainId());
                collect(c.domainId(), out, seen);
            }
        }
    }

    /** 전체 트리 DFS — 최상위(부모 없음·부모가 스냅샷에 없음)부터. 순환이라 최상위에서 닿지 않는 행은 끝에 깊이 0 으로 붙인다. */
    public List<Positioned> dfs() {
        List<Positioned> out = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        nodes.values().stream()
                .filter(n -> n.parentDomainId() == null || !nodes.containsKey(n.parentDomainId()))
                .sorted(SIBLING_ORDER)
                .forEach(root -> walk(root, 0, out, seen));
        nodes.values().stream().filter(n -> !seen.contains(n.domainId())).sorted(SIBLING_ORDER)
                .forEach(n -> walk(n, 0, out, seen));
        return out;
    }

    private void walk(DomainNode n, int depth, List<Positioned> out, Set<Long> seen) {
        if (!seen.add(n.domainId())) {
            return;
        }
        out.add(new Positioned(n, depth));
        for (DomainNode c : children(n.domainId())) {
            walk(c, depth + 1, out, seen);
        }
    }

    public record Positioned(DomainNode node, int depth) {}

    /** 상속 순환(R07). */
    public static final class CycleException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        public CycleException(Long id) {
            super("상속이 순환한다: " + id);
        }
    }
}
