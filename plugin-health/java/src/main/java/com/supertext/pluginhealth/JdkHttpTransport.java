package com.supertext.pluginhealth;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;

/** The default {@link Transport}: the JDK's {@link HttpClient}. */
public final class JdkHttpTransport implements Transport {

    private final HttpClient http;

    /** A transport with its own {@link HttpClient} (no redirects, connect timeout {@link Reporting#REPORT_TIMEOUT}). */
    public JdkHttpTransport() {
        this(HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NEVER)
                .connectTimeout(Reporting.REPORT_TIMEOUT)
                .build());
    }

    /** A transport on your own {@link HttpClient} (proxy, SSL context, executor, …). */
    public JdkHttpTransport(HttpClient http) {
        this.http = http;
    }

    @Override
    public int send(Request request) throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(request.getUri());
        if (request.getTimeout() != null) {
            builder.timeout(request.getTimeout());
        }
        for (Map.Entry<String, String> header : request.getHeaders().entrySet()) {
            builder.header(header.getKey(), header.getValue());
        }
        byte[] body = request.getBody();
        builder.method(request.getMethod(),
                body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofByteArray(body));
        return http.send(builder.build(), HttpResponse.BodyHandlers.discarding()).statusCode();
    }
}
