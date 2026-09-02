package com.dongkuk.oasis.context;

import com.dongkuk.oasis.TypedObject;

import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-02-10
 */
public final class DefaultWowContext implements WowContext {
    private final ExecutableContext executableContext;
    private final Map<String, String> properties;

    /**
     * @param executableContext 테스크 컨택스트
     * @param properties        프로퍼티
     */
    public DefaultWowContext(ExecutableContext executableContext, Map<String, String> properties) {
        if (executableContext == null)
            throw new IllegalArgumentException("executableNodeContext is null");

        this.executableContext = executableContext;
        this.properties = properties;
    }

    @Override
    public TypedObject get(String key) {
        return executableContext.get(key);
    }

    @Override
    public Object getPropertyValue(String name) {
        return properties.get(name);
    }
}
