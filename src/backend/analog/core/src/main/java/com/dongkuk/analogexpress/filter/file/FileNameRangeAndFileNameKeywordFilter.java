package com.dongkuk.analogexpress.filter.file;

import java.io.File;

public class FileNameRangeAndFileNameKeywordFilter extends FileNameRangeFilter {
    private final String keyword;

    public FileNameRangeAndFileNameKeywordFilter(String fromFileName, String toFileName, String keyword) {
        super(fromFileName, toFileName);
        this.keyword = keyword;
    }

    @Override
    public boolean accept(File file) {
        if (super.accept(file)) {
            if (keyword == null)
                return true;
            return file.getName().contains(keyword);
        } else
            return false;
    }
}
