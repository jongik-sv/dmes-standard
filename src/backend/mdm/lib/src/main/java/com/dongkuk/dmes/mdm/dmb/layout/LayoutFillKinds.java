package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import java.util.List;

/**
 * fill_kind 별 입력 칸 행렬(TSK-05-02 design.md F10, html "fill_kind별 입력 칸" — 불변 I6). 닫힌 칸에 값이 있으면 L02, 필수 칸이
 * 비면 L03 이다. 같은 표를 m-mdm {@code src/layout/fill-kind.ts} 가 화면 칸 열림·닫힘에 쓴다.
 *
 * <pre>
 *                DATA      CONST     AUTO      FILLER
 * COLUMN         필수      필수      필수      닫힘
 * DEFAULT_VALUE  닫힘      선택      필수      닫힘     (AUTO 는 {@link #AUTO_KINDS} 중 하나)
 * FILLER_LENGTH  닫힘      닫힘      닫힘      필수
 * TRANS_UNIT     선택      선택      닫힘      닫힘     (UNIT_ITEM 과 둘 중 하나)
 * UNIT_ITEM      선택      선택      닫힘      닫힘
 * NUM_FORMAT     선택      선택      선택      닫힘     (숫자 도메인만)
 * </pre>
 */
public final class LayoutFillKinds {

    public enum Cell { REQUIRED, OPTIONAL, CLOSED }

    /** 입력 칸. {@link #key()} 는 요청·응답 행 키다. */
    public enum Field {
        COLUMN("COLUMN_PHYS"), DEFAULT_VALUE("DEFAULT_VALUE"), FILLER_LENGTH("FILLER_LENGTH"), TRANS_UNIT("TRANS_UNIT"),
        UNIT_ITEM("UNIT_ITEM"), NUM_FORMAT("NUM_FORMAT");

        private final String key;

        Field(String key) {
            this.key = key;
        }

        public String key() {
            return key;
        }
    }

    /** AUTO 항목의 채움 종류(03:21, html) — 송신 시점에 채운다. */
    public static final List<String> AUTO_KINDS = List.of("SEND_TIME", "MSG_LENGTH", "SEQ", "LAYOUT_ID");

    private LayoutFillKinds() {
    }

    public static Cell cell(MdmFillKind kind, Field field) {
        return switch (field) {
            case COLUMN -> kind == MdmFillKind.FILLER ? Cell.CLOSED : Cell.REQUIRED;
            case DEFAULT_VALUE -> switch (kind) {
                case CONST -> Cell.OPTIONAL;
                case AUTO -> Cell.REQUIRED;
                default -> Cell.CLOSED;
            };
            case FILLER_LENGTH -> kind == MdmFillKind.FILLER ? Cell.REQUIRED : Cell.CLOSED;
            case TRANS_UNIT, UNIT_ITEM -> kind == MdmFillKind.DATA || kind == MdmFillKind.CONST ? Cell.OPTIONAL : Cell.CLOSED;
            case NUM_FORMAT -> kind == MdmFillKind.FILLER ? Cell.CLOSED : Cell.OPTIONAL;
        };
    }

    /** 대소문자 그대로의 이름만 받는다. 없거나 모르는 값이면 null. */
    public static MdmFillKind parse(String fillKind) {
        if (fillKind == null) {
            return null;
        }
        for (MdmFillKind k : MdmFillKind.values()) {
            if (k.name().equals(fillKind)) {
                return k;
            }
        }
        return null;
    }
}
