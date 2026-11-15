package ru.govorilka.app

import android.content.Context
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.os.Build
import java.io.File

/**
 * «Свой голос»: a parent or speech therapist records each phrase once; the app plays the recording
 * instead of the synthesizer. Natural intonation, correct stress, works offline.
 */
class Recorder(private val context: Context) {
    private val dir = File(context.filesDir, "voice").apply { mkdirs() }
    private var recorder: MediaRecorder? = null
    private var recordingId: String? = null
    private var player: MediaPlayer? = null
    private var onPlayed: (() -> Unit)? = null

    private fun file(id: String) = File(dir, "${safe(id)}.m4a")
    private fun safe(id: String) = id.filter { it.isLetterOrDigit() || it == '_' || it == '-' }.take(40)

    fun list(): List<String> = dir.listFiles { f -> f.extension == "m4a" }.orEmpty().map { it.nameWithoutExtension }.sorted()

    fun start(id: String) {
        stopRecording()
        stopPlayback()
        val tmp = File(dir, "${safe(id)}.tmp")
        val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else @Suppress("DEPRECATION") MediaRecorder()
        r.setAudioSource(MediaRecorder.AudioSource.MIC)
        r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        r.setAudioSamplingRate(44_100)
        r.setAudioEncodingBitRate(96_000)
        r.setOutputFile(tmp.absolutePath)
        r.prepare()
        r.start()
        recorder = r
        recordingId = id
    }

    /** Returns the id that was saved, or null if nothing was recording / it was too short. */
    fun stopRecording(): String? {
        val r = recorder ?: return null
        val id = recordingId
        recorder = null
        recordingId = null
        val ok = runCatching { r.stop() }.isSuccess // stop() throws if almost nothing was recorded
        r.release()
        if (id == null) return null
        val tmp = File(dir, "${safe(id)}.tmp")
        return if (ok && tmp.length() > 0 && tmp.renameTo(file(id).also { it.delete() })) id else {
            tmp.delete()
            null
        }
    }

    fun play(id: String, done: () -> Unit) {
        stopPlayback()
        val f = file(id)
        if (!f.exists()) return done()
        val p = MediaPlayer()
        player = p
        onPlayed = done
        p.setDataSource(f.absolutePath)
        p.setOnCompletionListener { stopPlayback() }
        p.setOnErrorListener { _, _, _ -> stopPlayback(); true }
        p.prepare()
        p.start()
    }

    fun stopPlayback() {
        player?.runCatching { stop() }
        player?.release()
        player = null
        val cb = onPlayed
        onPlayed = null
        cb?.invoke()
    }

    fun delete(id: String) = file(id).delete()

    fun release() {
        stopRecording()
        stopPlayback()
    }
}
