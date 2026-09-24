package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 요청 {@code members} 그리드 행(ADDED·DELETED 만 — 멤버는 값이 없는 존재 여부뿐이라 CHANGED 가 없다)을 구조로만 판다
 * (TSK-06-04 design.md §1.4·§2) — 순수 규칙. 대상 카테고리의 존재·defKind=TABLE·코드 유효성은 문맥(V 모습)이 필요해
 * 서비스({@code CodeCateEditService.project}) 가 본다.
 */
public final class MasterCodeCateMemberProjection {

    public enum RowStatus { ADDED, DELETED }

    /** 그리드 행 하나 — cateId·code 는 이 소속의 복합키. */
    public record Change(RowStatus status, String cateId, String code) {
    }

    private MasterCodeCateMemberProjection() {
    }

    /** 요청 순서 그대로 파싱한다(적용 순서 DELETED → ADDED 는 호출자가 정렬한다). */
    public static List<Change> parse(List<Map<String, Object>> rows) {
        List<Change> out = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            RowStatus status = status(row.get("rowStatus"));
            String cateId = text(row.get("cateId"));
            String code = text(row.get("code"));
            out.add(new Change(status, cateId, code));
        }
        return List.copyOf(out);
    }

    private static RowStatus status(Object raw) {
        if (raw != null) {
            for (RowStatus s : RowStatus.values()) {
                if (s.name().equals(raw.toString())) {
                    return s;
                }
            }
        }
        throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "rowStatus 는 ADDED·DELETED 중 하나다: " + raw, List.of());
    }

    private static String text(Object raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.toString();
        return s.isEmpty() ? null : s;
    }
}
