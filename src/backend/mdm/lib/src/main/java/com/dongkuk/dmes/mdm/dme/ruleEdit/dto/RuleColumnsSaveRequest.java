package com.dongkuk.dmes.mdm.dme.ruleEdit.dto;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * TSK-08-03 열 설정(part COLUMNS) 요청 한 줄 — 표 배열은 {@code grids.rows} B4 로 바인딩되므로 {@link RuleEditSaveRequest#getRows()}
 * 의 Map 을 이 레코드로 파싱해 쓴다. 신규 열은 varId 가 음수(화면 초안 임시 ID) 또는 null 이다.
 *
 * <p>줄 칸: varId·varKind·dispType·varName·label·domainId·dataType·axis·resGrp·grpCond·collectAgg·prioList·description·deleted.
 * DERIVE 결과 식은 {@code expr}(선택)로 받아 그 열의 결과 셀({@code expr}·{@code ast})에 반영한다 — 식 편집이 열 설정 몫이라는
 * 08-02 안내의 실행 수단.
 */
public record RuleColumnsSaveRequest(Integer varId, String varKind, String dispType, String varName, String label,
        Long domainId, String dataType, String axis, String resGrp, String grpCond, String collectAgg,
        List<String> prioList, String description, Boolean deleted, String expr) {

    public static RuleColumnsSaveRequest of(Map<String, Object> m) {
        return new RuleColumnsSaveRequest(
                intOrNull(m.get("varId")),
                str(m.get("varKind")),
                str(m.get("dispType")),
                str(m.get("varName")),
                str(m.get("label")),
                longOrNull(m.get("domainId")),
                str(m.get("dataType")),
                str(m.get("axis")),
                str(m.get("resGrp")),
                str(m.get("grpCond")),
                str(m.get("collectAgg")),
                strings(m.get("prioList")),
                str(m.get("description")),
                Boolean.TRUE.equals(m.get("deleted")),
                str(m.get("expr")));
    }

    /** 신규 열(임시 ID) 여부. */
    public boolean isNew() {
        return varId == null || varId < 0;
    }

    /** 삭제 표시 줄 — record 컴포넌트 accessor(Boolean)와 이름이 겹쳐 isDeleted 로 노출한다. */
    public boolean isDeleted() {
        return Boolean.TRUE.equals(deleted);
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static Integer intOrNull(Object v) {
        return v instanceof Number n ? n.intValue() : null;
    }

    private static Long longOrNull(Object v) {
        return v instanceof Number n ? n.longValue() : null;
    }

    private static List<String> strings(Object v) {
        if (!(v instanceof List<?> list)) {
            return null;
        }
        List<String> out = new ArrayList<>();
        for (Object o : list) {
            if (o != null && !String.valueOf(o).isBlank()) {
                out.add(String.valueOf(o).trim());
            }
        }
        return out;
    }
}
