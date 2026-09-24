package com.dongkuk.dmes.mdm.contract.mastercode;

/**
 * {@code VersionDiffEntry.key} 와 {@code MdmCheckIssue.itemKey} 규약(D10). 키 = 표({@link MasterCodeSegmentTable#name()})
 * + {@link #TABLE_KEY_SEPARATOR} + 부분: ITEM {@code "ITEM:{code}"}, CATE {@code "CATE:{cateId}"}, CATE_ITEM
 * {@code "CATE_ITEM:{cateId},{code}"}. 부분 구분자 {@code ,} 는 cate_id({@code MaruIdRules})·code
 * ({@link MasterCodeConventions#CODE_FORBIDDEN_CHAR_PATTERN}) 양쪽 금지 문자라 파싱이 모호하지 않다. 값 맵의 키는 물리
 * 칼럼명(UPPER_SNAKE)이고 PK·FROM_VER·TO_VER·감사 칼럼은 넣지 않는다.
 */
public final class MasterCodeDiffConventions {

    public static final String TABLE_KEY_SEPARATOR = ":";
    public static final String KEY_PART_SEPARATOR = ",";

    private MasterCodeDiffConventions() {
    }
}
