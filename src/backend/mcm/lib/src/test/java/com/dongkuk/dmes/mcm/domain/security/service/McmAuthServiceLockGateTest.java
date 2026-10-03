package com.dongkuk.dmes.mcm.domain.security.service;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;

/** 로그인 쓰기 잠금은 로컬 SQLite 전용 — 운영 방언(Oracle·PostgreSQL, isSqlite=false)에서는 아무 문장도 내지 않는다. */
class McmAuthServiceLockGateTest {

    @Test
    void SQLite_가_아니면_잠금_문을_내지_않는다() {
        McmAuditStatementInspector.setSqlite(false);
        EntityManager em = mock(EntityManager.class);
        McmAuthService.lockForWriteIfSqlite(em);
        verifyNoInteractions(em);
    }
}
