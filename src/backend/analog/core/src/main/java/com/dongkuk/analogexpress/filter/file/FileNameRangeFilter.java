package com.dongkuk.analogexpress.filter.file;

import java.io.File;
import java.io.FileFilter;

public class FileNameRangeFilter implements FileFilter {
    private final String fromFileName;
    private final String toFileName;

    public FileNameRangeFilter(String fromFileName, String toFileName) {
        this.fromFileName = fromFileName;
        this.toFileName = toFileName;
    }

    @Override
    public boolean accept(File file) {
        if (file.isDirectory())
            return false;
        return file.getName().compareTo(fromFileName) >= 0 && file.getName().compareTo(toFileName + "힣") <= 0;
    }
}
