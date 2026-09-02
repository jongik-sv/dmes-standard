package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.exceptions.UnexpectedPropertyCharException;

import static com.dongkuk.oasis.expression.property.CharType.*;

/**
 * @author Jeongjin Kim
 * @since 2021-07-06
 */
class StateAccessorSpaceEnd extends BaseState {
    @Override
    public StateTransitionResult next(Class<? extends PropertyState> before,
                                      CharSupplier charSupplier,
                                      Character pairChar) {
        char c = charSupplier.next();
        while (charType(c) == SPACE) {
            c = charSupplier.next();
        }

        if (charType(c) == ACCESSOR_END) {
            return new StateTransitionResult(
                    StateAccessorEnd.class,
                    PropertyStateEvent.ACCESSOR_END
            );
        } else
            throw new UnexpectedPropertyCharException(charPresentingName(c), "SPACE, ],");
    }
}
