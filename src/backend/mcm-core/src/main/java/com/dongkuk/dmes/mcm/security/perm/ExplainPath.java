package com.dongkuk.dmes.mcm.security.perm;

import java.util.List;

/**
 * 허용 경로.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 사용자가 오브젝트 권한을 얻은 그룹→역할 경로 한 줄.
 */
public record ExplainPath(String roleGroupId, String roleId, List<String> btnPerm, List<String> popupPerm) {
    public ExplainPath {
        btnPerm = btnPerm == null ? List.of() : List.copyOf(btnPerm);
        popupPerm = popupPerm == null ? List.of() : List.copyOf(popupPerm);
    }
}
