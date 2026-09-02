package com.dongkuk.oasis.expression.property;

/**
 * @author Jeongjin Kim
 * @since 2021-07-06
 */
class StateTransitionResult {
    private final Class<? extends PropertyState> state;
    private final String consumedChars;
    private final Character pairChar;
    private final PropertyStateEvent[] events;

    public StateTransitionResult(Class<? extends PropertyState> state,
                                 String consumedChars,
                                 Character pairChar,
                                 PropertyStateEvent... events) {
        this.state = state;
        this.consumedChars = consumedChars == null ? "" : consumedChars;
        this.pairChar = pairChar;
        if (events != null && events.length > 0 && events[0] != null) {
            this.events = events;
        } else
            this.events = new PropertyStateEvent[0];
    }

    public StateTransitionResult(Class<? extends PropertyState> state,
                                 String consumedChars,
                                 PropertyStateEvent... events) {
        this(state, consumedChars, null, events);
    }

    public StateTransitionResult(Class<? extends PropertyState> state,
                                 char consumedChar,
                                 PropertyStateEvent... events) {
        this(state, new String(new char[]{consumedChar}), null, events);
    }

    public StateTransitionResult(Class<? extends PropertyState> state, String consumedChars) {
        this(state, consumedChars, (PropertyStateEvent) null);
    }

    public StateTransitionResult(Class<? extends PropertyState> state, char consumedChar) {
        this(state, new String(new char[]{consumedChar}), (PropertyStateEvent) null);
    }

    public StateTransitionResult(Class<? extends PropertyState> state, PropertyStateEvent... events) {
        this(state, null, null, events);
    }

    public StateTransitionResult(Class<? extends PropertyState> state) {
        this(state, (String) null, (PropertyStateEvent) null);
    }

    public Class<? extends PropertyState> getStateClass() {
        return state;
    }

    public String getConsumedChars() {
        return consumedChars;
    }

    public PropertyStateEvent[] getEvents() {
        return events;
    }

    public Character getPairChar() {
        return pairChar;
    }
}
