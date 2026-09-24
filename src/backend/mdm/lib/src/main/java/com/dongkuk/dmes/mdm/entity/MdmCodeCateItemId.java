package com.dongkuk.dmes.mdm.entity;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Objects;

/**
 * {@link MdmCodeCateItem} 복합 PK({@code MARU_CODE_ID, CATE_ID, CODE, FROM_VER}) — {@code @IdClass} 대상. 필드명은 엔티티 {@code @Id} 필드명과 같다.
 * 버전 번호는 scale 과 무관하게 같은 키로 본다(불변 규칙 23, {@link MdmCodeVerNumbers}).
 */
public class MdmCodeCateItemId implements Serializable {

    private String maruCodeId;
    private String cateId;
    private String code;
    private BigDecimal fromVer;

    public MdmCodeCateItemId() {
        // JPA 기본 생성자
    }

    public MdmCodeCateItemId(String maruCodeId, String cateId, String code, BigDecimal fromVer) {
        this.maruCodeId = maruCodeId;
        this.cateId = cateId;
        this.code = code;
        this.fromVer = MdmCodeVerNumbers.scaled(fromVer);
    }

    public String getMaruCodeId() { return maruCodeId; }
    public String getCateId() { return cateId; }
    public String getCode() { return code; }
    public BigDecimal getFromVer() { return MdmCodeVerNumbers.scaled(fromVer); }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof MdmCodeCateItemId other)) {
            return false;
        }
        return Objects.equals(maruCodeId, other.maruCodeId)
                && Objects.equals(cateId, other.cateId)
                && Objects.equals(code, other.code)
                && MdmCodeVerNumbers.same(fromVer, other.fromVer);
    }

    @Override
    public int hashCode() {
        return Objects.hash(maruCodeId, cateId, code, MdmCodeVerNumbers.hash(fromVer));
    }

    @Override
    public String toString() {
        return maruCodeId + "/" + cateId + "/" + code + "/" + fromVer;
    }
}
