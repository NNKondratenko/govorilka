package ru.govorilka.app

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.UUID

/**
 * Android TextToSpeech with a Russian voice. Stress marks arrive as U+0301 after the vowel; Google's
 * engine uses them, so «з+амок» / «зам+ок» are read correctly. Offline voices are preferred.
 */
class Speaker(context: Context) : UtteranceProgressListener() {
    private val main = Handler(Looper.getMainLooper())
    private val prefs = context.getSharedPreferences("speech", Context.MODE_PRIVATE)
    private val callbacks = HashMap<String, (Boolean, String?) -> Unit>()
    private val waiting = ArrayList<() -> Unit>()
    private var ready = false
    private var problem: String? = null

    var rate: Float = prefs.getFloat("rate", 0.85f)
        set(value) {
            field = value.coerceIn(0.5f, 1.5f)
            prefs.edit().putFloat("rate", field).apply()
        }

    private val tts: TextToSpeech = TextToSpeech(context.applicationContext) { status ->
        main.post {
            if (status == TextToSpeech.SUCCESS) configure() else problem = "Синтез речи недоступен на этом телефоне."
            ready = true
            waiting.forEach { it() }
            waiting.clear()
        }
    }

    private fun whenReady(block: () -> Unit) = if (ready) block() else waiting.add(block)

    private fun configure() {
        val res = tts.setLanguage(Locale("ru", "RU"))
        if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
            problem = "Нет русского голоса. Установите «Синтезатор речи Google» и в его настройках скачайте русский язык."
            return
        }
        tts.setOnUtteranceProgressListener(this)
        val saved = prefs.getString("voice", null)
        val voice = russianVoices().firstOrNull { it.name == saved } ?: bestVoice()
        voice?.let { tts.voice = it }
    }

    private fun russianVoices(): List<Voice> =
        runCatching { tts.voices.orEmpty() }.getOrDefault(emptySet())
            .filter { it.locale.language == "ru" && !it.features.orEmpty().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) }
            .sortedWith(compareBy<Voice>({ it.isNetworkConnectionRequired }, { -it.quality }, { it.name }))

    /** Offline first, then by quality. */
    private fun bestVoice(): Voice? = russianVoices().firstOrNull()

    fun speak(text: String, done: (Boolean, String?) -> Unit) = whenReady {
        problem?.let { return@whenReady done(false, it) }
        tts.setSpeechRate(rate)
        tts.setPitch(1.05f)
        val id = UUID.randomUUID().toString()
        callbacks[id] = done
        if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, Bundle(), id) == TextToSpeech.ERROR) {
            callbacks.remove(id)
            done(false, "Не удалось произнести фразу.")
        }
    }

    fun voices(done: (JSONArray) -> Unit) = whenReady {
        val arr = JSONArray()
        russianVoices().forEachIndexed { i, v ->
            arr.put(
                JSONObject()
                    .put("id", v.name)
                    .put("name", "Голос ${i + 1}" + if (v.isNetworkConnectionRequired) "" else " · без интернета")
                    .put("local", !v.isNetworkConnectionRequired),
            )
        }
        done(arr)
    }

    fun setVoice(name: String) = whenReady {
        russianVoices().firstOrNull { it.name == name }?.let {
            tts.voice = it
            prefs.edit().putString("voice", name).apply()
        }
    }

    fun stop() {
        if (ready) tts.stop()
        finishAll(true)
    }

    fun shutdown() {
        stop()
        tts.shutdown()
    }

    private fun finish(id: String?, ok: Boolean, error: String? = null) = main.post {
        id?.let { callbacks.remove(it)?.invoke(ok, error) }
    }

    private fun finishAll(ok: Boolean) {
        val all = callbacks.values.toList()
        callbacks.clear()
        all.forEach { it(ok, null) }
    }

    override fun onStart(utteranceId: String?) {}
    override fun onDone(utteranceId: String?) = finish(utteranceId, true).let {}
    override fun onStop(utteranceId: String?, interrupted: Boolean) = finish(utteranceId, true).let {}

    @Deprecated("Deprecated in Java")
    override fun onError(utteranceId: String?) = finish(utteranceId, false, "Ошибка синтеза речи.").let {}
    override fun onError(utteranceId: String?, errorCode: Int) = finish(utteranceId, false, "Ошибка синтеза речи ($errorCode).").let {}
}
