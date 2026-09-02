package com.dongkuk.dmes.cactus.audit;

import com.dongkuk.oasis.audit.AuditHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CactusAuditListenerTest {

    private final CactusAuditListener listener = new CactusAuditListener();

    @AfterEach
    void tearDown() {
        AuditHolder.remove();
    }

    @Test
    @DisplayName("PrePersist - 감사 정보가 있을 때 생성/수정 컬럼 모두 세팅")
    void prePersist_withAudit() {
        AuditHolder.setAudit(new CactusAudit("user01", "MENU001", "ProductService"));
        TestEntity entity = new TestEntity();

        listener.onPrePersist(entity);

        assertEquals("user01", entity.getCreatedBy());
        assertEquals("user01", entity.getUpdatedBy());
        assertEquals("ProductService", entity.getCreatedSvcId());
        assertEquals("ProductService", entity.getUpdatedSvcId());
        assertEquals("MENU001", entity.getCreatedPgmId());
        assertEquals("MENU001", entity.getUpdatedPgmId());
        assertNotNull(entity.getCreatedAt());
        assertNotNull(entity.getUpdatedAt());
        assertEquals(entity.getCreatedAt(), entity.getUpdatedAt());
        assertEquals(0L, entity.getVersion());
    }

    @Test
    @DisplayName("PrePersist - 감사 정보가 없을 때 시간과 버전만 세팅")
    void prePersist_withoutAudit() {
        TestEntity entity = new TestEntity();

        listener.onPrePersist(entity);

        assertNull(entity.getCreatedBy());
        assertNull(entity.getUpdatedBy());
        assertNotNull(entity.getCreatedAt());
        assertNotNull(entity.getUpdatedAt());
        assertEquals(0L, entity.getVersion());
    }

    @Test
    @DisplayName("PreUpdate - 수정 컬럼만 갱신, 생성 컬럼 유지")
    void preUpdate_withAudit() {
        // 먼저 생성
        AuditHolder.setAudit(new CactusAudit("creator", "MENU001", "CreateService"));
        TestEntity entity = new TestEntity();
        listener.onPrePersist(entity);

        // 수정자 변경
        AuditHolder.setAudit(new CactusAudit("updater", "MENU002", "UpdateService"));
        listener.onPreUpdate(entity);

        // 생성 컬럼은 유지
        assertEquals("creator", entity.getCreatedBy());
        assertEquals("CreateService", entity.getCreatedSvcId());
        assertEquals("MENU001", entity.getCreatedPgmId());

        // 수정 컬럼은 갱신
        assertEquals("updater", entity.getUpdatedBy());
        assertEquals("UpdateService", entity.getUpdatedSvcId());
        assertEquals("MENU002", entity.getUpdatedPgmId());
        assertEquals(1L, entity.getVersion());
    }

    @Test
    @DisplayName("PreUpdate - 버전이 null이면 0으로 초기화")
    void preUpdate_nullVersion() {
        TestEntity entity = new TestEntity();

        listener.onPreUpdate(entity);

        assertEquals(0L, entity.getVersion());
    }

    @Test
    @DisplayName("PreUpdate - 버전이 연속 증가")
    void preUpdate_versionIncrement() {
        TestEntity entity = new TestEntity();
        listener.onPrePersist(entity);
        assertEquals(0L, entity.getVersion());

        listener.onPreUpdate(entity);
        assertEquals(1L, entity.getVersion());

        listener.onPreUpdate(entity);
        assertEquals(2L, entity.getVersion());
    }

    /** 테스트용 구체 클래스 */
    static class TestEntity extends CactusAuditEntity {
    }
}
