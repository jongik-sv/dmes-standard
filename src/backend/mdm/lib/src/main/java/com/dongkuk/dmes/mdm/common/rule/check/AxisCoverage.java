package com.dongkuk.dmes.mdm.common.rule.check;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * 축 조합 완전성(06:344, workrule 5절) — UNIQUE 표에서 행 축 × 열 축 조각 수가 NORMAL 행 수보다 많으면 빠진 조합이 있다고 본다. 경고만 한다.
 * 08-03 {@code RuleColumnsService.pivotCoverWarning} 에서 옮겼고(TSK-08-04 design §2.2) COLUMNS 적용과 TABLE 저장({@code AxisCoverageCheck})이 함께 쓴다.
 * 이슈 맵 모양은 호출자가 만든다(COLUMNS 는 08-03 모양 그대로).
 */
public final class AxisCoverage {

    public static final String CODE = "PIVOT_COVER_INCOMPLETE";

    private AxisCoverage() {
    }

    /**
     * @param normalRows NORMAL 행마다 파싱한 셀
     * @return 빠진 조합이 있으면 경고 메시지
     */
    public static Optional<String> gap(String hitPolicy, Integer rowVarId, Integer colVarId, List<Map<Integer, Map<String, Object>>> normalRows) {
        if (!"UNIQUE".equals(hitPolicy) || rowVarId == null || colVarId == null) {
            return Optional.empty();
        }
        Set<String> rowKeys = new HashSet<>();
        Set<String> colKeys = new HashSet<>();
        for (Map<Integer, Map<String, Object>> cells : normalRows) {
            String rk = cellKey(cells.get(rowVarId));
            String ck = cellKey(cells.get(colVarId));
            if (rk != null) {
                rowKeys.add(rk);
            }
            if (ck != null) {
                colKeys.add(ck);
            }
        }
        int normal = normalRows.size();
        if (rowKeys.isEmpty() || colKeys.isEmpty() || rowKeys.size() * colKeys.size() <= normal) {
            return Optional.empty();
        }
        return Optional.of("행 축 " + rowKeys.size() + " × 열 축 " + colKeys.size() + " = " + rowKeys.size() * colKeys.size()
                + " 조각이 행 " + normal + "개보다 많습니다 — 비어 있는 축 조합이 있습니다.");
    }

    private static String cellKey(Map<String, Object> cell) {
        if (cell == null) {
            return null;
        }
        String op = String.valueOf(cell.get("op"));
        String left = cell.get("left") == null ? "" : String.valueOf(cell.get("left"));
        String right = cell.get("right") == null ? "" : String.valueOf(cell.get("right"));
        return op + "|" + left + "|" + right;
    }
}
