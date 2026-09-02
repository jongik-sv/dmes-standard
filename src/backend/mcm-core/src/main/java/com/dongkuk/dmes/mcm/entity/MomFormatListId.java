package com.dongkuk.dmes.mcm.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Objects;

/**
 * MomFormatList PK 복합키 — (FORMAT_ID, FORMAT_VER).
 *
 * <p>인용: 신축 DDL `docs/mcm/002_인터페이스/create_tables_mcmapuser.sql` Line 34
 * (`CONSTRAINT PK_TB_MCM_MOM_FORMAT_LIST PRIMARY KEY (FORMAT_ID, FORMAT_VER)`).
 * FORMAT_VER = NUMERIC(8,2) → Java BigDecimal.
 *
 * <p>Q-012 결정: cia/InterfaceList 화면은 버전 1 고정 (mui As-Is 1:1 유지).
 * 다중 버전 관리는 cib/InterfaceFormatList 화면에서.
 */
@Embeddable
public class MomFormatListId implements Serializable {

    @Column(name = "FORMAT_ID", length = 50, nullable = false)
    private String formatId;

    @Column(name = "FORMAT_VER", precision = 8, scale = 2, nullable = false)
    private BigDecimal formatVer;

    public MomFormatListId() {}

    public MomFormatListId(String formatId, BigDecimal formatVer) {
        this.formatId = formatId;
        this.formatVer = formatVer;
    }

    public String getFormatId() { return formatId; }
    public void setFormatId(String formatId) { this.formatId = formatId; }

    public BigDecimal getFormatVer() { return formatVer; }
    public void setFormatVer(BigDecimal formatVer) { this.formatVer = formatVer; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof MomFormatListId other)) return false;
        return Objects.equals(formatId, other.formatId)
                && Objects.equals(formatVer, other.formatVer);
    }

    @Override
    public int hashCode() { return Objects.hash(formatId, formatVer); }
}
