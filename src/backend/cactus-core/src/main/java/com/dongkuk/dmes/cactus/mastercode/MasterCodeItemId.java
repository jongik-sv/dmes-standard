package com.dongkuk.dmes.cactus.mastercode;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;

/**
 * {@link MasterCodeItemEntity} 의 복합 PK (GROUP_CD + ITEM_CD).
 */
@Embeddable
public class MasterCodeItemId implements Serializable {

    @Column(name = "GROUP_CD", length = 50)
    private String groupCd;

    @Column(name = "ITEM_CD", length = 50)
    private String itemCd;

    public MasterCodeItemId() {}

    public MasterCodeItemId(String groupCd, String itemCd) {
        this.groupCd = groupCd;
        this.itemCd = itemCd;
    }

    public String getGroupCd() { return groupCd; }
    public String getItemCd() { return itemCd; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof MasterCodeItemId other)) return false;
        return Objects.equals(groupCd, other.groupCd) && Objects.equals(itemCd, other.itemCd);
    }

    @Override
    public int hashCode() {
        return Objects.hash(groupCd, itemCd);
    }
}
