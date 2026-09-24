package com.dongkuk.dmes.mdm.entity;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Objects;

/**
 * {@link MdmCodeCate} 복합 PK({@code MARU_CODE_ID, CATE_ID, FROM_VER}) — {@code @IdClass} 대상. 필드명은 엔티티 {@code @Id} 필드명과 같다.
 * 버전 번호는 scale 과 무관하게 같은 키로 본다(불변 규칙 23, {@link MdmCodeVerNumbers}).
 */
public class MdmCodeCateId implements Serializable {

    private String maruCodeId;
    private String cateId;
    private BigDecimal fromVer;

    public MdmCodeCateId() {
        // JPA 기본 생성자
    }

    public MdmCodeCateId(String maruCodeId, String cateId, BigDecimal fromVer) {
        this.maruCodeId = maruCodeId;
        this.cateId = cateId;
        this.fromVer = MdmCodeVerNumbers.scaled(fromVer);
    }

    public String getMaruCodeId() { return maruCodeId; }
    public String getCateId() { return cateId; }
    public BigDecimal getFromVer() { return MdmCodeVerNumbers.scaled(fromVer); }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof MdmCodeCateId other)) {
            return false;
        }
        return Objects.equals(maruCodeId, other.maruCodeId)
                && Objects.equals(cateId, other.cateId)
                && MdmCodeVerNumbers.same(fromVer, other.fromVer);
    }

    @Override
    public int hashCode() {
        return Objects.hash(maruCodeId, cateId, MdmCodeVerNumbers.hash(fromVer));
    }

    @Override
    public String toString() {
        return maruCodeId + "/" + cateId + "/" + fromVer;
    }
}
