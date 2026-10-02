package com.dongkuk.dmes.mcm.startpgm.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link SecUserStartPgm} 복합 PK — (USER_ID, FULL_ID, MENU_ID, MENU_SEQ). */
public class SecUserStartPgmId implements Serializable {

    private String userId;
    private String fullId;
    private String menuId;
    private Integer menuSeq;

    public SecUserStartPgmId() {}

    public SecUserStartPgmId(String userId, String fullId, String menuId, Integer menuSeq) {
        this.userId = userId;
        this.fullId = fullId;
        this.menuId = menuId;
        this.menuSeq = menuSeq;
    }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getFullId() { return fullId; }
    public void setFullId(String fullId) { this.fullId = fullId; }
    public String getMenuId() { return menuId; }
    public void setMenuId(String menuId) { this.menuId = menuId; }
    public Integer getMenuSeq() { return menuSeq; }
    public void setMenuSeq(Integer menuSeq) { this.menuSeq = menuSeq; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof SecUserStartPgmId that)) return false;
        return Objects.equals(userId, that.userId)
                && Objects.equals(fullId, that.fullId)
                && Objects.equals(menuId, that.menuId)
                && Objects.equals(menuSeq, that.menuSeq);
    }

    @Override
    public int hashCode() {
        return Objects.hash(userId, fullId, menuId, menuSeq);
    }
}
