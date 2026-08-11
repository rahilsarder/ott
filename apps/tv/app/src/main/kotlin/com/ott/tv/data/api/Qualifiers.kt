package com.ott.tv.data.api

import javax.inject.Qualifier

/** The auth-free OkHttpClient used only inside TokenAuthenticator, to avoid recursing through itself. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class PlainHttpClient
