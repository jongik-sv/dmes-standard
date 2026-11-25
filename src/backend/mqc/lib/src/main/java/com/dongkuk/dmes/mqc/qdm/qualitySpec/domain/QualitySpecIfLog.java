package com.dongkuk.dmes.mqc.qdm.qualitySpec.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 전송 이력(I/F) 한 건. direction = MES_OMS · OMS_MES, ifResult = OK · FAIL. */
@Entity
@Table(name = "TB_MQC_QSPEC_IF")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QualitySpecIfLog {

    public static final String MES_OMS = "MES_OMS";
    public static final String OMS_MES = "OMS_MES";
    public static final String OK = "OK";
    public static final String FAIL = "FAIL";

    @Id
    @Column(name = "IF_NO", length = 20)
    private String ifNo;

    @Column(name = "DIRECTION", nullable = false, length = 10)
    private String direction;

    @Column(name = "TARGET", nullable = false, length = 40)
    private String target;

    @Column(name = "SPEC_NO", length = 20)
    private String specNo;

    @Column(name = "REV")
    private Integer rev;

    @Column(name = "ORD_NO", length = 20)
    private String ordNo;

    @Column(name = "IF_RESULT", nullable = false, length = 4)
    private String ifResult;

    @Column(name = "MSG", nullable = false, length = 200)
    private String msg;

    @Column(name = "ELAPSED_MS", nullable = false)
    private int elapsedMs;

    @Lob
    @Column(name = "PAYLOAD")
    private String payload;

    @Column(name = "IF_DTTM", nullable = false)
    private LocalDateTime ifDttm;

    public static QualitySpecIfLog of(String ifNo, String direction, String target, String specNo, Integer rev, String ordNo,
                                      String ifResult, String msg, int elapsedMs, String payload, LocalDateTime ifDttm) {
        QualitySpecIfLog l = new QualitySpecIfLog();
        l.ifNo = ifNo; l.direction = direction; l.target = target; l.specNo = specNo; l.rev = rev; l.ordNo = ordNo;
        l.ifResult = ifResult; l.msg = msg; l.elapsedMs = elapsedMs; l.payload = payload; l.ifDttm = ifDttm;
        return l;
    }
}
