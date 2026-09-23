package com.dongkuk.dmes.mdm.contract.category;

/** 예약 카테고리 BASE — 원천 04:95·1027, 05:161·656. 편집·삭제할 수 없다(MdmErrorCode.RESERVED_CATEGORY). */
public final class CategoryConventions {

    public static final String BASE_CATE_ID = "BASE";
    public static final CategoryKind BASE_DEF_KIND = CategoryKind.REGEX;
    public static final String BASE_DEF_EXPR = ".*";

    private CategoryConventions() {
    }
}
