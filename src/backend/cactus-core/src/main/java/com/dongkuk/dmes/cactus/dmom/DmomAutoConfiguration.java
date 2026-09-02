package com.dongkuk.dmes.cactus.dmom;

import com.dongkuk.dmes.cactus.dmom.dispatch.DmomDbOutboundWriter;
import com.dongkuk.dmes.cactus.dmom.dispatch.DmomHttpSender;
import com.dongkuk.dmes.cactus.dmom.error.DmomErrorLogger;
import com.dongkuk.dmes.cactus.dmom.format.DmomFormatRepository;
import com.dongkuk.dmes.cactus.dmom.message.DefaultDmomMessageService;
import com.dongkuk.dmes.cactus.dmom.message.DmomMessageService;
import com.dongkuk.dmes.cactus.dmom.message.MessageSerializer;
import com.dongkuk.dmes.cactus.dmom.receiver.DmomParseMessageTask;
import com.dongkuk.dmes.cactus.dmom.receiver.DmomReceiveController;
import com.dongkuk.dmes.cactus.dmom.receiver.DmomReceiveDispatcher;
import com.dongkuk.dmes.cactus.dmom.receiver.MessageParser;
import com.dongkuk.dmes.cactus.dmom.task.DmomMessageTask;
import com.dongkuk.dmes.cactus.integration.caravanhub.CaravanHubIntegrationAutoConfiguration;
import com.dongkuk.dmes.cactus.integration.caravanhub.CaravanHubIntegrationClient;
import com.dongkuk.dmes.cactus.mybatis.CactusMultiMybatisAutoConfiguration;
import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.dmes.cactus.tx.CactusMultiTransactionManagerAutoConfiguration;
import com.dongkuk.oasis.service.ServiceStarter;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.beans.factory.BeanFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * dmom 전문 송·수신 자동 설정.
 *
 * <p>비활성: {@code cactus.dmom.enabled=false}. 빈은 모두 {@code @ConditionalOnMissingBean} 으로 모듈 override 허용.
 *
 * <p>DataSource/Tx 매니저 의존: {@code biz-template}(기본 {@code sqlSessionTemplateBiz}) 와
 * {@code error-tx-manager}(기본 {@code transactionManager}) 를 프로퍼티 이름으로 BeanFactory 에서 해석.
 * HTTP 송신({@link DmomHttpSender}) 은 {@link CaravanHubIntegrationClient} 존재 시에만 등록.
 *
 * <p><b>수신(Inbound)</b>: {@link MessageParser}/{@link DmomParseMessageTask} 는 포맷 조회만 하므로
 * OASIS 무관하게 등록하고, {@link DmomReceiveDispatcher}/{@link DmomReceiveController} 는
 * {@code ServiceStarter} 존재 시(= OASIS 환경)에만 등록한다. 컨트롤러 핸들러 인식은 기존
 * {@code InboundAutoConfiguration} 의 {@code CactusRequestMappingHandlerMapping} 이 처리한다.
 */
