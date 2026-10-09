package com.dongkuk.dmes.mdm.job;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.job.JobRunDispatcher;
import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.agent.JobAppInfo;
import com.dongkuk.dmes.mcm.job.agent.JobHandlerRegistrar;
import com.dongkuk.dmes.mcm.job.agent.JobHandlerRegistry;
import com.dongkuk.dmes.mcm.job.agent.JobRunController;
import com.dongkuk.dmes.mcm.job.agent.ScheduledJob;
import com.dongkuk.dmes.mcm.widget.ext.FrankfurterProvider;
import com.dongkuk.dmes.mcm.widget.ext.KoreaEximProvider;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.oasis.provider.SimpleServiceProvider;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;

/** mdm 앱을 실제로 띄워 예약 작업 접수 쪽 조립을 확인한다 — 판정·호출은 MCM 전용이다. MCM 은 띄우지 않았다. 코드 작업 처리기(mdm.exchangeRateSync)가 있어 기동 뒤 등록기가 MCMAPUSER 의 JOB 표에 쓰려고 하지만, 표가 없거나 권한이 없으면 WARN 만 남기고 기동은 실패하지 않는다. */
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
    void 환율_마스터_동기화_작업이_MDM_코드_작업_처리기로_등록된다() {
        ScheduledJob job = ctx.getBean(JobHandlerRegistry.class).find("mdm.exchangeRateSync").orElseThrow();
        assertEquals(JobModule.MDM, job.module());
        assertEquals("환율 마스터 동기화", job.name());
        assertEquals("10 11 * * 1-5", job.defaultCron());
        assertTrue(ctx.getBeansOfType(ScheduledJob.class).containsKey("mdmExchangeRateSync"));
        // 환율 제공자는 mdm 앱이 직접 올린다(mcm-core 의 widget/ext 는 스캔되지 않는다).
        assertNotNull(ctx.getBean(FrankfurterProvider.class));
        assertNotNull(ctx.getBean(KoreaEximProvider.class));
    }

    @Test
    void 내장_서비스_BPMN_3개를_이_앱의_서비스_제공자가_찾는다() {
        SimpleServiceProvider provider = new SimpleServiceProvider("/services", "bpmn", "^^");
        for (String id : new String[] {"jobCode", "jobQuery", "jobCollect"}) {
            assertNotNull(provider.service(id), id);
        }
    }
}
