package com.dongkuk.dmes.mdm.contract.security;

/**
 * 권한 액션 코드 13종 — ADR-0003 D5 대조표. 모두 현재 {@code seedMcmSecRbac} 의 allActions 에 있다.
 * DRAFT 소유권 액션(lock·unlock·handover 등)은 화면 Task 가 이름을 확정한 뒤 더한다(ADR-0003).
 */
public final class MdmActions {

    public static final String SEARCH = "search";
    public static final String VIEW = "view";
    public static final String EXPORT = "export";
    public static final String COMPARE = "compare";
    public static final String SAVE = "save";
    public static final String DELETE = "delete";
    public static final String REG = "reg";
    public static final String IMPORT = "import";
    public static final String VALIDATE = "validate";
    public static final String EXECUTE = "execute";
    public static final String COPY = "copy";
    public static final String RESTORE = "restore";
    public static final String CONFIRM = "confirm";

    private MdmActions() {
    }
}
