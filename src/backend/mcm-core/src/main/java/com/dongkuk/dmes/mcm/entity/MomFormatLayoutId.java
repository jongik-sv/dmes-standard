package com.dongkuk.dmes.mcm.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Objects;

/**
 * {@link MomFormatLayout} 복합 PK — (FORMAT_ID, FORMAT_VER, ITEM_SEQ).
 *
 * <p>messageSender / TCErrorResendPop 공유 — As-Is TB_MCM_MOM_FORMAT_LAYOUT 의 PK 1:1.
 */
@Embeddable
public class MomFormatLayoutId implements Serializable {

    @Column(name = "FORMAT_ID", length = 50, nullable = false)
    private String formatId;

    @Column(name = "FORMAT_VER", precision = 8, scale = 2, nullable = false)
    private BigDecimal formatVer;

    @Column(name = "ITEM_SEQ", precision = 15, nullable = false)
    private BigDecimal itemSeq;

    protected MomFormatLayoutId() {}

    public MomFormatLayoutId(String formatId, BigDecimal formatVer, BigDecimal itemSeq) {
        this.formatId = formatId;
        this.formatVer = formatVer;
        this.itemSeq = itemSeq;
    }

    public String getFormatId() { return formatId; }
    public BigDecimal getFormatVer() { return formatVer; }
    public BigDecimal getItemSeq() { return itemSeq; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof MomFormatLayoutId that)) return false;
        return Objects.equals(formatId, that.formatId)
                && Objects.equals(formatVer, that.formatVer)
                && Objects.equals(itemSeq, that.itemSeq);
    }

    @Override
    public int hashCode() {
        return Objects.hash(formatId, formatVer, itemSeq);
    }
}
