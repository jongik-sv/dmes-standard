package com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 품질보증서에 실린 코일(TB_MQC_QLTY_CERT_COIL). */
@Entity
@Table(name = "TB_MQC_QLTY_CERT_COIL")
@IdClass(QualityCertificateCoilId.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QualityCertificateCoil {

    @Id
    @Column(name = "QC_NO", length = 20)
    private String qcNo;

    @Id
    @Column(name = "COIL_NO", length = 20)
    private String coilNo;

    @Column(name = "SEQ", nullable = false)
    private Integer seq;

    public static QualityCertificateCoil of(String qcNo, String coilNo, int seq) {
        QualityCertificateCoil c = new QualityCertificateCoil();
        c.qcNo = qcNo;
        c.coilNo = coilNo;
        c.seq = seq;
        return c;
    }
}
