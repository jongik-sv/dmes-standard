package com.dongkuk.dmes.cactus.oasis;

import static com.dongkuk.dmes.cactus.oasis.CactusResponseConverterJsonTest.failed;
import static com.dongkuk.dmes.cactus.oasis.CactusResponseConverterTranslatorTest.FOREIGN_DETAILS;
import static com.dongkuk.dmes.cactus.oasis.CactusResponseConverterTranslatorTest.TRANSLATOR;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

import com.dongkuk.dmes.cactus.common.BusinessErrorTranslator;
import com.dongkuk.dmes.cactus.common.BusinessErrorTranslator.Translated;
import com.dongkuk.dmes.cactus.oasis.CactusResponseConverterTranslatorTest.ForeignBusinessException;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.request.RequestMeta;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import java.util.HashMap;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.Ordered;

/**
 * {@link OasisAutoConfiguration} 이 호스트가 등록한 {@link BusinessErrorTranslator} 빈을 응답 변환기·서비스 실행기에 넘기는지 본다
 * (2026-10-16, BE 리팩토링 2회차 F2). 변환기 빈이 없으면 응답 변환기는 cactus 형만 알아본다(예전과 같다).
 *
 * <p>{@code ServiceStarter} 는 대역으로 넣어({@code @ConditionalOnMissingBean}) BPMN 로딩을 건너뛰고, 기동 AOP 검사는 끈다.
 */
class OasisAutoConfigurationTranslatorTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(OasisAutoConfiguration.class))
            .withPropertyValues("cactus.oasis.aop-check=off")
            .withBean(ServiceStarter.class, () -> mock(ServiceStarter.class));

    /** 순서가 정해진 변환기 — 자기 코드만 내는 대역. */
    record OrderedTranslator(String code, int order) implements BusinessErrorTranslator, Ordered {
        @Override
        public Translated translate(Throwable t) {
            return t instanceof ForeignBusinessException ? new Translated(code, null) : null;
        }

        @Override
        public int getOrder() {
            return order;
        }
    }

    private static ForeignBusinessException foreign() {
        return new ForeignBusinessException("E001", "입력값을 확인해주세요.", FOREIGN_DETAILS);
    }

    @Test
    void 변환기_빈이_없으면_응답_변환기는_예전처럼_S001_이고_errors_가_없다() {
        runner.run(ctx -> {
            CactusResponse r = ctx.getBean(CactusResponseConverter.class)
                    .convert(failed(ServiceResultCode.SYSTEM_ERROR, foreign()), "tx");

            assertThat(r.getMeta().code()).isEqualTo("S001");
            assertThat(r.getErrors()).isNull();
        });
    }

    @Test
    void 변환기_빈을_등록하면_응답_변환기가_그_코드와_상세를_싣는다() {
        runner.withBean(BusinessErrorTranslator.class, () -> TRANSLATOR).run(ctx -> {
            CactusResponse r = ctx.getBean(CactusResponseConverter.class)
                    .convert(failed(ServiceResultCode.SYSTEM_ERROR, foreign()), "tx");

            assertThat(r.getMeta().code()).isEqualTo("E001");
            assertThat(r.getErrors()).containsExactlyElementsOf(FOREIGN_DETAILS);
        });
    }

    @Test
    void 서비스_실행기도_같은_변환기를_써서_BPMN_밖_예외에_변환_코드를_싣는다() {
        runner.withBean(BusinessErrorTranslator.class, () -> TRANSLATOR).run(ctx -> {
            doThrow(foreign()).when(ctx.getBean(ServiceStarter.class)).start(eq("probe"), any(ServiceContext.class));

            CactusResponse res = ctx.getBean(OasisServiceExecutor.class)
                    .execute("probe", "save", new CactusRequest(new RequestMeta("u1", "M1"), new HashMap<>(), null));

            assertThat(res.getMeta().code()).isEqualTo("E001");
            assertThat(res.getErrors()).containsExactlyElementsOf(FOREIGN_DETAILS);
        });
    }

    @Test
    void 변환기_빈이_여럿이면_Ordered_순서로_묻는다() {
        // 등록 순서와 반대로 순서를 매겨 등록 순서가 아니라 getOrder 가 앞선다는 것을 본다.
        runner.withBean("late", BusinessErrorTranslator.class, () -> new OrderedTranslator("LATE", 10))
                .withBean("early", BusinessErrorTranslator.class, () -> new OrderedTranslator("EARLY", 1))
                .run(ctx -> {
                    CactusResponse r = ctx.getBean(CactusResponseConverter.class)
                            .convert(failed(ServiceResultCode.SYSTEM_ERROR, foreign()), "tx");

                    assertThat(r.getMeta().code()).isEqualTo("EARLY");
                });
    }
}
