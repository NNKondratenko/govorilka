package ru.govorilka.app

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/**
 * Native speech recognition (the Web Speech API is not available inside WebView).
 * Android 12+: the on-device recognizer first (no internet, no data sent); if it can't do Russian,
 * the regular recognizer with «prefer offline». Returns up to 5 alternatives; the web side picks the best.
 */
class Listener(private val context: Context, private val onLevel: (Float) -> Unit) {
    private var recognizer: SpeechRecognizer? = null
    private var pending: ((List<String>) -> Unit)? = null
    private var onDevice = Build.VERSION.SDK_INT >= 31

    fun available(): Boolean =
        SpeechRecognizer.isRecognitionAvailable(context) ||
            (Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(context))

    fun listen(onResult: (List<String>) -> Unit, onError: (String) -> Unit) {
        cancel()
        if (!available()) return onError("На телефоне нет службы распознавания речи. Установите приложение Google и разрешите ему микрофон.")

        val useOnDevice = onDevice && Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
        val r = if (useOnDevice) SpeechRecognizer.createOnDeviceSpeechRecognizer(context) else SpeechRecognizer.createSpeechRecognizer(context)
        recognizer = r
        pending = onResult

        fun finish(result: List<String>) {
            val cb = pending ?: return
            pending = null
            release()
            cb(result)
        }

        r.setRecognitionListener(object : RecognitionListener {
            override fun onRmsChanged(rmsdB: Float) = onLevel(rmsdB)
            override fun onResults(results: Bundle?) =
                finish(results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty())

            override fun onError(error: Int) {
                when (RecognitionErrors.kind(error)) {
                    RecognitionErrors.Kind.NOTHING -> finish(emptyList())
                    RecognitionErrors.Kind.TRY_REGULAR ->
                        if (useOnDevice) {
                            // Remember: this phone's on-device recognizer has no Russian. Use the regular one from now on.
                            onDevice = false
                            pending = null
                            release()
                            listen(onResult, onError)
                        } else {
                            pending = null
                            release()
                            onError(RecognitionErrors.message(error))
                        }
                    RecognitionErrors.Kind.FATAL -> {
                        pending = null
                        release()
                        onError(RecognitionErrors.message(error))
                    }
                }
            }

            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onPartialResults(partialResults: Bundle?) {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU")
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            // Children pause between words: wait a little longer before deciding the phrase is over.
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1200L)
        }
        r.startListening(intent)
    }

    /** Stops listening; a pending listen() resolves with «nothing heard». */
    fun cancel() {
        val cb = pending
        pending = null
        recognizer?.cancel()
        release()
        cb?.invoke(emptyList())
    }

    private fun release() {
        recognizer?.destroy()
        recognizer = null
    }
}
