package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.exceptions.UnexpectedPropertyCharException;

import static com.dongkuk.oasis.expression.property.CharType.*;

/**
 * @author Jeongjin Kim
 * @since 2021-07-06
 */
class StateEndSpace extends BaseState {
    @Override
    public StateTransitionResult next(Class<? extends PropertyState> before,
                                      CharSupplier charSupplier,
                                      Character pairChar) {
        char c = charSupplier.next();
        while (charType(c) == SPACE) {
            c = charSupplier.next();
        }

        if (charType(c) == EXPRESSION_SPLITTER) {
            return new StateTransitionResult(
                    StateExpressionStart.class,
                    PropertyStateEvent.EXPRESSION_END,
                    PropertyStateEvent.EXPRESSION_START
            );
        } else if (charType(c) == EOL) {
            return new StateTransitionResult(
                    StateExpressionPhaseEnd.class,
                    PropertyStateEvent.EXPRESSION_END,
                    PropertyStateEvent.EXPRESSION_PHASE_END
            );
        } else
            throw new UnexpectedPropertyCharException(charPresentingName(c), "SPACE, EOL, ,");
    }
}
