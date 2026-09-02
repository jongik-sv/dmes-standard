package com.dongkuk.analogexpress.searcher;

import com.dongkuk.analogexpress.filter.contents.LogContentsFilter;

import java.io.BufferedReader;
import java.io.FileInputStream;
import java.io.InputStreamReader;

public class FullScanTextSearcher extends TextSearcher {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(FullScanTextSearcher.class);
    private final String charsetName;

    public FullScanTextSearcher(SearchResult searchResult, LogContentsFilter[] logContentsFilters, ContextualNewLineInspector contextualNewLineInspector) {
        this(searchResult, logContentsFilters, contextualNewLineInspector, "utf-8");
    }

    public FullScanTextSearcher(SearchResult searchResult, LogContentsFilter[] logContentsFilters, ContextualNewLineInspector contextualNewLineInspector, String charsetName) {
        super(searchResult, logContentsFilters, contextualNewLineInspector);
        this.charsetName = charsetName;
    }

    @Override
    public void run() {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(searchResult.getFile()), charsetName))) {
            readAndFilter(reader);
        } catch (Exception e) {
            log.error(e.getMessage(), e);
        } finally {
            searchResult.setFinished(true);
        }
    }
}
