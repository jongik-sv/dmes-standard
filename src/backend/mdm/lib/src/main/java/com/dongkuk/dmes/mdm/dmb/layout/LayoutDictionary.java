package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.dictionary.DomainChainAssembler;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeReader;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeSnapshot;
import com.dongkuk.dmes.mdm.common.dictionary.EffectiveDomainView;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;

/**
 * 컬럼 사전 조회 + 도메인 파생(TSK-05-02 design.md §2, F1·F5 — 불변 I4·I5). 컬럼에는 타입·길이 칸이 없으므로 도메인 트리를 한 번
 * 읽어 TSK-04-03 조립기({@link DomainChainAssembler})로 유효 타입·길이·소수·단위를 얻는다 — 상속 규칙을 다시 구현하지 않는다.
 */
@Component
public class LayoutDictionary {

    private final LayoutQueries queries;
    private final DomainTreeReader reader;
    private final DomainChainAssembler assembler;

    public LayoutDictionary(LayoutQueries queries, DomainTreeReader reader, DomainChainAssembler assembler) {
        this.queries = queries;
        this.reader = reader;
        this.assembler = assembler;
    }

    /** 물리명 → 사전 행. 사전에 없는 물리명은 맵에 없다(L01 판정). */
    public Map<String, LayoutColumnInfo> byPhysNames(Collection<String> physNames) {
        return toInfos(queries.columnsByPhys(nonNull(physNames)), reader::load);
    }

    /**
     * 물리명 → 조립한 유효 도메인(TSK-05-03 {@link LayoutConstJudge} — CONST 값 판정). {@link #byPhysNames} 와 같은 조립 경로다. 사전에
     * 없거나 체인이 깨진 물리명은 맵에 없다.
     */
    public Map<String, EffectiveDomainView> views(Collection<String> physNames) {
        return toViews(queries.columnsByPhys(nonNull(physNames)), reader::load);
    }

    /** 물리명·논리명·표시명 부분 일치(대소문자 무시), 최대 100행. */
    public List<LayoutColumnInfo> search(String keyword) {
        return List.copyOf(toInfos(queries.searchColumns(keyword), reader::load).values());
    }

    /**
     * 한 요청 범위의 사전({@link Cache}) — 같은 요청에서 {@link #byPhysNames}·{@link #views} 를 여러 번 부를 때 도메인 트리는 한 번, 컬럼 행은
     * 물리명마다 한 번만 읽는다. 컬럼 사전·도메인을 고치지 않는 요청 안에서만 쓴다(범위가 읽은 뒤 바뀐 값은 보이지 않는다).
     */
    public Cache cache() {
        return new Cache();
    }

    /** {@link #cache()} 참고. 결과는 같은 인자로 부른 {@link #byPhysNames}·{@link #views} 와 같다(물리명 순). */
    public final class Cache {
        private DomainTreeSnapshot snapshot;
        private final Map<String, Object[]> rows = new HashMap<>();
        private final Set<String> read = new HashSet<>();

        private Cache() {
        }

        public Map<String, LayoutColumnInfo> byPhysNames(Collection<String> physNames) {
            return toInfos(rows(physNames), this::snapshot);
        }

        public Map<String, EffectiveDomainView> views(Collection<String> physNames) {
            return toViews(rows(physNames), this::snapshot);
        }

        /** 아직 읽지 않은 물리명만 IN 으로 읽고, 요청한 물리명의 행을 물리명 순({@code ORDER BY c.PHYS_NAME})으로 돌려준다. */
        private List<Object[]> rows(Collection<String> physNames) {
            Set<String> names = nonNull(physNames);
            List<String> unread = names.stream().filter(n -> !read.contains(n)).toList();
            for (List<String> chunk : LayoutQueries.chunks(unread)) {
                for (Object[] r : queries.columnsByPhys(chunk)) {
                    rows.put((String) r[0], r);
                }
            }
            read.addAll(unread);
            List<Object[]> out = new ArrayList<>();
            for (String n : names) {
                Object[] r = rows.get(n);
                if (r != null) {
                    out.add(r);
                }
            }
            out.sort(Comparator.comparing(r -> (String) r[0]));
            return out;
        }

        private DomainTreeSnapshot snapshot() {
            if (snapshot == null) {
                snapshot = reader.load();
            }
            return snapshot;
        }
    }

    private static Set<String> nonNull(Collection<String> physNames) {
        LinkedHashSet<String> names = new LinkedHashSet<>();
        for (String n : physNames) {
            if (n != null) {
                names.add(n);
            }
        }
        return names;
    }

    /** 사전에 없거나 체인이 깨진 물리명은 맵에 없다. 행이 없으면 도메인 트리를 읽지 않는다. */
    private Map<String, EffectiveDomainView> toViews(List<Object[]> rows, Supplier<DomainTreeSnapshot> tree) {
        Map<String, EffectiveDomainView> out = new LinkedHashMap<>();
        if (rows.isEmpty()) {
            return out;
        }
        DomainTreeSnapshot snapshot = tree.get();
        for (Object[] r : rows) {
            EffectiveDomainView view = derive(snapshot, r[3] == null ? null : ((Number) r[3]).longValue());
            if (view != null) {
                out.put((String) r[0], view);
            }
        }
        return out;
    }

    private Map<String, LayoutColumnInfo> toInfos(List<Object[]> rows, Supplier<DomainTreeSnapshot> tree) {
        Map<String, LayoutColumnInfo> out = new LinkedHashMap<>();
        if (rows.isEmpty()) {
            return out;
        }
        DomainTreeSnapshot snapshot = tree.get();
        for (Object[] r : rows) {
            String phys = (String) r[0];
            String name = (String) r[1];
            String label = (String) r[2];
            Long domainId = r[3] == null ? null : ((Number) r[3]).longValue();
            EffectiveDomainView view = derive(snapshot, domainId);
            out.put(phys, new LayoutColumnInfo(phys, name, label, label != null && !label.isBlank() ? label : name, domainId,
                    (String) r[4], view == null ? null : view.dataType(), view == null ? null : view.length(),
                    view == null ? null : view.scale(), view == null ? null : view.unitCode()));
        }
        return out;
    }

    /** 순환·깨진 체인은 파생값 없음(길이 없음 → 저장 시 L07). */
    private EffectiveDomainView derive(DomainTreeSnapshot snapshot, Long domainId) {
        if (domainId == null || snapshot.find(domainId).isEmpty()) {
            return null;
        }
        try {
            return assembler.assemble(snapshot.chainRootFirst(domainId));
        } catch (DomainTreeSnapshot.CycleException | IllegalArgumentException e) {
            return null;
        }
    }
}
