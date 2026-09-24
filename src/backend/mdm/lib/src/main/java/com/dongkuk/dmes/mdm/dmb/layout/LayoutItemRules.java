package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutFillKinds.Cell;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutFillKinds.Field;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 항목 규칙 L01~L08(TSK-05-02 design.md §6.2 — 불변 I5·I6·I7). 순수 검사다 — 컬럼 사전 조회는 인자로 받는다. 이슈는 행 순서대로,
 * 한 행 안에서는 칸 행렬(L02·L03) → 사전(L01) → AUTO 종류(L04) → 단위(L05) → 중복(L06) → 형식·길이(L08·L07) 순으로 모두 모은다.
 * 05-03 몫(값 유효 식·차원·자리 용량·unit_item 대상)은 보지 않는다(D7).
 */
public final class LayoutItemRules {

    private static final String NUMBER = "NUMBER";

    private LayoutItemRules() {
    }

    public static List<LayoutIssue> check(List<LayoutItemDraft> items, Map<String, LayoutColumnInfo> dictionary) {
        List<LayoutIssue> issues = new ArrayList<>();
        Set<String> seenColumns = new HashSet<>();
        for (LayoutItemDraft item : items) {
            checkItem(item, dictionary, seenColumns, issues);
        }
        return issues;
    }

    private static void checkItem(LayoutItemDraft item, Map<String, LayoutColumnInfo> dictionary, Set<String> seenColumns,
                                  List<LayoutIssue> issues) {
        int seq = item.seq();
        MdmFillKind kind = LayoutFillKinds.parse(item.fillKind());
        if (kind == null) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L03, seq, "FILL_KIND",
                    "채움 방식은 DATA·CONST·AUTO·FILLER 중 하나다: " + item.fillKind()));
            return;
        }
        boolean closedHit = false;
        for (Field field : Field.values()) {
            Cell cell = LayoutFillKinds.cell(kind, field);
            boolean present = present(item, field);
            if (cell == Cell.CLOSED && present) {
                issues.add(LayoutIssue.of(LayoutIssueCode.L02, seq, field.key(),
                        kind + " 항목에는 " + field.key() + " 를 넣을 수 없다"));
                closedHit = true;
            } else if (cell == Cell.REQUIRED && !present) {
                issues.add(LayoutIssue.of(LayoutIssueCode.L03, seq, field.key(), kind + " 항목에는 " + field.key() + " 가 필요하다"));
            }
        }
        if (kind == MdmFillKind.FILLER) {
            if (item.fillerLength() != null && item.fillerLength() < 1) {
                issues.add(LayoutIssue.of(LayoutIssueCode.L03, seq, Field.FILLER_LENGTH.key(),
                        "FILLER 길이는 1 이상이다: " + item.fillerLength()));
            }
            return;
        }
        LayoutColumnInfo column = null;
        if (item.columnPhys() != null) {
            column = dictionary.get(item.columnPhys());
            if (column == null) {
                issues.add(LayoutIssue.of(LayoutIssueCode.L01, seq, Field.COLUMN.key(),
                        "컬럼 사전에 없는 컬럼이다: " + item.columnPhys()));
            }
        }
        if (kind == MdmFillKind.AUTO && item.defaultValue() != null && !LayoutFillKinds.AUTO_KINDS.contains(item.defaultValue())) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L04, seq, Field.DEFAULT_VALUE.key(),
                    "AUTO 종류는 " + String.join("·", LayoutFillKinds.AUTO_KINDS) + " 중 하나다: " + item.defaultValue()));
        }
        if (!closedHit && item.transUnit() != null && item.unitItem() != null) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L05, seq, Field.UNIT_ITEM.key(), "전송 단위와 단위 항목은 둘 중 하나만 넣는다"));
        }
        if (item.columnPhys() != null && !seenColumns.add(item.columnPhys())) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L06, seq, Field.COLUMN.key(),
                    "같은 레이아웃에 같은 컬럼을 두 번 쓸 수 없다: " + item.columnPhys()));
        }
        if (column == null) {
            return;
        }
        if (item.numFormat() != null) {
            checkNumFormat(seq, item.numFormat(), column, issues);
        } else if (column.length() == null || column.length() < 1) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L07, seq, Field.COLUMN.key(),
                    "도메인 길이가 없어 항목 길이를 정할 수 없다: " + item.columnPhys()));
        }
    }

    private static void checkNumFormat(int seq, String text, LayoutColumnInfo column, List<LayoutIssue> issues) {
        String key = Field.NUM_FORMAT.key();
        if (!NUMBER.equals(column.dataType())) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L08, seq, key,
                    "숫자 표현 형식은 숫자 도메인에만 넣는다: " + column.physName() + "(" + column.dataType() + ")"));
            return;
        }
        LayoutNumFormat f;
        try {
            f = LayoutNumFormatCodec.decode(text);
        } catch (IllegalArgumentException e) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L08, seq, key, e.getMessage()));
            return;
        }
        if (f.impliedScale() != 0 && !Objects.equals(f.impliedScale(), column.scale())) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L08, seq, key,
                    "암묵 소수 자리는 0 또는 도메인 소수 자리(" + column.scale() + ")다: " + f.impliedScale()));
        }
    }

    /** 행렬 판정용 — 값이 있는가(FILLER 길이는 null 이 아니면 있음, 0 도 "있음"). */
    static boolean present(LayoutItemDraft item, Field field) {
        return switch (field) {
            case COLUMN -> item.columnPhys() != null;
            case DEFAULT_VALUE -> item.defaultValue() != null;
            case FILLER_LENGTH -> item.fillerLength() != null;
            case TRANS_UNIT -> item.transUnit() != null;
            case UNIT_ITEM -> item.unitItem() != null;
            case NUM_FORMAT -> item.numFormat() != null;
        };
    }
}
