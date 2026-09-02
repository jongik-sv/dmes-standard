package com.dongkuk.oasis.audit;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

/**
 * @author Jeongjin Kim
 * @since 2022-03-03
 */
class AuditHolderTest {
    @Test
    void setAndGetAudit() {
        class MyAudit implements Audit {
        }

        MyAudit myAudit = new MyAudit();

        AuditHolder.setAudit(myAudit);

        MyAudit audit = AuditHolder.getAudit();

        Assertions.assertThat(myAudit).isEqualTo(audit);
    }

    @Test
    void setNullAudit() {
        AuditHolder.setAudit(null);

        Audit audit = AuditHolder.getAudit();

        Assertions.assertThat(audit).isNull();
    }

    @Test
    void afterRemoveReturnNull() {
        class MyAudit implements Audit {
        }

        MyAudit myAudit = new MyAudit();

        AuditHolder.setAudit(myAudit);

        AuditHolder.remove();

        Audit audit = AuditHolder.getAudit();

        Assertions.assertThat(audit).isNull();
    }
}