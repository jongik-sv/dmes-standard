package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemValues;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 요청 행(ADDED·CHANGED·DELETED)을 버전 V 모습에 메모리로 적용한다(TSK-06-03 design.md §6.4) — 순수 규칙.
 * {@code validate} 와 {@code save} 가 같은 코드를 써서, 저장은 쓰기 전에 검사를 끝낸다(불변 규칙 22).
 *
 * <p>적용 순서는 요청 순서와 무관하게 DELETED → CHANGED → ADDED 다(P4). 빈 문자열은 null 로 보고, 코드는 트림하지 않는다
 * (앞뒤 공백은 저장 검사가 {@code CODE_FORBIDDEN_CHAR} 로 거부한다, 불변 규칙 26).
 */
public final class MasterCodeItemProjection {

    public enum RowStatus { ADDED, CHANGED, DELETED }

    /** 적용할 변경 하나. DELETED 면 values 가 null 이다. */
    public record Change(RowStatus status, String code, MasterCodeItemValues values) {
    }

    /** viewAfter = 적용 후 모습, touched = ADDED·CHANGED 코드, changes = 적용 순서의 변경 목록. */
    public record Result(List<MasterCodeItemEntry> viewAfter, Set<String> touched, List<MdmCheckIssue> issues,
                         List<Change> changes) {
    }

    private MasterCodeItemProjection() {
    }

    public static Result apply(List<MasterCodeItemEntry> viewAtV, List<Map<String, Object>> rows) {
        List<Change> deleted = new ArrayList<>();
        List<Change> changed = new ArrayList<>();
        List<Change> added = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            RowStatus status = status(row.get("rowStatus"));
            String code = row.get("code") == null ? null : row.get("code").toString();
            switch (status) {
                case DELETED -> deleted.add(new Change(status, code, null));
                case CHANGED -> changed.add(new Change(status, code, values(row)));
                case ADDED -> added.add(new Change(status, code, values(row)));
            }
        }

        List<MasterCodeItemEntry> view = new ArrayList<>(viewAtV);
        List<MdmCheckIssue> issues = new ArrayList<>();
        Set<String> touched = new HashSet<>();
        List<Change> ordered = new ArrayList<>();
        for (Change c : deleted) {
            int at = indexOf(view, c.code());
            if (at < 0) {
                issues.add(notFound(c.code()));
            } else {
                view.remove(at);
            }
            ordered.add(c);
        }
        for (Change c : changed) {
            int at = indexOf(view, c.code());
            if (at < 0) {
                issues.add(notFound(c.code()));
            } else {
                view.set(at, new MasterCodeItemEntry(c.code(), c.values()));
                touched.add(c.code());
            }
            ordered.add(c);
        }
        for (Change c : added) {
            if (indexOf(view, c.code()) >= 0) {
                issues.add(MasterCodeItemChecks.issue(MasterCodeItemIssueCode.SEGMENT_OVERLAP, c.code(), "code",
                        "이 버전에 이미 있는 코드다"));
            } else {
                view.add(new MasterCodeItemEntry(c.code(), c.values()));
                touched.add(c.code());
            }
            ordered.add(c);
        }
        return new Result(List.copyOf(view), touched, List.copyOf(issues), List.copyOf(ordered));
    }

    /** 요청 행 → 선분 밖 값(빈 문자열은 null, lvls 5칸·attrs 10칸). */
    public static MasterCodeItemValues values(Map<String, Object> row) {
        List<String> lvls = new ArrayList<>(MasterCodeConventions.LVL_SLOTS);
        for (int i = 1; i <= MasterCodeConventions.LVL_SLOTS; i++) {
            lvls.add(text(row.get("lvl" + i)));
        }
        List<String> attrs = new ArrayList<>(MasterCodeConventions.ATTR_SLOTS);
        for (int i = 1; i <= MasterCodeConventions.ATTR_SLOTS; i++) {
            attrs.add(text(row.get(String.format("attr%02d", i))));
        }
        return new MasterCodeItemValues(text(row.get("name")), text(row.get("alterName")), seq(row.get("seq")),
                text(row.get("description")), lvls, attrs);
    }

    private static RowStatus status(Object raw) {
        if (raw != null) {
            for (RowStatus s : RowStatus.values()) {
                if (s.name().equals(raw.toString())) {
                    return s;
                }
            }
        }
        throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "rowStatus 는 ADDED·CHANGED·DELETED 중 하나다: " + raw, List.of());
    }

    private static String text(Object raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.toString();
        return s.isEmpty() ? null : s;
    }

    private static Integer seq(Object raw) {
        if (raw == null || raw.toString().isBlank()) {
            return null;
        }
        if (raw instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.valueOf(raw.toString().trim());
        } catch (NumberFormatException e) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "순서는 정수다: " + raw, List.of());
        }
    }

    private static int indexOf(List<MasterCodeItemEntry> view, String code) {
        for (int i = 0; i < view.size(); i++) {
            if (Objects.equals(view.get(i).code(), code)) {
                return i;
            }
        }
        return -1;
    }

    private static MdmCheckIssue notFound(String code) {
        return MasterCodeItemChecks.issue(MasterCodeItemIssueCode.CODE_NOT_FOUND, code, "code", "이 버전에 없는 코드다");
    }
}
