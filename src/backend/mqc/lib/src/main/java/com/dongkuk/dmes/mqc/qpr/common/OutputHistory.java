package com.dongkuk.dmes.mqc.qpr.common;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 출력물 처리 이력(TB_MQC_OUTPUT_HIST). 품질보증서(QC)·검사증명서(MTC)·Tag(TAG)가 함께 쓴다. 쌓기만 한다.
 * ACT_CD: REQUEST 요청 · ISSUE 발행 · REISSUE 재발행 · CANCEL 회수(보증서)·보류(증명서)·폐기(Tag). 상태 값은 문서 종류의 코드다.
 */
@Entity
@Table(name = "TB_MQC_OUTPUT_HIST")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OutputHistory {

    public static final String QC = "QC";
    public static final String MTC = "MTC";
    public static final String TAG = "TAG";

    public static final String REQUEST = "REQUEST";
    public static final String ISSUE = "ISSUE";
    public static final String REISSUE = "REISSUE";
    public static final String CANCEL = "CANCEL";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "HIST_NO")
    private Long histNo;

    @Column(name = "DOC_TP", nullable = false, length = 5)
    private String docTp;

    @Column(name = "DOC_NO", nullable = false, length = 20)
    private String docNo;

    @Column(name = "DOC_REV")
    private Integer docRev;

    @Column(name = "ACT_CD", nullable = false, length = 10)
    private String actCd;

    @Column(name = "STAT_BEF", length = 10)
    private String statBef;

    @Column(name = "STAT_AFT", length = 10)
    private String statAft;

    @Column(name = "RSN_TXT", length = 500)
    private String rsnTxt;

    @Column(name = "ACT_BY", length = 50)
    private String actBy;

    @Column(name = "ACT_AT", nullable = false)
    private LocalDateTime actAt;

    public static OutputHistory of(String docTp, String docNo, Integer docRev, String actCd, String statBef, String statAft,
                                   String reason, String by, LocalDateTime at) {
        OutputHistory h = new OutputHistory();
        h.docTp = docTp;
        h.docNo = docNo;
        h.docRev = docRev;
        h.actCd = actCd;
        h.statBef = statBef;
        h.statAft = statAft;
        h.rsnTxt = reason;
        h.actBy = by;
        h.actAt = at;
        return h;
    }
}
