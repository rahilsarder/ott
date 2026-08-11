# Keep kotlinx.serialization models — their field names are the wire contract.
-keepattributes *Annotation*, InnerClasses
-keep,includedescriptorclasses class com.ott.tv.data.model.**$$serializer { *; }
-keepclassmembers class com.ott.tv.data.model.** {
    *** Companion;
}
-keepclasseswithmembers class com.ott.tv.data.model.** {
    kotlinx.serialization.KSerializer serializer(...);
}
