package com.dongkuk.analogexpress.filter.file;

import java.io.File;
import java.io.FileFilter;

public class FileNameFromFilter implements FileFilter {
    private final String fromFileName;

    public FileNameFromFilter(String fromFileName) {
        this.fromFileName = fromFileName;
    }

    @Override
    public boolean accept(File file) {
        if (file.isDirectory())
            return false;
        return file.getName().compareTo(fromFileName) >= 0;
    }
}
