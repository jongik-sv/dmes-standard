package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.dictionary.ColumnEffectiveType;
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
import java.util.function.Function;
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
        return toInfos(columnsByPhys(physNames), reader::load, this::baseTypes);
    }

    /**
     * 물리명 목록을 {@link LayoutQueries#chunks} 묶음으로 나눠 읽고 물리명 순으로 합친다. Oracle 은 IN 목록이 1,000개를 넘으면
     * ORA-01795 로 실패한다(영향 찾기가 도메인 하위 트리의 물리명을 통째로 넘길 수 있다).
     */
    private List<Object[]> columnsByPhys(Collection<String> physNames) {
        List<Object[]> out = new ArrayList<>();
        for (List<String> chunk : LayoutQueries.chunks(nonNull(physNames))) {
            out.addAll(queries.columnsByPhys(chunk));
        }
        out.sort(Comparator.comparing(r -> (String) r[0]));
        return out;
    }

    /**
     * 물리명 → 조립한 유효 도메인(TSK-05-03 {@link LayoutConstJudge} — CONST 값 판정). {@link #byPhysNames} 와 같은 조립 경로다. 사전에
     * 없는 물리명은 맵에 없다. 도메인이 없거나 체인이 깨졌어도 컬럼 기본 타입이 있으면 기본 타입만 가진 뷰가 있다.
     */
    public Map<String, EffectiveDomainView> views(Collection<String> physNames) {
        return toViews(columnsByPhys(physNames), reader::load, this::baseTypes);
    }

    /** 물리명·논리명·표시명 부분 일치(대소문자 무시), 최대 100행. */
    public List<LayoutColumnInfo> search(String keyword) {
        return List.copyOf(toInfos(queries.searchColumns(keyword), reader::load, this::baseTypes).values());
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
        private final Map<String, Object[]> baseRows = new HashMap<>();
        private final Set<String> baseRead = new HashSet<>();

        private Cache() {
        }

        public Map<String, LayoutColumnInfo> byPhysNames(Collection<String> physNames) {
            return toInfos(rows(physNames), this::snapshot, this::bases);
        }

        /** 기본 타입은 물리명마다 한 번만 읽는다(기본 타입 없는 컬럼은 읽은 표시만 남는다). */
        private Map<String, Object[]> bases(Collection<String> names) {
            List<String> unread = names.stream().filter(n -> !baseRead.contains(n)).toList();
            if (!unread.isEmpty()) {
                baseRows.putAll(baseTypes(unread));
                baseRead.addAll(unread);
            }
            Map<String, Object[]> out = new HashMap<>();
            for (String n : names) {
                Object[] b = baseRows.get(n);
                if (b != null) {
                    out.put(n, b);
                }
            }
            return out;
        }

        public Map<String, EffectiveDomainView> views(Collection<String> physNames) {
            return toViews(rows(physNames), this::snapshot, this::bases);
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

    /** 사전에 없는 물리명은 맵에 없다. 도메인 타입이 없는 컬럼은 기본 타입이 있으면 그 타입·길이·소수만 가진 뷰를 둔다. 행이 없으면 도메인 트리를 읽지 않는다. */
    private Map<String, EffectiveDomainView> toViews(List<Object[]> rows, Supplier<DomainTreeSnapshot> tree,
                                                     Function<Collection<String>, Map<String, Object[]>> baseLoader) {
        Map<String, EffectiveDomainView> out = new LinkedHashMap<>();
        if (rows.isEmpty()) {
            return out;
        }
        DomainTreeSnapshot snapshot = tree.get();
        Map<String, EffectiveDomainView> views = new HashMap<>();
        List<String> needBase = new ArrayList<>();
        for (Object[] r : rows) {
            String phys = (String) r[0];
            EffectiveDomainView view = derive(snapshot, r[3] == null ? null : ((Number) r[3]).longValue());
            if (view != null) {
                views.put(phys, view);
            }
            if (view == null || view.dataType() == null || view.dataType().isBlank()) {
                needBase.add(phys);
            }
        }
        Map<String, Object[]> bases = needBase.isEmpty() ? Map.of() : baseLoader.apply(needBase);
        for (Object[] r : rows) {
            String phys = (String) r[0];
            EffectiveDomainView view = views.get(phys);
            boolean typed = view != null && view.dataType() != null && !view.dataType().isBlank();
            Object[] b = typed ? null : bases.get(phys);
            ColumnEffectiveType base = b == null ? ColumnEffectiveType.NONE
                    : ColumnEffectiveType.ofBase((String) b[1], intOrNull(b[2]), intOrNull(b[3]));
            if (!typed && base.source() == ColumnEffectiveType.Source.BASE) {
                view = view == null
                        ? new EffectiveDomainView(null, null, base.dataType(), base.length(), base.scale(), null, null, null, null, null,
                                null, null, List.of())
                        : new EffectiveDomainView(view.domainId(), view.domainKind(), base.dataType(), base.length(), base.scale(),
                                view.unitCode(), view.codeRef(), view.chainStdExpr(), view.stdExpr(), view.stdAst(), view.bizExpr(),
                                view.bizAst(), view.bizRequiredVars());
            }
            if (view != null) {
                out.put(phys, view);
            }
        }
        return out;
    }

    private Map<String, LayoutColumnInfo> toInfos(List<Object[]> rows, Supplier<DomainTreeSnapshot> tree,
                                                  Function<Collection<String>, Map<String, Object[]>> baseLoader) {
        Map<String, LayoutColumnInfo> out = new LinkedHashMap<>();
        if (rows.isEmpty()) {
            return out;
        }
        DomainTreeSnapshot snapshot = tree.get();
        Map<String, EffectiveDomainView> views = new HashMap<>();
        List<String> needBase = new ArrayList<>();
        for (Object[] r : rows) {
            String phys = (String) r[0];
            EffectiveDomainView view = derive(snapshot, r[3] == null ? null : ((Number) r[3]).longValue());
            if (view != null) {
                views.put(phys, view);
            }
            if (view == null || view.dataType() == null || view.dataType().isBlank()) {
                needBase.add(phys); // 도메인이 없거나 체인이 깨진 컬럼 — 컬럼 기본 타입으로 대체(ColumnEffectiveType 규칙)
            }
        }
        Map<String, Object[]> bases = needBase.isEmpty() ? Map.of() : baseLoader.apply(needBase);
        for (Object[] r : rows) {
            String phys = (String) r[0];
            String name = (String) r[1];
            String label = (String) r[2];
            Long domainId = r[3] == null ? null : ((Number) r[3]).longValue();
            EffectiveDomainView view = views.get(phys);
            String displayName = label != null && !label.isBlank() ? label : name;
            Object[] b = bases.get(phys);
            ColumnEffectiveType base = b == null ? ColumnEffectiveType.NONE
                    : ColumnEffectiveType.ofBase((String) b[1], intOrNull(b[2]), intOrNull(b[3]));
            if (view != null && (view.dataType() != null && !view.dataType().isBlank() || base.source() == ColumnEffectiveType.Source.NONE)) {
                out.put(phys, new LayoutColumnInfo(phys, name, label, displayName, domainId, (String) r[4], view.dataType(), view.length(),
                        view.scale(), view.unitCode()));
            } else if (base.source() == ColumnEffectiveType.Source.BASE) {
                // 기본 타입은 단위가 없다. 깨진 체인이어도 도메인 이름·단위는 있던 대로 둔다.
                out.put(phys, new LayoutColumnInfo(phys, name, label, displayName, domainId, (String) r[4], base.dataType(),
                        base.length(), base.scale(), view == null ? null : view.unitCode()));
            } else {
                out.put(phys, new LayoutColumnInfo(phys, name, label, displayName, domainId, (String) r[4], null, null, null, null));
            }
        }
        return out;
    }

    private Map<String, Object[]> baseTypes(Collection<String> physNames) {
        Map<String, Object[]> out = new HashMap<>();
        for (Object[] r : queries.baseTypesByPhys(physNames)) {
            out.put((String) r[0], r);
        }
        return out;
    }

    private static Integer intOrNull(Object o) {
        return o == null ? null : ((Number) o).intValue();
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
