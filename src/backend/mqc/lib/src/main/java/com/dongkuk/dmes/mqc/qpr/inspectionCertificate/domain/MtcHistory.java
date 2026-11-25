package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain;

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
 * 검사증명서 처리 이력(TB_MQC_MTC_HIST). 쌓기만 한다.
 * ACT_CD 는 서버가 쓰는 ISSUE·AUTO_ISSUE·REISSUE·RECEIVE·RESET 과 화면이 save 에 보내는 동작 이름(FORM_DRAFT·RULE_SAVE 등)이다.
 */
@Entity
@Table(name = "TB_MQC_MTC_HIST")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MtcHistory {

    public static final String ISSUE = "ISSUE";
    public static final String AUTO_ISSUE = "AUTO_ISSUE";
    public static final String REISSUE = "REISSUE";
    public static final String RECEIVE = "RECEIVE";
    public static final String RESET = "RESET";
    public static final String VERIFY = "VERIFY";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "HIST_NO")
    private Long histNo;

    @Column(name = "DOC_KND", length = 10)
    private String docKnd;

    @Column(name = "DOC_NO", length = 200)
    private String docNo;

    @Column(name = "ACT_CD", nullable = false, length = 30)
    private String actCd;

    @Column(name = "MSG_TXT", length = 1000)
    private String msgTxt;

    @Column(name = "RSN_TXT", length = 500)
    private String rsnTxt;

    /** ISSUE·AUTO_ISSUE = 새 번호, REISSUE = 대체된 이전 번호, VERIFY = 조회한 번호. */
    @Column(name = "VRFY_CD", length = 14)
    private String vrfyCd;

    @Column(name = "ACT_BY", length = 50)
    private String actBy;

    @Column(name = "ACT_AT", nullable = false)
    private LocalDateTime actAt;

    public static MtcHistory of(String docKnd, String docNo, String actCd, String msg, String reason, String vrfyCd, String by,
                                LocalDateTime at) {
        MtcHistory h = new MtcHistory();
        h.docKnd = docKnd;
        h.docNo = docNo;
        h.actCd = actCd;
        h.msgTxt = msg;
        h.rsnTxt = reason;
        h.vrfyCd = vrfyCd;
        h.actBy = by;
        h.actAt = at;
        return h;
    }
}
