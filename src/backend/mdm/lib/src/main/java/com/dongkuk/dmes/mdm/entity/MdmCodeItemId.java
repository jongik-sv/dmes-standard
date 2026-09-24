package com.dongkuk.dmes.mdm.entity;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Objects;

/**
 * {@link MdmCodeItem} 복합 PK({@code MARU_CODE_ID, CODE, FROM_VER}) — {@code @IdClass} 대상. 필드명은 엔티티 {@code @Id} 필드명과 같다.
 * 버전 번호는 scale 과 무관하게 같은 키로 본다(불변 규칙 23, {@link MdmCodeVerNumbers}).
 */
public class MdmCodeItemId implements Serializable {

    private String maruCodeId;
    private String code;
    private BigDecimal fromVer;

    public MdmCodeItemId() {
        // JPA 기본 생성자
    }

    public MdmCodeItemId(String maruCodeId, String code, BigDecimal fromVer) {
        this.maruCodeId = maruCodeId;
        this.code = code;
        this.fromVer = MdmCodeVerNumbers.scaled(fromVer);
    }

    public String getMaruCodeId() { return maruCodeId; }
    public String getCode() { return code; }
    public BigDecimal getFromVer() { return MdmCodeVerNumbers.scaled(fromVer); }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof MdmCodeItemId other)) {
            return false;
        }
        return Objects.equals(maruCodeId, other.maruCodeId)
                && Objects.equals(code, other.code)
                && MdmCodeVerNumbers.same(fromVer, other.fromVer);
    }

    @Override
    public int hashCode() {
        return Objects.hash(maruCodeId, code, MdmCodeVerNumbers.hash(fromVer));
    }

    @Override
    public String toString() {
        return maruCodeId + "/" + code + "/" + fromVer;
    }
}
