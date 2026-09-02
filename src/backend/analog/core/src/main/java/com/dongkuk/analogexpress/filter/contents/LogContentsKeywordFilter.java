package com.dongkuk.analogexpress.filter.contents;

import com.dongkuk.analogexpress.util.StringSplitter;

public class LogContentsKeywordFilter implements LogContentsFilter {
    private final String[] keywords;

    public LogContentsKeywordFilter(String keywords) {
        this.keywords = StringSplitter.splitString(keywords);
    }

    /**
     * @param logText 비교할 텍스트
     * @return keywords를 비교하여 해당키워드들이 다 있으면 true, 하나라도 없으면 false
     */
    @Override
    public boolean accept(String logText) {
        if (keywords.length == 0) return true;

        if (keywords[0].equals("")) {
            return true;
        }
        for (String keyword : keywords) {
            if (!logText.contains(keyword)) {
                return false;
            }
        }
        return true;
    }
}
