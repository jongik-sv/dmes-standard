package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.exceptions.UnexpectedPropertyCharException;

import static com.dongkuk.oasis.expression.property.CharType.charPresentingName;

/**
 * @author Jeongjin Kim
 * @since 2021-07-06
 */
class StateAliasA extends BaseState {
    @Override
    public StateTransitionResult next(Class<? extends PropertyState> before,
                                      CharSupplier charSupplier,
                                      Character pairChar) {
        char c = charSupplier.next();

        if (c == '>') {
            return new StateTransitionResult(
                    StateAliasS.class
            );
        } else
            throw new UnexpectedPropertyCharException(charPresentingName(c), ">");
    }
}
