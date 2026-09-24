package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefinition;
import com.dongkuk.dmes.mdm.contract.category.CategoryKind;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 요청 {@code categories} 그리드 행(ADDED·CHANGED·DELETED)을 버전 V 모습에 메모리로 적용한다(TSK-06-04 design.md §1.4,
 * {@link MasterCodeItemProjection} 자매) — 순수 규칙. 적용 순서는 요청 순서와 무관하게 DELETED → CHANGED → ADDED 다.
 */
public final class MasterCodeCateProjection {

    public enum RowStatus { ADDED, CHANGED, DELETED }

    /** 적용할 변경 하나. DELETED 면 definition 이 null 이다. */
    public record Change(RowStatus status, String cateId, CategoryDefinition definition) {
    }

    /** viewAfter = 적용 후 카테고리 정의 목록, touched = ADDED·CHANGED cate_id, changes = 적용 순서의 변경 목록. */
    public record Result(List<CategoryDefinition> viewAfter, Set<String> touched, List<MdmCheckIssue> issues,
                         List<Change> changes) {
    }

    private MasterCodeCateProjection() {
    }

    public static Result apply(List<CategoryDefinition> viewAtV, List<Map<String, Object>> rows) {
        List<Change> deleted = new ArrayList<>();
        List<Change> changed = new ArrayList<>();
        List<Change> added = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            RowStatus status = status(row.get("rowStatus"));
            String cateId = text(row.get("cateId"));
            switch (status) {
                case DELETED -> deleted.add(new Change(status, cateId, null));
                case CHANGED -> changed.add(new Change(status, cateId, definition(row)));
                case ADDED -> added.add(new Change(status, cateId, definition(row)));
            }
        }

        List<CategoryDefinition> view = new ArrayList<>(viewAtV);
        List<MdmCheckIssue> issues = new ArrayList<>();
        Set<String> touched = new HashSet<>();
        List<Change> ordered = new ArrayList<>();
        for (Change c : deleted) {
            int at = indexOf(view, c.cateId());
            if (at < 0) {
                issues.add(notFound(c.cateId()));
            } else {
                view.remove(at);
            }
            ordered.add(c);
        }
        for (Change c : changed) {
            int at = indexOf(view, c.cateId());
            if (at < 0) {
                issues.add(notFound(c.cateId()));
            } else {
                view.set(at, c.definition());
                touched.add(c.cateId());
            }
            ordered.add(c);
        }
        for (Change c : added) {
            if (indexOf(view, c.cateId()) >= 0) {
                issues.add(MasterCodeCateChecks.issue(MasterCodeCateIssueCode.CATE_ID_OVERLAP, c.cateId(), "cateId",
                        "이 버전에 이미 있는 카테고리다"));
            } else {
                view.add(c.definition());
                touched.add(c.cateId());
            }
            ordered.add(c);
        }
        return new Result(List.copyOf(view), touched, List.copyOf(issues), List.copyOf(ordered));
    }

    private static CategoryDefinition definition(Map<String, Object> row) {
        String cateId = text(row.get("cateId"));
        String cateName = text(row.get("cateName"));
        CategoryKind kind = kind(row.get("defKind"));
        String defExpr = text(row.get("defExpr"));
        CategoryDefTarget target = target(row.get("defTarget"));
        String description = text(row.get("description"));
        return new CategoryDefinition(cateId, cateName, kind, defExpr, target, description);
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

    private static CategoryKind kind(Object raw) {
        if (raw == null) {
            return null;
        }
        try {
            return CategoryKind.valueOf(raw.toString());
        } catch (IllegalArgumentException e) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "defKind 는 REGEX·TABLE 중 하나다: " + raw, List.of());
        }
    }

    private static CategoryDefTarget target(Object raw) {
        String s = text(raw);
        if (s == null) {
            return null;
        }
        try {
            return CategoryDefTarget.valueOf(s);
        } catch (IllegalArgumentException e) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "defTarget 형식이 올바르지 않다: " + raw, List.of());
        }
    }

    private static String text(Object raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.toString();
        return s.isEmpty() ? null : s;
    }

    private static int indexOf(List<CategoryDefinition> view, String cateId) {
        for (int i = 0; i < view.size(); i++) {
            if (Objects.equals(view.get(i).cateId(), cateId)) {
                return i;
            }
        }
        return -1;
    }

    private static MdmCheckIssue notFound(String cateId) {
        return MasterCodeCateChecks.issue(MasterCodeCateIssueCode.CATE_NOT_FOUND, cateId, "cateId", "이 버전에 없는 카테고리다");
    }
}
