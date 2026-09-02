package integration;

import sample.biz.adm.SampleTable;
import sample.biz.adm.SampleTableRepository;
import oasis.audit.AuditHolder;
import oasis.context.ApplicationContext;
import oasis.context.DefaultServiceContext;
import oasis.context.SpringApplicationContext;
import oasis.service.ServiceResult;
import oasis.service.ServiceResultCode;
import oasis.service.ServiceStarter;
import oasis.utils.MapBuilder;
import oasis.utils.TypedMapBuilder;
import integration.BpmnServiceLoaderForTest;
import integration.IntegrationTestConfig;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.orm.jpa.EntityManagerFactoryUtils;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

@ExtendWith(SpringExtension.class)
@ActiveProfiles({"local"})
@ContextConfiguration(classes = {IntegrationTestConfig.class})
public class TransactionTest {
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

        ServiceResult mqd_design = serviceStarter.start("transaction_test", serviceContext);
        Assertions.assertThat(mqd_design.serviceResultCode()).isEqualTo(ServiceResultCode.SUCCESS);
    }

    @Test
    void myBatisSelectInline() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter(
                applicationContext, new String[]{"txBiz"}
        );
        ApplicationContext oac = new SpringApplicationContext(applicationContext);

        DefaultServiceContext serviceContext = new DefaultServiceContext(oac,
                new TypedMapBuilder()
                        .build());
        serviceContext.setAudit(AuditHolder.getAudit());

        ServiceResult mqd_design = serviceStarter.start("transaction_test_inline", serviceContext);
        Assertions.assertThat(mqd_design.serviceResultCode()).isEqualTo(ServiceResultCode.SUCCESS);
    }

    static public class Consumer {
        private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(Consumer.class);
        private final SampleTableRepository sampleTableRepository;
        private EntityManagerFactory entityManagerFactoryBiz;

        public Consumer(SampleTableRepository sampleTableRepository, EntityManagerFactory entityManagerFactoryBiz) {
            this.sampleTableRepository = sampleTableRepository;
            this.entityManagerFactoryBiz = entityManagerFactoryBiz;
        }

        public void incAge(Number maxAge) {
            EntityManager transactionalEntityManager
                    = EntityManagerFactoryUtils.getTransactionalEntityManager(entityManagerFactoryBiz);

            SampleTable sampleTable = new SampleTable();
            sampleTable.setAge(maxAge.intValue() + 1);
            sampleTableRepository.save(sampleTable);
            transactionalEntityManager.flush();
            transactionalEntityManager.clear();
        }

        public List<Map<String, Object>> getMax(){
            Integer max = sampleTableRepository.max();
            return Arrays.asList(new MapBuilder<String, Object>().addEntity("maxAge", max).build());
        }
    }
}
