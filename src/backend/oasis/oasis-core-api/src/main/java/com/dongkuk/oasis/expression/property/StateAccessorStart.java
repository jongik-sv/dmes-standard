package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.exceptions.UnexpectedPropertyCharException;

import static com.dongkuk.oasis.expression.property.CharType.*;

/**
 * @author Jeongjin Kim
 * @since 2021-07-05
 */
class StateAccessorStart extends BaseState {
    @Override
    public StateTransitionResult next(Class<? extends PropertyState> before,
                                      CharSupplier charSupplier,
                                      Character pairChar) {
        char c = charSupplier.next();
        while (charType(c) == SPACE) {
            c = charSupplier.next();
        }

        if (charType(c) == NUMBER) {
            return new StateTransitionResult(
                    StateAccessorIndexStart.class,
                    c
            );
        } else if (charType(c) == SINGLE_QUO_KEY) {
            return new StateTransitionResult(
                    StateAccessorKeyStart.class,
                    null,
                    c,
                    (PropertyStateEvent) null
            );
        } else if (charType(c) == DOUBLE_QUO_KEY) {
            return new StateTransitionResult(
                    StateAccessorKeyStart.class,
                    null,
                    c,
                    (PropertyStateEvent) null
            );
        } else
            throw new UnexpectedPropertyCharException(charPresentingName(c), "SPACE, NUMBER, ', \"");
    }
}
