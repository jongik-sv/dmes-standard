package com.dongkuk.oasis.context;

import com.dongkuk.oasis.TypedObject;
import org.springframework.beans.factory.NoSuchBeanDefinitionException;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 스프링의 {@code ApplicationContext}를 사용하여 관리하므로 별도 저장공간을 사용하지 않는다.
 *
 * @author Jeongjin Kim
 * @since 2021-05-29
 */
public final class SpringApplicationContext implements ApplicationContext {
    private final org.springframework.context.ApplicationContext ac;

    /**
     * {@link org.springframework.context.ApplicationContext}을 이용하여 컨택스트를 생성한다.
     *
     * @param ac Spring Application Context
     */
    public SpringApplicationContext(org.springframework.context.ApplicationContext ac) {
        if (ac == null)
            throw new IllegalArgumentException("org.springframework.context.ApplicationContext is null.");
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

        return new TypedObject(bean, ac.getType(s));
    }

    @Override
    public List<TypedObject> get(Type type) {
        List<TypedObject> typedObjects = new ArrayList<>();

        if (type instanceof Class<?>) {
            Map<String, ?> beansOfType = ac.getBeansOfType((Class<?>) type);
            for (Map.Entry<String, ?> stringEntry : beansOfType.entrySet()) {
                typedObjects.add(new TypedObject(stringEntry.getValue(), ac.getType(stringEntry.getKey())));
            }
        }

        return typedObjects;
    }
}