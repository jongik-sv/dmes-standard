package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCategoryResolver.ResolvedRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCateRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeVersionView;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * 직전 RELEASED 대비 카테고리 해석 결과 요약(TSK-06-05 design.md §6.4) — 순수 규칙(Spring·DB 없음). base·target 각각을
 * {@link MasterCodeCategoryResolver#resolve} 로 해석한 적중 코드 집합의 차이다(판정을 재구현하지 않는다, I16). 빠진 코드가
 * 있거나 V 에서 닫힌 카테고리면 줄어듦이다.
 */
public final class MasterCodeCategoryChanges {

    public static final String NEW = "NEW";
    public static final String CLOSED = "CLOSED";
    public static final String CHANGED = "CHANGED";

    /** 카테고리 하나의 변화. 없는 쪽의 건수는 null, 코드 목록은 코드 오름차순. */
    public record Change(String cateId, String cateName, String kind, Integer beforeCount, Integer afterCount,
                         List<String> addedCodes, List<String> removedCodes, boolean reduced) {
    }

    /** changed 는 cate_id 오름차순, unchanged 는 적중 집합이 그대로인 카테고리 이름. */
    public record Summary(List<Change> changed, List<String> unchanged) {
    }

    private MasterCodeCategoryChanges() {
    }

    /** base 가 null 이면 최초 버전이라 모든 카테고리가 NEW 다. */
    public static Summary summarize(MasterCodeVersionView base, MasterCodeVersionView target) {
        Map<String, MasterCodeCateRow> before = base == null ? Map.of() : byId(base);
        Map<String, MasterCodeCateRow> after = byId(target);
        TreeSet<String> ids = new TreeSet<>(before.keySet());
        ids.addAll(after.keySet());

        List<Change> changed = new ArrayList<>();
        List<String> unchanged = new ArrayList<>();
        for (String id : ids) {
            MasterCodeCateRow b = before.get(id);
            MasterCodeCateRow a = after.get(id);
            TreeSet<String> beforeHits = b == null ? null : hits(base, b);
            TreeSet<String> afterHits = a == null ? null : hits(target, a);
            if (beforeHits != null && afterHits != null && beforeHits.equals(afterHits)) {
                unchanged.add(a.definition().cateName());
                continue;
            }
            TreeSet<String> added = new TreeSet<>(afterHits == null ? List.of() : afterHits);
            TreeSet<String> removed = new TreeSet<>(beforeHits == null ? List.of() : beforeHits);
            if (beforeHits != null) {
                added.removeAll(beforeHits);
            }
            if (afterHits != null) {
                removed.removeAll(afterHits);
            }
            String kind = b == null ? NEW : a == null ? CLOSED : CHANGED;
            String name = (a == null ? b : a).definition().cateName();
            changed.add(new Change(id, name, kind, beforeHits == null ? null : beforeHits.size(),
                    afterHits == null ? null : afterHits.size(), List.copyOf(added), List.copyOf(removed),
                    !removed.isEmpty() || CLOSED.equals(kind)));
        }
        return new Summary(List.copyOf(changed), List.copyOf(unchanged));
    }

    private static Map<String, MasterCodeCateRow> byId(MasterCodeVersionView view) {
        Map<String, MasterCodeCateRow> out = new LinkedHashMap<>();
        for (MasterCodeCateRow row : view.categories()) {
            out.put(row.definition().cateId(), row);
        }
        return out;
    }

    private static TreeSet<String> hits(MasterCodeVersionView view, MasterCodeCateRow cate) {
        TreeSet<String> out = new TreeSet<>();
        for (ResolvedRow row : MasterCodeCategoryResolver.resolve(view.items(), cate, view.cateItems()).rows()) {
            if (row.hit()) {
                out.add(row.code());
            }
        }
        return out;
    }
}
