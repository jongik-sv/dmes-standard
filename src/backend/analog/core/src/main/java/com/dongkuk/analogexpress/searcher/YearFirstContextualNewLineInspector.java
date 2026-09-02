package com.dongkuk.analogexpress.searcher;

public class YearFirstContextualNewLineInspector implements ContextualNewLineInspector {
    @Override
    public boolean isNewLine(String line) {
        return line.startsWith("20");
    }
}
