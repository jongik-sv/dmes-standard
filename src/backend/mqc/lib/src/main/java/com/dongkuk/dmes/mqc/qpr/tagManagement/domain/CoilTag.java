package com.dongkuk.dmes.mqc.qpr.tagManagement.domain;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 코일 Tag(TB_MQC_TAG). RISSU_CNT 는 재발행 횟수, RISSU_RSN 은 마지막 재발행 사유 코드(DAMAGE·LOST·CORRECT)다. */
@Entity
@Table(name = "TB_MQC_TAG")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CoilTag extends CactusAuditEntity {

    @Id
    @Column(name = "TAG_NO", length = 20)
    private String tagNo;

    @Enumerated(EnumType.STRING)
    @Column(name = "TAG_KND", nullable = false, length = 10)
    private TagKind tagKnd;

    @Column(name = "COIL_NO", nullable = false, length = 20)
    private String coilNo;

    @Column(name = "PRT_ID", length = 20)
    private String prtId;

    @Enumerated(EnumType.STRING)
    @Column(name = "STAT_CD", nullable = false, length = 10)
    private TagStatus statCd;

    @Column(name = "COPY_CNT", nullable = false)
    private Integer copyCnt;

    @Column(name = "RISSU_CNT", nullable = false)
    private Integer rissuCnt;

    @Column(name = "RISSU_RSN", length = 10)
    private String rissuRsn;

    @Column(name = "ISSUE_BY", length = 50)
    private String issueBy;

    @Column(name = "ISSUE_AT")
    private LocalDateTime issueAt;

    @Column(name = "NOTE", length = 500)
    private String note;

    /** 시험용 생성. */
    public static CoilTag of(String tagNo, TagKind kind, String coilNo, String prtId, TagStatus status) {
        CoilTag t = new CoilTag();
        t.tagNo = tagNo;
        t.tagKnd = kind;
        t.coilNo = coilNo;
        t.prtId = prtId;
        t.statCd = status;
        t.copyCnt = 1;
        t.rissuCnt = 0;
        return t;
    }

    public void issue(String by, LocalDateTime at) {
        this.statCd = TagStatus.ISSUED;
        this.issueBy = by;
        this.issueAt = at;
    }

    public void reissue(String reasonCd, String prtId, int copies, String note, String by, LocalDateTime at) {
        this.statCd = TagStatus.REISSUED;
        this.rissuRsn = reasonCd;
        if (prtId != null) this.prtId = prtId;
        this.copyCnt = copies;
        this.rissuCnt = rissuCnt == null ? 1 : rissuCnt + 1;
        if (note != null) this.note = note;
        this.issueBy = by;
        this.issueAt = at;
    }

    public void discard(String reason) {
        this.statCd = TagStatus.DISCARDED;
        this.note = reason;
    }
}
