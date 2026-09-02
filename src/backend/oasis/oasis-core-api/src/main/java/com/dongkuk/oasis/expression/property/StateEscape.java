package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.exceptions.UnexpectedPropertyCharException;

import static com.dongkuk.oasis.expression.property.CharType.*;

/**
 * @author Jeongjin Kim
 * @since 2021-07-06
 */
class StateEscape extends BaseState {
    @Override
    public StateTransitionResult next(Class<? extends PropertyState> before,
                                      CharSupplier charSupplier,
                                      Character pairChar) {
        char c = charSupplier.next();

        if (isMetaChar(charType(c)))
            return new StateTransitionResult(
                    before,
                    new String(new char[]{c}),
                    pairChar,
                    (PropertyStateEvent) null);

        else
            throw new UnexpectedPropertyCharException(charPresentingName(c), "[, ], ', \"");

    }
}
