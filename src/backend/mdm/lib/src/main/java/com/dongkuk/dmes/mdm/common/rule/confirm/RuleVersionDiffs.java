package com.dongkuk.dmes.mdm.common.rule.confirm;

import com.dongkuk.dmes.mdm.contract.rule.MdmRuleDiffConventions;
import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeSet;

/**
 * 룰 버전 row_id diff(TSK-08-05 design §6.2, I13) — 순수(Spring·DB 없음). 06 「버전 비교」(06:1255-1268)의 FULL OUTER JOIN 을 Java 로 옮겼다
 * (D8 — SQL 문자열 비교는 키 순서만 다른 같은 셀을 CHANGED 로 본다). row_id 마다 항목 하나이고, 한쪽에만 있으면 ADDED(old null)·REMOVED
 * (new null), 양쪽에 있으면 정규화 셀 또는 seq 가 다를 때 CHANGED, 같으면 SAME 이다. 값 맵 키는 {@link MdmRuleDiffConventions#SEQ}(Integer)·
 * {@link MdmRuleDiffConventions#CELLS}(정규화 JSON) 둘뿐이다. 정렬은 {@code COALESCE(new.seq, old.seq)}, row_id 오름차순이다.
 */
public final class RuleVersionDiffs {

    private static final ObjectMapper JSON = new ObjectMapper()
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);

    /** 한 버전의 행 하나 — {@code cellsJson} 은 TB_MDM_RULE_ROW.CELLS 원문. */
    public record Row(int rowId, int seq, String cellsJson) {
    }

    private RuleVersionDiffs() {
    }

    /** @param base 직전 RELEASED 의 행(최초 버전이면 빈 목록) */
    public static List<VersionDiffEntry> diff(List<Row> base, List<Row> target) {
        Map<Integer, Row> olds = byRowId(base);
        Map<Integer, Row> news = byRowId(target);
        TreeSet<Integer> rowIds = new TreeSet<>(olds.keySet());
        rowIds.addAll(news.keySet());

        record Sorted(int seq, int rowId, VersionDiffEntry entry) {
        }
        List<Sorted> out = new ArrayList<>(rowIds.size());
        for (int rowId : rowIds) {
            Row o = olds.get(rowId);
            Row n = news.get(rowId);
            Map<String, Object> oldValues = o == null ? null : values(o);
            Map<String, Object> newValues = n == null ? null : values(n);
            DiffKind kind = o == null ? DiffKind.ADDED
                    : n == null ? DiffKind.REMOVED
                    : o.seq() == n.seq() && Objects.equals(oldValues.get(MdmRuleDiffConventions.CELLS), newValues.get(MdmRuleDiffConventions.CELLS))
                    ? DiffKind.SAME : DiffKind.CHANGED;
            int seq = n != null ? n.seq() : o.seq();
            out.add(new Sorted(seq, rowId, new VersionDiffEntry(String.valueOf(rowId), kind, oldValues, newValues)));
        }
        out.sort(Comparator.comparingInt(Sorted::seq).thenComparingInt(Sorted::rowId));
        return out.stream().map(Sorted::entry).toList();
    }

    /**
     * 객체 키를 재귀로 정렬하고 공백 없이 쓴다. 배열 순서는 보존한다. null 이면 null, JSON 이 아니면 앞뒤 공백만 뺀 원문.
     *
     * <p>TSK-08-04 반려 재작업 D19 — 최상위가 var_id → 셀 객체 모양일 때만 셀의 문자열 {@code ast} 를 객체로 푼다(레거시 RELEASED 와
     * 수정된 DRAFT 가 식이 같아도 CHANGED 로 갈리지 않게). 풀리지 않는 문자열은 그대로 둔다 — diff 는 판정이 아니다.
     */
    public static String canonicalCells(String cellsJson) {
        if (cellsJson == null) {
            return null;
        }
        try {
            Object parsed = JSON.readValue(cellsJson, Object.class);
            decodeStringAsts(parsed);
            return JSON.writeValueAsString(parsed);
        } catch (JsonProcessingException e) {
            return cellsJson.trim();
        }
    }

    @SuppressWarnings("unchecked")
    private static void decodeStringAsts(Object parsed) {
        if (!(parsed instanceof Map<?, ?> top)) {
            return;
        }
        for (Object cellObj : top.values()) {
            if (!(cellObj instanceof Map<?, ?> cell)) {
                continue;
            }
            Object ast = cell.get("ast");
            if (!(ast instanceof String s) || s.isBlank()) {
                continue;
            }
            try {
                Object decoded = JSON.readValue(s, Object.class);
                if (decoded instanceof Map<?, ?>) {
                    ((Map<String, Object>) cell).put("ast", decoded);
                }
            } catch (JsonProcessingException ignored) {
                // 풀리지 않는 문자열은 그대로 둔다 — diff 는 판정이 아니다.
            }
        }
    }

    private static Map<Integer, Row> byRowId(List<Row> rows) {
        Map<Integer, Row> out = new LinkedHashMap<>();
        for (Row r : rows) {
            out.put(r.rowId(), r);
        }
        return out;
    }

    private static Map<String, Object> values(Row r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put(MdmRuleDiffConventions.SEQ, r.seq());
        m.put(MdmRuleDiffConventions.CELLS, canonicalCells(r.cellsJson()));
        return m;
    }
}
