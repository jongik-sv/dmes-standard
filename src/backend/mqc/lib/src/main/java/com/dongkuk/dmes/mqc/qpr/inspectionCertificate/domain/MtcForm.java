package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 검사증명서 양식(TB_MQC_MTC_FORM). 본문 = { applied, draft, pending, hist }. APLY_VER·PEND_YN 은 본문에서 뽑은 값이다. */
@Entity
@Table(name = "TB_MQC_MTC_FORM")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MtcForm implements MtcDoc {

    @Id
    @Column(name = "FORM_KEY", length = 10)
    private String formKey;

    @Column(name = "SORT_SEQ", nullable = false)
    private Integer sortSeq;

    @Column(name = "APLY_VER")
    private Integer aplyVer;

    @Column(name = "PEND_YN", nullable = false)
    private Boolean pendYn;

    @Lob
    @Column(name = "BODY_JSON", nullable = false)
    private String bodyJson;

    @Column(name = "UPD_BY", length = 50)
    private String updBy;

    @Column(name = "UPD_AT", nullable = false)
    private LocalDateTime updAt;

    public static MtcForm create(String formKey, int sortSeq) {
        MtcForm f = new MtcForm();
        f.formKey = formKey;
        f.sortSeq = sortSeq;
        return f;
    }

    public void write(String bodyJson, Integer aplyVer, boolean pending, String by, LocalDateTime at) {
        this.bodyJson = bodyJson;
        this.aplyVer = aplyVer;
        this.pendYn = pending;
        this.updBy = by;
        this.updAt = at;
    }

    @Override
    public String docKey() {
        return formKey;
    }
}
