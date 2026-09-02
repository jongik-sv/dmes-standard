package com.dongkuk.dmes.cactus.audit;

import com.dongkuk.oasis.audit.Audit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CactusAuditTest {

    @Test
    @DisplayName("Record 필드 값 검증")
    void fields() {
        CactusAudit audit = new CactusAudit("user01", "MENU001", "ProductService");

        assertEquals("user01", audit.userId());
        assertEquals("MENU001", audit.menuId());
        assertEquals("ProductService", audit.serviceId());
    }

    @Test
    @DisplayName("Audit 인터페이스를 구현한다")
    void implementsAudit() {
        CactusAudit audit = new CactusAudit("u", "m", "s");
        assertInstanceOf(Audit.class, audit);
    }

    @Test
    @DisplayName("null 필드 허용")
    void nullFields() {
        CactusAudit audit = new CactusAudit(null, null, null);

        assertNull(audit.userId());
        assertNull(audit.menuId());
        assertNull(audit.serviceId());
    }
}
