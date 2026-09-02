package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.exceptions.UnexpectedPropertyCharException;

import static com.dongkuk.oasis.expression.property.CharType.*;

/**
 * @author Jeongjin Kim
 * @since 2021-07-05
 */
final class StateExpressionStartSpaceRemove extends BaseState {
    @Override
    public StateTransitionResult next(Class<? extends PropertyState> before,
                                      CharSupplier charSupplier,
                                      Character pairChar) {
        char c = charSupplier.next();
        while (charType(c) == SPACE) {
            c = charSupplier.next();
        }

        if (charType(c) == ESCAPE)
            return new StateTransitionResult(
                    StateEscape.class
            );
        else if (charType(c) == ACCESSOR_START)
            return new StateTransitionResult(
                    StateAccessorStart.class
                    , PropertyStateEvent.ACCESSOR_START
            );
        else if (charType(c) == LITERAL || charType(c) == NUMBER) {
            return new StateTransitionResult(
                    StateValue.class,
                    c,
                    PropertyStateEvent.VALUE_START);
        } else
            throw new UnexpectedPropertyCharException(charPresentingName(c), "SPACE, \\, [, LITERAL, NUMBER");
    }
}
