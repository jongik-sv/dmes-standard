package com.dongkuk.dmes.mqc.qpr.tagManagement.domain;

import java.io.Serializable;
import java.util.Objects;

/** TB_MQC_TAG_VER 복합 키(DOC_ID, DOC_VER). */
public class TagVersionId implements Serializable {
    private String docId;
    private Integer docVer;

    public TagVersionId() {
    }

    public TagVersionId(String docId, Integer docVer) {
        this.docId = docId;
        this.docVer = docVer;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof TagVersionId other && Objects.equals(docId, other.docId) && Objects.equals(docVer, other.docVer);
    }

    @Override
    public int hashCode() {
        return Objects.hash(docId, docVer);
    }
}
