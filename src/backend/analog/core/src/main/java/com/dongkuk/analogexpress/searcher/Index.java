package com.dongkuk.analogexpress.searcher;

public class Index {
    private final long startIndex;
    private final long endIndex;

    public Index(long startIndex, long endIndex) {
        this.startIndex = startIndex;
        this.endIndex = endIndex;
    }

    public long getStartIndex() {
        return startIndex;
    }

    public long getEndIndex() {
        return endIndex;
    }
}