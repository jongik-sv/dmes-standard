package com.dongkuk.dmes.mcm.security.perm;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 오브젝트 메타.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 오브젝트의 사용 여부·유효 기간·허용 버튼/팝업 값. systemCode 가 비면 런타임 키는 mcm 으로 본다(D26).
 */
public record ObjMeta(String objectId, String systemCode, String useTp, List<String> btnPerm, List<String> popupPerm,
                      LocalDateTime startActiveDate, LocalDateTime endActiveDate) {
    public ObjMeta {
        btnPerm = btnPerm == null ? List.of() : List.copyOf(btnPerm);
        popupPerm = popupPerm == null ? List.of() : List.copyOf(popupPerm);
    }
}
