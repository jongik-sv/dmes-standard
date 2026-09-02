package com.dongkuk.analogexpress.searcher;

@FunctionalInterface
public interface ContextualNewLineInspector {
    boolean isNewLine(String line);
}
