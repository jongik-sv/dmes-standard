package com.dongkuk.dmes.cactus.web.inbound;

/**
 * 드롭다운/콤보박스 등에서 사용하는 List of Values 항목.
 *
 * <p>화면 표시용 {@code displayValue} 와 실제 저장용 {@code value} 의 쌍 + 분류 코드 {@code masterCode}.
 * dmes-film {@code Lov} 와 동일 구조.
 */
public final class Lov {

    private final String masterCode;
    private final String value;
    private final String displayValue;

    public Lov(String value, String displayValue) {
        this(null, value, displayValue);
    }

    public Lov(String masterCode, String value, String displayValue) {
        this.masterCode = masterCode;
        this.value = value;
        this.displayValue = displayValue;
    }

    public String getMasterCode() {
        return masterCode;
    }

    public String getValue() {
        return value;
    }

    public String getDisplayValue() {
        return displayValue;
    }
}
