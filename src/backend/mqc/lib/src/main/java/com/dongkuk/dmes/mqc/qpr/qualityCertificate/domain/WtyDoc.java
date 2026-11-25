package com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 품질보증서 문서(TB_MQC_WTY_DOC). 문서는 하나다(DOC_ID = MAIN). 본문은 화면 상태 객체를 그대로 담은 불투명한 JSON 이다.
 * BODY_JSON = 지금 본문, BASE_JSON = 승인된 적용본(비교 기준). STAT_CD = APPLIED · DRAFT · PENDING.
 */
@Entity
@Table(name = "TB_MQC_WTY_DOC")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WtyDoc {

    public static final String MAIN = "MAIN";
    public static final String APPLIED = "APPLIED";
    public static final String DRAFT = "DRAFT";
    public static final String PENDING = "PENDING";

    @Id
    @Column(name = "DOC_ID", length = 20)
    private String docId;

    @Column(name = "DOC_VER", nullable = false)
    private Integer docVer;

    @Column(name = "STAT_CD", nullable = false, length = 10)
    private String statCd;

    @Lob
    @Column(name = "BODY_JSON", nullable = false)
    private String bodyJson;

    @Lob
    @Column(name = "BASE_JSON", nullable = false)
    private String baseJson;

    @Column(name = "UPD_BY", length = 50)
    private String updBy;

    @Column(name = "UPD_AT", nullable = false)
    private LocalDateTime updAt;

    /** 첫 문서(v1, 적용본 = 본문). */
    public static WtyDoc init(String docId, String body, String by, LocalDateTime at) {
        WtyDoc d = new WtyDoc();
        d.docId = docId;
        d.docVer = 1;
        d.statCd = APPLIED;
        d.bodyJson = body;
        d.baseJson = body;
        d.updBy = by;
        d.updAt = at;
        return d;
    }

    public void write(String body, String state, String by, LocalDateTime at) {
        this.bodyJson = body;
        this.statCd = state;
        this.updBy = by;
        this.updAt = at;
    }

    /** 승인 — 버전을 올리고 적용본을 지금 본문으로 바꾼다. */
    public void approve(String by, LocalDateTime at) {
        this.docVer = docVer + 1;
        this.baseJson = bodyJson;
        this.statCd = APPLIED;
        this.updBy = by;
        this.updAt = at;
    }

    public boolean isPending() {
        return PENDING.equals(statCd);
    }
}
