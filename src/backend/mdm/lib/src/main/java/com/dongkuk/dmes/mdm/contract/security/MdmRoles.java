package com.dongkuk.dmes.mdm.contract.security;

import java.util.List;

/** mdm 역할 ID 2종 — ADR-0003 D5. 시드는 TSK-01-03. SYSADMIN 은 기존대로 PERM_ALL 이라 여기 없다. */
public final class MdmRoles {

    /** 표준 관리자. */
    public static final String STD_ADMIN = "MDM_STD_ADMIN";
    /** 담당자(데이터 스튜어드). */
    public static final String STEWARD = "MDM_STEWARD";

    public static final List<String> ALL = List.of(STD_ADMIN, STEWARD);

    private MdmRoles() {
    }
}
