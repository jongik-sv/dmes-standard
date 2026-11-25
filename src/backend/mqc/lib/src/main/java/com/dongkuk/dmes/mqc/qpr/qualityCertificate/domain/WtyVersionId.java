package com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain;

import java.io.Serializable;
import java.util.Objects;

/** TB_MQC_WTY_VER 복합 키(DOC_ID, DOC_VER). */
public class WtyVersionId implements Serializable {
    private String docId;
    private Integer docVer;

    public WtyVersionId() {
    }

    public WtyVersionId(String docId, Integer docVer) {
        this.docId = docId;
        this.docVer = docVer;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof WtyVersionId other && Objects.equals(docId, other.docId) && Objects.equals(docVer, other.docVer);
    }

    @Override
    public int hashCode() {
        return Objects.hash(docId, docVer);
    }
}
