package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.exceptions.UnmarshalException;
import com.dongkuk.oasis.unmarshal.ServiceElementFromPath;
import org.jdom2.Document;
import org.jdom2.Element;
import org.jdom2.JDOMException;
import org.jdom2.input.SAXBuilder;

import java.io.IOException;
import java.io.InputStream;

/**
 * ClassPath 에 있는 경로의 문서를 읽어 {@link Element} 로 반환.
 *
 * @author Jeongjin Kim
 * @since 2021-02-04
 */
final class CamundaClassPathJdom2ServiceElementFromPath implements ServiceElementFromPath<Element> {
    @Override
    public Element serviceElement(String path) {
        Document doc;
        SAXBuilder builder = new SAXBuilder();
        builder.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        builder.setFeature("http://xml.org/sax/features/external-general-entities", false);
        builder.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        try (InputStream inputStream = getClass().getResourceAsStream(path)) {
            doc = builder.build(inputStream);
        } catch (IOException | JDOMException e) {
            throw new UnmarshalException(e);
        }

        return doc.getRootElement();
    }
}
