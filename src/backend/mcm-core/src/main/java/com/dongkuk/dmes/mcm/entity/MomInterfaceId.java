package com.dongkuk.dmes.mcm.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;

/**
 * MomInterface PK 복합키 — (INTERFACE_ID, TRANSACTION_CODE).
 *
 * <p>인용: 신축 DDL `docs/mcm/002_인터페이스/create_tables_mcmapuser.sql` Line 97
 * (`CONSTRAINT PK_TB_MCM_MOM_INTERFACES PRIMARY KEY (INTERFACE_ID, TRANSACTION_CODE)`).
 * 설계: `docs/mcm/design/interfaceList/interfaceList_분석리포트.md` §7 (16 컬럼 + PK 2).
 */
@Embeddable
public class MomInterfaceId implements Serializable {

    @Column(name = "INTERFACE_ID", length = 50, nullable = false)
    private String interfaceId;

    @Column(name = "TRANSACTION_CODE", length = 50, nullable = false)
    private String transactionCode;

    public MomInterfaceId() {}

    public MomInterfaceId(String interfaceId, String transactionCode) {
        this.interfaceId = interfaceId;
        this.transactionCode = transactionCode;
    }

    public String getInterfaceId() { return interfaceId; }
    public void setInterfaceId(String interfaceId) { this.interfaceId = interfaceId; }

    public String getTransactionCode() { return transactionCode; }
    public void setTransactionCode(String transactionCode) { this.transactionCode = transactionCode; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof MomInterfaceId other)) return false;
        return Objects.equals(interfaceId, other.interfaceId)
                && Objects.equals(transactionCode, other.transactionCode);
    }

    @Override
    public int hashCode() { return Objects.hash(interfaceId, transactionCode); }
}
