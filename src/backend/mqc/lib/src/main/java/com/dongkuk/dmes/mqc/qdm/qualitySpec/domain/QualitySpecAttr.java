package com.dongkuk.dmes.mqc.qdm.qualitySpec.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 항목 사전 한 항목. kind = COND(조건) · RESULT(설계결과) · BOTH(공통). useYn = N 이면 파서가 알아보지 않는다. */
@Entity
@Table(name = "TB_MQC_QSPEC_ATTR")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QualitySpecAttr {

    public static final String COND = "COND";
    public static final String RESULT = "RESULT";
    public static final String BOTH = "BOTH";

    @Id
    @Column(name = "ATTR_CD", length = 20)
    private String attrCd;

    @Column(name = "ATTR_NM", nullable = false, length = 50)
    private String attrNm;

    @Column(name = "ATTR_KIND", nullable = false, length = 10)
    private String attrKind;

    @Column(name = "DATA_TYPE", nullable = false, length = 10)
    private String dataType;

    @Column(name = "DATA_LEN", length = 10)
    private String dataLen;

    @Column(name = "UNIT", length = 10)
    private String unit;

    @Column(name = "DESCRIPTION", length = 200)
    private String description;

    @Column(name = "USE_YN", nullable = false, length = 1)
    private String useYn;

    @Column(name = "SEQ", nullable = false)
    private int seq;

    public static QualitySpecAttr of(String attrCd, String attrNm, String kind, String dataType, String dataLen, String unit,
                                     String description, boolean active, int seq) {
        QualitySpecAttr a = new QualitySpecAttr();
        a.attrCd = attrCd; a.attrNm = attrNm; a.attrKind = kind; a.dataType = dataType; a.dataLen = dataLen;
        a.unit = unit; a.description = description; a.useYn = active ? "Y" : "N"; a.seq = seq;
        return a;
    }

    public boolean isActive() { return "Y".equals(useYn); }
}
