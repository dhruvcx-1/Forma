allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// Some Flutter plugin releases still declare compileSdk 34 while their
// AndroidX dependencies require API 36. Keep all plugin library modules
// aligned with the app's compile SDK to satisfy AAR metadata checks.
subprojects {
    afterEvaluate {
        extensions.findByType<com.android.build.api.dsl.LibraryExtension>()
            ?.compileSdk = 36
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
