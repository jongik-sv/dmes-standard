package com.dongkuk.dmes.mcm.code.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;

@Embeddable
public class SecCodeCategoryId implements Serializable {

    @Column(name = "GROUP_CD", length = 50)
    private String groupCd;

    @Column(name = "CATEGORY_CD", length = 50)
    private String categoryCd;

    public SecCodeCategoryId() {}

    public SecCodeCategoryId(String groupCd, String categoryCd) {
        this.groupCd = groupCd;
        this.categoryCd = categoryCd;
    }

    public String getGroupCd() { return groupCd; }
    public void setGroupCd(String groupCd) { this.groupCd = groupCd; }
    public String getCategoryCd() { return categoryCd; }
    public void setCategoryCd(String categoryCd) { this.categoryCd = categoryCd; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof SecCodeCategoryId other)) return false;
        return Objects.equals(groupCd, other.groupCd) && Objects.equals(categoryCd, other.categoryCd);
    }

    @Override
    public int hashCode() { return Objects.hash(groupCd, categoryCd); }
}
