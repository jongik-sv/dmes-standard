package com.dongkuk.analogexpress.filter.file;

import java.io.File;
import java.io.FileFilter;

public class CaseInsensitiveFileNameRangeFilter implements FileFilter {
    private final String fromFileName;
    private final String toFileName;

    public CaseInsensitiveFileNameRangeFilter(String fromFileName, String toFileName) {
        this.fromFileName = fromFileName.toLowerCase();
        this.toFileName = toFileName.toLowerCase();
    }

    @Override
    public boolean accept(File file) {
        if (file.isDirectory())
            return false;
        return file.getName().toLowerCase().compareTo(fromFileName) >= 0
                && file.getName().toLowerCase().compareTo(toFileName + "힣") <= 0;
    }
}
