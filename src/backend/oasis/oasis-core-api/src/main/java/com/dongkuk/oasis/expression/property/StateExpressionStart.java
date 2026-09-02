package com.dongkuk.oasis.expression.property;

/**
 * @author Jeongjin Kim
 * @since 2021-07-05
 */
final class StateExpressionStart extends BaseState {
    @Override
    public StateTransitionResult next(Class<? extends PropertyState> before,
                                      CharSupplier charSupplier,
                                      Character pairChar) {
        return new StateTransitionResult(
                StateExpressionStartSpaceRemove.class);
    }
}
