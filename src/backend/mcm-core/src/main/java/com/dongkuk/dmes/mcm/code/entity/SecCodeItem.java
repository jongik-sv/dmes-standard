package com.dongkuk.dmes.mcm.code.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.*;

@Entity
@Table(name = "TB_SEC_CODE_ITEM")
public class SecCodeItem extends McmAuditEntity {

    @EmbeddedId
    private SecCodeItemId id;

    @Column(name = "ITEM_NM", length = 200)
    private String itemNm;

    @Column(name = "ITEM_DESC", length = 500)
    private String itemDesc;

    @Column(name = "SORT_ORD")
    private Integer sortOrd;

    @Column(name = "EXTRA_VAL1", length = 200)
    private String extraVal1;

    @Column(name = "EXTRA_VAL2", length = 200)
    private String extraVal2;

    @Column(name = "USE_YN", length = 1)
    private String useYn;

    public SecCodeItemId getId() { return id; }
    public void setId(SecCodeItemId id) { this.id = id; }
    public String getItemNm() { return itemNm; }
    public void setItemNm(String itemNm) { this.itemNm = itemNm; }
    public String getItemDesc() { return itemDesc; }
    public void setItemDesc(String itemDesc) { this.itemDesc = itemDesc; }
    public Integer getSortOrd() { return sortOrd; }
    public void setSortOrd(Integer sortOrd) { this.sortOrd = sortOrd; }
    public String getExtraVal1() { return extraVal1; }
    public void setExtraVal1(String extraVal1) { this.extraVal1 = extraVal1; }
    public String getExtraVal2() { return extraVal2; }
    public void setExtraVal2(String extraVal2) { this.extraVal2 = extraVal2; }
    public String getUseYn() { return useYn; }
    public void setUseYn(String useYn) { this.useYn = useYn; }
}
