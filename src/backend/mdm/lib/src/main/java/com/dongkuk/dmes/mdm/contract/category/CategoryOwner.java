package com.dongkuk.dmes.mdm.contract.category;

import static com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget.ATTR01;
import static com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget.ATTR02;
import static com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget.ATTR03;
import static com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget.ATTR04;
import static com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget.ATTR05;
import static com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget.ATTR06;
import static com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget.ATTR07;
import static com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget.ATTR08;
import static com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget.ATTR09;
import static com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget.ATTR10;
import static com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget.CODE;
import static com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget.KEY;
import static com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget.LVL1;
import static com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget.LVL2;
import static com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget.LVL3;
import static com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget.LVL4;
import static com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget.LVL5;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

/**
 * 카테고리를 가진 영역 — 04 마스터코드·05 마스터데이터. BASE 의 적용 대상과 허용 def_target(04:1032, 05:157·660).
 * def_target 은 REGEX 일 때만 쓰고 TABLE 이면 null 이다.
 */
public enum CategoryOwner {

    MASTER_CODE(CODE, EnumSet.of(CODE, LVL1, LVL2, LVL3, LVL4, LVL5,
            ATTR01, ATTR02, ATTR03, ATTR04, ATTR05, ATTR06, ATTR07, ATTR08, ATTR09, ATTR10)),
    MASTER_DATA(KEY, EnumSet.of(KEY, LVL1, LVL2, LVL3, LVL4, LVL5,
            ATTR01, ATTR02, ATTR03, ATTR04, ATTR05, ATTR06, ATTR07, ATTR08, ATTR09, ATTR10));

    private final CategoryDefTarget baseDefTarget;
    private final Set<CategoryDefTarget> allowedDefTargets;

    CategoryOwner(CategoryDefTarget baseDefTarget, EnumSet<CategoryDefTarget> allowedDefTargets) {
        this.baseDefTarget = baseDefTarget;
        this.allowedDefTargets = Collections.unmodifiableSet(allowedDefTargets);
    }

    /** 예약 카테고리 BASE 의 def_target(04 CODE, 05 KEY). */
    public CategoryDefTarget baseDefTarget() {
        return baseDefTarget;
    }

    /** 허용 def_target(수정 불가 집합). */
    public Set<CategoryDefTarget> allowedDefTargets() {
        return allowedDefTargets;
    }
}
