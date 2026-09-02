package com.dongkuk.dmes.cactus.dmom;

import com.dongkuk.dmes.cactus.dmom.dispatch.DmomDbOutboundWriter;
import com.dongkuk.dmes.cactus.dmom.dispatch.DmomHttpSender;
import com.dongkuk.dmes.cactus.dmom.error.DmomErrorLogger;
import com.dongkuk.dmes.cactus.dmom.format.DmomFormatRepository;
import com.dongkuk.dmes.cactus.dmom.message.DmomMessageService;
import com.dongkuk.dmes.cactus.dmom.message.MessageSerializer;
import com.dongkuk.dmes.cactus.dmom.receiver.DmomParseMessageTask;
import com.dongkuk.dmes.cactus.dmom.receiver.DmomReceiveController;
import com.dongkuk.dmes.cactus.dmom.receiver.DmomReceiveDispatcher;
import com.dongkuk.dmes.cactus.dmom.receiver.MessageParser;
import com.dongkuk.dmes.cactus.dmom.task.DmomMessageTask;
import com.dongkuk.dmes.cactus.integration.caravanhub.CaravanHubIntegrationClient;
import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.oasis.service.ServiceStarter;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.transaction.PlatformTransactionManager;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class DmomAutoConfigurationTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(DmomAutoConfiguration.class))
            .withBean("sqlSessionTemplateBiz", SqlSessionTemplate.class, () -> mock(SqlSessionTemplate.class))
            .withBean("transactionManager", PlatformTransactionManager.class, () -> mock(PlatformTransactionManager.class));

    @Test
    void CaravanHub클라이언트_있으면_전체빈_등록() {
        runner.withBean(CaravanHubIntegrationClient.class, () -> mock(CaravanHubIntegrationClient.class))
                .run(ctx -> {
                    assertThat(ctx).hasSingleBean(MessageSerializer.class);
                    assertThat(ctx).hasSingleBean(DmomFormatRepository.class);
                    assertThat(ctx).hasSingleBean(DmomDbOutboundWriter.class);
                    assertThat(ctx).hasSingleBean(DmomErrorLogger.class);
                    assertThat(ctx).hasSingleBean(DmomHttpSender.class);
                    assertThat(ctx).hasSingleBean(DmomMessageService.class);
                    assertThat(ctx).hasSingleBean(DmomMessageTask.class);
                });
    }

    @Test
    void CaravanHub클라이언트_없으면_httpSender없이_서비스등록() {
        runner.run(ctx -> {
            assertThat(ctx).hasSingleBean(DmomMessageService.class);
            assertThat(ctx).doesNotHaveBean(DmomHttpSender.class);
        });
    }

    @Test
    void enabled_false면_빈_미등록() {
        runner.withPropertyValues("cactus.dmom.enabled=false")
                .run(ctx -> assertThat(ctx).doesNotHaveBean(DmomMessageService.class));
    }

    // ── 수신(Inbound) 빈 회귀 ──

    @Test
    void 수신_파싱빈은_ServiceStarter_없어도_등록() {
        // MessageParser/DmomParseMessageTask 는 포맷 조회만 → OASIS 무관 등록
        runner.run(ctx -> {
            assertThat(ctx).hasSingleBean(MessageParser.class);
            assertThat(ctx).hasSingleBean(DmomParseMessageTask.class);
            assertThat(ctx).doesNotHaveBean(DmomReceiveDispatcher.class);
            assertThat(ctx).doesNotHaveBean(DmomReceiveController.class);
        });
    }

    @Test
    void ServiceStarter_있으면_수신_디스패처와_컨트롤러_등록() {
        // 회귀 가드(버그#1): ServiceStarter 가 컨텍스트에 있으면 수신 디스패처/컨트롤러가 생성돼야 한다.
        // (실모듈에선 OasisAutoConfiguration 이 ServiceStarter 를 등록 — @AutoConfiguration after 보장 필요)
        runner.withBean(ServiceStarter.class, () -> mock(ServiceStarter.class))
                .run(ctx -> {
                    assertThat(ctx).hasSingleBean(DmomReceiveDispatcher.class);
                    assertThat(ctx).hasSingleBean(DmomReceiveController.class);
                });
    }

    @Test
    void autoconfig_after에_OasisAutoConfiguration_명시됨() {
        // 회귀 가드(버그#1): 수신 빈의 @ConditionalOnBean(ServiceStarter) 가 ServiceStarter 등록 후 평가되도록
        // OasisAutoConfiguration 이 after 에 있어야 한다. 제거 시 실모듈에서 수신 컨트롤러 미등록(500) 재발.
        AutoConfiguration ann = DmomAutoConfiguration.class.getAnnotation(AutoConfiguration.class);
        assertThat(ann).isNotNull();
        assertThat(ann.after()).contains(OasisAutoConfiguration.class);
    }

    @Test
    void 매퍼_getFormatLayout_컬럼이_camelCase_alias() throws Exception {
        // 회귀 가드(버그#2): resultType=map 키는 mapUnderscoreToCamelCase 로 변환되지 않으므로
        // 매퍼 SQL 에서 camelCase alias 가 있어야 DmomFormatRepository 가 키를 읽는다(없으면 itemTp=null → NPE).
        try (var in = getClass().getResourceAsStream("/persistence/dmom/DmomMapper.xml")) {
            assertThat(in).as("DmomMapper.xml 클래스패스 존재").isNotNull();
            String xml = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            assertThat(xml).contains("AS itemSeq")
                    .contains("AS itemTp")
                    .contains("AS itemId")
                    .contains("AS dataTp")
                    .contains("AS dataLen")
                    .contains("AS dataDecimalPrec");
        }
    }
}
