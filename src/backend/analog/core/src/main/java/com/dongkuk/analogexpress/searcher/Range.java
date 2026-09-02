package com.dongkuk.analogexpress.searcher;

public class Range {
    private final long startIndex;
    private final long limitLength;

    public Range(long startIndex, long limitLength) {
        this.startIndex = startIndex;
        this.limitLength = limitLength;
    }

    public long getLimitLength() {
        return limitLength;
    }

    public long getStartIndex() {
        return startIndex;
    }
}