package com.dongkuk.dmes.mqc.qdm.qualitySpec.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 표준 설계 기준값 — 맞는 사양이 없을 때 쓰는 설계결과 기본값. */
@Entity
@Table(name = "TB_MQC_QSPEC_BASE")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QualitySpecBase {

    @Id
    @Column(name = "ATTR_CD", length = 20)
    private String attrCd;

    @Column(name = "BASE_VAL", nullable = false, length = 100)
    private String baseVal;

    @Column(name = "REMARK", length = 200)
    private String remark;

    @Column(name = "SEQ", nullable = false)
    private int seq;

    public static QualitySpecBase of(String attrCd, String baseVal, String remark, int seq) {
        QualitySpecBase b = new QualitySpecBase();
        b.attrCd = attrCd; b.baseVal = baseVal; b.remark = remark; b.seq = seq;
        return b;
    }
}
