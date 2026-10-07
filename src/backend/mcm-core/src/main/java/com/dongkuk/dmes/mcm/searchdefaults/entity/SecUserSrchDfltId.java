package com.dongkuk.dmes.mcm.searchdefaults.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link SecUserSrchDflt} 복합키 (USER_ID, PAGE_ID, FIELD_KEY). */
public class SecUserSrchDfltId implements Serializable {

    private String userId;
    private String pageId;
    private String fieldKey;

    public SecUserSrchDfltId() {}

    public SecUserSrchDfltId(String userId, String pageId, String fieldKey) {
        this.userId = userId;
        this.pageId = pageId;
        this.fieldKey = fieldKey;
    }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getPageId() { return pageId; }
    public void setPageId(String pageId) { this.pageId = pageId; }
    public String getFieldKey() { return fieldKey; }
    public void setFieldKey(String fieldKey) { this.fieldKey = fieldKey; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof SecUserSrchDfltId that)) return false;
        return Objects.equals(userId, that.userId) && Objects.equals(pageId, that.pageId)
                && Objects.equals(fieldKey, that.fieldKey);
    }

    @Override
    public int hashCode() { return Objects.hash(userId, pageId, fieldKey); }
}
