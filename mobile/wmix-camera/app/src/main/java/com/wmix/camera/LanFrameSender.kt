package com.wmix.camera

import android.graphics.Bitmap
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.concurrent.Executors

/** Experimental LAN JPEG sender. Not intended for production broadcasting. */
class LanFrameSender {
    private val http = OkHttpClient.Builder().build()
    private val executor = Executors.newSingleThreadExecutor()
    @Volatile private var config: Config? = null
    @Volatile private var busy = false
    private var lastSent = 0L
    data class Config(val base: String, val id: String, val token: String)
    fun configure(base: String, id: String, token: String) {
        require(base.matches(Regex("http://[a-zA-Z0-9.-]+:[0-9]{2,5}"))) { "Use http://IP:8787" }
        require(id.matches(Regex("[a-zA-Z0-9_-]{1,40}")) && token.length >= 20) { "ID ou token inválido" }
        config = Config(base.trimEnd('/'), id, token)
    }
    fun connected() = config != null
    fun disconnect() { config = null }
    fun createAnalysis(): ImageAnalysis = ImageAnalysis.Builder()
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
        .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
        .build().also { it.setAnalyzer(executor) { frame -> send(frame) } }
    private fun send(frame: ImageProxy) {
        try {
            val settings = config ?: return
            val now = android.os.SystemClock.elapsedRealtime()
            if (busy || now - lastSent < 500L) return
            lastSent = now
            val plane = frame.planes[0]
            val buffer = plane.buffer
            val bitmap = Bitmap.createBitmap(frame.width, frame.height, Bitmap.Config.ARGB_8888)
            if (plane.rowStride == frame.width * 4) bitmap.copyPixelsFromBuffer(buffer)
            else {
                val packed = ByteArray(frame.width * frame.height * 4)
                for (y in 0 until frame.height) {
                    buffer.position(y * plane.rowStride)
                    buffer.get(packed, y * frame.width * 4, frame.width * 4)
                }
                bitmap.copyPixelsFromBuffer(java.nio.ByteBuffer.wrap(packed))
            }
            val width = minOf(frame.width, 640)
            val height = (frame.height.toFloat() * width / frame.width).toInt().coerceAtLeast(1)
            val resized = Bitmap.createScaledBitmap(bitmap, width, height, true)
            val output = ByteArrayOutputStream()
            resized.compress(Bitmap.CompressFormat.JPEG, 65, output)
            if (resized !== bitmap) resized.recycle()
            bitmap.recycle()
            busy = true
            val request = Request.Builder().url("${settings.base}/api/frame?id=${settings.id}")
                .header("Authorization", "Bearer ${settings.token}")
                .post(output.toByteArray().toRequestBody("image/jpeg".toMediaType()))
                .build()
            http.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) { busy = false }
                override fun onResponse(call: Call, response: Response) {
                    response.close()
                    busy = false
                }
            })
        } catch (e: Exception) {
            android.util.Log.w("wMixCamera", "LAN upload error", e)
            busy = false
        } finally { frame.close() }
    }
    fun close() { disconnect(); http.dispatcher.cancelAll(); executor.shutdown() }
}
