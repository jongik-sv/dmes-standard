package com.dongkuk.dmes.mcm.screenusage.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link ScreenUsageDay} 복합 PK — (USAGE_DT, PAGE_ID, USER_ID, DEPT_CD). */
public class ScreenUsageDayId implements Serializable {

    private String usageDt;
    private String pageId;
    private String userId;
    private String deptCd;

    public ScreenUsageDayId() {}

    public ScreenUsageDayId(String usageDt, String pageId, String userId, String deptCd) {
        this.usageDt = usageDt;
        this.pageId = pageId;
        this.userId = userId;
        this.deptCd = deptCd;
    }

    public String getUsageDt() { return usageDt; }
    public String getPageId() { return pageId; }
    public String getUserId() { return userId; }
    public String getDeptCd() { return deptCd; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ScreenUsageDayId that)) return false;
        return Objects.equals(usageDt, that.usageDt) && Objects.equals(pageId, that.pageId)
                && Objects.equals(userId, that.userId) && Objects.equals(deptCd, that.deptCd);
    }

    @Override
    public int hashCode() {
        return Objects.hash(usageDt, pageId, userId, deptCd);
    }
}
