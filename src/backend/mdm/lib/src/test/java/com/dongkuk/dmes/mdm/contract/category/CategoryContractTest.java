package com.dongkuk.dmes.mdm.contract.category;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * TSK-01-02 design.md §3.1 T3 — 04·05 공유 카테고리 모델과 마루 ID 규칙(불변 규칙 I13).
 */
class CategoryContractTest {

    private static final Set<CategoryDefTarget> LVL_AND_ATTR = EnumSet.of(
            CategoryDefTarget.LVL1, CategoryDefTarget.LVL2, CategoryDefTarget.LVL3, CategoryDefTarget.LVL4,
            CategoryDefTarget.LVL5,
            CategoryDefTarget.ATTR01, CategoryDefTarget.ATTR02, CategoryDefTarget.ATTR03, CategoryDefTarget.ATTR04,
            CategoryDefTarget.ATTR05, CategoryDefTarget.ATTR06, CategoryDefTarget.ATTR07, CategoryDefTarget.ATTR08,
            CategoryDefTarget.ATTR09, CategoryDefTarget.ATTR10);

    @Test
    void 카테고리_종류는_REGEX_와_TABLE_이다() {
        assertEquals(List.of("REGEX", "TABLE"), Arrays.stream(CategoryKind.values()).map(Enum::name).toList());
    }

    @Test
    void BASE_는_REGEX_전체_일치로_예약된다() {
        assertEquals("BASE", CategoryConventions.BASE_CATE_ID);
        assertEquals(CategoryKind.REGEX, CategoryConventions.BASE_DEF_KIND);
        assertEquals(".*", CategoryConventions.BASE_DEF_EXPR);
    }

    @Test
    void 마스터코드_허용_대상은_CODE_와_LVL_ATTR_16개다() {
        Set<CategoryDefTarget> expected = EnumSet.of(CategoryDefTarget.CODE);
        expected.addAll(LVL_AND_ATTR);
        assertEquals(CategoryDefTarget.CODE, CategoryOwner.MASTER_CODE.baseDefTarget());
        assertEquals(expected, CategoryOwner.MASTER_CODE.allowedDefTargets());
        assertEquals(16, CategoryOwner.MASTER_CODE.allowedDefTargets().size());
        assertFalse(CategoryOwner.MASTER_CODE.allowedDefTargets().contains(CategoryDefTarget.KEY));
    }

    @Test
    void 마스터데이터_허용_대상은_KEY_와_LVL_ATTR_16개다() {
        Set<CategoryDefTarget> expected = EnumSet.of(CategoryDefTarget.KEY);
        expected.addAll(LVL_AND_ATTR);
        assertEquals(CategoryDefTarget.KEY, CategoryOwner.MASTER_DATA.baseDefTarget());
        assertEquals(expected, CategoryOwner.MASTER_DATA.allowedDefTargets());
        assertEquals(16, CategoryOwner.MASTER_DATA.allowedDefTargets().size());
        assertFalse(CategoryOwner.MASTER_DATA.allowedDefTargets().contains(CategoryDefTarget.CODE));
    }

    @Test
    void 허용_대상_집합은_수정할_수_없다() {
        for (CategoryOwner owner : CategoryOwner.values()) {
            assertThrows(UnsupportedOperationException.class,
                    () -> owner.allowedDefTargets().add(CategoryDefTarget.KEY), owner + " add");
            assertThrows(UnsupportedOperationException.class,
                    () -> owner.allowedDefTargets().remove(CategoryDefTarget.LVL1), owner + " remove");
        }
    }

    @Test
    void 정의_대상은_CODE_KEY_LVL5_ATTR10_의_17종이다() {
        assertEquals(17, CategoryDefTarget.values().length);
    }

    @Test
    void 마루_ID_종류는_2종이다() {
        assertEquals(List.of("MASTER_CODE", "MASTER_DATA"), Arrays.stream(MaruIdKind.values()).map(Enum::name).toList());
    }

    @Test
    void 마루_ID_금지_문자는_점_공백_콤마다() {
        Pattern forbidden = Pattern.compile(MaruIdRules.FORBIDDEN_CHAR_PATTERN);
        assertTrue(forbidden.matcher("A.B").find());
        assertTrue(forbidden.matcher("A B").find());
        assertTrue(forbidden.matcher("A,B").find());
        assertTrue(forbidden.matcher("A\tB").find());
        assertFalse(forbidden.matcher("PROC_CD").find());
        assertFalse(forbidden.matcher("ITEM-01").find());
    }

    @Test
    void 카테고리_정의_record_는_필드를_보존한다() {
        CategoryDefinition def = new CategoryDefinition("BASE", "기본", CategoryKind.REGEX, ".*",
                CategoryDefTarget.CODE, null);
        assertEquals("BASE", def.cateId());
        assertEquals(CategoryKind.REGEX, def.defKind());
        assertEquals(CategoryDefTarget.CODE, def.defTarget());
    }
}
