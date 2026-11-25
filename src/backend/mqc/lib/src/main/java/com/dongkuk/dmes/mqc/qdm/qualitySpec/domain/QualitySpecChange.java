package com.dongkuk.dmes.mqc.qdm.qualitySpec.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 변경 이력 한 건. action 은 {@link ChangeAction}, changesJson = [{"item","before","after"}]. */
@Entity
@Table(name = "TB_MQC_QSPEC_CHG")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QualitySpecChange {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "CHG_ID")
    private Long chgId;

    @Column(name = "SPEC_NO", nullable = false, length = 20)
    private String specNo;

    @Column(name = "REV", nullable = false)
    private int rev;

    @Column(name = "ACTION_CD", nullable = false, length = 10)
    private String actionCd;

    @Lob
    @Column(name = "CHANGES_JSON", nullable = false)
    private String changesJson;

    @Column(name = "WORKER_NM", nullable = false, length = 50)
    private String workerNm;

    @Column(name = "CHG_DTTM", nullable = false)
    private LocalDateTime chgDttm;

    public static QualitySpecChange of(String specNo, int rev, String actionCd, String changesJson, String workerNm, LocalDateTime chgDttm) {
        QualitySpecChange c = new QualitySpecChange();
        c.specNo = specNo; c.rev = rev; c.actionCd = actionCd; c.changesJson = changesJson; c.workerNm = workerNm; c.chgDttm = chgDttm;
        return c;
    }

    /** 시험용 메모리 저장소가 번호를 매길 때 쓴다(JPA 는 IDENTITY 가 매긴다). */
    public void assignId(long id) { this.chgId = id; }
}
