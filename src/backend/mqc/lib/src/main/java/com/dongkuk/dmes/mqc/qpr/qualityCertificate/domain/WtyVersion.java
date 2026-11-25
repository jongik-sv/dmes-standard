package com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 품질보증서 승인 버전 기록(TB_MQC_WTY_VER). INIT 이 v1 을, 승인마다 1행을 쌓는다. BODY_JSON = 그 버전의 적용본. */
@Entity
@Table(name = "TB_MQC_WTY_VER")
@IdClass(WtyVersionId.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WtyVersion {

    @Id
    @Column(name = "DOC_ID", length = 20)
    private String docId;

    @Id
    @Column(name = "DOC_VER")
    private Integer docVer;

    @Lob
    @Column(name = "BODY_JSON", nullable = false)
    private String bodyJson;

    @Column(name = "MEMO_TXT", length = 1000)
    private String memoTxt;

    @Column(name = "APRV_BY", length = 50)
    private String aprvBy;

    @Column(name = "APRV_AT", nullable = false)
    private LocalDateTime aprvAt;

    public static WtyVersion of(String docId, int docVer, String body, String memo, String by, LocalDateTime at) {
        WtyVersion v = new WtyVersion();
        v.docId = docId;
        v.docVer = docVer;
        v.bodyJson = body;
        v.memoTxt = memo;
        v.aprvBy = by;
        v.aprvAt = at;
        return v;
    }
}
