package com.dongkuk.dmes.mcm.code.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.*;

@Entity
@Table(name = "TB_SEC_CODE_GROUP")
public class SecCodeGroup extends McmAuditEntity {

    @Id @Column(name = "GROUP_CD", length = 50)
    private String groupCd;

    @Column(name = "GROUP_NM", length = 200)
    private String groupNm;

    @Column(name = "GROUP_DESC", length = 500)
    private String groupDesc;

    @Column(name = "USE_YN", length = 1)
    private String useYn;

    public String getGroupCd() { return groupCd; }
    public void setGroupCd(String groupCd) { this.groupCd = groupCd; }
    public String getGroupNm() { return groupNm; }
    public void setGroupNm(String groupNm) { this.groupNm = groupNm; }
    public String getGroupDesc() { return groupDesc; }
    public void setGroupDesc(String groupDesc) { this.groupDesc = groupDesc; }
    public String getUseYn() { return useYn; }
    public void setUseYn(String useYn) { this.useYn = useYn; }
}
