package ru.govorilka.app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * The JS ↔ Android bridge. JavaScript calls `GovorilkaNative.call(id, method, argsJson)`;
 * the answer comes back as `window.__govorilka.done(id, ok, json)`. Everything runs on the main thread.
 */
class NativeBridge(private val activity: MainActivity, private val web: WebView) {
    private val main = Handler(Looper.getMainLooper())
    private val prefs = activity.getSharedPreferences("speech", Context.MODE_PRIVATE)
    val speaker = Speaker(activity)
    val listener = Listener(activity) { level -> event("level", JSONObject().put("level", level.toDouble())) }
    private val recorder = Recorder(activity)
    private var permissionCall: Int? = null

    @JavascriptInterface
    fun call(id: Int, method: String, args: String) {
        main.post {
            try {
                dispatch(id, method, JSONObject(args.ifBlank { "{}" }))
            } catch (e: Exception) {
                fail(id, e.message ?: e.javaClass.simpleName)
            }
        }
    }

    private fun dispatch(id: Int, method: String, a: JSONObject) {
        when (method) {
            "speak" -> speaker.speak(a.getString("text")) { ok, err -> if (ok) done(id) else fail(id, err ?: "") }
            "stop" -> {
                speaker.stop()
                listener.cancel()
                recorder.stopPlayback()
                done(id)
            }
            "listen" -> {
                if (permission() != "granted") return fail(id, "Нет разрешения на микрофон.")
                listener.listen({ done(id, JSONArray(it)) }, { fail(id, it) })
            }
            "voices" -> speaker.voices { done(id, it) }
            "setVoice" -> speaker.setVoice(a.optString("id")).also { done(id) }
            "setRate" -> {
                speaker.rate = a.getDouble("rate").toFloat()
                done(id)
            }
            "permission" -> done(id, JSONObject.quote(permission()))
            "requestPermission" -> when (val p = permission()) {
                "denied" -> {
                    permissionCall = id
                    prefs.edit().putBoolean("askedMic", true).apply()
                    activity.requestMic()
                }
                else -> done(id, JSONObject.quote(p))
            }
            "openSettings" -> {
                activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", activity.packageName, null)))
                done(id)
            }
            "recordings" -> done(id, JSONArray(recorder.list()))
            "record" -> {
                if (permission() != "granted") return fail(id, "Нет разрешения на микрофон.")
                speaker.stop()
                recorder.start(a.getString("id"))
                done(id)
            }
            "stopRecord" -> done(id, JSONObject().put("id", recorder.stopRecording() ?: JSONObject.NULL))
            "play" -> {
                speaker.stop()
                recorder.play(a.getString("id")) { done(id) }
            }
            "deleteRecording" -> {
                recorder.delete(a.getString("id"))
                done(id)
            }
            else -> fail(id, "unknown method $method")
        }
    }

    /** granted · denied (can ask) · blocked (asked before and refused for good: only Settings helps). */
    fun permission(): String {
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) return "granted"
        val asked = prefs.getBoolean("askedMic", false)
        return if (asked && !activity.shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO)) "blocked" else "denied"
    }

    fun onPermissionResult() {
        val id = permissionCall ?: return
        permissionCall = null
        done(id, JSONObject.quote(permission()))
    }

    /** Safe-area insets as CSS variables. May run before the page exists: then onPageFinished applies them again. */
    fun setInsets(topCssPx: Int, bottomCssPx: Int): Unit = js(
        "(function(){var r=document.documentElement;if(!r)return;" +
            "r.style.setProperty('--inset-top','${topCssPx}px');r.style.setProperty('--inset-bottom','${bottomCssPx}px')})()",
    )

    fun release() {
        listener.cancel()
        recorder.release()
        speaker.shutdown()
    }

    /** Pausing the app (screen off, home button): stop talking and listening. */
    fun pause() {
        speaker.stop()
        listener.cancel()
        recorder.stopRecording()
        recorder.stopPlayback()
    }

    private fun done(id: Int, json: Any? = null): Unit = js("window.__govorilka&&__govorilka.done($id,true,${quote(json)})")
    private fun fail(id: Int, message: String): Unit = js("window.__govorilka&&__govorilka.done($id,false,${quote(JSONObject().put("message", message))})")
    private fun event(name: String, json: JSONObject): Unit = js("window.__govorilka&&__govorilka.event(${JSONObject.quote(name)},${quote(json)})")
    private fun quote(json: Any?) = if (json == null) "null" else JSONObject.quote(json.toString())
    private fun js(code: String) {
        main.post { web.evaluateJavascript(code, null) }
    }
}
