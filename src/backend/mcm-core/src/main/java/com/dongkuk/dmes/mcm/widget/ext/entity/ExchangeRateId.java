package com.dongkuk.dmes.mcm.widget.ext.entity;

import java.io.Serializable;
import java.util.Objects;

/**
 * {@link ExchangeRate} 복합키 (RATE_DATE, BASE_CUR, QUOTE_CUR).
 *
 * @deprecated 환율 위젯은 MDM 환율 마스터(FX_RATE)를 읽는다. 옛 표 TB_MCM_EXCHANGE_RATE 는 정리 결정 전까지 보존한다.
 */
@Deprecated
public class ExchangeRateId implements Serializable {

    private String rateDate;
    private String baseCur;
    private String quoteCur;

    public ExchangeRateId() {}

    public ExchangeRateId(String rateDate, String baseCur, String quoteCur) {
        this.rateDate = rateDate;
        this.baseCur = baseCur;
        this.quoteCur = quoteCur;
    }

    public String getRateDate() { return rateDate; }
    public void setRateDate(String rateDate) { this.rateDate = rateDate; }
    public String getBaseCur() { return baseCur; }
    public void setBaseCur(String baseCur) { this.baseCur = baseCur; }
    public String getQuoteCur() { return quoteCur; }
    public void setQuoteCur(String quoteCur) { this.quoteCur = quoteCur; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ExchangeRateId that)) return false;
        return Objects.equals(rateDate, that.rateDate) && Objects.equals(baseCur, that.baseCur)
                && Objects.equals(quoteCur, that.quoteCur);
    }

    @Override
    public int hashCode() { return Objects.hash(rateDate, baseCur, quoteCur); }
}
