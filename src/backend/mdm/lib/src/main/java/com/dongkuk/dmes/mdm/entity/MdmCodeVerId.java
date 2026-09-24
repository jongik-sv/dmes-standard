package com.dongkuk.dmes.mdm.entity;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Objects;

/**
 * {@link MdmCodeVer} 복합 PK({@code MARU_CODE_ID, VER}) — {@code @IdClass} 대상. 필드명은 엔티티 {@code @Id} 필드명과 같다.
 * 버전 번호는 scale 과 무관하게 같은 키로 본다(불변 규칙 23, {@link MdmCodeVerNumbers}).
 */
public class MdmCodeVerId implements Serializable {

    private String maruCodeId;
    private BigDecimal ver;

    public MdmCodeVerId() {
        // JPA 기본 생성자
    }

    public MdmCodeVerId(String maruCodeId, BigDecimal ver) {
        this.maruCodeId = maruCodeId;
        this.ver = MdmCodeVerNumbers.scaled(ver);
    }

    public String getMaruCodeId() { return maruCodeId; }
    public BigDecimal getVer() { return MdmCodeVerNumbers.scaled(ver); }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof MdmCodeVerId other)) {
            return false;
        }
        return Objects.equals(maruCodeId, other.maruCodeId) && MdmCodeVerNumbers.same(ver, other.ver);
    }

    @Override
    public int hashCode() {
        return Objects.hash(maruCodeId, MdmCodeVerNumbers.hash(ver));
    }

    @Override
    public String toString() {
        return maruCodeId + "/" + ver;
    }
}
