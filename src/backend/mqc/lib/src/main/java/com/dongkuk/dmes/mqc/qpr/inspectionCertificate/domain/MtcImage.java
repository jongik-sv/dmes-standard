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

/** 서명·도장 이미지(TB_MQC_MTC_IMG). 키 = 파일 이름. 본문 = { kind: 서명|도장, remark, data: data URL }. IMG_KND = kind. */
@Entity
@Table(name = "TB_MQC_MTC_IMG")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MtcImage implements MtcDoc {

    @Id
    @Column(name = "IMG_NM", length = 200)
    private String imgNm;

    @Column(name = "SORT_SEQ", nullable = false)
    private Integer sortSeq;

    @Column(name = "IMG_KND", length = 10)
    private String imgKnd;

    @Lob
    @Column(name = "BODY_JSON", nullable = false)
    private String bodyJson;

    @Column(name = "UPD_BY", length = 50)
    private String updBy;

    @Column(name = "UPD_AT", nullable = false)
    private LocalDateTime updAt;

    public static MtcImage create(String imgNm, int sortSeq) {
        MtcImage i = new MtcImage();
        i.imgNm = imgNm;
        i.sortSeq = sortSeq;
        return i;
    }

    public void write(String bodyJson, String imgKnd, String by, LocalDateTime at) {
        this.bodyJson = bodyJson;
        this.imgKnd = imgKnd;
        this.updBy = by;
        this.updAt = at;
    }

    @Override
    public String docKey() {
        return imgNm;
    }
}
