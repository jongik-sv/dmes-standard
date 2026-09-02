package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.math.BigDecimal;

/**
 * TB_MCM_MOM_FORMAT_LAYOUT — 인터페이스 메시지 포맷의 항목별 정의.
 *
 * <p>messageSender / TCErrorResendPop 공유 — READ-only 화면이지만 다른 화면 (interfaceFormatLayout 관리)
 * 에서 CUD 가능하므로 AUDIT 9 컬럼 (McmAuditEntity) 상속.
 *
 * <p>PK = (FORMAT_ID, FORMAT_VER, ITEM_SEQ) — 한 포맷 / 한 버전 안에서 항목 순번.
 *
 * <p>ITEM_TP:
 * <ul>
 *   <li>G = 그룹 항목 (DATA_LEN = 반복 횟수, GE 하위 항목 펼치기)</li>
 *   <li>N = 일반 항목 (단일 값)</li>
 * </ul>
 *
 * <p>DATA_TP:
 * <ul>
 *   <li>1 = VARCHAR / 2 = NUMBER / 3 = DATE / 4 = VARCHAR2 / 5 = NUMBER2 / 6 = GROUP</li>
 * </ul>
 *
 * <p>분석 §6.1 #1 / §7 — As-Is TCErrorReSendPopMapper.GetMessageInfo 의 LO 테이블 1:1.
 */
@Entity
@Table(name = "TB_MCM_MOM_FORMAT_LAYOUT")
public class MomFormatLayout extends McmAuditEntity {

    @EmbeddedId
    private MomFormatLayoutId id;

    @Column(name = "ITEM_TP", length = 1)
    private String itemTp;

    @Column(name = "ITEM_ID", length = 50)
    private String itemId;

    @Column(name = "ITEM_NM", length = 100)
    private String itemNm;

    @Column(name = "DATA_TP", length = 1)
    private String dataTp;

    @Column(name = "DATA_LEN", precision = 5)
    private BigDecimal dataLen;

    @Column(name = "DATA_DECIMAL_PREC", precision = 5)
    private BigDecimal dataDecimalPrec;

    public MomFormatLayout() {}

    public MomFormatLayoutId getId() { return id; }
    public void setId(MomFormatLayoutId id) { this.id = id; }

    public String getItemTp() { return itemTp; }
    public void setItemTp(String itemTp) { this.itemTp = itemTp; }

    public String getItemId() { return itemId; }
    public void setItemId(String itemId) { this.itemId = itemId; }

    public String getItemNm() { return itemNm; }
    public void setItemNm(String itemNm) { this.itemNm = itemNm; }

    public String getDataTp() { return dataTp; }
    public void setDataTp(String dataTp) { this.dataTp = dataTp; }

    public BigDecimal getDataLen() { return dataLen; }
    public void setDataLen(BigDecimal dataLen) { this.dataLen = dataLen; }

    public BigDecimal getDataDecimalPrec() { return dataDecimalPrec; }
    public void setDataDecimalPrec(BigDecimal dataDecimalPrec) { this.dataDecimalPrec = dataDecimalPrec; }
}
