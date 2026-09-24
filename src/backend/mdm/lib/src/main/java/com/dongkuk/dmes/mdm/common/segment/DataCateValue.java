package com.dongkuk.dmes.mdm.common.segment;

import java.util.Objects;

/**
 * 카테고리 선분 행의 값 스냅샷. 문자열은 trim 하고 빈 문자열은 NULL 로 본다(항목 값과 같은 정규화).
 * {@code defKind} 는 REGEX·TABLE, {@code defTarget} 은 KEY·LVL1~5·ATTR01~10(V10 CHECK 와 같다).
 */
public record DataCateValue(String cateName, String defKind, String defExpr, String defTarget, String description) {

    public static final String REGEX = "REGEX";
    public static final String TABLE = "TABLE";

    public DataCateValue {
        cateName = DataItemValue.clean(cateName);
        defKind = DataItemValue.clean(defKind);
        defExpr = DataItemValue.clean(defExpr);
        defTarget = DataItemValue.clean(defTarget);
        description = DataItemValue.clean(description);
    }

    public boolean sameAs(DataCateValue other) {
        return other != null && Objects.equals(cateName, other.cateName) && Objects.equals(defKind, other.defKind)
                && Objects.equals(defExpr, other.defExpr) && Objects.equals(defTarget, other.defTarget)
                && Objects.equals(description, other.description);
    }
}
