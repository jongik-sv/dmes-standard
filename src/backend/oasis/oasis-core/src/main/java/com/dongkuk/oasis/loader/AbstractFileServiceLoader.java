package com.dongkuk.oasis.loader;

import com.dongkuk.oasis.exceptions.ServiceLoadException;
import org.springframework.core.io.Resource;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URLDecoder;
import java.util.Arrays;
import java.util.List;

import static java.util.stream.Collectors.toList;

/**
 * 파일에서 서비스 문서를 가져오기 위한 추상 클래스.
 * <p>
 * 서비스 파일 위치, 서비스 파일 확장자, 서비스 파일 설명 구분자를 반드시 설정해야한다.
 * <p>
 * 파일명이 서비스 ID로 간주한다.
 * <p>
 * 단, 서비스 파일 설명 구분자 앞에 있는 문자열만 ID로 취급한다.
 * <p>
 * 파일 설명 구분자에 마침표(.)는 사용할 수 없다.
 * <p>
 * 기본 인코딩은 'UTF-8' 이다.
 *
 * @author Jeongjin Kim
 * @since 2021-02-01
 */
public abstract class AbstractFileServiceLoader implements ServiceDocumentLoader {
    protected final String serviceDocumentDirectory;

    protected final String fileExtension;

    protected final String fileDescriptionDelimiter;

    protected String encoding = "utf-8";

    protected AbstractFileServiceLoader(String serviceDocumentDirectory,
                                        String fileExtension,
                                        String fileDescriptionDelimiter) {

        if (serviceDocumentDirectory == null ||
                fileExtension == null ||
                fileDescriptionDelimiter == null) {
            throw new IllegalArgumentException("serviceDocumentDirectory or fileExtension is not set");
        }

        if (!serviceDocumentDirectory.endsWith("/") && !serviceDocumentDirectory.endsWith("\\")) {
            this.serviceDocumentDirectory = serviceDocumentDirectory + "/";
        } else {
            this.serviceDocumentDirectory = serviceDocumentDirectory;
        }
        this.fileExtension = fileExtension;
        if (fileDescriptionDelimiter.equals("."))
            throw new IllegalArgumentException("period(.) cannot be used as a file description separator.");

        this.fileDescriptionDelimiter = fileDescriptionDelimiter;
    }

    /**
     * @param encoding 인코딩
     */
    public void changeEncoding(String encoding) {
        this.encoding = encoding;
    }

    @Override
    public String serviceDocument(String serviceId) {
        StringBuilder stringBuilder = new StringBuilder();
        String line;
        String serviceDocumentAsString;

        try (BufferedReader bufferedReader = new BufferedReader(
                new InputStreamReader(getServiceDocumentAsStream(serviceId), encoding))) {
            while ((line = bufferedReader.readLine()) != null) {
                stringBuilder.append(line).append(System.lineSeparator());
            }
        } catch (IOException e) {
            throw new ServiceLoadException(e);
        }

        serviceDocumentAsString = stringBuilder.toString();

        return serviceDocumentAsString;
    }

    boolean isMatchedServiceName(String serviceFileName, String nameToCheck) {
        if (nameToCheck.lastIndexOf(this.fileDescriptionDelimiter) != -1) {
            String foreName = nameToCheck.substring(0, nameToCheck.lastIndexOf(this.fileDescriptionDelimiter));
            String backName = nameToCheck.substring(nameToCheck.lastIndexOf("."));

            return (foreName + backName).equals(serviceFileName + "." + this.fileExtension);
        } else {
            return nameToCheck.equals(serviceFileName + "." + this.fileExtension);
        }
    }

    protected List<String> findMatchedServiceFiles(String serviceId, Resource[] resources) {
        return Arrays.stream(resources)
                .filter(resource -> isMatchedServiceName(serviceId, resource.getFilename()))
                .map(resource -> {
                    try {
                        String path = resource.getURL().getPath();
                        String pathDecoded = URLDecoder.decode(path, "utf8");
                        return pathDecoded.substring(pathDecoded.indexOf(serviceDocumentDirectory));
                    } catch (IOException e) {
                        throw new ServiceLoadException("Failed to retrieve the path of the resource.", e);
                    }
                })
                .collect(toList());
    }

    protected abstract InputStream getServiceDocumentAsStream(String serviceId);
}
