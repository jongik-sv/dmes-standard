package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.exceptions.UnexpectedPropertyCharException;

import static com.dongkuk.oasis.expression.property.CharType.*;

/**
 * @author Jeongjin Kim
 * @since 2021-07-05
 */
class StateValue extends BaseState {
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

        if (charType(c) == SPACE) {
            return new StateTransitionResult(
                    StateAliasSpace.class,
                    consumedChars.toString(),
                    PropertyStateEvent.VALUE_END
            );
        } else if (charType(c) == EXPRESSION_SPLITTER) {
            return new StateTransitionResult(
                    StateExpressionStart.class,
                    consumedChars.toString(),
                    PropertyStateEvent.VALUE_END,
                    PropertyStateEvent.EXPRESSION_END,
                    PropertyStateEvent.EXPRESSION_START
            );
        } else if (charType(c) == ACCESSOR_START) {
            return new StateTransitionResult(
                    StateAccessorStart.class,
                    consumedChars.toString(),
                    PropertyStateEvent.VALUE_END,
                    PropertyStateEvent.ACCESSOR_START
            );
        } else if (charType(c) == ESCAPE) {
            return new StateTransitionResult(
                    StateEscape.class,
                    consumedChars.toString()
            );
        } else if (charType(c) == EOL) {
            return new StateTransitionResult(
                    StateExpressionPhaseEnd.class,
                    consumedChars.toString(),
                    PropertyStateEvent.VALUE_END,
                    PropertyStateEvent.EXPRESSION_END,
                    PropertyStateEvent.EXPRESSION_PHASE_END
            );
        } else if (charType(c) == ALIAS_START) {
            return new StateTransitionResult(
                    StateAliasA.class,
                    consumedChars.toString(),
                    PropertyStateEvent.VALUE_END
            );
        } else
            throw new UnexpectedPropertyCharException(charPresentingName(c),
                    "LITERAL, NUMBER, SPACE, ,, [, \\, -, EOL");
    }
}
