package com.dongkuk.dmes.mcm.security.perm;

import java.util.List;

/**
 * 권한 설명.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 사용자×오브젝트 한 쌍의 설명. visible=false 면 objectReason 에 사유, 보이면 null.
 */
public record Explain(String userId, String objectId, boolean visible, DenyReason objectReason,
                      List<ButtonVerdict> buttons, List<ExplainPath> paths) {
    public Explain {
        buttons = buttons == null ? List.of() : List.copyOf(buttons);
        paths = paths == null ? List.of() : List.copyOf(paths);
    }
}
