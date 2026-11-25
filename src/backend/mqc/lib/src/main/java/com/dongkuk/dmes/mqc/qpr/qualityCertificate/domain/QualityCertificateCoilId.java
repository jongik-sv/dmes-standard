package com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain;

import java.io.Serializable;
import java.util.Objects;

/** TB_MQC_QLTY_CERT_COIL 복합 키(QC_NO, COIL_NO). */
public class QualityCertificateCoilId implements Serializable {
    private String qcNo;
    private String coilNo;

    public QualityCertificateCoilId() {
    }

    public QualityCertificateCoilId(String qcNo, String coilNo) {
        this.qcNo = qcNo;
        this.coilNo = coilNo;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof QualityCertificateCoilId other && Objects.equals(qcNo, other.qcNo) && Objects.equals(coilNo, other.coilNo);
    }

    @Override
    public int hashCode() {
        return Objects.hash(qcNo, coilNo);
    }
}
