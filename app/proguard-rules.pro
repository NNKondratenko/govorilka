# Methods called from JavaScript through addJavascriptInterface must keep their names.
-keepclassmembers class ru.govorilka.app.NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
