package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;

/**
 * 3층 기본값 해석(TSK-05-02 design.md F9, 03:23 — 불변 I10). 헤더 템플릿이 기본값을 제안하고, 전문이 상수를 확정하며, AUTO 만
 * 송신 시점에 채운다. 빈 재정의는 "재정의 없음"이다. m-mdm {@code src/layout/const-resolve.ts} 와 같은 규칙.
 */
public final class LayoutConstResolver {

    private LayoutConstResolver() {
    }

    /** CONST: 재정의 ?? 헤더 기본값 / AUTO: 송신 시 채움 표시(재정의 무시) / DATA·FILLER: 값 없음. */
    public static String effective(MdmFillKind kind, String headerDefault, String override) {
        if (kind == null) {
            return null;
        }
        return switch (kind) {
            case CONST -> override != null && !override.isBlank() ? override : headerDefault;
            case AUTO -> "(송신 시 채움: " + headerDefault + ")";
            case DATA, FILLER -> null;
        };
    }
}
