package com.dongkuk.oasis.model.flow;

import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;

/**
 * @author Jeongjin Kim
 * @since 2021-02-05
 */
public class DefaultTerminalFlow implements TerminalFlow {
    @Override
    public String getId() {
        return null;
    }

    @Override
    public String getName() {
        return null;
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
        return null;
    }

    @Override
    public String targetElementId() {
        return null;
    }
}
