package com.ott.tv.data.model

import kotlinx.serialization.Serializable

@Serializable
data class Profile(
    val id: String,
    val name: String,
    val avatarKey: String,
    val isKids: Boolean,
    val createdAt: String,
)
