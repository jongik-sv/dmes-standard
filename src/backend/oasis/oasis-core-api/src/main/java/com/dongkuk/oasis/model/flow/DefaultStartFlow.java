package com.dongkuk.oasis.model.flow;

import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;

/**
 * @author Jeongjin Kim
 * @since 2021-02-09
 */
public class DefaultStartFlow implements StartFlow {
    private final String targetElementId;

    /**
     * @param targetElementId 다음 요소 식별자
     */
    public DefaultStartFlow(String targetElementId) {
        this.targetElementId = targetElementId;
    }

    @Override
    public String getId() {
        throw new UnsupportedOperationException();
    }

    @Override
    public String getName() {
        throw new UnsupportedOperationException();
    }

    @Override
    public Property getProperty(String name) {
        throw new UnsupportedOperationException();
    }

    @Override
    public PropertyContainer properties() {
        throw new UnsupportedOperationException();
    }

    @Override
    public String sourceElementId() {
        throw new UnsupportedOperationException();
    }

    @Override
    public String targetElementId() {
        return targetElementId;
    }
}
