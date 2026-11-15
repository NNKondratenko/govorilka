plugins {
    // AGP 9 compiles Kotlin itself.
    alias(libs.plugins.android.application)
}

android {
    namespace = "ru.govorilka.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "ru.govorilka.app"
        // Android 8+ (adaptive icon, MediaRecorder AAC). On-device recognition is used from Android 12 when installed.
        minSdk = 26
        targetSdk = 36
        versionCode = (findProperty("versionCode") as String?)?.toIntOrNull() ?: 1
        versionName = "1.0.0"
    }

    signingConfigs {
        // The app is installed from a file, not from Google Play. One committed key keeps every new APK
        // installable over the previous one (same signature) without losing the child's progress.
        create("sideload") {
            storeFile = rootProject.file("signing/govorilka.p12")
            storeType = "PKCS12"
            storePassword = "govorilka"
            keyAlias = "govorilka"
            keyPassword = "govorilka"
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("sideload")
        }
    }

    // The web app (../web) is the single source of the UI: packed as assets, served by WebViewAssetLoader.
    sourceSets {
        getByName("main") {
            assets.srcDir("../web")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity)
    implementation(libs.androidx.webkit)
    testImplementation(libs.junit)
}
