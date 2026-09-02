package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.exceptions.UnexpectedPropertyCharException;

import static com.dongkuk.oasis.expression.property.CharType.*;

/**
 * @author Jeongjin Kim
 * @since 2021-07-06
 */
class StateAccessorKeyStart extends BaseState {
    @Override
    public StateTransitionResult next(Class<? extends PropertyState> before,
                                      CharSupplier charSupplier,
                                      Character pairChar) {
        StringBuilder consumedChars = new StringBuilder();

        char c = charSupplier.next();
        while (charType(c) == LITERAL || charType(c) == SPACE || charType(c) == NUMBER) {
            consumedChars.append(c);
            c = charSupplier.next();
        }
        if (pairChar != null && c == pairChar) {
            return new StateTransitionResult(
                    StateAccessorSpaceEnd.class,
                    consumedChars.toString()
            );
        } else if (charType(c) == ESCAPE) {
            return new StateTransitionResult(
                    StateEscape.class,
                    consumedChars.toString(),
                    pairChar,
                    (PropertyStateEvent) null
            );
        } else
            throw new UnexpectedPropertyCharException(charPresentingName(c), "', LITERAL, NUMBER, SPACE");
    }
}
