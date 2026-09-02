package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.exceptions.UnexpectedPropertyCharException;

import static com.dongkuk.oasis.expression.property.CharType.*;

/**
 * @author Jeongjin Kim
 * @since 2021-07-06
 */
class StateAccessorIndexStart extends BaseState {
    @Override
    public StateTransitionResult next(Class<? extends PropertyState> before,
                                      CharSupplier charSupplier,
                                      Character pairChar) {
        StringBuilder consumedChars = new StringBuilder();

        char c = charSupplier.next();
        while (charType(c) == NUMBER) {
            consumedChars.append(c);
            c = charSupplier.next();
        }

        if (charType(c) == SPACE) {
            return new StateTransitionResult(
                    StateAccessorSpaceEnd.class,
                    consumedChars.toString()
            );
        } else if (charType(c) == ACCESSOR_END) {
            return new StateTransitionResult(
                    StateAccessorEnd.class,
                    consumedChars.toString(),
                    PropertyStateEvent.ACCESSOR_END
            );
        } else
            throw new UnexpectedPropertyCharException(charPresentingName(c), "NUMBER, SPACE, ],");
    }
}
