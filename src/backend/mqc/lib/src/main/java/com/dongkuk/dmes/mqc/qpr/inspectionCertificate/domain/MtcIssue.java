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

/**
 * 검사증명서 발행본(TB_MQC_MTC_ISSUE). 증명서마다 한 행. ISSUE_NO 는 첫 발행 순번이고 재발행해도 그대로다.
 * 재발행은 SNAP_JSON(발행 순간 계산 결과)을 바꾸고 RISSU_CNT 를 올린다. VRFY_CD·DOC_HASH 는 위변조방지(목업 수준) 값이다.
 */
@Entity
@Table(name = "TB_MQC_MTC_ISSUE")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MtcIssue {

    @Id
    @Column(name = "CERT_ID", length = 20)
    private String certId;

    @Column(name = "ISSUE_NO", nullable = false)
    private Integer issueNo;

    @Column(name = "MTC_NO", length = 30)
    private String mtcNo;

    @Column(name = "RISSU_CNT", nullable = false)
    private Integer rissuCnt;

    @Column(name = "RISSU_RSN", length = 500)
    private String rissuRsn;

    @Column(name = "VRFY_CD", nullable = false, length = 14)
    private String vrfyCd;

    @Column(name = "DOC_HASH", nullable = false, length = 64)
    private String docHash;

    @Lob
    @Column(name = "SNAP_JSON", nullable = false)
    private String snapJson;

    @Column(name = "ISSUE_BY", length = 50)
    private String issueBy;

    @Column(name = "ISSUE_AT", nullable = false)
    private LocalDateTime issueAt;

    public static MtcIssue of(String certId, int issueNo, String mtcNo, int rissuCnt, String reason, String vrfyCd, String docHash,
                              String snapJson, String by, LocalDateTime at) {
        MtcIssue i = new MtcIssue();
        i.certId = certId;
        i.issueNo = issueNo;
        i.mtcNo = mtcNo;
        i.rissuCnt = rissuCnt;
        i.rissuRsn = reason;
        i.vrfyCd = vrfyCd;
        i.docHash = docHash;
        i.snapJson = snapJson;
        i.issueBy = by;
        i.issueAt = at;
        return i;
    }

    /** 재발행 — 횟수를 올린 뒤 그 횟수로 만든 진위 확인 번호를 넣는다(호출하는 쪽이 nextRissuCnt 로 번호를 먼저 만든다). */
    public void reissue(String snapJson, String mtcNo, String reason, String vrfyCd, String docHash, String by, LocalDateTime at) {
        this.snapJson = snapJson;
        if (mtcNo != null) this.mtcNo = mtcNo;
        this.rissuCnt = nextRissuCnt();
        this.rissuRsn = reason;
        this.vrfyCd = vrfyCd;
        this.docHash = docHash;
        this.issueBy = by;
        this.issueAt = at;
    }

    public int nextRissuCnt() {
        return rissuCnt == null ? 1 : rissuCnt + 1;
    }
}
