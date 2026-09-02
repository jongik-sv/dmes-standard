package com.dongkuk.analogexpress.filter.file;

import java.io.File;
import java.io.FileFilter;
import java.sql.Timestamp;
import java.time.LocalDateTime;

public class FileLastModifiedFilter implements FileFilter {
    private final LocalDateTime fromFileLastModified;
    private final LocalDateTime toFileLastModified;

    public FileLastModifiedFilter(LocalDateTime fromFileLastModified, LocalDateTime toFileLastModified) {
        this.fromFileLastModified = fromFileLastModified;
        this.toFileLastModified = toFileLastModified;
    }

    @Override
    public boolean accept(File file) {
        if (file.isDirectory())
            return false;
        return file.lastModified() >= Timestamp.valueOf(fromFileLastModified).getTime()
                && file.lastModified() <= Timestamp.valueOf(toFileLastModified).getTime();
    }
}
