package com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain;

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
 * 품질보증서 처리 이력(TB_MQC_WTY_HIST). ACT_CD = INIT · DRAFT · REQUEST · UNREQUEST · DISCARD · APPROVE · RESET.
 * DRAFT·REQUEST 는 같은 사용자가 1분 안에 되풀이하면 새 행 대신 직전 행의 시각·메시지를 바꾼다(touch).
 */
@Entity
@Table(name = "TB_MQC_WTY_HIST")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WtyHistory {

    public static final String INIT = "INIT";
    public static final String DRAFT = "DRAFT";
    public static final String REQUEST = "REQUEST";
    public static final String UNREQUEST = "UNREQUEST";
    public static final String DISCARD = "DISCARD";
    public static final String APPROVE = "APPROVE";
    public static final String RESET = "RESET";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "HIST_NO")
    private Long histNo;

    @Column(name = "DOC_ID", length = 20)
    private String docId;

    @Column(name = "ACT_CD", nullable = false, length = 10)
    private String actCd;

    @Column(name = "MSG_TXT", length = 1000)
    private String msgTxt;

    @Column(name = "ACT_BY", length = 50)
    private String actBy;

    @Column(name = "ACT_AT", nullable = false)
    private LocalDateTime actAt;

    public static WtyHistory of(String docId, String actCd, String msg, String by, LocalDateTime at) {
        WtyHistory h = new WtyHistory();
        h.docId = docId;
        h.actCd = actCd;
        h.msgTxt = msg;
        h.actBy = by;
        h.actAt = at;
        return h;
    }

    /** 되풀이 저장을 한 행으로 모은다 — 시각과 메시지만 새 값으로 바꾼다. */
    public void touch(String msg, LocalDateTime at) {
        this.msgTxt = msg;
        this.actAt = at;
    }
}
