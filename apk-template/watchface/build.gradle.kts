plugins {
    id("com.android.application")
}

android {
    namespace = "com.wff_web.test.fixture"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.wff_web.test.fixture"
        minSdk = 33
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
    }
}

dependencies {
    // WFF watch face format support
    implementation("androidx.wear.watchface:watchface-data:1.2.1")
}
