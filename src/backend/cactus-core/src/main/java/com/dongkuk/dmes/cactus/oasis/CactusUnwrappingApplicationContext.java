package com.dongkuk.dmes.cactus.oasis;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ApplicationContext;
import org.springframework.aop.framework.Advised;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.NoSuchBeanDefinitionException;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * oasis-core 의 기본 {@code SpringApplicationContext} 가 CGLIB proxy bean 을 그대로 반환하여
 * proxy class 의 method parameter name 이 손실되는 문제를 회피하기 위해 cactus 에서 자체 구현하는
 * ApplicationContext.
 *
 * <p>{@code @Transactional} / {@code @Async} 등 AOP 어노테이션을 가진 Service 클래스는 Spring 이
 * CGLIB enhance proxy 로 감싸며, enhanced class 의 method 는 원본 {@code -parameters}
 * 컴파일 옵션과 무관하게 parameter name 정보를 유실한다. 그 결과 oasis-core 의
 * {@code PrioritizableParameterAndArgumentHolder} 가 {@code methodParameter.getParameterName()}
 * 호출에서 null 을 받아 {@code IllegalArgumentException("ParameterName must not be null")} 을 던진다.
 *
 * <p>본 구현은 {@link AopUtils#isAopProxy(Object)} 로 proxy 여부를 확인하고
 * {@link Advised#getTargetSource()} 의 target instance 를 추출한다. target instance 는
 * 원본 컴파일 결과를 그대로 보유하여 {@code -parameters} 옵션의 MethodParameters attribute 가
 * 보존된다.
 */
public final class CactusUnwrappingApplicationContext implements ApplicationContext {

    private final org.springframework.context.ApplicationContext ac;

    public CactusUnwrappingApplicationContext(org.springframework.context.ApplicationContext ac) {
        if (ac == null) {
            throw new IllegalArgumentException("org.springframework.context.ApplicationContext is null.");
        }
        this.ac = ac;
    }

    @Override
    public TypedObject get(String s) {
        Object bean;
        try {
            bean = ac.getBean(s);
        } catch (NoSuchBeanDefinitionException e) {
            return null;
        }
        Object target = unwrap(bean);
        // 주의: type 도 target 의 class 로 통일 — proxy class 와 target class 가 다르면
        //       TypedObject.typeCheck 가 "Incompatible type" 으로 throw. ac.getType(s) 는
        //       경우에 따라 proxy class 를 반환 (Spring 6+).
        return new TypedObject(target, target.getClass());
    }

    @Override
    public List<TypedObject> get(Type type) {
        List<TypedObject> typedObjects = new ArrayList<>();
        if (type instanceof Class<?>) {
            Map<String, ?> beansOfType = ac.getBeansOfType((Class<?>) type);
            for (Map.Entry<String, ?> stringEntry : beansOfType.entrySet()) {
                Object target = unwrap(stringEntry.getValue());
                typedObjects.add(new TypedObject(target, target.getClass()));
            }
        }
        return typedObjects;
    }

    /**
     * CGLIB / JDK AOP proxy 면 target instance 를 반환. proxy 가 아니면 원본 그대로.
     * Spring AOP 의 {@link Advised} 인터페이스로 target source 접근.
     */
    private static Object unwrap(Object bean) {
        if (bean == null) {
            return null;
        }
        if (!AopUtils.isAopProxy(bean)) {
            return bean;
        }
        if (bean instanceof Advised) {
            try {
                Object target = ((Advised) bean).getTargetSource().getTarget();
                return target != null ? target : bean;
            } catch (Exception e) {
                return bean;
            }
        }
        return bean;
    }
}
