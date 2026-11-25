package com.dongkuk.dmes.mqc.qdm.qualitySpec.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 고객 — 시연에서는 가명(수요가 A~E)으로 보인다. */
@Entity
@Table(name = "TB_MQC_QSPEC_CUS")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QualitySpecCustomer {

    @Id
    @Column(name = "CUS_CD", length = 10)
    private String cusCd;

    @Column(name = "CUS_NM", nullable = false, length = 50)
    private String cusNm;

    @Column(name = "SEQ", nullable = false)
    private int seq;

    public static QualitySpecCustomer of(String cusCd, String cusNm, int seq) {
        QualitySpecCustomer c = new QualitySpecCustomer();
        c.cusCd = cusCd; c.cusNm = cusNm; c.seq = seq;
        return c;
    }
}
