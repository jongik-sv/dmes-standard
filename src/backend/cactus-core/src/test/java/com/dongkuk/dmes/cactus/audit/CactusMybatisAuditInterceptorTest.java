package com.dongkuk.dmes.cactus.audit;

import com.dongkuk.oasis.audit.AuditHolder;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.mapping.SqlCommandType;
import org.apache.ibatis.plugin.Invocation;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CactusMybatisAuditInterceptorTest {

    private final CactusMybatisAuditInterceptor interceptor = new CactusMybatisAuditInterceptor();

    @BeforeEach
    void setUp() {
        AuditHolder.setAudit(new CactusAudit("user01", "MENU001", "ProductService"));
    }

    @AfterEach
    void tearDown() {
        AuditHolder.remove();
    }

    @Test
    @DisplayName("INSERT - Map 파라미터에 생성/수정 감사 컬럼 8개 주입")
    void insert_injectsAllAuditColumns() throws Throwable {
        Map<String, Object> param = new HashMap<>();
        param.put("productId", "P001");
        Invocation invocation = createInvocation(SqlCommandType.INSERT, param);

        Instant before = Instant.now();
        interceptor.intercept(invocation);
        Instant after = Instant.now();

        // 생성 컬럼
        assertEquals("user01", param.get("cUsrId"));
        assertEquals("ProductService", param.get("cSvcId"));
        assertEquals("MENU001", param.get("cPgmId"));
        Instant cAt = (Instant) param.get("cAt");
        assertNotNull(cAt);
        assertFalse(cAt.isBefore(before));
        assertFalse(cAt.isAfter(after));

        // 수정 컬럼
        assertEquals("user01", param.get("uUsrId"));
        assertEquals("ProductService", param.get("uSvcId"));
        assertEquals("MENU001", param.get("uPgmId"));
        assertNotNull(param.get("uAt"));
    }

    @Test
    @DisplayName("UPDATE - Map 파라미터에 수정 감사 컬럼만 주입 (생성 컬럼 미주입)")
    void update_injectsOnlyUpdateColumns() throws Throwable {
        Map<String, Object> param = new HashMap<>();
        param.put("productId", "P001");
        Invocation invocation = createInvocation(SqlCommandType.UPDATE, param);

        interceptor.intercept(invocation);

        // 생성 컬럼 없음
        assertNull(param.get("cUsrId"));
        assertNull(param.get("cAt"));
        assertNull(param.get("cSvcId"));
        assertNull(param.get("cPgmId"));

        // 수정 컬럼 있음
        assertEquals("user01", param.get("uUsrId"));
        assertEquals("ProductService", param.get("uSvcId"));
        assertEquals("MENU001", param.get("uPgmId"));
        assertNotNull(param.get("uAt"));
    }

    @Test
    @DisplayName("SELECT - Map 파라미터에 아무것도 주입하지 않음")
    void select_noInjection() throws Throwable {
        Map<String, Object> param = new HashMap<>();
        Invocation invocation = createInvocation(SqlCommandType.SELECT, param);

        interceptor.intercept(invocation);

        assertFalse(param.containsKey("cUsrId"));
        assertFalse(param.containsKey("uUsrId"));
    }

    @Test
    @DisplayName("비-Map 파라미터 - 예외 없이 통과")
    void nonMapParam_passesThrough() throws Throwable {
        String param = "non-map-param";
        Invocation invocation = createInvocation(SqlCommandType.INSERT, param);

        assertDoesNotThrow(() -> interceptor.intercept(invocation));
    }

    @Test
    @DisplayName("AuditHolder가 비어있으면 null 값으로 주입")
    void noAudit_injectsNulls() throws Throwable {
        AuditHolder.remove();
        Map<String, Object> param = new HashMap<>();
        Invocation invocation = createInvocation(SqlCommandType.INSERT, param);

        interceptor.intercept(invocation);

        assertNull(param.get("cUsrId"));
        assertNull(param.get("cSvcId"));
        assertNull(param.get("cPgmId"));
        assertNotNull(param.get("cAt")); // 시간은 항상 주입
        assertNull(param.get("uUsrId"));
        assertNull(param.get("uSvcId"));
        assertNull(param.get("uPgmId"));
        assertNotNull(param.get("uAt"));
    }

    private Invocation createInvocation(SqlCommandType commandType, Object param) {
        MappedStatement ms = mock(MappedStatement.class);
        when(ms.getSqlCommandType()).thenReturn(commandType);

        Executor executor = mock(Executor.class);
        try {
            return new Invocation(
                    executor,
                    Executor.class.getMethod("update", MappedStatement.class, Object.class),
                    new Object[]{ms, param});
        } catch (NoSuchMethodException e) {
            throw new IllegalStateException(e);
        }
    }
}
