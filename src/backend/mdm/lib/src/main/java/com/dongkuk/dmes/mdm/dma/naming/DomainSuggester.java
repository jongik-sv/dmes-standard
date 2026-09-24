package com.dongkuk.dmes.mdm.dma.naming;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * 도메인 추천(TSK-04-04 design.md §6.7, 불변 규칙 I9, D4) — 물리명 {@code _} 조각의 <b>꼬리</b>와 표준명 조각이
 * 원소별로 같은 도메인을 긴 순서로 고른다. {@code ***} 조각은 어떤 표준명 조각과도 같지 않다.
 */
public final class DomainSuggester {

    private static final Comparator<DomainMatch> ORDER = Comparator
            .comparingInt(DomainMatch::matchLength).reversed()
            .thenComparing(m -> m.domain().domainId(), Comparator.nullsLast(Comparator.naturalOrder()));

    private DomainSuggester() {
    }

    public static List<DomainMatch> suggest(String physName, List<DomainEntry> domains) {
        List<String> colTokens = NamingRules.physTokens(physName);
        List<DomainMatch> matches = new ArrayList<>();
        if (domains == null) {
            return matches;
        }
        for (DomainEntry domain : domains) {
            List<String> dTokens = NamingRules.physTokens(domain.stdName());
            if (dTokens.isEmpty() || dTokens.size() > colTokens.size()) {
                continue;
            }
            int offset = colTokens.size() - dTokens.size();
            boolean same = true;
            for (int k = 0; k < dTokens.size() && same; k++) {
                String col = colTokens.get(offset + k);
                same = !NamingRules.PLACEHOLDER.equals(col) && col.equals(dTokens.get(k));
            }
            if (same) {
                matches.add(new DomainMatch(domain, dTokens.size()));
            }
        }
        matches.sort(ORDER);
        return matches;
    }

    /** 추천 = 정렬 첫째, 없으면 null. */
    public static DomainEntry recommended(List<DomainMatch> matches) {
        return matches == null || matches.isEmpty() ? null : matches.get(0).domain();
    }
}
