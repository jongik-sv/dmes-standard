package com.dongkuk.dmes.mcm.security.perm;

import java.util.List;

/**
 * 버튼 판정.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 버튼·팝업 코드 하나의 허용·거부 판정. grantReason 과 denyReason 중 하나만 채운다.
 */
public record ButtonVerdict(String code, Kind kind, boolean granted, GrantReason grantReason, DenyReason denyReason,
                            List<String> viaRoles, List<String> viaGroups) {
    /** 코드 종류. */
    public enum Kind { BTN, POPUP }

    public ButtonVerdict {
        viaRoles = viaRoles == null ? List.of() : List.copyOf(viaRoles);
        viaGroups = viaGroups == null ? List.of() : List.copyOf(viaGroups);
    }
}
