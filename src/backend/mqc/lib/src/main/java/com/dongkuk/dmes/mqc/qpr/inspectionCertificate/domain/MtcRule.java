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
 * 검사증명서 예외 규칙(TB_MQC_MTC_RULE). 본문 = 목업 규칙 객체 { id, code, grp, name, where, cond, tgt, val, prio, st, ver, draft }.
 * RULE_CD·RULE_NM·STAT_CD·PRIO 는 본문에서 뽑은 값이다. SORT_SEQ(목록 순서)는 처음 저장할 때 정하고 바꾸지 않는다.
 */
@Entity
@Table(name = "TB_MQC_MTC_RULE")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MtcRule implements MtcDoc {

    @Id
    @Column(name = "RULE_ID", length = 20)
    private String ruleId;

    @Column(name = "SORT_SEQ", nullable = false)
    private Integer sortSeq;

    @Column(name = "RULE_CD", length = 30)
    private String ruleCd;

    @Column(name = "RULE_NM", length = 200)
    private String ruleNm;

    @Column(name = "STAT_CD", length = 20)
    private String statCd;

    @Column(name = "PRIO")
    private Integer prio;

    @Lob
    @Column(name = "BODY_JSON", nullable = false)
    private String bodyJson;

    @Column(name = "UPD_BY", length = 50)
    private String updBy;

    @Column(name = "UPD_AT", nullable = false)
    private LocalDateTime updAt;

    public static MtcRule create(String ruleId, int sortSeq) {
        MtcRule r = new MtcRule();
        r.ruleId = ruleId;
        r.sortSeq = sortSeq;
        return r;
    }

    public void write(String bodyJson, String ruleCd, String ruleNm, String statCd, Integer prio, String by, LocalDateTime at) {
        this.bodyJson = bodyJson;
        this.ruleCd = ruleCd;
        this.ruleNm = ruleNm;
        this.statCd = statCd;
        this.prio = prio;
        this.updBy = by;
        this.updAt = at;
    }

    @Override
    public String docKey() {
        return ruleId;
    }
}
