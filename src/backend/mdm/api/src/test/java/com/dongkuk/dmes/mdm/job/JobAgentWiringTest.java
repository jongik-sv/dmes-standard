package com.dongkuk.dmes.mdm.job;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.job.JobRunDispatcher;
import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.agent.JobAppInfo;
import com.dongkuk.dmes.mcm.job.agent.JobHandlerRegistrar;
import com.dongkuk.dmes.mcm.job.agent.JobRunController;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.oasis.provider.SimpleServiceProvider;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;

/** mdm 앱을 실제로 띄워 예약 작업 접수 쪽 조립을 확인한다 — 판정·호출은 MCM 전용이다. MCM 은 띄우지 않았고 JOB 표가 없어도(코드 작업 처리기가 없어) DB 에 닿지 않는다. */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class JobAgentWiringTest extends AbstractMdmSharedDbTest {

    @Autowired
    ApplicationContext ctx;

    @Test
    void 접수_쪽_빈은_있고_판정_호출_빈은_없다() {
        assertEquals(JobModule.MDM, ctx.getBean(JobAppInfo.class).module());
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
}
