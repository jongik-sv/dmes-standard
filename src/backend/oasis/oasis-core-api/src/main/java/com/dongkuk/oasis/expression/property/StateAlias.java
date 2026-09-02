package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.exceptions.UnexpectedPropertyCharException;

import static com.dongkuk.oasis.expression.property.CharType.*;

/**
 * @author Jeongjin Kim
 * @since 2021-07-06
 */
class StateAlias extends BaseState {
    @Override
    public StateTransitionResult next(Class<? extends PropertyState> before,
                                      CharSupplier charSupplier,
                                      Character pairChar) {
        StringBuilder consumedChars = new StringBuilder();

        char c = charSupplier.next();
        while (charType(c) == LITERAL || charType(c) == NUMBER) {
            consumedChars.append(c);
            c = charSupplier.next();
        }

        if (charType(c) == ESCAPE) {
            return new StateTransitionResult(
                    StateEscape.class,
                    consumedChars.toString()
            );
        } else if (charType(c) == EOL) {
            return new StateTransitionResult(
                    StateExpressionPhaseEnd.class,
                    consumedChars.toString(),
                    PropertyStateEvent.ALIAS_END,
                    PropertyStateEvent.EXPRESSION_END,
                    PropertyStateEvent.EXPRESSION_PHASE_END
            );
        } else if (charType(c) == SPACE) {
            return new StateTransitionResult(
                    StateEndSpace.class,
                    consumedChars.toString(),
                    PropertyStateEvent.ALIAS_END
            );
        } else if (charType(c) == EXPRESSION_SPLITTER) {
            return new StateTransitionResult(
                    StateExpressionStart.class,
                    consumedChars.toString(),
                    PropertyStateEvent.ALIAS_END,
                    PropertyStateEvent.EXPRESSION_END,
                    PropertyStateEvent.EXPRESSION_START
            );
        } else
            throw new UnexpectedPropertyCharException(charPresentingName(c), "SPACE, LITERAL, EOL, ,, \\");
    }
}
