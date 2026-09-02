package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.exceptions.UnmarshalException;
import com.dongkuk.oasis.unmarshal.ServiceElementFromPlainString;
import org.jdom2.Document;
import org.jdom2.Element;
import org.jdom2.JDOMException;
import org.jdom2.input.SAXBuilder;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.Charset;

/**
 * @author Jeongjin Kim
 * @since 2021-02-09
 */
final class CamundaServiceElementFromPlainString implements ServiceElementFromPlainString<Element> {
    private final Charset charset;

    /**
     * @param charset 문서 문자열 문자셋
     */
    public CamundaServiceElementFromPlainString(Charset charset) {
        this.charset = charset;
    }

    @Override
    public Element serviceElement(String documentString) {
        if (documentString == null)
            throw new IllegalArgumentException();

        Document doc;
        SAXBuilder builder = new SAXBuilder();
        builder.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        builder.setFeature("http://xml.org/sax/features/external-general-entities", false);
        builder.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        try {
            doc = builder.build(new ByteArrayInputStream(documentString.getBytes(charset)));
        } catch (JDOMException | IOException e) {
            throw new UnmarshalException(e);
        }
        return doc.getRootElement();
    }
}
