plugins {
    id("com.android.application")
}

android {
    namespace = "com.wff_web.test.fixture"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.wff_web.test.fixture"
        minSdk = 33
        targetSdk = 33
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
    }
}
