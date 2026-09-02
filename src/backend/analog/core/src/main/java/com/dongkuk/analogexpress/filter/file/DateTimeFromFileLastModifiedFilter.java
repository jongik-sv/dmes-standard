package com.dongkuk.analogexpress.filter.file;

import java.time.LocalDateTime;

public class DateTimeFromFileLastModifiedFilter extends FileLastModifiedFilter {
    public DateTimeFromFileLastModifiedFilter(LocalDateTime fromFileLastModified) {
        super(fromFileLastModified, LocalDateTime.now());
    }
}
