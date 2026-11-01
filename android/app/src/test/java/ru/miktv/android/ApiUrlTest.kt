package ru.miktv.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ApiUrlTest {
    @Test fun hostIsNormalized() {
        assertEquals("https://tv.example.org/api/v1", ApiUrl.normalize(" https://tv.example.org/ "))
        assertEquals("https://tv.example.org/api/v1", ApiUrl.normalize("https://tv.example.org/api/v1"))
        assertEquals("http://192.0.2.9:8080/api/v1", ApiUrl.normalize("http://192.0.2.9:8080"))
    }

    @Test fun rejectsUnsafeAndMalformedUrls() {
        for (value in listOf("", "file:///etc/passwd", "ftp://example.org", "https://user:pass@example.org", "https://example.org?token=123")) {
            assertThrows(Exception::class.java) { ApiUrl.normalize(value) }
        }
    }
}
