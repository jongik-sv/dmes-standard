package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefinition;
import com.dongkuk.dmes.mdm.contract.category.CategoryKind;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCateItemRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCateRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemValues;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * 카테고리 해석(TSK-06-03 design.md §6.5, D11) — 버전 V 에 유효한 코드 행이 카테고리에 드는지와 그 근거. 순수 규칙이며
 * 06-04(편집 중 재해석)·06-05(확정 검사 2항)가 다시 쓴다.
 *
 * <p>REGEX 는 대상 칸 값 <b>전체 일치</b>({@link java.util.regex.Matcher#matches()})이고 값이 NULL 이면 해당 없음, TABLE 은
 * CATE_ITEM 과 V 의 코드의 교집합이다(불변 규칙 27). 경고 2-1 {@link #CATE_ITEM_CODE_MISSING}(V 에 없는 코드의 소속),
 * 2-2 {@link #CATEGORY_EMPTY}(결과 0건). 카테고리 소급(04:379)은 사본 판정 규칙이라 여기서 하지 않는다.
 */
public final class MasterCodeCategoryResolver {

    public static final String CATE_ITEM_CODE_MISSING = "CATE_ITEM_CODE_MISSING";
    public static final String CATEGORY_EMPTY = "CATEGORY_EMPTY";

    public enum Reason { MATCH, NO_MATCH, TARGET_NULL, MEMBER, NOT_MEMBER }

    /** 코드 한 줄의 판정. targetValue 는 REGEX 대상 칸 값(TABLE 이면 null). */
    public record ResolvedRow(String code, String name, Integer seq, List<String> lvls, boolean hit, Reason reason,
                              String targetValue) {
    }

    public record Resolution(List<ResolvedRow> rows, int hitCount, int total, List<MdmCheckIssue> warnings,
                             boolean invalidExpression, String defKind, String defTarget, String defExpr) {
    }

    /** 코드 정렬 — seq(null 은 마지막), 그다음 코드값(§6.2 viewAt 과 같다). */
    public static final Comparator<MasterCodeItemRow> ITEM_ORDER = Comparator
            .comparing((MasterCodeItemRow r) -> r.values().seq(), Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(MasterCodeItemRow::code);

    private MasterCodeCategoryResolver() {
    }

    public static Resolution resolve(List<MasterCodeItemRow> itemsAtV, MasterCodeCateRow cate,
                                     List<MasterCodeCateItemRow> cateItemsAtV) {
        CategoryDefinition def = cate.definition();
        List<MasterCodeItemRow> items = itemsAtV.stream().sorted(ITEM_ORDER).toList();
        List<ResolvedRow> rows = new ArrayList<>();
        List<MdmCheckIssue> warnings = new ArrayList<>();
        boolean invalid = false;

        if (def.defKind() == CategoryKind.TABLE) {
            Set<String> members = new LinkedHashSet<>();
            for (MasterCodeCateItemRow ci : cateItemsAtV) {
                if (ci.cateId().equals(def.cateId())) {
                    members.add(ci.code());
                }
            }
            Set<String> codes = new TreeSet<>();
            for (MasterCodeItemRow item : items) {
                boolean hit = members.contains(item.code());
                codes.add(item.code());
                rows.add(row(item, hit, hit ? Reason.MEMBER : Reason.NOT_MEMBER, null));
            }
            for (String member : new TreeSet<>(members)) {
                if (!codes.contains(member)) {
                    warnings.add(new MdmCheckIssue(CATE_ITEM_CODE_MISSING, "소속 코드 " + member + " 가 이 버전에 없다",
                            "code", member));
                }
            }
        } else {
            Pattern pattern = compile(def.defExpr());
            invalid = pattern == null;
            if (!invalid) {
                for (MasterCodeItemRow item : items) {
                    String value = target(item, def.defTarget());
                    if (value == null) {
                        rows.add(row(item, false, Reason.TARGET_NULL, null));
                    } else {
                        boolean hit = pattern.matcher(value).matches();
                        rows.add(row(item, hit, hit ? Reason.MATCH : Reason.NO_MATCH, value));
                    }
                }
            }
        }

        int hitCount = (int) rows.stream().filter(ResolvedRow::hit).count();
        if (hitCount == 0) {
            warnings.add(new MdmCheckIssue(CATEGORY_EMPTY, "해당 코드가 없다", null, def.cateId()));
        }
        return new Resolution(List.copyOf(rows), hitCount, items.size(), List.copyOf(warnings), invalid,
                def.defKind() == null ? null : def.defKind().name(),
                def.defTarget() == null ? null : def.defTarget().name(), def.defExpr());
    }

    private static Pattern compile(String expr) {
        if (expr == null) {
            return null;
        }
        try {
            return Pattern.compile(expr);
        } catch (PatternSyntaxException e) {
            return null;
        }
    }

    /** 대상 칸 값. def_target 이 null(또는 05 전용 KEY)이면 코드값이다. */
    static String target(MasterCodeItemRow item, CategoryDefTarget target) {
        MasterCodeItemValues v = item.values();
        if (target == null || target == CategoryDefTarget.CODE || target == CategoryDefTarget.KEY) {
            return item.code();
        }
        String name = target.name();
        if (name.startsWith("LVL")) {
            return v.lvls().get(Integer.parseInt(name.substring(3)) - 1);
        }
        return v.attrs().get(Integer.parseInt(name.substring(4)) - 1);
    }

    private static ResolvedRow row(MasterCodeItemRow item, boolean hit, Reason reason, String targetValue) {
        MasterCodeItemValues v = item.values();
        return new ResolvedRow(item.code(), v.name(), v.seq(), v.lvls(), hit, reason, targetValue);
    }
}
