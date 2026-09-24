package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.dictionary.DomainChainAssembler;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeReader;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeSnapshot;
import com.dongkuk.dmes.mdm.common.dictionary.EffectiveDomainView;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
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
        LinkedHashSet<String> names = new LinkedHashSet<>();
        for (String n : physNames) {
            if (n != null) {
                names.add(n);
            }
        }
        return toInfos(queries.columnsByPhys(names));
    }

    /** 물리명·논리명·표시명 부분 일치(대소문자 무시), 최대 100행. */
    public List<LayoutColumnInfo> search(String keyword) {
        return List.copyOf(toInfos(queries.searchColumns(keyword)).values());
    }

    private Map<String, LayoutColumnInfo> toInfos(List<Object[]> rows) {
        Map<String, LayoutColumnInfo> out = new LinkedHashMap<>();
        if (rows.isEmpty()) {
            return out;
        }
        DomainTreeSnapshot snapshot = reader.load();
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
