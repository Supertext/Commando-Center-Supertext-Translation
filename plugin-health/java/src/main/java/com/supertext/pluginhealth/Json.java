package com.supertext.pluginhealth;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Minimal JSON reader and writer (a copy of the Supertext SDK's), so Plugin Health has no runtime
 * dependencies. It reads the stored {@link ReporterState} and writes reports: any valid JSON into
 * {@link Map} (insertion-ordered), {@link List}, {@link String}, {@link Double}, {@link Boolean} or {@code null},
 * and writes those types (plus other {@link Number}s) back as compact JSON.
 */
final class Json {

    private final String s;
    private int i;

    private Json(String s) {
        this.s = s;
    }

    /** Parses a JSON text; throws {@link IllegalArgumentException} when it isn't valid JSON. */
    static Object parse(String text) {
        Json p = new Json(text);
        p.skip();
        Object value = p.value();
        p.skip();
        if (p.i != text.length()) {
            throw p.fail("trailing characters");
        }
        return value;
    }

    /** The string field {@code name} of a JSON object text, or {@code null} (not JSON, not an object, missing or not a string). */
    static String stringField(String text, String name) {
        if (text == null) {
            return null;
        }
        try {
            Object value = parse(text);
            if (value instanceof Map) {
                Object field = ((Map<?, ?>) value).get(name);
                return field instanceof String ? (String) field : null;
            }
        } catch (IllegalArgumentException e) {
            // Not JSON: no field.
        }
        return null;
    }

    /** Compact JSON for maps (string keys), lists, strings, numbers, booleans and {@code null}. */
    static String write(Object value) {
        StringBuilder out = new StringBuilder();
        write(out, value);
        return out.toString();
    }

    private static void write(StringBuilder out, Object value) {
        if (value == null) {
            out.append("null");
        } else if (value instanceof String) {
            quote(out, (String) value);
        } else if (value instanceof Boolean) {
            out.append(value.toString());
        } else if (value instanceof Double || value instanceof Float) {
            double d = ((Number) value).doubleValue();
            if (Double.isNaN(d) || Double.isInfinite(d)) {
                out.append("null");
            } else if (d == Math.rint(d) && Math.abs(d) < 1e15) {
                out.append((long) d);
            } else {
                out.append(d);
            }
        } else if (value instanceof Number) {
            out.append(value.toString());
        } else if (value instanceof Map) {
            out.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> entry : ((Map<?, ?>) value).entrySet()) {
                if (!first) {
                    out.append(',');
                }
                first = false;
                quote(out, String.valueOf(entry.getKey()));
                out.append(':');
                write(out, entry.getValue());
            }
            out.append('}');
        } else if (value instanceof List) {
            out.append('[');
            boolean first = true;
            for (Object item : (List<?>) value) {
                if (!first) {
                    out.append(',');
                }
                first = false;
                write(out, item);
            }
            out.append(']');
        } else {
            throw new IllegalArgumentException("Cannot write " + value.getClass().getName() + " as JSON");
        }
    }

    private static void quote(StringBuilder out, String text) {
        out.append('"');
        for (int k = 0; k < text.length(); k++) {
            char c = text.charAt(k);
            switch (c) {
                case '"': out.append("\\\""); break;
                case '\\': out.append("\\\\"); break;
                case '\n': out.append("\\n"); break;
                case '\r': out.append("\\r"); break;
                case '\t': out.append("\\t"); break;
                case '\b': out.append("\\b"); break;
                case '\f': out.append("\\f"); break;
                default:
                    if (c < 0x20 || c == 0x2028 || c == 0x2029) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
            }
        }
        out.append('"');
    }

    private Object value() {
        if (i >= s.length()) {
            throw fail("unexpected end");
        }
        char c = s.charAt(i);
        switch (c) {
            case '{': return object();
            case '[': return array();
            case '"': return string();
            case 't': return literal("true", Boolean.TRUE);
            case 'f': return literal("false", Boolean.FALSE);
            case 'n': return literal("null", null);
            default:
                if (c == '-' || (c >= '0' && c <= '9')) {
                    return number();
                }
                throw fail("unexpected character");
        }
    }

    private Map<String, Object> object() {
        Map<String, Object> map = new LinkedHashMap<>();
        i++;
        skip();
        if (peek() == '}') {
            i++;
            return map;
        }
        while (true) {
            skip();
            if (peek() != '"') {
                throw fail("expected a key");
            }
            String key = string();
            skip();
            expect(':');
            skip();
            map.put(key, value());
            skip();
            if (peek() == ',') {
                i++;
            } else {
                expect('}');
                return map;
            }
        }
    }

    private List<Object> array() {
        List<Object> list = new ArrayList<>();
        i++;
        skip();
        if (peek() == ']') {
            i++;
            return list;
        }
        while (true) {
            skip();
            list.add(value());
            skip();
            if (peek() == ',') {
                i++;
            } else {
                expect(']');
                return list;
            }
        }
    }

    private String string() {
        i++; // opening quote
        StringBuilder out = new StringBuilder();
        while (true) {
            if (i >= s.length()) {
                throw fail("unterminated string");
            }
            char c = s.charAt(i++);
            if (c == '"') {
                return out.toString();
            }
            if (c < 0x20) {
                throw fail("control character in string");
            }
            if (c != '\\') {
                out.append(c);
                continue;
            }
            if (i >= s.length()) {
                throw fail("unterminated escape");
            }
            char e = s.charAt(i++);
            switch (e) {
                case '"': out.append('"'); break;
                case '\\': out.append('\\'); break;
                case '/': out.append('/'); break;
                case 'b': out.append('\b'); break;
                case 'f': out.append('\f'); break;
                case 'n': out.append('\n'); break;
                case 'r': out.append('\r'); break;
                case 't': out.append('\t'); break;
                case 'u':
                    if (i + 4 > s.length()) {
                        throw fail("bad unicode escape");
                    }
                    try {
                        out.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                    } catch (NumberFormatException ex) {
                        throw fail("bad unicode escape");
                    }
                    i += 4;
                    break;
                default:
                    throw fail("bad escape");
            }
        }
    }

    private Double number() {
        int start = i;
        if (peek() == '-') {
            i++;
        }
        while (i < s.length() && "0123456789.eE+-".indexOf(s.charAt(i)) >= 0) {
            i++;
        }
        try {
            return Double.valueOf(s.substring(start, i));
        } catch (NumberFormatException e) {
            throw fail("bad number");
        }
    }

    private Object literal(String word, Object value) {
        if (!s.startsWith(word, i)) {
            throw fail("unexpected literal");
        }
        i += word.length();
        return value;
    }

    private char peek() {
        return i < s.length() ? s.charAt(i) : '\0';
    }

    private void expect(char c) {
        if (peek() != c) {
            throw fail("expected '" + c + "'");
        }
        i++;
    }

    private void skip() {
        while (i < s.length()) {
            char c = s.charAt(i);
            if (c != ' ' && c != '\t' && c != '\n' && c != '\r') {
                return;
            }
            i++;
        }
    }

    private IllegalArgumentException fail(String why) {
        return new IllegalArgumentException("Invalid JSON at " + i + ": " + why);
    }
}
