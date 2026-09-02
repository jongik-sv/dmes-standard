package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.exceptions.PropertyException;

import java.util.HashMap;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-07-06
 */
class DynamicPropertyStateRegistry implements PropertyStateRegistry {
    private final Map<Class<? extends PropertyState>, PropertyState> propertyStateMap = new HashMap<>();

    @Override
    public PropertyState getPropertyState(Class<? extends PropertyState> propertyStateClass) {
        PropertyState propertyState = propertyStateMap.get(propertyStateClass);
        if (propertyState == null) {
            try {
                propertyState = propertyStateClass.newInstance();
            } catch (InstantiationException | IllegalAccessException e) {
                throw new PropertyException(e.getMessage(), e);
            }
            propertyStateMap.put(propertyStateClass, propertyState);
        }

        return propertyState;
    }
}
