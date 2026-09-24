package com.dongkuk.dmes.mdm.common.segment;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 검사 5-1 의 계층 대조용 메모리 색인 — 05 「계층」 저장 검사: 같은 문자열이 그룹 값으로든 항목 키로든 이미 있으면 그 행의
 * 앞 칸이 내 앞 칸과 같아야 한다. 닫힌 항목도 비교 대상이다(다시 열 수 있기 때문).
 *
 * <p>키별 마지막 행(닫힌 키 포함)으로 만든다. 일괄 upsert 는 행을 통과시킬 때마다 {@link #put} 으로 갱신해 한 파일 안의
 * 행끼리도 대조한다(행마다 다시 조회하지 않는다 — 3,000행 E3).
 */
public final class HierarchyIndex {

    /** 그룹 값 → (그 값 앞의 칸 목록 → 그렇게 쓰는 키들). */
    private final Map<String, Map<List<String>, Set<String>>> groups = new HashMap<>();
    /** 키 → 그 항목 행의 계층 칸 목록(부모까지). */
    private final Map<String, List<String>> chains = new HashMap<>();

    public static HierarchyIndex of(Collection<ItemSegmentRow> latestRows) {
        HierarchyIndex index = new HierarchyIndex();
        for (ItemSegmentRow row : latestRows) {
            index.put(row.key().code(), row.value().lvlChain());
        }
        return index;
    }

    /** 키의 계층을 (다시) 등록한다. 옛 기여는 지운다. */
    public void put(String code, List<String> chain) {
        remove(code);
        List<String> copy = List.copyOf(chain);
        chains.put(code, copy);
        for (int i = 0; i < copy.size(); i++) {
            groups.computeIfAbsent(copy.get(i), k -> new HashMap<>())
                    .computeIfAbsent(copy.subList(0, i), k -> new HashSet<>())
                    .add(code);
        }
    }

    private void remove(String code) {
        List<String> old = chains.remove(code);
        if (old == null) {
            return;
        }
        for (int i = 0; i < old.size(); i++) {
            Map<List<String>, Set<String>> byPrefix = groups.get(old.get(i));
            if (byPrefix == null) {
                continue;
            }
            Set<String> codes = byPrefix.get(old.subList(0, i));
            if (codes != null) {
                codes.remove(code);
                if (codes.isEmpty()) {
                    byPrefix.remove(old.subList(0, i));
                }
            }
            if (byPrefix.isEmpty()) {
                groups.remove(old.get(i));
            }
        }
    }

    /**
     * 키 {@code code} 가 계층 {@code chain} 을 가질 때 다른 키와 앞 칸이 어긋나는 값들. 비어 있으면 통과다.
     * <ol>
     *   <li>내 그룹 값이 다른 키의 행에서 다른 앞 칸 아래 그룹으로 쓰인다.</li>
     *   <li>내 그룹 값이 다른 항목의 키인데 그 항목의 계층(부모까지)이 내 앞 칸과 다르다(항목이자 그룹인 노드).</li>
     *   <li>내 키가 다른 키의 행에서 그룹으로 쓰이는데 그 앞 칸이 내 계층과 다르다.</li>
     * </ol>
     */
    public List<String> conflicts(String code, List<String> chain) {
        Set<String> out = new LinkedHashSet<>();
        for (int i = 0; i < chain.size(); i++) {
            String group = chain.get(i);
            List<String> prefix = chain.subList(0, i);
            if (usedElsewhereUnder(group, prefix, code)) {
                out.add(group);
            }
            List<String> itemChain = chains.get(group);
            if (itemChain != null && !group.equals(code) && !itemChain.equals(prefix)) {
                out.add(group);
            }
        }
        if (usedElsewhereUnder(code, chain, code)) {
            out.add(code);
        }
        return new ArrayList<>(out);
    }

    /** {@code group} 이 {@code self} 아닌 키의 행에서 {@code prefix} 와 다른 앞 칸 아래 쓰였는가. */
    private boolean usedElsewhereUnder(String group, List<String> prefix, String self) {
        Map<List<String>, Set<String>> byPrefix = groups.get(group);
        if (byPrefix == null) {
            return false;
        }
        for (Map.Entry<List<String>, Set<String>> e : byPrefix.entrySet()) {
            if (!e.getKey().equals(prefix) && e.getValue().stream().anyMatch(c -> !c.equals(self))) {
                return true;
            }
        }
        return false;
    }
}
