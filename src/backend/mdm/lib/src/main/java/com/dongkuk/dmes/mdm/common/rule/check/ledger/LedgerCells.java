package com.dongkuk.dmes.mdm.common.rule.check.ledger;

import static com.dongkuk.dmes.mdm.common.support.MdmStrings.str;

import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.RuleAnalysisInputMapper.StoredRow;
import com.dongkuk.dmes.mdm.common.rule.RuleCellsCodec;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckInput.DraftRow;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveContext;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 원장 검사 빈이 함께 쓰는 셀 순회 도우미. */
final class LedgerCells {

    record Cell(StoredRow row, ResolvedVar var, Map<String, Object> cell) {
        String op() {
            return str(cell.get("op"));
        }
    }

    private static final Set<String> SINGLE_VALUE_OPS = Set.of("EQ", "NE", "LT", "LE", "GT", "GE");
    private static final Set<String> RANGE_OPS = Set.of("<= 변수 <=", "<= 변수 <", "< 변수 <=", "< 변수 <");

    private LedgerCells() {
    }

    /** 변수가 있는 셀 전부(행 순서·셀 순서). */
    static List<Cell> cells(RuleSaveContext ctx) {
        Map<Integer, ResolvedVar> byId = new LinkedHashMap<>();
        ctx.vars().forEach(v -> byId.put(v.varId(), v));
        List<Cell> out = new ArrayList<>();
        for (StoredRow row : ctx.rows()) {
            RuleCellsCodec.parse(row.cells()).forEach((varId, cell) -> {
                ResolvedVar var = byId.get(varId);
                if (var != null) {
                    out.add(new Cell(row, var, cell));
                }
            });
        }
        return out;
    }

    static List<Map<Integer, Map<String, Object>>> rowCells(List<StoredRow> rows) {
        return rows.stream().map(r -> RuleCellsCodec.parse(r.cells())).toList();
    }

    static List<DraftRow> draftRows(List<StoredRow> rows) {
        return rows.stream().map(r -> new DraftRow(r.rowId(), r.seq(), r.rowKind(), RuleCellsCodec.parse(r.cells()))).toList();
    }

    /** op-code 조건 셀의 변수 값 리터럴(대소 비교·구간 경계·목록). CONTAINS·INSTR·CODE_IN 값은 변수 값이 아니라 넣지 않는다. */
    static List<String> conditionValues(Map<String, Object> cell) {
        String op = str(cell.get("op"));
        List<String> out = new ArrayList<>();
        if (SINGLE_VALUE_OPS.contains(op)) {
            addIfPresent(out, cell.get("left"));
        } else if (RANGE_OPS.contains(op)) {
            addIfPresent(out, cell.get("left"));
            addIfPresent(out, cell.get("right"));
        } else if (("IN".equals(op) || "NOT_IN".equals(op)) && cell.get("list") instanceof List<?> list) {
            list.forEach(v -> addIfPresent(out, v));
        }
        return out;
    }

    private static void addIfPresent(List<String> out, Object value) {
        String s = str(value);
        if (s != null && !s.isBlank()) {
            out.add(s);
        }
    }
}
