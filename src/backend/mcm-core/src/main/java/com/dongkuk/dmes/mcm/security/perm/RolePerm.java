package com.dongkuk.dmes.mcm.security.perm;

import java.util.List;

/**
 * 역할×오브젝트 퍼미션 한 건.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: TB_MCM_SEC_ROLE_PERM 한 행에 해당한다.
 */
public record RolePerm(String roleId, String objectId, List<String> btnPerm, List<String> popupPerm, String dataPerm) {
    public RolePerm {
        btnPerm = btnPerm == null ? List.of() : List.copyOf(btnPerm);
        popupPerm = popupPerm == null ? List.of() : List.copyOf(popupPerm);
    }
}
