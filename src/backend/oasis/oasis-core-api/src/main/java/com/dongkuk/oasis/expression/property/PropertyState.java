package com.dongkuk.oasis.expression.property;

interface PropertyState {
    StateTransitionResult next(Class<? extends PropertyState> before, CharSupplier charSupplier, Character pairChar);
}
