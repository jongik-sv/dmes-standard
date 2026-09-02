package integration;

import oasis.audit.AuditHolder;
import oasis.context.ApplicationContext;
import oasis.context.DefaultServiceContext;
import oasis.context.SpringApplicationContext;
import oasis.service.ServiceResult;
import oasis.service.ServiceResultCode;
import oasis.service.ServiceStarter;
import oasis.utils.TypedMapBuilder;
import integration.BpmnServiceLoaderForTest;
import integration.IntegrationTestConfig;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;

@ExtendWith(SpringExtension.class)
@ActiveProfiles({"local"})
@ContextConfiguration(classes = {IntegrationTestConfig.class})
public class MyBatisSelectAndLoopTest {
    @Autowired
    private org.springframework.context.ApplicationContext applicationContext;

    @Test
    void myBatisSelectAndLoop() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter(
                applicationContext, new String[]{"txBiz"}
        );
        ApplicationContext oac = new SpringApplicationContext(applicationContext);

        DefaultServiceContext serviceContext = new DefaultServiceContext(oac,
                new TypedMapBuilder()
                        .build());
        serviceContext.setAudit(AuditHolder.getAudit());

        ServiceResult mqd_design = serviceStarter.start("mybatis_select_and_loop", serviceContext);
        Assertions.assertThat(mqd_design.serviceResultCode()).isEqualTo(ServiceResultCode.SUCCESS);
    }

    static public class Consumer {
        private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(Consumer.class);

        public String hello(String id, int age) {
            log.info("{} hello", id);
            return id;
        }
    }
}
