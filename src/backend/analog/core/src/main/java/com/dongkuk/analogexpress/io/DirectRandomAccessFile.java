package com.dongkuk.analogexpress.io;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.RandomAccessFile;

public class DirectRandomAccessFile implements RandomAccessibleLineReader {
    private final RandomAccessFile raf;

    public DirectRandomAccessFile(File file, String mode) throws FileNotFoundException {
        raf = new RandomAccessFile(file, mode);
    }

    @Override
    public long length() throws IOException {
        return raf.length();
    }

    @Override
    public String readLine() throws IOException {
        return raf.readLine();
    }

    @Override
    public long getFilePointer() throws IOException {
        return raf.getFilePointer();
    }

    @Override
    public void seek(long h) throws IOException {
        raf.seek(h);
    }

    @Override
    public int read() throws IOException {
        return raf.read();
    }

    @Override
    public void close() throws IOException {
        raf.close();
    }
}
