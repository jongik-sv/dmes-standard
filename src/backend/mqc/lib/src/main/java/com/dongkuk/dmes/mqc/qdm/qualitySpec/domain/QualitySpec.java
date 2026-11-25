package com.dongkuk.dmes.mqc.qdm.qualitySpec.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 품질사양 머리(현재 개정). 사양번호 = 고객사-품명+순번. 상태 코드는 {@link SpecStatus}. */
@Entity
@Table(name = "TB_MQC_QSPEC")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QualitySpec {

    @Id
    @Column(name = "SPEC_NO", length = 20)
    private String specNo;

    @Column(name = "REV", nullable = false)
    private int rev;

    @Column(name = "CUS_CD", nullable = false, length = 10)
    private String cusCd;

    @Column(name = "PRD_NM_CD", nullable = false, length = 2)
    private String prdNmCd;

    @Column(name = "RAW_TEXT", nullable = false, length = 1000)
    private String rawText;

    @Column(name = "STATUS", nullable = false, length = 10)
    private String status;

    @Column(name = "FAIL_MSG", length = 200)
    private String failMsg;

    /** 시연용: 값이 있으면 OMS 전송이 늘 이 메시지로 실패한다. */
    @Column(name = "SIM_FAIL_MSG", length = 200)
    private String simFailMsg;

    @Column(name = "REG_USR_NM", nullable = false, length = 50)
    private String regUsrNm;

    @Column(name = "REG_DTTM", nullable = false)
    private LocalDateTime regDttm;

    @Column(name = "MOD_USR_NM", nullable = false, length = 50)
    private String modUsrNm;

    @Column(name = "MOD_DTTM", nullable = false)
    private LocalDateTime modDttm;

    public static QualitySpec create(String specNo, String cusCd, String prdNmCd, String rawText, String user, LocalDateTime at) {
        QualitySpec s = new QualitySpec();
        s.specNo = specNo;
        s.rev = 1;
        s.cusCd = cusCd;
        s.prdNmCd = prdNmCd;
        s.rawText = rawText;
        s.status = SpecStatus.DRAFT;
        s.regUsrNm = user;
        s.regDttm = at;
        s.modUsrNm = user;
        s.modDttm = at;
        return s;
    }

    public void touch(String user, LocalDateTime at) {
        this.modUsrNm = user;
        this.modDttm = at;
    }
}
