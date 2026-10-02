package com.dongkuk.dmes.mcm.widget.ext.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.math.BigDecimal;

/**
 * 일자별 환율 — 스펙 2026-10-02-widget-admin-generic §4.4.
 * RATE 는 대상 통화 1단위의 기준 통화 값(1 USD = 1,380.12 KRW). 제공자가 「1 KRW = n 외화」로 주면 역수로 바꿔 넣는다.
 * CHAR 칸(RATE_DATE·BASE_CUR·QUOTE_CUR)은 다른 위젯 표의 CHAR(1) 처럼 길이만 고정한다(값이 늘 꽉 차 방언 차이가 없다).
 */
@Entity
@Table(name = "TB_MCM_EXCHANGE_RATE", schema = "MCMAPUSER")
@IdClass(ExchangeRateId.class)
public class ExchangeRate extends McmAuditEntity {

    @Id
    @Column(name = "RATE_DATE", length = 8, nullable = false)
    private String rateDate;

    @Id
    @Column(name = "BASE_CUR", length = 3, nullable = false)
    private String baseCur;

    @Id
    @Column(name = "QUOTE_CUR", length = 3, nullable = false)
    private String quoteCur;

    @Column(name = "RATE", precision = 20, scale = 8, nullable = false)
    private BigDecimal rate;

    @Column(name = "SOURCE", length = 20)
    private String source;

    public ExchangeRate() {}

    public String getRateDate() { return rateDate; }
    public void setRateDate(String rateDate) { this.rateDate = rateDate; }
    public String getBaseCur() { return baseCur; }
    public void setBaseCur(String baseCur) { this.baseCur = baseCur; }
    public String getQuoteCur() { return quoteCur; }
    public void setQuoteCur(String quoteCur) { this.quoteCur = quoteCur; }
    public BigDecimal getRate() { return rate; }
    public void setRate(BigDecimal rate) { this.rate = rate; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
}
