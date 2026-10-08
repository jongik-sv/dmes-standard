package com.dongkuk.dmes.mpn.job;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.job.JobRunDispatcher;
import com.dongkuk.dmes.cactus.oasis.CactusSpringTransactionHandler;
import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.agent.JobAppInfo;
import com.dongkuk.dmes.mcm.job.agent.JobHandlerRegistrar;
import com.dongkuk.dmes.mcm.job.agent.JobRunController;
import com.dongkuk.dmes.mpn.testdb.MpnTestDb;
import com.dongkuk.oasis.provider.SimpleServiceProvider;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.transaction.TransactionHandler;
import java.lang.reflect.Field;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.core.env.Environment;

/**
 * mpn 앱을 실제로 띄워 예약 작업 접수 쪽 조립과 OASIS 트랜잭션 모드를 확인한다. 판정·호출은 MCM 전용이고, 코드 작업 처리기만 있어 JOB 표에는 닿지 않는다.
 *
 * <p>트랜잭션 모드는 {@code cactus.oasis.transactional: true} 로 켠다. 설계 §4.4 는 대상 서비스가 CoreServiceStarter 의 자기 트랜잭션에서 돈다고 전제하므로
 * (jobQuery DML 실패·시간 초과 시 롤백), 꺼져 있으면 NonTransactionHandler 가 붙은 채 트랜잭션 없이 돈다.
 */
@SpringBootTest
class JobAgentWiringTest extends MpnTestDb {

    @Autowired
    ApplicationContext ctx;

    @Autowired
    Environment env;

    @Test
    void 접수_쪽_빈은_있고_판정_호출_빈은_없다() {
        assertEquals("mpn", env.getProperty("dmes.job.module"));
        assertEquals(JobModule.MPN, ctx.getBean(JobAppInfo.class).module());
        assertNotNull(ctx.getBean(JobRunController.class));
        assertNotNull(ctx.getBean(JobRunDispatcher.class));
        assertNotNull(ctx.getBean(JobHandlerRegistrar.class));
        assertTrue(ctx.containsBean("jobCodeService") && ctx.containsBean("jobQueryService") && ctx.containsBean("jobCollectService"));
        assertFalse(ctx.containsBean("jobDispatchService"), "판정 서비스는 MCM 전용");
        assertFalse(ctx.containsBean("jobCaller"), "모듈 호출 풀은 MCM 전용");
        assertFalse(ctx.containsBean("jobDispatchTrigger"), "매분 트리거는 MCM 전용");
    }

    @Test
    void 내장_서비스_BPMN_3개를_이_앱의_서비스_제공자가_찾는다() {
        SimpleServiceProvider provider = new SimpleServiceProvider("/services", "bpmn", "^^");
        for (String id : new String[] {"jobCode", "jobQuery", "jobCollect"}) {
            assertNotNull(provider.service(id), id);
        }
    }

    @Test
    void OASIS_서비스_시작기는_트랜잭션_쪽이다() throws Exception {
        assertEquals("true", env.getProperty("cactus.oasis.transactional"));
        TransactionHandler handler = findTransactionHandler(ctx.getBean(ServiceStarter.class));
        assertInstanceOf(CactusSpringTransactionHandler.class, handler,
                "비트랜잭션 모드면 NonTransactionHandler 가 붙는다 — cactus.oasis.transactional 이 꺼져 있다");
        assertTrue(ctx.containsBean("transactionManager"), "기본 트랜잭션 매니저(transactionManager)가 있어야 서비스 트랜잭션이 열린다");
    }

    /** StopWatch·Spring 래퍼를 풀어 CoreServiceStarter 가 쥔 트랜잭션 핸들러를 찾는다 — 공개 접근자가 없어 필드를 읽는다. */
    private static TransactionHandler findTransactionHandler(Object starter) throws Exception {
        for (Class<?> c = starter.getClass(); c != null && c != Object.class; c = c.getSuperclass()) {
            for (Field f : c.getDeclaredFields()) {
                if (java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
                Class<?> type = f.getType();
                if (!TransactionHandler.class.isAssignableFrom(type) && !ServiceStarter.class.isAssignableFrom(type)) continue;
                f.setAccessible(true);
                Object value = f.get(starter);
                if (value == null) continue;
                if (value instanceof TransactionHandler h) return h;
                TransactionHandler inner = findTransactionHandler(value);
                if (inner != null) return inner;
            }
        }
        return null;
    }
}
