package ru.govorilka.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RecognitionErrorsTest {
    @Test
    fun silenceAndNoMatchAreNotErrors() {
        assertEquals(RecognitionErrors.Kind.NOTHING, RecognitionErrors.kind(6))
        assertEquals(RecognitionErrors.Kind.NOTHING, RecognitionErrors.kind(7))
        assertEquals(RecognitionErrors.Kind.NOTHING, RecognitionErrors.kind(5))
    }

    @Test
    fun missingRussianOnDeviceFallsBackToRegularRecognizer() {
        for (code in listOf(12, 13, 14, 15)) assertEquals(RecognitionErrors.Kind.TRY_REGULAR, RecognitionErrors.kind(code))
    }

    @Test
    fun networkErrorsExplainOfflineSetup() {
        for (code in listOf(1, 2, 4, 11)) {
            assertEquals(RecognitionErrors.Kind.FATAL, RecognitionErrors.kind(code))
            assertTrue(RecognitionErrors.message(code).contains("Офлайн-распознавание"))
        }
        assertTrue(RecognitionErrors.message(9).contains("микрофон"))
        assertTrue(RecognitionErrors.message(99).contains("99"))
    }
}
