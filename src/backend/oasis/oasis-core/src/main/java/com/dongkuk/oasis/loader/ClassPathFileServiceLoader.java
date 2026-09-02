package com.dongkuk.oasis.loader;

import com.dongkuk.oasis.exceptions.ServiceLoadException;
import com.dongkuk.oasis.exceptions.ServiceNotFoundException;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.ResourcePatternUtils;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

/**
 * 클래스 패스 기준으로 서비스 파일 찾아 {@link String} 으로 반환하는 클래스.
 *
 * @author Jeongjin Kim
 * @since 2017-03-27
 */

public final class ClassPathFileServiceLoader extends AbstractFileServiceLoader {
    /**
     * @param serviceDocumentDirectory 서비스 정의 문서가 저장되어 있는 디렉토리
     * @param fileExtension            서비스 정의 문서 파일 확장자, null 이면 {@code bpmn} 을 기본값으로 설정한
     * @param fileDescriptionDelimiter 서비스 설명 구분자
     */
    public ClassPathFileServiceLoader(String serviceDocumentDirectory,
                                      String fileExtension,
                                      String fileDescriptionDelimiter) {
        super(serviceDocumentDirectory, (fileExtension == null) ? "bpmn" : fileExtension, fileDescriptionDelimiter);
    }

    @Override
    protected InputStream getServiceDocumentAsStream(String serviceId) {
        Resource[] resources;
        try {
            resources = ResourcePatternUtils
                    .getResourcePatternResolver(new DefaultResourceLoader())
                    .getResources("classpath*:" + serviceDocumentDirectory + "**");
        } catch (IOException e) {
            throw new ServiceLoadException("Failed to load the service directory.", e);
        }

        List<String> collect = findMatchedServiceFiles(serviceId, resources);

        if (collect.size() == 0)
            throw new ServiceNotFoundException(String.format("Cannot find the service file. [%s]", serviceId));

        if (collect.size() > 1)
            throw new ServiceNotFoundException(String.format("Duplicate service files exist. [%s]", serviceId));

        return getClass().getResourceAsStream(collect.get(0));

    }

}
