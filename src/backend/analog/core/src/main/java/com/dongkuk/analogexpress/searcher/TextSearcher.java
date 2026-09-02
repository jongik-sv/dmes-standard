package com.dongkuk.analogexpress.searcher;

import com.dongkuk.analogexpress.filter.contents.LogContentsFilter;

import java.io.BufferedReader;
import java.io.IOException;

public abstract class TextSearcher implements Searcher {
    protected final SearchResult searchResult;
    protected final LogContentsFilter[] logContentsFilters;
    protected final ContextualNewLineInspector contextualNewLineInspector;

    protected TextSearcher(SearchResult searchResult, LogContentsFilter[] logContentsFilters, ContextualNewLineInspector contextualNewLineInspector) {
        this.searchResult = searchResult;
        this.logContentsFilters = logContentsFilters;
        this.contextualNewLineInspector = contextualNewLineInspector;
    }

    protected void readAndFilter(BufferedReader reader) throws IOException {
        StringBuilder multiLine = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            if (contextualNewLineInspector.isNewLine(line)) {
                if (runFilters(multiLine.toString())) {
                    searchResult.addResultLine(multiLine.toString());
                }
                multiLine.setLength(0);
            }
            multiLine.append((multiLine.length() == 0) ? "" : System.lineSeparator()).append(line);
        }
        if (runFilters(multiLine.toString())) {
            searchResult.addResultLine(multiLine.toString());
        }
    }

    private boolean runFilters(String logText) {
        for (LogContentsFilter logContentsFilter : logContentsFilters) {
            if (!logContentsFilter.accept(logText)) return false;
        }
        return true;
    }
}
