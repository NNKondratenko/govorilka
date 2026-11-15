package ru.govorilka.app

/**
 * SpeechRecognizer error codes → what the training loop should do. Pure, so it is unit-tested on the JVM.
 * Codes are the constants of android.speech.SpeechRecognizer (stable since API 8 / 31 / 33).
 */
object RecognitionErrors {
    enum class Kind {
        /** The child said nothing or nothing was understood: not an error, the loop asks to repeat. */
        NOTHING,

        /** The on-device recognizer can't do Russian here: try the regular recognizer once. */
        TRY_REGULAR,

        /** Show a message to the adult and stop the loop. */
        FATAL,
    }

    fun kind(code: Int): Kind = when (code) {
        6, 7 -> Kind.NOTHING // SPEECH_TIMEOUT, NO_MATCH
        5, 8 -> Kind.NOTHING // CLIENT (after cancel), RECOGNIZER_BUSY
        12, 13, 14, 15 -> Kind.TRY_REGULAR // LANGUAGE_NOT_SUPPORTED / UNAVAILABLE, CANNOT_CHECK_SUPPORT, download events
        else -> Kind.FATAL
    }

    fun message(code: Int): String = when (code) {
        1, 2, 4, 11 -> "Нет интернета, а офлайн-распознавание русского не установлено. " +
            "Подключитесь к сети или скачайте русский язык: Настройки → Google → Голосовой ввод → Офлайн-распознавание."
        3 -> "Микрофон занят другим приложением или не работает."
        9 -> "Нет разрешения на микрофон."
        10 -> "Слишком много запросов к распознаванию. Подождите минуту."
        12, 13 -> "Русский язык для распознавания не установлен. Откройте приложение Google → Настройки → Голосовой ввод → " +
            "Офлайн-распознавание речи и скачайте русский."
        else -> "Распознавание речи не сработало (код $code)."
    }
}
