package com.dongkuk.oasis.expression.property;

/**
 * @author Jeongjin Kim
 * @since 2021-07-06
 */
interface PropertyStateRegistry {
    PropertyState getPropertyState(Class<? extends PropertyState> propertyStateClass);
}
