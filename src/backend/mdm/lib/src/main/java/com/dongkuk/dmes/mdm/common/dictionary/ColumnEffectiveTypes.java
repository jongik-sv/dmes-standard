package com.dongkuk.dmes.mdm.common.dictionary;

import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * {@link ColumnEffectiveType} 을 구할 도메인 스냅샷을 읽는 쪽. 이미 읽은 도메인 행에 빠진 조상만 IN 으로 더 읽는다 — 도메인 전체를 읽지 않는다.
 * 조상이 빠진 스냅샷은 체인이 중간에서 끊겨 최상위 타입이 틀리므로({@link DomainTreeSnapshot#chainRootFirst}) 이 메서드로 닫는다.
 */
@Component
public class ColumnEffectiveTypes {

    private static final int IN_CHUNK = 500;

    private final MdmDomainRepository repository;

    public ColumnEffectiveTypes(MdmDomainRepository repository) {
        this.repository = repository;
    }

    /**
     * {@code loaded}(이미 읽은 도메인)에 조상을 깊이 가드 안에서 더 읽어 붙인 스냅샷. 조상이 모두 있으면 SQL 을 내지 않는다.
     * 단계마다 빠진 부모 id 를 한 번에 읽는다(보통 0~2문).
     */
    public DomainTreeSnapshot snapshotWithAncestors(Collection<MdmDomain> loaded) {
        Map<Long, MdmDomain> byId = new LinkedHashMap<>();
        loaded.forEach(d -> byId.put(d.getDomainId(), d));
        List<MdmDomain> frontier = new ArrayList<>(byId.values());
        for (int depth = 0; depth < DomainTreeSnapshot.MAX_DEPTH && !frontier.isEmpty(); depth++) {
            List<Long> missing = frontier.stream().map(MdmDomain::getParentDomainId)
                    .filter(p -> p != null && !byId.containsKey(p)).distinct().toList();
            if (missing.isEmpty()) {
                break;
            }
            frontier = new ArrayList<>();
            // Oracle IN 1,000 개 제한 — ColumnMngService 와 같이 500 개씩 나눠 읽는다
            for (int from = 0; from < missing.size(); from += IN_CHUNK) {
                for (MdmDomain d : repository.findAllById(missing.subList(from, Math.min(from + IN_CHUNK, missing.size())))) {
                    if (byId.putIfAbsent(d.getDomainId(), d) == null) {
                        frontier.add(d);
                    }
                }
            }
        }
        return DomainTreeSnapshot.of(byId.values().stream().map(DomainNode::from).toList());
    }
}