@AutoConfiguration(after = {
        CactusMultiMybatisAutoConfiguration.class,
        CactusMultiTransactionManagerAutoConfiguration.class,
        CaravanHubIntegrationAutoConfiguration.class,
        // 수신 디스패처/컨트롤러의 @ConditionalOnBean(ServiceStarter) 가 ServiceStarter 등록 후 평가되도록
        // OasisAutoConfiguration 을 선행으로 명시 (미지정 시 순서 미보장 → 수신 빈 스킵 버그).
        OasisAutoConfiguration.class
})
@ConditionalOnBean(SqlSessionTemplate.class)   // MyBatis(biz 템플릿) 없는 컨텍스트에선 비활성 — 기동 안전
@ConditionalOnProperty(prefix = "cactus.dmom", name = "enabled", havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(DmomProperties.class)
public class DmomAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public MessageSerializer dmomMessageSerializer() {
        return new MessageSerializer();
    }

    @Bean
    @ConditionalOnMissingBean
    public DmomFormatRepository dmomFormatRepository(BeanFactory beanFactory, DmomProperties props) {
        return new DmomFormatRepository(bizTemplate(beanFactory, props), props.getDefaultSendTablePrefix());
    }

    @Bean
    @ConditionalOnMissingBean
    public DmomDbOutboundWriter dmomDbOutboundWriter(BeanFactory beanFactory, DmomProperties props,
                                                     DmomFormatRepository formatRepository) {
        return new DmomDbOutboundWriter(bizTemplate(beanFactory, props), formatRepository);
    }

    @Bean
    @ConditionalOnMissingBean
    public DmomErrorLogger dmomErrorLogger(BeanFactory beanFactory, DmomProperties props) {
        PlatformTransactionManager ptm =
                beanFactory.getBean(props.getErrorTxManager(), PlatformTransactionManager.class);
        TransactionTemplate txTemplate = new TransactionTemplate(ptm);
        txTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        return new DmomErrorLogger(bizTemplate(beanFactory, props), txTemplate);
    }

    @Bean
    @ConditionalOnBean(CaravanHubIntegrationClient.class)
    @ConditionalOnMissingBean
    public DmomHttpSender dmomHttpSender(CaravanHubIntegrationClient caravanHubClient) {
        return new DmomHttpSender(caravanHubClient);
    }

    @Bean
    @ConditionalOnMissingBean
    public DmomMessageService dmomMessageService(DmomFormatRepository formatRepository,
                                                 MessageSerializer serializer,
                                                 DmomDbOutboundWriter dbWriter,
                                                 ObjectProvider<DmomHttpSender> httpSender,
                                                 DmomErrorLogger errorLogger) {
        return new DefaultDmomMessageService(formatRepository, serializer, dbWriter,
                httpSender.getIfAvailable(), errorLogger);
    }

    /** OASIS BPMN 선언적 송신 태스크 (camunda:class="dmomMessageTask" + method=createMessage). */
    @Bean("dmomMessageTask")
    @ConditionalOnMissingBean
    public DmomMessageTask dmomMessageTask(DmomMessageService dmomMessageService) {
        return new DmomMessageTask(dmomMessageService);
    }

    // ── 수신(Inbound) ──

    /** 파이프 전문 → Map 역직렬화기. */
    @Bean
    @ConditionalOnMissingBean
    public MessageParser dmomMessageParser() {
        return new MessageParser();
    }

    /** OASIS BPMN 수신 첫 태스크 (camunda:class="dmomParseMessageTask" + method=parse). */
    @Bean("dmomParseMessageTask")
    @ConditionalOnMissingBean
    public DmomParseMessageTask dmomParseMessageTask(DmomFormatRepository formatRepository,
                                                     MessageParser parser) {
        return new DmomParseMessageTask(formatRepository, parser);
    }

    /** 수신 → OASIS 백엔드 기동 디스패처 (OASIS 존재 시에만). */
    @Bean
    @ConditionalOnBean(ServiceStarter.class)
    @ConditionalOnMissingBean
    public DmomReceiveDispatcher dmomReceiveDispatcher(ServiceStarter serviceStarter,
                                                       ApplicationContext applicationContext,
                                                       DmomErrorLogger errorLogger) {
        return new DmomReceiveDispatcher(serviceStarter, applicationContext, errorLogger);
    }

    /** 수신 API 컨트롤러 (디스패처 존재 시에만). */
    @Bean
    @ConditionalOnBean(DmomReceiveDispatcher.class)
    @ConditionalOnMissingBean
    public DmomReceiveController dmomReceiveController(DmomReceiveDispatcher dispatcher) {
        return new DmomReceiveController(dispatcher);
    }

    private static SqlSessionTemplate bizTemplate(BeanFactory beanFactory, DmomProperties props) {
        return beanFactory.getBean(props.getBizTemplate(), SqlSessionTemplate.class);
    }
}
