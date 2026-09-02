package com.dongkuk.dmes.mcm.favorite.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link SecUserFavoriteFold} 복합 PK — (USER_ID, FVT_FOLD_ID). */
public class SecUserFavoriteFoldId implements Serializable {

    private String userId;
    private String fvtFoldId;

    public SecUserFavoriteFoldId() {}

    public SecUserFavoriteFoldId(String userId, String fvtFoldId) {
        this.userId = userId;
        this.fvtFoldId = fvtFoldId;
    }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getFvtFoldId() { return fvtFoldId; }
    public void setFvtFoldId(String fvtFoldId) { this.fvtFoldId = fvtFoldId; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof SecUserFavoriteFoldId that)) return false;
        return Objects.equals(userId, that.userId) && Objects.equals(fvtFoldId, that.fvtFoldId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(userId, fvtFoldId);
    }
}
