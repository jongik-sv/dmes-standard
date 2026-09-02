package com.dongkuk.dmes.mcm.code.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;

@Embeddable
public class SecCodeItemId implements Serializable {

    @Column(name = "GROUP_CD", length = 50)
    private String groupCd;

    @Column(name = "ITEM_CD", length = 50)
    private String itemCd;

    public SecCodeItemId() {}

    public SecCodeItemId(String groupCd, String itemCd) {
        this.groupCd = groupCd;
        this.itemCd = itemCd;
    }

    public String getGroupCd() { return groupCd; }
    public void setGroupCd(String groupCd) { this.groupCd = groupCd; }
    public String getItemCd() { return itemCd; }
    public void setItemCd(String itemCd) { this.itemCd = itemCd; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof SecCodeItemId other)) return false;
        return Objects.equals(groupCd, other.groupCd) && Objects.equals(itemCd, other.itemCd);
    }

    @Override
    public int hashCode() { return Objects.hash(groupCd, itemCd); }
}
