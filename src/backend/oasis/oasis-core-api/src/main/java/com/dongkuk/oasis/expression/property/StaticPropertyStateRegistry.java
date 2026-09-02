package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.exceptions.PropertyException;

import java.util.HashMap;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-07-06
 */
class StaticPropertyStateRegistry implements PropertyStateRegistry {
    private final Map<Class<? extends PropertyState>, PropertyState> propertyStateMap = new HashMap<>();

    public StaticPropertyStateRegistry() {
        propertyStateMap.put(StateAccessorEnd.class, new StateAccessorEnd());
        propertyStateMap.put(StateAccessorIndexStart.class, new StateAccessorIndexStart());
        propertyStateMap.put(StateAccessorKeyStart.class, new StateAccessorKeyStart());
        propertyStateMap.put(StateAccessorSpaceEnd.class, new StateAccessorSpaceEnd());
        propertyStateMap.put(StateAccessorStart.class, new StateAccessorStart());
        propertyStateMap.put(StateAlias.class, new StateAlias());
        propertyStateMap.put(StateAliasA.class, new StateAliasA());
        propertyStateMap.put(StateAliasS.class, new StateAliasS());
        propertyStateMap.put(StateAliasSpace.class, new StateAliasSpace());
        propertyStateMap.put(StateAliasStart.class, new StateAliasStart());
        propertyStateMap.put(StateEndSpace.class, new StateEndSpace());
        propertyStateMap.put(StateEscape.class, new StateEscape());
        propertyStateMap.put(StateExpressionPhaseEnd.class, new StateExpressionPhaseEnd());
        propertyStateMap.put(StateExpressionPhaseStart.class, new StateExpressionPhaseStart());
        propertyStateMap.put(StateExpressionStart.class, new StateExpressionStart());
        propertyStateMap.put(StateExpressionStartSpaceRemove.class, new StateExpressionStartSpaceRemove());
        propertyStateMap.put(StateValue.class, new StateValue());
    }

    @Override
    public PropertyState getPropertyState(Class<? extends PropertyState> propertyStateClass) {
        PropertyState propertyState = propertyStateMap.get(propertyStateClass);
        if (propertyState == null) {
            throw new PropertyException("Property state does not exist.");
        }

        return propertyState;
    }
}
