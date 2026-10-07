package com.dongkuk.dmes.mdm.contract.mastercode;

import static com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCheckSeverity.REJECT;
import static com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCheckSeverity.WARNING;

/**
 * 확정 검사 8항(원천 「상신 시 검사」 04:405-416, PRD FR-C5). 순서는 화면 표 순서다(1·2·2-1·2-2·3~8, 10행).
 *
 * <p>{@code firstVersionExempt} 는 최초 버전(직전 RELEASED 없음)에서 면제(3·4항), {@code sharedCheck} 는 공통 서비스가
 * {@code ApplyFromOrderCheck} 로 이미 검사해 SPI 가 반복하지 않음(3항, 규칙 7 로 "직전 RELEASED apply_from 보다 뒤"),
 * {@code inScope} 가 false 면 보류(5항 배포 대상 — 배포 대상 지정 화면이 보류라 {@code DEFERRED}, D9).
 */
public enum MasterCodeConfirmCheckItem {
    /** 코드값 문자(콤마·공백 금지, 04:197)와 행 값 길이(Oracle 칸 상한, KEY_TOO_LONG·TEXT_TOO_LONG). */
    CODE_VALUE_CHARS("1", REJECT, false, false, true),
    /** 카테고리 해석(REGEX 컴파일·대상 칸). */
    CATEGORY_RESOLVE("2", REJECT, false, false, true),
    /** TABLE 카테고리 소속 코드가 코드 표에 없다. */
    CATE_ITEM_CODE_MISSING("2-1", WARNING, false, false, true),
    /** 카테고리에 해당 코드가 하나도 없다. */
    CATEGORY_EMPTY("2-2", WARNING, false, false, true),
    /** apply_from 순서(공통 서비스 위임). */
    APPLY_FROM_ORDER("3", REJECT, true, true, true),
    /** 직전 RELEASED 대비 변경이 있다. */
    HAS_CHANGES("4", REJECT, true, false, true),
    /** 배포 대상 시스템 지정(보류, D9). */
    DEPLOY_TARGET_EXISTS("5", WARNING, false, false, false),
    /** 계층 칸 상하 관계. */
    LVL_HIERARCHY("6", REJECT, false, false, true),
    /** 이름 없는 속성 칸에 값. */
    ATTR_WITHOUT_LABEL("7", REJECT, false, false, true),
    /** lvl_cnt 를 넘는 계층 칸에 값. */
    LVL_BEYOND_CNT("8", REJECT, false, false, true);

    private final String no;
    private final MasterCodeCheckSeverity severity;
    private final boolean firstVersionExempt;
    private final boolean sharedCheck;
    private final boolean inScope;

    MasterCodeConfirmCheckItem(String no, MasterCodeCheckSeverity severity, boolean firstVersionExempt,
                               boolean sharedCheck, boolean inScope) {
        this.no = no;
        this.severity = severity;
        this.firstVersionExempt = firstVersionExempt;
        this.sharedCheck = sharedCheck;
        this.inScope = inScope;
    }

    public String no() {
        return no;
    }

    public MasterCodeCheckSeverity severity() {
        return severity;
    }

    public boolean firstVersionExempt() {
        return firstVersionExempt;
    }

    public boolean sharedCheck() {
        return sharedCheck;
    }

    public boolean inScope() {
        return inScope;
    }
}
