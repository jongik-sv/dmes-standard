package com.dongkuk.analogexpress.searcher;

public class StartsStringContextualNewLineInspector implements ContextualNewLineInspector {
    private final String startsString;

    public StartsStringContextualNewLineInspector(String startsString) {
        this.startsString = startsString;
    }

    @Override
    public boolean isNewLine(String line) {
        return line.startsWith(startsString);
    }
}
