package com.dongkuk.oasis.loader;

import com.dongkuk.oasis.exceptions.ServiceLoadException;
import com.dongkuk.oasis.exceptions.ServiceNotFoundException;
import org.springframework.core.io.FileSystemResourceLoader;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.ResourcePatternUtils;

import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;

/**
 * It finds service document file from file system and return the content as {@link String}.
 * Specify 'serviceDocumentDirectory' property otherwise it throws Exception.
 * <p>Default file extension is 'bpmn'. You can set 'fileExtension' property to change it.
 *
 * @author Jeongjin Kim
 * @since 2017-04-28
 */

public class FileSystemFileServiceLoader extends AbstractFileServiceLoader {

    /**
     * @param serviceDocumentDirectory 서비스 정의 문서가 저장되어 있는 디렉토리
     * @param fileExtension            서비스 정의 문서 파일 확장자, null 이면 {@code bpmn} 을 기본값으로 설정한
     * @param fileDescriptionDelimiter 서비스 설명 구분자
     */
    public FileSystemFileServiceLoader(String serviceDocumentDirectory,
                                       String fileExtension,
                                       String fileDescriptionDelimiter) {
        super(serviceDocumentDirectory, (fileExtension == null) ? "bpmn" : fileExtension, fileDescriptionDelimiter);
    }

    @Override
    protected InputStream getServiceDocumentAsStream(String serviceId) {
        Resource[] resources;
        try {
            resources = ResourcePatternUtils
                    .getResourcePatternResolver(new FileSystemResourceLoader())
                    .getResources("file:" + serviceDocumentDirectory + "**");
        } catch (IOException e) {
            throw new ServiceLoadException("Failed to load the service directory.", e);
        }

        List<String> collect = findMatchedServiceFiles(serviceId, resources);

        if (collect.size() == 0)
            throw new ServiceNotFoundException(String.format("Cannot find the service file. [%s]", serviceId));

        if (collect.size() > 1)
            throw new ServiceNotFoundException(String.format("Duplicate service files exist. [%s]", serviceId));

        FileInputStream fileInputStream;
        try {
            fileInputStream = new FileInputStream(collect.get(0));
        } catch (FileNotFoundException e) {
            throw new ServiceNotFoundException(String.format("Cannot retrieve the file stream. [%s]", serviceId));
        }
        return fileInputStream;
    }
}
