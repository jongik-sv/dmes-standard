package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.exceptions.UnexpectedPropertyCharException;

import static com.dongkuk.oasis.expression.property.CharType.*;

/**
 * @author Jeongjin Kim
 * @since 2021-07-06
 */
class StateAliasS extends BaseState {
    @Override
    public StateTransitionResult next(Class<? extends PropertyState> before,
                                      CharSupplier charSupplier,
                                      Character pairChar) {
        char c = charSupplier.next();

        if (charType(c) == SPACE) {
            return new StateTransitionResult(
                    StateAliasStart.class,
                    PropertyStateEvent.ALIAS_START
            );
        } else if (charType(c) == LITERAL) {
            return new StateTransitionResult(
                    StateAlias.class,
                    c,
                    PropertyStateEvent.ALIAS_START
            );
        } else
            throw new UnexpectedPropertyCharException(charPresentingName(c), "SPACE, LITERAL");
    }
}
