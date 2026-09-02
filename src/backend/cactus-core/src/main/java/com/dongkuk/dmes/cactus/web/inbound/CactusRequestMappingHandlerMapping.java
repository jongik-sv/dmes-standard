package com.dongkuk.dmes.cactus.web.inbound;

import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * Spring Framework 7 의 {@link RequestMappingHandlerMapping} 은
 * {@code isHandler} 가 {@link Controller @Controller} 만 핸들러로 인식한다
 * (Spring 6 까지는 클래스 레벨 {@link RequestMapping @RequestMapping} 도 인식했다).
 *
 * <p>cactus 의 inbound 컨트롤러 ({@link OasisController}, {@link QueryController},
 * {@link ServiceController}, {@link LovController}) 는 자동 설정
 * ({@link InboundAutoConfiguration})에서 {@link org.springframework.context.annotation.Bean @Bean} +
 * {@link org.springframework.boot.autoconfigure.condition.ConditionalOnBean @ConditionalOnBean} 으로
 * 등록되며, 컴포넌트 스캔으로 잡히지 않도록 의도적으로 {@code @Controller} 를
 * 붙이지 않는다 (mybatis/oasis-core 의존이 없는 사이트에서도 cactus-core 자체는
 * 안전하게 부팅되도록).
 *
 * <p>Spring 7 표준 {@link RequestMappingHandlerMapping} 은 그 결과 cactus 의 4 개
 * inbound 컨트롤러를 핸들러로 인식하지 못하고, 매핑 부재로 요청이
 * {@code ResourceHttpRequestHandler} 로 떨어져 {@code NoResourceFoundException}
 * 이 발생한다.
 *
 * <p>본 클래스는 Spring 6 까지의 동작 (클래스 레벨 {@code @RequestMapping} 도
 * 핸들러로 인식) 을 유지한다. cactus 자동 설정이 default
 * {@code requestMappingHandlerMapping} 빈을 본 구현으로 교체한다.
 */
public class CactusRequestMappingHandlerMapping extends RequestMappingHandlerMapping {

    @Override
    protected boolean isHandler(Class<?> beanType) {
        return AnnotatedElementUtils.hasAnnotation(beanType, Controller.class)
                || AnnotatedElementUtils.hasAnnotation(beanType, RequestMapping.class);
    }
}
