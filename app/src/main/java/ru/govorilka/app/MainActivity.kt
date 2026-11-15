package ru.govorilka.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

/**
 * One full-screen WebView with the web app from assets. The app is served from an https origin by
 * WebViewAssetLoader (ES modules and localStorage work; file:// would block them). Speech, recognition
 * and recording go through [NativeBridge]; the microphone permission is asked once, natively.
 */
class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private lateinit var bridge: NativeBridge

    private val micPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        bridge.onPermissionResult()
    }

    fun requestMic() = micPermission.launch(Manifest.permission.RECORD_AUDIO)

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        // A child doesn't touch the screen while talking: don't let it dim mid-exercise.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this)
        setContentView(web)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false // the success fanfare plays without a tap
            allowFileAccess = false
            allowContentAccess = false
            textZoom = 100
        }
        web.webChromeClient = WebChromeClient() // confirm() dialogs
        web.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assets.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == ORIGIN_HOST) return false
                startActivity(Intent(Intent.ACTION_VIEW, request.url))
                return true
            }

            override fun onPageFinished(view: WebView, url: String) = applyInsets()
        }

        bridge = NativeBridge(this, web)
        web.addJavascriptInterface(bridge, "GovorilkaNative")

        ViewCompat.setOnApplyWindowInsetsListener(web) { _, insets ->
            lastInsets = insets
            applyInsets()
            insets
        }

        // Back: let the web app go up a level first; close only from the home screen.
        onBackPressedDispatcher.addCallback(this) {
            web.evaluateJavascript("window.__govorilka ? window.__govorilka.back() : false") { handled ->
                if (handled != "true") {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                    isEnabled = true
                }
            }
        }

        web.loadUrl(START_URL)
    }

    private var lastInsets: WindowInsetsCompat? = null

    private fun applyInsets() {
        val insets = lastInsets ?: return
        val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
        val density = resources.displayMetrics.density
        bridge.setInsets((bars.top / density).toInt(), (bars.bottom / density).toInt())
    }

    override fun onPause() {
        super.onPause()
        bridge.pause()
        web.evaluateJavascript("window.__govorilka && window.__govorilka.pause && window.__govorilka.pause()", null)
    }

    override fun onDestroy() {
        bridge.release()
        web.destroy()
        super.onDestroy()
    }

    companion object {
        private const val ORIGIN_HOST = "appassets.androidplatform.net"
        private val START_URL = Uri.parse("https://$ORIGIN_HOST/assets/index.html").toString()
    }
}
